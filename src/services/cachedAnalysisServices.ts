import { cacheManager } from './cacheManager';
import { compositionAnalyzer } from './compositionAnalyzer';
import { technicalQualityAnalyzer } from './technicalQualityAnalyzer';
import { sceneClassifier } from './sceneClassifier';
import { engagementScoreCalculator } from './engagementScoreCalculator';

/**
 * Cached wrapper services for all analysis modules
 * Provides automatic caching and cache-aware analysis
 */

export class CachedAnalysisServices {
  private static instance: CachedAnalysisServices;

  private constructor() {}

  public static getInstance(): CachedAnalysisServices {
    if (!CachedAnalysisServices.instance) {
      CachedAnalysisServices.instance = new CachedAnalysisServices();
    }
    return CachedAnalysisServices.instance;
  }

  /**
   * Cached composition analysis
   */
  async analyzeComposition(imagePath: string, forceRefresh = false): Promise<any> {
    const cacheKey = `composition-${imagePath}`;
    
    // Try to get from cache first
    if (!forceRefresh) {
      const cached = await cacheManager.getCachedCompositionAnalysis(imagePath);
      if (cached) {
        console.log(`✨ Cache hit: Composition analysis for ${imagePath}`);
        return cached;
      }
    }

    // Perform analysis
    console.log(`🔄 Computing composition analysis for ${imagePath}`);
    const analysis = await compositionAnalyzer.analyzeComposition(imagePath);
    
    // Cache the result
    await cacheManager.cacheCompositionAnalysis(
      imagePath, 
      analysis, 
      ['image-analysis', 'composition']
    );
    
    return analysis;
  }

  /**
   * Cached technical quality analysis
   */
  async analyzeTechnicalQuality(imagePath: string, forceRefresh = false): Promise<any> {
    // Try to get from cache first
    if (!forceRefresh) {
      const cached = await cacheManager.getCachedTechnicalQuality(imagePath);
      if (cached) {
        console.log(`✨ Cache hit: Technical quality analysis for ${imagePath}`);
        return cached;
      }
    }

    // Perform analysis
    console.log(`🔄 Computing technical quality analysis for ${imagePath}`);
    const analysis = await technicalQualityAnalyzer.analyzeTechnicalQuality(imagePath);
    
    // Cache the result
    await cacheManager.cacheTechnicalQuality(
      imagePath, 
      analysis, 
      ['image-analysis', 'technical-quality']
    );
    
    return analysis;
  }

  /**
   * Cached scene classification
   */
  async classifyScene(imagePath: string, forceRefresh = false): Promise<any> {
    // Try to get from cache first
    if (!forceRefresh) {
      const cached = await cacheManager.getCachedSceneClassification(imagePath);
      if (cached) {
        console.log(`✨ Cache hit: Scene classification for ${imagePath}`);
        return cached;
      }
    }

    // Perform classification
    console.log(`🔄 Computing scene classification for ${imagePath}`);
    const classification = await sceneClassifier.classifyScene(imagePath);
    
    // Cache the result
    await cacheManager.cacheSceneClassification(
      imagePath, 
      classification, 
      ['image-analysis', 'scene-classification']
    );
    
    return classification;
  }

  /**
   * Cached engagement score calculation
   */
  async calculateEngagementScore(imagePath: string, forceRefresh = false): Promise<any> {
    // Try to get from cache first
    if (!forceRefresh) {
      const cached = await cacheManager.getCachedEngagementScore(imagePath);
      if (cached) {
        console.log(`✨ Cache hit: Engagement score for ${imagePath}`);
        return cached;
      }
    }

    // Perform engagement calculation
    console.log(`🔄 Computing engagement score for ${imagePath}`);
    const engagement = await engagementScoreCalculator.calculateEngagementScore(imagePath);
    
    // Cache the result
    await cacheManager.cacheEngagementScore(
      imagePath, 
      engagement, 
      ['image-analysis', 'engagement-score']
    );
    
    return engagement;
  }

  /**
   * Comprehensive cached analysis - all services at once
   */
  async analyzeFrameComprehensive(
    imagePath: string, 
    options: {
      includeComposition?: boolean;
      includeTechnicalQuality?: boolean;
      includeSceneClassification?: boolean;
      includeEngagementScore?: boolean;
      forceRefresh?: boolean;
    } = {}
  ): Promise<{
    composition?: any;
    technicalQuality?: any;
    sceneClassification?: any;
    engagementScore?: any;
    processingTime: number;
    cacheHits: number;
    cacheMisses: number;
  }> {
    const startTime = Date.now();
    const {
      includeComposition = true,
      includeTechnicalQuality = true,
      includeSceneClassification = true,
      includeEngagementScore = true,
      forceRefresh = false
    } = options;

    let cacheHits = 0;
    let cacheMisses = 0;

    const results: any = {};

    // Run analyses in parallel where possible
    const promises: Promise<any>[] = [];

    if (includeComposition) {
      promises.push(
        this.analyzeComposition(imagePath, forceRefresh)
          .then(result => {
            results.composition = result;
            return this.checkCacheHit(imagePath, 'composition', forceRefresh);
          })
      );
    }

    if (includeTechnicalQuality) {
      promises.push(
        this.analyzeTechnicalQuality(imagePath, forceRefresh)
          .then(result => {
            results.technicalQuality = result;
            return this.checkCacheHit(imagePath, 'technical', forceRefresh);
          })
      );
    }

    if (includeSceneClassification) {
      promises.push(
        this.classifyScene(imagePath, forceRefresh)
          .then(result => {
            results.sceneClassification = result;
            return this.checkCacheHit(imagePath, 'scene', forceRefresh);
          })
      );
    }

    // Wait for the first three analyses to complete
    const cacheResults = await Promise.all(promises);
    cacheResults.forEach(hit => hit ? cacheHits++ : cacheMisses++);

    // Engagement score depends on other analyses, so run it after
    if (includeEngagementScore) {
      const engagementResult = await this.calculateEngagementScore(imagePath, forceRefresh);
      results.engagementScore = engagementResult;
      const hit = await this.checkCacheHit(imagePath, 'engagement', forceRefresh);
      hit ? cacheHits++ : cacheMisses++;
    }

    const processingTime = Date.now() - startTime;

    return {
      ...results,
      processingTime,
      cacheHits,
      cacheMisses
    };
  }

  /**
   * Batch analysis with caching for multiple frames
   */
  async batchAnalyzeFrames(
    imagePaths: string[],
    options: {
      includeComposition?: boolean;
      includeTechnicalQuality?: boolean;
      includeSceneClassification?: boolean;
      includeEngagementScore?: boolean;
      forceRefresh?: boolean;
      maxConcurrency?: number;
    } = {}
  ): Promise<{
    results: Array<{
      imagePath: string;
      analysis: any;
      processingTime: number;
      fromCache: boolean;
      error?: string;
    }>;
    totalProcessingTime: number;
    totalCacheHits: number;
    totalCacheMisses: number;
  }> {
    const startTime = Date.now();
    const { maxConcurrency = 5 } = options;
    
    let totalCacheHits = 0;
    let totalCacheMisses = 0;
    const results: any[] = [];

    // Process in batches to control concurrency
    for (let i = 0; i < imagePaths.length; i += maxConcurrency) {
      const batch = imagePaths.slice(i, i + maxConcurrency);
      
      const batchPromises = batch.map(async (imagePath) => {
        try {
          const frameStartTime = Date.now();
          const analysis = await this.analyzeFrameComprehensive(imagePath, options);
          
          totalCacheHits += analysis.cacheHits;
          totalCacheMisses += analysis.cacheMisses;
          
          return {
            imagePath,
            analysis: {
              composition: analysis.composition,
              technicalQuality: analysis.technicalQuality,
              sceneClassification: analysis.sceneClassification,
              engagementScore: analysis.engagementScore
            },
            processingTime: Date.now() - frameStartTime,
            fromCache: analysis.cacheHits > analysis.cacheMisses
          };
        } catch (error) {
          totalCacheMisses++; // Count errors as cache misses
          return {
            imagePath,
            analysis: null,
            processingTime: 0,
            fromCache: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Small delay between batches to prevent overwhelming the system
      if (i + maxConcurrency < imagePaths.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return {
      results,
      totalProcessingTime: Date.now() - startTime,
      totalCacheHits,
      totalCacheMisses
    };
  }

  /**
   * Preload cache for a set of images
   */
  async preloadCache(
    imagePaths: string[],
    options: {
      includeComposition?: boolean;
      includeTechnicalQuality?: boolean;
      includeSceneClassification?: boolean;
      includeEngagementScore?: boolean;
    } = {}
  ): Promise<{
    processed: number;
    cached: number;
    errors: number;
    processingTime: number;
  }> {
    console.log(`🔄 Preloading cache for ${imagePaths.length} images...`);
    
    const result = await this.batchAnalyzeFrames(imagePaths, {
      ...options,
      forceRefresh: true, // Force computation to populate cache
      maxConcurrency: 3   // Lower concurrency for preloading
    });

    const cached = result.results.filter(r => !r.error).length;
    const errors = result.results.filter(r => r.error).length;

    console.log(`✅ Cache preload complete: ${cached} cached, ${errors} errors`);

    return {
      processed: result.results.length,
      cached,
      errors,
      processingTime: result.totalProcessingTime
    };
  }

  /**
   * Check if analysis result was from cache
   */
  private async checkCacheHit(imagePath: string, analysisType: string, forceRefresh: boolean): Promise<boolean> {
    if (forceRefresh) return false;
    
    switch (analysisType) {
      case 'composition':
        return (await cacheManager.getCachedCompositionAnalysis(imagePath)) !== null;
      case 'technical':
        return (await cacheManager.getCachedTechnicalQuality(imagePath)) !== null;
      case 'scene':
        return (await cacheManager.getCachedSceneClassification(imagePath)) !== null;
      case 'engagement':
        return (await cacheManager.getCachedEngagementScore(imagePath)) !== null;
      default:
        return false;
    }
  }

  /**
   * Warm up specific analysis cache
   */
  async warmupAnalysisCache(
    analysisType: 'composition' | 'technical' | 'scene' | 'engagement',
    imagePaths: string[]
  ): Promise<number> {
    let processed = 0;
    
    for (const imagePath of imagePaths) {
      try {
        switch (analysisType) {
          case 'composition':
            await this.analyzeComposition(imagePath, true);
            break;
          case 'technical':
            await this.analyzeTechnicalQuality(imagePath, true);
            break;
          case 'scene':
            await this.classifyScene(imagePath, true);
            break;
          case 'engagement':
            await this.calculateEngagementScore(imagePath, true);
            break;
        }
        processed++;
      } catch (error) {
        console.error(`❌ Error warming up cache for ${imagePath}:`, error);
      }
      
      // Small delay to prevent overwhelming
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    console.log(`🔥 Warmed up ${analysisType} cache for ${processed}/${imagePaths.length} images`);
    return processed;
  }

  /**
   * Get cache performance metrics for analysis services
   */
  async getCachePerformance(): Promise<{
    cacheStats: any;
    hitRates: {
      composition: number;
      technicalQuality: number;
      sceneClassification: number;
      engagementScore: number;
    };
    recommendations: string[];
  }> {
    const cacheStats = await cacheManager.getStats();
    
    // Calculate hit rates (simplified - would need more detailed tracking in production)
    const hitRates = {
      composition: cacheStats.hitRate,
      technicalQuality: cacheStats.hitRate,
      sceneClassification: cacheStats.hitRate,
      engagementScore: cacheStats.hitRate
    };
    
    const recommendations: string[] = [];
    
    if (cacheStats.hitRate < 50) {
      recommendations.push('Consider increasing cache TTL or preloading frequently accessed analyses');
    }
    
    if (cacheStats.totalKeys > 10000) {
      recommendations.push('Consider implementing cache cleanup or reducing TTL for less important data');
    }
    
    if (cacheStats.hitRate > 90) {
      recommendations.push('Excellent cache performance! Consider caching additional analysis data.');
    }
    
    return {
      cacheStats,
      hitRates,
      recommendations
    };
  }

  /**
   * Clear all analysis caches
   */
  async clearAllAnalysisCaches(): Promise<void> {
    await Promise.all([
      cacheManager.clearCompositionAnalysis(),
      cacheManager.invalidateByTag('technical-quality'),
      cacheManager.invalidateByTag('scene-classification'),
      cacheManager.invalidateByTag('engagement-score')
    ]);
    
    console.log('🗑️  All analysis caches cleared');
  }
}

export const cachedAnalysisServices = CachedAnalysisServices.getInstance();