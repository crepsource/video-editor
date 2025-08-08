import sharp from 'sharp';
import path from 'path';

export enum SceneType {
  ESTABLISHING_SHOT = 'establishing_shot',
  WIDE_SHOT = 'wide_shot',
  MEDIUM_SHOT = 'medium_shot',
  CLOSE_UP = 'close_up',
  EXTREME_CLOSE_UP = 'extreme_close_up',
  ACTION_SCENE = 'action_scene',
  DIALOGUE_SCENE = 'dialogue_scene',
  TRANSITION = 'transition',
  TITLE_CARD = 'title_card',
  MONTAGE = 'montage',
  LANDSCAPE = 'landscape',
  PORTRAIT = 'portrait',
  CROWD_SCENE = 'crowd_scene',
  INTERIOR = 'interior',
  EXTERIOR = 'exterior'
}

export enum ShotType {
  EXTREME_WIDE_SHOT = 'extreme_wide_shot',
  WIDE_SHOT = 'wide_shot', 
  MEDIUM_WIDE_SHOT = 'medium_wide_shot',
  MEDIUM_SHOT = 'medium_shot',
  MEDIUM_CLOSE_UP = 'medium_close_up',
  CLOSE_UP = 'close_up',
  EXTREME_CLOSE_UP = 'extreme_close_up',
  CUTAWAY = 'cutaway',
  INSERT = 'insert'
}

export enum MotionLevel {
  STATIC = 'static',
  LOW_MOTION = 'low_motion',
  MEDIUM_MOTION = 'medium_motion',
  HIGH_MOTION = 'high_motion',
  EXTREME_MOTION = 'extreme_motion'
}

export interface SceneClassificationResult {
  primary_scene_type: SceneType;
  shot_type: ShotType;
  motion_level: MotionLevel;
  confidence_scores: {
    scene_type: number; // 0-100
    shot_type: number; // 0-100
    motion_level: number; // 0-100
  };
  visual_features: {
    face_regions: Array<{ x: number; y: number; width: number; height: number; confidence: number }>;
    subject_count: number;
    background_complexity: number; // 0-100
    foreground_focus: number; // 0-100
    depth_of_field: number; // 0-100
    text_regions: Array<{ x: number; y: number; width: number; height: number; text_confidence: number }>;
  };
  motion_features: {
    edge_change_intensity: number; // 0-100
    motion_vectors: Array<{ x: number; y: number; magnitude: number; angle: number }>;
    blur_indicators: number; // 0-100
    camera_movement: {
      detected: boolean;
      type?: 'pan' | 'tilt' | 'zoom' | 'dolly' | 'shake';
      intensity: number; // 0-100
    };
  };
  scene_context: {
    lighting_type: 'natural' | 'artificial' | 'mixed' | 'low_light';
    setting_type: 'indoor' | 'outdoor' | 'studio' | 'unknown';
    time_of_day: 'morning' | 'day' | 'evening' | 'night' | 'unknown';
    weather_indicators: string[];
  };
  classification_confidence: number; // 0-1
}

export interface VisualFeatures {
  edges: Array<{ x: number; y: number; strength: number; angle: number }>;
  regions: Array<{ x: number; y: number; width: number; height: number; complexity: number }>;
  dominant_orientations: Array<{ angle: number; strength: number }>;
  spatial_frequency: number;
  texture_complexity: number;
}

export class SceneClassifier {
  private static instance: SceneClassifier;

  private constructor() {}

  public static getInstance(): SceneClassifier {
    if (!SceneClassifier.instance) {
      SceneClassifier.instance = new SceneClassifier();
    }
    return SceneClassifier.instance;
  }

  /**
   * Classify scene type, shot type, and motion level
   */
  async classifyScene(imagePath: string): Promise<SceneClassificationResult> {
    const image = sharp(imagePath);
    const metadata = await image.metadata();
    
    if (!metadata.width || !metadata.height) {
      throw new Error('Could not determine image dimensions');
    }

    const width = metadata.width;
    const height = metadata.height;

    // Get image data for analysis
    const { data } = await image
      .raw()
      .ensureAlpha()
      .toBuffer({ resolveWithObject: true });

    // Extract visual features
    const visualFeatures = await this.extractVisualFeatures(data, width, height);
    
    // Analyze motion indicators (single frame approximation)
    const motionFeatures = await this.analyzeMotionIndicators(data, width, height);
    
    // Analyze scene context
    const sceneContext = await this.analyzeSceneContext(data, width, height);
    
    // Classify shot type based on visual features
    const shotClassification = this.classifyShotType(visualFeatures, width, height);
    
    // Classify scene type based on all features
    const sceneClassification = this.classifySceneType(visualFeatures, shotClassification, sceneContext);
    
    // Classify motion level
    const motionClassification = this.classifyMotionLevel(motionFeatures);
    
    // Calculate overall confidence
    const overallConfidence = this.calculateClassificationConfidence(
      shotClassification.confidence,
      sceneClassification.confidence,
      motionClassification.confidence
    );

    return {
      primary_scene_type: sceneClassification.type,
      shot_type: shotClassification.type,
      motion_level: motionClassification.level,
      confidence_scores: {
        scene_type: sceneClassification.confidence,
        shot_type: shotClassification.confidence,
        motion_level: motionClassification.confidence
      },
      visual_features: {
        face_regions: visualFeatures.faceRegions,
        subject_count: visualFeatures.subjectCount,
        background_complexity: visualFeatures.backgroundComplexity,
        foreground_focus: visualFeatures.foregroundFocus,
        depth_of_field: visualFeatures.depthOfField,
        text_regions: visualFeatures.textRegions
      },
      motion_features: motionFeatures,
      scene_context: sceneContext,
      classification_confidence: overallConfidence
    };
  }

  /**
   * Extract visual features for classification
   */
  private async extractVisualFeatures(
    data: Buffer,
    width: number,
    height: number
  ): Promise<{
    faceRegions: Array<{ x: number; y: number; width: number; height: number; confidence: number }>;
    subjectCount: number;
    backgroundComplexity: number;
    foregroundFocus: number;
    depthOfField: number;
    textRegions: Array<{ x: number; y: number; width: number; height: number; text_confidence: number }>;
  }> {
    // Detect potential face regions using simplified skin tone and proportion analysis
    const faceRegions = this.detectFaceRegions(data, width, height);
    
    // Count potential subjects/people
    const subjectCount = Math.max(1, faceRegions.length);
    
    // Calculate background complexity
    const backgroundComplexity = this.calculateBackgroundComplexity(data, width, height);
    
    // Calculate foreground focus
    const foregroundFocus = this.calculateForegroundFocus(data, width, height);
    
    // Estimate depth of field
    const depthOfField = this.estimateDepthOfField(data, width, height);
    
    // Detect text regions
    const textRegions = this.detectTextRegions(data, width, height);

    return {
      faceRegions,
      subjectCount,
      backgroundComplexity,
      foregroundFocus,
      depthOfField,
      textRegions
    };
  }

  /**
   * Analyze motion indicators from single frame
   */
  private async analyzeMotionIndicators(
    data: Buffer,
    width: number,
    height: number
  ): Promise<{
    edge_change_intensity: number;
    motion_vectors: Array<{ x: number; y: number; magnitude: number; angle: number }>;
    blur_indicators: number;
    camera_movement: {
      detected: boolean;
      type?: 'pan' | 'tilt' | 'zoom' | 'dolly' | 'shake';
      intensity: number;
    };
  }> {
    // Analyze motion blur patterns
    const blurIndicators = this.analyzeMotionBlurPatterns(data, width, height);
    
    // Detect camera movement patterns
    const cameraMovement = this.detectCameraMovementPatterns(data, width, height);
    
    // Calculate edge change intensity (simplified for single frame)
    const edgeChangeIntensity = this.calculateEdgeIntensity(data, width, height);
    
    // Generate motion vectors (simplified approximation)
    const motionVectors = this.approximateMotionVectors(data, width, height);

    return {
      edge_change_intensity: edgeChangeIntensity,
      motion_vectors: motionVectors,
      blur_indicators: blurIndicators,
      camera_movement: cameraMovement
    };
  }

  /**
   * Analyze scene context (lighting, setting, time)
   */
  private async analyzeSceneContext(
    data: Buffer,
    width: number,
    height: number
  ): Promise<{
    lighting_type: 'natural' | 'artificial' | 'mixed' | 'low_light';
    setting_type: 'indoor' | 'outdoor' | 'studio' | 'unknown';
    time_of_day: 'morning' | 'day' | 'evening' | 'night' | 'unknown';
    weather_indicators: string[];
  }> {
    // Analyze lighting characteristics
    const lightingType = this.analyzeLightingType(data, width, height);
    
    // Determine setting type
    const settingType = this.determineSettingType(data, width, height);
    
    // Estimate time of day
    const timeOfDay = this.estimateTimeOfDay(data, width, height);
    
    // Detect weather indicators
    const weatherIndicators = this.detectWeatherIndicators(data, width, height);

    return {
      lighting_type: lightingType,
      setting_type: settingType,
      time_of_day: timeOfDay,
      weather_indicators: weatherIndicators
    };
  }

  /**
   * Classify shot type based on visual features
   */
  private classifyShotType(
    visualFeatures: any,
    width: number,
    height: number
  ): { type: ShotType; confidence: number } {
    let shotType = ShotType.MEDIUM_SHOT;
    let confidence = 50;

    // Analyze face size and positioning for shot classification
    if (visualFeatures.faceRegions.length > 0) {
      const largestFace = visualFeatures.faceRegions.reduce((largest: any, current: any) => 
        (current.width * current.height) > (largest.width * largest.height) ? current : largest
      );
      
      const faceArea = largestFace.width * largestFace.height;
      const imageArea = width * height;
      const faceRatio = faceArea / imageArea;
      
      if (faceRatio > 0.15) {
        shotType = ShotType.EXTREME_CLOSE_UP;
        confidence = 85;
      } else if (faceRatio > 0.08) {
        shotType = ShotType.CLOSE_UP;
        confidence = 80;
      } else if (faceRatio > 0.04) {
        shotType = ShotType.MEDIUM_CLOSE_UP;
        confidence = 75;
      } else if (faceRatio > 0.02) {
        shotType = ShotType.MEDIUM_SHOT;
        confidence = 70;
      } else if (faceRatio > 0.005) {
        shotType = ShotType.WIDE_SHOT;
        confidence = 65;
      } else {
        shotType = ShotType.EXTREME_WIDE_SHOT;
        confidence = 60;
      }
    } else {
      // No faces detected - use other cues
      if (visualFeatures.foregroundFocus > 80) {
        shotType = ShotType.CLOSE_UP;
        confidence = 60;
      } else if (visualFeatures.backgroundComplexity > 70) {
        shotType = ShotType.WIDE_SHOT;
        confidence = 65;
      }
    }

    return { type: shotType, confidence };
  }

  /**
   * Classify scene type based on all features
   */
  private classifySceneType(
    visualFeatures: any,
    shotClassification: any,
    sceneContext: any
  ): { type: SceneType; confidence: number } {
    let sceneType = SceneType.MEDIUM_SHOT;
    let confidence = 50;

    // Rule-based classification
    
    // Check for text regions (title cards)
    if (visualFeatures.textRegions.length > 2) {
      sceneType = SceneType.TITLE_CARD;
      confidence = 80;
      return { type: sceneType, confidence };
    }

    // Check for multiple faces (dialogue or crowd scene)
    if (visualFeatures.subjectCount > 2) {
      if (visualFeatures.subjectCount > 5) {
        sceneType = SceneType.CROWD_SCENE;
        confidence = 75;
      } else {
        sceneType = SceneType.DIALOGUE_SCENE;
        confidence = 70;
      }
      return { type: sceneType, confidence };
    }

    // Check shot type for scene classification
    switch (shotClassification.type) {
      case ShotType.EXTREME_WIDE_SHOT:
        sceneType = SceneType.ESTABLISHING_SHOT;
        confidence = 80;
        break;
      case ShotType.WIDE_SHOT:
        if (sceneContext.setting_type === 'outdoor') {
          sceneType = SceneType.LANDSCAPE;
          confidence = 75;
        } else {
          sceneType = SceneType.WIDE_SHOT;
          confidence = 70;
        }
        break;
      case ShotType.CLOSE_UP:
      case ShotType.EXTREME_CLOSE_UP:
        sceneType = SceneType.CLOSE_UP;
        confidence = 75;
        break;
      default:
        sceneType = SceneType.MEDIUM_SHOT;
        confidence = 60;
    }

    // Adjust based on context
    if (sceneContext.setting_type === 'indoor') {
      if (sceneType === SceneType.LANDSCAPE) {
        sceneType = SceneType.INTERIOR;
        confidence = Math.max(65, confidence - 10);
      }
    } else if (sceneContext.setting_type === 'outdoor') {
      if (sceneType === SceneType.INTERIOR) {
        sceneType = SceneType.EXTERIOR;
        confidence = Math.max(65, confidence - 10);
      }
    }

    return { type: sceneType, confidence };
  }

  /**
   * Classify motion level
   */
  private classifyMotionLevel(motionFeatures: any): { level: MotionLevel; confidence: number } {
    let motionLevel = MotionLevel.LOW_MOTION;
    let confidence = 50;

    const blurScore = motionFeatures.blur_indicators;
    const cameraMovement = motionFeatures.camera_movement.intensity;
    const edgeIntensity = motionFeatures.edge_change_intensity;

    const combinedMotionScore = (blurScore * 0.4) + (cameraMovement * 0.3) + (edgeIntensity * 0.3);

    if (combinedMotionScore > 80) {
      motionLevel = MotionLevel.EXTREME_MOTION;
      confidence = 85;
    } else if (combinedMotionScore > 60) {
      motionLevel = MotionLevel.HIGH_MOTION;
      confidence = 80;
    } else if (combinedMotionScore > 40) {
      motionLevel = MotionLevel.MEDIUM_MOTION;
      confidence = 75;
    } else if (combinedMotionScore > 20) {
      motionLevel = MotionLevel.LOW_MOTION;
      confidence = 70;
    } else {
      motionLevel = MotionLevel.STATIC;
      confidence = 75;
    }

    return { level: motionLevel, confidence };
  }

  /**
   * Helper methods for feature detection
   */
  private detectFaceRegions(data: Buffer, width: number, height: number): Array<{ x: number; y: number; width: number; height: number; confidence: number }> {
    const faceRegions: Array<{ x: number; y: number; width: number; height: number; confidence: number }> = [];
    const blockSize = 32;
    
    // Simplified face detection using skin tone and proportions
    for (let y = 0; y < height - blockSize; y += blockSize / 2) {
      for (let x = 0; x < width - blockSize; x += blockSize / 2) {
        const faceScore = this.calculateFaceLikelihood(data, width, height, x, y, blockSize, blockSize);
        if (faceScore > 0.6) {
          faceRegions.push({
            x, y, width: blockSize, height: blockSize,
            confidence: faceScore * 100
          });
        }
      }
    }
    
    return this.mergeOverlappingRegions(faceRegions);
  }

  private calculateFaceLikelihood(data: Buffer, width: number, height: number, x: number, y: number, w: number, h: number): number {
    let skinTonePixels = 0;
    let totalPixels = 0;
    let avgR = 0, avgG = 0, avgB = 0;
    
    // Check aspect ratio (faces are roughly 3:4)
    const aspectRatio = w / h;
    if (aspectRatio < 0.6 || aspectRatio > 1.4) return 0;
    
    for (let py = y; py < Math.min(y + h, height); py += 2) {
      for (let px = x; px < Math.min(x + w, width); px += 2) {
        const pixelIndex = (py * width + px) * 4;
        const r = data[pixelIndex];
        const g = data[pixelIndex + 1];
        const b = data[pixelIndex + 2];
        
        avgR += r;
        avgG += g;
        avgB += b;
        totalPixels++;
        
        // Simple skin tone detection
        if (this.isSkinTone(r, g, b)) {
          skinTonePixels++;
        }
      }
    }
    
    if (totalPixels === 0) return 0;
    
    const skinRatio = skinTonePixels / totalPixels;
    
    // Face-like skin tone ratio should be 0.3-0.8
    if (skinRatio < 0.2 || skinRatio > 0.9) return 0;
    
    return Math.min(1, skinRatio * 1.5);
  }

  private isSkinTone(r: number, g: number, b: number): boolean {
    // Simplified skin tone detection
    return r > 95 && g > 40 && b > 20 && 
           r > g && r > b && 
           Math.abs(r - g) > 15 && 
           r - b > 15;
  }

  private mergeOverlappingRegions(regions: Array<{ x: number; y: number; width: number; height: number; confidence: number }>): Array<{ x: number; y: number; width: number; height: number; confidence: number }> {
    // Simplified merging - just return top 5 by confidence
    return regions.sort((a, b) => b.confidence - a.confidence).slice(0, 5);
  }

  private calculateBackgroundComplexity(data: Buffer, width: number, height: number): number {
    let edgeCount = 0;
    let totalChecks = 0;
    
    // Sample edges throughout the image
    for (let y = 2; y < height - 2; y += 8) {
      for (let x = 2; x < width - 2; x += 8) {
        const edgeStrength = this.calculateEdgeStrength(data, width, height, x, y);
        if (edgeStrength > 30) edgeCount++;
        totalChecks++;
      }
    }
    
    return totalChecks > 0 ? (edgeCount / totalChecks) * 100 : 0;
  }

  private calculateForegroundFocus(data: Buffer, width: number, height: Number): number {
    // Analyze sharpness in center vs edges
    const centerSharpness = this.calculateRegionSharpness(data, width, height, width * 0.25, height * 0.25, width * 0.5, height * 0.5);
    const edgeSharpness = (
      this.calculateRegionSharpness(data, width, height, 0, 0, width * 0.25, height) +
      this.calculateRegionSharpness(data, width, height, width * 0.75, 0, width * 0.25, height) +
      this.calculateRegionSharpness(data, width, height, width * 0.25, 0, width * 0.5, height * 0.25) +
      this.calculateRegionSharpness(data, width, height, width * 0.25, height * 0.75, width * 0.5, height * 0.25)
    ) / 4;
    
    const focusRatio = edgeSharpness > 0 ? centerSharpness / edgeSharpness : 1;
    return Math.min(100, Math.max(0, (focusRatio - 0.5) * 100));
  }

  private estimateDepthOfField(data: Buffer, width: number, height: number): number {
    // Calculate variance in sharpness across the image
    const regions = [];
    const regionSize = Math.min(width, height) / 8;
    
    for (let y = 0; y < height - regionSize; y += regionSize) {
      for (let x = 0; x < width - regionSize; x += regionSize) {
        const sharpness = this.calculateRegionSharpness(data, width, height, x, y, regionSize, regionSize);
        regions.push(sharpness);
      }
    }
    
    if (regions.length === 0) return 50;
    
    const mean = regions.reduce((sum, val) => sum + val, 0) / regions.length;
    const variance = regions.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / regions.length;
    
    // Higher variance = more depth of field variation
    return Math.min(100, variance / 10);
  }

  private detectTextRegions(data: Buffer, width: number, height: number): Array<{ x: number; y: number; width: number; height: number; text_confidence: number }> {
    const textRegions: Array<{ x: number; y: number; width: number; height: number; text_confidence: number }> = [];
    const blockSize = 48;
    
    for (let y = 0; y < height - blockSize; y += blockSize / 2) {
      for (let x = 0; x < width - blockSize; x += blockSize / 2) {
        const textScore = this.calculateTextLikelihood(data, width, height, x, y, blockSize, blockSize);
        if (textScore > 0.5) {
          textRegions.push({
            x, y, width: blockSize, height: blockSize,
            text_confidence: textScore * 100
          });
        }
      }
    }
    
    return textRegions.slice(0, 10); // Top 10 text regions
  }

  private calculateTextLikelihood(data: Buffer, width: number, height: number, x: number, y: number, w: number, h: number): number {
    // Look for horizontal edges (text-like patterns)
    let horizontalEdges = 0;
    let verticalEdges = 0;
    let totalEdges = 0;
    
    for (let py = y + 1; py < Math.min(y + h - 1, height - 1); py += 2) {
      for (let px = x + 1; px < Math.min(x + w - 1, width - 1); px += 2) {
        const edgeH = this.getHorizontalEdgeStrength(data, width, height, px, py);
        const edgeV = this.getVerticalEdgeStrength(data, width, height, px, py);
        
        if (edgeH > 20) horizontalEdges++;
        if (edgeV > 20) verticalEdges++;
        if (edgeH > 20 || edgeV > 20) totalEdges++;
      }
    }
    
    if (totalEdges === 0) return 0;
    
    // Text typically has more horizontal edges
    const horizontalRatio = horizontalEdges / totalEdges;
    return horizontalRatio > 0.6 ? horizontalRatio : 0;
  }

  private analyzeMotionBlurPatterns(data: Buffer, width: number, height: number): number {
    let blurScore = 0;
    let samples = 0;
    
    // Look for motion blur patterns
    for (let y = 5; y < height - 5; y += 10) {
      for (let x = 5; x < width - 5; x += 10) {
        const blur = this.detectMotionBlurAtPoint(data, width, height, x, y);
        blurScore += blur;
        samples++;
      }
    }
    
    return samples > 0 ? (blurScore / samples) * 100 : 0;
  }

  private detectCameraMovementPatterns(data: Buffer, width: number, height: number): {
    detected: boolean;
    type?: 'pan' | 'tilt' | 'zoom' | 'dolly' | 'shake';
    intensity: number;
  } {
    // Simplified camera movement detection
    // In practice, this would require frame comparison
    
    const edgePattern = this.analyzeEdgePatterns(data, width, height);
    
    if (edgePattern.dominantDirection !== null) {
      return {
        detected: true,
        type: edgePattern.dominantDirection < 45 || edgePattern.dominantDirection > 135 ? 'pan' : 'tilt',
        intensity: edgePattern.strength
      };
    }
    
    return {
      detected: false,
      intensity: 0
    };
  }

  private calculateEdgeIntensity(data: Buffer, width: number, height: number): number {
    let totalEdgeStrength = 0;
    let edgeCount = 0;
    
    for (let y = 1; y < height - 1; y += 4) {
      for (let x = 1; x < width - 1; x += 4) {
        const edgeStrength = this.calculateEdgeStrength(data, width, height, x, y);
        totalEdgeStrength += edgeStrength;
        edgeCount++;
      }
    }
    
    return edgeCount > 0 ? (totalEdgeStrength / edgeCount) / 2.55 : 0;
  }

  private approximateMotionVectors(data: Buffer, width: number, height: number): Array<{ x: number; y: number; magnitude: number; angle: number }> {
    // Simplified motion vector approximation
    const vectors: Array<{ x: number; y: number; magnitude: number; angle: number }> = [];
    const gridSize = 64;
    
    for (let y = 0; y < height - gridSize; y += gridSize) {
      for (let x = 0; x < width - gridSize; x += gridSize) {
        const vector = this.calculateRegionMotionVector(data, width, height, x, y, gridSize);
        if (vector.magnitude > 10) {
          vectors.push({ x, y, ...vector });
        }
      }
    }
    
    return vectors.slice(0, 20); // Top 20 motion vectors
  }

  // Additional helper methods would continue here...
  private calculateEdgeStrength(data: Buffer, width: number, height: number, x: number, y: number): number {
    // Sobel edge detection (simplified version from previous implementation)
    if (x <= 0 || x >= width - 1 || y <= 0 || y >= height - 1) return 0;

    const getPixelLuminance = (px: number, py: number): number => {
      const index = (py * width + px) * 4;
      return 0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2];
    };

    const sobelX = [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]];
    const sobelY = [[-1, -2, -1], [0, 0, 0], [1, 2, 1]];

    let gx = 0, gy = 0;
    for (let ky = -1; ky <= 1; ky++) {
      for (let kx = -1; kx <= 1; kx++) {
        const pixel = getPixelLuminance(x + kx, y + ky);
        gx += pixel * sobelX[ky + 1][kx + 1];
        gy += pixel * sobelY[ky + 1][kx + 1];
      }
    }

    return Math.sqrt(gx * gx + gy * gy);
  }

  private calculateRegionSharpness(data: Buffer, width: number, height: number, x: number, y: number, w: number, h: number): number {
    let totalEdgeStrength = 0;
    let pixelCount = 0;
    
    for (let py = Math.max(1, y); py < Math.min(y + h - 1, height - 1); py += 2) {
      for (let px = Math.max(1, x); px < Math.min(x + w - 1, width - 1); px += 2) {
        const edgeStrength = this.calculateEdgeStrength(data, width, height, px, py);
        totalEdgeStrength += edgeStrength;
        pixelCount++;
      }
    }
    
    return pixelCount > 0 ? totalEdgeStrength / pixelCount : 0;
  }

  private getHorizontalEdgeStrength(data: Buffer, width: number, height: number, x: number, y: number): number {
    const getPixelLuminance = (px: number, py: number): number => {
      const index = (py * width + px) * 4;
      return 0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2];
    };

    const top = getPixelLuminance(x, y - 1);
    const bottom = getPixelLuminance(x, y + 1);
    return Math.abs(bottom - top);
  }

  private getVerticalEdgeStrength(data: Buffer, width: number, height: number, x: number, y: number): number {
    const getPixelLuminance = (px: number, py: number): number => {
      const index = (py * width + px) * 4;
      return 0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2];
    };

    const left = getPixelLuminance(x - 1, y);
    const right = getPixelLuminance(x + 1, y);
    return Math.abs(right - left);
  }

  private detectMotionBlurAtPoint(data: Buffer, width: number, height: number, x: number, y: number): number {
    // Check for directional blur patterns
    let maxBlur = 0;
    const directions = [0, 45, 90, 135]; // Check 4 directions
    
    for (const angle of directions) {
      const blur = this.calculateDirectionalBlur(data, width, height, x, y, angle);
      maxBlur = Math.max(maxBlur, blur);
    }
    
    return maxBlur;
  }

  private calculateDirectionalBlur(data: Buffer, width: number, height: number, x: number, y: number, angle: number): number {
    // Simplified directional blur detection
    const dx = Math.cos(angle * Math.PI / 180);
    const dy = Math.sin(angle * Math.PI / 180);
    
    let totalDiff = 0;
    let samples = 0;
    
    for (let dist = 1; dist <= 5; dist++) {
      const x1 = Math.round(x + dx * dist);
      const y1 = Math.round(y + dy * dist);
      const x2 = Math.round(x - dx * dist);
      const y2 = Math.round(y - dy * dist);
      
      if (x1 >= 0 && x1 < width && y1 >= 0 && y1 < height &&
          x2 >= 0 && x2 < width && y2 >= 0 && y2 < height) {
        
        const lum1 = this.getPixelLuminance(data, width, x1, y1);
        const lum2 = this.getPixelLuminance(data, width, x2, y2);
        totalDiff += Math.abs(lum1 - lum2);
        samples++;
      }
    }
    
    return samples > 0 ? totalDiff / samples : 0;
  }

  private getPixelLuminance(data: Buffer, width: number, x: number, y: number): number {
    const index = (y * width + x) * 4;
    return 0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2];
  }

  private analyzeEdgePatterns(data: Buffer, width: number, height: number): { dominantDirection: number | null; strength: number } {
    const directionBins = new Array(8).fill(0); // 8 direction bins (45° each)
    let totalStrength = 0;
    
    for (let y = 1; y < height - 1; y += 4) {
      for (let x = 1; x < width - 1; x += 4) {
        const edgeAngle = this.calculateEdgeAngle(data, width, height, x, y);
        const edgeStrength = this.calculateEdgeStrength(data, width, height, x, y);
        
        if (edgeStrength > 30) {
          const binIndex = Math.floor((edgeAngle + 180) / 45) % 8;
          directionBins[binIndex] += edgeStrength;
          totalStrength += edgeStrength;
        }
      }
    }
    
    if (totalStrength === 0) return { dominantDirection: null, strength: 0 };
    
    // Find dominant direction
    let maxBin = 0;
    let maxValue = directionBins[0];
    for (let i = 1; i < 8; i++) {
      if (directionBins[i] > maxValue) {
        maxValue = directionBins[i];
        maxBin = i;
      }
    }
    
    const dominantDirection = (maxBin * 45) - 180;
    const strength = (maxValue / totalStrength) * 100;
    
    return { dominantDirection, strength };
  }

  private calculateEdgeAngle(data: Buffer, width: number, height: number, x: number, y: number): number {
    const getPixelLuminance = (px: number, py: number): number => {
      const index = (py * width + px) * 4;
      return 0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2];
    };

    const gx = getPixelLuminance(x + 1, y) - getPixelLuminance(x - 1, y);
    const gy = getPixelLuminance(x, y + 1) - getPixelLuminance(x, y - 1);

    return Math.atan2(gy, gx) * 180 / Math.PI;
  }

  private calculateRegionMotionVector(data: Buffer, width: number, height: number, x: number, y: number, size: number): { magnitude: number; angle: number } {
    // Simplified motion vector calculation
    // This would typically require comparison with previous frame
    
    const centerLum = this.getPixelLuminance(data, width, x + size/2, y + size/2);
    let maxDiff = 0;
    let bestAngle = 0;
    
    // Check 8 directions around the center
    for (let angle = 0; angle < 360; angle += 45) {
      const dx = Math.cos(angle * Math.PI / 180) * size / 4;
      const dy = Math.sin(angle * Math.PI / 180) * size / 4;
      
      const testX = Math.round(x + size/2 + dx);
      const testY = Math.round(y + size/2 + dy);
      
      if (testX >= 0 && testX < width && testY >= 0 && testY < height) {
        const testLum = this.getPixelLuminance(data, width, testX, testY);
        const diff = Math.abs(testLum - centerLum);
        
        if (diff > maxDiff) {
          maxDiff = diff;
          bestAngle = angle;
        }
      }
    }
    
    return { magnitude: maxDiff / 10, angle: bestAngle };
  }

  private analyzeLightingType(data: Buffer, width: number, height: number): 'natural' | 'artificial' | 'mixed' | 'low_light' {
    let totalLuminance = 0;
    let pixelCount = 0;
    let warmPixels = 0;
    let coolPixels = 0;
    
    // Sample pixels throughout the image
    for (let y = 0; y < height; y += 8) {
      for (let x = 0; x < width; x += 8) {
        const pixelIndex = (y * width + x) * 4;
        const r = data[pixelIndex];
        const g = data[pixelIndex + 1];
        const b = data[pixelIndex + 2];
        
        const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
        totalLuminance += luminance;
        pixelCount++;
        
        // Check color temperature
        if (r > b + 10) warmPixels++; // Warm light
        else if (b > r + 10) coolPixels++; // Cool light
      }
    }
    
    const avgLuminance = totalLuminance / pixelCount;
    const warmRatio = warmPixels / pixelCount;
    const coolRatio = coolPixels / pixelCount;
    
    if (avgLuminance < 50) return 'low_light';
    if (Math.abs(warmRatio - coolRatio) < 0.1) return 'mixed';
    if (warmRatio > coolRatio) return 'artificial'; // Tungsten/warm artificial
    return 'natural'; // Daylight/cool natural
  }

  private determineSettingType(data: Buffer, width: number, height: number): 'indoor' | 'outdoor' | 'studio' | 'unknown' {
    // Simplified setting detection based on color distribution and lighting
    const skyBluePixels = this.countSkyBluePixels(data, width, height);
    const uniformityScore = this.calculateColorUniformity(data, width, height);
    
    if (skyBluePixels > 0.1) return 'outdoor'; // Likely sky visible
    if (uniformityScore > 0.8) return 'studio'; // Very uniform lighting
    
    // Check top portion for indoor ceiling indicators
    const topUniformity = this.calculateRegionUniformity(data, width, height, 0, 0, width, height * 0.3);
    if (topUniformity > 0.7) return 'indoor';
    
    return 'unknown';
  }

  private estimateTimeOfDay(data: Buffer, width: number, height: number): 'morning' | 'day' | 'evening' | 'night' | 'unknown' {
    let totalLuminance = 0;
    let warmPixels = 0;
    let pixelCount = 0;
    
    for (let y = 0; y < height; y += 16) {
      for (let x = 0; x < width; x += 16) {
        const pixelIndex = (y * width + x) * 4;
        const r = data[pixelIndex];
        const g = data[pixelIndex + 1];
        const b = data[pixelIndex + 2];
        
        const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
        totalLuminance += luminance;
        pixelCount++;
        
        if (r > g && r > b && (r - b) > 20) warmPixels++;
      }
    }
    
    const avgLuminance = totalLuminance / pixelCount;
    const warmRatio = warmPixels / pixelCount;
    
    if (avgLuminance < 30) return 'night';
    if (avgLuminance > 200) return 'day';
    if (warmRatio > 0.3) return 'evening'; // Warm sunset/sunrise light
    if (avgLuminance > 100) return 'morning';
    
    return 'unknown';
  }

  private detectWeatherIndicators(data: Buffer, width: number, height: number): string[] {
    const indicators: string[] = [];
    
    // Check for fog/haze (low contrast)
    const contrast = this.calculateImageContrast(data, width, height);
    if (contrast < 30) indicators.push('fog/haze');
    
    // Check for rain patterns (not reliable from single frame)
    // Would need motion analysis for proper rain detection
    
    return indicators;
  }

  private countSkyBluePixels(data: Buffer, width: number, height: number): number {
    let skyPixels = 0;
    let totalPixels = 0;
    
    // Check top portion of image for sky
    for (let y = 0; y < Math.min(height * 0.5, height); y += 4) {
      for (let x = 0; x < width; x += 4) {
        const pixelIndex = (y * width + x) * 4;
        const r = data[pixelIndex];
        const g = data[pixelIndex + 1];
        const b = data[pixelIndex + 2];
        
        // Sky blue detection
        if (b > r && b > g && b > 100 && (b - r) > 30) {
          skyPixels++;
        }
        totalPixels++;
      }
    }
    
    return totalPixels > 0 ? skyPixels / totalPixels : 0;
  }

  private calculateColorUniformity(data: Buffer, width: number, height: number): number {
    let totalR = 0, totalG = 0, totalB = 0;
    let pixelCount = 0;
    
    // Calculate average color
    for (let i = 0; i < data.length; i += 16) { // Sample every 4th pixel
      totalR += data[i];
      totalG += data[i + 1];
      totalB += data[i + 2];
      pixelCount++;
    }
    
    const avgR = totalR / pixelCount;
    const avgG = totalG / pixelCount;
    const avgB = totalB / pixelCount;
    
    // Calculate variance from average
    let variance = 0;
    for (let i = 0; i < data.length; i += 16) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      
      variance += Math.pow(r - avgR, 2) + Math.pow(g - avgG, 2) + Math.pow(b - avgB, 2);
    }
    
    variance = variance / (pixelCount * 3);
    
    // Convert to uniformity score (lower variance = higher uniformity)
    return Math.max(0, Math.min(1, 1 - (variance / 10000)));
  }

  private calculateRegionUniformity(data: Buffer, width: number, height: number, x: number, y: number, w: number, h: number): number {
    let totalR = 0, totalG = 0, totalB = 0;
    let pixelCount = 0;
    
    for (let py = y; py < Math.min(y + h, height); py += 4) {
      for (let px = x; px < Math.min(x + w, width); px += 4) {
        const pixelIndex = (py * width + px) * 4;
        totalR += data[pixelIndex];
        totalG += data[pixelIndex + 1];
        totalB += data[pixelIndex + 2];
        pixelCount++;
      }
    }
    
    if (pixelCount === 0) return 0;
    
    const avgR = totalR / pixelCount;
    const avgG = totalG / pixelCount;
    const avgB = totalB / pixelCount;
    
    let variance = 0;
    pixelCount = 0;
    for (let py = y; py < Math.min(y + h, height); py += 4) {
      for (let px = x; px < Math.min(x + w, width); px += 4) {
        const pixelIndex = (py * width + px) * 4;
        const r = data[pixelIndex];
        const g = data[pixelIndex + 1];
        const b = data[pixelIndex + 2];
        
        variance += Math.pow(r - avgR, 2) + Math.pow(g - avgG, 2) + Math.pow(b - avgB, 2);
        pixelCount++;
      }
    }
    
    variance = variance / (pixelCount * 3);
    return Math.max(0, Math.min(1, 1 - (variance / 5000)));
  }

  private calculateImageContrast(data: Buffer, width: number, height: number): number {
    const luminances: number[] = [];
    
    for (let i = 0; i < data.length; i += 16) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
      luminances.push(luminance);
    }
    
    const mean = luminances.reduce((sum, l) => sum + l, 0) / luminances.length;
    const variance = luminances.reduce((sum, l) => sum + Math.pow(l - mean, 2), 0) / luminances.length;
    
    return Math.sqrt(variance); // Standard deviation as contrast measure
  }

  private calculateClassificationConfidence(shotConfidence: number, sceneConfidence: number, motionConfidence: number): number {
    // Weighted average of individual confidences
    return (shotConfidence * 0.4 + sceneConfidence * 0.4 + motionConfidence * 0.2) / 100;
  }
}

export const sceneClassifier = SceneClassifier.getInstance();