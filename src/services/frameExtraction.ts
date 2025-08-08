import path from 'path';
import fs from 'fs/promises';
import { ffmpegService } from './ffmpeg';
import { Frame } from '../models/Frame';
import { Video } from '../models/Video';
import sharp from 'sharp';

export interface FrameExtractionOptions {
  intervalSeconds?: number;
  startTime?: number;
  endTime?: number;
  maxFrames?: number;
  quality?: number;
  resizeWidth?: number;
  generateThumbnails?: boolean;
}

export interface ExtractedFrame {
  videoId: string;
  timestamp: number;
  frameNumber: number;
  filePath: string;
  thumbnailPath?: string;
  fileSize: number;
  width: number;
  height: number;
}

export class FrameExtractionService {
  private static instance: FrameExtractionService;
  private frameStoragePath: string;
  private defaultInterval: number;

  private constructor() {
    this.frameStoragePath = process.env.FRAME_STORAGE_PATH || './frames';
    this.defaultInterval = parseInt(process.env.DEFAULT_FRAME_INTERVAL_SECONDS || '3');
  }

  public static getInstance(): FrameExtractionService {
    if (!FrameExtractionService.instance) {
      FrameExtractionService.instance = new FrameExtractionService();
    }
    return FrameExtractionService.instance;
  }

  /**
   * Initialize frame storage directories
   */
  async initialize(): Promise<void> {
    await fs.mkdir(this.frameStoragePath, { recursive: true });
    await fs.mkdir(path.join(this.frameStoragePath, 'extracted'), { recursive: true });
    await fs.mkdir(path.join(this.frameStoragePath, 'thumbnails'), { recursive: true });
  }

  /**
   * Extract frames from a video
   */
  async extractFrames(
    videoId: string,
    options: FrameExtractionOptions = {}
  ): Promise<ExtractedFrame[]> {
    const video = await Video.findById(videoId);
    if (!video) {
      throw new Error(`Video ${videoId} not found`);
    }

    const {
      intervalSeconds = this.defaultInterval,
      startTime = 0,
      endTime = video.duration,
      maxFrames,
      quality = 2,
      resizeWidth,
      generateThumbnails = true
    } = options;

    // Create output directory for this video
    const videoFrameDir = path.join(this.frameStoragePath, 'extracted', videoId);
    await fs.mkdir(videoFrameDir, { recursive: true });

    // Extract frames using FFmpeg
    const framePaths = await ffmpegService.extractFrames(
      video.file_path,
      videoFrameDir,
      intervalSeconds,
      {
        startTime,
        endTime,
        maxFrames,
        quality
      }
    );

    // Process extracted frames
    const extractedFrames: ExtractedFrame[] = [];
    const fps = video.fps || 30;

    for (let i = 0; i < framePaths.length; i++) {
      const framePath = framePaths[i];
      const timestamp = startTime + (i * intervalSeconds);
      const frameNumber = Math.floor(timestamp * fps);

      // Get frame dimensions and optionally resize
      let processedPath = framePath;
      const metadata = await sharp(framePath).metadata();
      
      if (resizeWidth && metadata.width && metadata.width > resizeWidth) {
        const resizedPath = framePath.replace('.jpg', '_resized.jpg');
        await sharp(framePath)
          .resize(resizeWidth, null, { 
            withoutEnlargement: true,
            fit: 'inside'
          })
          .jpeg({ quality: 90 })
          .toFile(resizedPath);
        
        // Delete original and use resized
        await fs.unlink(framePath);
        processedPath = resizedPath;
      }

      // Generate thumbnail if requested
      let thumbnailPath: string | undefined;
      if (generateThumbnails) {
        thumbnailPath = await this.generateThumbnail(
          processedPath,
          videoId,
          `thumb_${i.toString().padStart(6, '0')}.jpg`
        );
      }

      // Get final file stats
      const stats = await fs.stat(processedPath);
      const finalMetadata = await sharp(processedPath).metadata();

      const extractedFrame: ExtractedFrame = {
        videoId,
        timestamp,
        frameNumber,
        filePath: processedPath,
        thumbnailPath,
        fileSize: stats.size,
        width: finalMetadata.width || 0,
        height: finalMetadata.height || 0
      };

      extractedFrames.push(extractedFrame);

      // Save to database
      await Frame.create({
        video_id: videoId,
        timestamp,
        frame_number: frameNumber,
        frame_file_path: processedPath
      });
    }

    // Update video status
    await Video.updateStatus(videoId, 'processing');

    return extractedFrames;
  }

  /**
   * Extract a single frame at a specific timestamp
   */
  async extractSingleFrame(
    videoId: string,
    timestamp: number,
    options: {
      quality?: number;
      resizeWidth?: number;
      generateThumbnail?: boolean;
    } = {}
  ): Promise<ExtractedFrame> {
    const video = await Video.findById(videoId);
    if (!video) {
      throw new Error(`Video ${videoId} not found`);
    }

    const { quality = 2, resizeWidth, generateThumbnail = false } = options;

    // Create output path
    const videoFrameDir = path.join(this.frameStoragePath, 'extracted', videoId);
    await fs.mkdir(videoFrameDir, { recursive: true });
    
    const frameFilename = `frame_${timestamp.toFixed(3).replace('.', '_')}.jpg`;
    const framePath = path.join(videoFrameDir, frameFilename);

    // Extract frame
    await ffmpegService.extractSingleFrame(
      video.file_path,
      timestamp,
      framePath,
      { quality }
    );

    // Process frame
    let processedPath = framePath;
    const metadata = await sharp(framePath).metadata();
    
    if (resizeWidth && metadata.width && metadata.width > resizeWidth) {
      const resizedPath = framePath.replace('.jpg', '_resized.jpg');
      await sharp(framePath)
        .resize(resizeWidth, null, { 
          withoutEnlargement: true,
          fit: 'inside'
        })
        .jpeg({ quality: 90 })
        .toFile(resizedPath);
      
      await fs.unlink(framePath);
      processedPath = resizedPath;
    }

    // Generate thumbnail
    let thumbnailPath: string | undefined;
    if (generateThumbnail) {
      thumbnailPath = await this.generateThumbnail(
        processedPath,
        videoId,
        `thumb_single_${timestamp.toFixed(3).replace('.', '_')}.jpg`
      );
    }

    // Get final stats
    const stats = await fs.stat(processedPath);
    const finalMetadata = await sharp(processedPath).metadata();
    const fps = video.fps || 30;

    const extractedFrame: ExtractedFrame = {
      videoId,
      timestamp,
      frameNumber: Math.floor(timestamp * fps),
      filePath: processedPath,
      thumbnailPath,
      fileSize: stats.size,
      width: finalMetadata.width || 0,
      height: finalMetadata.height || 0
    };

    // Save to database
    await Frame.create({
      video_id: videoId,
      timestamp,
      frame_number: extractedFrame.frameNumber,
      frame_file_path: processedPath
    });

    return extractedFrame;
  }

  /**
   * Generate thumbnail for a frame
   */
  private async generateThumbnail(
    framePath: string,
    videoId: string,
    thumbnailFilename: string
  ): Promise<string> {
    const thumbnailDir = path.join(this.frameStoragePath, 'thumbnails', videoId);
    await fs.mkdir(thumbnailDir, { recursive: true });
    
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
   * Extract key frames based on scene changes
   */
  async extractKeyFrames(
    videoId: string,
    sceneThreshold: number = 0.3
  ): Promise<ExtractedFrame[]> {
    // This would use more advanced FFmpeg scene detection
    // For now, using simple interval extraction
    return this.extractFrames(videoId, {
      intervalSeconds: 5,
      generateThumbnails: true
    });
  }

  /**
   * Delete all frames for a video
   */
  async deleteVideoFrames(videoId: string): Promise<boolean> {
    try {
      // Delete frame directories
      const extractedDir = path.join(this.frameStoragePath, 'extracted', videoId);
      const thumbnailDir = path.join(this.frameStoragePath, 'thumbnails', videoId);
      
      await fs.rm(extractedDir, { recursive: true, force: true });
      await fs.rm(thumbnailDir, { recursive: true, force: true });
      
      // Delete from database
      const frames = await Frame.findByVideoId(videoId);
      for (const frame of frames) {
        await Frame.delete(frame.id);
      }
      
      return true;
    } catch (error) {
      console.error('Error deleting frames:', error);
      return false;
    }
  }

  /**
   * Get frame statistics for a video
   */
  async getFrameStats(videoId: string): Promise<{
    totalFrames: number;
    totalSizeMB: number;
    averageFrameSizeKB: number;
    coveragePercentage: number;
  }> {
    const video = await Video.findById(videoId);
    const frames = await Frame.findByVideoId(videoId);
    
    if (!video || frames.length === 0) {
      return {
        totalFrames: 0,
        totalSizeMB: 0,
        averageFrameSizeKB: 0,
        coveragePercentage: 0
      };
    }

    // Calculate total size of frame files
    let totalSize = 0;
    for (const frame of frames) {
      if (frame.frame_file_path) {
        try {
          const stats = await fs.stat(frame.frame_file_path);
          totalSize += stats.size;
        } catch {
          // File might be deleted
        }
      }
    }

    const expectedFrames = video.total_frames || 0;
    const coveragePercentage = expectedFrames > 0 ? 
      (frames.length / expectedFrames) * 100 : 0;

    return {
      totalFrames: frames.length,
      totalSizeMB: totalSize / (1024 * 1024),
      averageFrameSizeKB: frames.length > 0 ? 
        (totalSize / frames.length) / 1024 : 0,
      coveragePercentage
    };
  }

  /**
   * Optimize frame storage by removing duplicates or similar frames
   */
  async optimizeFrameStorage(
    videoId: string,
    similarityThreshold: number = 0.95
  ): Promise<{ removedFrames: number; savedSpaceMB: number }> {
    // This would implement perceptual hashing to find similar frames
    // For now, returning placeholder
    return {
      removedFrames: 0,
      savedSpaceMB: 0
    };
  }
}

export const frameExtractionService = FrameExtractionService.getInstance();