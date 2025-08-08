import sharp from 'sharp';
import path from 'path';

export interface TechnicalQualityScores {
  sharpness: number; // 0-100
  exposure: number; // 0-100
  contrast: number; // 0-100
  color_saturation: number; // 0-100
  noise_level: number; // 0-100 (higher = less noise)
  motion_blur: number; // 0-100 (higher = less blur)
  overall_score: number; // 0-100
}

export interface TechnicalQualityAnalysis {
  scores: TechnicalQualityScores;
  sharpness_details: {
    variance: number;
    edge_density: number;
    max_gradient: number;
    focus_regions: Array<{ x: number; y: number; width: number; height: number; sharpness: number }>;
  };
  exposure_details: {
    histogram: {
      shadows: number; // 0-85
      midtones: number; // 86-170
      highlights: number; // 171-255
    };
    clipped_pixels: {
      black: number;
      white: number;
    };
    dynamic_range: number;
  };
  color_details: {
    saturation_distribution: Array<{ hue: number; saturation: number; percentage: number }>;
    color_cast: { detected: boolean; type?: string; strength?: number };
    vibrance: number;
  };
  noise_details: {
    grain_score: number;
    pattern_noise: number;
    iso_estimate: number;
    clean_regions: number; // percentage of image with low noise
  };
  analysis_confidence: number; // 0-1
}

export class TechnicalQualityAnalyzer {
  private static instance: TechnicalQualityAnalyzer;

  private constructor() {}

  public static getInstance(): TechnicalQualityAnalyzer {
    if (!TechnicalQualityAnalyzer.instance) {
      TechnicalQualityAnalyzer.instance = new TechnicalQualityAnalyzer();
    }
    return TechnicalQualityAnalyzer.instance;
  }

  /**
   * Analyze technical quality of an image
   */
  async analyzeTechnicalQuality(imagePath: string): Promise<TechnicalQualityAnalysis> {
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

    // Perform technical quality analyses
    const sharpnessResult = await this.analyzeSharpness(data, width, height);
    const exposureResult = await this.analyzeExposure(data, width, height);
    const colorResult = await this.analyzeColorSaturation(data, width, height);
    const noiseResult = await this.analyzeNoiseLevel(data, width, height);
    const contrastResult = await this.analyzeContrast(data, width, height);
    const motionBlurResult = await this.analyzeMotionBlur(data, width, height);

    // Calculate overall score (weighted average)
    const overallScore = this.calculateOverallTechnicalScore({
      sharpness: sharpnessResult.score,
      exposure: exposureResult.score,
      contrast: contrastResult.score,
      color_saturation: colorResult.score,
      noise_level: noiseResult.score,
      motion_blur: motionBlurResult.score,
      overall_score: 0 // Will be set below
    });

    return {
      scores: {
        sharpness: sharpnessResult.score,
        exposure: exposureResult.score,
        contrast: contrastResult.score,
        color_saturation: colorResult.score,
        noise_level: noiseResult.score,
        motion_blur: motionBlurResult.score,
        overall_score: overallScore
      },
      sharpness_details: sharpnessResult.details,
      exposure_details: exposureResult.details,
      color_details: colorResult.details,
      noise_details: noiseResult.details,
      analysis_confidence: this.calculateTechnicalConfidence(sharpnessResult, exposureResult, colorResult)
    };
  }

  /**
   * Analyze image sharpness using multiple methods
   */
  private async analyzeSharpness(
    data: Buffer,
    width: number,
    height: number
  ): Promise<{
    score: number;
    details: {
      variance: number;
      edge_density: number;
      max_gradient: number;
      focus_regions: Array<{ x: number; y: number; width: number; height: number; sharpness: number }>;
    };
  }> {
    // Method 1: Variance of Laplacian
    const varianceScore = this.calculateLaplacianVariance(data, width, height);
    
    // Method 2: Edge density
    const edgeDensityScore = this.calculateEdgeDensity(data, width, height);
    
    // Method 3: Maximum gradient
    const maxGradientScore = this.calculateMaxGradient(data, width, height);
    
    // Method 4: Focus regions analysis
    const focusRegions = this.detectFocusRegions(data, width, height);
    
    // Combine scores (weighted average)
    const combinedScore = (varianceScore * 0.4 + edgeDensityScore * 0.3 + maxGradientScore * 0.3);
    
    return {
      score: Math.min(100, Math.max(0, combinedScore)),
      details: {
        variance: varianceScore,
        edge_density: edgeDensityScore,
        max_gradient: maxGradientScore,
        focus_regions: focusRegions
      }
    };
  }

  /**
   * Analyze exposure using histogram analysis
   */
  private async analyzeExposure(
    data: Buffer,
    width: number,
    height: number
  ): Promise<{
    score: number;
    details: {
      histogram: { shadows: number; midtones: number; highlights: number };
      clipped_pixels: { black: number; white: number };
      dynamic_range: number;
    };
  }> {
    // Calculate luminance histogram
    const histogram = new Array(256).fill(0);
    let totalPixels = 0;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      
      // Calculate luminance
      const luminance = Math.floor(0.299 * r + 0.587 * g + 0.114 * b);
      histogram[luminance]++;
      totalPixels++;
    }

    // Analyze histogram regions
    const shadows = histogram.slice(0, 85).reduce((sum, count) => sum + count, 0) / totalPixels;
    const midtones = histogram.slice(85, 171).reduce((sum, count) => sum + count, 0) / totalPixels;
    const highlights = histogram.slice(171, 256).reduce((sum, count) => sum + count, 0) / totalPixels;

    // Calculate clipped pixels
    const blackClipped = (histogram[0] + histogram[1] + histogram[2]) / totalPixels;
    const whiteClipped = (histogram[253] + histogram[254] + histogram[255]) / totalPixels;

    // Calculate dynamic range
    const dynamicRange = this.calculateDynamicRange(histogram);

    // Score based on histogram distribution and clipping
    let exposureScore = 100;
    
    // Penalize for excessive clipping
    exposureScore -= (blackClipped * 500); // Heavy penalty for black clipping
    exposureScore -= (whiteClipped * 500); // Heavy penalty for white clipping
    
    // Penalize for poor distribution
    if (shadows > 0.7) exposureScore -= 20; // Too dark overall
    if (highlights > 0.7) exposureScore -= 20; // Too bright overall
    if (midtones < 0.2) exposureScore -= 15; // No midtones
    
    // Bonus for good dynamic range
    exposureScore += (dynamicRange / 255) * 20;

    return {
      score: Math.min(100, Math.max(0, exposureScore)),
      details: {
        histogram: { shadows, midtones, highlights },
        clipped_pixels: { black: blackClipped, white: whiteClipped },
        dynamic_range: dynamicRange
      }
    };
  }

  /**
   * Analyze color saturation and vibrance
   */
  private async analyzeColorSaturation(
    data: Buffer,
    width: number,
    height: number
  ): Promise<{
    score: number;
    details: {
      saturation_distribution: Array<{ hue: number; saturation: number; percentage: number }>;
      color_cast: { detected: boolean; type?: string; strength?: number };
      vibrance: number;
    };
  }> {
    const saturationData: Array<{ hue: number; saturation: number }> = [];
    let totalSaturation = 0;
    let pixelCount = 0;
    let avgR = 0, avgG = 0, avgB = 0;

    // Sample every 4th pixel for performance
    for (let i = 0; i < data.length; i += 16) {
      const r = data[i] / 255;
      const g = data[i + 1] / 255;
      const b = data[i + 2] / 255;
      
      const hsv = this.rgbToHsv(r * 255, g * 255, b * 255);
      saturationData.push({ hue: hsv.h, saturation: hsv.s });
      
      totalSaturation += hsv.s;
      avgR += r;
      avgG += g;
      avgB += b;
      pixelCount++;
    }

    const avgSaturation = totalSaturation / pixelCount;
    avgR /= pixelCount;
    avgG /= pixelCount;
    avgB /= pixelCount;

    // Detect color cast
    const colorCast = this.detectColorCast(avgR, avgG, avgB);
    
    // Calculate saturation distribution
    const saturationDistribution = this.calculateSaturationDistribution(saturationData);
    
    // Calculate vibrance (saturation of less-saturated colors)
    const vibrance = this.calculateVibrance(saturationData);
    
    // Score saturation (ideal range is 0.3-0.8)
    let saturationScore = 100;
    
    if (avgSaturation < 0.2) {
      saturationScore = avgSaturation * 250; // Too desaturated
    } else if (avgSaturation > 0.9) {
      saturationScore = 100 - ((avgSaturation - 0.9) * 500); // Too saturated
    } else {
      // Good saturation range
      saturationScore = 100 - Math.abs(avgSaturation - 0.55) * 100;
    }
    
    // Penalize for color cast
    if (colorCast.detected && colorCast.strength && colorCast.strength > 0.1) {
      saturationScore -= colorCast.strength * 300;
    }

    return {
      score: Math.min(100, Math.max(0, saturationScore)),
      details: {
        saturation_distribution: saturationDistribution,
        color_cast: colorCast,
        vibrance
      }
    };
  }

  /**
   * Analyze noise level using local variance
   */
  private async analyzeNoiseLevel(
    data: Buffer,
    width: number,
    height: number
  ): Promise<{
    score: number;
    details: {
      grain_score: number;
      pattern_noise: number;
      iso_estimate: number;
      clean_regions: number;
    };
  }> {
    let totalVariance = 0;
    let regionCount = 0;
    let cleanRegions = 0;
    const blockSize = 8;
    
    // Analyze 8x8 blocks for local variance (noise estimation)
    for (let y = 0; y < height - blockSize; y += blockSize) {
      for (let x = 0; x < width - blockSize; x += blockSize) {
        const blockVariance = this.calculateBlockVariance(data, width, height, x, y, blockSize);
        totalVariance += blockVariance;
        regionCount++;
        
        if (blockVariance < 50) { // Low variance = less noise
          cleanRegions++;
        }
      }
    }
    
    const avgVariance = totalVariance / regionCount;
    const cleanRegionPercentage = (cleanRegions / regionCount) * 100;
    
    // Estimate grain/noise
    const grainScore = Math.min(100, Math.max(0, 100 - (avgVariance / 10)));
    
    // Detect pattern noise (would need more sophisticated analysis)
    const patternNoise = this.detectPatternNoise(data, width, height);
    
    // Rough ISO estimation based on noise level
    let isoEstimate = 100;
    if (avgVariance > 200) isoEstimate = 1600;
    else if (avgVariance > 150) isoEstimate = 800;
    else if (avgVariance > 100) isoEstimate = 400;
    else if (avgVariance > 50) isoEstimate = 200;
    
    // Overall noise score (higher = less noise)
    const noiseScore = Math.min(100, (grainScore * 0.7) + (cleanRegionPercentage * 0.3));

    return {
      score: noiseScore,
      details: {
        grain_score: grainScore,
        pattern_noise: patternNoise,
        iso_estimate: isoEstimate,
        clean_regions: cleanRegionPercentage
      }
    };
  }

  /**
   * Analyze contrast using standard deviation and histogram spread
   */
  private async analyzeContrast(
    data: Buffer,
    width: number,
    height: number
  ): Promise<{ score: number }> {
    const luminances: number[] = [];
    
    // Calculate luminance for all pixels
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
      luminances.push(luminance);
    }
    
    // Calculate standard deviation (measure of contrast)
    const mean = luminances.reduce((sum, l) => sum + l, 0) / luminances.length;
    const variance = luminances.reduce((sum, l) => sum + Math.pow(l - mean, 2), 0) / luminances.length;
    const stdDev = Math.sqrt(variance);
    
    // Calculate histogram spread
    const min = Math.min(...luminances);
    const max = Math.max(...luminances);
    const range = max - min;
    
    // Score contrast (ideal std dev is around 50-80 for good contrast)
    let contrastScore = 100;
    
    if (stdDev < 20) {
      contrastScore = stdDev * 2; // Too low contrast
    } else if (stdDev > 100) {
      contrastScore = 100 - ((stdDev - 100) * 0.5); // Too high contrast
    } else {
      // Good contrast range
      contrastScore = Math.min(100, 80 + (stdDev - 50) * 0.4);
    }
    
    // Bonus for good range utilization
    contrastScore += (range / 255) * 20;
    
    return { score: Math.min(100, Math.max(0, contrastScore)) };
  }

  /**
   * Analyze motion blur using edge analysis
   */
  private async analyzeMotionBlur(
    data: Buffer,
    width: number,
    height: number
  ): Promise<{ score: number }> {
    let totalEdgeStrength = 0;
    let edgeCount = 0;
    let blurredEdges = 0;
    
    // Analyze edges across the image
    for (let y = 2; y < height - 2; y += 4) { // Sample every 4th row
      for (let x = 2; x < width - 2; x += 4) { // Sample every 4th column
        const edgeStrength = this.calculateEdgeStrength(data, width, height, x, y);
        
        if (edgeStrength > 30) { // Significant edge
          totalEdgeStrength += edgeStrength;
          edgeCount++;
          
          // Check for motion blur characteristics
          if (this.isEdgeBlurred(data, width, height, x, y)) {
            blurredEdges++;
          }
        }
      }
    }
    
    if (edgeCount === 0) return { score: 50 }; // No edges to analyze
    
    const avgEdgeStrength = totalEdgeStrength / edgeCount;
    const blurredRatio = blurredEdges / edgeCount;
    
    // Score based on edge sharpness and blur ratio
    let motionBlurScore = 100;
    motionBlurScore -= (blurredRatio * 60); // Penalty for blurred edges
    motionBlurScore = Math.min(motionBlurScore, avgEdgeStrength / 2); // Max based on edge strength
    
    return { score: Math.min(100, Math.max(0, motionBlurScore)) };
  }

  /**
   * Calculate Laplacian variance for sharpness
   */
  private calculateLaplacianVariance(data: Buffer, width: number, height: number): number {
    const laplacianKernel = [
      [0, -1, 0],
      [-1, 4, -1],
      [0, -1, 0]
    ];
    
    const laplacianValues: number[] = [];
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let laplacianSum = 0;
        
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const pixelIndex = ((y + ky) * width + (x + kx)) * 4;
            const luminance = 0.299 * data[pixelIndex] + 0.587 * data[pixelIndex + 1] + 0.114 * data[pixelIndex + 2];
            laplacianSum += luminance * laplacianKernel[ky + 1][kx + 1];
          }
        }
        
        laplacianValues.push(Math.abs(laplacianSum));
      }
    }
    
    // Calculate variance of Laplacian
    const mean = laplacianValues.reduce((sum, val) => sum + val, 0) / laplacianValues.length;
    const variance = laplacianValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / laplacianValues.length;
    
    return Math.min(100, variance / 50); // Normalize to 0-100
  }

  /**
   * Helper methods
   */
  private calculateEdgeStrength(data: Buffer, width: number, height: number, x: number, y: number): number {
    if (x <= 0 || x >= width - 1 || y <= 0 || y >= height - 1) {
      return 0;
    }

    const getPixelLuminance = (px: number, py: number): number => {
      const index = (py * width + px) * 4;
      return 0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2];
    };

    // Sobel edge detection
    const sobelX = [
      [-1, 0, 1],
      [-2, 0, 2],
      [-1, 0, 1]
    ];

    const sobelY = [
      [-1, -2, -1],
      [0, 0, 0],
      [1, 2, 1]
    ];

    let gx = 0;
    let gy = 0;

    for (let ky = -1; ky <= 1; ky++) {
      for (let kx = -1; kx <= 1; kx++) {
        const pixel = getPixelLuminance(x + kx, y + ky);
        gx += pixel * sobelX[ky + 1][kx + 1];
        gy += pixel * sobelY[ky + 1][kx + 1];
      }
    }

    return Math.sqrt(gx * gx + gy * gy);
  }

  private calculateEdgeDensity(data: Buffer, width: number, height: number): number {
    let edgeCount = 0;
    let totalPixels = 0;
    
    for (let y = 1; y < height - 1; y += 2) { // Sample every other row
      for (let x = 1; x < width - 1; x += 2) { // Sample every other column
        const edgeStrength = this.calculateEdgeStrength(data, width, height, x, y);
        if (edgeStrength > 30) edgeCount++;
        totalPixels++;
      }
    }
    
    const edgeDensity = (edgeCount / totalPixels) * 100;
    return Math.min(100, edgeDensity * 5); // Scale to 0-100
  }

  private calculateMaxGradient(data: Buffer, width: number, height: number): number {
    let maxGradient = 0;
    
    for (let y = 1; y < height - 1; y += 4) { // Sample every 4th row
      for (let x = 1; x < width - 1; x += 4) { // Sample every 4th column
        const gradient = this.calculateEdgeStrength(data, width, height, x, y);
        maxGradient = Math.max(maxGradient, gradient);
      }
    }
    
    return Math.min(100, maxGradient / 5); // Scale to 0-100
  }

  private detectFocusRegions(data: Buffer, width: number, height: number): Array<{ x: number; y: number; width: number; height: number; sharpness: number }> {
    const regions: Array<{ x: number; y: number; width: number; height: number; sharpness: number }> = [];
    const blockSize = 64;
    
    for (let y = 0; y < height - blockSize; y += blockSize / 2) {
      for (let x = 0; x < width - blockSize; x += blockSize / 2) {
        const sharpness = this.calculateRegionSharpness(data, width, height, x, y, blockSize, blockSize);
        if (sharpness > 30) {
          regions.push({ x, y, width: blockSize, height: blockSize, sharpness });
        }
      }
    }
    
    return regions.sort((a, b) => b.sharpness - a.sharpness).slice(0, 10);
  }

  private calculateRegionSharpness(data: Buffer, width: number, height: number, x: number, y: number, w: number, h: number): number {
    let totalEdgeStrength = 0;
    let pixelCount = 0;
    
    for (let py = y + 1; py < Math.min(y + h - 1, height - 1); py += 2) {
      for (let px = x + 1; px < Math.min(x + w - 1, width - 1); px += 2) {
        const edgeStrength = this.calculateEdgeStrength(data, width, height, px, py);
        totalEdgeStrength += edgeStrength;
        pixelCount++;
      }
    }
    
    return pixelCount > 0 ? totalEdgeStrength / pixelCount : 0;
  }

  private calculateDynamicRange(histogram: number[]): number {
    // Find first and last non-zero bins
    let firstNonZero = 0;
    let lastNonZero = 255;
    
    for (let i = 0; i < 256; i++) {
      if (histogram[i] > 0) {
        firstNonZero = i;
        break;
      }
    }
    
    for (let i = 255; i >= 0; i--) {
      if (histogram[i] > 0) {
        lastNonZero = i;
        break;
      }
    }
    
    return lastNonZero - firstNonZero;
  }

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

  private detectColorCast(avgR: number, avgG: number, avgB: number): { detected: boolean; type?: string; strength?: number } {
    const threshold = 0.02; // 2% difference threshold
    
    const max = Math.max(avgR, avgG, avgB);
    const min = Math.min(avgR, avgG, avgB);
    
    if (max - min < threshold) {
      return { detected: false };
    }
    
    let castType = '';
    let strength = max - min;
    
    if (avgR > avgG && avgR > avgB) {
      if (avgG > avgB) castType = 'warm_red';
      else castType = 'red_magenta';
    } else if (avgG > avgR && avgG > avgB) {
      castType = 'green';
    } else {
      castType = 'blue_cool';
    }
    
    return { detected: true, type: castType, strength };
  }

  private calculateSaturationDistribution(saturationData: Array<{ hue: number; saturation: number }>): Array<{ hue: number; saturation: number; percentage: number }> {
    // Group by hue ranges (simplified)
    const hueGroups: { [key: number]: { totalSat: number; count: number } } = {};
    const hueStep = 30; // 30-degree bins
    
    for (const data of saturationData) {
      const hueGroup = Math.floor(data.hue / hueStep) * hueStep;
      if (!hueGroups[hueGroup]) {
        hueGroups[hueGroup] = { totalSat: 0, count: 0 };
      }
      hueGroups[hueGroup].totalSat += data.saturation;
      hueGroups[hueGroup].count++;
    }
    
    return Object.entries(hueGroups)
      .map(([hue, group]) => ({
        hue: parseInt(hue),
        saturation: group.totalSat / group.count,
        percentage: (group.count / saturationData.length) * 100
      }))
      .sort((a, b) => b.percentage - a.percentage)
      .slice(0, 6);
  }

  private calculateVibrance(saturationData: Array<{ hue: number; saturation: number }>): number {
    // Vibrance boosts less-saturated colors more than highly saturated ones
    let vibranceSum = 0;
    
    for (const data of saturationData) {
      if (data.saturation < 0.5) {
        vibranceSum += data.saturation * 2; // Boost less saturated colors
      } else {
        vibranceSum += data.saturation; // Leave highly saturated colors alone
      }
    }
    
    return (vibranceSum / saturationData.length) * 100;
  }

  private calculateBlockVariance(data: Buffer, width: number, height: number, x: number, y: number, blockSize: number): number {
    const luminances: number[] = [];
    
    for (let py = y; py < Math.min(y + blockSize, height); py++) {
      for (let px = x; px < Math.min(x + blockSize, width); px++) {
        const pixelIndex = (py * width + px) * 4;
        const luminance = 0.299 * data[pixelIndex] + 0.587 * data[pixelIndex + 1] + 0.114 * data[pixelIndex + 2];
        luminances.push(luminance);
      }
    }
    
    if (luminances.length === 0) return 0;
    
    const mean = luminances.reduce((sum, l) => sum + l, 0) / luminances.length;
    const variance = luminances.reduce((sum, l) => sum + Math.pow(l - mean, 2), 0) / luminances.length;
    
    return variance;
  }

  private detectPatternNoise(data: Buffer, width: number, height: number): number {
    // Simplified pattern noise detection
    // In a real implementation, this would use frequency domain analysis
    return 0; // Placeholder
  }

  private isEdgeBlurred(data: Buffer, width: number, height: number, x: number, y: number): boolean {
    // Check if edge transitions are gradual (indicating motion blur)
    const getPixelLuminance = (px: number, py: number): number => {
      const index = (py * width + px) * 4;
      return 0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2];
    };
    
    // Check horizontal transition
    const centerLum = getPixelLuminance(x, y);
    const leftLum = getPixelLuminance(x - 2, y);
    const rightLum = getPixelLuminance(x + 2, y);
    
    const gradient = Math.abs(rightLum - leftLum);
    const transition = Math.abs(centerLum - (leftLum + rightLum) / 2);
    
    // If there's a strong gradient but smooth transition, it's likely blurred
    return gradient > 30 && transition < 10;
  }

  private calculateOverallTechnicalScore(scores: TechnicalQualityScores): number {
    const weights = {
      sharpness: 0.25,
      exposure: 0.20,
      contrast: 0.15,
      color_saturation: 0.15,
      noise_level: 0.15,
      motion_blur: 0.10
    };

    return Math.round(
      scores.sharpness * weights.sharpness +
      scores.exposure * weights.exposure +
      scores.contrast * weights.contrast +
      scores.color_saturation * weights.color_saturation +
      scores.noise_level * weights.noise_level +
      scores.motion_blur * weights.motion_blur
    );
  }

  private calculateTechnicalConfidence(sharpnessResult: any, exposureResult: any, colorResult: any): number {
    let confidence = 0.6; // Base confidence
    
    // Higher confidence with good sharpness detection
    if (sharpnessResult.details.focus_regions.length > 3) confidence += 0.1;
    
    // Higher confidence with good exposure analysis
    if (exposureResult.details.dynamic_range > 150) confidence += 0.1;
    
    // Higher confidence with good color analysis
    if (colorResult.details.saturation_distribution.length > 3) confidence += 0.2;
    
    return Math.min(1.0, confidence);
  }
}

export const technicalQualityAnalyzer = TechnicalQualityAnalyzer.getInstance();