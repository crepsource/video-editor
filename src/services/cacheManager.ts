import { createClient, RedisClientType } from 'redis';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';

export interface CacheConfig {
  host: string;
  port: number;
  password?: string;
  database: number;
  keyPrefix: string;
  ttl: {
    frameAnalysis: number; // seconds
    compositionAnalysis: number;
    technicalQuality: number;
    sceneClassification: number;
    engagementScore: number;
    videoMetadata: number;
    thumbnails: number;
  };
}

export interface CacheStats {
  totalKeys: number;
  memoryUsage: string;
  hitRate: number;
  missRate: number;
  totalHits: number;
  totalMisses: number;
  evictedKeys: number;
  expiredKeys: number;
}

export interface CacheEntry<T = any> {
  data: T;
  createdAt: number;
  expiresAt: number;
  version: string;
  size: number;
  tags: string[];
}

export class CacheManager {
  private static instance: CacheManager;
  private redisClient: RedisClientType | null = null;
  private config: CacheConfig;
  private isConnected: boolean = false;
  private stats = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0
  };

  private constructor() {
    this.config = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6380'),
      password: process.env.REDIS_PASSWORD,
      database: parseInt(process.env.REDIS_DB || '0'),
      keyPrefix: process.env.REDIS_KEY_PREFIX || 'video-editor:',
      ttl: {
        frameAnalysis: parseInt(process.env.CACHE_TTL_FRAME_ANALYSIS || '86400'), // 24 hours
        compositionAnalysis: parseInt(process.env.CACHE_TTL_COMPOSITION || '86400'), // 24 hours
        technicalQuality: parseInt(process.env.CACHE_TTL_TECHNICAL || '86400'), // 24 hours
        sceneClassification: parseInt(process.env.CACHE_TTL_SCENE || '86400'), // 24 hours
        engagementScore: parseInt(process.env.CACHE_TTL_ENGAGEMENT || '86400'), // 24 hours
        videoMetadata: parseInt(process.env.CACHE_TTL_METADATA || '604800'), // 7 days
        thumbnails: parseInt(process.env.CACHE_TTL_THUMBNAILS || '2592000') // 30 days
      }
    };
  }

  public static getInstance(): CacheManager {
    if (!CacheManager.instance) {
      CacheManager.instance = new CacheManager();
    }
    return CacheManager.instance;
  }

  /**
   * Initialize Redis connection
   */
  async initialize(): Promise<void> {
    try {
      this.redisClient = createClient({
        socket: {
          host: this.config.host,
          port: this.config.port
        },
        password: this.config.password,
        database: this.config.database
      });

      // Setup event handlers
      this.redisClient.on('connect', () => {
        console.log('✅ Redis connected successfully');
        this.isConnected = true;
      });

      this.redisClient.on('error', (error) => {
        console.error('❌ Redis connection error:', error);
        this.isConnected = false;
      });

      this.redisClient.on('close', () => {
        console.log('📴 Redis connection closed');
        this.isConnected = false;
      });

      // Test connection
      await this.redisClient.connect();
      await this.redisClient.ping();
      
      console.log(`🚀 Cache Manager initialized with Redis at ${this.config.host}:${this.config.port}`);
      
    } catch (error) {
      console.error('❌ Failed to initialize Cache Manager:', error);
      throw error;
    }
  }

  /**
   * Generate cache key for different analysis types
   */
  generateKey(type: string, identifier: string, version?: string): string {
    const hash = this.hashIdentifier(identifier);
    const versionSuffix = version ? `:v${version}` : '';
    return `${this.config.keyPrefix}${type}:${hash}${versionSuffix}`;
  }

  /**
   * Generate hash for file or content identifier
   */
  private hashIdentifier(identifier: string): string {
    return crypto.createHash('md5').update(identifier).digest('hex');
  }

  /**
   * Get file hash for consistent caching
   */
  async getFileHash(filePath: string): Promise<string> {
    try {
      const stats = fs.statSync(filePath);
      const content = `${filePath}:${stats.size}:${stats.mtime.getTime()}`;
      return this.hashIdentifier(content);
    } catch (error) {
      // Fallback to path-based hash if file doesn't exist
      return this.hashIdentifier(filePath);
    }
  }

  /**
   * Cache frame analysis results
   */
  async cacheFrameAnalysis(
    videoId: string,
    frameIndex: number,
    analysis: any,
    tags: string[] = []
  ): Promise<void> {
    const key = this.generateKey('frame', `${videoId}:${frameIndex}`);
    const ttl = this.config.ttl.frameAnalysis;
    
    await this.set(key, analysis, ttl, ['frame-analysis', 'video:' + videoId, ...tags]);
  }

  /**
   * Get cached frame analysis
   */
  async getCachedFrameAnalysis(videoId: string, frameIndex: number): Promise<any | null> {
    const key = this.generateKey('frame', `${videoId}:${frameIndex}`);
    return await this.get(key);
  }

  /**
   * Cache composition analysis results
   */
  async cacheCompositionAnalysis(
    filePath: string,
    analysis: any,
    tags: string[] = []
  ): Promise<void> {
    const fileHash = await this.getFileHash(filePath);
    const key = this.generateKey('composition', fileHash);
    const ttl = this.config.ttl.compositionAnalysis;
    
    await this.set(key, analysis, ttl, ['composition-analysis', ...tags]);
  }

  /**
   * Get cached composition analysis
   */
  async getCachedCompositionAnalysis(filePath: string): Promise<any | null> {
    const fileHash = await this.getFileHash(filePath);
    const key = this.generateKey('composition', fileHash);
    return await this.get(key);
  }

  /**
   * Cache technical quality analysis
   */
  async cacheTechnicalQuality(
    filePath: string,
    analysis: any,
    tags: string[] = []
  ): Promise<void> {
    const fileHash = await this.getFileHash(filePath);
    const key = this.generateKey('technical', fileHash);
    const ttl = this.config.ttl.technicalQuality;
    
    await this.set(key, analysis, ttl, ['technical-quality', ...tags]);
  }

  /**
   * Get cached technical quality analysis
   */
  async getCachedTechnicalQuality(filePath: string): Promise<any | null> {
    const fileHash = await this.getFileHash(filePath);
    const key = this.generateKey('technical', fileHash);
    return await this.get(key);
  }

  /**
   * Cache scene classification
   */
  async cacheSceneClassification(
    filePath: string,
    classification: any,
    tags: string[] = []
  ): Promise<void> {
    const fileHash = await this.getFileHash(filePath);
    const key = this.generateKey('scene', fileHash);
    const ttl = this.config.ttl.sceneClassification;
    
    await this.set(key, classification, ttl, ['scene-classification', ...tags]);
  }

  /**
   * Get cached scene classification
   */
  async getCachedSceneClassification(filePath: string): Promise<any | null> {
    const fileHash = await this.getFileHash(filePath);
    const key = this.generateKey('scene', fileHash);
    return await this.get(key);
  }

  /**
   * Cache engagement score
   */
  async cacheEngagementScore(
    filePath: string,
    engagement: any,
    tags: string[] = []
  ): Promise<void> {
    const fileHash = await this.getFileHash(filePath);
    const key = this.generateKey('engagement', fileHash);
    const ttl = this.config.ttl.engagementScore;
    
    await this.set(key, engagement, ttl, ['engagement-score', ...tags]);
  }

  /**
   * Get cached engagement score
   */
  async getCachedEngagementScore(filePath: string): Promise<any | null> {
    const fileHash = await this.getFileHash(filePath);
    const key = this.generateKey('engagement', fileHash);
    return await this.get(key);
  }

  /**
   * Cache video metadata
   */
  async cacheVideoMetadata(
    videoPath: string,
    metadata: any,
    tags: string[] = []
  ): Promise<void> {
    const fileHash = await this.getFileHash(videoPath);
    const key = this.generateKey('metadata', fileHash);
    const ttl = this.config.ttl.videoMetadata;
    
    await this.set(key, metadata, ttl, ['video-metadata', ...tags]);
  }

  /**
   * Get cached video metadata
   */
  async getCachedVideoMetadata(videoPath: string): Promise<any | null> {
    const fileHash = await this.getFileHash(videoPath);
    const key = this.generateKey('metadata', fileHash);
    return await this.get(key);
  }

  /**
   * Cache thumbnail data
   */
  async cacheThumbnail(
    videoId: string,
    frameIndex: number,
    thumbnailData: Buffer,
    tags: string[] = []
  ): Promise<void> {
    const key = this.generateKey('thumbnail', `${videoId}:${frameIndex}`);
    const ttl = this.config.ttl.thumbnails;
    
    await this.setBuffer(key, thumbnailData, ttl, ['thumbnail', 'video:' + videoId, ...tags]);
  }

  /**
   * Get cached thumbnail
   */
  async getCachedThumbnail(videoId: string, frameIndex: number): Promise<Buffer | null> {
    const key = this.generateKey('thumbnail', `${videoId}:${frameIndex}`);
    return await this.getBuffer(key);
  }

  /**
   * Generic set method with metadata
   */
  private async set(
    key: string,
    data: any,
    ttl: number,
    tags: string[] = []
  ): Promise<void> {
    if (!this.isConnected || !this.redisClient) {
      console.warn('⚠️  Redis not connected, skipping cache set');
      return;
    }

    try {
      const entry: CacheEntry = {
        data,
        createdAt: Date.now(),
        expiresAt: Date.now() + (ttl * 1000),
        version: '1.0',
        size: JSON.stringify(data).length,
        tags
      };

      await this.redisClient.setEx(key, ttl, JSON.stringify(entry));
      this.stats.sets++;

      // Set tags for cache invalidation
      for (const tag of tags) {
        const tagKey = `${this.config.keyPrefix}tag:${tag}`;
        await this.redisClient.sAdd(tagKey, key);
        await this.redisClient.expire(tagKey, ttl);
      }

    } catch (error) {
      console.error('❌ Cache set error:', error);
    }
  }

  /**
   * Generic get method with metadata
   */
  private async get<T = any>(key: string): Promise<T | null> {
    if (!this.isConnected || !this.redisClient) {
      console.warn('⚠️  Redis not connected, skipping cache get');
      this.stats.misses++;
      return null;
    }

    try {
      const cached = await this.redisClient.get(key);
      
      if (!cached) {
        this.stats.misses++;
        return null;
      }

      const entry: CacheEntry<T> = JSON.parse(cached);
      
      // Check if expired (extra safety)
      if (entry.expiresAt && Date.now() > entry.expiresAt) {
        await this.redisClient.del(key);
        this.stats.misses++;
        return null;
      }

      this.stats.hits++;
      return entry.data;

    } catch (error) {
      console.error('❌ Cache get error:', error);
      this.stats.misses++;
      return null;
    }
  }

  /**
   * Set buffer data (for thumbnails, images)
   */
  private async setBuffer(
    key: string,
    data: Buffer,
    ttl: number,
    tags: string[] = []
  ): Promise<void> {
    if (!this.isConnected || !this.redisClient) {
      console.warn('⚠️  Redis not connected, skipping buffer cache set');
      return;
    }

    try {
      const entry = {
        data: data.toString('base64'),
        createdAt: Date.now(),
        expiresAt: Date.now() + (ttl * 1000),
        version: '1.0',
        size: data.length,
        tags,
        type: 'buffer'
      };

      await this.redisClient.setEx(key, ttl, JSON.stringify(entry));
      this.stats.sets++;

      // Set tags
      for (const tag of tags) {
        const tagKey = `${this.config.keyPrefix}tag:${tag}`;
        await this.redisClient.sAdd(tagKey, key);
        await this.redisClient.expire(tagKey, ttl);
      }

    } catch (error) {
      console.error('❌ Cache buffer set error:', error);
    }
  }

  /**
   * Get buffer data
   */
  private async getBuffer(key: string): Promise<Buffer | null> {
    if (!this.isConnected || !this.redisClient) {
      console.warn('⚠️  Redis not connected, skipping buffer cache get');
      this.stats.misses++;
      return null;
    }

    try {
      const cached = await this.redisClient.get(key);
      
      if (!cached) {
        this.stats.misses++;
        return null;
      }

      const entry = JSON.parse(cached);
      
      // Check expiration
      if (entry.expiresAt && Date.now() > entry.expiresAt) {
        await this.redisClient.del(key);
        this.stats.misses++;
        return null;
      }

      this.stats.hits++;
      return Buffer.from(entry.data, 'base64');

    } catch (error) {
      console.error('❌ Cache buffer get error:', error);
      this.stats.misses++;
      return null;
    }
  }

  /**
   * Invalidate cache by tags
   */
  async invalidateByTag(tag: string): Promise<number> {
    if (!this.isConnected || !this.redisClient) {
      console.warn('⚠️  Redis not connected, skipping cache invalidation');
      return 0;
    }

    try {
      const tagKey = `${this.config.keyPrefix}tag:${tag}`;
      const keys = await this.redisClient.sMembers(tagKey);
      
      if (keys.length === 0) return 0;
      
      // Delete all keys with this tag
      await this.redisClient.del(...keys);
      
      // Delete the tag set itself
      await this.redisClient.del(tagKey);
      
      this.stats.deletes += keys.length;
      console.log(`🗑️  Invalidated ${keys.length} cache entries with tag: ${tag}`);
      
      return keys.length;
      
    } catch (error) {
      console.error('❌ Cache invalidation error:', error);
      return 0;
    }
  }

  /**
   * Invalidate cache for specific video
   */
  async invalidateVideo(videoId: string): Promise<number> {
    return await this.invalidateByTag(`video:${videoId}`);
  }

  /**
   * Clear all frame analysis cache
   */
  async clearFrameAnalysis(): Promise<number> {
    return await this.invalidateByTag('frame-analysis');
  }

  /**
   * Clear all composition analysis cache
   */
  async clearCompositionAnalysis(): Promise<number> {
    return await this.invalidateByTag('composition-analysis');
  }

  /**
   * Clear all cache
   */
  async clearAll(): Promise<void> {
    if (!this.isConnected || !this.redisClient) {
      console.warn('⚠️  Redis not connected, skipping cache clear');
      return;
    }

    try {
      await this.redisClient.flushDb();
      console.log('🗑️  All cache cleared');
      
      // Reset stats
      this.stats = { hits: 0, misses: 0, sets: 0, deletes: 0 };
      
    } catch (error) {
      console.error('❌ Cache clear error:', error);
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<CacheStats> {
    if (!this.isConnected || !this.redisClient) {
      return {
        totalKeys: 0,
        memoryUsage: '0B',
        hitRate: 0,
        missRate: 0,
        totalHits: this.stats.hits,
        totalMisses: this.stats.misses,
        evictedKeys: 0,
        expiredKeys: 0
      };
    }

    try {
      const info = await this.redisClient.info('memory');
      const keyspace = await this.redisClient.info('keyspace');
      
      // Parse memory usage
      const memoryMatch = info.match(/used_memory_human:([^\r\n]+)/);
      const memoryUsage = memoryMatch ? memoryMatch[1] : '0B';
      
      // Parse key count
      const keyMatch = keyspace.match(/keys=(\d+)/);
      const totalKeys = keyMatch ? parseInt(keyMatch[1]) : 0;
      
      const totalRequests = this.stats.hits + this.stats.misses;
      const hitRate = totalRequests > 0 ? (this.stats.hits / totalRequests) * 100 : 0;
      const missRate = totalRequests > 0 ? (this.stats.misses / totalRequests) * 100 : 0;
      
      return {
        totalKeys,
        memoryUsage,
        hitRate: Math.round(hitRate * 100) / 100,
        missRate: Math.round(missRate * 100) / 100,
        totalHits: this.stats.hits,
        totalMisses: this.stats.misses,
        evictedKeys: 0, // Would need specific Redis config to track this
        expiredKeys: 0  // Would need specific Redis config to track this
      };
      
    } catch (error) {
      console.error('❌ Error getting cache stats:', error);
      return {
        totalKeys: 0,
        memoryUsage: '0B',
        hitRate: 0,
        missRate: 0,
        totalHits: this.stats.hits,
        totalMisses: this.stats.misses,
        evictedKeys: 0,
        expiredKeys: 0
      };
    }
  }

  /**
   * Check if cache is healthy
   */
  async healthCheck(): Promise<{
    connected: boolean;
    latency: number;
    memory: string;
    keys: number;
  }> {
    if (!this.isConnected || !this.redisClient) {
      return {
        connected: false,
        latency: -1,
        memory: '0B',
        keys: 0
      };
    }

    try {
      const start = Date.now();
      await this.redisClient.ping();
      const latency = Date.now() - start;
      
      const stats = await this.getStats();
      
      return {
        connected: true,
        latency,
        memory: stats.memoryUsage,
        keys: stats.totalKeys
      };
      
    } catch (error) {
      console.error('❌ Cache health check error:', error);
      return {
        connected: false,
        latency: -1,
        memory: '0B',
        keys: 0
      };
    }
  }

  /**
   * Cleanup expired keys (maintenance)
   */
  async cleanup(): Promise<number> {
    if (!this.isConnected || !this.redisClient) {
      return 0;
    }

    try {
      // Get all keys with our prefix
      const pattern = `${this.config.keyPrefix}*`;
      const keys = await this.redisClient.keys(pattern);
      
      let expiredCount = 0;
      
      for (const key of keys) {
        try {
          const cached = await this.redisClient.get(key);
          if (cached) {
            const entry = JSON.parse(cached);
            if (entry.expiresAt && Date.now() > entry.expiresAt) {
              await this.redisClient.del(key);
              expiredCount++;
            }
          }
        } catch (error) {
          // Invalid entry, delete it
          await this.redisClient.del(key);
          expiredCount++;
        }
      }
      
      if (expiredCount > 0) {
        console.log(`🧹 Cleaned up ${expiredCount} expired cache entries`);
      }
      
      return expiredCount;
      
    } catch (error) {
      console.error('❌ Cache cleanup error:', error);
      return 0;
    }
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    if (this.redisClient) {
      await this.redisClient.quit();
      this.isConnected = false;
      console.log('📴 Cache Manager connection closed');
    }
  }

  /**
   * Get connection status
   */
  isHealthy(): boolean {
    return this.isConnected && this.redisClient !== null;
  }

  /**
   * Get cache configuration
   */
  getConfig(): CacheConfig {
    return { ...this.config };
  }
}

export const cacheManager = CacheManager.getInstance();