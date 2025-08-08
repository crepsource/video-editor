import path from 'path';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import { ffmpegService } from './ffmpeg';
import { Video } from '../models/Video';
import { ProcessingStatus } from '../types/index';

export interface UploadOptions {
  userId?: string;
  maxSizeMB?: number;
  allowedFormats?: string[];
  uploadPath?: string;
}

export class VideoUploadService {
  private static instance: VideoUploadService;
  private uploadPath: string;
  private maxSizeMB: number;
  private allowedFormats: string[];

  private constructor() {
    this.uploadPath = process.env.UPLOAD_STORAGE_PATH || './uploads';
    this.maxSizeMB = parseInt(process.env.MAX_VIDEO_SIZE_MB || '500');
    this.allowedFormats = ['mp4', 'mov', 'avi', 'mkv', 'webm', 'flv', 'wmv', 'm4v'];
  }

  public static getInstance(): VideoUploadService {
    if (!VideoUploadService.instance) {
      VideoUploadService.instance = new VideoUploadService();
    }
    return VideoUploadService.instance;
  }

  /**
   * Initialize upload directories
   */
  async initialize(): Promise<void> {
    await fs.mkdir(this.uploadPath, { recursive: true });
    await fs.mkdir(path.join(this.uploadPath, 'temp'), { recursive: true });
    await fs.mkdir(path.join(this.uploadPath, 'videos'), { recursive: true });
  }

  /**
   * Validate video file before processing
   */
  private async validateVideo(
    filePath: string,
    options: UploadOptions = {}
  ): Promise<{ valid: boolean; error?: string }> {
    try {
      // Check file exists
      const stats = await fs.stat(filePath);
      
      // Check file size
      const maxSize = options.maxSizeMB || this.maxSizeMB;
      const fileSizeMB = stats.size / (1024 * 1024);
      if (fileSizeMB > maxSize) {
        return { 
          valid: false, 
          error: `File size ${fileSizeMB.toFixed(2)}MB exceeds maximum ${maxSize}MB` 
        };
      }

      // Check file format
      const ext = path.extname(filePath).toLowerCase().slice(1);
      const allowedFormats = options.allowedFormats || this.allowedFormats;
      if (!allowedFormats.includes(ext)) {
        return { 
          valid: false, 
          error: `File format ${ext} not allowed. Allowed formats: ${allowedFormats.join(', ')}` 
        };
      }

      // Validate using FFmpeg
      const isValid = await ffmpegService.isValidVideo(filePath);
      if (!isValid) {
        return { 
          valid: false, 
          error: 'File is not a valid video or is corrupted' 
        };
      }

      return { valid: true };
    } catch (error) {
      return { 
        valid: false, 
        error: `Validation error: ${error instanceof Error ? error.message : 'Unknown error'}` 
      };
    }
  }

  /**
   * Handle video upload and initial processing
   */
  async uploadVideo(
    sourceFilePath: string,
    originalFilename: string,
    options: UploadOptions = {}
  ): Promise<{ videoId: string; success: boolean; error?: string }> {
    try {
      // Validate video
      const validation = await this.validateVideo(sourceFilePath, options);
      if (!validation.valid) {
        return { 
          videoId: '', 
          success: false, 
          error: validation.error 
        };
      }

      // Generate unique video ID and file path
      const videoId = uuidv4();
      const fileExt = path.extname(originalFilename);
      const safeFilename = `${videoId}${fileExt}`;
      const destinationPath = path.join(this.uploadPath, 'videos', safeFilename);

      // Move file to permanent location
      await fs.rename(sourceFilePath, destinationPath);

      // Get file metadata
      const stats = await fs.stat(destinationPath);
      const metadata = await ffmpegService.getVideoMetadata(destinationPath);
      
      // Extract basic information
      const videoStream = metadata.streams.find(s => s.codec_type === 'video');
      const duration = parseFloat(metadata.format.duration || '0');
      const fps = videoStream?.r_frame_rate ? 
        eval(videoStream.r_frame_rate) : // Parse frame rate like "30/1"
        30; // Default FPS
      
      // Create database record
      const videoRecord = await Video.create({
        id: videoId,
        user_id: options.userId,
        filename: originalFilename,
        file_path: destinationPath,
        file_size: stats.size,
        duration: duration,
        format: fileExt.slice(1),
        creation_time: stats.birthtime,
        modification_time: stats.mtime,
        status: 'uploaded' as ProcessingStatus,
        ffprobe_metadata: metadata,
        total_frames: Math.floor(duration * fps),
        fps: fps,
        resolution: videoStream?.width && videoStream?.height ? 
          `${videoStream.width}x${videoStream.height}` : 
          undefined
      });

      return { 
        videoId: videoRecord.id, 
        success: true 
      };
    } catch (error) {
      console.error('Upload error:', error);
      return { 
        videoId: '', 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown upload error' 
      };
    }
  }

  /**
   * Copy video from URL or external source
   */
  async uploadFromUrl(
    videoUrl: string,
    options: UploadOptions = {}
  ): Promise<{ videoId: string; success: boolean; error?: string }> {
    // This would download the video first, then process it
    // Implementation depends on requirements for URL handling
    throw new Error('URL upload not yet implemented');
  }

  /**
   * Handle multipart upload for large files
   */
  async uploadChunk(
    chunkData: Buffer,
    uploadId: string,
    chunkIndex: number,
    totalChunks: number
  ): Promise<{ complete: boolean; error?: string }> {
    try {
      const tempDir = path.join(this.uploadPath, 'temp', uploadId);
      await fs.mkdir(tempDir, { recursive: true });
      
      const chunkPath = path.join(tempDir, `chunk_${chunkIndex.toString().padStart(6, '0')}`);
      await fs.writeFile(chunkPath, chunkData);
      
      // Check if all chunks are uploaded
      const uploadedChunks = await fs.readdir(tempDir);
      if (uploadedChunks.length === totalChunks) {
        // Combine chunks
        const combinedPath = path.join(tempDir, 'combined.tmp');
        const writeStream = await fs.open(combinedPath, 'w');
        
        for (let i = 0; i < totalChunks; i++) {
          const chunkFile = path.join(tempDir, `chunk_${i.toString().padStart(6, '0')}`);
          const chunkData = await fs.readFile(chunkFile);
          await writeStream.write(chunkData);
        }
        
        await writeStream.close();
        
        // Clean up chunks
        for (const chunk of uploadedChunks) {
          if (chunk !== 'combined.tmp') {
            await fs.unlink(path.join(tempDir, chunk));
          }
        }
        
        return { complete: true };
      }
      
      return { complete: false };
    } catch (error) {
      return { 
        complete: false, 
        error: error instanceof Error ? error.message : 'Chunk upload failed' 
      };
    }
  }

  /**
   * Delete uploaded video and its files
   */
  async deleteVideo(videoId: string): Promise<boolean> {
    try {
      const video = await Video.findById(videoId);
      if (!video) {
        return false;
      }

      // Delete video file
      if (video.file_path) {
        await fs.unlink(video.file_path).catch(() => {});
      }

      // Delete from database
      await Video.delete(videoId);
      
      // TODO: Also delete extracted frames and other associated files
      
      return true;
    } catch (error) {
      console.error('Delete error:', error);
      return false;
    }
  }

  /**
   * Get upload statistics
   */
  async getUploadStats(): Promise<{
    totalVideos: number;
    totalSizeGB: number;
    averageDurationMinutes: number;
  }> {
    const videos = await Video.list(1000); // Get recent videos
    
    const totalSizeBytes = videos.reduce((sum, v) => sum + (v.file_size || 0), 0);
    const totalDurationSeconds = videos.reduce((sum, v) => sum + (v.duration || 0), 0);
    
    return {
      totalVideos: videos.length,
      totalSizeGB: totalSizeBytes / (1024 * 1024 * 1024),
      averageDurationMinutes: videos.length > 0 ? 
        (totalDurationSeconds / videos.length) / 60 : 
        0
    };
  }
}

export const videoUploadService = VideoUploadService.getInstance();