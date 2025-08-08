// Jest setup file for global test configurations
global.console = {
  ...console,
  // Uncomment to ignore specific console methods in tests
  // warn: jest.fn(),
  // error: jest.fn(),
  // log: jest.fn(),
};