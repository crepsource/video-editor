import { EventEmitter } from 'events';
import { Video } from '../models/Video';
import { videoUploadService } from './videoUpload';
import { frameExtractionService } from './frameExtraction';
import { metadataExtractionService } from './metadataExtraction';
import { frameStorageService } from './frameStorage';
import { ProcessingStatus } from '../types/index';

export interface ProcessingJob {
  id: string;
  videoId: string;
  type: 'upload' | 'extract_frames' | 'analyze_frames' | 'generate_intelligence' | 'complete';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  priority: number; // Higher number = higher priority
  attempts: number;
  maxAttempts: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  data?: any;
  progress?: number; // 0-100
}

export interface ProcessingOptions {
  frameInterval?: number;
  maxFrames?: number;
  generateThumbnails?: boolean;
  analyzeFrames?: boolean;
  generateIntelligence?: boolean;
  priority?: number;
}

export class VideoProcessingQueue extends EventEmitter {
  private static instance: VideoProcessingQueue;
  private queue: ProcessingJob[] = [];
  private activeJobs: Map<string, ProcessingJob> = new Map();
  private maxConcurrentJobs: number;
  private isProcessing: boolean = false;
  private processInterval?: NodeJS.Timeout;

  private constructor() {
    super();
    this.maxConcurrentJobs = parseInt(process.env.MAX_CONCURRENT_JOBS || '2');
  }

  public static getInstance(): VideoProcessingQueue {
    if (!VideoProcessingQueue.instance) {
      VideoProcessingQueue.instance = new VideoProcessingQueue();
    }
    return VideoProcessingQueue.instance;
  }

  /**
   * Start the processing queue
   */
  start(): void {
    if (this.isProcessing) return;
    
    this.isProcessing = true;
    this.processInterval = setInterval(() => {
      this.processNextJob();
    }, 1000); // Check every second
    
    this.emit('queue:started');
    console.log('Video processing queue started');
  }

  /**
   * Stop the processing queue
   */
  stop(): void {
    if (!this.isProcessing) return;
    
    this.isProcessing = false;
    if (this.processInterval) {
      clearInterval(this.processInterval);
      this.processInterval = undefined;
    }
    
    this.emit('queue:stopped');
    console.log('Video processing queue stopped');
  }

  /**
   * Add a video to the processing queue
   */
  async addVideo(
    videoId: string,
    options: ProcessingOptions = {}
  ): Promise<ProcessingJob> {
    const video = await Video.findById(videoId);
    if (!video) {
      throw new Error(`Video ${videoId} not found`);
    }

    // Create initial job for frame extraction
    const job: ProcessingJob = {
      id: `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      videoId,
      type: 'extract_frames',
      status: 'pending',
      priority: options.priority || 5,
      attempts: 0,
      maxAttempts: 3,
      createdAt: new Date(),
      data: {
        frameInterval: options.frameInterval || 3,
        maxFrames: options.maxFrames,
        generateThumbnails: options.generateThumbnails !== false,
        analyzeFrames: options.analyzeFrames !== false,
        generateIntelligence: options.generateIntelligence !== false
      }
    };

    this.enqueueJob(job);
    
    // Update video status
    await Video.updateStatus(videoId, 'processing');
    
    this.emit('job:added', job);
    return job;
  }

  /**
   * Add a job to the queue
   */
  private enqueueJob(job: ProcessingJob): void {
    // Insert job in priority order
    const insertIndex = this.queue.findIndex(j => j.priority < job.priority);
    if (insertIndex === -1) {
      this.queue.push(job);
    } else {
      this.queue.splice(insertIndex, 0, job);
    }
  }

  /**
   * Process the next job in the queue
   */
  private async processNextJob(): Promise<void> {
    // Check if we can process more jobs
    if (this.activeJobs.size >= this.maxConcurrentJobs) {
      return;
    }

    // Get next job from queue
    const job = this.queue.shift();
    if (!job) {
      return;
    }

    // Mark job as active
    job.status = 'processing';
    job.startedAt = new Date();
    this.activeJobs.set(job.id, job);
    
    this.emit('job:started', job);

    try {
      await this.executeJob(job);
      
      job.status = 'completed';
      job.completedAt = new Date();
      job.progress = 100;
      
      this.emit('job:completed', job);
      
      // Check if there are follow-up jobs
      await this.createFollowUpJobs(job);
      
    } catch (error) {
      job.attempts++;
      job.error = error instanceof Error ? error.message : 'Unknown error';
      
      if (job.attempts < job.maxAttempts) {
        // Retry job
        job.status = 'pending';
        this.enqueueJob(job);
        this.emit('job:retry', job);
      } else {
        // Job failed permanently
        job.status = 'failed';
        job.completedAt = new Date();
        
        // Update video status to error
        await Video.updateStatus(job.videoId, 'error', job.error);
        
        this.emit('job:failed', job);
      }
    } finally {
      this.activeJobs.delete(job.id);
    }
  }

  /**
   * Execute a specific job
   */
  private async executeJob(job: ProcessingJob): Promise<void> {
    switch (job.type) {
      case 'extract_frames':
        await this.executeFrameExtraction(job);
        break;
      
      case 'analyze_frames':
        await this.executeFrameAnalysis(job);
        break;
      
      case 'generate_intelligence':
        await this.executeIntelligenceGeneration(job);
        break;
      
      case 'complete':
        await this.executeCompletion(job);
        break;
      
      default:
        throw new Error(`Unknown job type: ${job.type}`);
    }
  }

  /**
   * Execute frame extraction job
   */
  private async executeFrameExtraction(job: ProcessingJob): Promise<void> {
    const { frameInterval, maxFrames, generateThumbnails } = job.data;
    
    // Extract metadata first
    await metadataExtractionService.updateVideoMetadata(job.videoId);
    job.progress = 20;
    this.emit('job:progress', job);
    
    // Extract frames
    const frames = await frameExtractionService.extractFrames(job.videoId, {
      intervalSeconds: frameInterval,
      maxFrames,
      generateThumbnails
    });
    
    job.progress = 80;
    this.emit('job:progress', job);
    
    // Store frame count in job data for next steps
    job.data.extractedFrames = frames.length;
    
    console.log(`Extracted ${frames.length} frames from video ${job.videoId}`);
  }

  /**
   * Execute frame analysis job (placeholder for AI analysis)
   */
  private async executeFrameAnalysis(job: ProcessingJob): Promise<void> {
    // This would call the AI analysis service
    // For now, just updating progress
    job.progress = 50;
    this.emit('job:progress', job);
    
    // Simulate analysis
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    job.progress = 100;
    console.log(`Analyzed frames for video ${job.videoId}`);
  }

  /**
   * Execute intelligence generation job
   */
  private async executeIntelligenceGeneration(job: ProcessingJob): Promise<void> {
    // This would generate video intelligence data
    // For now, just updating progress
    job.progress = 50;
    this.emit('job:progress', job);
    
    // Simulate processing
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    job.progress = 100;
    console.log(`Generated intelligence for video ${job.videoId}`);
  }

  /**
   * Execute completion job
   */
  private async executeCompletion(job: ProcessingJob): Promise<void> {
    // Update video status to complete
    await Video.updateStatus(job.videoId, 'complete');
    
    // Clean up temporary files
    const stats = await frameStorageService.getStorageStats();
    console.log(`Video ${job.videoId} processing complete. Storage: ${stats.totalSizeMB.toFixed(2)}MB`);
  }

  /**
   * Create follow-up jobs based on completed job
   */
  private async createFollowUpJobs(completedJob: ProcessingJob): Promise<void> {
    const { analyzeFrames, generateIntelligence } = completedJob.data;
    
    if (completedJob.type === 'extract_frames' && analyzeFrames) {
      // Create frame analysis job
      const analysisJob: ProcessingJob = {
        ...completedJob,
        id: `job_${Date.now()}_analysis`,
        type: 'analyze_frames',
        status: 'pending',
        attempts: 0,
        createdAt: new Date(),
        startedAt: undefined,
        completedAt: undefined,
        error: undefined,
        progress: 0
      };
      this.enqueueJob(analysisJob);
      
    } else if (completedJob.type === 'analyze_frames' && generateIntelligence) {
      // Create intelligence generation job
      const intelligenceJob: ProcessingJob = {
        ...completedJob,
        id: `job_${Date.now()}_intelligence`,
        type: 'generate_intelligence',
        status: 'pending',
        attempts: 0,
        createdAt: new Date(),
        startedAt: undefined,
        completedAt: undefined,
        error: undefined,
        progress: 0
      };
      this.enqueueJob(intelligenceJob);
      
    } else if (completedJob.type === 'generate_intelligence' || 
               (completedJob.type === 'analyze_frames' && !generateIntelligence) ||
               (completedJob.type === 'extract_frames' && !analyzeFrames)) {
      // Create completion job
      const completionJob: ProcessingJob = {
        ...completedJob,
        id: `job_${Date.now()}_complete`,
        type: 'complete',
        status: 'pending',
        attempts: 0,
        createdAt: new Date(),
        startedAt: undefined,
        completedAt: undefined,
        error: undefined,
        progress: 0
      };
      this.enqueueJob(completionJob);
    }
  }

  /**
   * Get queue status
   */
  getQueueStatus(): {
    isProcessing: boolean;
    pendingJobs: number;
    activeJobs: number;
    totalJobs: number;
    jobs: ProcessingJob[];
  } {
    return {
      isProcessing: this.isProcessing,
      pendingJobs: this.queue.length,
      activeJobs: this.activeJobs.size,
      totalJobs: this.queue.length + this.activeJobs.size,
      jobs: [...this.queue, ...Array.from(this.activeJobs.values())]
    };
  }

  /**
   * Get job by ID
   */
  getJob(jobId: string): ProcessingJob | undefined {
    // Check active jobs
    const activeJob = this.activeJobs.get(jobId);
    if (activeJob) return activeJob;
    
    // Check queue
    return this.queue.find(j => j.id === jobId);
  }

  /**
   * Cancel a job
   */
  cancelJob(jobId: string): boolean {
    // Remove from queue if pending
    const queueIndex = this.queue.findIndex(j => j.id === jobId);
    if (queueIndex !== -1) {
      const job = this.queue.splice(queueIndex, 1)[0];
      this.emit('job:cancelled', job);
      return true;
    }
    
    // Cannot cancel active jobs
    if (this.activeJobs.has(jobId)) {
      console.warn(`Cannot cancel active job ${jobId}`);
      return false;
    }
    
    return false;
  }

  /**
   * Clear all pending jobs
   */
  clearQueue(): number {
    const count = this.queue.length;
    this.queue = [];
    this.emit('queue:cleared', count);
    return count;
  }

  /**
   * Retry failed jobs for a video
   */
  async retryVideo(videoId: string): Promise<void> {
    // Update video status back to processing
    await Video.updateStatus(videoId, 'processing');
    
    // Add video back to queue
    await this.addVideo(videoId);
  }

  /**
   * Get processing statistics
   */
  async getProcessingStats(): Promise<{
    totalProcessed: number;
    averageProcessingTime: number;
    successRate: number;
    queueLength: number;
  }> {
    // This would query historical job data
    // For now, returning current stats
    return {
      totalProcessed: 0, // Would query from database
      averageProcessingTime: 0, // Would calculate from job history
      successRate: 0, // Would calculate from success/failure ratio
      queueLength: this.queue.length
    };
  }
}

export const processingQueue = VideoProcessingQueue.getInstance();