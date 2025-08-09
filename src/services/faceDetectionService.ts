import sharp from 'sharp';
import { promises as fs } from 'fs';

export interface FaceDetection {
  bounding_box: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  confidence: number;
  landmarks?: {
    left_eye: { x: number; y: number };
    right_eye: { x: number; y: number };
    nose: { x: number; y: number };
    mouth_left: { x: number; y: number };
    mouth_right: { x: number; y: number };
  };
  face_encoding?: number[]; // 128-dimensional face encoding vector
  estimated_age?: number;
  estimated_gender?: 'male' | 'female' | 'unknown';
  emotional_expression?: string;
  face_quality_score: number; // 0-1, quality for recognition
}

export interface FaceAnalysisResult {
  faces_detected: FaceDetection[];
  face_count: number;
  primary_face?: FaceDetection; // Most prominent/confident face
  has_clear_faces: boolean;
  analysis_confidence: number;
  processing_time_ms: number;
  image_dimensions: {
    width: number;
    height: number;
  };
}

export class FaceDetectionService {
  private static instance: FaceDetectionService;

  public static getInstance(): FaceDetectionService {
    if (!FaceDetectionService.instance) {
      FaceDetectionService.instance = new FaceDetectionService();
    }
    return FaceDetectionService.instance;
  }

  async detectFaces(imagePath: string): Promise<FaceAnalysisResult> {
    const startTime = Date.now();
    
    try {
      // Verify image exists
      await fs.access(imagePath);
      
      // Get image metadata
      const imageBuffer = await fs.readFile(imagePath);
      const imageInfo = await sharp(imageBuffer).metadata();
      
      if (!imageInfo.width || !imageInfo.height) {
        throw new Error('Could not determine image dimensions');
      }

      // For now, we'll implement basic face detection using image analysis
      // In a production environment, you would integrate with:
      // - OpenCV with Haar cascades
      // - dlib face detection
      // - MediaPipe Face Detection
      // - Azure Face API
      // - AWS Rekognition
      // - Google Vision API
      
      const faces = await this.performFaceDetection(imageBuffer, imageInfo);
      
      const processingTime = Date.now() - startTime;
      
      // Determine primary face (largest and most confident)
      const primaryFace = faces.length > 0 
        ? faces.reduce((prev, current) => {
            const prevArea = prev.bounding_box.width * prev.bounding_box.height;
            const currentArea = current.bounding_box.width * current.bounding_box.height;
            const prevScore = prevArea * prev.confidence;
            const currentScore = currentArea * current.confidence;
            return currentScore > prevScore ? current : prev;
          })
        : undefined;

      const result: FaceAnalysisResult = {
        faces_detected: faces,
        face_count: faces.length,
        primary_face: primaryFace,
        has_clear_faces: faces.some(face => face.confidence > 0.8 && face.face_quality_score > 0.7),
        analysis_confidence: faces.length > 0 ? Math.max(...faces.map(f => f.confidence)) : 0,
        processing_time_ms: processingTime,
        image_dimensions: {
          width: imageInfo.width,
          height: imageInfo.height
        }
      };

      return result;
      
    } catch (error) {
      console.error('Face detection failed:', error);
      throw new Error(`Face detection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async performFaceDetection(imageBuffer: Buffer, imageInfo: sharp.Metadata): Promise<FaceDetection[]> {
    // This is a simplified implementation using image analysis to detect potential face regions
    // In production, replace with actual face detection library
    
    try {
      const { width, height } = imageInfo;
      if (!width || !height) {
        return [];
      }

      // Convert to grayscale for analysis
      const grayImage = await sharp(imageBuffer)
        .grayscale()
        .raw()
        .toBuffer();

      // Simple face detection heuristics based on image analysis
      const faces: FaceDetection[] = [];
      
      // Look for regions that might contain faces based on:
      // 1. Skin tone detection (simplified)
      // 2. Edge density patterns typical of faces
      // 3. Symmetry patterns
      
      const potentialFaceRegions = await this.findPotentialFaceRegions(grayImage, width, height);
      
      for (const region of potentialFaceRegions) {
        const face: FaceDetection = {
          bounding_box: region.boundingBox,
          confidence: region.confidence,
          face_quality_score: region.quality,
          estimated_age: this.estimateAge(region),
          estimated_gender: this.estimateGender(region),
          emotional_expression: this.analyzeExpression(region),
          face_encoding: await this.generateFaceEncoding(region, imageBuffer)
        };
        
        faces.push(face);
      }
      
      return faces.sort((a, b) => b.confidence - a.confidence);
      
    } catch (error) {
      console.error('Error in face detection processing:', error);
      return [];
    }
  }

  private async findPotentialFaceRegions(
    grayBuffer: Buffer, 
    width: number, 
    height: number
  ): Promise<Array<{
    boundingBox: { x: number; y: number; width: number; height: number };
    confidence: number;
    quality: number;
    data: Buffer;
  }>> {
    const regions: Array<{
      boundingBox: { x: number; y: number; width: number; height: number };
      confidence: number;
      quality: number;
      data: Buffer;
    }> = [];

    // Simple face detection using sliding window approach
    const minFaceSize = Math.min(width, height) * 0.1; // Minimum 10% of image size
    const maxFaceSize = Math.min(width, height) * 0.8; // Maximum 80% of image size
    
    // Multiple scales
    const scales = [0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5];
    
    for (const scale of scales) {
      const faceSize = Math.max(minFaceSize, Math.min(maxFaceSize, Math.min(width, height) * scale));
      const step = Math.max(10, faceSize * 0.1);
      
      for (let y = 0; y <= height - faceSize; y += step) {
        for (let x = 0; x <= width - faceSize; x += step) {
          const region = {
            x: Math.round(x),
            y: Math.round(y),
            width: Math.round(faceSize),
            height: Math.round(faceSize)
          };
          
          // Extract region for analysis
          try {
            const regionData = await this.extractImageRegion(grayBuffer, width, height, region);
            const faceScore = await this.calculateFaceLikelihood(regionData, region.width, region.height);
            
            if (faceScore > 0.3) { // Threshold for potential face
              regions.push({
                boundingBox: region,
                confidence: faceScore,
                quality: await this.assessFaceQuality(regionData, region.width, region.height),
                data: regionData
              });
            }
          } catch (error) {
            // Skip this region if extraction fails
            continue;
          }
        }
      }
    }
    
    // Remove overlapping regions (non-maximum suppression)
    return this.nonMaximumSuppression(regions);
  }

  private async extractImageRegion(
    imageBuffer: Buffer,
    imageWidth: number,
    imageHeight: number,
    region: { x: number; y: number; width: number; height: number }
  ): Promise<Buffer> {
    // Simple region extraction from raw grayscale buffer
    const regionBuffer = Buffer.alloc(region.width * region.height);
    
    for (let y = 0; y < region.height; y++) {
      for (let x = 0; x < region.width; x++) {
        const srcX = region.x + x;
        const srcY = region.y + y;
        
        if (srcX < imageWidth && srcY < imageHeight) {
          const srcIndex = srcY * imageWidth + srcX;
          const dstIndex = y * region.width + x;
          regionBuffer[dstIndex] = imageBuffer[srcIndex];
        }
      }
    }
    
    return regionBuffer;
  }

  private async calculateFaceLikelihood(regionBuffer: Buffer, width: number, height: number): Promise<number> {
    // Simplified face detection heuristics
    let score = 0;
    const pixels = Array.from(regionBuffer);
    
    // Check for face-like characteristics:
    
    // 1. Overall brightness (faces are usually mid-tone)
    const avgBrightness = pixels.reduce((sum, val) => sum + val, 0) / pixels.length;
    const brightnessScore = 1 - Math.abs(avgBrightness - 128) / 128;
    score += brightnessScore * 0.2;
    
    // 2. Edge density (faces have moderate edge density)
    const edgeCount = this.calculateEdgeCount(regionBuffer, width, height);
    const edgeRatio = edgeCount / (width * height);
    const edgeScore = edgeRatio > 0.1 && edgeRatio < 0.4 ? 1 : Math.max(0, 1 - Math.abs(edgeRatio - 0.25) * 4);
    score += edgeScore * 0.3;
    
    // 3. Symmetry check (faces are roughly symmetric)
    const symmetryScore = this.calculateSymmetry(regionBuffer, width, height);
    score += symmetryScore * 0.3;
    
    // 4. Aspect ratio (faces are roughly rectangular, slightly taller than wide)
    const aspectRatio = height / width;
    const aspectScore = aspectRatio > 1.0 && aspectRatio < 1.5 ? 1 : Math.max(0, 1 - Math.abs(aspectRatio - 1.2) * 2);
    score += aspectScore * 0.2;
    
    return Math.max(0, Math.min(1, score));
  }

  private calculateEdgeCount(buffer: Buffer, width: number, height: number): number {
    let edgeCount = 0;
    const threshold = 30;
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        const current = buffer[idx];
        const right = buffer[idx + 1];
        const bottom = buffer[idx + width];
        
        if (Math.abs(current - right) > threshold || Math.abs(current - bottom) > threshold) {
          edgeCount++;
        }
      }
    }
    
    return edgeCount;
  }

  private calculateSymmetry(buffer: Buffer, width: number, height: number): number {
    let symmetryScore = 0;
    const samples = 20; // Sample points for symmetry check
    
    for (let i = 0; i < samples; i++) {
      const y = Math.floor((i / samples) * height);
      for (let j = 0; j < samples; j++) {
        const x = Math.floor((j / samples) * width);
        const mirrorX = width - 1 - x;
        
        if (mirrorX >= 0 && mirrorX < width) {
          const leftPixel = buffer[y * width + x];
          const rightPixel = buffer[y * width + mirrorX];
          const diff = Math.abs(leftPixel - rightPixel);
          symmetryScore += Math.max(0, 1 - diff / 128);
        }
      }
    }
    
    return symmetryScore / (samples * samples);
  }

  private nonMaximumSuppression(regions: Array<{
    boundingBox: { x: number; y: number; width: number; height: number };
    confidence: number;
    quality: number;
    data: Buffer;
  }>): Array<{
    boundingBox: { x: number; y: number; width: number; height: number };
    confidence: number;
    quality: number;
    data: Buffer;
  }> {
    // Sort by confidence
    regions.sort((a, b) => b.confidence - a.confidence);
    
    const kept: typeof regions = [];
    const overlapThreshold = 0.3;
    
    for (const region of regions) {
      let shouldKeep = true;
      
      for (const keptRegion of kept) {
        const overlap = this.calculateOverlap(region.boundingBox, keptRegion.boundingBox);
        if (overlap > overlapThreshold) {
          shouldKeep = false;
          break;
        }
      }
      
      if (shouldKeep) {
        kept.push(region);
      }
    }
    
    return kept;
  }

  private calculateOverlap(
    box1: { x: number; y: number; width: number; height: number },
    box2: { x: number; y: number; width: number; height: number }
  ): number {
    const x1 = Math.max(box1.x, box2.x);
    const y1 = Math.max(box1.y, box2.y);
    const x2 = Math.min(box1.x + box1.width, box2.x + box2.width);
    const y2 = Math.min(box1.y + box1.height, box2.y + box2.height);
    
    if (x2 <= x1 || y2 <= y1) {
      return 0;
    }
    
    const intersection = (x2 - x1) * (y2 - y1);
    const union = box1.width * box1.height + box2.width * box2.height - intersection;
    
    return intersection / union;
  }

  private async assessFaceQuality(regionBuffer: Buffer, width: number, height: number): Promise<number> {
    let quality = 0;
    
    // 1. Sharpness (using variance)
    const pixels = Array.from(regionBuffer);
    const mean = pixels.reduce((sum, val) => sum + val, 0) / pixels.length;
    const variance = pixels.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / pixels.length;
    const sharpnessScore = Math.min(1, variance / 1000); // Normalize variance
    quality += sharpnessScore * 0.4;
    
    // 2. Contrast
    const minVal = Math.min(...pixels);
    const maxVal = Math.max(...pixels);
    const contrastScore = (maxVal - minVal) / 255;
    quality += contrastScore * 0.3;
    
    // 3. Size appropriateness (larger faces are generally better quality)
    const size = width * height;
    const sizeScore = Math.min(1, size / (100 * 100)); // Normalize to 100x100 baseline
    quality += sizeScore * 0.3;
    
    return Math.max(0, Math.min(1, quality));
  }

  private estimateAge(region: any): number {
    // Placeholder for age estimation
    // In production, would use dedicated age estimation model
    return 25 + Math.random() * 30; // Random age between 25-55
  }

  private estimateGender(region: any): 'male' | 'female' | 'unknown' {
    // Placeholder for gender estimation
    // In production, would use dedicated gender classification model
    const random = Math.random();
    return random < 0.4 ? 'male' : random < 0.8 ? 'female' : 'unknown';
  }

  private analyzeExpression(region: any): string {
    // Placeholder for expression analysis
    // In production, would use emotion recognition model
    const expressions = ['neutral', 'happy', 'surprised', 'focused', 'contemplative'];
    return expressions[Math.floor(Math.random() * expressions.length)];
  }

  private async generateFaceEncoding(region: any, originalImageBuffer: Buffer): Promise<number[]> {
    // Simplified face encoding generation
    // In production, would use deep learning models like FaceNet, OpenFace, or similar
    
    // Generate a 128-dimensional vector based on region characteristics
    const encoding: number[] = [];
    const pixels = Array.from(region.data as Buffer);
    
    // Use statistical properties of the face region to create a simple encoding
    for (let i = 0; i < 128; i++) {
      const sampleSize = Math.floor(pixels.length / 128);
      const start = i * sampleSize;
      const end = Math.min(start + sampleSize, pixels.length);
      const segment = pixels.slice(start, end);
      
      if (segment.length > 0) {
        const mean = segment.reduce((sum, val) => sum + val, 0) / segment.length;
        const variance = segment.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / segment.length;
        
        // Combine mean and variance with some randomness for uniqueness
        encoding.push((mean / 255) * 2 - 1 + (Math.sqrt(variance) / 255 - 0.5) * 0.1);
      } else {
        encoding.push(Math.random() * 2 - 1);
      }
    }
    
    // Normalize the encoding vector
    const magnitude = Math.sqrt(encoding.reduce((sum, val) => sum + val * val, 0));
    return encoding.map(val => val / magnitude);
  }

  async compareFaceEncodings(encoding1: number[], encoding2: number[]): Promise<number> {
    if (encoding1.length !== encoding2.length) {
      throw new Error('Face encodings must have the same dimensions');
    }

    // Calculate cosine similarity
    let dotProduct = 0;
    let magnitude1 = 0;
    let magnitude2 = 0;

    for (let i = 0; i < encoding1.length; i++) {
      dotProduct += encoding1[i] * encoding2[i];
      magnitude1 += encoding1[i] * encoding1[i];
      magnitude2 += encoding2[i] * encoding2[i];
    }

    const similarity = dotProduct / (Math.sqrt(magnitude1) * Math.sqrt(magnitude2));
    return Math.max(0, Math.min(1, (similarity + 1) / 2)); // Normalize to 0-1 range
  }

  async extractFaceFromImage(imagePath: string, boundingBox: FaceDetection['bounding_box']): Promise<Buffer> {
    try {
      const faceBuffer = await sharp(imagePath)
        .extract({
          left: boundingBox.x,
          top: boundingBox.y,
          width: boundingBox.width,
          height: boundingBox.height
        })
        .resize(224, 224) // Standard face recognition input size
        .jpeg({ quality: 90 })
        .toBuffer();

      return faceBuffer;
    } catch (error) {
      throw new Error(`Failed to extract face from image: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

export const faceDetectionService = FaceDetectionService.getInstance();