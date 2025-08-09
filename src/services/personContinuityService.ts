import { Pool } from 'pg';
import { database } from './database';
import { Person, PersonConsistencyMetrics, personTrackingService } from './personTrackingService';

export interface SceneContinuity {
  id: string;
  person_id: string;
  scene_id: string;
  clothing_consistency_score: number;
  appearance_consistency_score: number;
  role_consistency_score: number;
  scene_importance: number;
  narrative_function: string;
  screen_time_percentage: number;
  created_at: Date;
}

export interface ContinuityAnalysisResult {
  person_continuity: SceneContinuity[];
  overall_consistency_score: number;
  consistency_issues: ContinuityIssue[];
  recommendations: ContinuityRecommendation[];
  processing_time_ms: number;
}

export interface ContinuityIssue {
  type: 'clothing_change' | 'appearance_inconsistency' | 'role_conflict' | 'temporal_gap';
  severity: 'low' | 'medium' | 'high';
  description: string;
  person_id: string;
  scene_id?: string;
  timestamp_range?: { start: number; end: number };
  confidence: number;
}

export interface ContinuityRecommendation {
  type: 'clip_ordering' | 'scene_grouping' | 'person_labeling' | 'quality_filtering';
  priority: 'high' | 'medium' | 'low';
  description: string;
  action_items: string[];
  expected_improvement: number; // 0-1 score improvement
}

export interface PersonNarrativeArc {
  person_id: string;
  person_label: string;
  story_arc: {
    introduction_timestamp?: number;
    development_phases: Array<{
      start_timestamp: number;
      end_timestamp: number;
      phase_type: 'setup' | 'conflict' | 'climax' | 'resolution';
      importance_score: number;
    }>;
    conclusion_timestamp?: number;
  };
  emotional_journey: Array<{
    timestamp: number;
    emotion: string;
    intensity: number;
  }>;
  interaction_patterns: {
    solo_time_percentage: number;
    group_interaction_percentage: number;
    camera_interaction_percentage: number;
  };
  visual_prominence_curve: Array<{
    timestamp: number;
    prominence_score: number;
  }>;
}

export class PersonContinuityService {
  private static instance: PersonContinuityService;
  private db: Pool;

  private constructor() {
    this.db = database.getPool();
  }

  public static getInstance(): PersonContinuityService {
    if (!PersonContinuityService.instance) {
      PersonContinuityService.instance = new PersonContinuityService();
    }
    return PersonContinuityService.instance;
  }

  async analyzeContinuityForVideo(videoId: string): Promise<ContinuityAnalysisResult> {
    const startTime = Date.now();
    
    try {
      // Get all scenes and persons for this video
      const scenes = await this.getScenesForVideo(videoId);
      const persons = await this.getPersonsForVideo(videoId);
      
      if (scenes.length === 0 || persons.length === 0) {
        return {
          person_continuity: [],
          overall_consistency_score: 0,
          consistency_issues: [],
          recommendations: [],
          processing_time_ms: Date.now() - startTime
        };
      }

      // Analyze continuity for each person in each scene
      const sceneContinuities: SceneContinuity[] = [];
      const continuityIssues: ContinuityIssue[] = [];

      for (const person of persons) {
        for (const scene of scenes) {
          const continuity = await this.analyzePersonSceneContinuity(person, scene);
          if (continuity) {
            sceneContinuities.push(continuity);
            
            // Identify issues
            const issues = await this.identifyContinuityIssues(person, scene, continuity);
            continuityIssues.push(...issues);
          }
        }
      }

      // Calculate overall consistency score
      const overallScore = this.calculateOverallConsistencyScore(sceneContinuities);
      
      // Generate recommendations
      const recommendations = await this.generateContinuityRecommendations(
        sceneContinuities,
        continuityIssues,
        persons
      );

      return {
        person_continuity: sceneContinuities,
        overall_consistency_score: overallScore,
        consistency_issues: continuityIssues,
        recommendations,
        processing_time_ms: Date.now() - startTime
      };
      
    } catch (error) {
      console.error('Continuity analysis failed:', error);
      throw new Error(`Continuity analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async getScenesForVideo(videoId: string): Promise<any[]> {
    const query = `
      SELECT * FROM scenes 
      WHERE video_id = $1 
      ORDER BY start_timestamp ASC
    `;
    const result = await this.db.query(query, [videoId]);
    return result.rows;
  }

  private async getPersonsForVideo(videoId: string): Promise<Person[]> {
    const query = `
      SELECT DISTINCT p.* 
      FROM persons p
      JOIN person_appearances pa ON p.id = pa.person_id
      JOIN frames_enhanced f ON pa.frame_id = f.id
      WHERE f.video_id = $1
    `;
    const result = await this.db.query(query, [videoId]);
    return result.rows;
  }

  private async analyzePersonSceneContinuity(person: Person, scene: any): Promise<SceneContinuity | null> {
    try {
      // Get person appearances in this scene
      const appearancesQuery = `
        SELECT pa.*, f.timestamp
        FROM person_appearances pa
        JOIN frames_enhanced f ON pa.frame_id = f.id
        JOIN frame_scenes fs ON f.id = fs.frame_id
        WHERE pa.person_id = $1 AND fs.scene_id = $2
        ORDER BY f.timestamp
      `;
      
      const appearancesResult = await this.db.query(appearancesQuery, [person.id, scene.id]);
      const appearances = appearancesResult.rows;
      
      if (appearances.length === 0) {
        return null; // Person doesn't appear in this scene
      }

      // Get consistency metrics
      const consistency = await personTrackingService.getPersonConsistency(person.id, scene.id);
      
      // Calculate scene-specific metrics
      const sceneImportance = this.calculateSceneImportance(person, appearances, scene);
      const narrativeFunction = await this.determineNarrativeFunction(person, appearances, scene);
      const screenTimePercentage = this.calculateScreenTimePercentage(appearances, scene);

      // Create or update person continuity record
      const continuityId = await this.upsertPersonContinuity({
        person_id: person.id,
        scene_id: scene.id,
        clothing_consistency_score: consistency.clothing_consistency_score,
        appearance_consistency_score: consistency.appearance_consistency_score,
        role_consistency_score: consistency.role_consistency_score,
        scene_importance: sceneImportance,
        narrative_function: narrativeFunction,
        screen_time_percentage: screenTimePercentage
      });

      return {
        id: continuityId,
        person_id: person.id,
        scene_id: scene.id,
        clothing_consistency_score: consistency.clothing_consistency_score,
        appearance_consistency_score: consistency.appearance_consistency_score,
        role_consistency_score: consistency.role_consistency_score,
        scene_importance: sceneImportance,
        narrative_function: narrativeFunction,
        screen_time_percentage: screenTimePercentage,
        created_at: new Date()
      };
      
    } catch (error) {
      console.error('Error analyzing person scene continuity:', error);
      return null;
    }
  }

  private calculateSceneImportance(person: Person, appearances: any[], scene: any): number {
    // Base importance on person's overall importance and their prominence in this scene
    const baseImportance = (4 - person.importance_level) * 2.5; // 1->7.5, 2->5.0, 3->2.5
    
    // Average prominence in this scene
    const avgProminence = appearances.reduce((sum, app) => sum + app.prominence_score, 0) / appearances.length;
    
    // Frequency bonus (how often they appear in the scene)
    const appearanceRatio = appearances.length / Math.max(1, scene.duration * 2); // Assuming 2 frames per second baseline
    const frequencyBonus = Math.min(2, appearanceRatio);
    
    const sceneImportance = (baseImportance + avgProminence + frequencyBonus) / 3;
    return Math.max(0, Math.min(10, sceneImportance));
  }

  private async determineNarrativeFunction(person: Person, appearances: any[], scene: any): Promise<string> {
    // Determine person's role in this specific scene based on their appearances and the scene context
    
    const isMainSubject = appearances.some(app => app.is_main_subject);
    const avgProminence = appearances.reduce((sum, app) => sum + app.prominence_score, 0) / appearances.length;
    
    if (isMainSubject && avgProminence > 7) {
      return 'protagonist';
    } else if (avgProminence > 5 && person.person_role !== 'passerby') {
      return 'supporting';
    } else if (appearances.length > 2) {
      return 'companion';
    } else {
      return 'background';
    }
  }

  private calculateScreenTimePercentage(appearances: any[], scene: any): number {
    if (!scene.duration || scene.duration <= 0) {
      return 0;
    }

    // Estimate screen time based on number of appearances
    // Assuming each appearance represents roughly 0.5 seconds of screen time
    const estimatedScreenTime = appearances.length * 0.5;
    const percentage = (estimatedScreenTime / scene.duration) * 100;
    
    return Math.max(0, Math.min(100, percentage));
  }

  private async upsertPersonContinuity(data: {
    person_id: string;
    scene_id: string;
    clothing_consistency_score: number;
    appearance_consistency_score: number;
    role_consistency_score: number;
    scene_importance: number;
    narrative_function: string;
    screen_time_percentage: number;
  }): Promise<string> {
    const query = `
      INSERT INTO person_continuity (
        person_id,
        scene_id,
        clothing_consistency_score,
        appearance_consistency_score,
        role_consistency_score,
        scene_importance,
        narrative_function,
        screen_time_percentage
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (person_id, scene_id)
      DO UPDATE SET
        clothing_consistency_score = EXCLUDED.clothing_consistency_score,
        appearance_consistency_score = EXCLUDED.appearance_consistency_score,
        role_consistency_score = EXCLUDED.role_consistency_score,
        scene_importance = EXCLUDED.scene_importance,
        narrative_function = EXCLUDED.narrative_function,
        screen_time_percentage = EXCLUDED.screen_time_percentage,
        created_at = NOW()
      RETURNING id
    `;

    const values = [
      data.person_id,
      data.scene_id,
      data.clothing_consistency_score,
      data.appearance_consistency_score,
      data.role_consistency_score,
      data.scene_importance,
      data.narrative_function,
      data.screen_time_percentage
    ];

    const result = await this.db.query(query, values);
    return result.rows[0].id;
  }

  private async identifyContinuityIssues(
    person: Person,
    scene: any,
    continuity: SceneContinuity
  ): Promise<ContinuityIssue[]> {
    const issues: ContinuityIssue[] = [];

    // Clothing consistency issues
    if (continuity.clothing_consistency_score < 0.7) {
      issues.push({
        type: 'clothing_change',
        severity: continuity.clothing_consistency_score < 0.4 ? 'high' : 'medium',
        description: `${person.person_label} shows inconsistent clothing in scene`,
        person_id: person.id,
        scene_id: scene.id,
        confidence: 1 - continuity.clothing_consistency_score
      });
    }

    // Appearance consistency issues
    if (continuity.appearance_consistency_score < 0.6) {
      issues.push({
        type: 'appearance_inconsistency',
        severity: continuity.appearance_consistency_score < 0.3 ? 'high' : 'medium',
        description: `${person.person_label} has inconsistent appearance recognition in scene`,
        person_id: person.id,
        scene_id: scene.id,
        confidence: 1 - continuity.appearance_consistency_score
      });
    }

    // Role consistency issues
    if (continuity.role_consistency_score < 0.8) {
      issues.push({
        type: 'role_conflict',
        severity: 'medium',
        description: `${person.person_label} shows inconsistent narrative role in scene`,
        person_id: person.id,
        scene_id: scene.id,
        confidence: 1 - continuity.role_consistency_score
      });
    }

    return issues;
  }

  private calculateOverallConsistencyScore(continuities: SceneContinuity[]): number {
    if (continuities.length === 0) return 0;

    const scores = continuities.map(c => 
      (c.clothing_consistency_score + c.appearance_consistency_score + c.role_consistency_score) / 3
    );

    return scores.reduce((sum, score) => sum + score, 0) / scores.length;
  }

  private async generateContinuityRecommendations(
    continuities: SceneContinuity[],
    issues: ContinuityIssue[],
    persons: Person[]
  ): Promise<ContinuityRecommendation[]> {
    const recommendations: ContinuityRecommendation[] = [];

    // Group issues by type
    const issuesByType = issues.reduce((groups, issue) => {
      if (!groups[issue.type]) groups[issue.type] = [];
      groups[issue.type].push(issue);
      return groups;
    }, {} as Record<string, ContinuityIssue[]>);

    // Generate recommendations based on issue patterns
    
    // Clothing change recommendations
    if (issuesByType.clothing_change?.length > 0) {
      recommendations.push({
        type: 'clip_ordering',
        priority: 'high',
        description: 'Reorder clips to maintain clothing consistency within scenes',
        action_items: [
          'Group clips by clothing appearance',
          'Separate scenes where clothing changes occur',
          'Consider clothing changes as natural scene breaks'
        ],
        expected_improvement: 0.3
      });
    }

    // Appearance inconsistency recommendations
    if (issuesByType.appearance_inconsistency?.length > 0) {
      recommendations.push({
        type: 'quality_filtering',
        priority: 'medium',
        description: 'Filter out low-quality face recognition results',
        action_items: [
          'Increase confidence threshold for person matching',
          'Remove frames with poor lighting or blur',
          'Manual review of questionable person identifications'
        ],
        expected_improvement: 0.2
      });
    }

    // Person labeling improvements
    const mainPersons = persons.filter(p => p.importance_level === 1);
    if (mainPersons.length > 1) {
      recommendations.push({
        type: 'person_labeling',
        priority: 'medium',
        description: 'Clarify person roles and importance hierarchy',
        action_items: [
          'Review and adjust person importance levels',
          'Ensure consistent person labeling across scenes',
          'Consider merging similar person profiles'
        ],
        expected_improvement: 0.15
      });
    }

    // Scene grouping recommendations
    const lowConsistencyScenes = continuities.filter(c => 
      (c.clothing_consistency_score + c.appearance_consistency_score + c.role_consistency_score) / 3 < 0.6
    );
    
    if (lowConsistencyScenes.length > 0) {
      recommendations.push({
        type: 'scene_grouping',
        priority: 'low',
        description: 'Reorganize scenes to improve continuity flow',
        action_items: [
          'Split scenes with major continuity breaks',
          'Group similar continuity segments together',
          'Consider temporal ordering adjustments'
        ],
        expected_improvement: 0.1
      });
    }

    return recommendations.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }

  async generatePersonNarrativeArcs(videoId: string): Promise<PersonNarrativeArc[]> {
    try {
      const persons = await this.getPersonsForVideo(videoId);
      const narrativeArcs: PersonNarrativeArc[] = [];

      for (const person of persons) {
        const arc = await this.buildPersonNarrativeArc(person, videoId);
        narrativeArcs.push(arc);
      }

      return narrativeArcs.sort((a, b) => {
        // Sort by importance (main subjects first)
        const aImportance = persons.find(p => p.id === a.person_id)?.importance_level || 3;
        const bImportance = persons.find(p => p.id === b.person_id)?.importance_level || 3;
        return aImportance - bImportance;
      });

    } catch (error) {
      console.error('Error generating narrative arcs:', error);
      throw error;
    }
  }

  private async buildPersonNarrativeArc(person: Person, videoId: string): Promise<PersonNarrativeArc> {
    // Get all appearances for this person in temporal order
    const appearancesQuery = `
      SELECT 
        pa.*,
        f.timestamp,
        s.scene_type,
        s.narrative_function,
        s.start_timestamp as scene_start,
        s.end_timestamp as scene_end
      FROM person_appearances pa
      JOIN frames_enhanced f ON pa.frame_id = f.id
      LEFT JOIN frame_scenes fs ON f.id = fs.frame_id
      LEFT JOIN scenes s ON fs.scene_id = s.id
      WHERE pa.person_id = $1 AND f.video_id = $2
      ORDER BY f.timestamp ASC
    `;

    const result = await this.db.query(appearancesQuery, [person.id, videoId]);
    const appearances = result.rows;

    if (appearances.length === 0) {
      return {
        person_id: person.id,
        person_label: person.person_label,
        story_arc: { development_phases: [] },
        emotional_journey: [],
        interaction_patterns: {
          solo_time_percentage: 0,
          group_interaction_percentage: 0,
          camera_interaction_percentage: 0
        },
        visual_prominence_curve: []
      };
    }

    // Build story arc phases
    const developmentPhases = this.identifyDevelopmentPhases(appearances);
    
    // Build emotional journey
    const emotionalJourney = appearances.map(app => ({
      timestamp: parseFloat(app.timestamp),
      emotion: app.emotional_expression || 'neutral',
      intensity: app.prominence_score / 10
    }));

    // Calculate interaction patterns
    const interactionPatterns = this.calculateInteractionPatterns(appearances);
    
    // Build visual prominence curve
    const visualProminenceCurve = appearances.map(app => ({
      timestamp: parseFloat(app.timestamp),
      prominence_score: app.prominence_score
    }));

    return {
      person_id: person.id,
      person_label: person.person_label,
      story_arc: {
        introduction_timestamp: appearances[0] ? parseFloat(appearances[0].timestamp) : undefined,
        development_phases: developmentPhases,
        conclusion_timestamp: appearances[appearances.length - 1] ? 
          parseFloat(appearances[appearances.length - 1].timestamp) : undefined
      },
      emotional_journey: emotionalJourney,
      interaction_patterns: interactionPatterns,
      visual_prominence_curve: visualProminenceCurve
    };
  }

  private identifyDevelopmentPhases(appearances: any[]): PersonNarrativeArc['story_arc']['development_phases'] {
    const phases: PersonNarrativeArc['story_arc']['development_phases'] = [];
    
    if (appearances.length < 2) return phases;

    // Group appearances by scene narrative function
    const sceneGroups = appearances.reduce((groups, app) => {
      const function_type = app.narrative_function || 'development';
      if (!groups[function_type]) groups[function_type] = [];
      groups[function_type].push(app);
      return groups;
    }, {} as Record<string, any[]>);

    // Create phases from scene groups
    Object.entries(sceneGroups).forEach(([phaseType, apps]) => {
      if (apps.length > 0) {
        const timestamps = apps.map(app => parseFloat(app.timestamp)).sort();
        const avgImportance = apps.reduce((sum, app) => sum + app.prominence_score, 0) / apps.length;
        
        phases.push({
          start_timestamp: timestamps[0],
          end_timestamp: timestamps[timestamps.length - 1],
          phase_type: phaseType as any,
          importance_score: avgImportance
        });
      }
    });

    return phases.sort((a, b) => a.start_timestamp - b.start_timestamp);
  }

  private calculateInteractionPatterns(appearances: any[]): PersonNarrativeArc['interaction_patterns'] {
    const totalAppearances = appearances.length;
    
    if (totalAppearances === 0) {
      return {
        solo_time_percentage: 0,
        group_interaction_percentage: 0,
        camera_interaction_percentage: 0
      };
    }

    const soloCount = appearances.filter(app => app.interaction_context === 'solo').length;
    const groupCount = appearances.filter(app => 
      app.interaction_context === 'small_group' || app.interaction_context === 'crowd'
    ).length;
    const cameraCount = appearances.filter(app => 
      app.apparent_action === 'looking_at_camera' || app.interaction_context === 'addressing_camera'
    ).length;

    return {
      solo_time_percentage: (soloCount / totalAppearances) * 100,
      group_interaction_percentage: (groupCount / totalAppearances) * 100,
      camera_interaction_percentage: (cameraCount / totalAppearances) * 100
    };
  }
}

export const personContinuityService = PersonContinuityService.getInstance();