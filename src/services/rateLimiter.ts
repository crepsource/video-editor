interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  keyGenerator?: (context?: any) => string;
}

interface RateLimitInfo {
  totalRequests: number;
  remainingRequests: number;
  resetTime: number;
  retryAfter?: number;
}

interface RequestRecord {
  timestamps: number[];
  lastCleanup: number;
}

export class RateLimiter {
  private requestRecords: Map<string, RequestRecord> = new Map();
  private config: RateLimitConfig;

  constructor(config: RateLimitConfig) {
    this.config = {
      keyGenerator: () => 'default',
      ...config
    };
  }

  /**
   * Check if a request is allowed and update the counter
   */
  async checkLimit(context?: any): Promise<{
    allowed: boolean;
    info: RateLimitInfo;
  }> {
    const key = this.config.keyGenerator!(context);
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    // Get or create record for this key
    let record = this.requestRecords.get(key);
    if (!record) {
      record = { timestamps: [], lastCleanup: now };
      this.requestRecords.set(key, record);
    }

    // Clean up old timestamps (older than window)
    if (now - record.lastCleanup > this.config.windowMs / 4) {
      record.timestamps = record.timestamps.filter(ts => ts > windowStart);
      record.lastCleanup = now;
    }

    // Count current requests in window
    const currentRequests = record.timestamps.filter(ts => ts > windowStart).length;
    const remainingRequests = Math.max(0, this.config.maxRequests - currentRequests);
    
    const allowed = currentRequests < this.config.maxRequests;
    
    if (allowed) {
      record.timestamps.push(now);
    }

    // Calculate reset time (when the oldest request in window expires)
    const oldestInWindow = record.timestamps.find(ts => ts > windowStart);
    const resetTime = oldestInWindow ? oldestInWindow + this.config.windowMs : now + this.config.windowMs;
    
    // Calculate retry after time if limit exceeded
    let retryAfter: number | undefined;
    if (!allowed && oldestInWindow) {
      retryAfter = Math.max(0, Math.ceil((oldestInWindow + this.config.windowMs - now) / 1000));
    }

    return {
      allowed,
      info: {
        totalRequests: currentRequests,
        remainingRequests: allowed ? remainingRequests - 1 : remainingRequests,
        resetTime,
        retryAfter
      }
    };
  }

  /**
   * Wait until a request is allowed
   */
  async waitForAvailableSlot(context?: any): Promise<void> {
    const result = await this.checkLimit(context);
    
    if (!result.allowed && result.info.retryAfter) {
      const waitTime = result.info.retryAfter * 1000;
      console.log(`Rate limit exceeded. Waiting ${waitTime}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  /**
   * Get current rate limit status
   */
  async getStatus(context?: any): Promise<RateLimitInfo> {
    const key = this.config.keyGenerator!(context);
    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    
    const record = this.requestRecords.get(key);
    if (!record) {
      return {
        totalRequests: 0,
        remainingRequests: this.config.maxRequests,
        resetTime: now + this.config.windowMs
      };
    }

    const currentRequests = record.timestamps.filter(ts => ts > windowStart).length;
    const remainingRequests = Math.max(0, this.config.maxRequests - currentRequests);
    
    const oldestInWindow = record.timestamps.find(ts => ts > windowStart);
    const resetTime = oldestInWindow ? oldestInWindow + this.config.windowMs : now + this.config.windowMs;

    return {
      totalRequests: currentRequests,
      remainingRequests,
      resetTime
    };
  }

  /**
   * Reset rate limits for a specific key or all keys
   */
  reset(context?: any): void {
    if (context) {
      const key = this.config.keyGenerator!(context);
      this.requestRecords.delete(key);
    } else {
      this.requestRecords.clear();
    }
  }

  /**
   * Clean up old records to prevent memory leaks
   */
  cleanup(): void {
    const now = Date.now();
    const cutoff = now - (this.config.windowMs * 2);
    
    for (const [key, record] of this.requestRecords.entries()) {
      // Remove records that haven't been used recently
      if (record.lastCleanup < cutoff && record.timestamps.length === 0) {
        this.requestRecords.delete(key);
      } else {
        // Clean timestamps
        record.timestamps = record.timestamps.filter(ts => ts > cutoff);
      }
    }
  }

  /**
   * Get configuration
   */
  getConfig(): RateLimitConfig {
    return { ...this.config };
  }
}

/**
 * OpenAI-specific rate limiter configurations
 */
export class OpenAIRateLimiter extends RateLimiter {
  private static instance: OpenAIRateLimiter;

  private constructor() {
    const maxRequestsPerMinute = parseInt(process.env.MAX_API_REQUESTS_PER_MINUTE || '60');
    
    super({
      maxRequests: maxRequestsPerMinute,
      windowMs: 60 * 1000, // 1 minute
      keyGenerator: (model?: string) => `openai_${model || 'default'}`
    });

    // Setup cleanup interval
    setInterval(() => this.cleanup(), 5 * 60 * 1000); // Cleanup every 5 minutes
  }

  public static getInstance(): OpenAIRateLimiter {
    if (!OpenAIRateLimiter.instance) {
      OpenAIRateLimiter.instance = new OpenAIRateLimiter();
    }
    return OpenAIRateLimiter.instance;
  }

  /**
   * Check if an OpenAI request is allowed for a specific model
   */
  async checkOpenAILimit(model?: string): Promise<{
    allowed: boolean;
    info: RateLimitInfo;
  }> {
    return this.checkLimit(model);
  }

  /**
   * Wait for OpenAI API availability
   */
  async waitForOpenAI(model?: string): Promise<void> {
    return this.waitForAvailableSlot(model);
  }

  /**
   * Get OpenAI rate limit status
   */
  async getOpenAIStatus(model?: string): Promise<RateLimitInfo> {
    return this.getStatus(model);
  }
}

/**
 * Multi-tier rate limiter for different request types
 */
export class TieredRateLimiter {
  private limiters: Map<string, RateLimiter> = new Map();

  constructor(private configs: Record<string, RateLimitConfig>) {
    for (const [tier, config] of Object.entries(configs)) {
      this.limiters.set(tier, new RateLimiter(config));
    }
  }

  /**
   * Check limit for a specific tier
   */
  async checkTierLimit(tier: string, context?: any): Promise<{
    allowed: boolean;
    info: RateLimitInfo;
  }> {
    const limiter = this.limiters.get(tier);
    if (!limiter) {
      throw new Error(`Unknown tier: ${tier}`);
    }

    return limiter.checkLimit(context);
  }

  /**
   * Wait for availability on a specific tier
   */
  async waitForTier(tier: string, context?: any): Promise<void> {
    const limiter = this.limiters.get(tier);
    if (!limiter) {
      throw new Error(`Unknown tier: ${tier}`);
    }

    return limiter.waitForAvailableSlot(context);
  }

  /**
   * Get status for all tiers
   */
  async getAllTierStatus(context?: any): Promise<Record<string, RateLimitInfo>> {
    const status: Record<string, RateLimitInfo> = {};
    
    for (const [tier, limiter] of this.limiters.entries()) {
      status[tier] = await limiter.getStatus(context);
    }

    return status;
  }

  /**
   * Clean up all limiters
   */
  cleanup(): void {
    for (const limiter of this.limiters.values()) {
      limiter.cleanup();
    }
  }
}

/**
 * Create a default tiered rate limiter for video processing
 */
export function createVideoProcessingRateLimiter(): TieredRateLimiter {
  return new TieredRateLimiter({
    // High priority: Critical operations
    high: {
      maxRequests: 30,
      windowMs: 60 * 1000,
      keyGenerator: () => 'high_priority'
    },
    
    // Normal priority: Regular frame analysis
    normal: {
      maxRequests: 20,
      windowMs: 60 * 1000,
      keyGenerator: () => 'normal_priority'
    },
    
    // Low priority: Batch operations
    low: {
      maxRequests: 10,
      windowMs: 60 * 1000,
      keyGenerator: () => 'low_priority'
    },

    // Per-user limits
    user: {
      maxRequests: 100,
      windowMs: 60 * 1000,
      keyGenerator: (userId: string) => `user_${userId || 'anonymous'}`
    }
  });
}

export const openaiRateLimiter = OpenAIRateLimiter.getInstance();