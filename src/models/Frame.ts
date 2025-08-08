import { db } from '../services/database';
import { FrameAnalysisResult } from '../types/index';

export interface FrameRecord {
  id: string;
  video_id: string;
  timestamp: number;
  frame_number?: number;
  frame_file_path?: string;
  description?: string;
  visual_elements?: string[];
  subjects?: any[];
  setting_description?: string;
  composition_analysis?: any;
  technical_quality?: any;
  created_at: Date;
  updated_at: Date;
}

export class Frame {
  static async create(frameData: Partial<FrameRecord>): Promise<FrameRecord> {
    const query = `
      INSERT INTO frames_enhanced (
        video_id, timestamp, frame_number, frame_file_path,
        description, visual_elements, subjects, setting_description,
        composition_analysis, technical_quality
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;
    
    const values = [
      frameData.video_id,
      frameData.timestamp,
      frameData.frame_number,
      frameData.frame_file_path,
      frameData.description,
      JSON.stringify(frameData.visual_elements),
      JSON.stringify(frameData.subjects),
      frameData.setting_description,
      frameData.composition_analysis,
      frameData.technical_quality
    ];
    
    const result = await db.query(query, values);
    return result.rows[0];
  }

  static async findByVideoId(videoId: string): Promise<FrameRecord[]> {
    const query = `
      SELECT * FROM frames_enhanced 
      WHERE video_id = $1 
      ORDER BY timestamp ASC
    `;
    const result = await db.query(query, [videoId]);
    return result.rows;
  }

  static async findById(id: string): Promise<FrameRecord | null> {
    const query = 'SELECT * FROM frames_enhanced WHERE id = $1';
    const result = await db.query(query, [id]);
    return result.rows[0] || null;
  }

  static async updateAnalysis(id: string, analysisResult: FrameAnalysisResult): Promise<FrameRecord> {
    const query = `
      UPDATE frames_enhanced 
      SET description = $2,
          visual_elements = $3,
          subjects = $4,
          setting_description = $5,
          composition_analysis = $6,
          technical_quality = $7,
          updated_at = NOW()
      WHERE id = $1 
      RETURNING *
    `;
    
    const values = [
      id,
      analysisResult.description,
      JSON.stringify(analysisResult.visual_elements),
      JSON.stringify(analysisResult.subjects),
      analysisResult.setting_description,
      analysisResult.composition_analysis,
      analysisResult.technical_quality
    ];
    
    const result = await db.query(query, values);
    return result.rows[0];
  }

  static async findByTimeRange(videoId: string, startTime: number, endTime: number): Promise<FrameRecord[]> {
    const query = `
      SELECT * FROM frames_enhanced 
      WHERE video_id = $1 
        AND timestamp BETWEEN $2 AND $3
      ORDER BY timestamp ASC
    `;
    const result = await db.query(query, [videoId, startTime, endTime]);
    return result.rows;
  }

  static async searchByDescription(searchTerm: string, limit: number = 20): Promise<FrameRecord[]> {
    const query = `
      SELECT * FROM frames_enhanced 
      WHERE to_tsvector('english', description) @@ plainto_tsquery('english', $1)
      ORDER BY ts_rank(to_tsvector('english', description), plainto_tsquery('english', $1)) DESC
      LIMIT $2
    `;
    const result = await db.query(query, [searchTerm, limit]);
    return result.rows;
  }

  static async getBestFrames(videoId: string, limit: number = 10): Promise<FrameRecord[]> {
    const query = `
      SELECT * FROM frames_enhanced 
      WHERE video_id = $1 
        AND composition_analysis ? 'overall_score'
      ORDER BY (composition_analysis->>'overall_score')::DECIMAL DESC
      LIMIT $2
    `;
    const result = await db.query(query, [videoId, limit]);
    return result.rows;
  }

  static async bulkCreate(frames: Partial<FrameRecord>[]): Promise<FrameRecord[]> {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      
      const results: FrameRecord[] = [];
      for (const frame of frames) {
        const query = `
          INSERT INTO frames_enhanced (
            video_id, timestamp, frame_number, frame_file_path,
            description, visual_elements, subjects, setting_description,
            composition_analysis, technical_quality
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          RETURNING *
        `;
        
        const values = [
          frame.video_id,
          frame.timestamp,
          frame.frame_number,
          frame.frame_file_path,
          frame.description,
          JSON.stringify(frame.visual_elements),
          JSON.stringify(frame.subjects),
          frame.setting_description,
          frame.composition_analysis,
          frame.technical_quality
        ];
        
        const result = await client.query(query, values);
        results.push(result.rows[0]);
      }
      
      await client.query('COMMIT');
      return results;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async delete(id: string): Promise<boolean> {
    const query = 'DELETE FROM frames_enhanced WHERE id = $1';
    const result = await db.query(query, [id]);
    return result.rowCount > 0;
  }
}