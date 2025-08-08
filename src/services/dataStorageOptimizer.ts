import { DatabaseService } from './database';
import { cacheManager } from './cacheManager';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import zlib from 'zlib';
import { promisify } from 'util';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

export interface StorageConfig {
  compressionEnabled: boolean;
  compressionLevel: number; // 1-9
  archivalAfterDays: number;
  thumbnailMaxSize: number; // bytes
  maxRetentionDays: number;
  enableIndexOptimization: boolean;
  batchSize: number;
}

export interface StorageStats {
  totalRecords: number;
  totalSizeBytes: number;
  averageCompressionRatio: number;
  indexedColumns: number;
  archivedRecords: number;
  cacheHitRate: number;
  recentQueries: number;
}

export interface DataArchivalRule {
  table: string;
  archiveAfterDays: number;
  deleteAfterDays?: number;
  compressionLevel: number;
  indexRetention: boolean;
}

export interface OptimizationRecommendation {
  type: 'compression' | 'indexing' | 'archival' | 'cleanup';
  priority: 'high' | 'medium' | 'low';
  description: string;
  expectedSavings?: number; // bytes
  query?: string;
}

export class DataStorageOptimizer {
  private static instance: DataStorageOptimizer;
  private databaseService: DatabaseService;
  private config: StorageConfig;

  private constructor() {
    this.databaseService = DatabaseService.getInstance();
    this.config = {
      compressionEnabled: process.env.COMPRESSION_ENABLED === 'true',
      compressionLevel: parseInt(process.env.COMPRESSION_LEVEL || '6'),
      archivalAfterDays: parseInt(process.env.ARCHIVAL_AFTER_DAYS || '90'),
      thumbnailMaxSize: parseInt(process.env.THUMBNAIL_MAX_SIZE || '1048576'), // 1MB
      maxRetentionDays: parseInt(process.env.MAX_RETENTION_DAYS || '365'),
      enableIndexOptimization: process.env.INDEX_OPTIMIZATION_ENABLED !== 'false',
      batchSize: parseInt(process.env.STORAGE_BATCH_SIZE || '1000')
    };
  }

  public static getInstance(): DataStorageOptimizer {
    if (!DataStorageOptimizer.instance) {
      DataStorageOptimizer.instance = new DataStorageOptimizer();
    }
    return DataStorageOptimizer.instance;
  }

  /**
   * Compress and store frame analysis data
   */
  async storeFrameAnalysis(
    videoId: string,
    frameIndex: number,
    analysisData: any,
    options: { 
      compress?: boolean;
      cache?: boolean;
      archival?: boolean;
    } = {}
  ): Promise<string> {
    const { compress = this.config.compressionEnabled, cache = true, archival = false } = options;
    
    let processedData = JSON.stringify(analysisData);
    let compressionRatio = 1;
    
    // Compress data if enabled
    if (compress) {
      const compressed = await this.compressData(processedData);
      processedData = compressed.data.toString('base64');
      compressionRatio = compressed.ratio;
    }
    
    // Calculate data hash for deduplication
    const dataHash = this.calculateDataHash(processedData);
    
    // Store in database
    const result = await this.databaseService.query(
      `INSERT INTO frame_analysis 
       (video_id, frame_index, analysis_data, compressed, compression_ratio, data_hash, created_at, archived)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (video_id, frame_index) 
       DO UPDATE SET 
         analysis_data = EXCLUDED.analysis_data,
         compressed = EXCLUDED.compressed,
         compression_ratio = EXCLUDED.compression_ratio,
         data_hash = EXCLUDED.data_hash,
         updated_at = NOW()
       RETURNING id`,
      [videoId, frameIndex, processedData, compress, compressionRatio, dataHash, new Date(), archival]
    );
    
    const recordId = result.rows[0]?.id;
    
    // Cache if requested
    if (cache && recordId) {
      await cacheManager.cacheFrameAnalysis(
        videoId,
        frameIndex,
        analysisData,
        ['frame-data', compress ? 'compressed' : 'uncompressed']
      );
    }
    
    return recordId;
  }

  /**
   * Retrieve and decompress frame analysis data
   */
  async retrieveFrameAnalysis(
    videoId: string,
    frameIndex: number,
    useCache: boolean = true
  ): Promise<any | null> {
    // Try cache first
    if (useCache) {
      const cached = await cacheManager.getCachedFrameAnalysis(videoId, frameIndex);
      if (cached) {
        return cached;
      }
    }
    
    // Query database
    const result = await this.databaseService.query(
      `SELECT analysis_data, compressed, archived FROM frame_analysis 
       WHERE video_id = $1 AND frame_index = $2 AND deleted_at IS NULL`,
      [videoId, frameIndex]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const row = result.rows[0];
    let data = row.analysis_data;
    
    // Handle archived data
    if (row.archived) {
      data = await this.retrieveArchivedData(videoId, frameIndex);
    }
    
    // Decompress if necessary
    if (row.compressed && data) {
      const decompressed = await this.decompressData(Buffer.from(data, 'base64'));
      data = decompressed;
    }
    
    // Parse and cache result
    const parsedData = typeof data === 'string' ? JSON.parse(data) : data;
    
    if (useCache) {
      await cacheManager.cacheFrameAnalysis(videoId, frameIndex, parsedData);
    }
    
    return parsedData;
  }

  /**
   * Compress data using gzip
   */
  async compressData(data: string): Promise<{ data: Buffer; ratio: number }> {
    const originalSize = Buffer.byteLength(data);
    const compressed = await gzip(data, { level: this.config.compressionLevel });
    const compressionRatio = originalSize / compressed.length;
    
    return {
      data: compressed,
      ratio: compressionRatio
    };
  }

  /**
   * Decompress data using gzip
   */
  async decompressData(compressedData: Buffer): Promise<string> {
    const decompressed = await gunzip(compressedData);
    return decompressed.toString();
  }

  /**
   * Optimize database indexes
   */
  async optimizeIndexes(): Promise<{
    created: string[];
    dropped: string[];
    analyzed: string[];
  }> {
    if (!this.config.enableIndexOptimization) {
      return { created: [], dropped: [], analyzed: [] };
    }

    const created: string[] = [];
    const dropped: string[] = [];
    const analyzed: string[] = [];

    // Analyze table statistics
    await this.databaseService.query('ANALYZE');
    analyzed.push('ALL_TABLES');

    // Create performance indexes if they don't exist
    const indexQueries = [
      // Frame analysis indexes
      {
        name: 'idx_frame_analysis_video_created',
        query: 'CREATE INDEX IF NOT EXISTS idx_frame_analysis_video_created ON frame_analysis(video_id, created_at DESC)'
      },
      {
        name: 'idx_frame_analysis_engagement',
        query: 'CREATE INDEX IF NOT EXISTS idx_frame_analysis_engagement ON frame_analysis USING GIN ((analysis_data->>\'engagement_score\')) WHERE analysis_data->>\'engagement_score\' IS NOT NULL'
      },
      {
        name: 'idx_frame_analysis_scene_type',
        query: 'CREATE INDEX IF NOT EXISTS idx_frame_analysis_scene_type ON frame_analysis USING GIN ((analysis_data->>\'scene_classification\'))'
      },
      {
        name: 'idx_frame_analysis_hash',
        query: 'CREATE INDEX IF NOT EXISTS idx_frame_analysis_hash ON frame_analysis(data_hash) WHERE data_hash IS NOT NULL'
      },
      
      // Video indexes
      {
        name: 'idx_videos_status_created',
        query: 'CREATE INDEX IF NOT EXISTS idx_videos_status_created ON videos(status, created_at DESC)'
      },
      {
        name: 'idx_videos_metadata',
        query: 'CREATE INDEX IF NOT EXISTS idx_videos_metadata ON videos USING GIN (metadata) WHERE metadata IS NOT NULL'
      }
    ];

    for (const index of indexQueries) {
      try {
        await this.databaseService.query(index.query);
        created.push(index.name);
      } catch (error) {
        console.warn(`Failed to create index ${index.name}:`, error);
      }
    }

    // Identify and drop unused indexes
    const unusedIndexes = await this.findUnusedIndexes();
    for (const indexName of unusedIndexes) {
      try {
        await this.databaseService.query(`DROP INDEX IF EXISTS ${indexName}`);
        dropped.push(indexName);
      } catch (error) {
        console.warn(`Failed to drop index ${indexName}:`, error);
      }
    }

    return { created, dropped, analyzed };
  }

  /**
   * Archive old data to reduce primary storage
   */
  async archiveOldData(rules?: DataArchivalRule[]): Promise<{
    archivedRecords: number;
    freedSpace: number;
    archivedTables: string[];
  }> {
    const defaultRules: DataArchivalRule[] = [
      {
        table: 'frame_analysis',
        archiveAfterDays: this.config.archivalAfterDays,
        deleteAfterDays: this.config.maxRetentionDays,
        compressionLevel: 9,
        indexRetention: false
      },
      {
        table: 'videos',
        archiveAfterDays: this.config.archivalAfterDays * 2,
        compressionLevel: 6,
        indexRetention: true
      }
    ];

    const archivalRules = rules || defaultRules;
    let totalArchived = 0;
    let totalFreedSpace = 0;
    const archivedTables: string[] = [];

    for (const rule of archivalRules) {
      try {
        const result = await this.archiveTableData(rule);
        totalArchived += result.recordsArchived;
        totalFreedSpace += result.spaceSaved;
        if (result.recordsArchived > 0) {
          archivedTables.push(rule.table);
        }
      } catch (error) {
        console.error(`Failed to archive table ${rule.table}:`, error);
      }
    }

    return {
      archivedRecords: totalArchived,
      freedSpace: totalFreedSpace,
      archivedTables
    };
  }

  /**
   * Clean up duplicate and redundant data
   */
  async deduplicateData(): Promise<{
    duplicatesRemoved: number;
    spaceSaved: number;
    tablesProcessed: string[];
  }> {
    let totalDuplicates = 0;
    let totalSpaceSaved = 0;
    const tablesProcessed: string[] = [];

    // Deduplicate frame analysis data by hash
    const duplicateFrames = await this.databaseService.query(`
      WITH duplicates AS (
        SELECT data_hash, MIN(id) as keep_id, COUNT(*) as duplicate_count,
               SUM(LENGTH(analysis_data)) as total_size
        FROM frame_analysis 
        WHERE data_hash IS NOT NULL AND deleted_at IS NULL
        GROUP BY data_hash 
        HAVING COUNT(*) > 1
      )
      SELECT data_hash, keep_id, duplicate_count, total_size FROM duplicates
    `);

    if (duplicateFrames.rows.length > 0) {
      for (const dup of duplicateFrames.rows) {
        // Mark duplicates as deleted
        const deleted = await this.databaseService.query(`
          UPDATE frame_analysis 
          SET deleted_at = NOW() 
          WHERE data_hash = $1 AND id != $2 AND deleted_at IS NULL
          RETURNING id
        `, [dup.data_hash, dup.keep_id]);

        totalDuplicates += deleted.rows.length;
        totalSpaceSaved += (dup.total_size * deleted.rows.length) / dup.duplicate_count;
      }
      tablesProcessed.push('frame_analysis');
    }

    return {
      duplicatesRemoved: totalDuplicates,
      spaceSaved: totalSpaceSaved,
      tablesProcessed
    };
  }

  /**
   * Get storage optimization recommendations
   */
  async getOptimizationRecommendations(): Promise<OptimizationRecommendation[]> {
    const recommendations: OptimizationRecommendation[] = [];
    
    // Check for uncompressed large data
    const uncompressedData = await this.databaseService.query(`
      SELECT COUNT(*) as count, SUM(LENGTH(analysis_data)) as total_size
      FROM frame_analysis 
      WHERE compressed = false AND LENGTH(analysis_data) > 1000 AND deleted_at IS NULL
    `);
    
    if (uncompressedData.rows[0]?.count > 0) {
      recommendations.push({
        type: 'compression',
        priority: 'high',
        description: `${uncompressedData.rows[0].count} large uncompressed records found`,
        expectedSavings: Math.floor(uncompressedData.rows[0].total_size * 0.7),
        query: 'Enable compression for large analysis data'
      });
    }

    // Check for old unarchived data
    const oldData = await this.databaseService.query(`
      SELECT COUNT(*) as count, SUM(LENGTH(analysis_data)) as total_size
      FROM frame_analysis 
      WHERE created_at < NOW() - INTERVAL '${this.config.archivalAfterDays} days' 
        AND archived = false AND deleted_at IS NULL
    `);

    if (oldData.rows[0]?.count > 0) {
      recommendations.push({
        type: 'archival',
        priority: 'medium',
        description: `${oldData.rows[0].count} records eligible for archival`,
        expectedSavings: Math.floor(oldData.rows[0].total_size * 0.8),
        query: `Archive data older than ${this.config.archivalAfterDays} days`
      });
    }

    // Check for duplicate data
    const duplicates = await this.databaseService.query(`
      SELECT COUNT(*) as duplicate_groups, SUM(duplicate_count - 1) as removable_records
      FROM (
        SELECT data_hash, COUNT(*) as duplicate_count
        FROM frame_analysis 
        WHERE data_hash IS NOT NULL AND deleted_at IS NULL
        GROUP BY data_hash 
        HAVING COUNT(*) > 1
      ) dups
    `);

    if (duplicates.rows[0]?.removable_records > 0) {
      recommendations.push({
        type: 'cleanup',
        priority: 'medium',
        description: `${duplicates.rows[0].removable_records} duplicate records can be removed`,
        query: 'Run deduplication process'
      });
    }

    // Check for missing indexes
    const slowQueries = await this.checkForSlowQueries();
    if (slowQueries.length > 0) {
      recommendations.push({
        type: 'indexing',
        priority: 'high',
        description: 'Slow queries detected that could benefit from indexing',
        query: 'Optimize database indexes'
      });
    }

    return recommendations;
  }

  /**
   * Get comprehensive storage statistics
   */
  async getStorageStats(): Promise<StorageStats> {
    const totalRecords = await this.databaseService.query(`
      SELECT COUNT(*) as count FROM frame_analysis WHERE deleted_at IS NULL
    `);

    const sizeStats = await this.databaseService.query(`
      SELECT 
        SUM(LENGTH(analysis_data)) as total_size,
        AVG(compression_ratio) as avg_compression,
        COUNT(CASE WHEN compressed = true THEN 1 END) as compressed_count
      FROM frame_analysis WHERE deleted_at IS NULL
    `);

    const indexStats = await this.databaseService.query(`
      SELECT COUNT(*) as index_count
      FROM pg_indexes 
      WHERE schemaname = 'public'
    `);

    const archivedStats = await this.databaseService.query(`
      SELECT COUNT(*) as archived_count
      FROM frame_analysis 
      WHERE archived = true AND deleted_at IS NULL
    `);

    const cacheStats = await cacheManager.getStats();

    return {
      totalRecords: parseInt(totalRecords.rows[0]?.count || '0'),
      totalSizeBytes: parseInt(sizeStats.rows[0]?.total_size || '0'),
      averageCompressionRatio: parseFloat(sizeStats.rows[0]?.avg_compression || '1'),
      indexedColumns: parseInt(indexStats.rows[0]?.index_count || '0'),
      archivedRecords: parseInt(archivedStats.rows[0]?.archived_count || '0'),
      cacheHitRate: cacheStats.hitRate,
      recentQueries: 0 // Would need query log analysis for this
    };
  }

  /**
   * Optimize storage for a specific video
   */
  async optimizeVideoStorage(videoId: string): Promise<{
    compressed: number;
    archived: number;
    deduplicated: number;
    spaceSaved: number;
  }> {
    let compressed = 0;
    let archived = 0;
    let deduplicated = 0;
    let spaceSaved = 0;

    // Compress uncompressed data for this video
    const uncompressed = await this.databaseService.query(`
      SELECT id, analysis_data FROM frame_analysis 
      WHERE video_id = $1 AND compressed = false AND LENGTH(analysis_data) > 1000 AND deleted_at IS NULL
    `, [videoId]);

    for (const row of uncompressed.rows) {
      const originalSize = Buffer.byteLength(row.analysis_data);
      const compressResult = await this.compressData(row.analysis_data);
      
      await this.databaseService.query(`
        UPDATE frame_analysis 
        SET analysis_data = $1, compressed = true, compression_ratio = $2
        WHERE id = $3
      `, [compressResult.data.toString('base64'), compressResult.ratio, row.id]);

      compressed++;
      spaceSaved += originalSize - compressResult.data.length;
    }

    // Archive old data for this video
    const archiveResult = await this.databaseService.query(`
      UPDATE frame_analysis 
      SET archived = true, archived_at = NOW()
      WHERE video_id = $1 AND archived = false 
        AND created_at < NOW() - INTERVAL '${this.config.archivalAfterDays} days'
        AND deleted_at IS NULL
      RETURNING id, LENGTH(analysis_data) as size
    `, [videoId]);

    archived = archiveResult.rows.length;
    spaceSaved += archiveResult.rows.reduce((sum, row) => sum + row.size, 0);

    // Remove duplicates for this video
    const dedupeResult = await this.databaseService.query(`
      WITH duplicates AS (
        SELECT data_hash, MIN(id) as keep_id, COUNT(*) as dup_count,
               SUM(LENGTH(analysis_data)) as total_size
        FROM frame_analysis 
        WHERE video_id = $1 AND data_hash IS NOT NULL AND deleted_at IS NULL
        GROUP BY data_hash 
        HAVING COUNT(*) > 1
      )
      UPDATE frame_analysis 
      SET deleted_at = NOW()
      WHERE video_id = $1 AND data_hash IN (SELECT data_hash FROM duplicates)
        AND id NOT IN (SELECT keep_id FROM duplicates)
        AND deleted_at IS NULL
      RETURNING id, LENGTH(analysis_data) as size
    `, [videoId]);

    deduplicated = dedupeResult.rows.length;
    spaceSaved += dedupeResult.rows.reduce((sum, row) => sum + row.size, 0);

    return { compressed, archived, deduplicated, spaceSaved };
  }

  /**
   * Perform comprehensive storage optimization
   */
  async performFullOptimization(): Promise<{
    indexOptimization: any;
    archival: any;
    deduplication: any;
    recommendations: OptimizationRecommendation[];
    totalSpaceSaved: number;
    processingTime: number;
  }> {
    const startTime = Date.now();
    console.log('🔄 Starting comprehensive storage optimization...');

    // Step 1: Optimize indexes
    console.log('📊 Optimizing database indexes...');
    const indexOptimization = await this.optimizeIndexes();

    // Step 2: Archive old data
    console.log('📦 Archiving old data...');
    const archival = await this.archiveOldData();

    // Step 3: Deduplicate data
    console.log('🔍 Deduplicating data...');
    const deduplication = await this.deduplicateData();

    // Step 4: Get recommendations for further optimization
    console.log('💡 Generating optimization recommendations...');
    const recommendations = await this.getOptimizationRecommendations();

    const totalSpaceSaved = archival.freedSpace + deduplication.spaceSaved;
    const processingTime = Date.now() - startTime;

    console.log(`✅ Storage optimization completed in ${processingTime}ms`);
    console.log(`💾 Total space saved: ${this.formatBytes(totalSpaceSaved)}`);

    return {
      indexOptimization,
      archival,
      deduplication,
      recommendations,
      totalSpaceSaved,
      processingTime
    };
  }

  /**
   * Helper methods
   */
  private calculateDataHash(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  private async findUnusedIndexes(): Promise<string[]> {
    // This would require pg_stat_user_indexes to be available
    // For now, return empty array
    return [];
  }

  private async archiveTableData(rule: DataArchivalRule): Promise<{
    recordsArchived: number;
    spaceSaved: number;
  }> {
    // Mark records as archived instead of moving to separate storage
    const result = await this.databaseService.query(`
      UPDATE ${rule.table}
      SET archived = true, archived_at = NOW()
      WHERE created_at < NOW() - INTERVAL '${rule.archiveAfterDays} days'
        AND archived = false
        AND deleted_at IS NULL
      RETURNING id, 
        CASE WHEN analysis_data IS NOT NULL 
          THEN LENGTH(analysis_data) 
          ELSE 1000 
        END as size
    `);

    const recordsArchived = result.rows.length;
    const spaceSaved = result.rows.reduce((sum, row) => sum + row.size, 0);

    // Delete very old records if delete rule is specified
    if (rule.deleteAfterDays) {
      await this.databaseService.query(`
        UPDATE ${rule.table}
        SET deleted_at = NOW()
        WHERE created_at < NOW() - INTERVAL '${rule.deleteAfterDays} days'
          AND deleted_at IS NULL
      `);
    }

    return { recordsArchived, spaceSaved };
  }

  private async retrieveArchivedData(videoId: string, frameIndex: number): Promise<string | null> {
    // In a real implementation, this would retrieve from archive storage
    // For now, return the data from the archived record
    const result = await this.databaseService.query(`
      SELECT analysis_data FROM frame_analysis 
      WHERE video_id = $1 AND frame_index = $2 AND archived = true
    `, [videoId, frameIndex]);

    return result.rows[0]?.analysis_data || null;
  }

  private async checkForSlowQueries(): Promise<string[]> {
    // This would analyze query performance logs
    // For now, return empty array
    return [];
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Get configuration
   */
  getConfig(): StorageConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<StorageConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
}

export const dataStorageOptimizer = DataStorageOptimizer.getInstance();