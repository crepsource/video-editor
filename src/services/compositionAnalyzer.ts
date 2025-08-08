import sharp from 'sharp';
import path from 'path';

export interface CompositionScores {
  rule_of_thirds: number; // 0-100
  leading_lines: number; // 0-100
  visual_balance: number; // 0-100
  symmetry: number; // 0-100
  focal_point_strength: number; // 0-100
  color_harmony: number; // 0-100
  overall_score: number; // 0-100
}

export interface CompositionAnalysis {
  scores: CompositionScores;
  grid_intersections: Array<{ x: number; y: number; weight: number }>;
  focal_regions: Array<{ x: number; y: number; width: number; height: number; strength: number }>;
  dominant_lines: Array<{ angle: number; strength: number; type: 'horizontal' | 'vertical' | 'diagonal' }>;
  balance_center: { x: number; y: number };
  dominant_colors: Array<{ r: number; g: number; b: number; percentage: number }>;
  analysis_confidence: number; // 0-1
}

interface EdgePoint {
  x: number;
  y: number;
  strength: number;
  angle: number;
}

interface ColorRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  dominant_color: { r: number; g: number; b: number };
  pixel_count: number;
}

export class CompositionAnalyzer {
  private static instance: CompositionAnalyzer;

  private constructor() {}

  public static getInstance(): CompositionAnalyzer {
    if (!CompositionAnalyzer.instance) {
      CompositionAnalyzer.instance = new CompositionAnalyzer();
    }
    return CompositionAnalyzer.instance;
  }

  /**
   * Analyze composition of an image
   */
  async analyzeComposition(imagePath: string): Promise<CompositionAnalysis> {
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

    // Perform various composition analyses
    const ruleOfThirdsScore = await this.analyzeRuleOfThirds(data, width, height);
    const leadingLinesScore = await this.analyzeLeadingLines(data, width, height);
    const visualBalanceScore = await this.analyzeVisualBalance(data, width, height);
    const symmetryScore = await this.analyzeSymmetry(data, width, height);
    const focalPointScore = await this.analyzeFocalPointStrength(data, width, height);
    const colorHarmonyScore = await this.analyzeColorHarmony(data, width, height);

    // Calculate overall score (weighted average)
    const overallScore = this.calculateOverallScore({
      rule_of_thirds: ruleOfThirdsScore.score,
      leading_lines: leadingLinesScore.score,
      visual_balance: visualBalanceScore.score,
      symmetry: symmetryScore.score,
      focal_point_strength: focalPointScore.score,
      color_harmony: colorHarmonyScore.score,
      overall_score: 0 // Will be set below
    });

    return {
      scores: {
        rule_of_thirds: ruleOfThirdsScore.score,
        leading_lines: leadingLinesScore.score,
        visual_balance: visualBalanceScore.score,
        symmetry: symmetryScore.score,
        focal_point_strength: focalPointScore.score,
        color_harmony: colorHarmonyScore.score,
        overall_score: overallScore
      },
      grid_intersections: ruleOfThirdsScore.intersections,
      focal_regions: focalPointScore.regions,
      dominant_lines: leadingLinesScore.lines,
      balance_center: visualBalanceScore.center,
      dominant_colors: colorHarmonyScore.colors,
      analysis_confidence: this.calculateConfidence(ruleOfThirdsScore, leadingLinesScore, visualBalanceScore)
    };
  }

  /**
   * Analyze Rule of Thirds placement
   */
  private async analyzeRuleOfThirds(
    data: Buffer,
    width: number,
    height: number
  ): Promise<{
    score: number;
    intersections: Array<{ x: number; y: number; weight: number }>;
  }> {
    // Define rule of thirds grid lines
    const verticalLines = [Math.floor(width / 3), Math.floor(2 * width / 3)];
    const horizontalLines = [Math.floor(height / 3), Math.floor(2 * height / 3)];

    // Get grid intersection points
    const intersections: Array<{ x: number; y: number; weight: number }> = [];
    for (const vLine of verticalLines) {
      for (const hLine of horizontalLines) {
        const weight = this.calculateIntersectionWeight(data, width, height, vLine, hLine);
        intersections.push({ x: vLine, y: hLine, weight });
      }
    }

    // Calculate score based on how well subjects align with grid
    const gridScore = this.calculateGridAlignmentScore(data, width, height, verticalLines, horizontalLines);
    
    return {
      score: Math.min(100, Math.max(0, gridScore)),
      intersections
    };
  }

  /**
   * Calculate weight of content at grid intersection
   */
  private calculateIntersectionWeight(
    data: Buffer,
    width: number,
    height: number,
    x: number,
    y: number,
    radius: number = 20
  ): number {
    let totalWeight = 0;
    let pixelCount = 0;

    const minX = Math.max(0, x - radius);
    const maxX = Math.min(width - 1, x + radius);
    const minY = Math.max(0, y - radius);
    const maxY = Math.min(height - 1, y + radius);

    for (let py = minY; py <= maxY; py++) {
      for (let px = minX; px <= maxX; px++) {
        const pixelIndex = (py * width + px) * 4;
        const r = data[pixelIndex];
        const g = data[pixelIndex + 1];
        const b = data[pixelIndex + 2];
        
        // Calculate luminance
        const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
        
        // Calculate edge strength (simplified Sobel)
        const edgeStrength = this.calculateEdgeStrength(data, width, height, px, py);
        
        // Combine luminance variation and edge strength
        totalWeight += (Math.abs(luminance - 128) / 128) * 0.5 + (edgeStrength / 255) * 0.5;
        pixelCount++;
      }
    }

    return pixelCount > 0 ? (totalWeight / pixelCount) * 100 : 0;
  }

  /**
   * Calculate grid alignment score
   */
  private calculateGridAlignmentScore(
    data: Buffer,
    width: number,
    height: number,
    verticalLines: number[],
    horizontalLines: number[]
  ): number {
    let alignmentScore = 0;
    const tolerance = Math.min(width, height) * 0.05; // 5% tolerance

    // Calculate edge strength along grid lines
    for (const vLine of verticalLines) {
      for (let y = 0; y < height; y += 5) { // Sample every 5 pixels
        const edgeStrength = this.calculateEdgeStrength(data, width, height, vLine, y);
        alignmentScore += edgeStrength;
      }
    }

    for (const hLine of horizontalLines) {
      for (let x = 0; x < width; x += 5) { // Sample every 5 pixels
        const edgeStrength = this.calculateEdgeStrength(data, width, height, x, hLine);
        alignmentScore += edgeStrength;
      }
    }

    // Normalize score
    const maxPossibleScore = (verticalLines.length * height / 5 + horizontalLines.length * width / 5) * 255;
    return (alignmentScore / maxPossibleScore) * 100;
  }

  /**
   * Analyze leading lines in the image
   */
  private async analyzeLeadingLines(
    data: Buffer,
    width: number,
    height: number
  ): Promise<{
    score: number;
    lines: Array<{ angle: number; strength: number; type: 'horizontal' | 'vertical' | 'diagonal' }>;
  }> {
    const edges = this.detectEdges(data, width, height);
    const lines = this.extractLines(edges, width, height);
    
    // Score based on line strength and convergence
    let lineScore = 0;
    const dominantLines: Array<{ angle: number; strength: number; type: 'horizontal' | 'vertical' | 'diagonal' }> = [];

    for (const line of lines) {
      const lineType = this.categorizeLineType(line.angle);
      dominantLines.push({
        angle: line.angle,
        strength: line.strength,
        type: lineType
      });
      
      lineScore += line.strength;
    }

    // Bonus for diagonal lines (more dynamic)
    const diagonalBonus = dominantLines
      .filter(line => line.type === 'diagonal')
      .reduce((sum, line) => sum + line.strength * 0.2, 0);

    const finalScore = Math.min(100, (lineScore / lines.length) + diagonalBonus);

    return {
      score: isNaN(finalScore) ? 0 : finalScore,
      lines: dominantLines.slice(0, 10) // Top 10 lines
    };
  }

  /**
   * Analyze visual balance
   */
  private async analyzeVisualBalance(
    data: Buffer,
    width: number,
    height: number
  ): Promise<{
    score: number;
    center: { x: number; y: number };
  }> {
    // Calculate visual weight center
    let totalWeight = 0;
    let weightedX = 0;
    let weightedY = 0;

    // Sample every 4th pixel for performance
    for (let y = 0; y < height; y += 4) {
      for (let x = 0; x < width; x += 4) {
        const pixelIndex = (y * width + x) * 4;
        const r = data[pixelIndex];
        const g = data[pixelIndex + 1];
        const b = data[pixelIndex + 2];
        
        // Calculate visual weight (darker = heavier, more saturated = heavier)
        const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
        const saturation = this.calculateSaturation(r, g, b);
        const weight = (1 - luminance / 255) * 0.7 + saturation * 0.3;
        
        totalWeight += weight;
        weightedX += x * weight;
        weightedY += y * weight;
      }
    }

    const centerX = totalWeight > 0 ? weightedX / totalWeight : width / 2;
    const centerY = totalWeight > 0 ? weightedY / totalWeight : height / 2;

    // Calculate balance score based on how close center is to image center
    const imageCenterX = width / 2;
    const imageCenterY = height / 2;
    const maxDistance = Math.sqrt(imageCenterX * imageCenterX + imageCenterY * imageCenterY);
    const actualDistance = Math.sqrt(
      Math.pow(centerX - imageCenterX, 2) + Math.pow(centerY - imageCenterY, 2)
    );

    const balanceScore = Math.max(0, 100 - (actualDistance / maxDistance) * 100);

    return {
      score: balanceScore,
      center: { x: centerX, y: centerY }
    };
  }

  /**
   * Analyze symmetry
   */
  private async analyzeSymmetry(
    data: Buffer,
    width: number,
    height: number
  ): Promise<{ score: number }> {
    // Check horizontal symmetry
    const horizontalSymmetry = this.calculateHorizontalSymmetry(data, width, height);
    
    // Check vertical symmetry
    const verticalSymmetry = this.calculateVerticalSymmetry(data, width, height);
    
    // Combine scores (higher symmetry can be good for certain compositions)
    const symmetryScore = Math.max(horizontalSymmetry, verticalSymmetry);
    
    return { score: symmetryScore };
  }

  /**
   * Analyze focal point strength
   */
  private async analyzeFocalPointStrength(
    data: Buffer,
    width: number,
    height: number
  ): Promise<{
    score: number;
    regions: Array<{ x: number; y: number; width: number; height: number; strength: number }>;
  }> {
    const focalRegions = this.detectFocalRegions(data, width, height);
    
    if (focalRegions.length === 0) {
      return { score: 0, regions: [] };
    }

    // Score based on focal point strength and positioning
    const strongestRegion = focalRegions[0];
    let score = strongestRegion.strength * 100;

    // Bonus for focal point near rule of thirds intersections
    const ruleOfThirdsBonus = this.calculateRuleOfThirdsBonus(strongestRegion, width, height);
    score += ruleOfThirdsBonus;

    return {
      score: Math.min(100, score),
      regions: focalRegions.slice(0, 5)
    };
  }

  /**
   * Analyze color harmony
   */
  private async analyzeColorHarmony(
    data: Buffer,
    width: number,
    height: number
  ): Promise<{
    score: number;
    colors: Array<{ r: number; g: number; b: number; percentage: number }>;
  }> {
    const dominantColors = this.extractDominantColors(data, width, height);
    const harmonyScore = this.calculateColorHarmonyScore(dominantColors);

    return {
      score: harmonyScore,
      colors: dominantColors.slice(0, 5)
    };
  }

  /**
   * Helper method to calculate edge strength at a pixel
   */
  private calculateEdgeStrength(
    data: Buffer,
    width: number,
    height: number,
    x: number,
    y: number
  ): number {
    if (x <= 0 || x >= width - 1 || y <= 0 || y >= height - 1) {
      return 0;
    }

    // Simple Sobel edge detection
    const getPixelLuminance = (px: number, py: number): number => {
      const index = (py * width + px) * 4;
      return 0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2];
    };

    // Sobel kernels
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

  /**
   * Detect edges in the image
   */
  private detectEdges(data: Buffer, width: number, height: number): EdgePoint[] {
    const edges: EdgePoint[] = [];
    const threshold = 50; // Minimum edge strength

    for (let y = 1; y < height - 1; y += 2) { // Sample every other row for performance
      for (let x = 1; x < width - 1; x += 2) { // Sample every other column
        const strength = this.calculateEdgeStrength(data, width, height, x, y);
        
        if (strength > threshold) {
          const angle = this.calculateEdgeAngle(data, width, height, x, y);
          edges.push({ x, y, strength, angle });
        }
      }
    }

    return edges;
  }

  /**
   * Extract dominant lines from edge points
   */
  private extractLines(edges: EdgePoint[], width: number, height: number): Array<{ angle: number; strength: number }> {
    // Group edges by angle (simplified line detection)
    const angleGroups: { [key: number]: EdgePoint[] } = {};
    const angleTolerance = 15; // degrees

    for (const edge of edges) {
      const roundedAngle = Math.round(edge.angle / angleTolerance) * angleTolerance;
      if (!angleGroups[roundedAngle]) {
        angleGroups[roundedAngle] = [];
      }
      angleGroups[roundedAngle].push(edge);
    }

    // Convert groups to lines
    const lines: Array<{ angle: number; strength: number }> = [];
    
    for (const [angle, groupEdges] of Object.entries(angleGroups)) {
      if (groupEdges.length > 10) { // Minimum points for a line
        const avgStrength = groupEdges.reduce((sum, edge) => sum + edge.strength, 0) / groupEdges.length;
        lines.push({
          angle: parseFloat(angle),
          strength: Math.min(100, avgStrength / 2.55) // Normalize to 0-100
        });
      }
    }

    return lines.sort((a, b) => b.strength - a.strength);
  }

  /**
   * Additional helper methods
   */
  private calculateEdgeAngle(data: Buffer, width: number, height: number, x: number, y: number): number {
    // Simplified angle calculation based on gradient direction
    const getPixelLuminance = (px: number, py: number): number => {
      const index = (py * width + px) * 4;
      return 0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2];
    };

    const gx = getPixelLuminance(x + 1, y) - getPixelLuminance(x - 1, y);
    const gy = getPixelLuminance(x, y + 1) - getPixelLuminance(x, y - 1);

    return Math.atan2(gy, gx) * 180 / Math.PI;
  }

  private categorizeLineType(angle: number): 'horizontal' | 'vertical' | 'diagonal' {
    const absAngle = Math.abs(angle);
    if (absAngle < 15 || absAngle > 165) return 'horizontal';
    if (absAngle > 75 && absAngle < 105) return 'vertical';
    return 'diagonal';
  }

  private calculateSaturation(r: number, g: number, b: number): number {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    return max === 0 ? 0 : (max - min) / max;
  }

  private calculateHorizontalSymmetry(data: Buffer, width: number, height: number): number {
    let symmetryScore = 0;
    let comparisons = 0;
    const centerY = Math.floor(height / 2);

    for (let y = 0; y < centerY; y++) {
      for (let x = 0; x < width; x += 4) { // Sample every 4th pixel
        const topIndex = (y * width + x) * 4;
        const bottomIndex = ((height - 1 - y) * width + x) * 4;

        const topR = data[topIndex];
        const topG = data[topIndex + 1];
        const topB = data[topIndex + 2];

        const bottomR = data[bottomIndex];
        const bottomG = data[bottomIndex + 1];
        const bottomB = data[bottomIndex + 2];

        const colorDiff = Math.abs(topR - bottomR) + Math.abs(topG - bottomG) + Math.abs(topB - bottomB);
        symmetryScore += Math.max(0, 255 - colorDiff / 3);
        comparisons++;
      }
    }

    return comparisons > 0 ? (symmetryScore / comparisons / 255) * 100 : 0;
  }

  private calculateVerticalSymmetry(data: Buffer, width: number, height: number): number {
    let symmetryScore = 0;
    let comparisons = 0;
    const centerX = Math.floor(width / 2);

    for (let y = 0; y < height; y += 4) { // Sample every 4th row
      for (let x = 0; x < centerX; x++) {
        const leftIndex = (y * width + x) * 4;
        const rightIndex = (y * width + (width - 1 - x)) * 4;

        const leftR = data[leftIndex];
        const leftG = data[leftIndex + 1];
        const leftB = data[leftIndex + 2];

        const rightR = data[rightIndex];
        const rightG = data[rightIndex + 1];
        const rightB = data[rightIndex + 2];

        const colorDiff = Math.abs(leftR - rightR) + Math.abs(leftG - rightG) + Math.abs(leftB - rightB);
        symmetryScore += Math.max(0, 255 - colorDiff / 3);
        comparisons++;
      }
    }

    return comparisons > 0 ? (symmetryScore / comparisons / 255) * 100 : 0;
  }

  private detectFocalRegions(data: Buffer, width: number, height: number): Array<{ x: number; y: number; width: number; height: number; strength: number }> {
    // Simplified focal region detection using contrast and edge density
    const regions: Array<{ x: number; y: number; width: number; height: number; strength: number }> = [];
    const blockSize = 32;

    for (let y = 0; y < height - blockSize; y += blockSize / 2) {
      for (let x = 0; x < width - blockSize; x += blockSize / 2) {
        const strength = this.calculateRegionInterest(data, width, height, x, y, blockSize, blockSize);
        if (strength > 0.3) {
          regions.push({ x, y, width: blockSize, height: blockSize, strength });
        }
      }
    }

    return regions.sort((a, b) => b.strength - a.strength);
  }

  private calculateRegionInterest(data: Buffer, width: number, height: number, x: number, y: number, w: number, h: number): number {
    let edgeStrength = 0;
    let variance = 0;
    const luminances: number[] = [];

    for (let py = y; py < Math.min(y + h, height); py += 2) {
      for (let px = x; px < Math.min(x + w, width); px += 2) {
        const edge = this.calculateEdgeStrength(data, width, height, px, py);
        edgeStrength += edge;

        const pixelIndex = (py * width + px) * 4;
        const r = data[pixelIndex];
        const g = data[pixelIndex + 1];
        const b = data[pixelIndex + 2];
        const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
        luminances.push(luminance);
      }
    }

    // Calculate variance
    if (luminances.length > 0) {
      const mean = luminances.reduce((sum, l) => sum + l, 0) / luminances.length;
      variance = luminances.reduce((sum, l) => sum + Math.pow(l - mean, 2), 0) / luminances.length;
    }

    return (edgeStrength / (w * h / 4)) / 255 * 0.7 + (variance / 65025) * 0.3;
  }

  private calculateRuleOfThirdsBonus(region: { x: number; y: number; width: number; height: number }, width: number, height: number): number {
    const regionCenterX = region.x + region.width / 2;
    const regionCenterY = region.y + region.height / 2;

    const thirdX1 = width / 3;
    const thirdX2 = 2 * width / 3;
    const thirdY1 = height / 3;
    const thirdY2 = 2 * height / 3;

    // Calculate distance to nearest rule of thirds intersection
    const intersections = [
      { x: thirdX1, y: thirdY1 },
      { x: thirdX1, y: thirdY2 },
      { x: thirdX2, y: thirdY1 },
      { x: thirdX2, y: thirdY2 }
    ];

    let minDistance = Infinity;
    for (const intersection of intersections) {
      const distance = Math.sqrt(
        Math.pow(regionCenterX - intersection.x, 2) + Math.pow(regionCenterY - intersection.y, 2)
      );
      minDistance = Math.min(minDistance, distance);
    }

    const maxDistance = Math.sqrt(width * width + height * height) / 4;
    return Math.max(0, 20 - (minDistance / maxDistance) * 20);
  }

  private extractDominantColors(data: Buffer, width: number, height: number): Array<{ r: number; g: number; b: number; percentage: number }> {
    // Simplified color quantization
    const colorMap = new Map<string, number>();
    const sampleRate = 8; // Sample every 8th pixel

    for (let y = 0; y < height; y += sampleRate) {
      for (let x = 0; x < width; x += sampleRate) {
        const pixelIndex = (y * width + x) * 4;
        const r = Math.floor(data[pixelIndex] / 32) * 32; // Quantize to reduce colors
        const g = Math.floor(data[pixelIndex + 1] / 32) * 32;
        const b = Math.floor(data[pixelIndex + 2] / 32) * 32;
        
        const colorKey = `${r},${g},${b}`;
        colorMap.set(colorKey, (colorMap.get(colorKey) || 0) + 1);
      }
    }

    // Convert to array and sort by frequency
    const totalPixels = Array.from(colorMap.values()).reduce((sum, count) => sum + count, 0);
    const colors = Array.from(colorMap.entries())
      .map(([colorKey, count]) => {
        const [r, g, b] = colorKey.split(',').map(Number);
        return { r, g, b, percentage: (count / totalPixels) * 100 };
      })
      .sort((a, b) => b.percentage - a.percentage);

    return colors.slice(0, 8);
  }

  private calculateColorHarmonyScore(colors: Array<{ r: number; g: number; b: number; percentage: number }>): number {
    if (colors.length < 2) return 50;

    let harmonyScore = 0;
    const totalComparisons = colors.length * (colors.length - 1) / 2;

    for (let i = 0; i < colors.length; i++) {
      for (let j = i + 1; j < colors.length; j++) {
        const color1 = colors[i];
        const color2 = colors[j];
        
        // Convert to HSV for better harmony analysis
        const hsv1 = this.rgbToHsv(color1.r, color1.g, color1.b);
        const hsv2 = this.rgbToHsv(color2.r, color2.g, color2.b);
        
        // Calculate hue difference
        const hueDiff = Math.abs(hsv1.h - hsv2.h);
        const normalizedHueDiff = Math.min(hueDiff, 360 - hueDiff);
        
        // Score based on complementary, triadic, or analogous relationships
        let pairScore = 0;
        if (normalizedHueDiff < 30) pairScore = 80; // Analogous
        else if (normalizedHueDiff > 150 && normalizedHueDiff < 210) pairScore = 90; // Complementary
        else if (normalizedHueDiff > 90 && normalizedHueDiff < 150) pairScore = 75; // Triadic
        else pairScore = 40; // Random

        // Weight by color percentage
        const weight = (color1.percentage + color2.percentage) / 200;
        harmonyScore += pairScore * weight;
      }
    }

    return totalComparisons > 0 ? harmonyScore / totalComparisons : 50;
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

  private calculateOverallScore(scores: CompositionScores): number {
    // Weighted average of all composition metrics
    const weights = {
      rule_of_thirds: 0.25,
      leading_lines: 0.20,
      visual_balance: 0.20,
      symmetry: 0.10,
      focal_point_strength: 0.15,
      color_harmony: 0.10
    };

    return Math.round(
      scores.rule_of_thirds * weights.rule_of_thirds +
      scores.leading_lines * weights.leading_lines +
      scores.visual_balance * weights.visual_balance +
      scores.symmetry * weights.symmetry +
      scores.focal_point_strength * weights.focal_point_strength +
      scores.color_harmony * weights.color_harmony
    );
  }

  private calculateConfidence(
    ruleOfThirdsResult: any,
    leadingLinesResult: any,
    visualBalanceResult: any
  ): number {
    // Calculate confidence based on the consistency and strength of analysis results
    let confidence = 0.5; // Base confidence

    // Higher confidence if we found strong features
    if (ruleOfThirdsResult.intersections.some((i: any) => i.weight > 50)) confidence += 0.2;
    if (leadingLinesResult.lines.some((l: any) => l.strength > 70)) confidence += 0.2;
    if (visualBalanceResult.score > 70) confidence += 0.1;

    return Math.min(1.0, confidence);
  }
}

export const compositionAnalyzer = CompositionAnalyzer.getInstance();