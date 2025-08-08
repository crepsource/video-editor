/** @type {import('jest').Config} */
module.exports = {
  // Test environment
  testEnvironment: 'node',

  // TypeScript support
  preset: 'ts-jest',
  
  // Test file patterns
  testMatch: [
    '**/tests/**/*.test.ts',
    '**/tests/**/*.spec.ts',
    '**/__tests__/**/*.ts',
    '**/*.(test|spec).ts'
  ],

  // Ignore patterns
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/coverage/'
  ],

  // Module resolution
  moduleFileExtensions: ['ts', 'js', 'json'],
  roots: ['<rootDir>/src'],
  
  // Transform configuration
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },

  // Setup files
  setupFilesAfterEnv: [
    '<rootDir>/jest.setup.js',
    '<rootDir>/src/tests/setup/jest.setup.ts'
  ],

  // Coverage configuration
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: [
    'text',
    'lcov',
    'html',
    'json'
  ],
  
  collectCoverageFrom: [
    'src/services/**/*.ts',
    'src/utils/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts',
    '!src/tests/**/*',
    '!src/**/index.ts'
  ],
  
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 80,
      lines: 80,
      statements: 80
    },
    './src/services/': {
      branches: 75,
      functions: 85,
      lines: 85,
      statements: 85
    }
  },

  // Timeout configuration
  testTimeout: 60000, // 60 seconds for comprehensive tests

  // Verbose output
  verbose: true,

  // Detect open handles
  detectOpenHandles: true,
  forceExit: true,

  // Error handling
  errorOnDeprecated: true,

  // Performance monitoring
  logHeapUsage: true,

  // Module path mapping
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@models/(.*)$': '<rootDir>/src/models/$1',
    '^@services/(.*)$': '<rootDir>/src/services/$1',
    '^@utils/(.*)$': '<rootDir>/src/utils/$1',
    '^@types/(.*)$': '<rootDir>/src/types/$1',
    '^@tests/(.*)$': '<rootDir>/src/tests/$1'
  },

  // Global variables available in tests
  globals: {
    'ts-jest': {
      tsconfig: {
        compilerOptions: {
          module: 'commonjs',
          target: 'es2020',
          lib: ['es2020'],
          moduleResolution: 'node',
          allowSyntheticDefaultImports: true,
          esModuleInterop: true,
          skipLibCheck: true,
          strict: true
        }
      }
    }
  },

  // Cache configuration
  cacheDirectory: '<rootDir>/.jest-cache',
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true
};