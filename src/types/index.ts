// Core type definitions for video processing and frame analysis

export interface FrameAnalysisResult {
  id: string;
  videoId: string;
  timestamp: number;
  framePath: string;
  description: string;
  compositionAnalysis: CompositionAnalysis;
  qualityMetrics: QualityMetrics;
  visualElements: VisualElements;
  engagementScore: number;
  sceneType: SceneType;
  createdAt: Date;
}

export interface CompositionAnalysis {
  ruleOfThirdsScore: number;
  leadingLines: number;
  visualBalance: number;
  overallScore: number;
}

export interface QualityMetrics {
  sharpness: number;
  exposure: number;
  colorSaturation: number;
  overallQuality: number;
}

export interface VisualElements {
  subjects: string[];
  environment: string;
  objects: string[];
  colors: string[];
}

export enum SceneType {
  ESTABLISHING = 'establishing',
  ACTION = 'action',
  CLOSEUP = 'close-up',
  TRANSITION = 'transition',
}

export interface VideoMetadata {
  id: string;
  filename: string;
  duration: number;
  width: number;
  height: number;
  fps: number;
  format: string;
  size: number;
  createdAt: Date;
}