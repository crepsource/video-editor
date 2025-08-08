import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { technicalQualityAnalyzer } from '../../services/technicalQualityAnalyzer';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';

describe('Technical Quality Analyzer', () => {
  const testImagePath = path.join(__dirname, '../fixtures/test-tech-quality.jpg');
  
  beforeAll(async () => {
    // Create test fixtures directory
    if (!fs.existsSync(path.dirname(testImagePath))) {
      fs.mkdirSync(path.dirname(testImagePath), { recursive: true });
    }
    
    if (!fs.existsSync(testImagePath)) {
      // Create a test image with some detail
      await sharp({
        create: {
          width: 800,
          height: 600,
          channels: 3,
          background: { r: 128, g: 128, b: 128 }
        }
      })
      .composite([
        // Add some high contrast elements for sharpness testing
        {
          input: await sharp({
            create: {
              width: 100,
              height: 100,
              channels: 3,
              background: { r: 255, g: 255, b: 255 }
            }
          }).png().toBuffer(),
          left: 100,
          top: 100
        },
        {
          input: await sharp({
            create: {
              width: 100,
              height: 100,
              channels: 3,
              background: { r: 0, g: 0, b: 0 }
            }
          }).png().toBuffer(),
          left: 300,
          top: 200
        }
      ])
      .png()
      .toFile(testImagePath);
    }
  });

  afterAll(async () => {
    // Clean up test image
    if (fs.existsSync(testImagePath)) {
      fs.unlinkSync(testImagePath);
    }
  });

  describe('analyzeTechnicalQuality', () => {
    test('should return valid technical quality analysis', async () => {
      const result = await technicalQualityAnalyzer.analyzeTechnicalQuality(testImagePath);
      
      expect(result).toBeDefined();
      expect(result.scores).toBeDefined();
      
      // Test all score components
      expect(result.scores.sharpness).toBeGreaterThanOrEqual(0);
      expect(result.scores.sharpness).toBeLessThanOrEqual(100);
      expect(result.scores.exposure).toBeGreaterThanOrEqual(0);
      expect(result.scores.exposure).toBeLessThanOrEqual(100);
      expect(result.scores.contrast).toBeGreaterThanOrEqual(0);
      expect(result.scores.contrast).toBeLessThanOrEqual(100);
      expect(result.scores.color_saturation).toBeGreaterThanOrEqual(0);
      expect(result.scores.color_saturation).toBeLessThanOrEqual(100);
      expect(result.scores.noise_level).toBeGreaterThanOrEqual(0);
      expect(result.scores.noise_level).toBeLessThanOrEqual(100);
      expect(result.scores.motion_blur).toBeGreaterThanOrEqual(0);
      expect(result.scores.motion_blur).toBeLessThanOrEqual(100);
      expect(result.scores.overall_score).toBeGreaterThanOrEqual(0);
      expect(result.scores.overall_score).toBeLessThanOrEqual(100);
    });

    test('should include sharpness details', async () => {
      const result = await technicalQualityAnalyzer.analyzeTechnicalQuality(testImagePath);
      
      expect(result.sharpness_details).toBeDefined();
      expect(result.sharpness_details.variance).toBeGreaterThanOrEqual(0);
      expect(result.sharpness_details.edge_density).toBeGreaterThanOrEqual(0);
      expect(result.sharpness_details.max_gradient).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.sharpness_details.focus_regions)).toBe(true);
      
      result.sharpness_details.focus_regions.forEach(region => {
        expect(region).toHaveProperty('x');
        expect(region).toHaveProperty('y');
        expect(region).toHaveProperty('width');
        expect(region).toHaveProperty('height');
        expect(region).toHaveProperty('sharpness');
        expect(typeof region.sharpness).toBe('number');
      });
    });

    test('should include exposure details', async () => {
      const result = await technicalQualityAnalyzer.analyzeTechnicalQuality(testImagePath);
      
      expect(result.exposure_details).toBeDefined();
      expect(result.exposure_details.histogram).toBeDefined();
      expect(result.exposure_details.histogram.shadows).toBeGreaterThanOrEqual(0);
      expect(result.exposure_details.histogram.shadows).toBeLessThanOrEqual(1);
      expect(result.exposure_details.histogram.midtones).toBeGreaterThanOrEqual(0);
      expect(result.exposure_details.histogram.midtones).toBeLessThanOrEqual(1);
      expect(result.exposure_details.histogram.highlights).toBeGreaterThanOrEqual(0);
      expect(result.exposure_details.histogram.highlights).toBeLessThanOrEqual(1);
      
      expect(result.exposure_details.clipped_pixels).toBeDefined();
      expect(result.exposure_details.clipped_pixels.black).toBeGreaterThanOrEqual(0);
      expect(result.exposure_details.clipped_pixels.white).toBeGreaterThanOrEqual(0);
      
      expect(result.exposure_details.dynamic_range).toBeGreaterThanOrEqual(0);
      expect(result.exposure_details.dynamic_range).toBeLessThanOrEqual(255);
    });

    test('should include color details', async () => {
      const result = await technicalQualityAnalyzer.analyzeTechnicalQuality(testImagePath);
      
      expect(result.color_details).toBeDefined();
      expect(Array.isArray(result.color_details.saturation_distribution)).toBe(true);
      expect(result.color_details.color_cast).toBeDefined();
      expect(typeof result.color_details.color_cast.detected).toBe('boolean');
      expect(typeof result.color_details.vibrance).toBe('number');
      
      result.color_details.saturation_distribution.forEach(color => {
        expect(color).toHaveProperty('hue');
        expect(color).toHaveProperty('saturation');
        expect(color).toHaveProperty('percentage');
        expect(typeof color.hue).toBe('number');
        expect(typeof color.saturation).toBe('number');
        expect(typeof color.percentage).toBe('number');
      });
    });

    test('should include noise details', async () => {
      const result = await technicalQualityAnalyzer.analyzeTechnicalQuality(testImagePath);
      
      expect(result.noise_details).toBeDefined();
      expect(typeof result.noise_details.grain_score).toBe('number');
      expect(typeof result.noise_details.pattern_noise).toBe('number');
      expect(typeof result.noise_details.iso_estimate).toBe('number');
      expect(typeof result.noise_details.clean_regions).toBe('number');
      
      expect(result.noise_details.grain_score).toBeGreaterThanOrEqual(0);
      expect(result.noise_details.grain_score).toBeLessThanOrEqual(100);
      expect(result.noise_details.clean_regions).toBeGreaterThanOrEqual(0);
      expect(result.noise_details.clean_regions).toBeLessThanOrEqual(100);
    });

    test('should have valid analysis confidence', async () => {
      const result = await technicalQualityAnalyzer.analyzeTechnicalQuality(testImagePath);
      
      expect(result.analysis_confidence).toBeDefined();
      expect(typeof result.analysis_confidence).toBe('number');
      expect(result.analysis_confidence).toBeGreaterThanOrEqual(0);
      expect(result.analysis_confidence).toBeLessThanOrEqual(1);
    });

    test('should throw error for non-existent image', async () => {
      const nonExistentPath = path.join(__dirname, 'non-existent-tech-image.jpg');
      
      await expect(technicalQualityAnalyzer.analyzeTechnicalQuality(nonExistentPath))
        .rejects
        .toThrow();
    });
  });

  describe('Sharpness Analysis', () => {
    test('should detect high contrast edges as sharp', async () => {
      // Our test image has high contrast elements, should score well on sharpness
      const result = await technicalQualityAnalyzer.analyzeTechnicalQuality(testImagePath);
      
      expect(result.scores.sharpness).toBeGreaterThan(0);
      expect(result.sharpness_details.edge_density).toBeGreaterThan(0);
      expect(result.sharpness_details.focus_regions.length).toBeGreaterThan(0);
    });
  });

  describe('Exposure Analysis', () => {
    test('should analyze histogram distribution', async () => {
      const result = await technicalQualityAnalyzer.analyzeTechnicalQuality(testImagePath);
      
      const histogram = result.exposure_details.histogram;
      const total = histogram.shadows + histogram.midtones + histogram.highlights;
      
      // Histogram should roughly sum to 1 (allowing for rounding)
      expect(total).toBeGreaterThan(0.9);
      expect(total).toBeLessThan(1.1);
    });
  });

  describe('Performance', () => {
    test('should complete analysis within reasonable time', async () => {
      const startTime = Date.now();
      await technicalQualityAnalyzer.analyzeTechnicalQuality(testImagePath);
      const endTime = Date.now();
      
      const analysisTime = endTime - startTime;
      expect(analysisTime).toBeLessThan(10000); // Should complete within 10 seconds
    });
  });

  describe('Consistency', () => {
    test('should return consistent results for same image', async () => {
      const result1 = await technicalQualityAnalyzer.analyzeTechnicalQuality(testImagePath);
      const result2 = await technicalQualityAnalyzer.analyzeTechnicalQuality(testImagePath);
      
      expect(result1.scores.sharpness).toBe(result2.scores.sharpness);
      expect(result1.scores.exposure).toBe(result2.scores.exposure);
      expect(result1.scores.contrast).toBe(result2.scores.contrast);
      expect(result1.scores.overall_score).toBe(result2.scores.overall_score);
    });
  });
});