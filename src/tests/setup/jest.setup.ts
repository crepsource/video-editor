import { testReporter } from '../utils/testReporter';

// Extend Jest matchers for performance testing
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeWithinPerformanceThreshold(threshold: number, unit?: string): R;
      toHaveValidAnalysisStructure(): R;
      toHaveValidScoreRange(min?: number, max?: number): R;
    }
  }
}

// Custom Jest matchers
expect.extend({
  toBeWithinPerformanceThreshold(received: number, threshold: number, unit: string = 'ms') {
    const pass = received <= threshold;
    if (pass) {
      return {
        message: () =>
          `Expected ${received}${unit} to exceed threshold ${threshold}${unit}`,
        pass: true,
      };
    } else {
      return {
        message: () =>
          `Expected ${received}${unit} to be within threshold ${threshold}${unit}`,
        pass: false,
      };
    }
  },

  toHaveValidAnalysisStructure(received: any) {
    const hasRequiredProperties = received && 
      typeof received === 'object' &&
      'analysis_confidence' in received &&
      typeof received.analysis_confidence === 'number' &&
      received.analysis_confidence >= 0 &&
      received.analysis_confidence <= 1;

    if (hasRequiredProperties) {
      return {
        message: () => `Expected object not to have valid analysis structure`,
        pass: true,
      };
    } else {
      return {
        message: () => `Expected object to have valid analysis structure with analysis_confidence between 0-1`,
        pass: false,
      };
    }
  },

  toHaveValidScoreRange(received: number, min: number = 0, max: number = 100) {
    const pass = received >= min && received <= max;
    if (pass) {
      return {
        message: () => `Expected ${received} to be outside range ${min}-${max}`,
        pass: true,
      };
    } else {
      return {
        message: () => `Expected ${received} to be within range ${min}-${max}`,
        pass: false,
      };
    }
  },
});

// Test hooks for recording results
const originalIt = global.it;
const originalTest = global.test;

function wrapTest(testFunction: typeof originalIt) {
  return function(name: string, fn: jest.ProvidesCallback | undefined, timeout?: number) {
    if (!fn) {
      return testFunction(name, fn, timeout);
    }

    return testFunction(name, async function(...args) {
      const startTime = Date.now();
      const testSuite = expect.getState().testPath?.split('/').pop()?.replace('.test.ts', '') || 'unknown';
      
      try {
        const result = await fn.apply(this, args);
        const duration = Date.now() - startTime;
        
        testReporter.recordTestResult({
          testSuite,
          testName: name,
          status: 'passed',
          duration,
        });

        return result;
      } catch (error) {
        const duration = Date.now() - startTime;
        
        testReporter.recordTestResult({
          testSuite,
          testName: name,
          status: 'failed',
          duration,
          error: error instanceof Error ? error.message : String(error),
        });

        throw error;
      }
    }, timeout);
  };
}

// Override test functions to capture results
global.it = wrapTest(originalIt) as any;
global.test = wrapTest(originalTest) as any;

// Performance tracking utility
global.trackPerformance = (testSuite: string, metric: string, value: number, unit: string = 'ms', threshold?: number) => {
  testReporter.recordPerformanceMetric({
    testSuite,
    testName: expect.getState().currentTestName || 'unknown',
    metric,
    value,
    unit,
    timestamp: new Date(),
    threshold,
    passed: threshold ? value <= threshold : true,
  });
};

// Console override for better test output formatting
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

console.log = function(...args: any[]) {
  if (process.env.NODE_ENV === 'test') {
    // Filter out excessive Sharp warnings during tests
    const message = args.join(' ');
    if (message.includes('sharp') && message.includes('warning')) {
      return;
    }
    // Add test context to logs
    const testName = expect.getState().currentTestName;
    if (testName) {
      originalConsoleLog(`[${testName}]`, ...args);
    } else {
      originalConsoleLog(...args);
    }
  } else {
    originalConsoleLog(...args);
  }
};

console.error = function(...args: any[]) {
  const testName = expect.getState().currentTestName;
  if (testName && process.env.NODE_ENV === 'test') {
    originalConsoleError(`[${testName}] ERROR:`, ...args);
  } else {
    originalConsoleError(...args);
  }
};

console.warn = function(...args: any[]) {
  if (process.env.NODE_ENV === 'test') {
    const message = args.join(' ');
    // Suppress known warnings during tests
    if (message.includes('DeprecationWarning') || 
        message.includes('ExperimentalWarning') ||
        (message.includes('sharp') && message.includes('warning'))) {
      return;
    }
    const testName = expect.getState().currentTestName;
    if (testName) {
      originalConsoleWarn(`[${testName}] WARN:`, ...args);
    } else {
      originalConsoleWarn(...args);
    }
  } else {
    originalConsoleWarn(...args);
  }
};

// Timeout settings for different test types
jest.setTimeout(60000); // Default 60 seconds

// Handle unhandled promise rejections in tests
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Record as test failure if in test context
  const testName = expect.getState().currentTestName;
  if (testName) {
    const testSuite = expect.getState().testPath?.split('/').pop()?.replace('.test.ts', '') || 'unknown';
    testReporter.recordTestResult({
      testSuite,
      testName,
      status: 'failed',
      duration: 0,
      error: `Unhandled Promise Rejection: ${reason}`,
    });
  }
});

// Memory monitoring for performance tests
let initialMemory: NodeJS.MemoryUsage;

beforeEach(() => {
  initialMemory = process.memoryUsage();
});

afterEach(() => {
  const finalMemory = process.memoryUsage();
  const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
  const testName = expect.getState().currentTestName;
  const testSuite = expect.getState().testPath?.split('/').pop()?.replace('.test.ts', '') || 'unknown';
  
  if (testName && memoryIncrease > 50 * 1024 * 1024) { // Log if memory increase > 50MB
    console.warn(`High memory usage in test: ${memoryIncrease / 1024 / 1024}MB`);
    
    testReporter.recordPerformanceMetric({
      testSuite,
      testName,
      metric: 'memory_usage',
      value: memoryIncrease / 1024 / 1024,
      unit: 'MB',
      timestamp: new Date(),
      threshold: 100, // 100MB threshold
      passed: memoryIncrease < 100 * 1024 * 1024,
    });
  }

  // Force garbage collection if available and memory usage is high
  if (global.gc && finalMemory.heapUsed > 500 * 1024 * 1024) { // 500MB
    global.gc();
  }
});

// Global test utilities
declare global {
  function trackPerformance(testSuite: string, metric: string, value: number, unit?: string, threshold?: number): void;
}

// Export common test utilities
export const testUtils = {
  createTestTimeout: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),
  
  measureExecutionTime: async <T>(fn: () => Promise<T>): Promise<{ result: T; duration: number }> => {
    const start = Date.now();
    const result = await fn();
    const duration = Date.now() - start;
    return { result, duration };
  },

  expectValidAnalysis: (analysis: any) => {
    expect(analysis).toHaveValidAnalysisStructure();
    expect(analysis.analysis_confidence).toBeGreaterThanOrEqual(0);
    expect(analysis.analysis_confidence).toBeLessThanOrEqual(1);
  },

  expectValidScores: (scores: any, min: number = 0, max: number = 100) => {
    Object.values(scores).forEach((score: any) => {
      if (typeof score === 'number') {
        expect(score).toHaveValidScoreRange(min, max);
      }
    });
  }
};