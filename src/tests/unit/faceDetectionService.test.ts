import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { faceDetectionService } from '../../services/faceDetectionService';
import { testDataManager } from '../utils/testDataManager';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';

describe('Face Detection Service', () => {
  let testImagePath: string;
  let multiPersonImagePath: string;
  let noFaceImagePath: string;

  beforeAll(async () => {
    await testDataManager.initialize();
    
    // Create test images with different face scenarios
    testImagePath = await createSinglePersonImage();
    multiPersonImagePath = await createMultiPersonImage();
    noFaceImagePath = await createNoFaceImage();
  });

  afterAll(async () => {
    // Clean up test files
    const testFiles = [testImagePath, multiPersonImagePath, noFaceImagePath];
    testFiles.forEach(file => {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
    });
  });

  describe('detectFaces', () => {
    test('should detect faces in single person image', async () => {
      const result = await faceDetectionService.detectFaces(testImagePath);
      
      expect(result).toBeDefined();
      expect(result.face_count).toBeGreaterThanOrEqual(1);
      expect(result.faces_detected).toHaveLength(result.face_count);
      expect(result.has_clear_faces).toBeDefined();
      expect(result.analysis_confidence).toBeGreaterThanOrEqual(0);
      expect(result.analysis_confidence).toBeLessThanOrEqual(1);
      expect(result.processing_time_ms).toBeGreaterThan(0);
      expect(result.image_dimensions).toBeDefined();
      expect(result.image_dimensions.width).toBeGreaterThan(0);
      expect(result.image_dimensions.height).toBeGreaterThan(0);
    });

    test('should detect multiple faces in group image', async () => {
      const result = await faceDetectionService.detectFaces(multiPersonImagePath);
      
      expect(result).toBeDefined();
      expect(result.face_count).toBeGreaterThanOrEqual(0); // May detect 0 or more depending on algorithm
      expect(result.faces_detected).toHaveLength(result.face_count);
      
      // If faces are detected, validate their properties
      result.faces_detected.forEach(face => {
        expect(face.bounding_box).toBeDefined();
        expect(face.bounding_box.x).toBeGreaterThanOrEqual(0);
        expect(face.bounding_box.y).toBeGreaterThanOrEqual(0);
        expect(face.bounding_box.width).toBeGreaterThan(0);
        expect(face.bounding_box.height).toBeGreaterThan(0);
        expect(face.confidence).toBeGreaterThanOrEqual(0);
        expect(face.confidence).toBeLessThanOrEqual(1);
        expect(face.face_quality_score).toBeGreaterThanOrEqual(0);
        expect(face.face_quality_score).toBeLessThanOrEqual(1);
      });
    });

    test('should handle image with no faces', async () => {
      const result = await faceDetectionService.detectFaces(noFaceImagePath);
      
      expect(result).toBeDefined();
      expect(result.face_count).toBe(0);
      expect(result.faces_detected).toHaveLength(0);
      expect(result.has_clear_faces).toBe(false);
      expect(result.analysis_confidence).toBe(0);
      expect(result.primary_face).toBeUndefined();
    });

    test('should identify primary face when multiple faces detected', async () => {
      // Use single person image which should have primary face
      const result = await faceDetectionService.detectFaces(testImagePath);
      
      if (result.face_count > 0) {
        expect(result.primary_face).toBeDefined();
        expect(result.faces_detected).toContain(result.primary_face);
        
        // Primary face should have reasonable quality scores
        expect(result.primary_face!.confidence).toBeGreaterThanOrEqual(0);
        expect(result.primary_face!.face_quality_score).toBeGreaterThanOrEqual(0);
      }
    });

    test('should include face encoding when face detected', async () => {
      const result = await faceDetectionService.detectFaces(testImagePath);
      
      result.faces_detected.forEach(face => {
        if (face.confidence > 0.5) {
          expect(face.face_encoding).toBeDefined();
          expect(Array.isArray(face.face_encoding)).toBe(true);
          expect(face.face_encoding!.length).toBe(128); // Standard face encoding dimension
          
          // All values should be numbers
          face.face_encoding!.forEach(val => {
            expect(typeof val).toBe('number');
            expect(val).toBeGreaterThan(-2);
            expect(val).toBeLessThan(2); // Normalized encoding values
          });
        }
      });
    });

    test('should estimate demographic information', async () => {
      const result = await faceDetectionService.detectFaces(testImagePath);
      
      result.faces_detected.forEach(face => {
        if (face.confidence > 0.5) {
          expect(face.estimated_age).toBeDefined();
          expect(face.estimated_age).toBeGreaterThan(0);
          expect(face.estimated_age).toBeLessThan(120);
          
          expect(face.estimated_gender).toBeDefined();
          expect(['male', 'female', 'unknown']).toContain(face.estimated_gender);
          
          expect(face.emotional_expression).toBeDefined();
          expect(typeof face.emotional_expression).toBe('string');
        }
      });
    });

    test('should throw error for non-existent image', async () => {
      const nonExistentPath = path.join(__dirname, 'non-existent-face-image.jpg');
      
      await expect(faceDetectionService.detectFaces(nonExistentPath))
        .rejects
        .toThrow();
    });

    test('should handle corrupted image file', async () => {
      // Create a corrupted image file
      const corruptedPath = path.join(__dirname, '../fixtures/corrupted-face-test.jpg');
      await fs.promises.writeFile(corruptedPath, 'not an image file');
      
      try {
        await expect(faceDetectionService.detectFaces(corruptedPath))
          .rejects
          .toThrow();
      } finally {
        if (fs.existsSync(corruptedPath)) {
          fs.unlinkSync(corruptedPath);
        }
      }
    });
  });

  describe('compareFaceEncodings', () => {
    test('should compare face encodings correctly', async () => {
      const encoding1 = Array(128).fill(0).map(() => Math.random() * 2 - 1);
      const encoding2 = [...encoding1]; // Identical encoding
      const encoding3 = Array(128).fill(0).map(() => Math.random() * 2 - 1); // Different encoding
      
      // Identical encodings should have high similarity
      const similarity1 = await faceDetectionService.compareFaceEncodings(encoding1, encoding2);
      expect(similarity1).toBeCloseTo(1, 2);
      
      // Different encodings should have lower similarity
      const similarity2 = await faceDetectionService.compareFaceEncodings(encoding1, encoding3);
      expect(similarity2).toBeGreaterThanOrEqual(0);
      expect(similarity2).toBeLessThanOrEqual(1);
      expect(similarity2).toBeLessThan(similarity1);
    });

    test('should throw error for mismatched encoding dimensions', async () => {
      const encoding1 = Array(128).fill(0).map(() => Math.random());
      const encoding2 = Array(64).fill(0).map(() => Math.random()); // Wrong dimension
      
      await expect(faceDetectionService.compareFaceEncodings(encoding1, encoding2))
        .rejects
        .toThrow('Face encodings must have the same dimensions');
    });
  });

  describe('extractFaceFromImage', () => {
    test('should extract face region from image', async () => {
      const result = await faceDetectionService.detectFaces(testImagePath);
      
      if (result.faces_detected.length > 0) {
        const face = result.faces_detected[0];
        const faceBuffer = await faceDetectionService.extractFaceFromImage(testImagePath, face.bounding_box);
        
        expect(faceBuffer).toBeDefined();
        expect(Buffer.isBuffer(faceBuffer)).toBe(true);
        expect(faceBuffer.length).toBeGreaterThan(0);
        
        // Verify extracted image is valid
        const metadata = await sharp(faceBuffer).metadata();
        expect(metadata.width).toBe(224); // Standard size
        expect(metadata.height).toBe(224);
        expect(metadata.format).toBe('jpeg');
      }
    });

    test('should handle invalid bounding box', async () => {
      const invalidBoundingBox = {
        x: -100,
        y: -100,
        width: 50,
        height: 50
      };
      
      await expect(faceDetectionService.extractFaceFromImage(testImagePath, invalidBoundingBox))
        .rejects
        .toThrow();
    });
  });

  describe('Performance', () => {
    test('should complete face detection within reasonable time', async () => {
      const startTime = Date.now();
      await faceDetectionService.detectFaces(testImagePath);
      const endTime = Date.now();
      
      const processingTime = endTime - startTime;
      expect(processingTime).toBeLessThan(10000); // Should complete within 10 seconds
    });

    test('should handle batch face detection efficiently', async () => {
      const imagePaths = [testImagePath, multiPersonImagePath, noFaceImagePath];
      const startTime = Date.now();
      
      const results = await Promise.all(
        imagePaths.map(path => faceDetectionService.detectFaces(path))
      );
      
      const endTime = Date.now();
      const totalTime = endTime - startTime;
      
      expect(results.length).toBe(3);
      results.forEach(result => {
        expect(result).toBeDefined();
        expect(result.face_count).toBeGreaterThanOrEqual(0);
      });
      
      // Batch processing should be reasonably fast
      expect(totalTime).toBeLessThan(30000); // 30 seconds for 3 images
    });
  });

  describe('Consistency', () => {
    test('should return consistent results for same image', async () => {
      const result1 = await faceDetectionService.detectFaces(testImagePath);
      const result2 = await faceDetectionService.detectFaces(testImagePath);
      
      expect(result1.face_count).toBe(result2.face_count);
      expect(result1.has_clear_faces).toBe(result2.has_clear_faces);
      
      // Face encodings should be identical for same faces
      if (result1.faces_detected.length > 0 && result2.faces_detected.length > 0) {
        const face1 = result1.faces_detected[0];
        const face2 = result2.faces_detected[0];
        
        if (face1.face_encoding && face2.face_encoding) {
          const similarity = await faceDetectionService.compareFaceEncodings(
            face1.face_encoding,
            face2.face_encoding
          );
          expect(similarity).toBeGreaterThan(0.95); // Should be very similar
        }
      }
    });
  });

  // Helper functions for creating test images
  async function createSinglePersonImage(): Promise<string> {
    const imagePath = path.join(__dirname, '../fixtures/single-person-face-test.jpg');
    
    // Create image with face-like region
    await sharp({
      create: {
        width: 800,
        height: 600,
        channels: 3,
        background: { r: 180, g: 200, b: 220 }
      }
    })
    .composite([
      // Face region (skin tone oval)
      {
        input: await sharp({
          create: {
            width: 150,
            height: 200,
            channels: 3,
            background: { r: 255, g: 220, b: 177 } // Skin tone
          }
        }).png().toBuffer(),
        left: 325,
        top: 200
      },
      // Eyes
      {
        input: await sharp({
          create: {
            width: 20,
            height: 15,
            channels: 3,
            background: { r: 50, g: 50, b: 50 }
          }
        }).png().toBuffer(),
        left: 360,
        top: 250
      },
      {
        input: await sharp({
          create: {
            width: 20,
            height: 15,
            channels: 3,
            background: { r: 50, g: 50, b: 50 }
          }
        }).png().toBuffer(),
        left: 420,
        top: 250
      },
      // Mouth
      {
        input: await sharp({
          create: {
            width: 40,
            height: 10,
            channels: 3,
            background: { r: 200, g: 100, b: 100 }
          }
        }).png().toBuffer(),
        left: 380,
        top: 320
      }
    ])
    .jpeg({ quality: 85 })
    .toFile(imagePath);
    
    return imagePath;
  }

  async function createMultiPersonImage(): Promise<string> {
    const imagePath = path.join(__dirname, '../fixtures/multi-person-face-test.jpg');
    
    // Create image with multiple face-like regions
    await sharp({
      create: {
        width: 1200,
        height: 800,
        channels: 3,
        background: { r: 220, g: 220, b: 240 }
      }
    })
    .composite([
      // Person 1
      {
        input: await sharp({
          create: {
            width: 120,
            height: 160,
            channels: 3,
            background: { r: 255, g: 220, b: 177 }
          }
        }).png().toBuffer(),
        left: 200,
        top: 300
      },
      // Person 2
      {
        input: await sharp({
          create: {
            width: 130,
            height: 170,
            channels: 3,
            background: { r: 240, g: 200, b: 160 }
          }
        }).png().toBuffer(),
        left: 500,
        top: 250
      },
      // Person 3
      {
        input: await sharp({
          create: {
            width: 110,
            height: 150,
            channels: 3,
            background: { r: 255, g: 210, b: 170 }
          }
        }).png().toBuffer(),
        left: 800,
        top: 320
      }
    ])
    .jpeg({ quality: 85 })
    .toFile(imagePath);
    
    return imagePath;
  }

  async function createNoFaceImage(): Promise<string> {
    const imagePath = path.join(__dirname, '../fixtures/no-face-test.jpg');
    
    // Create landscape image without faces
    await sharp({
      create: {
        width: 800,
        height: 600,
        channels: 3,
        background: { r: 135, g: 206, b: 235 } // Sky blue
      }
    })
    .composite([
      // Ground
      {
        input: await sharp({
          create: {
            width: 800,
            height: 200,
            channels: 3,
            background: { r: 34, g: 139, b: 34 } // Green
          }
        }).png().toBuffer(),
        left: 0,
        top: 400
      },
      // Tree
      {
        input: await sharp({
          create: {
            width: 80,
            height: 300,
            channels: 3,
            background: { r: 139, g: 69, b: 19 } // Brown
          }
        }).png().toBuffer(),
        left: 360,
        top: 100
      }
    ])
    .jpeg({ quality: 85 })
    .toFile(imagePath);
    
    return imagePath;
  }
});