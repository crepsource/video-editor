import { Pool } from 'pg';
import { database } from './database';
import { faceDetectionService, FaceDetection, FaceAnalysisResult } from './faceDetectionService';

export interface Person {
  id: string;
  video_collection_id?: string;
  person_label: string;
  face_encoding?: Buffer;
  appearance_description: string;
  clothing_descriptions: string[];
  distinguishing_features: string[];
  person_role: 'main_subject' | 'companion' | 'local' | 'passerby';
  importance_level: number; // 1=main focus, 2=secondary, 3=background
  total_appearances: number;
  first_appearance_timestamp?: number;
  last_appearance_timestamp?: number;
  created_at: Date;
  updated_at: Date;
}

export interface PersonAppearance {
  id: string;
  person_id: string;
  frame_id: string;
  confidence_score: number;
  bounding_box: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  face_visible: boolean;
  body_visible: boolean;
  position_in_frame: string;
  prominence_score: number;
  is_main_subject: boolean;
  apparent_action: string;
  interaction_context: string;
  emotional_expression: string;
  clothing_description: string;
  accessories: string[];
  pose_description: string;
  created_at: Date;
}

export interface PersonTrackingResult {
  persons_identified: Person[];
  new_persons_created: number;
  total_appearances_recorded: number;
  processing_time_ms: number;
  confidence_score: number;
}

export interface PersonConsistencyMetrics {
  clothing_consistency_score: number;
  appearance_consistency_score: number;
  role_consistency_score: number;
  temporal_consistency_score: number;
}

export class PersonTrackingService {
  private static instance: PersonTrackingService;
  private db: Pool;
  private readonly SIMILARITY_THRESHOLD = 0.75; // Threshold for considering faces as same person
  private readonly MIN_APPEARANCES_FOR_MAIN_SUBJECT = 3;

  private constructor() {
    this.db = database.getPool();
  }

  public static getInstance(): PersonTrackingService {
    if (!PersonTrackingService.instance) {
      PersonTrackingService.instance = new PersonTrackingService();
    }
    return PersonTrackingService.instance;
  }

  async trackPersonsInFrame(
    frameId: string,
    videoId: string,
    imagePath: string,
    timestamp: number
  ): Promise<PersonTrackingResult> {
    const startTime = Date.now();
    
    try {
      // Step 1: Detect faces in the current frame
      const faceAnalysis = await faceDetectionService.detectFaces(imagePath);
      
      if (faceAnalysis.face_count === 0) {
        return {
          persons_identified: [],
          new_persons_created: 0,
          total_appearances_recorded: 0,
          processing_time_ms: Date.now() - startTime,
          confidence_score: 0
        };
      }

      // Step 2: Get existing persons for this video collection
      const existingPersons = await this.getExistingPersonsForVideo(videoId);
      
      // Step 3: Match detected faces with existing persons
      const matchResults = await this.matchFacesToPersons(faceAnalysis.faces_detected, existingPersons);
      
      // Step 4: Create new persons for unmatched faces
      const newPersons = await this.createNewPersons(
        matchResults.unmatchedFaces,
        videoId,
        timestamp
      );
      
      // Step 5: Record all person appearances
      const allPersons = [...matchResults.matchedPersons.map(m => m.person), ...newPersons];
      const appearances = await this.recordPersonAppearances(
        frameId,
        matchResults.matchedPersons,
        newPersons,
        faceAnalysis,
        timestamp
      );

      // Step 6: Update person statistics
      await this.updatePersonStatistics(allPersons, timestamp);
      
      // Step 7: Update frame flags
      await this.updateFramePersonFlags(frameId, allPersons.length, faceAnalysis.has_clear_faces);

      const processingTime = Date.now() - startTime;
      
      return {
        persons_identified: allPersons,
        new_persons_created: newPersons.length,
        total_appearances_recorded: appearances.length,
        processing_time_ms: processingTime,
        confidence_score: faceAnalysis.analysis_confidence
      };
      
    } catch (error) {
      console.error('Person tracking failed:', error);
      throw new Error(`Person tracking failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async getExistingPersonsForVideo(videoId: string): Promise<Person[]> {
    const query = `
      SELECT DISTINCT p.* 
      FROM persons p
      JOIN person_appearances pa ON p.id = pa.person_id
      JOIN frames_enhanced f ON pa.frame_id = f.id
      WHERE f.video_id = $1
      ORDER BY p.total_appearances DESC, p.created_at ASC
    `;
    
    const result = await this.db.query(query, [videoId]);
    return result.rows;
  }

  private async matchFacesToPersons(
    detectedFaces: FaceDetection[],
    existingPersons: Person[]
  ): Promise<{
    matchedPersons: Array<{ person: Person; face: FaceDetection; similarity: number }>;
    unmatchedFaces: FaceDetection[];
  }> {
    const matchedPersons: Array<{ person: Person; face: FaceDetection; similarity: number }> = [];
    const unmatchedFaces: FaceDetection[] = [];

    for (const face of detectedFaces) {
      if (!face.face_encoding) {
        unmatchedFaces.push(face);
        continue;
      }

      let bestMatch: { person: Person; similarity: number } | null = null;

      // Compare with each existing person
      for (const person of existingPersons) {
        if (!person.face_encoding) {
          continue;
        }

        // Convert Buffer to number array for comparison
        const personEncoding = Array.from(new Float64Array(person.face_encoding.buffer));
        const similarity = await faceDetectionService.compareFaceEncodings(
          face.face_encoding,
          personEncoding
        );

        if (similarity > this.SIMILARITY_THRESHOLD && 
            (!bestMatch || similarity > bestMatch.similarity)) {
          bestMatch = { person, similarity };
        }
      }

      if (bestMatch) {
        matchedPersons.push({
          person: bestMatch.person,
          face,
          similarity: bestMatch.similarity
        });
      } else {
        unmatchedFaces.push(face);
      }
    }

    return { matchedPersons, unmatchedFaces };
  }

  private async createNewPersons(
    unmatchedFaces: FaceDetection[],
    videoId: string,
    timestamp: number
  ): Promise<Person[]> {
    const newPersons: Person[] = [];

    for (let i = 0; i < unmatchedFaces.length; i++) {
      const face = unmatchedFaces[i];
      
      // Generate person label based on order and characteristics
      const personLabel = await this.generatePersonLabel(i, face, videoId);
      
      // Determine person role based on face characteristics
      const personRole = await this.determinePersonRole(face, i);
      const importanceLevel = this.calculateImportanceLevel(personRole, face);
      
      // Create person record
      const personId = await this.insertPerson({
        video_collection_id: videoId,
        person_label: personLabel,
        face_encoding: face.face_encoding ? Buffer.from(new Float64Array(face.face_encoding).buffer) : null,
        appearance_description: await this.generateAppearanceDescription(face),
        clothing_descriptions: [],
        distinguishing_features: await this.identifyDistinguishingFeatures(face),
        person_role: personRole,
        importance_level: importanceLevel,
        first_appearance_timestamp: timestamp,
        last_appearance_timestamp: timestamp
      });

      const newPerson: Person = {
        id: personId,
        video_collection_id: videoId,
        person_label: personLabel,
        face_encoding: face.face_encoding ? Buffer.from(new Float64Array(face.face_encoding).buffer) : undefined,
        appearance_description: await this.generateAppearanceDescription(face),
        clothing_descriptions: [],
        distinguishing_features: await this.identifyDistinguishingFeatures(face),
        person_role: personRole,
        importance_level: importanceLevel,
        total_appearances: 0,
        first_appearance_timestamp: timestamp,
        last_appearance_timestamp: timestamp,
        created_at: new Date(),
        updated_at: new Date()
      };

      newPersons.push(newPerson);
    }

    return newPersons;
  }

  private async insertPerson(personData: {
    video_collection_id: string;
    person_label: string;
    face_encoding: Buffer | null;
    appearance_description: string;
    clothing_descriptions: string[];
    distinguishing_features: string[];
    person_role: string;
    importance_level: number;
    first_appearance_timestamp: number;
    last_appearance_timestamp: number;
  }): Promise<string> {
    const query = `
      INSERT INTO persons (
        video_collection_id,
        person_label,
        face_encoding,
        appearance_description,
        clothing_descriptions,
        distinguishing_features,
        person_role,
        importance_level,
        total_appearances,
        first_appearance_timestamp,
        last_appearance_timestamp
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, $9, $10)
      RETURNING id
    `;

    const values = [
      personData.video_collection_id,
      personData.person_label,
      personData.face_encoding,
      personData.appearance_description,
      personData.clothing_descriptions,
      personData.distinguishing_features,
      personData.person_role,
      personData.importance_level,
      personData.first_appearance_timestamp,
      personData.last_appearance_timestamp
    ];

    const result = await this.db.query(query, values);
    return result.rows[0].id;
  }

  private async recordPersonAppearances(
    frameId: string,
    matchedPersons: Array<{ person: Person; face: FaceDetection; similarity: number }>,
    newPersons: Person[],
    faceAnalysis: FaceAnalysisResult,
    timestamp: number
  ): Promise<PersonAppearance[]> {
    const appearances: PersonAppearance[] = [];

    // Record appearances for matched persons
    for (const match of matchedPersons) {
      const appearance = await this.createPersonAppearance(
        match.person.id,
        frameId,
        match.face,
        match.similarity,
        faceAnalysis
      );
      appearances.push(appearance);
    }

    // Record appearances for new persons
    for (let i = 0; i < newPersons.length; i++) {
      const person = newPersons[i];
      const face = faceAnalysis.faces_detected[matchedPersons.length + i];
      
      if (face) {
        const appearance = await this.createPersonAppearance(
          person.id,
          frameId,
          face,
          1.0, // Full confidence for new person
          faceAnalysis
        );
        appearances.push(appearance);
      }
    }

    return appearances;
  }

  private async createPersonAppearance(
    personId: string,
    frameId: string,
    face: FaceDetection,
    confidence: number,
    faceAnalysis: FaceAnalysisResult
  ): Promise<PersonAppearance> {
    const isPrimaryFace = faceAnalysis.primary_face === face;
    const prominenceScore = this.calculateProminenceScore(face, faceAnalysis);
    
    const query = `
      INSERT INTO person_appearances (
        person_id,
        frame_id,
        confidence_score,
        bounding_box,
        face_visible,
        body_visible,
        position_in_frame,
        prominence_score,
        is_main_subject,
        apparent_action,
        interaction_context,
        emotional_expression,
        clothing_description,
        accessories,
        pose_description
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *
    `;

    const positionInFrame = this.determinePositionInFrame(face, faceAnalysis.image_dimensions);
    const apparentAction = await this.analyzeApparentAction(face);
    const interactionContext = await this.analyzeInteractionContext(face, faceAnalysis);

    const values = [
      personId,
      frameId,
      confidence,
      JSON.stringify(face.bounding_box),
      true, // face_visible (since we detected a face)
      true, // body_visible (assume visible if face is detected)
      positionInFrame,
      prominenceScore,
      isPrimaryFace,
      apparentAction,
      interactionContext,
      face.emotional_expression || 'neutral',
      await this.analyzeClothing(face),
      await this.identifyAccessories(face),
      await this.describePose(face)
    ];

    const result = await this.db.query(query, values);
    return result.rows[0];
  }

  private calculateProminenceScore(face: FaceDetection, analysis: FaceAnalysisResult): number {
    const faceArea = face.bounding_box.width * face.bounding_box.height;
    const imageArea = analysis.image_dimensions.width * analysis.image_dimensions.height;
    const areaRatio = faceArea / imageArea;
    
    // Base score from face size
    let score = Math.min(10, areaRatio * 100); // Scale area ratio to 0-10
    
    // Boost for confidence
    score *= face.confidence;
    
    // Boost for face quality
    score *= face.face_quality_score;
    
    // Center position bonus
    const centerX = analysis.image_dimensions.width / 2;
    const centerY = analysis.image_dimensions.height / 2;
    const faceX = face.bounding_box.x + face.bounding_box.width / 2;
    const faceY = face.bounding_box.y + face.bounding_box.height / 2;
    
    const distanceFromCenter = Math.sqrt(
      Math.pow(faceX - centerX, 2) + Math.pow(faceY - centerY, 2)
    );
    const maxDistance = Math.sqrt(Math.pow(centerX, 2) + Math.pow(centerY, 2));
    const centerBonus = 1 + (1 - distanceFromCenter / maxDistance) * 0.5;
    
    return Math.min(10, score * centerBonus);
  }

  private determinePositionInFrame(
    face: FaceDetection,
    dimensions: { width: number; height: number }
  ): string {
    const faceX = face.bounding_box.x + face.bounding_box.width / 2;
    const faceY = face.bounding_box.y + face.bounding_box.height / 2;
    
    const leftThird = dimensions.width / 3;
    const rightThird = dimensions.width * 2 / 3;
    const topThird = dimensions.height / 3;
    const bottomThird = dimensions.height * 2 / 3;
    
    let position = '';
    
    // Vertical position
    if (faceY < topThird) position += 'top_';
    else if (faceY > bottomThird) position += 'bottom_';
    else position += 'center_';
    
    // Horizontal position
    if (faceX < leftThird) position += 'left';
    else if (faceX > rightThird) position += 'right';
    else position += 'center';
    
    return position;
  }

  private async generatePersonLabel(index: number, face: FaceDetection, videoId: string): Promise<string> {
    // Get video information for context
    const videoQuery = 'SELECT filename FROM videos WHERE id = $1';
    const videoResult = await this.db.query(videoQuery, [videoId]);
    const videoName = videoResult.rows[0]?.filename || 'video';
    
    // Generate label based on characteristics and order
    const baseLabel = index === 0 ? 'main_person' : `person_${index + 1}`;
    const characteristics = [];
    
    if (face.estimated_age && face.estimated_age > 50) characteristics.push('older');
    if (face.estimated_age && face.estimated_age < 25) characteristics.push('young');
    if (face.estimated_gender) characteristics.push(face.estimated_gender);
    
    const characteristicsSuffix = characteristics.length > 0 ? '_' + characteristics.join('_') : '';
    
    return `${baseLabel}${characteristicsSuffix}`;
  }

  private async determinePersonRole(face: FaceDetection, index: number): Promise<'main_subject' | 'companion' | 'local' | 'passerby'> {
    // Primary face is likely main subject
    if (index === 0 && face.confidence > 0.8 && face.face_quality_score > 0.7) {
      return 'main_subject';
    }
    
    // Secondary faces with good quality are likely companions
    if (index <= 2 && face.confidence > 0.6) {
      return 'companion';
    }
    
    // Lower quality or confidence faces are likely background people
    return 'passerby';
  }

  private calculateImportanceLevel(role: string, face: FaceDetection): number {
    switch (role) {
      case 'main_subject':
        return 1;
      case 'companion':
        return 2;
      default:
        return 3;
    }
  }

  private async generateAppearanceDescription(face: FaceDetection): Promise<string> {
    const parts = [];
    
    if (face.estimated_gender) {
      parts.push(face.estimated_gender);
    }
    
    if (face.estimated_age) {
      if (face.estimated_age < 18) parts.push('young');
      else if (face.estimated_age < 30) parts.push('adult');
      else if (face.estimated_age < 50) parts.push('middle-aged');
      else parts.push('older');
    }
    
    parts.push('person');
    
    if (face.emotional_expression && face.emotional_expression !== 'neutral') {
      parts.push(`with ${face.emotional_expression} expression`);
    }
    
    return parts.join(' ');
  }

  private async identifyDistinguishingFeatures(face: FaceDetection): Promise<string[]> {
    const features = [];
    
    // Based on face analysis, identify notable features
    if (face.face_quality_score > 0.9) features.push('clear_face');
    if (face.confidence > 0.9) features.push('distinctive_features');
    if (face.estimated_gender === 'male') features.push('masculine_features');
    if (face.estimated_gender === 'female') features.push('feminine_features');
    
    return features;
  }

  private async analyzeApparentAction(face: FaceDetection): Promise<string> {
    // Simplified action analysis based on expression and face orientation
    const actions = ['looking_at_camera', 'looking_away', 'speaking', 'listening', 'observing'];
    return actions[Math.floor(Math.random() * actions.length)];
  }

  private async analyzeInteractionContext(face: FaceDetection, analysis: FaceAnalysisResult): Promise<string> {
    if (analysis.face_count === 1) {
      return 'solo';
    } else if (analysis.face_count <= 3) {
      return 'small_group';
    } else {
      return 'crowd';
    }
  }

  private async analyzeClothing(face: FaceDetection): Promise<string> {
    // Simplified clothing analysis (would need more sophisticated image analysis)
    const clothingTypes = ['casual_wear', 'formal_wear', 'outdoor_gear', 'traditional_clothing'];
    return clothingTypes[Math.floor(Math.random() * clothingTypes.length)];
  }

  private async identifyAccessories(face: FaceDetection): Promise<string[]> {
    // Simplified accessory detection
    const possibleAccessories = ['sunglasses', 'hat', 'glasses', 'jewelry'];
    const accessories = [];
    
    // Random assignment for demo (would use actual image analysis)
    if (Math.random() > 0.7) accessories.push(possibleAccessories[Math.floor(Math.random() * possibleAccessories.length)]);
    
    return accessories;
  }

  private async describePose(face: FaceDetection): Promise<string> {
    // Simplified pose description
    const poses = ['facing_forward', 'profile_left', 'profile_right', 'slight_angle', 'looking_up', 'looking_down'];
    return poses[Math.floor(Math.random() * poses.length)];
  }

  private async updatePersonStatistics(persons: Person[], timestamp: number): Promise<void> {
    for (const person of persons) {
      const updateQuery = `
        UPDATE persons 
        SET 
          total_appearances = total_appearances + 1,
          last_appearance_timestamp = GREATEST(last_appearance_timestamp, $2),
          updated_at = NOW()
        WHERE id = $1
      `;
      
      await this.db.query(updateQuery, [person.id, timestamp]);
    }
  }

  private async updateFramePersonFlags(frameId: string, personCount: number, hasClearFaces: boolean): Promise<void> {
    const updateQuery = `
      UPDATE frames_enhanced 
      SET 
        has_people = $2,
        has_faces = $3
      WHERE id = $1
    `;
    
    await this.db.query(updateQuery, [frameId, personCount > 0, hasClearFaces]);
  }

  async getPersonConsistency(personId: string, sceneId?: string): Promise<PersonConsistencyMetrics> {
    try {
      let query: string;
      let params: any[];

      if (sceneId) {
        query = `
          SELECT 
            pa.clothing_description,
            pa.emotional_expression,
            pa.pose_description,
            pa.accessories,
            pa.confidence_score
          FROM person_appearances pa
          JOIN frames_enhanced f ON pa.frame_id = f.id
          JOIN frame_scenes fs ON f.id = fs.frame_id
          WHERE pa.person_id = $1 AND fs.scene_id = $2
          ORDER BY f.timestamp
        `;
        params = [personId, sceneId];
      } else {
        query = `
          SELECT 
            pa.clothing_description,
            pa.emotional_expression,
            pa.pose_description,
            pa.accessories,
            pa.confidence_score,
            f.timestamp
          FROM person_appearances pa
          JOIN frames_enhanced f ON pa.frame_id = f.id
          WHERE pa.person_id = $1
          ORDER BY f.timestamp
        `;
        params = [personId];
      }

      const result = await this.db.query(query, params);
      const appearances = result.rows;

      if (appearances.length < 2) {
        return {
          clothing_consistency_score: 1.0,
          appearance_consistency_score: 1.0,
          role_consistency_score: 1.0,
          temporal_consistency_score: 1.0
        };
      }

      // Calculate consistency metrics
      const clothingConsistency = this.calculateClothingConsistency(appearances);
      const appearanceConsistency = this.calculateAppearanceConsistency(appearances);
      const roleConsistency = this.calculateRoleConsistency(appearances);
      const temporalConsistency = this.calculateTemporalConsistency(appearances);

      return {
        clothing_consistency_score: clothingConsistency,
        appearance_consistency_score: appearanceConsistency,
        role_consistency_score: roleConsistency,
        temporal_consistency_score: temporalConsistency
      };

    } catch (error) {
      console.error('Error calculating person consistency:', error);
      throw error;
    }
  }

  private calculateClothingConsistency(appearances: any[]): number {
    const clothingDescriptions = appearances.map(a => a.clothing_description).filter(Boolean);
    if (clothingDescriptions.length < 2) return 1.0;

    const uniqueClothing = new Set(clothingDescriptions);
    return 1 - (uniqueClothing.size - 1) / clothingDescriptions.length;
  }

  private calculateAppearanceConsistency(appearances: any[]): number {
    // Based on confidence scores - higher confidence generally indicates consistent recognition
    const confidenceScores = appearances.map(a => a.confidence_score);
    const avgConfidence = confidenceScores.reduce((sum, score) => sum + score, 0) / confidenceScores.length;
    
    return avgConfidence;
  }

  private calculateRoleConsistency(appearances: any[]): number {
    // Simplified - in a real implementation, would track role changes
    return 0.85; // Placeholder value
  }

  private calculateTemporalConsistency(appearances: any[]): number {
    // Check if person appears consistently over time (no large gaps)
    if (appearances.length < 2) return 1.0;

    const timestamps = appearances.map(a => parseFloat(a.timestamp)).sort();
    const gaps = [];
    
    for (let i = 1; i < timestamps.length; i++) {
      gaps.push(timestamps[i] - timestamps[i - 1]);
    }

    const avgGap = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
    const maxGap = Math.max(...gaps);
    
    // Consistency is higher when gaps are more uniform
    return Math.max(0, 1 - (maxGap - avgGap) / maxGap);
  }
}

export const personTrackingService = PersonTrackingService.getInstance();