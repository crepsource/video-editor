import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { cachedAnalysisServices } from '../../services/cachedAnalysisServices';
import { cacheManager } from '../../services/cacheManager';
import { dataStorageOptimizer } from '../../services/dataStorageOptimizer';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';

describe('Analysis Workflow Integration', () => {
  const testImagePath = path.join(__dirname, '../fixtures/workflow-test.jpg');
  const testVideoId = 'test-video-123';
  
  beforeAll(async () => {
    // Create test fixtures directory
    if (!fs.existsSync(path.dirname(testImagePath))) {
      fs.mkdirSync(path.dirname(testImagePath), { recursive: true });
    }
    
    // Create a comprehensive test image
    if (!fs.existsSync(testImagePath)) {
      await sharp({
        create: {
          width: 1920,
          height: 1080,
          channels: 3,
          background: { r: 70, g: 130, b: 180 } // Blue background
        }
      })
      .composite([
        // Subject at rule of thirds intersection
        {
          input: await sharp({
            create: {
              width: 200,
              height: 200,
              channels: 3,
              background: { r: 255, g: 200, b: 100 } // Warm subject
            }
          }).png().toBuffer(),
          left: 640,  // 1/3 position
          top: 360    // 1/3 position
        },
        // Leading line element
        {
          input: await sharp({
            create: {
              width: 800,
              height: 20,
              channels: 3,
              background: { r: 255, g: 255, b: 255 }
            }
          }).png().toBuffer(),
          left: 100,
          top: 500
        },
        // High contrast element for sharpness
        {
          input: await sharp({
            create: {
              width: 100,
              height: 100,
              channels: 3,
              background: { r: 255, g: 255, b: 255 }
            }
          }).png().toBuffer(),
          left: 1500,
          top: 200
        }
      ])
      .jpeg({ quality: 90 })
      .toFile(testImagePath);
    }

    // Initialize cache manager for testing
    try {
      await cacheManager.initialize();
    } catch (error) {
      console.log('Cache manager not available for integration tests');
    }
  });

  afterAll(async () => {
    // Clean up test files
    if (fs.existsSync(testImagePath)) {
      fs.unlinkSync(testImagePath);
    }
    
    try {
      await cacheManager.close();
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  beforeEach(async () => {
    // Clear cache before each test
    try {
      await cacheManager.clearAll();
    } catch (error) {
      // Cache not available
    }
  });

  describe('Comprehensive Frame Analysis', () => {
    test('should perform complete frame analysis workflow', async () => {
      const startTime = Date.now();
      
      const result = await cachedAnalysisServices.analyzeFrameComprehensive(
        testImagePath,
        {
          includeComposition: true,
          includeTechnicalQuality: true,
          includeSceneClassification: true,
          includeEngagementScore: true,
          forceRefresh: true
        }
      );
      
      const endTime = Date.now();
      const processingTime = endTime - startTime;
      
      // Verify all analysis components are present
      expect(result.composition).toBeDefined();
      expect(result.technicalQuality).toBeDefined();
      expect(result.sceneClassification).toBeDefined();
      expect(result.engagementScore).toBeDefined();
      
      // Verify processing metrics
      expect(result.processingTime).toBeGreaterThan(0);
      expect(result.processingTime).toBeLessThan(30000); // Should complete within 30 seconds
      expect(result.cacheHits).toBe(0); // First run should have no cache hits
      expect(result.cacheMisses).toBe(4); // Should miss all 4 analyses
      
      // Verify composition analysis
      expect(result.composition.scores).toBeDefined();
      expect(result.composition.scores.overall_score).toBeGreaterThanOrEqual(0);
      expect(result.composition.scores.overall_score).toBeLessThanOrEqual(100);
      
      // Verify technical quality analysis
      expect(result.technicalQuality.scores).toBeDefined();
      expect(result.technicalQuality.scores.overall_score).toBeGreaterThanOrEqual(0);
      expect(result.technicalQuality.scores.overall_score).toBeLessThanOrEqual(100);
      
      // Verify scene classification
      expect(result.sceneClassification.primary_scene_type).toBeDefined();
      expect(result.sceneClassification.shot_type).toBeDefined();
      expect(result.sceneClassification.motion_level).toBeDefined();
      
      // Verify engagement score
      expect(result.engagementScore.overall_engagement_score).toBeGreaterThanOrEqual(0);
      expect(result.engagementScore.overall_engagement_score).toBeLessThanOrEqual(100);
      
      console.log(`Comprehensive analysis completed in ${processingTime}ms`);
    }, 60000); // 60 second timeout for comprehensive test

    test('should utilize cache on second analysis', async () => {
      // First analysis
      await cachedAnalysisServices.analyzeFrameComprehensive(testImagePath, {
        forceRefresh: true
      });
      
      // Second analysis should use cache
      const result = await cachedAnalysisServices.analyzeFrameComprehensive(testImagePath, {
        forceRefresh: false
      });
      
      // Should have cache hits if cache is available
      if (cacheManager.isHealthy()) {
        expect(result.cacheHits).toBeGreaterThan(0);
        expect(result.processingTime).toBeLessThan(1000); // Should be much faster with cache
      }
    });
  });

  describe('Batch Processing', () => {
    test('should handle batch frame analysis', async () => {
      // Create multiple test images
      const batchImagePaths = [];
      
      for (let i = 0; i < 3; i++) {
        const imagePath = path.join(__dirname, `../fixtures/batch-test-${i}.jpg`);
        
        await sharp({
          create: {
            width: 640,
            height: 480,
            channels: 3,
            background: { r: 100 + i * 50, g: 100 + i * 30, b: 100 + i * 20 }
          }
        })
        .jpeg()
        .toFile(imagePath);
        
        batchImagePaths.push(imagePath);
      }
      
      try {
        const result = await cachedAnalysisServices.batchAnalyzeFrames(
          batchImagePaths,
          {
            includeComposition: true,
            includeTechnicalQuality: true,
            includeSceneClassification: false, // Skip for faster testing
            includeEngagementScore: false,
            maxConcurrency: 2
          }
        );
        
        expect(result.results).toBeDefined();
        expect(result.results.length).toBe(3);
        expect(result.totalProcessingTime).toBeGreaterThan(0);
        expect(result.totalCacheMisses).toBeGreaterThan(0);
        
        result.results.forEach((frameResult, index) => {
          expect(frameResult.imagePath).toBe(batchImagePaths[index]);
          expect(frameResult.analysis).toBeDefined();
          expect(frameResult.processingTime).toBeGreaterThan(0);
          if (!frameResult.error) {
            expect(frameResult.analysis.composition).toBeDefined();
            expect(frameResult.analysis.technicalQuality).toBeDefined();
          }
        });
        
        console.log(`Batch analysis: ${result.results.length} frames in ${result.totalProcessingTime}ms`);
        
      } finally {
        // Clean up batch test images
        for (const imagePath of batchImagePaths) {
          if (fs.existsSync(imagePath)) {
            fs.unlinkSync(imagePath);
          }
        }
      }
    }, 60000);
  });

  describe('Data Storage Integration', () => {
    test('should compress and store analysis data', async () => {
      const analysisResult = await cachedAnalysisServices.analyzeFrameComprehensive(testImagePath);
      
      // Test data compression
      const originalData = JSON.stringify(analysisResult);
      const compressed = await dataStorageOptimizer.compressData(originalData);
      
      expect(compressed.data).toBeDefined();
      expect(compressed.ratio).toBeGreaterThan(1);
      expect(compressed.data.length).toBeLessThan(originalData.length);
      
      // Test decompression
      const decompressed = await dataStorageOptimizer.decompressData(compressed.data);
      const parsedDecompressed = JSON.parse(decompressed);
      
      expect(parsedDecompressed).toEqual(analysisResult);
    });

    test('should handle storage optimization recommendations', async () => {
      const recommendations = await dataStorageOptimizer.getOptimizationRecommendations();
      
      expect(Array.isArray(recommendations)).toBe(true);
      
      recommendations.forEach(rec => {
        expect(rec).toHaveProperty('type');
        expect(rec).toHaveProperty('priority');
        expect(rec).toHaveProperty('description');
        expect(['compression', 'indexing', 'archival', 'cleanup']).toContain(rec.type);
        expect(['high', 'medium', 'low']).toContain(rec.priority);
      });
    });
  });

  describe('Error Handling', () => {
    test('should handle analysis errors gracefully', async () => {
      const nonExistentPath = path.join(__dirname, 'non-existent-workflow-image.jpg');
      
      const result = await cachedAnalysisServices.batchAnalyzeFrames([nonExistentPath], {
        includeComposition: true
      });
      
      expect(result.results.length).toBe(1);
      expect(result.results[0].error).toBeDefined();
      expect(result.totalCacheMisses).toBeGreaterThan(0);
    });

    test('should continue processing other frames when one fails', async () => {
      const validImagePath = testImagePath;
      const invalidImagePath = path.join(__dirname, 'invalid-image.jpg');
      
      const result = await cachedAnalysisServices.batchAnalyzeFrames(
        [validImagePath, invalidImagePath],
        { includeComposition: true }
      );
      
      expect(result.results.length).toBe(2);
      
      const validResult = result.results.find(r => r.imagePath === validImagePath);
      const invalidResult = result.results.find(r => r.imagePath === invalidImagePath);
      
      expect(validResult).toBeDefined();
      expect(invalidResult).toBeDefined();
      expect(invalidResult?.error).toBeDefined();
    });
  });

  describe('Performance Benchmarks', () => {
    test('should meet performance benchmarks', async () => {
      const benchmarks = {
        compositionAnalysisMaxTime: 5000,
        technicalQualityMaxTime: 8000,
        sceneClassificationMaxTime: 3000,
        engagementScoreMaxTime: 2000,
        comprehensiveAnalysisMaxTime: 15000
      };
      
      // Test individual component performance
      const startComposition = Date.now();
      await cachedAnalysisServices.analyzeComposition(testImagePath, true);
      const compositionTime = Date.now() - startComposition;
      
      const startTechnical = Date.now();
      await cachedAnalysisServices.analyzeTechnicalQuality(testImagePath, true);
      const technicalTime = Date.now() - startTechnical;
      
      const startScene = Date.now();
      await cachedAnalysisServices.classifyScene(testImagePath, true);
      const sceneTime = Date.now() - startScene;
      
      const startEngagement = Date.now();
      await cachedAnalysisServices.calculateEngagementScore(testImagePath, true);
      const engagementTime = Date.now() - startEngagement;
      
      // Verify performance benchmarks
      expect(compositionTime).toBeLessThan(benchmarks.compositionAnalysisMaxTime);
      expect(technicalTime).toBeLessThan(benchmarks.technicalQualityMaxTime);
      expect(sceneTime).toBeLessThan(benchmarks.sceneClassificationMaxTime);
      expect(engagementTime).toBeLessThan(benchmarks.engagementScoreMaxTime);
      
      console.log('Performance Benchmarks:');
      console.log(`  Composition Analysis: ${compositionTime}ms (limit: ${benchmarks.compositionAnalysisMaxTime}ms)`);
      console.log(`  Technical Quality: ${technicalTime}ms (limit: ${benchmarks.technicalQualityMaxTime}ms)`);
      console.log(`  Scene Classification: ${sceneTime}ms (limit: ${benchmarks.sceneClassificationMaxTime}ms)`);
      console.log(`  Engagement Score: ${engagementTime}ms (limit: ${benchmarks.engagementScoreMaxTime}ms)`);
    }, 30000);
  });
});