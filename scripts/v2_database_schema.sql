-- V2 Enhanced Video Intelligence Database Schema
-- Supports Layer 1 (Enhanced Frame Analysis) and Layer 2 (Video Intelligence)

-- Core video table (enhanced from V1)
CREATE TABLE videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  
  -- File information
  filename TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT,
  duration DECIMAL,
  format TEXT, -- mp4, mov, etc.
  
  -- Metadata from file
  creation_time TIMESTAMP,
  modification_time TIMESTAMP,
  device_info JSONB, -- camera model, settings, etc.
  gps_coordinates JSONB, -- {lat, lng, altitude}
  
  -- Processing status
  status TEXT DEFAULT 'uploaded', -- uploaded, processing, analyzed, complete, error
  processing_started_at TIMESTAMP,
  processing_completed_at TIMESTAMP,
  error_message TEXT,
  
  -- Basic video analysis
  ffprobe_metadata JSONB, -- full FFprobe output
  total_frames INTEGER,
  fps DECIMAL,
  resolution TEXT, -- 1920x1080, etc.
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Layer 1: Enhanced Frame Analysis
CREATE TABLE frames_enhanced (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID REFERENCES videos(id) ON DELETE CASCADE,
  
  -- Frame identification
  timestamp DECIMAL NOT NULL, -- seconds into video
  frame_number INTEGER,
  frame_file_path TEXT, -- path to extracted jpg
  
  -- Layer 1: Visual Analysis
  description TEXT, -- detailed AI description
  visual_elements JSONB, -- ["beach", "person", "sunset", "buildings"]
  subjects JSONB, -- [{"type": "person", "position": "center", "action": "walking"}]
  setting_description TEXT, -- "bustling Tokyo street with traditional architecture"
  
  -- Composition Analysis
  composition_analysis JSONB DEFAULT '{}'::jsonb,
  /*
  {
    "rule_of_thirds": 8.5,
    "leading_lines": true,
    "framing": "natural",
    "balance": "asymmetric_dynamic",
    "depth_layers": ["foreground_person", "midground_street", "background_buildings"],
    "focal_point": "person_in_red_jacket",
    "color_harmony": 7.8
  }
  */
  
  -- Technical Quality Assessment  
  technical_quality JSONB DEFAULT '{}'::jsonb,
  /*
  {
    "sharpness": 8.2,
    "exposure": 9.1,
    "contrast": 7.5,
    "color_saturation": 8.7,
    "noise_level": 2.1,
    "motion_blur": false,
    "lighting_quality": "golden_hour"
  }
  */
  
  -- Scene Classification
  shot_type TEXT, -- wide, medium, close_up, extreme_close_up, establishing
  scene_type TEXT, -- action, dialogue, establishing, transition, reveal
  lighting_conditions TEXT, -- natural, artificial, golden_hour, overcast, indoor
  camera_movement TEXT, -- static, pan, tilt, zoom, handheld, stabilized
  
  -- Engagement Scoring
  engagement_score DECIMAL, -- 0-10 predicted viewer engagement
  composition_score DECIMAL, -- 0-10 visual composition quality
  aesthetic_score DECIMAL, -- 0-10 overall visual appeal
  uniqueness_score DECIMAL, -- 0-10 how distinctive/memorable
  
  -- Content Flags
  is_blurry BOOLEAN DEFAULT false,
  is_overexposed BOOLEAN DEFAULT false,
  is_underexposed BOOLEAN DEFAULT false,
  has_people BOOLEAN DEFAULT false,
  has_text BOOLEAN DEFAULT false,
  has_faces BOOLEAN DEFAULT false,
  
  -- Searchable content
  searchable_tags TEXT[], -- for full-text search functionality
  color_palette JSONB, -- dominant colors for visual search
  
  created_at TIMESTAMP DEFAULT NOW()
);

-- Layer 2: Video Intelligence (Narrative Analysis)
CREATE TABLE video_intelligence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID REFERENCES videos(id) ON DELETE CASCADE,
  
  -- Narrative Structure Analysis
  story_structure JSONB DEFAULT '{}'::jsonb,
  /*
  {
    "arc_type": "arrival_exploration_conclusion",
    "story_beats": [
      {"type": "setup", "timestamp": 0, "strength": 8},
      {"type": "inciting_incident", "timestamp": 15.2, "strength": 7},
      {"type": "climax", "timestamp": 45.1, "strength": 9},
      {"type": "resolution", "timestamp": 58.3, "strength": 8}
    ],
    "emotional_progression": [7, 8, 6, 9, 8, 7],
    "pacing_analysis": "builds_momentum_strong_finish"
  }
  */
  
  -- Retention Optimization
  retention_analysis JSONB DEFAULT '{}'::jsonb,
  /*
  {
    "predicted_engagement": [9, 8, 6, 7, 9],
    "hook_moments": [{"timestamp": 2.1, "strength": 9.2, "type": "visual_reveal"}],
    "drop_risk_points": [12.3, 18.7],
    "momentum_builders": [2.1, 15.3, 28.1],
    "payoff_moments": [{"timestamp": 45.1, "satisfaction": 8.8}],
    "optimal_length_recommendation": "25-30_seconds"
  }
  */
  
  -- Platform Intelligence
  platform_optimization JSONB DEFAULT '{}'::jsonb,
  /*
  {
    "tiktok": {"score": 8.5, "hook_strength": 9.1, "pacing": "fast"},
    "instagram_reels": {"score": 9.1, "aesthetic": 8.8, "story_clarity": 8.2},
    "youtube_shorts": {"score": 7.8, "narrative_completeness": 8.5},
    "recommended_platform": "instagram_reels",
    "aspect_ratio_recommendations": ["9:16", "1:1"]
  }
  */
  
  -- Content Classification
  content_category TEXT, -- travel, lifestyle, tutorial, entertainment, etc.
  primary_theme TEXT, -- adventure, relaxation, discovery, cultural_experience
  emotional_tone TEXT, -- excited, peaceful, adventurous, contemplative
  target_audience TEXT, -- gen_z, millennials, travel_enthusiasts
  
  -- Narrative Quality Metrics
  story_clarity_score DECIMAL, -- 0-10 how clear the story is
  emotional_impact_score DECIMAL, -- 0-10 emotional resonance
  visual_variety_score DECIMAL, -- 0-10 diversity of shots/scenes
  pacing_score DECIMAL, -- 0-10 rhythm and flow quality
  
  created_at TIMESTAMP DEFAULT NOW()
);

-- Scene Groupings (connects frames into coherent scenes)
CREATE TABLE scenes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID REFERENCES videos(id) ON DELETE CASCADE,
  
  -- Scene boundaries
  start_timestamp DECIMAL NOT NULL,
  end_timestamp DECIMAL NOT NULL,
  duration DECIMAL GENERATED ALWAYS AS (end_timestamp - start_timestamp) STORED,
  
  -- Scene characteristics
  scene_type TEXT, -- establishing, action, dialogue, transition, reveal, conclusion
  location_description TEXT,
  primary_activity TEXT, -- walking, eating, exploring, arriving, etc.
  setting_type TEXT, -- indoor, outdoor, urban, natural, transportation
  
  -- Visual continuity
  lighting_consistency DECIMAL, -- 0-1 how consistent lighting is
  camera_consistency DECIMAL, -- 0-1 similar camera positions/movements  
  subject_consistency DECIMAL, -- 0-1 same people/objects throughout
  background_consistency DECIMAL, -- 0-1 same environment
  
  -- Narrative role
  story_importance DECIMAL, -- 0-10 importance to overall narrative
  narrative_function TEXT, -- setup, development, climax, resolution
  emotional_arc TEXT, -- building, peak, release, neutral
  transition_quality_in DECIMAL, -- 0-10 how well it connects from previous
  transition_quality_out DECIMAL, -- 0-10 how well it leads to next
  
  -- Scene summary
  ai_summary TEXT, -- brief AI-generated description of what happens
  key_moments JSONB, -- important timestamps within the scene
  visual_highlights JSONB, -- best frames for thumbnails/previews
  
  -- Quality metrics
  overall_quality DECIMAL, -- 0-10 overall scene quality
  engagement_potential DECIMAL, -- 0-10 how engaging for viewers
  uniqueness DECIMAL, -- 0-10 how distinctive/memorable
  
  created_at TIMESTAMP DEFAULT NOW()
);

-- Frame-to-scene relationships
CREATE TABLE frame_scenes (
  frame_id UUID REFERENCES frames_enhanced(id) ON DELETE CASCADE,
  scene_id UUID REFERENCES scenes(id) ON DELETE CASCADE,
  PRIMARY KEY (frame_id, scene_id)
);

-- Sequential relationships between frames/scenes
CREATE TABLE frame_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_frame_id UUID REFERENCES frames_enhanced(id) ON DELETE CASCADE,
  to_frame_id UUID REFERENCES frames_enhanced(id) ON DELETE CASCADE,
  
  -- Relationship analysis
  relationship_type TEXT, -- continuation, cut, transition, cause_effect
  visual_similarity DECIMAL, -- 0-1 how similar the frames look
  narrative_connection DECIMAL, -- 0-1 story relationship strength
  temporal_gap DECIMAL, -- seconds between frames
  
  -- Transition quality
  cut_smoothness DECIMAL, -- 0-10 how well frames connect
  continuity_preservation DECIMAL, -- 0-10 maintains visual flow
  story_progression DECIMAL, -- 0-10 advances narrative
  
  created_at TIMESTAMP DEFAULT NOW()
);

-- Generated timelines and clips (output of the system)
CREATE TABLE generated_timelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  
  -- Source videos (can be multiple)
  source_video_ids UUID[], -- array of video IDs used
  
  -- User request
  user_objective TEXT, -- "create 1 minute zanzibar day 1 video"
  headline_text TEXT, -- for voiceover alignment
  target_duration INTEGER, -- seconds
  target_platform TEXT, -- tiktok, instagram, youtube
  
  -- Generated structure
  story_arc TEXT,
  narrative_flow TEXT,
  total_duration DECIMAL,
  confidence_score DECIMAL, -- 0-10 AI confidence in timeline
  
  -- Timeline segments
  timeline_data JSONB, -- complete timeline structure
  /*
  {
    "segments": [
      {
        "activity": "airport_arrival",
        "timeframe": "09:30-10:15",
        "duration": 8,
        "narrative_purpose": "journey_beginning",
        "selected_clips": [...]
      }
    ]
  }
  */
  
  -- Processing metadata
  processing_time_seconds INTEGER,
  api_cost_usd DECIMAL,
  frames_analyzed INTEGER,
  
  -- Status
  status TEXT DEFAULT 'generating', -- generating, complete, error
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Individual clip selections within timelines
CREATE TABLE timeline_clips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timeline_id UUID REFERENCES generated_timelines(id) ON DELETE CASCADE,
  
  -- Source reference
  source_video_id UUID REFERENCES videos(id),
  source_frame_id UUID REFERENCES frames_enhanced(id),
  
  -- Clip details
  start_timestamp DECIMAL,
  end_timestamp DECIMAL,
  duration DECIMAL GENERATED ALWAYS AS (end_timestamp - start_timestamp) STORED,
  
  -- Timeline position
  timeline_position INTEGER, -- order in final video
  segment_name TEXT, -- airport_arrival, beach_activity, etc.
  
  -- Selection reasoning
  selection_reason TEXT, -- why AI chose this clip
  priority_score DECIMAL, -- 0-10 importance score
  narrative_role TEXT, -- opener, development, climax, conclusion
  
  -- Quality metrics from source frame
  composition_score DECIMAL,
  engagement_score DECIMAL,
  technical_quality_score DECIMAL,
  
  -- Output file info (when compiled)
  compiled_file_path TEXT,
  public_url TEXT,
  
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_frames_video_timestamp ON frames_enhanced(video_id, timestamp);
CREATE INDEX idx_frames_engagement_score ON frames_enhanced(engagement_score DESC);
CREATE INDEX idx_frames_composition_score ON frames_enhanced(composition_score DESC);
CREATE INDEX idx_frames_shot_type ON frames_enhanced(shot_type);
CREATE INDEX idx_frames_scene_type ON frames_enhanced(scene_type);

CREATE INDEX idx_scenes_video ON scenes(video_id);
CREATE INDEX idx_scenes_story_importance ON scenes(story_importance DESC);
CREATE INDEX idx_scenes_quality ON scenes(overall_quality DESC);

CREATE INDEX idx_video_intelligence_video ON video_intelligence(video_id);
CREATE INDEX idx_timeline_clips_timeline ON timeline_clips(timeline_id);
CREATE INDEX idx_timeline_clips_position ON timeline_clips(timeline_position);

-- Full-text search indexes
CREATE INDEX idx_frames_description_search 
  ON frames_enhanced USING gin(to_tsvector('english', description));
CREATE INDEX idx_frames_tags_search 
  ON frames_enhanced USING gin(searchable_tags);
CREATE INDEX idx_scenes_summary_search 
  ON scenes USING gin(to_tsvector('english', ai_summary));

-- JSON field indexes for common queries
CREATE INDEX idx_frames_visual_elements 
  ON frames_enhanced USING gin(visual_elements);
CREATE INDEX idx_frames_composition 
  ON frames_enhanced USING gin(composition_analysis);
CREATE INDEX idx_video_intelligence_story 
  ON video_intelligence USING gin(story_structure);
CREATE INDEX idx_video_intelligence_retention 
  ON video_intelligence USING gin(retention_analysis);

-- Views for common queries
CREATE VIEW high_quality_frames AS
SELECT 
  f.*,
  s.scene_type as scene_context,
  s.story_importance
FROM frames_enhanced f
LEFT JOIN frame_scenes fs ON f.id = fs.frame_id
LEFT JOIN scenes s ON fs.scene_id = s.id
WHERE 
  f.engagement_score >= 7.0 
  AND f.composition_score >= 6.0
  AND NOT f.is_blurry;

CREATE VIEW timeline_summary AS
SELECT 
  t.id,
  t.user_objective,
  t.total_duration,
  t.confidence_score,
  COUNT(tc.id) as clip_count,
  AVG(tc.priority_score) as avg_clip_quality,
  t.created_at
FROM generated_timelines t
LEFT JOIN timeline_clips tc ON t.id = tc.timeline_id
GROUP BY t.id, t.user_objective, t.total_duration, t.confidence_score, t.created_at;