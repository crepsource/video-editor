import fs from 'fs/promises';
import path from 'path';

export interface ModelPricing {
  inputTokenPrice: number; // Price per 1K input tokens
  outputTokenPrice: number; // Price per 1K output tokens
  imagePrice?: number; // Price per image (for vision models)
}

export interface APIUsage {
  id: string;
  timestamp: Date;
  model: string;
  inputTokens: number;
  outputTokens: number;
  imageCount: number;
  cost: number;
  userId?: string;
  videoId?: string;
  operation: string; // 'frame_analysis', 'batch_analysis', 'chat_completion'
  metadata?: Record<string, any>;
}

export interface CostSummary {
  totalCost: number;
  totalRequests: number;
  totalTokens: number;
  totalImages: number;
  averageCostPerRequest: number;
  costByModel: Record<string, number>;
  costByOperation: Record<string, number>;
  costByDate: Record<string, number>;
}

export interface BudgetAlert {
  type: 'daily' | 'weekly' | 'monthly' | 'total';
  limit: number;
  current: number;
  percentage: number;
  triggered: boolean;
}

export class CostTracker {
  private static instance: CostTracker;
  private usageData: APIUsage[] = [];
  private storagePath: string;
  
  // Current OpenAI pricing (as of late 2024)
  private modelPricing: Record<string, ModelPricing> = {
    'gpt-4-vision-preview': {
      inputTokenPrice: 0.01, // $0.01 per 1K tokens
      outputTokenPrice: 0.03, // $0.03 per 1K tokens
      imagePrice: 0.00765 // $0.00765 per image (high detail)
    },
    'gpt-4o': {
      inputTokenPrice: 0.0025,
      outputTokenPrice: 0.01,
      imagePrice: 0.007425 // Vision capability
    },
    'gpt-4o-mini': {
      inputTokenPrice: 0.00015,
      outputTokenPrice: 0.0006,
      imagePrice: 0.002975
    },
    'gpt-4': {
      inputTokenPrice: 0.03,
      outputTokenPrice: 0.06
    },
    'gpt-3.5-turbo': {
      inputTokenPrice: 0.0015,
      outputTokenPrice: 0.002
    }
  };

  private budgetLimits = {
    daily: parseFloat(process.env.DAILY_BUDGET_LIMIT || '10'),
    weekly: parseFloat(process.env.WEEKLY_BUDGET_LIMIT || '50'),
    monthly: parseFloat(process.env.MONTHLY_BUDGET_LIMIT || '200'),
    total: parseFloat(process.env.TOTAL_BUDGET_LIMIT || '1000')
  };

  private constructor() {
    this.storagePath = process.env.COST_TRACKING_PATH || './cost_tracking';
    this.initialize();
  }

  public static getInstance(): CostTracker {
    if (!CostTracker.instance) {
      CostTracker.instance = new CostTracker();
    }
    return CostTracker.instance;
  }

  /**
   * Initialize cost tracking storage
   */
  private async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.storagePath, { recursive: true });
      await this.loadUsageData();
    } catch (error) {
      console.error('Failed to initialize cost tracker:', error);
    }
  }

  /**
   * Load usage data from storage
   */
  private async loadUsageData(): Promise<void> {
    try {
      const dataFile = path.join(this.storagePath, 'usage.json');
      const data = await fs.readFile(dataFile, 'utf-8');
      this.usageData = JSON.parse(data).map((usage: any) => ({
        ...usage,
        timestamp: new Date(usage.timestamp)
      }));
    } catch (error) {
      // File doesn't exist or is corrupted, start fresh
      this.usageData = [];
    }
  }

  /**
   * Save usage data to storage
   */
  private async saveUsageData(): Promise<void> {
    try {
      const dataFile = path.join(this.storagePath, 'usage.json');
      await fs.writeFile(dataFile, JSON.stringify(this.usageData, null, 2));
    } catch (error) {
      console.error('Failed to save usage data:', error);
    }
  }

  /**
   * Record API usage and calculate cost
   */
  async recordUsage(
    model: string,
    inputTokens: number,
    outputTokens: number,
    imageCount: number = 0,
    operation: string = 'api_call',
    metadata: {
      userId?: string;
      videoId?: string;
      [key: string]: any;
    } = {}
  ): Promise<APIUsage> {
    const pricing = this.modelPricing[model];
    if (!pricing) {
      console.warn(`Unknown model pricing for: ${model}`);
      // Use default pricing based on GPT-4
      this.modelPricing[model] = this.modelPricing['gpt-4'];
    }

    const cost = this.calculateCost(model, inputTokens, outputTokens, imageCount);
    
    const usage: APIUsage = {
      id: `usage_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      model,
      inputTokens,
      outputTokens,
      imageCount,
      cost,
      operation,
      ...metadata
    };

    this.usageData.push(usage);
    await this.saveUsageData();

    // Check budget alerts
    await this.checkBudgetAlerts();

    return usage;
  }

  /**
   * Calculate cost for API usage
   */
  calculateCost(
    model: string,
    inputTokens: number,
    outputTokens: number,
    imageCount: number = 0
  ): number {
    const pricing = this.modelPricing[model] || this.modelPricing['gpt-4'];
    
    let cost = 0;
    
    // Token costs
    cost += (inputTokens / 1000) * pricing.inputTokenPrice;
    cost += (outputTokens / 1000) * pricing.outputTokenPrice;
    
    // Image costs
    if (imageCount > 0 && pricing.imagePrice) {
      cost += imageCount * pricing.imagePrice;
    }
    
    return Math.round(cost * 100000) / 100000; // Round to 5 decimal places
  }

  /**
   * Get cost summary for a date range
   */
  getCostSummary(
    startDate?: Date,
    endDate?: Date,
    filters: {
      userId?: string;
      videoId?: string;
      model?: string;
      operation?: string;
    } = {}
  ): CostSummary {
    let filteredData = this.usageData;

    // Apply date filter
    if (startDate) {
      filteredData = filteredData.filter(usage => usage.timestamp >= startDate);
    }
    if (endDate) {
      filteredData = filteredData.filter(usage => usage.timestamp <= endDate);
    }

    // Apply other filters
    if (filters.userId) {
      filteredData = filteredData.filter(usage => usage.userId === filters.userId);
    }
    if (filters.videoId) {
      filteredData = filteredData.filter(usage => usage.videoId === filters.videoId);
    }
    if (filters.model) {
      filteredData = filteredData.filter(usage => usage.model === filters.model);
    }
    if (filters.operation) {
      filteredData = filteredData.filter(usage => usage.operation === filters.operation);
    }

    const totalCost = filteredData.reduce((sum, usage) => sum + usage.cost, 0);
    const totalTokens = filteredData.reduce(
      (sum, usage) => sum + usage.inputTokens + usage.outputTokens, 
      0
    );
    const totalImages = filteredData.reduce((sum, usage) => sum + usage.imageCount, 0);

    // Group by model
    const costByModel: Record<string, number> = {};
    filteredData.forEach(usage => {
      costByModel[usage.model] = (costByModel[usage.model] || 0) + usage.cost;
    });

    // Group by operation
    const costByOperation: Record<string, number> = {};
    filteredData.forEach(usage => {
      costByOperation[usage.operation] = (costByOperation[usage.operation] || 0) + usage.cost;
    });

    // Group by date
    const costByDate: Record<string, number> = {};
    filteredData.forEach(usage => {
      const date = usage.timestamp.toISOString().split('T')[0];
      costByDate[date] = (costByDate[date] || 0) + usage.cost;
    });

    return {
      totalCost: Math.round(totalCost * 100) / 100,
      totalRequests: filteredData.length,
      totalTokens,
      totalImages,
      averageCostPerRequest: filteredData.length > 0 ? totalCost / filteredData.length : 0,
      costByModel,
      costByOperation,
      costByDate
    };
  }

  /**
   * Get daily cost summary
   */
  getDailyCost(date: Date = new Date()): CostSummary {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    return this.getCostSummary(startOfDay, endOfDay);
  }

  /**
   * Get weekly cost summary
   */
  getWeeklyCost(date: Date = new Date()): CostSummary {
    const startOfWeek = new Date(date);
    startOfWeek.setDate(date.getDate() - date.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    return this.getCostSummary(startOfWeek, endOfWeek);
  }

  /**
   * Get monthly cost summary
   */
  getMonthlyCost(date: Date = new Date()): CostSummary {
    const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
    const endOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);

    return this.getCostSummary(startOfMonth, endOfMonth);
  }

  /**
   * Check budget alerts
   */
  async checkBudgetAlerts(): Promise<BudgetAlert[]> {
    const alerts: BudgetAlert[] = [];
    
    // Daily budget check
    const dailyCost = this.getDailyCost();
    alerts.push({
      type: 'daily',
      limit: this.budgetLimits.daily,
      current: dailyCost.totalCost,
      percentage: (dailyCost.totalCost / this.budgetLimits.daily) * 100,
      triggered: dailyCost.totalCost >= this.budgetLimits.daily
    });

    // Weekly budget check
    const weeklyCost = this.getWeeklyCost();
    alerts.push({
      type: 'weekly',
      limit: this.budgetLimits.weekly,
      current: weeklyCost.totalCost,
      percentage: (weeklyCost.totalCost / this.budgetLimits.weekly) * 100,
      triggered: weeklyCost.totalCost >= this.budgetLimits.weekly
    });

    // Monthly budget check
    const monthlyCost = this.getMonthlyCost();
    alerts.push({
      type: 'monthly',
      limit: this.budgetLimits.monthly,
      current: monthlyCost.totalCost,
      percentage: (monthlyCost.totalCost / this.budgetLimits.monthly) * 100,
      triggered: monthlyCost.totalCost >= this.budgetLimits.monthly
    });

    // Total budget check
    const totalCost = this.getCostSummary();
    alerts.push({
      type: 'total',
      limit: this.budgetLimits.total,
      current: totalCost.totalCost,
      percentage: (totalCost.totalCost / this.budgetLimits.total) * 100,
      triggered: totalCost.totalCost >= this.budgetLimits.total
    });

    // Log alerts
    alerts.forEach(alert => {
      if (alert.triggered) {
        console.warn(`🚨 BUDGET ALERT: ${alert.type} limit exceeded! ${alert.current}/${alert.limit} (${alert.percentage.toFixed(1)}%)`);
      } else if (alert.percentage > 80) {
        console.warn(`⚠️  Budget warning: ${alert.type} at ${alert.percentage.toFixed(1)}% (${alert.current}/${alert.limit})`);
      }
    });

    return alerts;
  }

  /**
   * Estimate cost for planned usage
   */
  estimateCost(
    model: string,
    estimatedInputTokens: number,
    estimatedOutputTokens: number,
    estimatedImages: number = 0
  ): {
    cost: number;
    breakdown: {
      inputCost: number;
      outputCost: number;
      imageCost: number;
    };
  } {
    const pricing = this.modelPricing[model] || this.modelPricing['gpt-4'];
    
    const inputCost = (estimatedInputTokens / 1000) * pricing.inputTokenPrice;
    const outputCost = (estimatedOutputTokens / 1000) * pricing.outputTokenPrice;
    const imageCost = estimatedImages * (pricing.imagePrice || 0);
    
    return {
      cost: inputCost + outputCost + imageCost,
      breakdown: {
        inputCost,
        outputCost,
        imageCost
      }
    };
  }

  /**
   * Export usage data
   */
  async exportUsageData(
    format: 'json' | 'csv' = 'json',
    startDate?: Date,
    endDate?: Date
  ): Promise<string> {
    const summary = this.getCostSummary(startDate, endDate);
    let filteredData = this.usageData;

    if (startDate) {
      filteredData = filteredData.filter(usage => usage.timestamp >= startDate);
    }
    if (endDate) {
      filteredData = filteredData.filter(usage => usage.timestamp <= endDate);
    }

    if (format === 'json') {
      return JSON.stringify({
        summary,
        usage: filteredData
      }, null, 2);
    } else {
      // CSV format
      const headers = [
        'timestamp', 'model', 'operation', 'inputTokens', 'outputTokens', 
        'imageCount', 'cost', 'userId', 'videoId'
      ];
      
      const rows = filteredData.map(usage => [
        usage.timestamp.toISOString(),
        usage.model,
        usage.operation,
        usage.inputTokens.toString(),
        usage.outputTokens.toString(),
        usage.imageCount.toString(),
        usage.cost.toString(),
        usage.userId || '',
        usage.videoId || ''
      ]);

      return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    }
  }

  /**
   * Update model pricing
   */
  updateModelPricing(model: string, pricing: ModelPricing): void {
    this.modelPricing[model] = pricing;
  }

  /**
   * Update budget limits
   */
  updateBudgetLimits(limits: Partial<typeof this.budgetLimits>): void {
    this.budgetLimits = { ...this.budgetLimits, ...limits };
  }

  /**
   * Get current model pricing
   */
  getModelPricing(): Record<string, ModelPricing> {
    return { ...this.modelPricing };
  }

  /**
   * Get budget limits
   */
  getBudgetLimits(): typeof this.budgetLimits {
    return { ...this.budgetLimits };
  }
}

export const costTracker = CostTracker.getInstance();