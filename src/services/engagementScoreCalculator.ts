import sharp from 'sharp';
import { compositionAnalyzer } from './compositionAnalyzer';
import { technicalQualityAnalyzer } from './technicalQualityAnalyzer';
import { sceneClassifier, SceneType, ShotType, MotionLevel } from './sceneClassifier';

export interface EngagementFactors {
  visual_interest: number; // 0-100
  emotional_appeal: number; // 0-100
  human_presence: number; // 0-100
  action_intensity: number; // 0-100
  color_appeal: number; // 0-100
  composition_strength: number; // 0-100
  technical_quality: number; // 0-100
  scene_type_appeal: number; // 0-100
}

export interface EngagementAnalysis {
  overall_engagement_score: number; // 0-100
  engagement_factors: EngagementFactors;
  engagement_details: {
    visual_interest: {
      complexity_score: number;
      contrast_appeal: number;
      focal_point_strength: number;
      visual_novelty: number;
    };
    emotional_appeal: {
      color_emotion_score: number;
      lighting_mood_score: number;
      intimacy_level: number;
      energy_level: number;
    };
    human_interest: {
      face_appeal: number;
      gesture_indicators: number;
      eye_contact_potential: number;
      social_context: number;
    };
    action_dynamics: {
      motion_excitement: number;
      camera_dynamics: number;
      scene_energy: number;
      tension_indicators: number;
    };
  };
  engagement_predictions: {
    attention_grabbing: number; // 0-100 - How likely to capture initial attention
    retention_potential: number; // 0-100 - How likely to keep viewer engaged
    emotional_impact: number; // 0-100 - How emotionally compelling
    shareability: number; // 0-100 - How likely to be shared/remembered
  };
  target_audience_appeal: {
    general_audience: number; // 0-100
    social_media: number; // 0-100
    professional: number; // 0-100
    artistic: number; // 0-100
  };
  confidence_score: number; // 0-1
}

export interface VisualInterestMetrics {
  entropy: number;
  edge_density: number;
  color_diversity: number;
  contrast_variation: number;
  pattern_complexity: number;
}

export class EngagementScoreCalculator {
  private static instance: EngagementScoreCalculator;

  private constructor() {}

  public static getInstance(): EngagementScoreCalculator {
    if (!EngagementScoreCalculator.instance) {
      EngagementScoreCalculator.instance = new EngagementScoreCalculator();
    }
    return EngagementScoreCalculator.instance;
  }

  /**
   * Calculate comprehensive engagement score for a video frame
   */
  async calculateEngagementScore(imagePath: string): Promise<EngagementAnalysis> {
    // Get analysis from other services
    const [compositionAnalysis, technicalAnalysis, sceneAnalysis] = await Promise.all([
      compositionAnalyzer.analyzeComposition(imagePath),
      technicalQualityAnalyzer.analyzeTechnicalQuality(imagePath),
      sceneClassifier.classifyScene(imagePath)
    ]);

    // Load image for detailed engagement analysis
    const image = sharp(imagePath);
    const metadata = await image.metadata();
    
    if (!metadata.width || !metadata.height) {
      throw new Error('Could not determine image dimensions');
    }

    const { data } = await image.raw().ensureAlpha().toBuffer({ resolveWithObject: true });

    // Calculate engagement factors
    const visualInterest = await this.calculateVisualInterest(data, metadata.width, metadata.height, compositionAnalysis);
    const emotionalAppeal = await this.calculateEmotionalAppeal(data, metadata.width, metadata.height, sceneAnalysis);
    const humanPresence = await this.calculateHumanPresence(sceneAnalysis, compositionAnalysis);
    const actionIntensity = await this.calculateActionIntensity(sceneAnalysis, technicalAnalysis);
    const colorAppeal = await this.calculateColorAppeal(data, metadata.width, metadata.height);
    const compositionStrength = this.calculateCompositionStrength(compositionAnalysis);
    const technicalQuality = this.calculateTechnicalQuality(technicalAnalysis);
    const sceneTypeAppeal = this.calculateSceneTypeAppeal(sceneAnalysis);

    // Calculate overall engagement score
    const engagementFactors: EngagementFactors = {
      visual_interest: visualInterest.score,
      emotional_appeal: emotionalAppeal.score,
      human_presence: humanPresence.score,
      action_intensity: actionIntensity.score,
      color_appeal: colorAppeal.score,
      composition_strength: compositionStrength,
      technical_quality: technicalQuality,
      scene_type_appeal: sceneTypeAppeal
    };

    const overallScore = this.calculateOverallEngagementScore(engagementFactors);

    // Calculate engagement predictions
    const predictions = this.calculateEngagementPredictions(engagementFactors, sceneAnalysis);

    // Calculate target audience appeal
    const audienceAppeal = this.calculateAudienceAppeal(engagementFactors, sceneAnalysis);

    // Calculate confidence score
    const confidence = this.calculateEngagementConfidence(
      compositionAnalysis.analysis_confidence,
      technicalAnalysis.analysis_confidence,
      sceneAnalysis.classification_confidence
    );

    return {
      overall_engagement_score: overallScore,
      engagement_factors: engagementFactors,
      engagement_details: {
        visual_interest: visualInterest.details,
        emotional_appeal: emotionalAppeal.details,
        human_interest: humanPresence.details,
        action_dynamics: actionIntensity.details
      },
      engagement_predictions: predictions,
      target_audience_appeal: audienceAppeal,
      confidence_score: confidence
    };
  }

  /**
   * Calculate visual interest score
   */
  private async calculateVisualInterest(
    data: Buffer,
    width: number,
    height: number,
    compositionAnalysis: any
  ): Promise<{
    score: number;
    details: {
      complexity_score: number;
      contrast_appeal: number;
      focal_point_strength: number;
      visual_novelty: number;
    };
  }> {
    // Calculate visual complexity
    const complexity = this.calculateVisualComplexity(data, width, height);
    
    // Calculate contrast appeal
    const contrastAppeal = this.calculateContrastAppeal(data, width, height);
    
    // Get focal point strength from composition analysis
    const focalPointStrength = compositionAnalysis.scores.focal_point_strength;
    
    // Calculate visual novelty
    const visualNovelty = this.calculateVisualNovelty(data, width, height);
    
    // Combine scores
    const visualInterestScore = (
      complexity * 0.3 +
      contrastAppeal * 0.25 +
      focalPointStrength * 0.25 +
      visualNovelty * 0.2
    );

    return {
      score: Math.min(100, Math.max(0, visualInterestScore)),
      details: {
        complexity_score: complexity,
        contrast_appeal: contrastAppeal,
        focal_point_strength: focalPointStrength,
        visual_novelty: visualNovelty
      }
    };
  }

  /**
   * Calculate emotional appeal score
   */
  private async calculateEmotionalAppeal(
    data: Buffer,
    width: number,
    height: number,
    sceneAnalysis: any
  ): Promise<{
    score: number;
    details: {
      color_emotion_score: number;
      lighting_mood_score: number;
      intimacy_level: number;
      energy_level: number;
    };
  }> {
    // Calculate color emotional impact
    const colorEmotionScore = this.calculateColorEmotionalImpact(data, width, height);
    
    // Calculate lighting mood
    const lightingMoodScore = this.calculateLightingMood(data, width, height, sceneAnalysis.scene_context);
    
    // Calculate intimacy level based on shot type
    const intimacyLevel = this.calculateIntimacyLevel(sceneAnalysis.shot_type, sceneAnalysis.visual_features);
    
    // Calculate energy level
    const energyLevel = this.calculateEnergyLevel(sceneAnalysis.motion_level, colorEmotionScore);
    
    // Combine scores
    const emotionalAppealScore = (
      colorEmotionScore * 0.3 +
      lightingMoodScore * 0.25 +
      intimacyLevel * 0.25 +
      energyLevel * 0.2
    );

    return {
      score: Math.min(100, Math.max(0, emotionalAppealScore)),
      details: {
        color_emotion_score: colorEmotionScore,
        lighting_mood_score: lightingMoodScore,
        intimacy_level: intimacyLevel,
        energy_level: energyLevel
      }
    };
  }

  /**
   * Calculate human presence score
   */
  private async calculateHumanPresence(
    sceneAnalysis: any,
    compositionAnalysis: any
  ): Promise<{
    score: number;
    details: {
      face_appeal: number;
      gesture_indicators: number;
      eye_contact_potential: number;
      social_context: number;
    };
  }> {
    // Calculate face appeal based on detected faces
    const faceAppeal = this.calculateFaceAppeal(sceneAnalysis.visual_features.face_regions);
    
    // Estimate gesture indicators
    const gestureIndicators = this.calculateGestureIndicators(sceneAnalysis);
    
    // Calculate eye contact potential
    const eyeContactPotential = this.calculateEyeContactPotential(sceneAnalysis);
    
    // Calculate social context score
    const socialContext = this.calculateSocialContext(sceneAnalysis.visual_features.subject_count, sceneAnalysis.primary_scene_type);
    
    // Combine scores
    const humanPresenceScore = (
      faceAppeal * 0.4 +
      gestureIndicators * 0.2 +
      eyeContactPotential * 0.2 +
      socialContext * 0.2
    );

    return {
      score: Math.min(100, Math.max(0, humanPresenceScore)),
      details: {
        face_appeal: faceAppeal,
        gesture_indicators: gestureIndicators,
        eye_contact_potential: eyeContactPotential,
        social_context: socialContext
      }
    };
  }

  /**
   * Calculate action intensity score
   */
  private async calculateActionIntensity(
    sceneAnalysis: any,
    technicalAnalysis: any
  ): Promise<{
    score: number;
    details: {
      motion_excitement: number;
      camera_dynamics: number;
      scene_energy: number;
      tension_indicators: number;
    };
  }> {
    // Calculate motion excitement
    const motionExcitement = this.calculateMotionExcitement(sceneAnalysis.motion_level, sceneAnalysis.motion_features);
    
    // Calculate camera dynamics
    const cameraDynamics = this.calculateCameraDynamics(sceneAnalysis.motion_features.camera_movement);
    
    // Calculate scene energy
    const sceneEnergy = this.calculateSceneEnergy(sceneAnalysis.primary_scene_type, sceneAnalysis.motion_level);
    
    // Calculate tension indicators
    const tensionIndicators = this.calculateTensionIndicators(technicalAnalysis, sceneAnalysis);
    
    // Combine scores
    const actionIntensityScore = (
      motionExcitement * 0.35 +
      cameraDynamics * 0.25 +
      sceneEnergy * 0.25 +
      tensionIndicators * 0.15
    );

    return {
      score: Math.min(100, Math.max(0, actionIntensityScore)),
      details: {
        motion_excitement: motionExcitement,
        camera_dynamics: cameraDynamics,
        scene_energy: sceneEnergy,
        tension_indicators: tensionIndicators
      }
    };
  }

  /**
   * Calculate color appeal score
   */
  private async calculateColorAppeal(data: Buffer, width: number, height: number): Promise<number> {
    let totalSaturation = 0;
    let vibrantPixels = 0;
    let harmonicPixels = 0;
    let pixelCount = 0;
    
    // Sample pixels for color analysis
    for (let i = 0; i < data.length; i += 16) { // Every 4th pixel
      const r = data[i] / 255;
      const g = data[i + 1] / 255;
      const b = data[i + 2] / 255;
      
      const hsv = this.rgbToHsv(r * 255, g * 255, b * 255);
      totalSaturation += hsv.s;
      
      // Count vibrant pixels (high saturation, good brightness)
      if (hsv.s > 0.6 && hsv.v > 0.3 && hsv.v < 0.9) vibrantPixels++;
      
      // Count harmonic colors (pleasing hue ranges)
      if (this.isHarmonicColor(hsv.h)) harmonicPixels++;
      
      pixelCount++;
    }
    
    const avgSaturation = totalSaturation / pixelCount;
    const vibrantRatio = vibrantPixels / pixelCount;
    const harmonicRatio = harmonicPixels / pixelCount;
    
    // Calculate appeal score
    let colorAppealScore = 50; // Base score
    
    // Boost for good saturation
    colorAppealScore += Math.min(30, avgSaturation * 50);
    
    // Boost for vibrant pixels
    colorAppealScore += vibrantRatio * 30;
    
    // Boost for harmonic colors
    colorAppealScore += harmonicRatio * 20;
    
    return Math.min(100, Math.max(0, colorAppealScore));
  }

  /**
   * Helper methods for engagement calculations
   */
  private calculateVisualComplexity(data: Buffer, width: number, height: Number): number {
    // Calculate information entropy and edge density
    let totalEdges = 0;
    let edgeCount = 0;
    
    // Sample edges throughout the image
    for (let y = 2; y < height - 2; y += 4) {
      for (let x = 2; x < width - 2; x += 4) {
        const edgeStrength = this.calculateEdgeStrength(data, width, height, x, y);
        if (edgeStrength > 20) {
          totalEdges += edgeStrength;
          edgeCount++;
        }
      }
    }
    
    const avgEdgeStrength = edgeCount > 0 ? totalEdges / edgeCount : 0;
    const edgeDensity = edgeCount / ((width * height) / 16);
    
    // Balance complexity: moderate complexity is more appealing than too high or too low
    const complexityScore = Math.min(100, (avgEdgeStrength / 5) + (edgeDensity * 200));
    
    // Apply curve: peak appeal around 60-70 complexity
    if (complexityScore < 50) {
      return complexityScore * 1.2;
    } else if (complexityScore > 80) {
      return 80 + (complexityScore - 80) * 0.5;
    }
    
    return complexityScore;
  }

  private calculateContrastAppeal(data: Buffer, width: number, height: number): number {
    const luminances: number[] = [];
    
    // Sample luminance values
    for (let i = 0; i < data.length; i += 16) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
      luminances.push(luminance);
    }
    
    // Calculate standard deviation (contrast measure)
    const mean = luminances.reduce((sum, l) => sum + l, 0) / luminances.length;
    const variance = luminances.reduce((sum, l) => sum + Math.pow(l - mean, 2), 0) / luminances.length;
    const stdDev = Math.sqrt(variance);
    
    // Optimal contrast range: 40-80 std dev
    let contrastScore = 0;
    if (stdDev < 20) {
      contrastScore = stdDev * 2; // Too low contrast
    } else if (stdDev > 100) {
      contrastScore = 100 - (stdDev - 100) * 0.3; // Too high contrast
    } else {
      contrastScore = 40 + (stdDev - 20) * 0.75; // Good contrast range
    }
    
    return Math.min(100, Math.max(0, contrastScore));
  }

  private calculateVisualNovelty(data: Buffer, width: number, height: number): number {
    // Detect unusual patterns or compositions
    let noveltyScore = 50; // Base score
    
    // Check for unusual color combinations
    const colorUniqueness = this.calculateColorUniqueness(data);
    noveltyScore += colorUniqueness * 20;
    
    // Check for interesting patterns
    const patternComplexity = this.calculatePatternComplexity(data, width, height);
    noveltyScore += patternComplexity * 15;
    
    // Check for asymmetric compositions (can be more interesting)
    const asymmetryScore = this.calculateAsymmetryScore(data, width, height);
    noveltyScore += asymmetryScore * 15;
    
    return Math.min(100, Math.max(0, noveltyScore));
  }

  private calculateColorEmotionalImpact(data: Buffer, width: number, height: number): number {
    let warmPixels = 0;
    let coolPixels = 0;
    let vibrantPixels = 0;
    let pixelCount = 0;
    
    for (let i = 0; i < data.length; i += 16) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      
      const hsv = this.rgbToHsv(r, g, b);
      
      // Categorize colors by emotional impact
      if (hsv.h >= 0 && hsv.h < 60 || hsv.h >= 300) warmPixels++; // Reds, oranges, magentas
      else if (hsv.h >= 180 && hsv.h < 300) coolPixels++; // Blues, cyans, purples
      
      if (hsv.s > 0.7 && hsv.v > 0.4) vibrantPixels++; // High emotional impact colors
      
      pixelCount++;
    }
    
    const warmRatio = warmPixels / pixelCount;
    const coolRatio = coolPixels / pixelCount;
    const vibrantRatio = vibrantPixels / pixelCount;
    
    // Calculate emotional impact
    let emotionalScore = 40; // Base score
    
    // Warm colors are generally more emotionally engaging
    emotionalScore += warmRatio * 35;
    
    // Cool colors provide calm appeal
    emotionalScore += coolRatio * 25;
    
    // Vibrant colors increase emotional impact
    emotionalScore += vibrantRatio * 40;
    
    return Math.min(100, Math.max(0, emotionalScore));
  }

  private calculateLightingMood(data: Buffer, width: number, height: number, sceneContext: any): number {
    let moodScore = 50;
    
    // Adjust based on lighting type
    switch (sceneContext.lighting_type) {
      case 'natural':
        moodScore += 15; // Natural light is generally appealing
        break;
      case 'artificial':
        moodScore += 5; // Can be appealing but less than natural
        break;
      case 'mixed':
        moodScore += 10; // Interesting lighting combination
        break;
      case 'low_light':
        moodScore += 20; // Can be very moody and engaging
        break;
    }
    
    // Adjust based on time of day
    switch (sceneContext.time_of_day) {
      case 'morning':
        moodScore += 10; // Fresh, optimistic
        break;
      case 'day':
        moodScore += 5; // Clear, straightforward
        break;
      case 'evening':
        moodScore += 20; // Golden hour, romantic
        break;
      case 'night':
        moodScore += 15; // Dramatic, mysterious
        break;
    }
    
    return Math.min(100, Math.max(0, moodScore));
  }

  private calculateIntimacyLevel(shotType: ShotType, visualFeatures: any): number {
    let intimacyScore = 20; // Base score
    
    // Shot type affects intimacy
    switch (shotType) {
      case ShotType.EXTREME_CLOSE_UP:
        intimacyScore = 95;
        break;
      case ShotType.CLOSE_UP:
        intimacyScore = 85;
        break;
      case ShotType.MEDIUM_CLOSE_UP:
        intimacyScore = 70;
        break;
      case ShotType.MEDIUM_SHOT:
        intimacyScore = 55;
        break;
      case ShotType.WIDE_SHOT:
        intimacyScore = 30;
        break;
      case ShotType.EXTREME_WIDE_SHOT:
        intimacyScore = 15;
        break;
    }
    
    // Adjust for face presence
    const faceCount = visualFeatures.face_regions.length;
    if (faceCount > 0) {
      intimacyScore += Math.min(20, faceCount * 10);
    }
    
    return Math.min(100, Math.max(0, intimacyScore));
  }

  private calculateEnergyLevel(motionLevel: MotionLevel, colorEmotionScore: number): number {
    let energyScore = 30; // Base score
    
    // Motion contributes significantly to energy
    switch (motionLevel) {
      case MotionLevel.STATIC:
        energyScore = 20;
        break;
      case MotionLevel.LOW_MOTION:
        energyScore = 35;
        break;
      case MotionLevel.MEDIUM_MOTION:
        energyScore = 60;
        break;
      case MotionLevel.HIGH_MOTION:
        energyScore = 85;
        break;
      case MotionLevel.EXTREME_MOTION:
        energyScore = 95;
        break;
    }
    
    // Color emotion contributes to energy
    energyScore += colorEmotionScore * 0.2;
    
    return Math.min(100, Math.max(0, energyScore));
  }

  private calculateFaceAppeal(faceRegions: any[]): number {
    if (faceRegions.length === 0) return 10; // Minimal appeal without faces
    
    let faceAppealScore = 40; // Base score for having faces
    
    // More faces can be more engaging (up to a point)
    if (faceRegions.length === 1) {
      faceAppealScore = 70; // Single face is highly engaging
    } else if (faceRegions.length === 2) {
      faceAppealScore = 80; // Two faces (interaction) very engaging
    } else if (faceRegions.length <= 4) {
      faceAppealScore = 75; // Small group
    } else {
      faceAppealScore = 60; // Large group, less individual focus
    }
    
    // Adjust for face confidence/quality
    const avgConfidence = faceRegions.reduce((sum, face) => sum + face.confidence, 0) / faceRegions.length;
    faceAppealScore += (avgConfidence / 100) * 20;
    
    return Math.min(100, Math.max(0, faceAppealScore));
  }

  private calculateGestureIndicators(sceneAnalysis: any): number {
    // Simplified gesture detection based on available data
    let gestureScore = 30; // Base score
    
    // Action scenes likely have more gestures
    if (sceneAnalysis.primary_scene_type === SceneType.ACTION_SCENE) {
      gestureScore += 30;
    }
    
    // Motion indicates potential gestures
    switch (sceneAnalysis.motion_level) {
      case MotionLevel.HIGH_MOTION:
      case MotionLevel.EXTREME_MOTION:
        gestureScore += 25;
        break;
      case MotionLevel.MEDIUM_MOTION:
        gestureScore += 15;
        break;
    }
    
    return Math.min(100, Math.max(0, gestureScore));
  }

  private calculateEyeContactPotential(sceneAnalysis: any): number {
    // Eye contact is most likely in close-ups with faces
    let eyeContactScore = 20; // Base score
    
    if (sceneAnalysis.visual_features.face_regions.length > 0) {
      switch (sceneAnalysis.shot_type) {
        case ShotType.EXTREME_CLOSE_UP:
          eyeContactScore = 90;
          break;
        case ShotType.CLOSE_UP:
          eyeContactScore = 80;
          break;
        case ShotType.MEDIUM_CLOSE_UP:
          eyeContactScore = 60;
          break;
        case ShotType.MEDIUM_SHOT:
          eyeContactScore = 40;
          break;
        default:
          eyeContactScore = 25;
      }
    }
    
    return eyeContactScore;
  }

  private calculateSocialContext(subjectCount: number, sceneType: SceneType): number {
    let socialScore = 30; // Base score
    
    // Scene type affects social context
    switch (sceneType) {
      case SceneType.DIALOGUE_SCENE:
        socialScore = 85;
        break;
      case SceneType.CROWD_SCENE:
        socialScore = 75;
        break;
      case SceneType.ACTION_SCENE:
        socialScore = 70;
        break;
      case SceneType.PORTRAIT:
        socialScore = 60;
        break;
      default:
        socialScore = 40;
    }
    
    // Adjust for subject count
    if (subjectCount >= 2) {
      socialScore += Math.min(20, (subjectCount - 1) * 8);
    }
    
    return Math.min(100, Math.max(0, socialScore));
  }

  private calculateMotionExcitement(motionLevel: MotionLevel, motionFeatures: any): number {
    let excitementScore = 20; // Base score
    
    // Motion level directly affects excitement
    switch (motionLevel) {
      case MotionLevel.STATIC:
        excitementScore = 15;
        break;
      case MotionLevel.LOW_MOTION:
        excitementScore = 30;
        break;
      case MotionLevel.MEDIUM_MOTION:
        excitementScore = 55;
        break;
      case MotionLevel.HIGH_MOTION:
        excitementScore = 80;
        break;
      case MotionLevel.EXTREME_MOTION:
        excitementScore = 95;
        break;
    }
    
    // Add bonus for motion blur (indicates action)
    excitementScore += motionFeatures.blur_indicators * 0.2;
    
    return Math.min(100, Math.max(0, excitementScore));
  }

  private calculateCameraDynamics(cameraMovement: any): number {
    if (!cameraMovement.detected) return 25;
    
    let dynamicsScore = 50 + cameraMovement.intensity * 0.5;
    
    // Certain camera movements are more exciting
    switch (cameraMovement.type) {
      case 'zoom':
        dynamicsScore += 15;
        break;
      case 'dolly':
        dynamicsScore += 12;
        break;
      case 'pan':
        dynamicsScore += 8;
        break;
      case 'tilt':
        dynamicsScore += 6;
        break;
      case 'shake':
        dynamicsScore += 20; // Very dynamic but can be negative
        break;
    }
    
    return Math.min(100, Math.max(0, dynamicsScore));
  }

  private calculateSceneEnergy(sceneType: SceneType, motionLevel: MotionLevel): number {
    let energyScore = 40; // Base score
    
    // Scene type contributes to energy
    switch (sceneType) {
      case SceneType.ACTION_SCENE:
        energyScore = 90;
        break;
      case SceneType.DIALOGUE_SCENE:
        energyScore = 50;
        break;
      case SceneType.CROWD_SCENE:
        energyScore = 70;
        break;
      case SceneType.CLOSE_UP:
        energyScore = 65;
        break;
      case SceneType.ESTABLISHING_SHOT:
        energyScore = 45;
        break;
      default:
        energyScore = 50;
    }
    
    // Motion level modifies energy
    const motionMultipliers: { [key in MotionLevel]: number } = {
      [MotionLevel.STATIC]: 0.7,
      [MotionLevel.LOW_MOTION]: 0.85,
      [MotionLevel.MEDIUM_MOTION]: 1.0,
      [MotionLevel.HIGH_MOTION]: 1.2,
      [MotionLevel.EXTREME_MOTION]: 1.4
    };
    
    energyScore *= motionMultipliers[motionLevel];
    
    return Math.min(100, Math.max(0, energyScore));
  }

  private calculateTensionIndicators(technicalAnalysis: any, sceneAnalysis: any): number {
    let tensionScore = 30; // Base score
    
    // Low light can create tension
    if (sceneAnalysis.scene_context.lighting_type === 'low_light') {
      tensionScore += 25;
    }
    
    // High contrast can create tension
    if (technicalAnalysis.scores.contrast > 80) {
      tensionScore += 15;
    }
    
    // Motion blur can indicate tension/action
    if (technicalAnalysis.scores.motion_blur < 50) {
      tensionScore += 20;
    }
    
    // Certain scene types inherently have tension
    if (sceneAnalysis.primary_scene_type === SceneType.ACTION_SCENE) {
      tensionScore += 30;
    }
    
    return Math.min(100, Math.max(0, tensionScore));
  }

  // Additional helper methods
  private calculateCompositionStrength(compositionAnalysis: any): number {
    return compositionAnalysis.scores.overall_score;
  }

  private calculateTechnicalQuality(technicalAnalysis: any): number {
    return technicalAnalysis.scores.overall_score;
  }

  private calculateSceneTypeAppeal(sceneAnalysis: any): number {
    // Different scene types have different inherent appeal
    const sceneTypeScores: { [key in SceneType]: number } = {
      [SceneType.ACTION_SCENE]: 85,
      [SceneType.CLOSE_UP]: 80,
      [SceneType.DIALOGUE_SCENE]: 70,
      [SceneType.PORTRAIT]: 75,
      [SceneType.CROWD_SCENE]: 65,
      [SceneType.MONTAGE]: 70,
      [SceneType.LANDSCAPE]: 60,
      [SceneType.ESTABLISHING_SHOT]: 55,
      [SceneType.WIDE_SHOT]: 50,
      [SceneType.MEDIUM_SHOT]: 55,
      [SceneType.EXTREME_CLOSE_UP]: 75,
      [SceneType.TRANSITION]: 30,
      [SceneType.TITLE_CARD]: 25,
      [SceneType.INTERIOR]: 45,
      [SceneType.EXTERIOR]: 50
    };
    
    return sceneTypeScores[sceneAnalysis.primary_scene_type] || 50;
  }

  private calculateOverallEngagementScore(factors: EngagementFactors): number {
    // Weighted combination of engagement factors
    const weights = {
      visual_interest: 0.20,
      emotional_appeal: 0.18,
      human_presence: 0.15,
      action_intensity: 0.12,
      color_appeal: 0.10,
      composition_strength: 0.10,
      technical_quality: 0.08,
      scene_type_appeal: 0.07
    };
    
    return Math.round(
      factors.visual_interest * weights.visual_interest +
      factors.emotional_appeal * weights.emotional_appeal +
      factors.human_presence * weights.human_presence +
      factors.action_intensity * weights.action_intensity +
      factors.color_appeal * weights.color_appeal +
      factors.composition_strength * weights.composition_strength +
      factors.technical_quality * weights.technical_quality +
      factors.scene_type_appeal * weights.scene_type_appeal
    );
  }

  private calculateEngagementPredictions(factors: EngagementFactors, sceneAnalysis: any): {
    attention_grabbing: number;
    retention_potential: number;
    emotional_impact: number;
    shareability: number;
  } {
    // Attention grabbing: visual interest + action + color
    const attentionGrabbing = Math.round(
      factors.visual_interest * 0.4 +
      factors.action_intensity * 0.35 +
      factors.color_appeal * 0.25
    );
    
    // Retention potential: human presence + emotional appeal + composition
    const retentionPotential = Math.round(
      factors.human_presence * 0.4 +
      factors.emotional_appeal * 0.35 +
      factors.composition_strength * 0.25
    );
    
    // Emotional impact: emotional appeal + human presence + scene type
    const emotionalImpact = Math.round(
      factors.emotional_appeal * 0.5 +
      factors.human_presence * 0.3 +
      factors.scene_type_appeal * 0.2
    );
    
    // Shareability: overall factors with social media bias
    const shareability = Math.round(
      factors.human_presence * 0.25 +
      factors.visual_interest * 0.2 +
      factors.emotional_appeal * 0.2 +
      factors.color_appeal * 0.15 +
      factors.action_intensity * 0.1 +
      factors.composition_strength * 0.1
    );
    
    return {
      attention_grabbing: attentionGrabbing,
      retention_potential: retentionPotential,
      emotional_impact: emotionalImpact,
      shareability: shareability
    };
  }

  private calculateAudienceAppeal(factors: EngagementFactors, sceneAnalysis: any): {
    general_audience: number;
    social_media: number;
    professional: number;
    artistic: number;
  } {
    // General audience: balanced appeal
    const generalAudience = Math.round(
      (factors.visual_interest + factors.emotional_appeal + factors.human_presence + factors.action_intensity) / 4
    );
    
    // Social media: visual impact and shareability focused
    const socialMedia = Math.round(
      factors.color_appeal * 0.25 +
      factors.visual_interest * 0.25 +
      factors.human_presence * 0.2 +
      factors.action_intensity * 0.15 +
      factors.emotional_appeal * 0.15
    );
    
    // Professional: technical quality and composition focused
    const professional = Math.round(
      factors.technical_quality * 0.35 +
      factors.composition_strength * 0.3 +
      factors.visual_interest * 0.2 +
      factors.scene_type_appeal * 0.15
    );
    
    // Artistic: composition and emotional appeal focused
    const artistic = Math.round(
      factors.composition_strength * 0.3 +
      factors.emotional_appeal * 0.25 +
      factors.visual_interest * 0.2 +
      factors.color_appeal * 0.15 +
      factors.technical_quality * 0.1
    );
    
    return {
      general_audience: generalAudience,
      social_media: socialMedia,
      professional: professional,
      artistic: artistic
    };
  }

  // Utility methods
  private rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
    r /= 255;
    g /= 255;
    b /= 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const diff = max - min;

    const v = max;
    const s = max === 0 ? 0 : diff / max;

    let h = 0;
    if (diff !== 0) {
      if (max === r) h = ((g - b) / diff) % 6;
      else if (max === g) h = (b - r) / diff + 2;
      else h = (r - g) / diff + 4;
    }
    h *= 60;
    if (h < 0) h += 360;

    return { h, s, v };
  }

  private isHarmonicColor(hue: number): boolean {
    // Colors that are generally pleasing
    const harmonicRanges = [
      [0, 30],    // Reds/oranges
      [45, 75],   // Yellows/golds
      [90, 150],  // Greens
      [180, 240], // Blues
      [270, 330]  // Purples/magentas
    ];
    
    return harmonicRanges.some(([start, end]) => hue >= start && hue <= end);
  }

  private calculateEdgeStrength(data: Buffer, width: number, height: number, x: number, y: number): number {
    // Simplified edge detection (reused from other modules)
    if (x <= 0 || x >= width - 1 || y <= 0 || y >= height - 1) return 0;

    const getPixelLuminance = (px: number, py: number): number => {
      const index = (py * width + px) * 4;
      return 0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2];
    };

    const gx = getPixelLuminance(x + 1, y) - getPixelLuminance(x - 1, y);
    const gy = getPixelLuminance(x, y + 1) - getPixelLuminance(x, y - 1);

    return Math.sqrt(gx * gx + gy * gy);
  }

  private calculateColorUniqueness(data: Buffer): number {
    // Simplified color uniqueness calculation
    const colorBuckets = new Map<string, number>();
    
    for (let i = 0; i < data.length; i += 64) { // Sample every 16th pixel
      const r = Math.floor(data[i] / 32) * 32;
      const g = Math.floor(data[i + 1] / 32) * 32;
      const b = Math.floor(data[i + 2] / 32) * 32;
      
      const key = `${r},${g},${b}`;
      colorBuckets.set(key, (colorBuckets.get(key) || 0) + 1);
    }
    
    // More unique colors = higher uniqueness score
    const uniqueColors = colorBuckets.size;
    return Math.min(1, uniqueColors / 50); // Normalize
  }

  private calculatePatternComplexity(data: Buffer, width: number, height: number): number {
    // Simplified pattern complexity (could be enhanced with frequency domain analysis)
    let repetitivePatterns = 0;
    let totalChecks = 0;
    
    // Check for repeating patterns in small regions
    const blockSize = 16;
    for (let y = 0; y < height - blockSize * 2; y += blockSize) {
      for (let x = 0; x < width - blockSize * 2; x += blockSize) {
        const similarity = this.calculateBlockSimilarity(data, width, height, x, y, blockSize);
        if (similarity > 0.8) repetitivePatterns++;
        totalChecks++;
      }
    }
    
    const repetitiveRatio = repetitivePatterns / totalChecks;
    return Math.max(0, 1 - repetitiveRatio); // Less repetition = more complex
  }

  private calculateAsymmetryScore(data: Buffer, width: number, height: number): number {
    // Calculate horizontal asymmetry
    let asymmetryScore = 0;
    let comparisons = 0;
    
    for (let y = 0; y < height; y += 8) {
      for (let x = 0; x < width / 2; x += 8) {
        const leftIndex = (y * width + x) * 4;
        const rightIndex = (y * width + (width - 1 - x)) * 4;
        
        const leftLum = 0.299 * data[leftIndex] + 0.587 * data[leftIndex + 1] + 0.114 * data[leftIndex + 2];
        const rightLum = 0.299 * data[rightIndex] + 0.587 * data[rightIndex + 1] + 0.114 * data[rightIndex + 2];
        
        asymmetryScore += Math.abs(leftLum - rightLum);
        comparisons++;
      }
    }
    
    return comparisons > 0 ? Math.min(1, (asymmetryScore / comparisons) / 100) : 0;
  }

  private calculateBlockSimilarity(data: Buffer, width: number, height: number, x: number, y: number, blockSize: number): number {
    // Compare block with adjacent block for pattern detection
    let similarity = 0;
    let comparisons = 0;
    
    for (let py = 0; py < blockSize && y + py < height - blockSize; py += 2) {
      for (let px = 0; px < blockSize && x + px < width - blockSize; px += 2) {
        const index1 = ((y + py) * width + (x + px)) * 4;
        const index2 = ((y + py) * width + (x + px + blockSize)) * 4;
        
        if (index2 < data.length - 3) {
          const lum1 = 0.299 * data[index1] + 0.587 * data[index1 + 1] + 0.114 * data[index1 + 2];
          const lum2 = 0.299 * data[index2] + 0.587 * data[index2 + 1] + 0.114 * data[index2 + 2];
          
          similarity += Math.max(0, 1 - Math.abs(lum1 - lum2) / 255);
          comparisons++;
        }
      }
    }
    
    return comparisons > 0 ? similarity / comparisons : 0;
  }

  private calculateEngagementConfidence(
    compositionConfidence: number,
    technicalConfidence: number,
    sceneConfidence: number
  ): number {
    // Average the input confidences
    return (compositionConfidence + technicalConfidence + sceneConfidence) / 3;
  }
}

export const engagementScoreCalculator = EngagementScoreCalculator.getInstance();