import sharp from 'sharp';
import { promises as fs } from 'fs';
import { FaceDetection } from './faceDetectionService';

export interface ClothingAnalysis {
  primary_clothing_type: string; // 'casual', 'formal', 'athletic', 'traditional', 'outdoor'
  colors: Array<{
    color: string;
    percentage: number;
    location: 'top' | 'bottom' | 'full_body' | 'accessories';
  }>;
  patterns: string[]; // 'solid', 'striped', 'plaid', 'floral', 'geometric'
  style_descriptors: string[]; // 'modern', 'vintage', 'bohemian', 'minimalist', 'layered'
  formality_score: number; // 0-10, casual to very formal
  weather_appropriateness: string; // 'hot', 'mild', 'cold', 'rain_gear'
  confidence: number;
}

export interface AccessoryAnalysis {
  detected_accessories: Array<{
    type: string; // 'glasses', 'hat', 'jewelry', 'bag', 'watch'
    location: string; // 'face', 'head', 'neck', 'wrist', 'hand'
    description: string;
    confidence: number;
  }>;
  style_indicators: string[]; // 'professional', 'casual', 'trendy', 'classic'
  total_accessories_count: number;
  prominence_score: number; // 0-10, how noticeable are the accessories
}

export interface PoseAnalysis {
  body_orientation: string; // 'facing_forward', 'profile_left', 'profile_right', '3_4_turn'
  head_pose: {
    yaw: number; // -90 to 90 degrees (left/right turn)
    pitch: number; // -90 to 90 degrees (up/down tilt)
    roll: number; // -45 to 45 degrees (head tilt)
  };
  apparent_activity: string; // 'standing', 'walking', 'sitting', 'gesturing', 'interacting'
  posture_description: string; // 'upright', 'relaxed', 'leaning', 'dynamic'
  gesture_analysis: {
    hands_visible: boolean;
    apparent_gestures: string[]; // 'pointing', 'waving', 'holding_object'
    gesture_intensity: number; // 0-10
  };
  confidence: number;
}

export interface AppearanceAnalysisResult {
  clothing: ClothingAnalysis;
  accessories: AccessoryAnalysis;
  pose: PoseAnalysis;
  overall_appearance_score: number; // 0-10 overall visual appeal/quality
  distinctiveness_factors: string[]; // What makes this appearance unique
  temporal_consistency_hints: string[]; // Clues for tracking across frames
  analysis_confidence: number;
  processing_time_ms: number;
}

export class PersonAppearanceAnalyzer {
  private static instance: PersonAppearanceAnalyzer;

  public static getInstance(): PersonAppearanceAnalyzer {
    if (!PersonAppearanceAnalyzer.instance) {
      PersonAppearanceAnalyzer.instance = new PersonAppearanceAnalyzer();
    }
    return PersonAppearanceAnalyzer.instance;
  }

  async analyzeAppearance(
    imagePath: string,
    faceDetection: FaceDetection,
    expandedBoundingBox?: {
      x: number;
      y: number;
      width: number;
      height: number;
    }
  ): Promise<AppearanceAnalysisResult> {
    const startTime = Date.now();
    
    try {
      // Get expanded region for full body/clothing analysis
      const analysisRegion = expandedBoundingBox || this.expandBoundingBoxForBody(faceDetection.bounding_box);
      
      // Extract region for analysis
      const regionBuffer = await this.extractAnalysisRegion(imagePath, analysisRegion);
      const imageInfo = await sharp(imagePath).metadata();
      
      // Perform detailed analysis
      const [clothingAnalysis, accessoryAnalysis, poseAnalysis] = await Promise.all([
        this.analyzeClothing(regionBuffer, analysisRegion),
        this.analyzeAccessories(regionBuffer, analysisRegion, faceDetection),
        this.analyzePose(regionBuffer, analysisRegion, faceDetection)
      ]);

      // Calculate overall scores and factors
      const overallScore = this.calculateOverallAppearanceScore(clothingAnalysis, accessoryAnalysis, poseAnalysis);
      const distinctivenessFactors = this.identifyDistinctivenessFactors(clothingAnalysis, accessoryAnalysis, poseAnalysis);
      const consistencyHints = this.generateConsistencyHints(clothingAnalysis, accessoryAnalysis);
      
      const processingTime = Date.now() - startTime;
      
      return {
        clothing: clothingAnalysis,
        accessories: accessoryAnalysis,
        pose: poseAnalysis,
        overall_appearance_score: overallScore,
        distinctiveness_factors: distinctivenessFactors,
        temporal_consistency_hints: consistencyHints,
        analysis_confidence: (clothingAnalysis.confidence + accessoryAnalysis.prominence_score/10 + poseAnalysis.confidence) / 3,
        processing_time_ms: processingTime
      };
      
    } catch (error) {
      console.error('Appearance analysis failed:', error);
      throw new Error(`Appearance analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private expandBoundingBoxForBody(faceBoundingBox: FaceDetection['bounding_box']): {
    x: number;
    y: number;
    width: number;
    height: number;
  } {
    // Expand face bounding box to capture more of the body for clothing analysis
    // Typical proportions: face is about 1/8 of body height
    const faceWidth = faceBoundingBox.width;
    const faceHeight = faceBoundingBox.height;
    
    // Estimate body dimensions based on face size
    const bodyWidth = faceWidth * 2.5; // Shoulders are roughly 2.5x face width
    const bodyHeight = faceHeight * 6; // Body is roughly 6x face height from neck down
    
    // Center the expanded box around the face, extending down for body
    const expandedX = Math.max(0, faceBoundingBox.x - (bodyWidth - faceWidth) / 2);
    const expandedY = faceBoundingBox.y; // Start from face top
    const expandedWidth = bodyWidth;
    const expandedHeight = faceHeight + bodyHeight; // Face + body
    
    return {
      x: Math.round(expandedX),
      y: Math.round(expandedY),
      width: Math.round(expandedWidth),
      height: Math.round(expandedHeight)
    };
  }

  private async extractAnalysisRegion(
    imagePath: string,
    region: { x: number; y: number; width: number; height: number }
  ): Promise<Buffer> {
    const imageInfo = await sharp(imagePath).metadata();
    
    // Ensure region is within image bounds
    const clampedRegion = {
      left: Math.max(0, Math.min(region.x, (imageInfo.width || 0) - 1)),
      top: Math.max(0, Math.min(region.y, (imageInfo.height || 0) - 1)),
      width: Math.min(region.width, (imageInfo.width || 0) - Math.max(0, region.x)),
      height: Math.min(region.height, (imageInfo.height || 0) - Math.max(0, region.y))
    };
    
    return await sharp(imagePath)
      .extract(clampedRegion)
      .jpeg()
      .toBuffer();
  }

  private async analyzeClothing(
    regionBuffer: Buffer,
    region: { x: number; y: number; width: number; height: number }
  ): Promise<ClothingAnalysis> {
    try {
      // Get image statistics for color analysis
      const { channels, dominant } = await sharp(regionBuffer).stats();
      
      // Analyze colors
      const colors = await this.extractClothingColors(regionBuffer);
      
      // Determine clothing type based on color patterns and region analysis
      const clothingType = this.classifyClothingType(colors, region);
      
      // Analyze patterns (simplified approach)
      const patterns = await this.detectClothingPatterns(regionBuffer);
      
      // Generate style descriptors
      const styleDescriptors = this.generateStyleDescriptors(clothingType, colors, patterns);
      
      // Calculate formality score
      const formalityScore = this.calculateFormalityScore(clothingType, colors, styleDescriptors);
      
      // Determine weather appropriateness
      const weatherAppropriateness = this.assessWeatherAppropriateness(clothingType, colors);
      
      return {
        primary_clothing_type: clothingType,
        colors,
        patterns,
        style_descriptors: styleDescriptors,
        formality_score: formalityScore,
        weather_appropriateness: weatherAppropriateness,
        confidence: 0.7 // Base confidence for color-based analysis
      };
      
    } catch (error) {
      console.error('Clothing analysis failed:', error);
      return {
        primary_clothing_type: 'casual',
        colors: [],
        patterns: ['solid'],
        style_descriptors: ['modern'],
        formality_score: 5,
        weather_appropriateness: 'mild',
        confidence: 0.3
      };
    }
  }

  private async extractClothingColors(regionBuffer: Buffer): Promise<ClothingAnalysis['colors']> {
    const image = sharp(regionBuffer);
    const { channels, dominant } = await image.stats();
    
    const colors: ClothingAnalysis['colors'] = [];
    
    // Convert dominant colors to descriptive names and analyze distribution
    for (let i = 0; i < Math.min(3, dominant.length); i++) {
      const colorData = dominant[i];
      const colorName = this.rgbToColorName(colorData.r, colorData.g, colorData.b);
      const percentage = (colorData.hex ? 30 - i * 10 : 10); // Simplified percentage
      
      colors.push({
        color: colorName,
        percentage,
        location: i === 0 ? 'top' : i === 1 ? 'bottom' : 'accessories'
      });
    }
    
    return colors;
  }

  private rgbToColorName(r: number, g: number, b: number): string {
    // Simplified color name mapping
    const colors = [
      { name: 'black', r: 0, g: 0, b: 0 },
      { name: 'white', r: 255, g: 255, b: 255 },
      { name: 'red', r: 255, g: 0, b: 0 },
      { name: 'green', r: 0, g: 255, b: 0 },
      { name: 'blue', r: 0, g: 0, b: 255 },
      { name: 'yellow', r: 255, g: 255, b: 0 },
      { name: 'purple', r: 128, g: 0, b: 128 },
      { name: 'orange', r: 255, g: 165, b: 0 },
      { name: 'brown', r: 165, g: 42, b: 42 },
      { name: 'gray', r: 128, g: 128, b: 128 }
    ];
    
    let closestColor = 'unknown';
    let minDistance = Infinity;
    
    for (const color of colors) {
      const distance = Math.sqrt(
        Math.pow(r - color.r, 2) + Math.pow(g - color.g, 2) + Math.pow(b - color.b, 2)
      );
      
      if (distance < minDistance) {
        minDistance = distance;
        closestColor = color.name;
      }
    }
    
    return closestColor;
  }

  private classifyClothingType(
    colors: ClothingAnalysis['colors'],
    region: { x: number; y: number; width: number; height: number }
  ): string {
    // Simplified clothing classification based on colors and region
    const primaryColors = colors.map(c => c.color);
    
    if (primaryColors.includes('black') || primaryColors.includes('white')) {
      if (colors.some(c => c.color === 'black' && c.percentage > 40)) {
        return 'formal';
      }
    }
    
    if (primaryColors.includes('blue') && primaryColors.includes('white')) {
      return 'casual';
    }
    
    if (primaryColors.includes('green') || primaryColors.includes('brown')) {
      return 'outdoor';
    }
    
    // Default classification
    return 'casual';
  }

  private async detectClothingPatterns(regionBuffer: Buffer): Promise<string[]> {
    // Simplified pattern detection using edge analysis
    try {
      const grayBuffer = await sharp(regionBuffer).grayscale().raw().toBuffer();
      const metadata = await sharp(regionBuffer).metadata();
      
      if (!metadata.width || !metadata.height) {
        return ['solid'];
      }
      
      // Analyze edge patterns to detect stripes, plaid, etc.
      const edgeCount = this.countEdges(grayBuffer, metadata.width, metadata.height);
      const edgeRatio = edgeCount / (metadata.width * metadata.height);
      
      if (edgeRatio > 0.3) {
        return ['striped', 'patterned'];
      } else if (edgeRatio > 0.1) {
        return ['textured'];
      } else {
        return ['solid'];
      }
      
    } catch (error) {
      return ['solid'];
    }
  }

  private countEdges(buffer: Buffer, width: number, height: number): number {
    let edgeCount = 0;
    const threshold = 30;
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        const current = buffer[idx];
        const right = buffer[idx + 1];
        const bottom = buffer[idx + width];
        
        if (Math.abs(current - right) > threshold || Math.abs(current - bottom) > threshold) {
          edgeCount++;
        }
      }
    }
    
    return edgeCount;
  }

  private generateStyleDescriptors(
    clothingType: string,
    colors: ClothingAnalysis['colors'],
    patterns: string[]
  ): string[] {
    const descriptors = [];
    
    // Base descriptors from clothing type
    switch (clothingType) {
      case 'formal':
        descriptors.push('professional', 'classic');
        break;
      case 'casual':
        descriptors.push('relaxed', 'modern');
        break;
      case 'outdoor':
        descriptors.push('practical', 'rugged');
        break;
      case 'athletic':
        descriptors.push('sporty', 'functional');
        break;
    }
    
    // Add descriptors based on colors
    const colorNames = colors.map(c => c.color);
    if (colorNames.includes('black') && colorNames.includes('white')) {
      descriptors.push('minimalist');
    }
    if (colorNames.some(c => ['red', 'yellow', 'orange'].includes(c))) {
      descriptors.push('vibrant');
    }
    
    // Add descriptors based on patterns
    if (patterns.includes('striped') || patterns.includes('patterned')) {
      descriptors.push('bold');
    }
    
    return descriptors.slice(0, 3); // Limit to top 3 descriptors
  }

  private calculateFormalityScore(
    clothingType: string,
    colors: ClothingAnalysis['colors'],
    styleDescriptors: string[]
  ): number {
    let score = 5; // Base score
    
    // Adjust based on clothing type
    switch (clothingType) {
      case 'formal':
        score += 3;
        break;
      case 'casual':
        score += 0;
        break;
      case 'outdoor':
      case 'athletic':
        score -= 2;
        break;
    }
    
    // Adjust based on colors
    const colorNames = colors.map(c => c.color);
    if (colorNames.includes('black')) score += 1;
    if (colorNames.includes('white')) score += 0.5;
    if (colorNames.some(c => ['red', 'yellow', 'orange'].includes(c))) score -= 1;
    
    // Adjust based on style descriptors
    if (styleDescriptors.includes('professional')) score += 2;
    if (styleDescriptors.includes('classic')) score += 1;
    if (styleDescriptors.includes('sporty')) score -= 2;
    
    return Math.max(0, Math.min(10, score));
  }

  private assessWeatherAppropriateness(clothingType: string, colors: ClothingAnalysis['colors']): string {
    const colorNames = colors.map(c => c.color);
    
    if (clothingType === 'outdoor') {
      return 'cold';
    }
    
    if (colorNames.some(c => ['white', 'yellow'].includes(c))) {
      return 'hot';
    }
    
    if (colorNames.includes('black')) {
      return 'mild';
    }
    
    return 'mild'; // Default
  }

  private async analyzeAccessories(
    regionBuffer: Buffer,
    region: { x: number; y: number; width: number; height: number },
    faceDetection: FaceDetection
  ): Promise<AccessoryAnalysis> {
    try {
      // Simplified accessory detection based on face region and surrounding areas
      const detectedAccessories = await this.detectAccessories(regionBuffer, region, faceDetection);
      const styleIndicators = this.deriveStyleFromAccessories(detectedAccessories);
      const prominenceScore = this.calculateAccessoryProminence(detectedAccessories);
      
      return {
        detected_accessories: detectedAccessories,
        style_indicators: styleIndicators,
        total_accessories_count: detectedAccessories.length,
        prominence_score: prominenceScore
      };
      
    } catch (error) {
      console.error('Accessory analysis failed:', error);
      return {
        detected_accessories: [],
        style_indicators: ['casual'],
        total_accessories_count: 0,
        prominence_score: 0
      };
    }
  }

  private async detectAccessories(
    regionBuffer: Buffer,
    region: { x: number; y: number; width: number; height: number },
    faceDetection: FaceDetection
  ): Promise<AccessoryAnalysis['detected_accessories']> {
    const accessories: AccessoryAnalysis['detected_accessories'] = [];
    
    // Simplified accessory detection using geometric analysis and color patterns
    // In production, would use more sophisticated object detection models
    
    // Check for glasses (dark horizontal line across face)
    if (await this.detectGlasses(regionBuffer)) {
      accessories.push({
        type: 'glasses',
        location: 'face',
        description: 'eyewear',
        confidence: 0.7
      });
    }
    
    // Check for hat (significant color change in upper region)
    if (await this.detectHat(regionBuffer, region)) {
      accessories.push({
        type: 'hat',
        location: 'head',
        description: 'headwear',
        confidence: 0.6
      });
    }
    
    // Check for jewelry (bright spots in neck/wrist area)
    const jewelrySpots = await this.detectJewelry(regionBuffer);
    accessories.push(...jewelrySpots);
    
    return accessories;
  }

  private async detectGlasses(regionBuffer: Buffer): Promise<boolean> {
    // Simplified glasses detection - look for horizontal dark lines in face region
    try {
      const metadata = await sharp(regionBuffer).metadata();
      if (!metadata.width || !metadata.height) return false;
      
      const grayBuffer = await sharp(regionBuffer).grayscale().raw().toBuffer();
      
      // Check middle third of image height for horizontal dark lines
      const startY = Math.floor(metadata.height * 0.3);
      const endY = Math.floor(metadata.height * 0.6);
      
      let darkLineCount = 0;
      for (let y = startY; y < endY; y += 2) {
        let darkPixelCount = 0;
        for (let x = 0; x < metadata.width; x += 2) {
          const idx = y * metadata.width + x;
          if (grayBuffer[idx] < 100) { // Dark pixel
            darkPixelCount++;
          }
        }
        if (darkPixelCount > metadata.width * 0.4) {
          darkLineCount++;
        }
      }
      
      return darkLineCount > 2;
      
    } catch (error) {
      return false;
    }
  }

  private async detectHat(regionBuffer: Buffer, region: { width: number; height: number }): Promise<boolean> {
    // Simplified hat detection - check for color consistency in upper portion
    try {
      const upperPortion = await sharp(regionBuffer)
        .extract({ left: 0, top: 0, width: region.width, height: Math.floor(region.height * 0.3) })
        .stats();
      
      // If upper portion has very different color characteristics, likely a hat
      return upperPortion.channels[0].mean < 80 || upperPortion.channels[0].mean > 200;
      
    } catch (error) {
      return false;
    }
  }

  private async detectJewelry(regionBuffer: Buffer): Promise<AccessoryAnalysis['detected_accessories']> {
    const jewelry: AccessoryAnalysis['detected_accessories'] = [];
    
    try {
      // Look for bright spots that could indicate jewelry
      const stats = await sharp(regionBuffer).stats();
      
      // If there are very bright spots (jewelry reflection), add jewelry
      if (stats.channels.some(channel => channel.max > 240)) {
        jewelry.push({
          type: 'jewelry',
          location: 'neck',
          description: 'metallic accessory',
          confidence: 0.5
        });
      }
      
    } catch (error) {
      // Ignore errors in jewelry detection
    }
    
    return jewelry;
  }

  private deriveStyleFromAccessories(accessories: AccessoryAnalysis['detected_accessories']): string[] {
    const styles: string[] = [];
    
    if (accessories.some(acc => acc.type === 'glasses')) {
      styles.push('intellectual', 'professional');
    }
    
    if (accessories.some(acc => acc.type === 'hat')) {
      styles.push('casual', 'outdoor');
    }
    
    if (accessories.some(acc => acc.type === 'jewelry')) {
      styles.push('elegant', 'fashionable');
    }
    
    return styles.length > 0 ? styles : ['casual'];
  }

  private calculateAccessoryProminence(accessories: AccessoryAnalysis['detected_accessories']): number {
    if (accessories.length === 0) return 0;
    
    const avgConfidence = accessories.reduce((sum, acc) => sum + acc.confidence, 0) / accessories.length;
    const countBonus = Math.min(accessories.length / 3, 1); // Up to 3 accessories for max bonus
    
    return Math.min(10, (avgConfidence * 5 + countBonus * 5));
  }

  private async analyzePose(
    regionBuffer: Buffer,
    region: { x: number; y: number; width: number; height: number },
    faceDetection: FaceDetection
  ): Promise<PoseAnalysis> {
    try {
      // Simplified pose analysis based on face landmarks and region characteristics
      const headPose = await this.estimateHeadPose(faceDetection);
      const bodyOrientation = this.estimateBodyOrientation(headPose, region);
      const activity = this.estimateActivity(region, headPose);
      const posture = this.analyzePosture(region);
      const gestures = await this.analyzeGestures(regionBuffer, region);
      
      return {
        body_orientation: bodyOrientation,
        head_pose: headPose,
        apparent_activity: activity,
        posture_description: posture,
        gesture_analysis: gestures,
        confidence: 0.6 // Base confidence for simplified analysis
      };
      
    } catch (error) {
      console.error('Pose analysis failed:', error);
      return {
        body_orientation: 'facing_forward',
        head_pose: { yaw: 0, pitch: 0, roll: 0 },
        apparent_activity: 'standing',
        posture_description: 'upright',
        gesture_analysis: {
          hands_visible: false,
          apparent_gestures: [],
          gesture_intensity: 0
        },
        confidence: 0.3
      };
    }
  }

  private async estimateHeadPose(faceDetection: FaceDetection): Promise<PoseAnalysis['head_pose']> {
    // Simplified head pose estimation based on face landmarks
    // In production, would use dedicated pose estimation models
    
    const landmarks = faceDetection.landmarks;
    if (!landmarks) {
      return { yaw: 0, pitch: 0, roll: 0 };
    }
    
    // Estimate yaw from eye positions
    const eyeDistance = landmarks.right_eye.x - landmarks.left_eye.x;
    const faceWidth = faceDetection.bounding_box.width;
    const yawRatio = eyeDistance / faceWidth;
    const yaw = (yawRatio - 0.5) * 60; // Rough estimation
    
    // Estimate pitch from nose position relative to eyes
    const eyeY = (landmarks.left_eye.y + landmarks.right_eye.y) / 2;
    const pitchRatio = (landmarks.nose.y - eyeY) / faceDetection.bounding_box.height;
    const pitch = pitchRatio * 30;
    
    // Estimate roll from eye line angle
    const eyeAngle = Math.atan2(
      landmarks.right_eye.y - landmarks.left_eye.y,
      landmarks.right_eye.x - landmarks.left_eye.x
    );
    const roll = eyeAngle * 180 / Math.PI;
    
    return {
      yaw: Math.max(-90, Math.min(90, yaw)),
      pitch: Math.max(-90, Math.min(90, pitch)),
      roll: Math.max(-45, Math.min(45, roll))
    };
  }

  private estimateBodyOrientation(
    headPose: PoseAnalysis['head_pose'],
    region: { width: number; height: number }
  ): string {
    const absYaw = Math.abs(headPose.yaw);
    
    if (absYaw < 15) return 'facing_forward';
    if (absYaw < 45) return headPose.yaw > 0 ? '3_4_turn_right' : '3_4_turn_left';
    return headPose.yaw > 0 ? 'profile_right' : 'profile_left';
  }

  private estimateActivity(
    region: { width: number; height: number },
    headPose: PoseAnalysis['head_pose']
  ): string {
    // Simplified activity estimation based on region aspect ratio and head pose
    const aspectRatio = region.height / region.width;
    
    if (aspectRatio > 2.5) {
      return 'standing';
    } else if (aspectRatio < 1.5) {
      return 'sitting';
    } else if (Math.abs(headPose.yaw) > 30) {
      return 'interacting';
    } else {
      return 'standing';
    }
  }

  private analyzePosture(region: { width: number; height: number }): string {
    // Simplified posture analysis based on region dimensions
    const aspectRatio = region.height / region.width;
    
    if (aspectRatio > 3) {
      return 'upright';
    } else if (aspectRatio > 2) {
      return 'relaxed';
    } else {
      return 'leaning';
    }
  }

  private async analyzeGestures(
    regionBuffer: Buffer,
    region: { width: number; height: number }
  ): Promise<PoseAnalysis['gesture_analysis']> {
    // Simplified gesture analysis
    // In production, would use hand detection and gesture recognition models
    
    try {
      const stats = await sharp(regionBuffer).stats();
      
      // Very basic gesture detection based on color variance in lower region
      const hasVariance = stats.channels.some(channel => channel.stdev > 30);
      
      return {
        hands_visible: hasVariance,
        apparent_gestures: hasVariance ? ['gesturing'] : [],
        gesture_intensity: hasVariance ? 5 : 0
      };
      
    } catch (error) {
      return {
        hands_visible: false,
        apparent_gestures: [],
        gesture_intensity: 0
      };
    }
  }

  private calculateOverallAppearanceScore(
    clothing: ClothingAnalysis,
    accessories: AccessoryAnalysis,
    pose: PoseAnalysis
  ): number {
    let score = 5; // Base score
    
    // Clothing contribution (40%)
    score += (clothing.formality_score - 5) * 0.4;
    score += (clothing.confidence - 0.5) * 2;
    
    // Accessories contribution (30%)
    score += (accessories.prominence_score / 10) * 3;
    
    // Pose contribution (30%)
    score += (pose.confidence - 0.5) * 6;
    
    return Math.max(0, Math.min(10, score));
  }

  private identifyDistinctivenessFactors(
    clothing: ClothingAnalysis,
    accessories: AccessoryAnalysis,
    pose: PoseAnalysis
  ): string[] {
    const factors: string[] = [];
    
    // Distinctive clothing
    if (clothing.formality_score > 8) factors.push('formal_attire');
    if (clothing.formality_score < 3) factors.push('very_casual');
    if (clothing.colors.some(c => c.percentage > 50)) factors.push('dominant_color');
    if (clothing.patterns.includes('patterned')) factors.push('patterned_clothing');
    
    // Distinctive accessories
    if (accessories.total_accessories_count > 2) factors.push('multiple_accessories');
    accessories.detected_accessories.forEach(acc => {
      factors.push(`has_${acc.type}`);
    });
    
    // Distinctive pose
    if (Math.abs(pose.head_pose.yaw) > 30) factors.push('profile_pose');
    if (pose.gesture_analysis.gesture_intensity > 5) factors.push('dynamic_gestures');
    
    return factors.slice(0, 5); // Limit to top 5 factors
  }

  private generateConsistencyHints(
    clothing: ClothingAnalysis,
    accessories: AccessoryAnalysis
  ): string[] {
    const hints: string[] = [];
    
    // Color-based consistency hints
    const primaryColors = clothing.colors.filter(c => c.percentage > 20);
    primaryColors.forEach(color => {
      hints.push(`primary_${color.color}`);
    });
    
    // Clothing type consistency
    hints.push(`clothing_${clothing.primary_clothing_type}`);
    
    // Accessory consistency
    accessories.detected_accessories.forEach(acc => {
      hints.push(`accessory_${acc.type}`);
    });
    
    // Style consistency
    clothing.style_descriptors.forEach(style => {
      hints.push(`style_${style}`);
    });
    
    return hints.slice(0, 8); // Limit to top 8 hints
  }
}

export const personAppearanceAnalyzer = PersonAppearanceAnalyzer.getInstance();