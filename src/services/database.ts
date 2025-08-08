import { Pool, PoolClient } from 'pg';
import { config } from 'dotenv';

config();

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  max: number;
  idleTimeoutMillis: number;
}

const dbConfig: DatabaseConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'video_editor',
  user: process.env.DB_USER || 'video_admin',
  password: process.env.DB_PASSWORD || 'dev_password_2024',
  max: 20, // maximum number of clients in the pool
  idleTimeoutMillis: 30000, // close idle clients after 30 seconds
};

export class DatabaseService {
  private static instance: DatabaseService;
  private pool: Pool;

  private constructor() {
    this.pool = new Pool(dbConfig);
    
    // Handle pool errors
    this.pool.on('error', (err) => {
      console.error('Unexpected error on idle client', err);
      process.exit(-1);
    });
  }

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  /**
   * Execute a query with automatic connection handling
   */
  async query(text: string, params?: any[]): Promise<any> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(text, params);
      return result;
    } finally {
      client.release();
    }
  }

  /**
   * Get a client for transaction handling
   */
  async getClient(): Promise<PoolClient> {
    return await this.pool.connect();
  }

  /**
   * Execute multiple queries in a transaction
   */
  async transaction(queries: Array<{ text: string; params?: any[] }>): Promise<any[]> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const results = [];
      
      for (const query of queries) {
        const result = await client.query(query.text, query.params);
        results.push(result);
      }
      
      await client.query('COMMIT');
      return results;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Test database connection
   */
  async testConnection(): Promise<boolean> {
    try {
      const result = await this.query('SELECT NOW() as current_time');
      console.log('Database connection successful:', result.rows[0]);
      return true;
    } catch (error) {
      console.error('Database connection failed:', error);
      return false;
    }
  }

  /**
   * Close all connections
   */
  async close(): Promise<void> {
    await this.pool.end();
  }
}

// Export singleton instance
export const db = DatabaseService.getInstance();