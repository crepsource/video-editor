import { testDataManager } from '../utils/testDataManager';
import { testReporter } from '../utils/testReporter';

export class TestSetup {
  private static instance: TestSetup;
  private isInitialized: boolean = false;

  public static getInstance(): TestSetup {
    if (!TestSetup.instance) {
      TestSetup.instance = new TestSetup();
    }
    return TestSetup.instance;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    console.log('🚀 Initializing test environment...');
    
    try {
      // Initialize test data manager
      await testDataManager.initialize();
      console.log('✅ Test data manager initialized');

      // Reset test reporter for fresh session
      testReporter.reset();
      console.log('✅ Test reporter initialized');

      this.isInitialized = true;
      console.log('🎉 Test environment ready!');
    } catch (error) {
      console.error('❌ Failed to initialize test environment:', error);
      throw error;
    }
  }

  async cleanup(): Promise<void> {
    console.log('🧹 Cleaning up test environment...');
    
    try {
      // Generate final reports
      await this.generateFinalReports();
      
      // Clean up test data
      await testDataManager.cleanup();
      console.log('✅ Test data cleaned up');

      this.isInitialized = false;
      console.log('🎉 Test environment cleanup complete!');
    } catch (error) {
      console.error('⚠️  Error during cleanup:', error);
    }
  }

  private async generateFinalReports(): Promise<void> {
    try {
      console.log('📊 Generating test reports...');
      
      // Print console summary
      testReporter.printSummary();
      
      // Generate HTML report
      const htmlPath = await testReporter.generateHtmlReport();
      console.log(`📄 HTML report generated: ${htmlPath}`);
      
      // Generate JSON report
      const jsonPath = await testReporter.generateJsonReport();
      console.log(`📄 JSON report generated: ${jsonPath}`);
      
      // Try to generate coverage report
      const coveragePath = await testReporter.generateCoverageReport();
      if (coveragePath) {
        console.log(`📄 Coverage report generated: ${coveragePath}`);
      }
      
    } catch (error) {
      console.error('⚠️  Error generating reports:', error);
    }
  }

  isReady(): boolean {
    return this.isInitialized;
  }
}

export const testSetup = TestSetup.getInstance();

// Global setup for Jest
export default async function globalSetup(): Promise<void> {
  await testSetup.initialize();
}

// Global teardown for Jest
export async function globalTeardown(): Promise<void> {
  await testSetup.cleanup();
}