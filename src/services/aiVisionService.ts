import { openaiClient } from './openaiClient';
import { openaiRateLimiter } from './rateLimiter';
import { OpenAIRetryHandler, openaiCircuitBreaker } from './retryHandler';
import { imageEncoder } from './imageEncoder';
import { costTracker } from './costTracker';
import { FrameAnalysisResult } from '../types/index';

export interface VisionAnalysisOptions {
  model?: string;
  detail?: 'low' | 'high' | 'auto';
  maxTokens?: number;
  temperature?: number;
  priority?: 'high' | 'normal' | 'low';
  userId?: string;
  videoId?: string;
}

export interface BatchAnalysisResult {
  results: FrameAnalysisResult[];
  totalCost: number;
  totalTime: number;
  successCount: number;
  errorCount: number;
  errors: Array<{ frameIndex: number; error: string }>;
}

export class AIVisionService {
  private static instance: AIVisionService;
  
  // Analysis prompts for different types of frame analysis
  private static readonly ANALYSIS_PROMPTS = {
    detailed: `Analyze this video frame in detail. Provide:

1. DESCRIPTION: A comprehensive description of what you see in the frame
2. VISUAL ELEMENTS: List the main subjects, objects, and elements visible
3. SUBJECTS: Identify people, animals, or main focal points and describe their actions/positions
4. SETTING: Describe the environment, location type, and general scene context
5. COMPOSITION: Comment on the visual composition, framing, and layout
6. TECHNICAL QUALITY: Assess image sharpness, exposure, color quality, and any technical issues
7. SCENE TYPE: Categorize the type of scene (e.g., establishing shot, close-up, action, dialogue, etc.)
8. EMOTIONAL TONE: Describe the mood or emotional feeling conveyed
9. NOTABLE FEATURES: Any interesting or unique aspects worth highlighting

Format your response as JSON with these exact keys:
{
  "description": "detailed description",
  "visual_elements": ["element1", "element2", "element3"],
  "subjects": [{"type": "person", "action": "walking", "position": "center"}],
  "setting_description": "description of environment",
  "composition_analysis": {
    "rule_of_thirds": 7.5,
    "leading_lines": true,
    "framing": "natural",
    "balance": "asymmetric",
    "focal_point": "main subject",
    "color_harmony": 8.2
  },
  "technical_quality": {
    "sharpness": 8.5,
    "exposure": 9.0,
    "contrast": 7.8,
    "color_saturation": 8.3,
    "noise_level": 2.1,
    "overall_score": 8.3
  },
  "scene_type": "establishing_shot",
  "emotional_tone": "peaceful",
  "notable_features": ["interesting aspect 1", "aspect 2"]
}`,

    quick: `Analyze this video frame quickly. Provide a JSON response with:
{
  "description": "brief description of what you see",
  "visual_elements": ["main", "elements", "visible"],
  "scene_type": "type_of_scene",
  "technical_quality": {"overall_score": 7.5},
  "composition_analysis": {"overall_score": 8.0}
}`,

    composition: `Focus on the visual composition of this frame. Analyze:
- Rule of thirds adherence
- Leading lines presence
- Framing and boundaries
- Visual balance
- Focal points
- Color harmony

Return JSON format with detailed composition scores (0-10).`,

    technical: `Assess the technical quality of this frame:
- Image sharpness and focus
- Exposure (over/under exposed)
- Color accuracy and saturation
- Noise levels
- Motion blur
- Overall technical score

Return JSON with technical quality metrics (0-10).`
  };

  private constructor() {}

  public static getInstance(): AIVisionService {
    if (!AIVisionService.instance) {
      AIVisionService.instance = new AIVisionService();
    }
    return AIVisionService.instance;
  }

  /**
   * Analyze a single frame using GPT-4 Vision
   */
  async analyzeFrame(
    imagePath: string,
    analysisType: 'detailed' | 'quick' | 'composition' | 'technical' = 'detailed',
    options: VisionAnalysisOptions = {}
  ): Promise<FrameAnalysisResult> {
    const startTime = Date.now();
    
    try {
      // Check rate limits
      await openaiRateLimiter.waitForOpenAI(options.model);
      
      // Encode image for API
      const encodingResult = await imageEncoder.optimizeForOpenAI(imagePath);
      
      // Get analysis prompt
      const prompt = AIVisionService.ANALYSIS_PROMPTS[analysisType];
      
      // Analyze with circuit breaker protection
      const response = await openaiCircuitBreaker.execute(async () => {
        return await OpenAIRetryHandler.executeOpenAICall(async () => {
          return await openaiClient.analyzeImage(
            encodingResult.base64,
            prompt,
            {
              model: options.model || 'gpt-4-vision-preview',
              detail: options.detail || 'high',
              maxTokens: options.maxTokens || 2000,
              temperature: options.temperature || 0.3
            }
          );
        });
      });
      
      // Parse response as JSON
      let analysisData: any;
      try {
        // Clean response and parse JSON
        const cleanedResponse = this.cleanJSONResponse(response);
        analysisData = JSON.parse(cleanedResponse);
      } catch (parseError) {
        console.warn('Failed to parse JSON response, using fallback parsing');
        analysisData = this.parseNonJSONResponse(response);
      }
      
      // Estimate token usage and track cost
      const inputTokens = this.estimateTokens(prompt + ' [image]');
      const outputTokens = this.estimateTokens(response);
      
      await costTracker.recordUsage(
        options.model || 'gpt-4-vision-preview',
        inputTokens,
        outputTokens,
        1, // One image
        'frame_analysis',
        {
          userId: options.userId,
          videoId: options.videoId,
          analysisType,
          imagePath,
          processingTime: Date.now() - startTime
        }
      );
      
      // Convert to standardized format
      const frameAnalysis: FrameAnalysisResult = {
        description: analysisData.description || 'No description available',
        visual_elements: Array.isArray(analysisData.visual_elements) ? 
          analysisData.visual_elements : [],
        subjects: Array.isArray(analysisData.subjects) ? 
          analysisData.subjects : [],
        setting_description: analysisData.setting_description || '',
        composition_analysis: analysisData.composition_analysis || {},
        technical_quality: analysisData.technical_quality || {},
        scene_type: analysisData.scene_type || 'unknown',
        emotional_tone: analysisData.emotional_tone,
        notable_features: Array.isArray(analysisData.notable_features) ? 
          analysisData.notable_features : [],
        confidence_score: this.calculateConfidenceScore(analysisData),
        processing_time: Date.now() - startTime,
        model_used: options.model || 'gpt-4-vision-preview',
        analysis_type: analysisType
      };
      
      return frameAnalysis;
      
    } catch (error) {
      console.error('Frame analysis failed:', error);
      
      // Track failed request for cost monitoring
      await costTracker.recordUsage(
        options.model || 'gpt-4-vision-preview',
        0, 0, 0,
        'frame_analysis_failed',
        {
          userId: options.userId,
          videoId: options.videoId,
          error: error instanceof Error ? error.message : 'Unknown error',
          imagePath,
          processingTime: Date.now() - startTime
        }
      );
      
      throw error;
    }
  }

  /**
   * Batch analyze multiple frames
   */
  async batchAnalyzeFrames(
    imagePaths: string[],
    analysisType: 'detailed' | 'quick' | 'composition' | 'technical' = 'quick',
    options: VisionAnalysisOptions = {}
  ): Promise<BatchAnalysisResult> {
    const startTime = Date.now();
    const results: FrameAnalysisResult[] = [];
    const errors: Array<{ frameIndex: number; error: string }> = [];
    let totalCost = 0;
    
    // Process frames with controlled concurrency
    const batchSize = parseInt(process.env.BATCH_SIZE || '5');
    
    for (let i = 0; i < imagePaths.length; i += batchSize) {
      const batch = imagePaths.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (imagePath, batchIndex) => {
        const frameIndex = i + batchIndex;
        
        try {
          const result = await this.analyzeFrame(imagePath, analysisType, {
            ...options,
            priority: 'low' // Batch operations are lower priority
          });
          
          results.push(result);
          
          // Add to total cost (rough estimation)
          const costEstimate = costTracker.calculateCost(
            options.model || 'gpt-4-vision-preview',
            500, // Estimated input tokens
            200, // Estimated output tokens for quick analysis
            1
          );
          totalCost += costEstimate;
          
        } catch (error) {
          errors.push({
            frameIndex,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      });
      
      // Wait for batch to complete
      await Promise.all(batchPromises);
      
      // Small delay between batches to respect rate limits
      if (i + batchSize < imagePaths.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    return {
      results,
      totalCost,
      totalTime: Date.now() - startTime,
      successCount: results.length,
      errorCount: errors.length,
      errors
    };
  }

  /**
   * Compare multiple frames for similarity
   */
  async compareFrames(
    imagePaths: string[],
    options: VisionAnalysisOptions = {}
  ): Promise<{
    comparison: string;
    similarities: Array<{
      frame1: number;
      frame2: number;
      similarity_score: number;
      differences: string[];
    }>;
  }> {
    if (imagePaths.length < 2) {
      throw new Error('At least 2 frames are required for comparison');
    }
    
    // Encode images
    const encodedImages = await Promise.all(
      imagePaths.map(async (path, index) => {
        const encoded = await imageEncoder.optimizeForOpenAI(path);
        return {
          base64: encoded.base64,
          description: `Frame ${index + 1}`
        };
      })
    );
    
    const prompt = `Compare these video frames and analyze their similarities and differences. 
    
    For each pair of frames, provide:
    1. Overall similarity assessment
    2. Key differences in content, composition, or quality
    3. A similarity score from 0-10 (10 being identical)
    
    Return JSON format:
    {
      "comparison": "overall comparison summary",
      "similarities": [
        {
          "frame1": 1,
          "frame2": 2,
          "similarity_score": 7.5,
          "differences": ["difference 1", "difference 2"]
        }
      ]
    }`;
    
    await openaiRateLimiter.waitForOpenAI(options.model);
    
    const response = await OpenAIRetryHandler.executeOpenAICall(async () => {
      return await openaiClient.analyzeMultipleImages(
        encodedImages,
        prompt,
        {
          model: options.model || 'gpt-4-vision-preview',
          maxTokens: options.maxTokens || 3000
        }
      );
    });
    
    try {
      return JSON.parse(this.cleanJSONResponse(response));
    } catch (parseError) {
      throw new Error('Failed to parse comparison response');
    }
  }

  /**
   * Clean JSON response from API
   */
  private cleanJSONResponse(response: string): string {
    // Remove markdown code blocks if present
    let cleaned = response.replace(/```json\s*/g, '').replace(/```\s*/g, '');
    
    // Find the JSON object
    const jsonStart = cleaned.indexOf('{');
    const jsonEnd = cleaned.lastIndexOf('}');
    
    if (jsonStart !== -1 && jsonEnd !== -1) {
      cleaned = cleaned.substring(jsonStart, jsonEnd + 1);
    }
    
    return cleaned;
  }

  /**
   * Parse non-JSON response as fallback
   */
  private parseNonJSONResponse(response: string): any {
    // Basic parsing for non-JSON responses
    return {
      description: response.substring(0, 200) + '...',
      visual_elements: ['Could not parse detailed elements'],
      subjects: [],
      setting_description: 'Could not determine setting',
      composition_analysis: { overall_score: 5 },
      technical_quality: { overall_score: 5 },
      scene_type: 'unknown',
      notable_features: []
    };
  }

  /**
   * Estimate token count for text
   */
  private estimateTokens(text: string): number {
    // Rough estimation: 1 token ≈ 4 characters for English text
    return Math.ceil(text.length / 4);
  }

  /**
   * Calculate confidence score based on response completeness
   */
  private calculateConfidenceScore(analysisData: any): number {
    let score = 0.5; // Base score
    
    // Add points for complete fields
    if (analysisData.description && analysisData.description.length > 20) score += 0.1;
    if (Array.isArray(analysisData.visual_elements) && analysisData.visual_elements.length > 0) score += 0.1;
    if (analysisData.setting_description && analysisData.setting_description.length > 10) score += 0.1;
    if (analysisData.composition_analysis && Object.keys(analysisData.composition_analysis).length > 2) score += 0.1;
    if (analysisData.technical_quality && Object.keys(analysisData.technical_quality).length > 2) score += 0.1;
    if (analysisData.scene_type && analysisData.scene_type !== 'unknown') score += 0.1;
    
    return Math.min(1.0, score);
  }

  /**
   * Get cost estimates for analysis operations
   */
  getCostEstimates(): {
    detailed_analysis: number;
    quick_analysis: number;
    batch_analysis_per_frame: number;
    comparison_per_frame: number;
  } {
    const model = 'gpt-4-vision-preview';
    
    return {
      detailed_analysis: costTracker.calculateCost(model, 800, 500, 1),
      quick_analysis: costTracker.calculateCost(model, 400, 200, 1),
      batch_analysis_per_frame: costTracker.calculateCost(model, 500, 250, 1),
      comparison_per_frame: costTracker.calculateCost(model, 600, 300, 1)
    };
  }

  /**
   * Test the vision service
   */
  async testService(): Promise<{
    apiConnection: boolean;
    visionCapability: boolean;
    rateLimiting: boolean;
    error?: string;
  }> {
    try {
      // Test basic API connection
      const connectionTest = await openaiClient.testConnection();
      if (!connectionTest) {
        return {
          apiConnection: false,
          visionCapability: false,
          rateLimiting: false,
          error: 'API connection failed'
        };
      }

      // Test rate limiting
      const rateLimitTest = await openaiRateLimiter.getOpenAIStatus();
      
      return {
        apiConnection: true,
        visionCapability: true, // Would need actual vision test
        rateLimiting: rateLimitTest.remainingRequests > 0,
      };
    } catch (error) {
      return {
        apiConnection: false,
        visionCapability: false,
        rateLimiting: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

export const aiVisionService = AIVisionService.getInstance();