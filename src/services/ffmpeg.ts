import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from '@ffmpeg-installer/ffmpeg';
import path from 'path';
import fs from 'fs/promises';
import { VideoMetadata } from '../types/index';

// Set FFmpeg path
ffmpeg.setFfmpegPath(ffmpegPath.path);

export interface FFProbeData {
  streams: Array<{
    index: number;
    codec_name: string;
    codec_type: string;
    width?: number;
    height?: number;
    duration?: string;
    bit_rate?: string;
    nb_frames?: string;
    r_frame_rate?: string;
    avg_frame_rate?: string;
  }>;
  format: {
    filename: string;
    nb_streams: number;
    format_name: string;
    format_long_name: string;
    duration?: string;
    size?: string;
    bit_rate?: string;
    tags?: Record<string, any>;
  };
}

export class FFmpegService {
  private static instance: FFmpegService;

  private constructor() {}

  public static getInstance(): FFmpegService {
    if (!FFmpegService.instance) {
      FFmpegService.instance = new FFmpegService();
    }
    return FFmpegService.instance;
  }

  /**
   * Extract metadata from video file using ffprobe
   */
  async getVideoMetadata(videoPath: string): Promise<FFProbeData> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) {
          reject(err);
        } else {
          resolve(metadata as FFProbeData);
        }
      });
    });
  }

  /**
   * Extract frames from video at specified intervals
   */
  async extractFrames(
    videoPath: string,
    outputDir: string,
    intervalSeconds: number = 3,
    options: {
      startTime?: number;
      endTime?: number;
      maxFrames?: number;
      quality?: number; // 1-31, lower is better quality
    } = {}
  ): Promise<string[]> {
    await fs.mkdir(outputDir, { recursive: true });
    
    const frameFiles: string[] = [];
    const { startTime = 0, endTime, maxFrames, quality = 2 } = options;

    return new Promise((resolve, reject) => {
      const command = ffmpeg(videoPath);
      
      // Set start time if specified
      if (startTime > 0) {
        command.seekInput(startTime);
      }
      
      // Set duration if end time is specified
      if (endTime) {
        command.duration(endTime - startTime);
      }
      
      // Configure frame extraction
      command
        .fps(1 / intervalSeconds) // Extract 1 frame every N seconds
        .outputOptions([
          `-q:v ${quality}`, // JPEG quality
        ]);
      
      // If maxFrames is set, limit the output
      if (maxFrames) {
        command.outputOptions([`-vframes ${maxFrames}`]);
      }
      
      // Output pattern for frame files
      const outputPattern = path.join(outputDir, 'frame_%06d.jpg');
      
      command
        .on('end', async () => {
          // Get list of generated frame files
          const files = await fs.readdir(outputDir);
          const frames = files
            .filter(f => f.startsWith('frame_') && f.endsWith('.jpg'))
            .sort()
            .map(f => path.join(outputDir, f));
          resolve(frames);
        })
        .on('error', (err) => {
          reject(err);
        })
        .on('stderr', (stderrLine) => {
          console.log('FFmpeg:', stderrLine);
        })
        .save(outputPattern);
    });
  }

  /**
   * Extract a single frame at a specific timestamp
   */
  async extractSingleFrame(
    videoPath: string,
    timestamp: number,
    outputPath: string,
    options: {
      width?: number;
      height?: number;
      quality?: number;
    } = {}
  ): Promise<string> {
    const { width, height, quality = 2 } = options;
    
    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    await fs.mkdir(outputDir, { recursive: true });

    return new Promise((resolve, reject) => {
      const command = ffmpeg(videoPath)
        .seekInput(timestamp)
        .frames(1)
        .outputOptions([`-q:v ${quality}`]);
      
      // Add size options if specified
      if (width && height) {
        command.size(`${width}x${height}`);
      } else if (width) {
        command.size(`${width}x?`);
      } else if (height) {
        command.size(`?x${height}`);
      }
      
      command
        .on('end', () => {
          resolve(outputPath);
        })
        .on('error', (err) => {
          reject(err);
        })
        .save(outputPath);
    });
  }

  /**
   * Generate thumbnail for video
   */
  async generateThumbnail(
    videoPath: string,
    outputPath: string,
    timestamp: number = 0,
    size: string = '320x240'
  ): Promise<string> {
    const outputDir = path.dirname(outputPath);
    await fs.mkdir(outputDir, { recursive: true });

    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .seekInput(timestamp)
        .frames(1)
        .size(size)
        .outputOptions(['-q:v 2'])
        .on('end', () => {
          resolve(outputPath);
        })
        .on('error', (err) => {
          reject(err);
        })
        .save(outputPath);
    });
  }

  /**
   * Get video duration in seconds
   */
  async getVideoDuration(videoPath: string): Promise<number> {
    const metadata = await this.getVideoMetadata(videoPath);
    const duration = parseFloat(metadata.format.duration || '0');
    return duration;
  }

  /**
   * Get video dimensions
   */
  async getVideoDimensions(videoPath: string): Promise<{ width: number; height: number }> {
    const metadata = await this.getVideoMetadata(videoPath);
    const videoStream = metadata.streams.find(s => s.codec_type === 'video');
    
    if (!videoStream || !videoStream.width || !videoStream.height) {
      throw new Error('Could not determine video dimensions');
    }
    
    return {
      width: videoStream.width,
      height: videoStream.height
    };
  }

  /**
   * Get video FPS (frames per second)
   */
  async getVideoFPS(videoPath: string): Promise<number> {
    const metadata = await this.getVideoMetadata(videoPath);
    const videoStream = metadata.streams.find(s => s.codec_type === 'video');
    
    if (!videoStream || !videoStream.r_frame_rate) {
      throw new Error('Could not determine video FPS');
    }
    
    // Parse frame rate (e.g., "30/1" -> 30)
    const [num, den] = videoStream.r_frame_rate.split('/').map(Number);
    return num / (den || 1);
  }

  /**
   * Convert video to a different format
   */
  async convertVideo(
    inputPath: string,
    outputPath: string,
    options: {
      format?: string;
      codec?: string;
      bitrate?: string;
      fps?: number;
      resolution?: string;
    } = {}
  ): Promise<string> {
    const outputDir = path.dirname(outputPath);
    await fs.mkdir(outputDir, { recursive: true });

    return new Promise((resolve, reject) => {
      const command = ffmpeg(inputPath);
      
      if (options.codec) {
        command.videoCodec(options.codec);
      }
      
      if (options.bitrate) {
        command.videoBitrate(options.bitrate);
      }
      
      if (options.fps) {
        command.fps(options.fps);
      }
      
      if (options.resolution) {
        command.size(options.resolution);
      }
      
      command
        .on('end', () => {
          resolve(outputPath);
        })
        .on('error', (err) => {
          reject(err);
        })
        .on('progress', (progress) => {
          console.log(`Processing: ${progress.percent?.toFixed(2)}% done`);
        })
        .save(outputPath);
    });
  }

  /**
   * Check if file is a valid video
   */
  async isValidVideo(videoPath: string): Promise<boolean> {
    try {
      const metadata = await this.getVideoMetadata(videoPath);
      return metadata.streams.some(s => s.codec_type === 'video');
    } catch {
      return false;
    }
  }
}

export const ffmpegService = FFmpegService.getInstance();