import { ffmpegService, FFProbeData } from './ffmpeg';
import { Video } from '../models/Video';
import sharp from 'sharp';
import path from 'path';

export interface VideoMetadataDetailed {
  // Basic info
  duration: number;
  fps: number;
  resolution: {
    width: number;
    height: number;
    aspectRatio: string;
  };
  format: string;
  codec: string;
  bitrate: number;
  fileSize: number;
  
  // Technical details
  colorSpace?: string;
  pixelFormat?: string;
  profile?: string;
  level?: string;
  
  // Audio info
  hasAudio: boolean;
  audioCodec?: string;
  audioChannels?: number;
  audioSampleRate?: number;
  audioBitrate?: number;
  
  // Content metadata
  creationTime?: Date;
  location?: {
    latitude: number;
    longitude: number;
    altitude?: number;
  };
  device?: {
    make?: string;
    model?: string;
    software?: string;
  };
  
  // Computed metadata
  totalFrames: number;
  keyFrameInterval?: number;
  isHDR: boolean;
  is4K: boolean;
  isVertical: boolean;
  qualityScore: number; // 0-10 based on resolution, bitrate, etc.
}

export interface FrameMetadata {
  timestamp: number;
  frameNumber: number;
  width: number;
  height: number;
  format: string;
  colorSpace: string;
  hasAlpha: boolean;
  density?: number;
  
  // Color analysis
  dominantColors?: Array<{
    r: number;
    g: number;
    b: number;
    percentage: number;
  }>;
  
  // Image characteristics
  brightness?: number; // 0-255
  contrast?: number; // 0-100
  sharpness?: number; // 0-100
  isBlurry?: boolean;
  isDark?: boolean;
  isBright?: boolean;
}

export class MetadataExtractionService {
  private static instance: MetadataExtractionService;

  private constructor() {}

  public static getInstance(): MetadataExtractionService {
    if (!MetadataExtractionService.instance) {
      MetadataExtractionService.instance = new MetadataExtractionService();
    }
    return MetadataExtractionService.instance;
  }

  /**
   * Extract comprehensive metadata from video file
   */
  async extractVideoMetadata(videoPath: string): Promise<VideoMetadataDetailed> {
    const ffprobeData = await ffmpegService.getVideoMetadata(videoPath);
    
    // Find video and audio streams
    const videoStream = ffprobeData.streams.find(s => s.codec_type === 'video');
    const audioStream = ffprobeData.streams.find(s => s.codec_type === 'audio');
    
    if (!videoStream) {
      throw new Error('No video stream found in file');
    }

    // Parse frame rate
    const fps = this.parseFPS(videoStream.r_frame_rate || '0/1');
    
    // Parse duration
    const duration = parseFloat(ffprobeData.format.duration || '0');
    
    // Calculate total frames
    const totalFrames = videoStream.nb_frames ? 
      parseInt(videoStream.nb_frames) : 
      Math.floor(duration * fps);

    // Parse resolution
    const width = videoStream.width || 0;
    const height = videoStream.height || 0;
    const aspectRatio = this.calculateAspectRatio(width, height);

    // Check quality indicators
    const is4K = width >= 3840 || height >= 2160;
    const isVertical = height > width;
    const isHDR = this.checkHDR(videoStream);
    
    // Calculate quality score
    const qualityScore = this.calculateQualityScore({
      resolution: { width, height },
      bitrate: parseInt(videoStream.bit_rate || ffprobeData.format.bit_rate || '0'),
      fps,
      codec: videoStream.codec_name || ''
    });

    // Parse GPS coordinates if available
    const location = this.parseLocation(ffprobeData.format.tags);
    
    // Parse device info
    const device = this.parseDeviceInfo(ffprobeData.format.tags);

    return {
      duration,
      fps,
      resolution: {
        width,
        height,
        aspectRatio
      },
      format: ffprobeData.format.format_name || '',
      codec: videoStream.codec_name || '',
      bitrate: parseInt(videoStream.bit_rate || ffprobeData.format.bit_rate || '0'),
      fileSize: parseInt(ffprobeData.format.size || '0'),
      
      // Technical details
      colorSpace: videoStream.color_space,
      pixelFormat: videoStream.pix_fmt,
      profile: videoStream.profile,
      level: videoStream.level?.toString(),
      
      // Audio info
      hasAudio: !!audioStream,
      audioCodec: audioStream?.codec_name,
      audioChannels: audioStream?.channels,
      audioSampleRate: audioStream?.sample_rate ? parseInt(audioStream.sample_rate) : undefined,
      audioBitrate: audioStream?.bit_rate ? parseInt(audioStream.bit_rate) : undefined,
      
      // Content metadata
      creationTime: ffprobeData.format.tags?.creation_time ? 
        new Date(ffprobeData.format.tags.creation_time) : 
        undefined,
      location,
      device,
      
      // Computed metadata
      totalFrames,
      keyFrameInterval: this.estimateKeyFrameInterval(videoStream),
      isHDR,
      is4K,
      isVertical,
      qualityScore
    };
  }

  /**
   * Extract metadata from a frame image
   */
  async extractFrameMetadata(framePath: string): Promise<FrameMetadata> {
    const image = sharp(framePath);
    const metadata = await image.metadata();
    const stats = await image.stats();
    
    // Calculate brightness (mean of all channels)
    const brightness = (stats.channels[0].mean + 
                       stats.channels[1].mean + 
                       stats.channels[2].mean) / 3;
    
    // Estimate contrast (standard deviation)
    const contrast = (stats.channels[0].stdev + 
                     stats.channels[1].stdev + 
                     stats.channels[2].stdev) / 3;
    
    // Determine if image is dark or bright
    const isDark = brightness < 50;
    const isBright = brightness > 200;
    
    // Extract dominant colors
    const dominantColors = await this.extractDominantColors(framePath);
    
    // Parse frame number from filename if available
    const frameNumber = this.parseFrameNumber(framePath);
    
    return {
      timestamp: 0, // Would need to be provided separately
      frameNumber,
      width: metadata.width || 0,
      height: metadata.height || 0,
      format: metadata.format || '',
      colorSpace: metadata.space || '',
      hasAlpha: metadata.hasAlpha || false,
      density: metadata.density,
      
      dominantColors,
      
      brightness,
      contrast,
      sharpness: await this.estimateSharpness(framePath),
      isBlurry: contrast < 10, // Simple blur detection
      isDark,
      isBright
    };
  }

  /**
   * Parse FPS from FFmpeg format (e.g., "30/1" -> 30)
   */
  private parseFPS(fpsString: string): number {
    const parts = fpsString.split('/');
    if (parts.length === 2) {
      return parseFloat(parts[0]) / parseFloat(parts[1]);
    }
    return parseFloat(fpsString) || 30;
  }

  /**
   * Calculate aspect ratio string
   */
  private calculateAspectRatio(width: number, height: number): string {
    if (width === 0 || height === 0) return 'unknown';
    
    const gcd = this.gcd(width, height);
    const ratioWidth = width / gcd;
    const ratioHeight = height / gcd;
    
    // Common aspect ratios
    const ratio = width / height;
    if (Math.abs(ratio - 16/9) < 0.01) return '16:9';
    if (Math.abs(ratio - 4/3) < 0.01) return '4:3';
    if (Math.abs(ratio - 21/9) < 0.01) return '21:9';
    if (Math.abs(ratio - 1) < 0.01) return '1:1';
    if (Math.abs(ratio - 9/16) < 0.01) return '9:16';
    
    return `${ratioWidth}:${ratioHeight}`;
  }

  /**
   * Greatest common divisor
   */
  private gcd(a: number, b: number): number {
    return b === 0 ? a : this.gcd(b, a % b);
  }

  /**
   * Check if video is HDR
   */
  private checkHDR(videoStream: any): boolean {
    const colorTransfer = videoStream.color_transfer;
    const colorPrimaries = videoStream.color_primaries;
    
    return colorTransfer === 'smpte2084' || 
           colorTransfer === 'arib-std-b67' ||
           colorPrimaries === 'bt2020';
  }

  /**
   * Calculate quality score based on various factors
   */
  private calculateQualityScore(params: {
    resolution: { width: number; height: number };
    bitrate: number;
    fps: number;
    codec: string;
  }): number {
    let score = 5; // Base score
    
    // Resolution scoring
    const pixels = params.resolution.width * params.resolution.height;
    if (pixels >= 3840 * 2160) score += 2; // 4K
    else if (pixels >= 1920 * 1080) score += 1.5; // Full HD
    else if (pixels >= 1280 * 720) score += 1; // HD
    else if (pixels < 640 * 480) score -= 1; // Low res
    
    // Bitrate scoring (assuming reasonable bitrates)
    const expectedBitrate = pixels * params.fps * 0.1; // Rough estimate
    const bitrateRatio = params.bitrate / expectedBitrate;
    if (bitrateRatio > 1.5) score += 1;
    else if (bitrateRatio < 0.5) score -= 1;
    
    // Codec scoring
    const modernCodecs = ['h265', 'hevc', 'av1', 'vp9'];
    const standardCodecs = ['h264', 'avc'];
    if (modernCodecs.includes(params.codec.toLowerCase())) score += 1;
    else if (!standardCodecs.includes(params.codec.toLowerCase())) score -= 0.5;
    
    // FPS scoring
    if (params.fps >= 60) score += 0.5;
    else if (params.fps < 24) score -= 0.5;
    
    return Math.max(0, Math.min(10, score));
  }

  /**
   * Parse location from metadata tags
   */
  private parseLocation(tags: any): VideoMetadataDetailed['location'] | undefined {
    if (!tags) return undefined;
    
    // Try different tag formats
    const lat = tags.location_latitude || tags['com.apple.quicktime.location.ISO6709'];
    const lon = tags.location_longitude;
    
    if (lat && lon) {
      return {
        latitude: parseFloat(lat),
        longitude: parseFloat(lon),
        altitude: tags.location_altitude ? parseFloat(tags.location_altitude) : undefined
      };
    }
    
    // Parse ISO 6709 format if present
    if (tags['com.apple.quicktime.location.ISO6709']) {
      const iso6709 = tags['com.apple.quicktime.location.ISO6709'];
      const match = iso6709.match(/([+-]\d+\.?\d*)([+-]\d+\.?\d*)/);
      if (match) {
        return {
          latitude: parseFloat(match[1]),
          longitude: parseFloat(match[2])
        };
      }
    }
    
    return undefined;
  }

  /**
   * Parse device information from metadata tags
   */
  private parseDeviceInfo(tags: any): VideoMetadataDetailed['device'] | undefined {
    if (!tags) return undefined;
    
    return {
      make: tags['com.apple.quicktime.make'] || tags.make,
      model: tags['com.apple.quicktime.model'] || tags.model,
      software: tags['com.apple.quicktime.software'] || tags.software || tags.encoder
    };
  }

  /**
   * Estimate key frame interval
   */
  private estimateKeyFrameInterval(videoStream: any): number | undefined {
    // This is a rough estimate - actual detection would require frame analysis
    const gopSize = videoStream.gop_size;
    if (gopSize) return parseInt(gopSize);
    
    // Default estimates based on codec
    const codec = videoStream.codec_name?.toLowerCase();
    if (codec === 'h264' || codec === 'hevc') return 250;
    if (codec === 'vp9') return 150;
    
    return undefined;
  }

  /**
   * Extract dominant colors from an image
   */
  private async extractDominantColors(imagePath: string, numColors: number = 5): Promise<Array<{
    r: number;
    g: number;
    b: number;
    percentage: number;
  }>> {
    // This is simplified - a real implementation would use color quantization
    const { dominant } = await sharp(imagePath).stats();
    
    return [{
      r: dominant.r,
      g: dominant.g,
      b: dominant.b,
      percentage: 100 // Simplified - would need proper color histogram
    }];
  }

  /**
   * Estimate image sharpness
   */
  private async estimateSharpness(imagePath: string): Promise<number> {
    // Simplified sharpness detection using edge detection
    // Real implementation would use Laplacian variance or similar
    const stats = await sharp(imagePath)
      .greyscale()
      .convolve({
        width: 3,
        height: 3,
        kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1] // Laplacian kernel
      })
      .stats();
    
    // Higher standard deviation indicates more edges (sharper image)
    const sharpness = Math.min(100, stats.channels[0].stdev);
    return sharpness;
  }

  /**
   * Parse frame number from filename
   */
  private parseFrameNumber(framePath: string): number {
    const filename = path.basename(framePath);
    const match = filename.match(/frame_(\d+)/);
    return match ? parseInt(match[1]) : 0;
  }

  /**
   * Update video record with extracted metadata
   */
  async updateVideoMetadata(videoId: string): Promise<void> {
    const video = await Video.findById(videoId);
    if (!video) {
      throw new Error(`Video ${videoId} not found`);
    }

    const metadata = await this.extractVideoMetadata(video.file_path);
    
    // Update video record with detailed metadata
    await Video.addFFProbeMetadata(videoId, {
      format: {
        duration: metadata.duration.toString(),
        bit_rate: metadata.bitrate.toString(),
        size: metadata.fileSize.toString()
      },
      streams: [{
        codec_type: 'video',
        width: metadata.resolution.width,
        height: metadata.resolution.height,
        r_frame_rate: `${metadata.fps}/1`,
        nb_frames: metadata.totalFrames.toString()
      }]
    });
  }
}

export const metadataExtractionService = MetadataExtractionService.getInstance();