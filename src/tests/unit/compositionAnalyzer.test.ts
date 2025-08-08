import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { compositionAnalyzer } from '../../services/compositionAnalyzer';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';

describe('Composition Analyzer', () => {
  const testImagePath = path.join(__dirname, '../fixtures/test-image.jpg');
  
  beforeAll(async () => {
    // Create a test image if it doesn't exist
    if (!fs.existsSync(path.dirname(testImagePath))) {
      fs.mkdirSync(path.dirname(testImagePath), { recursive: true });
    }
    
    if (!fs.existsSync(testImagePath)) {
      // Create a simple test image with Sharp
      await sharp({
        create: {
          width: 640,
          height: 480,
          channels: 3,
          background: { r: 100, g: 150, b: 200 }
        }
      })
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

  describe('analyzeComposition', () => {
    test('should return valid composition analysis', async () => {
      const result = await compositionAnalyzer.analyzeComposition(testImagePath);
      
      expect(result).toBeDefined();
      expect(result.scores).toBeDefined();
      expect(result.scores.rule_of_thirds).toBeGreaterThanOrEqual(0);
      expect(result.scores.rule_of_thirds).toBeLessThanOrEqual(100);
      expect(result.scores.leading_lines).toBeGreaterThanOrEqual(0);
      expect(result.scores.leading_lines).toBeLessThanOrEqual(100);
      expect(result.scores.visual_balance).toBeGreaterThanOrEqual(0);
      expect(result.scores.visual_balance).toBeLessThanOrEqual(100);
      expect(result.scores.overall_score).toBeGreaterThanOrEqual(0);
      expect(result.scores.overall_score).toBeLessThanOrEqual(100);
    });

    test('should include grid intersections', async () => {
      const result = await compositionAnalyzer.analyzeComposition(testImagePath);
      
      expect(result.grid_intersections).toBeDefined();
      expect(Array.isArray(result.grid_intersections)).toBe(true);
      expect(result.grid_intersections.length).toBeGreaterThan(0);
      
      result.grid_intersections.forEach(intersection => {
        expect(intersection).toHaveProperty('x');
        expect(intersection).toHaveProperty('y');
        expect(intersection).toHaveProperty('weight');
        expect(typeof intersection.x).toBe('number');
        expect(typeof intersection.y).toBe('number');
        expect(typeof intersection.weight).toBe('number');
      });
    });

    test('should include focal regions', async () => {
      const result = await compositionAnalyzer.analyzeComposition(testImagePath);
      
      expect(result.focal_regions).toBeDefined();
      expect(Array.isArray(result.focal_regions)).toBe(true);
      
      result.focal_regions.forEach(region => {
        expect(region).toHaveProperty('x');
        expect(region).toHaveProperty('y');
        expect(region).toHaveProperty('width');
        expect(region).toHaveProperty('height');
        expect(region).toHaveProperty('strength');
        expect(typeof region.strength).toBe('number');
        expect(region.strength).toBeGreaterThanOrEqual(0);
        expect(region.strength).toBeLessThanOrEqual(1);
      });
    });

    test('should include dominant lines', async () => {
      const result = await compositionAnalyzer.analyzeComposition(testImagePath);
      
      expect(result.dominant_lines).toBeDefined();
      expect(Array.isArray(result.dominant_lines)).toBe(true);
      
      result.dominant_lines.forEach(line => {
        expect(line).toHaveProperty('angle');
        expect(line).toHaveProperty('strength');
        expect(line).toHaveProperty('type');
        expect(typeof line.angle).toBe('number');
        expect(typeof line.strength).toBe('number');
        expect(['horizontal', 'vertical', 'diagonal']).toContain(line.type);
      });
    });

    test('should have valid balance center', async () => {
      const result = await compositionAnalyzer.analyzeComposition(testImagePath);
      
      expect(result.balance_center).toBeDefined();
      expect(result.balance_center).toHaveProperty('x');
      expect(result.balance_center).toHaveProperty('y');
      expect(typeof result.balance_center.x).toBe('number');
      expect(typeof result.balance_center.y).toBe('number');
    });

    test('should have analysis confidence', async () => {
      const result = await compositionAnalyzer.analyzeComposition(testImagePath);
      
      expect(result.analysis_confidence).toBeDefined();
      expect(typeof result.analysis_confidence).toBe('number');
      expect(result.analysis_confidence).toBeGreaterThanOrEqual(0);
      expect(result.analysis_confidence).toBeLessThanOrEqual(1);
    });

    test('should throw error for non-existent image', async () => {
      const nonExistentPath = path.join(__dirname, 'non-existent-image.jpg');
      
      await expect(compositionAnalyzer.analyzeComposition(nonExistentPath))
        .rejects
        .toThrow();
    });
  });

  describe('Rule of Thirds Analysis', () => {
    test('should calculate rule of thirds for known composition', async () => {
      // Create an image with a subject at rule of thirds intersection
      const ruleOfThirdsTestPath = path.join(__dirname, '../fixtures/rule-of-thirds-test.jpg');
      
      await sharp({
        create: {
          width: 600,
          height: 400,
          channels: 3,
          background: { r: 50, g: 50, b: 50 }
        }
      })
      .composite([{
        input: await sharp({
          create: {
            width: 50,
            height: 50,
            channels: 3,
            background: { r: 255, g: 255, b: 255 }
          }
        }).png().toBuffer(),
        left: 200, // 1/3 position
        top: 133   // 1/3 position
      }])
      .png()
      .toFile(ruleOfThirdsTestPath);

      const result = await compositionAnalyzer.analyzeComposition(ruleOfThirdsTestPath);
      
      // Should have higher rule of thirds score due to positioned element
      expect(result.scores.rule_of_thirds).toBeGreaterThan(0);
      
      // Clean up
      fs.unlinkSync(ruleOfThirdsTestPath);
    });
  });

  describe('Performance', () => {
    test('should complete analysis within reasonable time', async () => {
      const startTime = Date.now();
      await compositionAnalyzer.analyzeComposition(testImagePath);
      const endTime = Date.now();
      
      const analysisTime = endTime - startTime;
      expect(analysisTime).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });

  describe('Consistency', () => {
    test('should return consistent results for same image', async () => {
      const result1 = await compositionAnalyzer.analyzeComposition(testImagePath);
      const result2 = await compositionAnalyzer.analyzeComposition(testImagePath);
      
      expect(result1.scores.rule_of_thirds).toBe(result2.scores.rule_of_thirds);
      expect(result1.scores.leading_lines).toBe(result2.scores.leading_lines);
      expect(result1.scores.visual_balance).toBe(result2.scores.visual_balance);
      expect(result1.scores.overall_score).toBe(result2.scores.overall_score);
    });
  });
});