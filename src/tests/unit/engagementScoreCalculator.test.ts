import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { engagementScoreCalculator } from '../../services/engagementScoreCalculator';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';

describe('Engagement Score Calculator', () => {
  const testImagePath = path.join(__dirname, '../fixtures/test-engagement.jpg');
  
  beforeAll(async () => {
    // Create test fixtures directory
    if (!fs.existsSync(path.dirname(testImagePath))) {
      fs.mkdirSync(path.dirname(testImagePath), { recursive: true });
    }
    
    if (!fs.existsSync(testImagePath)) {
      // Create an engaging test image with multiple elements
      await sharp({
        create: {
          width: 1920,
          height: 1080,
          channels: 3,
          background: { r: 41, g: 128, b: 185 } // Engaging blue background
        }
      })
      .composite([
        // Bright attention-grabbing element (represents action/movement)
        {
          input: await sharp({
            create: {
              width: 300,
              height: 200,
              channels: 3,
              background: { r: 255, g: 69, b: 0 } // Red-orange for attention
            }
          }).png().toBuffer(),
          left: 600,
          top: 300
        },
        // Human-like figure for human interest
        {
          input: await sharp({
            create: {
              width: 120,
              height: 300,
              channels: 3,
              background: { r: 255, g: 220, b: 177 } // Skin tone
            }
          }).png().toBuffer(),
          left: 800,
          top: 400
        },
        // Face-like circular element
        {
          input: await sharp({
            create: {
              width: 80,
              height: 80,
              channels: 4,
              background: { r: 255, g: 220, b: 177, alpha: 255 }
            }
          }).png().toBuffer(),
          left: 820,
          top: 420
        },
        // High contrast element for visual interest
        {
          input: await sharp({
            create: {
              width: 200,
              height: 50,
              channels: 3,
              background: { r: 255, g: 255, b: 255 }
            }
          }).png().toBuffer(),
          left: 200,
          top: 800
        },
        // Colorful element for visual appeal
        {
          input: await sharp({
            create: {
              width: 150,
              height: 150,
              channels: 3,
              background: { r: 255, g: 215, b: 0 } // Gold
            }
          }).png().toBuffer(),
          left: 1400,
          top: 200
        }
      ])
      .jpeg({ quality: 90 })
      .toFile(testImagePath);
    }
  });

  afterAll(async () => {
    // Clean up test image
    if (fs.existsSync(testImagePath)) {
      fs.unlinkSync(testImagePath);
    }
  });

  describe('calculateEngagementScore', () => {
    test('should return valid engagement analysis', async () => {
      const result = await engagementScoreCalculator.calculateEngagementScore(testImagePath);
      
      expect(result).toBeDefined();
      expect(result.overall_engagement_score).toBeDefined();
      expect(result.engagement_factors).toBeDefined();
      expect(result.attention_metrics).toBeDefined();
      expect(result.emotional_indicators).toBeDefined();
      expect(result.predicted_retention).toBeDefined();
      
      // Test overall score range
      expect(result.overall_engagement_score).toBeGreaterThanOrEqual(0);
      expect(result.overall_engagement_score).toBeLessThanOrEqual(100);
    });

    test('should analyze visual interest factors', async () => {
      const result = await engagementScoreCalculator.calculateEngagementScore(testImagePath);
      
      expect(result.engagement_factors).toBeDefined();
      expect(typeof result.engagement_factors.visual_interest).toBe('number');
      expect(typeof result.engagement_factors.color_vibrancy).toBe('number');
      expect(typeof result.engagement_factors.contrast_appeal).toBe('number');
      expect(typeof result.engagement_factors.composition_strength).toBe('number');
      expect(typeof result.engagement_factors.uniqueness_factor).toBe('number');
      
      expect(result.engagement_factors.visual_interest).toBeGreaterThanOrEqual(0);
      expect(result.engagement_factors.visual_interest).toBeLessThanOrEqual(100);
      expect(result.engagement_factors.color_vibrancy).toBeGreaterThanOrEqual(0);
      expect(result.engagement_factors.color_vibrancy).toBeLessThanOrEqual(100);
    });

    test('should analyze attention metrics', async () => {
      const result = await engagementScoreCalculator.calculateEngagementScore(testImagePath);
      
      expect(result.attention_metrics).toBeDefined();
      expect(typeof result.attention_metrics.focal_strength).toBe('number');
      expect(typeof result.attention_metrics.eye_catching_elements).toBe('number');
      expect(typeof result.attention_metrics.visual_hierarchy).toBe('number');
      expect(typeof result.attention_metrics.distraction_level).toBe('number');
      
      expect(result.attention_metrics.focal_strength).toBeGreaterThanOrEqual(0);
      expect(result.attention_metrics.focal_strength).toBeLessThanOrEqual(100);
      expect(result.attention_metrics.distraction_level).toBeGreaterThanOrEqual(0);
      expect(result.attention_metrics.distraction_level).toBeLessThanOrEqual(100);
    });

    test('should analyze emotional indicators', async () => {
      const result = await engagementScoreCalculator.calculateEngagementScore(testImagePath);
      
      expect(result.emotional_indicators).toBeDefined();
      expect(typeof result.emotional_indicators.human_connection).toBe('number');
      expect(typeof result.emotional_indicators.emotional_appeal).toBe('number');
      expect(typeof result.emotional_indicators.mood_positive).toBe('number');
      expect(typeof result.emotional_indicators.energy_level).toBe('number');
      
      expect(result.emotional_indicators.human_connection).toBeGreaterThanOrEqual(0);
      expect(result.emotional_indicators.human_connection).toBeLessThanOrEqual(100);
      expect(result.emotional_indicators.emotional_appeal).toBeGreaterThanOrEqual(0);
      expect(result.emotional_indicators.emotional_appeal).toBeLessThanOrEqual(100);
    });

    test('should include action intensity analysis', async () => {
      const result = await engagementScoreCalculator.calculateEngagementScore(testImagePath);
      
      expect(result.action_intensity).toBeDefined();
      expect(typeof result.action_intensity.movement_indicators).toBe('number');
      expect(typeof result.action_intensity.dynamic_elements).toBe('number');
      expect(typeof result.action_intensity.energy_distribution).toBe('number');
      expect(typeof result.action_intensity.temporal_interest).toBe('number');
      
      expect(result.action_intensity.movement_indicators).toBeGreaterThanOrEqual(0);
      expect(result.action_intensity.movement_indicators).toBeLessThanOrEqual(100);
    });

    test('should provide retention predictions', async () => {
      const result = await engagementScoreCalculator.calculateEngagementScore(testImagePath);
      
      expect(result.predicted_retention).toBeDefined();
      expect(typeof result.predicted_retention.watch_time_score).toBe('number');
      expect(typeof result.predicted_retention.click_through_potential).toBe('number');
      expect(typeof result.predicted_retention.shareability_score).toBe('number');
      expect(typeof result.predicted_retention.memorability_factor).toBe('number');
      
      expect(result.predicted_retention.watch_time_score).toBeGreaterThanOrEqual(0);
      expect(result.predicted_retention.watch_time_score).toBeLessThanOrEqual(100);
      expect(result.predicted_retention.shareability_score).toBeGreaterThanOrEqual(0);
      expect(result.predicted_retention.shareability_score).toBeLessThanOrEqual(100);
    });

    test('should detect human presence correctly', async () => {
      // Our test image has human-like elements
      const result = await engagementScoreCalculator.calculateEngagementScore(testImagePath);
      
      expect(result.human_interest).toBeDefined();
      expect(typeof result.human_interest.face_presence).toBe('number');
      expect(typeof result.human_interest.human_activity).toBe('number');
      expect(typeof result.human_interest.social_elements).toBe('number');
      expect(typeof result.human_interest.relatable_content).toBe('number');
      
      // Should detect some level of human presence due to our test elements
      expect(result.human_interest.face_presence).toBeGreaterThan(0);
      expect(result.emotional_indicators.human_connection).toBeGreaterThan(0);
    });

    test('should include trend analysis', async () => {
      const result = await engagementScoreCalculator.calculateEngagementScore(testImagePath);
      
      expect(result.trend_factors).toBeDefined();
      expect(Array.isArray(result.trend_factors.style_elements)).toBe(true);
      expect(typeof result.trend_factors.contemporary_appeal).toBe('number');
      expect(typeof result.trend_factors.timeless_quality).toBe('number');
      expect(typeof result.trend_factors.viral_potential).toBe('number');
      
      result.trend_factors.style_elements.forEach(element => {
        expect(typeof element).toBe('string');
      });
    });

    test('should have valid analysis confidence', async () => {
      const result = await engagementScoreCalculator.calculateEngagementScore(testImagePath);
      
      expect(result.analysis_confidence).toBeDefined();
      expect(typeof result.analysis_confidence).toBe('number');
      expect(result.analysis_confidence).toBeGreaterThanOrEqual(0);
      expect(result.analysis_confidence).toBeLessThanOrEqual(1);
    });

    test('should throw error for non-existent image', async () => {
      const nonExistentPath = path.join(__dirname, 'non-existent-engagement-image.jpg');
      
      await expect(engagementScoreCalculator.calculateEngagementScore(nonExistentPath))
        .rejects
        .toThrow();
    });
  });

  describe('Color Vibrancy Analysis', () => {
    test('should detect vibrant colors in engaging image', async () => {
      // Our test image has bright, vibrant colors
      const result = await engagementScoreCalculator.calculateEngagementScore(testImagePath);
      
      expect(result.engagement_factors.color_vibrancy).toBeGreaterThan(30);
      expect(result.color_analysis).toBeDefined();
      expect(result.color_analysis.vibrancy_score).toBeGreaterThan(0);
      expect(Array.isArray(result.color_analysis.dominant_colors)).toBe(true);
    });
  });

  describe('Visual Hierarchy Analysis', () => {
    test('should analyze visual hierarchy effectively', async () => {
      const result = await engagementScoreCalculator.calculateEngagementScore(testImagePath);
      
      expect(result.attention_metrics.visual_hierarchy).toBeGreaterThan(0);
      expect(result.attention_metrics.focal_strength).toBeGreaterThan(0);
      
      // Should detect eye-catching elements due to our bright contrasting elements
      expect(result.attention_metrics.eye_catching_elements).toBeGreaterThan(20);
    });
  });

  describe('Performance', () => {
    test('should complete analysis within reasonable time', async () => {
      const startTime = Date.now();
      await engagementScoreCalculator.calculateEngagementScore(testImagePath);
      const endTime = Date.now();
      
      const analysisTime = endTime - startTime;
      expect(analysisTime).toBeLessThan(15000); // Should complete within 15 seconds
    });
  });

  describe('Consistency', () => {
    test('should return consistent results for same image', async () => {
      const result1 = await engagementScoreCalculator.calculateEngagementScore(testImagePath);
      const result2 = await engagementScoreCalculator.calculateEngagementScore(testImagePath);
      
      expect(result1.overall_engagement_score).toBe(result2.overall_engagement_score);
      expect(result1.engagement_factors.visual_interest).toBe(result2.engagement_factors.visual_interest);
      expect(result1.attention_metrics.focal_strength).toBe(result2.attention_metrics.focal_strength);
      expect(result1.emotional_indicators.human_connection).toBe(result2.emotional_indicators.human_connection);
    });
  });

  describe('Score Validation', () => {
    test('should have scores that correlate logically', async () => {
      const result = await engagementScoreCalculator.calculateEngagementScore(testImagePath);
      
      // High visual interest should correlate with higher overall engagement
      if (result.engagement_factors.visual_interest > 70) {
        expect(result.overall_engagement_score).toBeGreaterThan(40);
      }
      
      // High human connection should boost emotional appeal
      if (result.emotional_indicators.human_connection > 50) {
        expect(result.emotional_indicators.emotional_appeal).toBeGreaterThan(30);
      }
      
      // High attention metrics should contribute to retention
      if (result.attention_metrics.focal_strength > 60) {
        expect(result.predicted_retention.watch_time_score).toBeGreaterThan(40);
      }
    });
  });

  describe('Edge Cases', () => {
    test('should handle monochrome images', async () => {
      const monoImagePath = path.join(__dirname, '../fixtures/mono-engagement-test.jpg');
      
      await sharp({
        create: {
          width: 640,
          height: 480,
          channels: 3,
          background: { r: 128, g: 128, b: 128 }
        }
      })
      .composite([
        {
          input: await sharp({
            create: {
              width: 200,
              height: 200,
              channels: 3,
              background: { r: 255, g: 255, b: 255 }
            }
          }).png().toBuffer(),
          left: 220,
          top: 140
        }
      ])
      .jpeg()
      .toFile(monoImagePath);

      try {
        const result = await engagementScoreCalculator.calculateEngagementScore(monoImagePath);
        expect(result).toBeDefined();
        expect(result.overall_engagement_score).toBeGreaterThanOrEqual(0);
        // Monochrome should have lower color vibrancy
        expect(result.engagement_factors.color_vibrancy).toBeLessThan(30);
      } finally {
        if (fs.existsSync(monoImagePath)) {
          fs.unlinkSync(monoImagePath);
        }
      }
    });

    test('should handle low contrast images', async () => {
      const lowContrastPath = path.join(__dirname, '../fixtures/low-contrast-engagement-test.jpg');
      
      await sharp({
        create: {
          width: 400,
          height: 300,
          channels: 3,
          background: { r: 120, g: 120, b: 120 }
        }
      })
      .composite([
        {
          input: await sharp({
            create: {
              width: 100,
              height: 100,
              channels: 3,
              background: { r: 130, g: 130, b: 130 }
            }
          }).png().toBuffer(),
          left: 150,
          top: 100
        }
      ])
      .jpeg()
      .toFile(lowContrastPath);

      try {
        const result = await engagementScoreCalculator.calculateEngagementScore(lowContrastPath);
        expect(result).toBeDefined();
        expect(result.overall_engagement_score).toBeGreaterThanOrEqual(0);
        // Low contrast should have lower visual interest
        expect(result.engagement_factors.contrast_appeal).toBeLessThan(40);
      } finally {
        if (fs.existsSync(lowContrastPath)) {
          fs.unlinkSync(lowContrastPath);
        }
      }
    });
  });
});