export interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  exponentialBase: number;
  jitter: boolean;
  retryCondition?: (error: Error, attempt: number) => boolean;
  onRetry?: (error: Error, attempt: number, delayMs: number) => void;
}

export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  attempts: number;
  totalTime: number;
}

export class RetryHandler {
  private static defaultOptions: RetryOptions = {
    maxAttempts: 3,
    baseDelayMs: 1000,
    maxDelayMs: 30000,
    exponentialBase: 2,
    jitter: true,
    retryCondition: (error: Error) => {
      // Default: retry on network errors, rate limits, and temporary failures
      const retryableErrors = [
        'ECONNRESET',
        'ECONNREFUSED',
        'ETIMEDOUT',
        'ENOTFOUND',
        'EHOSTUNREACH'
      ];
      
      const message = error.message.toLowerCase();
      
      // Check for specific error codes
      if (retryableErrors.some(code => message.includes(code.toLowerCase()))) {
        return true;
      }
      
      // Check for rate limiting
      if (message.includes('rate limit') || message.includes('429')) {
        return true;
      }
      
      // Check for temporary server errors
      if (message.includes('503') || message.includes('502') || message.includes('500')) {
        return true;
      }
      
      // Check for timeout errors
      if (message.includes('timeout')) {
        return true;
      }
      
      return false;
    }
  };

  /**
   * Execute a function with retry logic and exponential backoff
   */
  static async withRetry<T>(
    fn: () => Promise<T>,
    options: Partial<RetryOptions> = {}
  ): Promise<T> {
    const opts: RetryOptions = { ...this.defaultOptions, ...options };
    const startTime = Date.now();
    let lastError: Error;

    for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
      try {
        const result = await fn();
        return result;
      } catch (error) {
        lastError = error as Error;
        
        // Don't retry on the last attempt
        if (attempt === opts.maxAttempts) {
          break;
        }

        // Check if this error should be retried
        if (opts.retryCondition && !opts.retryCondition(lastError, attempt)) {
          throw lastError;
        }

        // Calculate delay with exponential backoff
        const delayMs = this.calculateDelay(attempt, opts);
        
        // Call retry callback if provided
        opts.onRetry?.(lastError, attempt, delayMs);

        // Wait before retrying
        await this.sleep(delayMs);
      }
    }

    // All retry attempts failed
    throw lastError!;
  }

  /**
   * Execute with retry and return detailed result
   */
  static async withRetryDetailed<T>(
    fn: () => Promise<T>,
    options: Partial<RetryOptions> = {}
  ): Promise<RetryResult<T>> {
    const opts: RetryOptions = { ...this.defaultOptions, ...options };
    const startTime = Date.now();
    let lastError: Error | undefined;
    let attempts = 0;

    for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
      attempts = attempt;
      
      try {
        const result = await fn();
        return {
          success: true,
          result,
          attempts,
          totalTime: Date.now() - startTime
        };
      } catch (error) {
        lastError = error as Error;
        
        // Don't retry on the last attempt
        if (attempt === opts.maxAttempts) {
          break;
        }

        // Check if this error should be retried
        if (opts.retryCondition && !opts.retryCondition(lastError, attempt)) {
          break;
        }

        // Calculate delay with exponential backoff
        const delayMs = this.calculateDelay(attempt, opts);
        
        // Call retry callback if provided
        opts.onRetry?.(lastError, attempt, delayMs);

        // Wait before retrying
        await this.sleep(delayMs);
      }
    }

    return {
      success: false,
      error: lastError,
      attempts,
      totalTime: Date.now() - startTime
    };
  }

  /**
   * Calculate delay for next retry attempt
   */
  private static calculateDelay(attempt: number, options: RetryOptions): number {
    // Calculate exponential delay
    let delay = options.baseDelayMs * Math.pow(options.exponentialBase, attempt - 1);
    
    // Apply maximum delay cap
    delay = Math.min(delay, options.maxDelayMs);
    
    // Add jitter if enabled to prevent thundering herd
    if (options.jitter) {
      delay *= (0.5 + Math.random() * 0.5); // Random between 50% and 100% of calculated delay
    }
    
    return Math.floor(delay);
  }

  /**
   * Sleep for specified milliseconds
   */
  private static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Create a retry wrapper function
   */
  static createRetryWrapper<TArgs extends any[], TReturn>(
    fn: (...args: TArgs) => Promise<TReturn>,
    options: Partial<RetryOptions> = {}
  ): (...args: TArgs) => Promise<TReturn> {
    return async (...args: TArgs): Promise<TReturn> => {
      return this.withRetry(() => fn(...args), options);
    };
  }
}

/**
 * OpenAI-specific retry handler
 */
export class OpenAIRetryHandler extends RetryHandler {
  private static openaiRetryCondition = (error: Error, attempt: number): boolean => {
    const message = error.message.toLowerCase();
    
    // Always retry rate limit errors
    if (message.includes('rate limit') || message.includes('429')) {
      return true;
    }
    
    // Retry server errors
    if (message.includes('500') || message.includes('502') || message.includes('503')) {
      return true;
    }
    
    // Retry timeout errors
    if (message.includes('timeout')) {
      return true;
    }
    
    // Retry connection errors
    if (message.includes('connection') || message.includes('network')) {
      return true;
    }
    
    // Don't retry authentication errors
    if (message.includes('unauthorized') || message.includes('401')) {
      return false;
    }
    
    // Don't retry bad request errors
    if (message.includes('400') || message.includes('invalid')) {
      return false;
    }
    
    return false;
  };

  private static openaiOptions: Partial<RetryOptions> = {
    maxAttempts: 5,
    baseDelayMs: 2000, // Start with 2 seconds
    maxDelayMs: 60000, // Max 1 minute
    exponentialBase: 2,
    jitter: true,
    retryCondition: this.openaiRetryCondition,
    onRetry: (error: Error, attempt: number, delayMs: number) => {
      console.log(
        `OpenAI API retry attempt ${attempt} after ${delayMs}ms. Error: ${error.message}`
      );
    }
  };

  /**
   * Execute OpenAI API call with retry logic
   */
  static async executeOpenAICall<T>(
    fn: () => Promise<T>,
    customOptions: Partial<RetryOptions> = {}
  ): Promise<T> {
    const options = { ...this.openaiOptions, ...customOptions };
    return this.withRetry(fn, options);
  }

  /**
   * Create OpenAI retry wrapper
   */
  static createOpenAIWrapper<TArgs extends any[], TReturn>(
    fn: (...args: TArgs) => Promise<TReturn>
  ): (...args: TArgs) => Promise<TReturn> {
    return this.createRetryWrapper(fn, this.openaiOptions);
  }
}

/**
 * Circuit breaker pattern for handling repeated failures
 */
export class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  constructor(
    private threshold: number = 5,
    private resetTimeoutMs: number = 60000
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime < this.resetTimeoutMs) {
        throw new Error('Circuit breaker is OPEN');
      } else {
        this.state = 'half-open';
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    this.state = 'closed';
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.failures >= this.threshold) {
      this.state = 'open';
      console.log(`Circuit breaker opened after ${this.failures} failures`);
    }
  }

  getState(): { state: string; failures: number; lastFailureTime: number } {
    return {
      state: this.state,
      failures: this.failures,
      lastFailureTime: this.lastFailureTime
    };
  }

  reset(): void {
    this.failures = 0;
    this.state = 'closed';
    this.lastFailureTime = 0;
  }
}

/**
 * Retry policy builder for fluent configuration
 */
export class RetryPolicyBuilder {
  private options: Partial<RetryOptions> = {};

  maxAttempts(attempts: number): RetryPolicyBuilder {
    this.options.maxAttempts = attempts;
    return this;
  }

  baseDelay(ms: number): RetryPolicyBuilder {
    this.options.baseDelayMs = ms;
    return this;
  }

  maxDelay(ms: number): RetryPolicyBuilder {
    this.options.maxDelayMs = ms;
    return this;
  }

  exponentialBase(base: number): RetryPolicyBuilder {
    this.options.exponentialBase = base;
    return this;
  }

  withJitter(enabled: boolean = true): RetryPolicyBuilder {
    this.options.jitter = enabled;
    return this;
  }

  retryOn(condition: (error: Error, attempt: number) => boolean): RetryPolicyBuilder {
    this.options.retryCondition = condition;
    return this;
  }

  onRetry(callback: (error: Error, attempt: number, delayMs: number) => void): RetryPolicyBuilder {
    this.options.onRetry = callback;
    return this;
  }

  build(): RetryOptions {
    return { ...RetryHandler['defaultOptions'], ...this.options };
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    return RetryHandler.withRetry(fn, this.options);
  }
}

// Export singleton circuit breaker for OpenAI
export const openaiCircuitBreaker = new CircuitBreaker(3, 30000);