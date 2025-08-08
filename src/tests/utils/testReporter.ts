import fs from 'fs';
import path from 'path';

export interface TestResult {
  testSuite: string;
  testName: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  error?: string;
  metadata?: Record<string, any>;
}

export interface PerformanceMetric {
  testSuite: string;
  testName: string;
  metric: string;
  value: number;
  unit: string;
  timestamp: Date;
  threshold?: number;
  passed?: boolean;
}

export interface TestSummary {
  totalTests: number;
  passedTests: number;
  failedTests: number;
  skippedTests: number;
  totalDuration: number;
  passRate: number;
  averageTestTime: number;
  fastestTest: TestResult | null;
  slowestTest: TestResult | null;
  failedTests: TestResult[];
}

export interface PerformanceSummary {
  totalMetrics: number;
  passedMetrics: number;
  failedMetrics: number;
  averagePerformance: Record<string, number>;
  performanceBreaches: PerformanceMetric[];
  performanceTrends: Record<string, PerformanceMetric[]>;
}

export class TestReporter {
  private static instance: TestReporter;
  private testResults: TestResult[] = [];
  private performanceMetrics: PerformanceMetric[] = [];
  private reportsDir: string;
  private startTime: Date;

  constructor(reportsDir: string = path.join(__dirname, '../reports')) {
    this.reportsDir = reportsDir;
    this.startTime = new Date();
    this.ensureReportsDirectory();
  }

  public static getInstance(reportsDir?: string): TestReporter {
    if (!TestReporter.instance) {
      TestReporter.instance = new TestReporter(reportsDir);
    }
    return TestReporter.instance;
  }

  private ensureReportsDirectory(): void {
    if (!fs.existsSync(this.reportsDir)) {
      fs.mkdirSync(this.reportsDir, { recursive: true });
    }
  }

  recordTestResult(result: TestResult): void {
    this.testResults.push(result);
    
    // Log to console for immediate feedback
    const status = result.status === 'passed' ? '✅' : result.status === 'failed' ? '❌' : '⏭️';
    console.log(`${status} ${result.testSuite} > ${result.testName} (${result.duration}ms)`);
    
    if (result.error) {
      console.error(`   Error: ${result.error}`);
    }
  }

  recordPerformanceMetric(metric: PerformanceMetric): void {
    this.performanceMetrics.push(metric);
    
    const status = metric.passed !== false ? '📊' : '⚠️';
    console.log(`${status} ${metric.testSuite} > ${metric.metric}: ${metric.value} ${metric.unit}`);
    
    if (metric.threshold && metric.value > metric.threshold) {
      console.warn(`   ⚠️  Performance threshold exceeded! Expected: <${metric.threshold} ${metric.unit}`);
    }
  }

  generateTestSummary(): TestSummary {
    const totalTests = this.testResults.length;
    const passedTests = this.testResults.filter(r => r.status === 'passed').length;
    const failedTests = this.testResults.filter(r => r.status === 'failed');
    const skippedTests = this.testResults.filter(r => r.status === 'skipped').length;
    const totalDuration = this.testResults.reduce((sum, r) => sum + r.duration, 0);
    
    let fastestTest: TestResult | null = null;
    let slowestTest: TestResult | null = null;
    
    if (this.testResults.length > 0) {
      fastestTest = this.testResults.reduce((fastest, current) => 
        current.duration < fastest.duration ? current : fastest
      );
      slowestTest = this.testResults.reduce((slowest, current) => 
        current.duration > slowest.duration ? current : slowest
      );
    }

    return {
      totalTests,
      passedTests,
      failedTests: failedTests.length,
      skippedTests,
      totalDuration,
      passRate: totalTests > 0 ? (passedTests / totalTests) * 100 : 0,
      averageTestTime: totalTests > 0 ? totalDuration / totalTests : 0,
      fastestTest,
      slowestTest,
      failedTests: failedTests
    };
  }

  generatePerformanceSummary(): PerformanceSummary {
    const totalMetrics = this.performanceMetrics.length;
    const passedMetrics = this.performanceMetrics.filter(m => m.passed !== false).length;
    const failedMetrics = totalMetrics - passedMetrics;
    
    // Group metrics by type for averaging
    const metricGroups = this.performanceMetrics.reduce((groups, metric) => {
      if (!groups[metric.metric]) {
        groups[metric.metric] = [];
      }
      groups[metric.metric].push(metric.value);
      return groups;
    }, {} as Record<string, number[]>);

    const averagePerformance = Object.entries(metricGroups).reduce((avg, [metric, values]) => {
      avg[metric] = values.reduce((sum, val) => sum + val, 0) / values.length;
      return avg;
    }, {} as Record<string, number>);

    const performanceBreaches = this.performanceMetrics.filter(m => 
      m.threshold && m.value > m.threshold
    );

    // Group by metric for trend analysis
    const performanceTrends = this.performanceMetrics.reduce((trends, metric) => {
      if (!trends[metric.metric]) {
        trends[metric.metric] = [];
      }
      trends[metric.metric].push(metric);
      return trends;
    }, {} as Record<string, PerformanceMetric[]>);

    return {
      totalMetrics,
      passedMetrics,
      failedMetrics,
      averagePerformance,
      performanceBreaches,
      performanceTrends
    };
  }

  async generateHtmlReport(): Promise<string> {
    const testSummary = this.generateTestSummary();
    const performanceSummary = this.generatePerformanceSummary();
    const timestamp = new Date().toISOString();
    
    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Video Editor Test Report</title>
        <style>
            body { 
                font-family: Arial, sans-serif; 
                margin: 20px; 
                background-color: #f5f5f5; 
            }
            .container { 
                max-width: 1200px; 
                margin: 0 auto; 
                background: white; 
                padding: 20px; 
                border-radius: 8px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
            h1, h2 { 
                color: #333; 
                border-bottom: 2px solid #4CAF50;
                padding-bottom: 10px;
            }
            .summary { 
                display: grid; 
                grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); 
                gap: 15px; 
                margin: 20px 0; 
            }
            .metric { 
                background: #f9f9f9; 
                padding: 15px; 
                border-radius: 5px; 
                text-align: center;
                border-left: 4px solid #4CAF50;
            }
            .metric.failed { border-left-color: #f44336; }
            .metric.warning { border-left-color: #ff9800; }
            .metric-value { 
                font-size: 2em; 
                font-weight: bold; 
                color: #333; 
            }
            .metric-label { 
                color: #666; 
                font-size: 0.9em; 
            }
            table { 
                width: 100%; 
                border-collapse: collapse; 
                margin: 20px 0; 
            }
            th, td { 
                border: 1px solid #ddd; 
                padding: 12px; 
                text-align: left; 
            }
            th { 
                background-color: #4CAF50; 
                color: white; 
            }
            tr:nth-child(even) { 
                background-color: #f2f2f2; 
            }
            .status-passed { color: #4CAF50; font-weight: bold; }
            .status-failed { color: #f44336; font-weight: bold; }
            .status-skipped { color: #ff9800; font-weight: bold; }
            .error { 
                background: #ffebee; 
                padding: 10px; 
                border-left: 4px solid #f44336; 
                margin: 10px 0;
                font-family: monospace;
                white-space: pre-wrap;
            }
            .progress-bar {
                width: 100%;
                height: 20px;
                background-color: #ddd;
                border-radius: 10px;
                overflow: hidden;
                margin: 10px 0;
            }
            .progress-fill {
                height: 100%;
                background-color: #4CAF50;
                transition: width 0.3s ease;
            }
            .chart-container {
                margin: 20px 0;
                padding: 20px;
                background: #f9f9f9;
                border-radius: 5px;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>Video Editor Test Report</h1>
            <p><strong>Generated:</strong> ${timestamp}</p>
            <p><strong>Test Duration:</strong> ${Math.round((new Date().getTime() - this.startTime.getTime()) / 1000)}s</p>
            
            <h2>Test Summary</h2>
            <div class="summary">
                <div class="metric">
                    <div class="metric-value">${testSummary.totalTests}</div>
                    <div class="metric-label">Total Tests</div>
                </div>
                <div class="metric">
                    <div class="metric-value">${testSummary.passedTests}</div>
                    <div class="metric-label">Passed</div>
                </div>
                <div class="metric ${testSummary.failedTests > 0 ? 'failed' : ''}">
                    <div class="metric-value">${testSummary.failedTests}</div>
                    <div class="metric-label">Failed</div>
                </div>
                <div class="metric ${testSummary.skippedTests > 0 ? 'warning' : ''}">
                    <div class="metric-value">${testSummary.skippedTests}</div>
                    <div class="metric-label">Skipped</div>
                </div>
                <div class="metric">
                    <div class="metric-value">${testSummary.passRate.toFixed(1)}%</div>
                    <div class="metric-label">Pass Rate</div>
                </div>
                <div class="metric">
                    <div class="metric-value">${testSummary.averageTestTime.toFixed(0)}ms</div>
                    <div class="metric-label">Avg Test Time</div>
                </div>
            </div>

            <div class="progress-bar">
                <div class="progress-fill" style="width: ${testSummary.passRate}%"></div>
            </div>

            <h2>Performance Summary</h2>
            <div class="summary">
                <div class="metric">
                    <div class="metric-value">${performanceSummary.totalMetrics}</div>
                    <div class="metric-label">Performance Metrics</div>
                </div>
                <div class="metric ${performanceSummary.failedMetrics > 0 ? 'failed' : ''}">
                    <div class="metric-value">${performanceSummary.failedMetrics}</div>
                    <div class="metric-label">Breaches</div>
                </div>
            </div>

            ${testSummary.failedTests.length > 0 ? `
            <h2>Failed Tests</h2>
            <table>
                <thead>
                    <tr>
                        <th>Test Suite</th>
                        <th>Test Name</th>
                        <th>Duration</th>
                        <th>Error</th>
                    </tr>
                </thead>
                <tbody>
                    ${testSummary.failedTests.map(test => `
                        <tr>
                            <td>${test.testSuite}</td>
                            <td>${test.testName}</td>
                            <td>${test.duration}ms</td>
                            <td>${test.error || 'No error message'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            ` : ''}

            ${performanceSummary.performanceBreaches.length > 0 ? `
            <h2>Performance Breaches</h2>
            <table>
                <thead>
                    <tr>
                        <th>Test Suite</th>
                        <th>Metric</th>
                        <th>Value</th>
                        <th>Threshold</th>
                        <th>Breach</th>
                    </tr>
                </thead>
                <tbody>
                    ${performanceSummary.performanceBreaches.map(metric => `
                        <tr>
                            <td>${metric.testSuite}</td>
                            <td>${metric.metric}</td>
                            <td>${metric.value} ${metric.unit}</td>
                            <td>${metric.threshold} ${metric.unit}</td>
                            <td class="status-failed">${((metric.value / (metric.threshold || 1) - 1) * 100).toFixed(1)}%</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            ` : ''}

            <h2>All Test Results</h2>
            <table>
                <thead>
                    <tr>
                        <th>Test Suite</th>
                        <th>Test Name</th>
                        <th>Status</th>
                        <th>Duration</th>
                    </tr>
                </thead>
                <tbody>
                    ${this.testResults.map(test => `
                        <tr>
                            <td>${test.testSuite}</td>
                            <td>${test.testName}</td>
                            <td class="status-${test.status}">${test.status.toUpperCase()}</td>
                            <td>${test.duration}ms</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>

            <h2>Performance Averages</h2>
            <div class="chart-container">
                ${Object.entries(performanceSummary.averagePerformance).map(([metric, avg]) => `
                    <div style="margin: 10px 0;">
                        <strong>${metric}:</strong> ${avg.toFixed(2)}ms
                    </div>
                `).join('')}
            </div>
        </div>
    </body>
    </html>`;

    const reportPath = path.join(this.reportsDir, `test-report-${timestamp.replace(/[:.]/g, '-')}.html`);
    await fs.promises.writeFile(reportPath, html);
    
    return reportPath;
  }

  async generateJsonReport(): Promise<string> {
    const report = {
      metadata: {
        timestamp: new Date().toISOString(),
        testDuration: new Date().getTime() - this.startTime.getTime(),
        environment: {
          nodeVersion: process.version,
          platform: process.platform,
          arch: process.arch
        }
      },
      summary: this.generateTestSummary(),
      performance: this.generatePerformanceSummary(),
      testResults: this.testResults,
      performanceMetrics: this.performanceMetrics
    };

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportPath = path.join(this.reportsDir, `test-report-${timestamp}.json`);
    
    await fs.promises.writeFile(reportPath, JSON.stringify(report, null, 2));
    
    return reportPath;
  }

  async generateCoverageReport(): Promise<string | null> {
    // This would integrate with Jest coverage if available
    try {
      const coveragePath = path.join(process.cwd(), 'coverage/coverage-final.json');
      
      if (fs.existsSync(coveragePath)) {
        const coverage = JSON.parse(fs.readFileSync(coveragePath, 'utf-8'));
        
        const coverageReport = {
          timestamp: new Date().toISOString(),
          coverage: coverage,
          summary: this.calculateCoverageSummary(coverage)
        };

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const reportPath = path.join(this.reportsDir, `coverage-report-${timestamp}.json`);
        
        await fs.promises.writeFile(reportPath, JSON.stringify(coverageReport, null, 2));
        return reportPath;
      }
    } catch (error) {
      console.warn('Could not generate coverage report:', error);
    }
    
    return null;
  }

  private calculateCoverageSummary(coverage: any): any {
    const files = Object.keys(coverage);
    let totalStatements = 0;
    let coveredStatements = 0;
    let totalBranches = 0;
    let coveredBranches = 0;
    let totalFunctions = 0;
    let coveredFunctions = 0;
    let totalLines = 0;
    let coveredLines = 0;

    files.forEach(file => {
      const fileCoverage = coverage[file];
      
      totalStatements += Object.keys(fileCoverage.s || {}).length;
      coveredStatements += Object.values(fileCoverage.s || {}).filter((v: any) => v > 0).length;
      
      totalBranches += Object.keys(fileCoverage.b || {}).length;
      coveredBranches += Object.values(fileCoverage.b || {}).filter((branch: any) => 
        Array.isArray(branch) && branch.some(b => b > 0)
      ).length;
      
      totalFunctions += Object.keys(fileCoverage.f || {}).length;
      coveredFunctions += Object.values(fileCoverage.f || {}).filter((v: any) => v > 0).length;
    });

    return {
      statements: {
        total: totalStatements,
        covered: coveredStatements,
        percentage: totalStatements > 0 ? (coveredStatements / totalStatements) * 100 : 0
      },
      branches: {
        total: totalBranches,
        covered: coveredBranches,
        percentage: totalBranches > 0 ? (coveredBranches / totalBranches) * 100 : 0
      },
      functions: {
        total: totalFunctions,
        covered: coveredFunctions,
        percentage: totalFunctions > 0 ? (coveredFunctions / totalFunctions) * 100 : 0
      }
    };
  }

  printSummary(): void {
    const testSummary = this.generateTestSummary();
    const performanceSummary = this.generatePerformanceSummary();

    console.log('\n' + '='.repeat(80));
    console.log('                      VIDEO EDITOR TEST SUMMARY');
    console.log('='.repeat(80));
    
    console.log(`\n📊 Test Results:`);
    console.log(`   Total Tests: ${testSummary.totalTests}`);
    console.log(`   ✅ Passed: ${testSummary.passedTests}`);
    console.log(`   ❌ Failed: ${testSummary.failedTests}`);
    console.log(`   ⏭️  Skipped: ${testSummary.skippedTests}`);
    console.log(`   📈 Pass Rate: ${testSummary.passRate.toFixed(1)}%`);
    console.log(`   ⏱️  Average Test Time: ${testSummary.averageTestTime.toFixed(0)}ms`);
    console.log(`   🏃 Fastest Test: ${testSummary.fastestTest?.duration}ms`);
    console.log(`   🐌 Slowest Test: ${testSummary.slowestTest?.duration}ms`);

    console.log(`\n⚡ Performance Metrics:`);
    console.log(`   Total Metrics: ${performanceSummary.totalMetrics}`);
    console.log(`   ✅ Passed: ${performanceSummary.passedMetrics}`);
    console.log(`   ⚠️  Breaches: ${performanceSummary.failedMetrics}`);

    if (performanceSummary.performanceBreaches.length > 0) {
      console.log(`\n⚠️  Performance Issues:`);
      performanceSummary.performanceBreaches.forEach(metric => {
        const breach = ((metric.value / (metric.threshold || 1) - 1) * 100).toFixed(1);
        console.log(`   • ${metric.testSuite} - ${metric.metric}: ${metric.value}${metric.unit} (${breach}% over threshold)`);
      });
    }

    if (testSummary.failedTests.length > 0) {
      console.log(`\n❌ Failed Tests:`);
      testSummary.failedTests.forEach(test => {
        console.log(`   • ${test.testSuite} > ${test.testName}`);
        if (test.error) {
          console.log(`     Error: ${test.error}`);
        }
      });
    }

    console.log('\n' + '='.repeat(80));
  }

  reset(): void {
    this.testResults = [];
    this.performanceMetrics = [];
    this.startTime = new Date();
  }

  getReportsDirectory(): string {
    return this.reportsDir;
  }
}

export const testReporter = TestReporter.getInstance();