import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { cachedAnalysisServices } from '../../services/cachedAnalysisServices';
import { cacheManager } from '../../services/cacheManager';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';

describe('Performance Load Testing', () => {
  const testImagesDir = path.join(__dirname, '../fixtures/load-test');
  const testImagePaths: string[] = [];
  
  beforeAll(async () => {
    // Create test fixtures directory
    if (!fs.existsSync(testImagesDir)) {
      fs.mkdirSync(testImagesDir, { recursive: true });
    }
    
    // Generate multiple test images for load testing
    console.log('Generating test images for load testing...');
    for (let i = 0; i < 10; i++) {
      const imagePath = path.join(testImagesDir, `load-test-${i}.jpg`);
      
      if (!fs.existsSync(imagePath)) {
        await sharp({
          create: {
            width: 800 + (i * 100),
            height: 600 + (i * 75),
            channels: 3,
            background: { 
              r: 50 + (i * 20), 
              g: 100 + (i * 15), 
              b: 150 + (i * 10) 
            }
          }
        })
        .composite([
          // Add varied elements for different analysis results
          {
            input: await sharp({
              create: {
                width: 100 + (i * 10),
                height: 100 + (i * 10),
                channels: 3,
                background: { r: 255, g: 255 - (i * 20), b: 100 + (i * 15) }
              }
            }).png().toBuffer(),
            left: 100 + (i * 50),
            top: 100 + (i * 40)
          }
        ])
        .jpeg({ quality: 80 + i })
        .toFile(imagePath);
      }
      
      testImagePaths.push(imagePath);
    }
    
    // Initialize cache if available
    try {
      await cacheManager.initialize();
    } catch (error) {
      console.log('Cache not available for load testing');
    }
  }, 60000); // Extended timeout for test setup

  afterAll(async () => {
    // Clean up test images
    for (const imagePath of testImagePaths) {
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }
    
    if (fs.existsSync(testImagesDir)) {
      fs.rmSync(testImagesDir, { recursive: true, force: true });
    }
    
    try {
      await cacheManager.close();
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Concurrent Analysis Load', () => {
    test('should handle multiple concurrent analyses', async () => {
      const concurrency = 5;
      const startTime = Date.now();
      
      const promises = testImagePaths.slice(0, concurrency).map(async (imagePath, index) => {
        return {
          index,
          result: await cachedAnalysisServices.analyzeComposition(imagePath, true),
          imagePath
        };
      });
      
      const results = await Promise.all(promises);
      const endTime = Date.now();
      const totalTime = endTime - startTime;
      
      expect(results.length).toBe(concurrency);
      results.forEach((result, index) => {
        expect(result.result).toBeDefined();
        expect(result.result.scores).toBeDefined();
        expect(result.result.scores.overall_score).toBeGreaterThanOrEqual(0);
        expect(result.result.scores.overall_score).toBeLessThanOrEqual(100);
      });
      
      const averageTime = totalTime / concurrency;
      console.log(`Concurrent Analysis Performance:`);
      console.log(`  ${concurrency} analyses completed in ${totalTime}ms`);
      console.log(`  Average time per analysis: ${averageTime.toFixed(0)}ms`);
      console.log(`  Throughput: ${(concurrency / (totalTime / 1000)).toFixed(2)} analyses/second`);
      
      // Performance expectation: should complete within reasonable time
      expect(totalTime).toBeLessThan(30000); // 30 seconds for 5 concurrent analyses
    }, 45000);

    test('should handle batch processing efficiently', async () => {
      const batchSize = 8;
      const startTime = Date.now();
      
      const result = await cachedAnalysisServices.batchAnalyzeFrames(
        testImagePaths.slice(0, batchSize),
        {
          includeComposition: true,
          includeTechnicalQuality: false, // Skip for faster testing
          includeSceneClassification: false,
          includeEngagementScore: false,
          maxConcurrency: 3
        }
      );
      
      const endTime = Date.now();
      const totalTime = endTime - startTime;
      
      expect(result.results.length).toBe(batchSize);
      expect(result.successCount).toBe(batchSize);
      expect(result.errorCount).toBe(0);
      
      const averageTime = totalTime / batchSize;
      console.log(`Batch Processing Performance:`);
      console.log(`  ${batchSize} frames processed in ${totalTime}ms`);
      console.log(`  Average time per frame: ${averageTime.toFixed(0)}ms`);
      console.log(`  Throughput: ${(batchSize / (totalTime / 1000)).toFixed(2)} frames/second`);
      
      // Performance expectation
      expect(averageTime).toBeLessThan(5000); // Average should be under 5 seconds per frame
    }, 60000);
  });

  describe('Memory Usage Testing', () => {
    test('should not exceed memory limits during batch processing', async () => {
      const initialMemory = process.memoryUsage();
      
      // Process a larger batch to test memory usage
      await cachedAnalysisServices.batchAnalyzeFrames(
        testImagePaths,
        {
          includeComposition: true,
          includeTechnicalQuality: false,
          includeSceneClassification: false,
          includeEngagementScore: false,
          maxConcurrency: 2 // Lower concurrency to test memory management
        }
      );
      
      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      const memoryIncreasesMB = memoryIncrease / 1024 / 1024;
      
      console.log(`Memory Usage Test:`);
      console.log(`  Initial heap: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`);
      console.log(`  Final heap: ${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`);
      console.log(`  Memory increase: ${memoryIncreasesMB.toFixed(2)}MB`);
      
      // Memory should not increase by more than 200MB for batch processing
      expect(memoryIncreasesMB).toBeLessThan(200);
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
        const afterGCMemory = process.memoryUsage();
        console.log(`  After GC: ${(afterGCMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`);
      }
    }, 90000);
  });

  describe('Cache Performance Under Load', () => {
    test('should improve performance with cache', async () => {
      if (!cacheManager.isHealthy()) {
        console.log('Skipping cache performance test - cache not available');
        return;
      }
      
      const testImage = testImagePaths[0];
      
      // First run without cache (force refresh)
      const startNoCacheTime = Date.now();
      await cachedAnalysisServices.analyzeFrameComprehensive(testImage, {
        forceRefresh: true
      });
      const noCacheTime = Date.now() - startNoCacheTime;
      
      // Second run with cache
      const startCacheTime = Date.now();
      const cachedResult = await cachedAnalysisServices.analyzeFrameComprehensive(testImage, {
        forceRefresh: false
      });
      const cacheTime = Date.now() - startCacheTime;
      
      const speedup = noCacheTime / cacheTime;
      
      console.log(`Cache Performance Test:`);
      console.log(`  No cache: ${noCacheTime}ms`);
      console.log(`  With cache: ${cacheTime}ms`);
      console.log(`  Speedup: ${speedup.toFixed(2)}x`);
      console.log(`  Cache hits: ${cachedResult.cacheHits}`);
      console.log(`  Cache misses: ${cachedResult.cacheMisses}`);
      
      // Cache should provide significant speedup
      expect(speedup).toBeGreaterThan(1.5); // At least 1.5x faster with cache
      expect(cachedResult.cacheHits).toBeGreaterThan(0);
    });

    test('should handle cache under concurrent load', async () => {
      if (!cacheManager.isHealthy()) {
        console.log('Skipping concurrent cache test - cache not available');
        return;
      }
      
      // Pre-warm cache
      await cachedAnalysisServices.analyzeComposition(testImagePaths[0], true);
      
      // Run multiple concurrent requests for same image
      const concurrentRequests = 10;
      const startTime = Date.now();
      
      const promises = Array(concurrentRequests).fill(0).map(() =>
        cachedAnalysisServices.analyzeComposition(testImagePaths[0], false)
      );
      
      const results = await Promise.all(promises);
      const endTime = Date.now();
      const totalTime = endTime - startTime;
      
      expect(results.length).toBe(concurrentRequests);
      
      // All results should be identical (from cache)
      const firstResult = results[0];
      results.forEach(result => {
        expect(result.scores.overall_score).toBe(firstResult.scores.overall_score);
      });
      
      const averageTime = totalTime / concurrentRequests;
      console.log(`Concurrent Cache Performance:`);
      console.log(`  ${concurrentRequests} concurrent requests in ${totalTime}ms`);
      console.log(`  Average time per request: ${averageTime.toFixed(0)}ms`);
      
      // Cached requests should be very fast
      expect(averageTime).toBeLessThan(500); // Should average under 500ms with cache
    });
  });

  describe('Stress Testing', () => {
    test('should handle rapid sequential requests', async () => {
      const rapidRequests = 20;
      const startTime = Date.now();
      
      const results = [];
      for (let i = 0; i < rapidRequests; i++) {
        const imageIndex = i % testImagePaths.length;
        const result = await cachedAnalysisServices.analyzeComposition(
          testImagePaths[imageIndex],
          i === 0 // Force refresh only for first request per image
        );
        results.push(result);
      }
      
      const endTime = Date.now();
      const totalTime = endTime - startTime;
      
      expect(results.length).toBe(rapidRequests);
      results.forEach(result => {
        expect(result).toBeDefined();
        expect(result.scores).toBeDefined();
      });
      
      console.log(`Rapid Sequential Requests:`);
      console.log(`  ${rapidRequests} requests in ${totalTime}ms`);
      console.log(`  Average: ${(totalTime / rapidRequests).toFixed(0)}ms per request`);
      console.log(`  Throughput: ${(rapidRequests / (totalTime / 1000)).toFixed(2)} requests/second`);
      
      // Should handle rapid requests without significant degradation
      expect(totalTime / rapidRequests).toBeLessThan(3000); // Average under 3 seconds per request
    }, 120000); // Extended timeout for stress test
  });

  describe('Resource Cleanup', () => {
    test('should clean up resources properly after load testing', async () => {
      // Get initial resource state
      const initialMemory = process.memoryUsage();
      
      // Run a medium load test
      await cachedAnalysisServices.batchAnalyzeFrames(
        testImagePaths.slice(0, 5),
        {
          includeComposition: true,
          maxConcurrency: 3
        }
      );
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      
      console.log(`Resource Cleanup Test:`);
      console.log(`  Memory increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`);
      
      // Memory increase should be minimal after cleanup
      expect(memoryIncrease / 1024 / 1024).toBeLessThan(50); // Less than 50MB increase
    });
  });
});