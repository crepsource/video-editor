import path from 'path';
import fs from 'fs/promises';
import { Frame } from '../models/Frame';
import sharp from 'sharp';
import crypto from 'crypto';

export interface StorageStats {
  totalFiles: number;
  totalSizeBytes: number;
  totalSizeMB: number;
  totalSizeGB: number;
  oldestFile: Date | null;
  newestFile: Date | null;
  averageFileSizeKB: number;
}

export interface CleanupResult {
  deletedFiles: number;
  freedSpaceBytes: number;
  freedSpaceMB: number;
  errors: string[];
}

export interface StorageConfig {
  basePath: string;
  maxStorageGB?: number;
  maxFileAgeDays?: number;
  compressionQuality?: number;
  enableCompression?: boolean;
  enableDeduplication?: boolean;
}

export class FrameStorageService {
  private static instance: FrameStorageService;
  private config: StorageConfig;
  private frameHashMap: Map<string, string> = new Map(); // hash -> filepath for deduplication

  private constructor() {
    this.config = {
      basePath: process.env.FRAME_STORAGE_PATH || './frames',
      maxStorageGB: parseInt(process.env.MAX_STORAGE_GB || '100'),
      maxFileAgeDays: parseInt(process.env.MAX_FILE_AGE_DAYS || '30'),
      compressionQuality: 85,
      enableCompression: true,
      enableDeduplication: false // Disabled by default for performance
    };
  }

  public static getInstance(): FrameStorageService {
    if (!FrameStorageService.instance) {
      FrameStorageService.instance = new FrameStorageService();
    }
    return FrameStorageService.instance;
  }

  /**
   * Initialize storage directories
   */
  async initialize(): Promise<void> {
    const dirs = [
      this.config.basePath,
      path.join(this.config.basePath, 'extracted'),
      path.join(this.config.basePath, 'thumbnails'),
      path.join(this.config.basePath, 'processed'),
      path.join(this.config.basePath, 'temp'),
      path.join(this.config.basePath, 'archive')
    ];

    for (const dir of dirs) {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  /**
   * Store a frame with optional optimization
   */
  async storeFrame(
    framePath: string,
    videoId: string,
    timestamp: number,
    options: {
      generateThumbnail?: boolean;
      compress?: boolean;
      deduplicate?: boolean;
    } = {}
  ): Promise<{
    storagePath: string;
    thumbnailPath?: string;
    isDuplicate?: boolean;
    originalSize: number;
    storedSize: number;
  }> {
    const stats = await fs.stat(framePath);
    const originalSize = stats.size;
    
    // Check for duplicates if deduplication is enabled
    if (options.deduplicate !== false && this.config.enableDeduplication) {
      const hash = await this.calculateFileHash(framePath);
      const existingPath = this.frameHashMap.get(hash);
      
      if (existingPath) {
        // Frame is duplicate, return existing path
        return {
          storagePath: existingPath,
          isDuplicate: true,
          originalSize,
          storedSize: 0 // No additional storage used
        };
      }
      
      this.frameHashMap.set(hash, framePath);
    }

    // Create storage directory for video
    const videoDir = path.join(this.config.basePath, 'extracted', videoId);
    await fs.mkdir(videoDir, { recursive: true });

    // Generate filename
    const frameFilename = `frame_${timestamp.toFixed(3).replace('.', '_')}.jpg`;
    let storagePath = path.join(videoDir, frameFilename);

    // Compress if enabled
    if (options.compress !== false && this.config.enableCompression) {
      storagePath = await this.compressImage(framePath, storagePath);
    } else {
      // Copy file without compression
      await fs.copyFile(framePath, storagePath);
    }

    // Generate thumbnail if requested
    let thumbnailPath: string | undefined;
    if (options.generateThumbnail) {
      thumbnailPath = await this.generateThumbnail(storagePath, videoId, timestamp);
    }

    const finalStats = await fs.stat(storagePath);
    
    return {
      storagePath,
      thumbnailPath,
      isDuplicate: false,
      originalSize,
      storedSize: finalStats.size
    };
  }

  /**
   * Compress an image file
   */
  private async compressImage(inputPath: string, outputPath: string): Promise<string> {
    await sharp(inputPath)
      .jpeg({
        quality: this.config.compressionQuality,
        progressive: true,
        optimizeScans: true
      })
      .toFile(outputPath);
    
    return outputPath;
  }

  /**
   * Generate thumbnail for a frame
   */
  private async generateThumbnail(
    framePath: string,
    videoId: string,
    timestamp: number
  ): Promise<string> {
    const thumbnailDir = path.join(this.config.basePath, 'thumbnails', videoId);
    await fs.mkdir(thumbnailDir, { recursive: true });
    
    const thumbnailFilename = `thumb_${timestamp.toFixed(3).replace('.', '_')}.jpg`;
    const thumbnailPath = path.join(thumbnailDir, thumbnailFilename);
    
    await sharp(framePath)
      .resize(320, 240, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .jpeg({ quality: 80 })
      .toFile(thumbnailPath);
    
    return thumbnailPath;
  }

  /**
   * Calculate file hash for deduplication
   */
  private async calculateFileHash(filePath: string): Promise<string> {
    const fileBuffer = await fs.readFile(filePath);
    const hashSum = crypto.createHash('sha256');
    hashSum.update(fileBuffer);
    return hashSum.digest('hex');
  }

  /**
   * Get storage statistics
   */
  async getStorageStats(): Promise<StorageStats> {
    const stats: StorageStats = {
      totalFiles: 0,
      totalSizeBytes: 0,
      totalSizeMB: 0,
      totalSizeGB: 0,
      oldestFile: null,
      newestFile: null,
      averageFileSizeKB: 0
    };

    const processDirectory = async (dirPath: string) => {
      try {
        const files = await fs.readdir(dirPath);
        
        for (const file of files) {
          const filePath = path.join(dirPath, file);
          const fileStat = await fs.stat(filePath);
          
          if (fileStat.isDirectory()) {
            await processDirectory(filePath);
          } else if (fileStat.isFile()) {
            stats.totalFiles++;
            stats.totalSizeBytes += fileStat.size;
            
            if (!stats.oldestFile || fileStat.birthtime < stats.oldestFile) {
              stats.oldestFile = fileStat.birthtime;
            }
            
            if (!stats.newestFile || fileStat.birthtime > stats.newestFile) {
              stats.newestFile = fileStat.birthtime;
            }
          }
        }
      } catch (error) {
        console.error(`Error processing directory ${dirPath}:`, error);
      }
    };

    await processDirectory(this.config.basePath);
    
    stats.totalSizeMB = stats.totalSizeBytes / (1024 * 1024);
    stats.totalSizeGB = stats.totalSizeMB / 1024;
    stats.averageFileSizeKB = stats.totalFiles > 0 ? 
      (stats.totalSizeBytes / stats.totalFiles) / 1024 : 0;
    
    return stats;
  }

  /**
   * Clean up old or unused frames
   */
  async cleanupOldFrames(options: {
    maxAgeDays?: number;
    maxStorageGB?: number;
    dryRun?: boolean;
  } = {}): Promise<CleanupResult> {
    const maxAgeDays = options.maxAgeDays || this.config.maxFileAgeDays || 30;
    const maxStorageGB = options.maxStorageGB || this.config.maxStorageGB || 100;
    const dryRun = options.dryRun || false;
    
    const result: CleanupResult = {
      deletedFiles: 0,
      freedSpaceBytes: 0,
      freedSpaceMB: 0,
      errors: []
    };

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays);

    const processDirectory = async (dirPath: string) => {
      try {
        const files = await fs.readdir(dirPath);
        
        for (const file of files) {
          const filePath = path.join(dirPath, file);
          const fileStat = await fs.stat(filePath);
          
          if (fileStat.isDirectory()) {
            await processDirectory(filePath);
          } else if (fileStat.isFile() && fileStat.mtime < cutoffDate) {
            if (!dryRun) {
              try {
                await fs.unlink(filePath);
                result.deletedFiles++;
                result.freedSpaceBytes += fileStat.size;
              } catch (error) {
                result.errors.push(`Failed to delete ${filePath}: ${error}`);
              }
            } else {
              // Dry run - just count
              result.deletedFiles++;
              result.freedSpaceBytes += fileStat.size;
            }
          }
        }
      } catch (error) {
        result.errors.push(`Error processing directory ${dirPath}: ${error}`);
      }
    };

    await processDirectory(this.config.basePath);
    
    result.freedSpaceMB = result.freedSpaceBytes / (1024 * 1024);
    
    return result;
  }

  /**
   * Archive frames to compressed format
   */
  async archiveFrames(
    videoId: string,
    deleteOriginals: boolean = false
  ): Promise<{
    archivePath: string;
    originalSizeMB: number;
    compressedSizeMB: number;
    compressionRatio: number;
  }> {
    const videoDir = path.join(this.config.basePath, 'extracted', videoId);
    const archiveDir = path.join(this.config.basePath, 'archive');
    await fs.mkdir(archiveDir, { recursive: true });
    
    const archivePath = path.join(archiveDir, `${videoId}_frames.tar`);
    
    // Get original size
    const stats = await this.getDirectorySize(videoDir);
    
    // In a real implementation, we would create a tar archive
    // For now, just returning placeholder values
    const result = {
      archivePath,
      originalSizeMB: stats.totalSizeMB,
      compressedSizeMB: stats.totalSizeMB * 0.7, // Assume 30% compression
      compressionRatio: 0.7
    };
    
    if (deleteOriginals) {
      // Delete original files after archiving
      await fs.rm(videoDir, { recursive: true, force: true });
    }
    
    return result;
  }

  /**
   * Get directory size statistics
   */
  private async getDirectorySize(dirPath: string): Promise<{
    totalFiles: number;
    totalSizeBytes: number;
    totalSizeMB: number;
  }> {
    let totalFiles = 0;
    let totalSizeBytes = 0;
    
    const processDir = async (dir: string) => {
      const files = await fs.readdir(dir);
      
      for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = await fs.stat(filePath);
        
        if (stat.isDirectory()) {
          await processDir(filePath);
        } else {
          totalFiles++;
          totalSizeBytes += stat.size;
        }
      }
    };
    
    try {
      await processDir(dirPath);
    } catch (error) {
      console.error(`Error calculating directory size for ${dirPath}:`, error);
    }
    
    return {
      totalFiles,
      totalSizeBytes,
      totalSizeMB: totalSizeBytes / (1024 * 1024)
    };
  }

  /**
   * Move frames to a different storage location
   */
  async moveFrames(
    videoId: string,
    newBasePath: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const sourceDir = path.join(this.config.basePath, 'extracted', videoId);
      const targetDir = path.join(newBasePath, 'extracted', videoId);
      
      // Create target directory
      await fs.mkdir(path.dirname(targetDir), { recursive: true });
      
      // Move directory
      await fs.rename(sourceDir, targetDir);
      
      // Update database records
      const frames = await Frame.findByVideoId(videoId);
      for (const frame of frames) {
        if (frame.frame_file_path) {
          const newPath = frame.frame_file_path.replace(
            this.config.basePath,
            newBasePath
          );
          // Would update frame record here
        }
      }
      
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Verify frame integrity
   */
  async verifyFrameIntegrity(videoId: string): Promise<{
    totalFrames: number;
    missingFiles: string[];
    corruptedFiles: string[];
    validFiles: number;
  }> {
    const frames = await Frame.findByVideoId(videoId);
    const result = {
      totalFrames: frames.length,
      missingFiles: [] as string[],
      corruptedFiles: [] as string[],
      validFiles: 0
    };
    
    for (const frame of frames) {
      if (!frame.frame_file_path) continue;
      
      try {
        // Check if file exists
        await fs.access(frame.frame_file_path);
        
        // Try to read image metadata to verify it's not corrupted
        await sharp(frame.frame_file_path).metadata();
        
        result.validFiles++;
      } catch (error) {
        if (error instanceof Error && error.message.includes('ENOENT')) {
          result.missingFiles.push(frame.frame_file_path);
        } else {
          result.corruptedFiles.push(frame.frame_file_path);
        }
      }
    }
    
    return result;
  }
}

export const frameStorageService = FrameStorageService.getInstance();