import OpenAI from 'openai';
import { config } from 'dotenv';

config();

export interface OpenAIConfig {
  apiKey: string;
  maxRequestsPerMinute: number;
  maxTokens: number;
  temperature: number;
  model: string;
  timeout: number;
}

export interface ChatCompletionOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  systemMessage?: string;
  timeout?: number;
}

export interface VisionOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  detail?: 'low' | 'high' | 'auto';
  timeout?: number;
}

export class OpenAIClient {
  private static instance: OpenAIClient;
  private client: OpenAI;
  private config: OpenAIConfig;

  private constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }

    this.config = {
      apiKey,
      maxRequestsPerMinute: parseInt(process.env.MAX_API_REQUESTS_PER_MINUTE || '60'),
      maxTokens: parseInt(process.env.MAX_TOKENS || '4000'),
      temperature: parseFloat(process.env.TEMPERATURE || '0.3'),
      model: process.env.OPENAI_MODEL || 'gpt-4-vision-preview',
      timeout: parseInt(process.env.API_TIMEOUT_MS || '60000')
    };

    this.client = new OpenAI({
      apiKey: this.config.apiKey,
      timeout: this.config.timeout,
      maxRetries: 0 // We'll handle retries ourselves
    });
  }

  public static getInstance(): OpenAIClient {
    if (!OpenAIClient.instance) {
      OpenAIClient.instance = new OpenAIClient();
    }
    return OpenAIClient.instance;
  }

  /**
   * Test API connection
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await this.client.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 10
      });
      
      return response.choices.length > 0;
    } catch (error) {
      console.error('OpenAI API connection test failed:', error);
      return false;
    }
  }

  /**
   * Analyze a single image using GPT-4 Vision
   */
  async analyzeImage(
    imageBase64: string,
    prompt: string,
    options: VisionOptions = {}
  ): Promise<string> {
    const {
      model = this.config.model,
      maxTokens = this.config.maxTokens,
      temperature = this.config.temperature,
      detail = 'high'
    } = options;

    const response = await this.client.chat.completions.create({
      model,
      max_tokens: maxTokens,
      temperature,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: prompt
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${imageBase64}`,
                detail
              }
            }
          ]
        }
      ]
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response content from OpenAI API');
    }

    return content;
  }

  /**
   * Analyze multiple images in a single request
   */
  async analyzeMultipleImages(
    images: Array<{ base64: string; description?: string }>,
    prompt: string,
    options: VisionOptions = {}
  ): Promise<string> {
    const {
      model = this.config.model,
      maxTokens = this.config.maxTokens,
      temperature = this.config.temperature,
      detail = 'high'
    } = options;

    // Build content array with text and images
    const content: Array<any> = [
      {
        type: 'text',
        text: prompt
      }
    ];

    // Add each image to the content
    images.forEach((image, index) => {
      if (image.description) {
        content.push({
          type: 'text',
          text: `Image ${index + 1}: ${image.description}`
        });
      }
      
      content.push({
        type: 'image_url',
        image_url: {
          url: `data:image/jpeg;base64,${image.base64}`,
          detail
        }
      });
    });

    const response = await this.client.chat.completions.create({
      model,
      max_tokens: maxTokens,
      temperature,
      messages: [
        {
          role: 'user',
          content
        }
      ]
    });

    const responseContent = response.choices[0]?.message?.content;
    if (!responseContent) {
      throw new Error('No response content from OpenAI API');
    }

    return responseContent;
  }

  /**
   * Chat completion for text-only requests
   */
  async chatCompletion(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    options: ChatCompletionOptions = {}
  ): Promise<string> {
    const {
      model = 'gpt-4',
      maxTokens = this.config.maxTokens,
      temperature = this.config.temperature
    } = options;

    const response = await this.client.chat.completions.create({
      model,
      max_tokens: maxTokens,
      temperature,
      messages
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response content from OpenAI API');
    }

    return content;
  }

  /**
   * Stream chat completion for long responses
   */
  async *streamChatCompletion(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    options: ChatCompletionOptions = {}
  ): AsyncGenerator<string, void, unknown> {
    const {
      model = 'gpt-4',
      maxTokens = this.config.maxTokens,
      temperature = this.config.temperature
    } = options;

    const stream = await this.client.chat.completions.create({
      model,
      max_tokens: maxTokens,
      temperature,
      messages,
      stream: true
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        yield content;
      }
    }
  }

  /**
   * Get available models
   */
  async getAvailableModels(): Promise<string[]> {
    try {
      const models = await this.client.models.list();
      return models.data
        .map(model => model.id)
        .filter(id => id.includes('gpt'))
        .sort();
    } catch (error) {
      console.error('Failed to fetch models:', error);
      return [];
    }
  }

  /**
   * Validate API key and permissions
   */
  async validateAPIKey(): Promise<{
    valid: boolean;
    hasVisionAccess: boolean;
    availableModels: string[];
    error?: string;
  }> {
    try {
      // Test basic API access
      await this.chatCompletion([
        { role: 'user', content: 'Test' }
      ], { model: 'gpt-3.5-turbo', maxTokens: 5 });

      // Get available models
      const availableModels = await this.getAvailableModels();
      
      // Check for vision model access
      const hasVisionAccess = availableModels.some(model => 
        model.includes('vision') || model.includes('gpt-4')
      );

      return {
        valid: true,
        hasVisionAccess,
        availableModels
      };
    } catch (error) {
      return {
        valid: false,
        hasVisionAccess: false,
        availableModels: [],
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get token count estimation for text
   */
  estimateTokenCount(text: string): number {
    // Rough estimation: 1 token ≈ 4 characters for English text
    return Math.ceil(text.length / 4);
  }

  /**
   * Get current configuration
   */
  getConfig(): OpenAIConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<OpenAIConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * Get the raw OpenAI client instance for advanced usage
   */
  getRawClient(): OpenAI {
    return this.client;
  }
}

export const openaiClient = OpenAIClient.getInstance();