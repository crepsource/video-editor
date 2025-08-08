import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';

export interface ImageMetadata {
  width: number;
  height: number;
  format: string;
  size: number;
  hasAlpha: boolean;
}

export interface EncodingOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  format?: 'jpeg' | 'png' | 'webp';
  optimizeForAPI?: boolean;
}

export interface EncodingResult {
  base64: string;
  metadata: ImageMetadata;
  originalSize: number;
  encodedSize: number;
  compressionRatio: number;
}

export class ImageEncoder {
  private static instance: ImageEncoder;
  private static readonly MAX_API_SIZE = 20 * 1024 * 1024; // 20MB limit for OpenAI API
  private static readonly OPTIMAL_API_SIZE = 512 * 1024; // 512KB optimal size

  private constructor() {}

  public static getInstance(): ImageEncoder {
    if (!ImageEncoder.instance) {
      ImageEncoder.instance = new ImageEncoder();
    }
    return ImageEncoder.instance;
  }

  /**
   * Encode image file to base64 with optional optimization
   */
  async encodeImageFile(
    imagePath: string,
    options: EncodingOptions = {}
  ): Promise<EncodingResult> {
    // Read original file
    const originalBuffer = await fs.readFile(imagePath);
    const originalSize = originalBuffer.length;

    // Get image metadata
    const image = sharp(imagePath);
    const metadata = await image.metadata();

    if (!metadata.width || !metadata.height) {
      throw new Error('Could not determine image dimensions');
    }

    // Process image based on options
    const processedBuffer = await this.processImage(image, metadata, options);
    
    // Encode to base64
    const base64 = processedBuffer.toString('base64');
    const encodedSize = Buffer.byteLength(base64, 'utf8');

    // Validate size for API usage
    if (options.optimizeForAPI && encodedSize > ImageEncoder.MAX_API_SIZE) {
      throw new Error(
        `Encoded image size (${this.formatBytes(encodedSize)}) exceeds API limit (${this.formatBytes(ImageEncoder.MAX_API_SIZE)})`
      );
    }

    return {
      base64,
      metadata: {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format || 'unknown',
        size: encodedSize,
        hasAlpha: metadata.hasAlpha || false
      },
      originalSize,
      encodedSize,
      compressionRatio: encodedSize / originalSize
    };
  }

  /**
   * Encode image buffer to base64
   */
  async encodeImageBuffer(
    buffer: Buffer,
    options: EncodingOptions = {}
  ): Promise<EncodingResult> {
    const originalSize = buffer.length;
    
    // Get image metadata
    const image = sharp(buffer);
    const metadata = await image.metadata();

    if (!metadata.width || !metadata.height) {
      throw new Error('Could not determine image dimensions from buffer');
    }

    // Process image based on options
    const processedBuffer = await this.processImage(image, metadata, options);
    
    // Encode to base64
    const base64 = processedBuffer.toString('base64');
    const encodedSize = Buffer.byteLength(base64, 'utf8');

    return {
      base64,
      metadata: {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format || 'unknown',
        size: encodedSize,
        hasAlpha: metadata.hasAlpha || false
      },
      originalSize,
      encodedSize,
      compressionRatio: encodedSize / originalSize
    };
  }

  /**
   * Process image with optimization options
   */
  private async processImage(
    image: sharp.Sharp,
    metadata: sharp.Metadata,
    options: EncodingOptions
  ): Promise<Buffer> {
    let processor = image.clone();

    // Resize if needed
    if (options.maxWidth || options.maxHeight) {
      const resizeOptions: sharp.ResizeOptions = {
        withoutEnlargement: true,
        fit: 'inside'
      };

      processor = processor.resize(
        options.maxWidth,
        options.maxHeight,
        resizeOptions
      );
    }

    // Auto-optimize for API if requested
    if (options.optimizeForAPI) {
      const { width, height } = metadata;
      const currentSize = width! * height! * 3; // Rough estimate

      if (currentSize > ImageEncoder.OPTIMAL_API_SIZE) {
        // Calculate optimal dimensions to reach target size
        const scaleFactor = Math.sqrt(ImageEncoder.OPTIMAL_API_SIZE / currentSize);
        const targetWidth = Math.floor(width! * scaleFactor);
        const targetHeight = Math.floor(height! * scaleFactor);

        processor = processor.resize(targetWidth, targetHeight, {
          withoutEnlargement: true,
          fit: 'inside'
        });
      }
    }

    // Set output format and quality
    const format = options.format || 'jpeg';
    const quality = options.quality || (options.optimizeForAPI ? 85 : 95);

    switch (format) {
      case 'jpeg':
        processor = processor.jpeg({
          quality,
          progressive: true,
          optimizeScans: true
        });
        break;
      
      case 'png':
        processor = processor.png({
          compressionLevel: 9,
          adaptiveFiltering: true
        });
        break;
      
      case 'webp':
        processor = processor.webp({
          quality,
          effort: 6
        });
        break;
    }

    return processor.toBuffer();
  }

  /**
   * Optimize image specifically for OpenAI Vision API
   */
  async optimizeForOpenAI(imagePath: string): Promise<EncodingResult> {
    return this.encodeImageFile(imagePath, {
      maxWidth: 2048,
      maxHeight: 2048,
      quality: 85,
      format: 'jpeg',
      optimizeForAPI: true
    });
  }

  /**
   * Create thumbnail with base64 encoding
   */
  async createThumbnailBase64(
    imagePath: string,
    size: number = 320
  ): Promise<EncodingResult> {
    return this.encodeImageFile(imagePath, {
      maxWidth: size,
      maxHeight: size,
      quality: 80,
      format: 'jpeg'
    });
  }

  /**
   * Batch encode multiple images
   */
  async batchEncode(
    imagePaths: string[],
    options: EncodingOptions = {}
  ): Promise<EncodingResult[]> {
    const results: EncodingResult[] = [];
    
    for (const imagePath of imagePaths) {
      try {
        const result = await this.encodeImageFile(imagePath, options);
        results.push(result);
      } catch (error) {
        console.error(`Failed to encode ${imagePath}:`, error);
        throw error;
      }
    }

    return results;
  }

  /**
   * Decode base64 to image buffer
   */
  decodeBase64ToBuffer(base64: string): Buffer {
    // Remove data URL prefix if present
    const cleanBase64 = base64.replace(/^data:image\/[^;]+;base64,/, '');
    return Buffer.from(cleanBase64, 'base64');
  }

  /**
   * Save base64 image to file
   */
  async saveBase64ToFile(base64: string, outputPath: string): Promise<void> {
    const buffer = this.decodeBase64ToBuffer(base64);
    await fs.writeFile(outputPath, buffer);
  }

  /**
   * Validate image format and size
   */
  async validateImage(imagePath: string): Promise<{
    valid: boolean;
    error?: string;
    metadata?: ImageMetadata;
  }> {
    try {
      const stats = await fs.stat(imagePath);
      const image = sharp(imagePath);
      const metadata = await image.metadata();

      if (!metadata.width || !metadata.height) {
        return {
          valid: false,
          error: 'Could not determine image dimensions'
        };
      }

      // Check supported formats
      const supportedFormats = ['jpeg', 'jpg', 'png', 'webp', 'gif', 'bmp', 'tiff'];
      const format = metadata.format?.toLowerCase();
      
      if (!format || !supportedFormats.includes(format)) {
        return {
          valid: false,
          error: `Unsupported image format: ${format}`
        };
      }

      return {
        valid: true,
        metadata: {
          width: metadata.width,
          height: metadata.height,
          format: format,
          size: stats.size,
          hasAlpha: metadata.hasAlpha || false
        }
      };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get optimal encoding settings for different use cases
   */
  getOptimalSettings(useCase: 'api' | 'storage' | 'thumbnail' | 'archive'): EncodingOptions {
    switch (useCase) {
      case 'api':
        return {
          maxWidth: 2048,
          maxHeight: 2048,
          quality: 85,
          format: 'jpeg',
          optimizeForAPI: true
        };
      
      case 'storage':
        return {
          quality: 95,
          format: 'jpeg'
        };
      
      case 'thumbnail':
        return {
          maxWidth: 320,
          maxHeight: 320,
          quality: 80,
          format: 'jpeg'
        };
      
      case 'archive':
        return {
          quality: 100,
          format: 'png'
        };
      
      default:
        return {};
    }
  }

  /**
   * Estimate encoding size before processing
   */
  async estimateEncodedSize(
    imagePath: string,
    options: EncodingOptions = {}
  ): Promise<number> {
    const metadata = await sharp(imagePath).metadata();
    
    if (!metadata.width || !metadata.height) {
      throw new Error('Could not determine image dimensions');
    }

    let width = metadata.width;
    let height = metadata.height;

    // Apply resize calculations
    if (options.maxWidth || options.maxHeight) {
      const scale = Math.min(
        options.maxWidth ? options.maxWidth / width : 1,
        options.maxHeight ? options.maxHeight / height : 1
      );
      
      if (scale < 1) {
        width = Math.floor(width * scale);
        height = Math.floor(height * scale);
      }
    }

    // Rough size estimation based on format
    const pixelCount = width * height;
    let estimatedBytes: number;

    switch (options.format || 'jpeg') {
      case 'png':
        estimatedBytes = pixelCount * 3; // RGB without compression
        break;
      case 'jpeg':
        const quality = options.quality || 95;
        const compressionRatio = 0.1 + (quality / 100) * 0.4; // Rough estimation
        estimatedBytes = Math.floor(pixelCount * 3 * compressionRatio);
        break;
      case 'webp':
        estimatedBytes = Math.floor(pixelCount * 1.5); // WebP is typically very efficient
        break;
      default:
        estimatedBytes = pixelCount * 3;
    }

    // Base64 encoding adds ~33% overhead
    return Math.floor(estimatedBytes * 1.33);
  }

  /**
   * Format bytes to human readable string
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

export const imageEncoder = ImageEncoder.getInstance();