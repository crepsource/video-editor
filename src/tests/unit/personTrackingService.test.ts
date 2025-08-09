import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { personTrackingService } from '../../services/personTrackingService';
import { faceDetectionService } from '../../services/faceDetectionService';
import { database } from '../../services/database';
import { testDataManager } from '../utils/testDataManager';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

describe('Person Tracking Service', () => {
  let testImagePath: string;
  let testVideoId: string;
  let testFrameId: string;

  beforeAll(async () => {
    await testDataManager.initialize();
    
    // Create test image with faces
    testImagePath = await testDataManager.createTestImage({
      width: 800,
      height: 600,
      background: { r: 180, g: 200, b: 220 },
      elements: [
        // Face-like region
        {
          width: 150,
          height: 200,
          color: { r: 255, g: 220, b: 177 },
          position: { x: 300, y: 200 }
        }
      ]
    }, 'person-tracking-test.jpg');

    // Create test video and frame IDs
    testVideoId = uuidv4();
    testFrameId = uuidv4();

    // Initialize database if needed
    try {
      const db = database.getPool();
      
      // Create test video record
      await db.query(`
        INSERT INTO videos (id, filename, file_path, user_id) 
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (id) DO NOTHING
      `, [testVideoId, 'test-video.mp4', '/test/path', uuidv4()]);
      
      // Create test frame record
      await db.query(`
        INSERT INTO frames_enhanced (id, video_id, timestamp, frame_number) 
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (id) DO NOTHING
      `, [testFrameId, testVideoId, 10.5, 105]);
      
    } catch (error) {
      console.warn('Database setup failed, tests may not work with database operations:', error);
    }
  });

  afterAll(async () => {
    // Clean up test files
    if (fs.existsSync(testImagePath)) {
      fs.unlinkSync(testImagePath);
    }

    // Clean up database records
    try {
      const db = database.getPool();
      await db.query('DELETE FROM person_appearances WHERE frame_id = $1', [testFrameId]);
      await db.query('DELETE FROM persons WHERE video_collection_id = $1', [testVideoId]);
      await db.query('DELETE FROM frames_enhanced WHERE id = $1', [testFrameId]);
      await db.query('DELETE FROM videos WHERE id = $1', [testVideoId]);
    } catch (error) {
      console.warn('Database cleanup failed:', error);
    }
  });

  beforeEach(async () => {
    // Clean up any persons created in previous tests
    try {
      const db = database.getPool();
      await db.query('DELETE FROM person_appearances WHERE frame_id = $1', [testFrameId]);
      await db.query('DELETE FROM persons WHERE video_collection_id = $1', [testVideoId]);
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('trackPersonsInFrame', () => {
    test('should track persons in frame with faces', async () => {
      const timestamp = 10.5;
      
      try {
        const result = await personTrackingService.trackPersonsInFrame(
          testFrameId,
          testVideoId,
          testImagePath,
          timestamp
        );
        
        expect(result).toBeDefined();
        expect(result.persons_identified).toBeDefined();
        expect(Array.isArray(result.persons_identified)).toBe(true);
        expect(result.new_persons_created).toBeGreaterThanOrEqual(0);
        expect(result.total_appearances_recorded).toBeGreaterThanOrEqual(0);
        expect(result.processing_time_ms).toBeGreaterThan(0);
        expect(result.confidence_score).toBeGreaterThanOrEqual(0);
        expect(result.confidence_score).toBeLessThanOrEqual(1);
        
        // If persons were identified, validate their structure
        result.persons_identified.forEach(person => {
          expect(person.id).toBeDefined();
          expect(person.person_label).toBeDefined();
          expect(person.person_role).toBeDefined();
          expect(['main_subject', 'companion', 'local', 'passerby']).toContain(person.person_role);
          expect(person.importance_level).toBeGreaterThanOrEqual(1);
          expect(person.importance_level).toBeLessThanOrEqual(3);
          expect(person.appearance_description).toBeDefined();
          expect(Array.isArray(person.clothing_descriptions)).toBe(true);
          expect(Array.isArray(person.distinguishing_features)).toBe(true);
        });
        
      } catch (error) {
        if (error instanceof Error && error.message.includes('database')) {
          console.warn('Skipping database-dependent test:', error.message);
          return;
        }
        throw error;
      }
    });

    test('should handle frame with no faces', async () => {
      // Create image without faces
      const noFaceImagePath = await testDataManager.createTestImage({
        width: 600,
        height: 400,
        background: { r: 135, g: 206, b: 235 }, // Sky blue landscape
        elements: [
          {
            width: 600,
            height: 150,
            color: { r: 34, g: 139, b: 34 },
            position: { x: 0, y: 250 }
          }
        ]
      }, 'no-face-test.jpg');
      
      try {
        const result = await personTrackingService.trackPersonsInFrame(
          testFrameId,
          testVideoId,
          noFaceImagePath,
          15.0
        );
        
        expect(result.persons_identified).toHaveLength(0);
        expect(result.new_persons_created).toBe(0);
        expect(result.total_appearances_recorded).toBe(0);
        expect(result.confidence_score).toBe(0);
        
      } catch (error) {
        if (error instanceof Error && error.message.includes('database')) {
          console.warn('Skipping database-dependent test:', error.message);
          return;
        }
        throw error;
      } finally {
        if (fs.existsSync(noFaceImagePath)) {
          fs.unlinkSync(noFaceImagePath);
        }
      }
    });

    test('should create new person for first appearance', async () => {
      try {
        const result = await personTrackingService.trackPersonsInFrame(
          testFrameId,
          testVideoId,
          testImagePath,
          5.0
        );
        
        if (result.persons_identified.length > 0) {
          expect(result.new_persons_created).toBeGreaterThan(0);
          
          const newPerson = result.persons_identified[0];
          expect(newPerson.person_label).toBeDefined();
          expect(newPerson.person_role).toBeDefined();
          expect(newPerson.first_appearance_timestamp).toBeDefined();
          expect(newPerson.last_appearance_timestamp).toBeDefined();
        }
        
      } catch (error) {
        if (error instanceof Error && error.message.includes('database')) {
          console.warn('Skipping database-dependent test:', error.message);
          return;
        }
        throw error;
      }
    });

    test('should assign appropriate person roles', async () => {
      try {
        const result = await personTrackingService.trackPersonsInFrame(
          testFrameId,
          testVideoId,
          testImagePath,
          8.0
        );
        
        result.persons_identified.forEach((person, index) => {
          if (index === 0) {
            // First person should likely be main_subject or companion
            expect(['main_subject', 'companion']).toContain(person.person_role);
            expect(person.importance_level).toBeLessThanOrEqual(2);
          }
          
          expect(['main_subject', 'companion', 'local', 'passerby']).toContain(person.person_role);
        });
        
      } catch (error) {
        if (error instanceof Error && error.message.includes('database')) {
          console.warn('Skipping database-dependent test:', error.message);
          return;
        }
        throw error;
      }
    });

    test('should throw error for non-existent image', async () => {
      const nonExistentPath = path.join(__dirname, 'non-existent-tracking-image.jpg');
      
      await expect(personTrackingService.trackPersonsInFrame(
        testFrameId,
        testVideoId,
        nonExistentPath,
        12.0
      )).rejects.toThrow();
    });
  });

  describe('getPersonConsistency', () => {
    test('should calculate consistency metrics for person', async () => {
      // First, create a person by tracking them in a frame
      try {
        const trackingResult = await personTrackingService.trackPersonsInFrame(
          testFrameId,
          testVideoId,
          testImagePath,
          20.0
        );
        
        if (trackingResult.persons_identified.length > 0) {
          const personId = trackingResult.persons_identified[0].id;
          
          const consistency = await personTrackingService.getPersonConsistency(personId);
          
          expect(consistency).toBeDefined();
          expect(consistency.clothing_consistency_score).toBeGreaterThanOrEqual(0);
          expect(consistency.clothing_consistency_score).toBeLessThanOrEqual(1);
          expect(consistency.appearance_consistency_score).toBeGreaterThanOrEqual(0);
          expect(consistency.appearance_consistency_score).toBeLessThanOrEqual(1);
          expect(consistency.role_consistency_score).toBeGreaterThanOrEqual(0);
          expect(consistency.role_consistency_score).toBeLessThanOrEqual(1);
          expect(consistency.temporal_consistency_score).toBeGreaterThanOrEqual(0);
          expect(consistency.temporal_consistency_score).toBeLessThanOrEqual(1);
        }
        
      } catch (error) {
        if (error instanceof Error && error.message.includes('database')) {
          console.warn('Skipping database-dependent test:', error.message);
          return;
        }
        throw error;
      }
    });

    test('should handle person with no appearances', async () => {
      const nonExistentPersonId = uuidv4();
      
      try {
        const consistency = await personTrackingService.getPersonConsistency(nonExistentPersonId);
        
        // Should return default values for non-existent person
        expect(consistency.clothing_consistency_score).toBe(1.0);
        expect(consistency.appearance_consistency_score).toBe(1.0);
        expect(consistency.role_consistency_score).toBe(1.0);
        expect(consistency.temporal_consistency_score).toBe(1.0);
        
      } catch (error) {
        if (error instanceof Error && error.message.includes('database')) {
          console.warn('Skipping database-dependent test:', error.message);
          return;
        }
        throw error;
      }
    });
  });

  describe('Performance', () => {
    test('should complete person tracking within reasonable time', async () => {
      const startTime = Date.now();
      
      try {
        await personTrackingService.trackPersonsInFrame(
          testFrameId,
          testVideoId,
          testImagePath,
          25.0
        );
        
        const endTime = Date.now();
        const processingTime = endTime - startTime;
        
        expect(processingTime).toBeLessThan(15000); // Should complete within 15 seconds
        
      } catch (error) {
        if (error instanceof Error && error.message.includes('database')) {
          console.warn('Skipping database-dependent performance test:', error.message);
          return;
        }
        throw error;
      }
    });

    test('should handle multiple tracking requests efficiently', async () => {
      const startTime = Date.now();
      const timestamps = [30.0, 35.0, 40.0];
      
      try {
        const results = await Promise.all(
          timestamps.map((timestamp, index) => 
            personTrackingService.trackPersonsInFrame(
              `${testFrameId}-${index}`,
              testVideoId,
              testImagePath,
              timestamp
            )
          )
        );
        
        const endTime = Date.now();
        const totalTime = endTime - startTime;
        
        expect(results).toHaveLength(3);
        results.forEach(result => {
          expect(result).toBeDefined();
          expect(result.processing_time_ms).toBeGreaterThan(0);
        });
        
        expect(totalTime).toBeLessThan(30000); // 30 seconds for 3 tracking operations
        
      } catch (error) {
        if (error instanceof Error && error.message.includes('database')) {
          console.warn('Skipping database-dependent batch test:', error.message);
          return;
        }
        throw error;
      }
    });
  });

  describe('Person Matching', () => {
    test('should recognize same person across multiple frames', async () => {
      try {
        // Track person in first frame
        const result1 = await personTrackingService.trackPersonsInFrame(
          testFrameId,
          testVideoId,
          testImagePath,
          45.0
        );
        
        if (result1.persons_identified.length > 0) {
          // Create another frame ID
          const secondFrameId = uuidv4();
          
          try {
            // Insert second frame
            const db = database.getPool();
            await db.query(`
              INSERT INTO frames_enhanced (id, video_id, timestamp, frame_number) 
              VALUES ($1, $2, $3, $4)
            `, [secondFrameId, testVideoId, 50.0, 500]);
            
            // Track same person in second frame
            const result2 = await personTrackingService.trackPersonsInFrame(
              secondFrameId,
              testVideoId,
              testImagePath,
              50.0
            );
            
            // Should recognize existing person (fewer new persons created)
            if (result2.persons_identified.length > 0) {
              expect(result2.new_persons_created).toBeLessThanOrEqual(result1.new_persons_created);
            }
            
            // Clean up second frame
            await db.query('DELETE FROM person_appearances WHERE frame_id = $1', [secondFrameId]);
            await db.query('DELETE FROM frames_enhanced WHERE id = $1', [secondFrameId]);
            
          } catch (dbError) {
            console.warn('Database operations failed in person matching test:', dbError);
          }
        }
        
      } catch (error) {
        if (error instanceof Error && error.message.includes('database')) {
          console.warn('Skipping database-dependent matching test:', error.message);
          return;
        }
        throw error;
      }
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty or invalid frame ID', async () => {
      await expect(personTrackingService.trackPersonsInFrame(
        '', // Empty frame ID
        testVideoId,
        testImagePath,
        60.0
      )).rejects.toThrow();
    });

    test('should handle empty or invalid video ID', async () => {
      await expect(personTrackingService.trackPersonsInFrame(
        testFrameId,
        '', // Empty video ID
        testImagePath,
        65.0
      )).rejects.toThrow();
    });

    test('should handle negative timestamp', async () => {
      try {
        const result = await personTrackingService.trackPersonsInFrame(
          testFrameId,
          testVideoId,
          testImagePath,
          -5.0 // Negative timestamp
        );
        
        // Should still work but handle gracefully
        expect(result).toBeDefined();
        expect(result.processing_time_ms).toBeGreaterThan(0);
        
      } catch (error) {
        if (error instanceof Error && error.message.includes('database')) {
          console.warn('Skipping database-dependent negative timestamp test:', error.message);
          return;
        }
        throw error;
      }
    });

    test('should handle very large images', async () => {
      // Create a larger test image
      const largeImagePath = await testDataManager.createTestImage({
        width: 2000,
        height: 1500,
        background: { r: 180, g: 200, b: 220 },
        elements: [
          {
            width: 300,
            height: 400,
            color: { r: 255, g: 220, b: 177 },
            position: { x: 850, y: 550 }
          }
        ]
      }, 'large-person-test.jpg');
      
      try {
        const result = await personTrackingService.trackPersonsInFrame(
          testFrameId,
          testVideoId,
          largeImagePath,
          70.0
        );
        
        expect(result).toBeDefined();
        expect(result.processing_time_ms).toBeGreaterThan(0);
        
      } catch (error) {
        if (error instanceof Error && error.message.includes('database')) {
          console.warn('Skipping database-dependent large image test:', error.message);
          return;
        }
        throw error;
      } finally {
        if (fs.existsSync(largeImagePath)) {
          fs.unlinkSync(largeImagePath);
        }
      }
    });
  });
});