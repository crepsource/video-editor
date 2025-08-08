import { db } from '../services/database';
import { VideoMetadata, ProcessingStatus } from '../types/index';

export interface VideoRecord {
  id: string;
  user_id?: string;
  filename: string;
  file_path: string;
  file_size?: number;
  duration?: number;
  format?: string;
  creation_time?: Date;
  modification_time?: Date;
  device_info?: any;
  gps_coordinates?: any;
  status: ProcessingStatus;
  processing_started_at?: Date;
  processing_completed_at?: Date;
  error_message?: string;
  ffprobe_metadata?: any;
  total_frames?: number;
  fps?: number;
  resolution?: string;
  created_at: Date;
  updated_at: Date;
}

export class Video {
  static async create(videoData: Partial<VideoRecord>): Promise<VideoRecord> {
    const query = `
      INSERT INTO videos (
        filename, file_path, file_size, duration, format,
        creation_time, modification_time, device_info, gps_coordinates,
        status, ffprobe_metadata, total_frames, fps, resolution
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `;
    
    const values = [
      videoData.filename,
      videoData.file_path,
      videoData.file_size,
      videoData.duration,
      videoData.format,
      videoData.creation_time,
      videoData.modification_time,
      videoData.device_info,
      videoData.gps_coordinates,
      videoData.status || 'uploaded',
      videoData.ffprobe_metadata,
      videoData.total_frames,
      videoData.fps,
      videoData.resolution
    ];
    
    const result = await db.query(query, values);
    return result.rows[0];
  }

  static async findById(id: string): Promise<VideoRecord | null> {
    const query = 'SELECT * FROM videos WHERE id = $1';
    const result = await db.query(query, [id]);
    return result.rows[0] || null;
  }

  static async findByStatus(status: ProcessingStatus): Promise<VideoRecord[]> {
    const query = 'SELECT * FROM videos WHERE status = $1 ORDER BY created_at ASC';
    const result = await db.query(query, [status]);
    return result.rows;
  }

  static async updateStatus(id: string, status: ProcessingStatus, errorMessage?: string): Promise<VideoRecord> {
    const query = `
      UPDATE videos 
      SET status = $2, 
          processing_started_at = CASE WHEN $2 = 'processing' THEN NOW() ELSE processing_started_at END,
          processing_completed_at = CASE WHEN $2 IN ('analyzed', 'complete', 'error') THEN NOW() ELSE NULL END,
          error_message = $3,
          updated_at = NOW()
      WHERE id = $1 
      RETURNING *
    `;
    
    const result = await db.query(query, [id, status, errorMessage]);
    return result.rows[0];
  }

  static async addFFProbeMetadata(id: string, metadata: any): Promise<VideoRecord> {
    const query = `
      UPDATE videos 
      SET ffprobe_metadata = $2, 
          total_frames = $3,
          fps = $4,
          resolution = $5,
          duration = $6,
          updated_at = NOW()
      WHERE id = $1 
      RETURNING *
    `;
    
    const values = [
      id,
      metadata,
      metadata.streams?.[0]?.nb_frames,
      metadata.streams?.[0]?.r_frame_rate,
      metadata.streams?.[0]?.width && metadata.streams?.[0]?.height 
        ? `${metadata.streams[0].width}x${metadata.streams[0].height}` 
        : null,
      metadata.format?.duration
    ];
    
    const result = await db.query(query, values);
    return result.rows[0];
  }

  static async list(limit: number = 50, offset: number = 0): Promise<VideoRecord[]> {
    const query = `
      SELECT * FROM videos 
      ORDER BY created_at DESC 
      LIMIT $1 OFFSET $2
    `;
    const result = await db.query(query, [limit, offset]);
    return result.rows;
  }

  static async delete(id: string): Promise<boolean> {
    const query = 'DELETE FROM videos WHERE id = $1';
    const result = await db.query(query, [id]);
    return result.rowCount > 0;
  }
}