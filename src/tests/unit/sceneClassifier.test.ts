import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { sceneClassifier } from '../../services/sceneClassifier';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';

describe('Scene Classifier', () => {
  const testImagePath = path.join(__dirname, '../fixtures/test-scene.jpg');
  
  beforeAll(async () => {
    // Create test fixtures directory
    if (!fs.existsSync(path.dirname(testImagePath))) {
      fs.mkdirSync(path.dirname(testImagePath), { recursive: true });
    }
    
    if (!fs.existsSync(testImagePath)) {
      // Create a test image with varied elements for scene classification
      await sharp({
        create: {
          width: 1280,
          height: 720,
          channels: 3,
          background: { r: 135, g: 206, b: 235 } // Sky blue background
        }
      })
      .composite([
        // Ground/landscape element
        {
          input: await sharp({
            create: {
              width: 1280,
              height: 200,
              channels: 3,
              background: { r: 34, g: 139, b: 34 } // Forest green
            }
          }).png().toBuffer(),
          left: 0,
          top: 520
        },
        // Subject/person-like element
        {
          input: await sharp({
            create: {
              width: 80,
              height: 160,
              channels: 3,
              background: { r: 255, g: 220, b: 177 } // Skin tone
            }
          }).png().toBuffer(),
          left: 600,
          top: 360
        },
        // Building/structure element
        {
          input: await sharp({
            create: {
              width: 200,
              height: 300,
              channels: 3,
              background: { r: 128, g: 128, b: 128 } // Gray building
            }
          }).png().toBuffer(),
          left: 100,
          top: 220
        }
      ])
      .jpeg({ quality: 85 })
      .toFile(testImagePath);
    }
  });

  afterAll(async () => {
    // Clean up test image
    if (fs.existsSync(testImagePath)) {
      fs.unlinkSync(testImagePath);
    }
  });

  describe('classifyScene', () => {
    test('should return valid scene classification', async () => {
      const result = await sceneClassifier.classifyScene(testImagePath);
      
      expect(result).toBeDefined();
      expect(result.primary_scene_type).toBeDefined();
      expect(result.confidence_scores).toBeDefined();
      expect(result.shot_type).toBeDefined();
      expect(result.motion_level).toBeDefined();
      expect(result.visual_features).toBeDefined();
      
      // Test confidence scores
      expect(typeof result.confidence_scores.indoor).toBe('number');
      expect(typeof result.confidence_scores.outdoor).toBe('number');
      expect(typeof result.confidence_scores.urban).toBe('number');
      expect(typeof result.confidence_scores.nature).toBe('number');
      expect(typeof result.confidence_scores.portrait).toBe('number');
      expect(typeof result.confidence_scores.landscape).toBe('number');
      
      expect(result.confidence_scores.indoor).toBeGreaterThanOrEqual(0);
      expect(result.confidence_scores.indoor).toBeLessThanOrEqual(1);
      expect(result.confidence_scores.outdoor).toBeGreaterThanOrEqual(0);
      expect(result.confidence_scores.outdoor).toBeLessThanOrEqual(1);
    });

    test('should classify shot type correctly', async () => {
      const result = await sceneClassifier.classifyScene(testImagePath);
      
      expect(['extreme_wide', 'wide', 'medium', 'close', 'extreme_close']).toContain(result.shot_type);
      expect(result.shot_analysis).toBeDefined();
      expect(typeof result.shot_analysis.subject_ratio).toBe('number');
      expect(typeof result.shot_analysis.depth_indicators).toBe('number');
    });

    test('should analyze motion level', async () => {
      const result = await sceneClassifier.classifyScene(testImagePath);
      
      expect(['static', 'low', 'medium', 'high', 'extreme']).toContain(result.motion_level);
      expect(result.motion_analysis).toBeDefined();
      expect(typeof result.motion_analysis.blur_indicators).toBe('number');
      expect(typeof result.motion_analysis.edge_consistency).toBe('number');
      expect(typeof result.motion_analysis.estimated_speed).toBe('number');
    });

    test('should extract visual features', async () => {
      const result = await sceneClassifier.classifyScene(testImagePath);
      
      expect(Array.isArray(result.visual_features.dominant_colors)).toBe(true);
      expect(Array.isArray(result.visual_features.texture_patterns)).toBe(true);
      expect(Array.isArray(result.visual_features.edge_directions)).toBe(true);
      
      result.visual_features.dominant_colors.forEach(color => {
        expect(color).toHaveProperty('r');
        expect(color).toHaveProperty('g');
        expect(color).toHaveProperty('b');
        expect(color).toHaveProperty('percentage');
        expect(typeof color.percentage).toBe('number');
      });
    });

    test('should include context indicators', async () => {
      const result = await sceneClassifier.classifyScene(testImagePath);
      
      expect(result.context_indicators).toBeDefined();
      expect(typeof result.context_indicators.sky_presence).toBe('number');
      expect(typeof result.context_indicators.ground_presence).toBe('number');
      expect(typeof result.context_indicators.human_presence).toBe('number');
      expect(typeof result.context_indicators.building_presence).toBe('number');
      expect(typeof result.context_indicators.vegetation_presence).toBe('number');
      
      expect(result.context_indicators.sky_presence).toBeGreaterThanOrEqual(0);
      expect(result.context_indicators.sky_presence).toBeLessThanOrEqual(1);
    });

    test('should have valid analysis confidence', async () => {
      const result = await sceneClassifier.classifyScene(testImagePath);
      
      expect(result.analysis_confidence).toBeDefined();
      expect(typeof result.analysis_confidence).toBe('number');
      expect(result.analysis_confidence).toBeGreaterThanOrEqual(0);
      expect(result.analysis_confidence).toBeLessThanOrEqual(1);
    });

    test('should throw error for non-existent image', async () => {
      const nonExistentPath = path.join(__dirname, 'non-existent-scene-image.jpg');
      
      await expect(sceneClassifier.classifyScene(nonExistentPath))
        .rejects
        .toThrow();
    });
  });

  describe('Scene Type Classification', () => {
    test('should classify outdoor scenes correctly', async () => {
      // Our test image has sky and ground elements, should classify as outdoor
      const result = await sceneClassifier.classifyScene(testImagePath);
      
      // Should favor outdoor classification due to sky and landscape elements
      expect(result.confidence_scores.outdoor).toBeGreaterThan(result.confidence_scores.indoor);
      expect(result.context_indicators.sky_presence).toBeGreaterThan(0.3);
      expect(result.context_indicators.ground_presence).toBeGreaterThan(0.1);
    });

    test('should detect human presence', async () => {
      // Our test image has a person-like element
      const result = await sceneClassifier.classifyScene(testImagePath);
      
      expect(result.context_indicators.human_presence).toBeGreaterThan(0);
      expect(result.confidence_scores.portrait).toBeGreaterThan(0);
    });

    test('should detect building presence', async () => {
      // Our test image has a building element
      const result = await sceneClassifier.classifyScene(testImagePath);
      
      expect(result.context_indicators.building_presence).toBeGreaterThan(0);
    });
  });

  describe('Performance', () => {
    test('should complete classification within reasonable time', async () => {
      const startTime = Date.now();
      await sceneClassifier.classifyScene(testImagePath);
      const endTime = Date.now();
      
      const classificationTime = endTime - startTime;
      expect(classificationTime).toBeLessThan(8000); // Should complete within 8 seconds
    });
  });

  describe('Consistency', () => {
    test('should return consistent results for same image', async () => {
      const result1 = await sceneClassifier.classifyScene(testImagePath);
      const result2 = await sceneClassifier.classifyScene(testImagePath);
      
      expect(result1.primary_scene_type).toBe(result2.primary_scene_type);
      expect(result1.shot_type).toBe(result2.shot_type);
      expect(result1.motion_level).toBe(result2.motion_level);
      expect(result1.confidence_scores.outdoor).toBe(result2.confidence_scores.outdoor);
      expect(result1.confidence_scores.indoor).toBe(result2.confidence_scores.indoor);
    });
  });

  describe('Edge Cases', () => {
    test('should handle small images', async () => {
      const smallImagePath = path.join(__dirname, '../fixtures/small-scene-test.jpg');
      
      await sharp({
        create: {
          width: 100,
          height: 100,
          channels: 3,
          background: { r: 255, g: 0, b: 0 }
        }
      })
      .jpeg()
      .toFile(smallImagePath);

      try {
        const result = await sceneClassifier.classifyScene(smallImagePath);
        expect(result).toBeDefined();
        expect(result.primary_scene_type).toBeDefined();
        expect(result.analysis_confidence).toBeGreaterThan(0);
      } finally {
        if (fs.existsSync(smallImagePath)) {
          fs.unlinkSync(smallImagePath);
        }
      }
    });

    test('should handle high contrast images', async () => {
      const contrastImagePath = path.join(__dirname, '../fixtures/contrast-scene-test.jpg');
      
      await sharp({
        create: {
          width: 400,
          height: 400,
          channels: 3,
          background: { r: 0, g: 0, b: 0 }
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
          left: 100,
          top: 100
        }
      ])
      .jpeg()
      .toFile(contrastImagePath);

      try {
        const result = await sceneClassifier.classifyScene(contrastImagePath);
        expect(result).toBeDefined();
        expect(result.visual_features.edge_directions.length).toBeGreaterThan(0);
      } finally {
        if (fs.existsSync(contrastImagePath)) {
          fs.unlinkSync(contrastImagePath);
        }
      }
    });
  });
});