-- Seed data for development and testing
-- This file is automatically loaded after the schema

-- Enable UUID generation extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Insert sample video data for testing
INSERT INTO videos (
  id,
  filename,
  file_path,
  file_size,
  duration,
  format,
  fps,
  resolution,
  status,
  total_frames,
  created_at
) VALUES 
(
  uuid_generate_v4(),
  'sample_video_1.mp4',
  '/uploads/sample_video_1.mp4',
  15728640, -- ~15MB
  60.5, -- 60.5 seconds
  'mp4',
  30.0,
  '1920x1080',
  'uploaded',
  1815, -- 60.5 * 30 fps
  NOW() - INTERVAL '1 hour'
),
(
  uuid_generate_v4(),
  'test_beach_scene.mov',
  '/uploads/test_beach_scene.mov',
  25165824, -- ~25MB  
  45.2,
  'mov',
  24.0,
  '1920x1080',
  'uploaded',
  1085,
  NOW() - INTERVAL '30 minutes'
);

-- Note: Sample frame data would be inserted after actual video processing
-- This is just the basic video metadata for testing database connections

COMMIT;