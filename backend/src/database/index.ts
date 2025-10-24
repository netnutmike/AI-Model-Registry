import { Pool, PoolClient } from 'pg';
import { getPool } from '../config/database.js';

export class DatabaseService {
  private pool: Pool;
  private queryMetrics: Map<string, { count: number; totalTime: number; avgTime: number }>;

  constructor() {
    this.pool = getPool();
    this.queryMetrics = new Map();
  }

  /**
   * Execute a query with parameters
   */
  async query<T = any>(text: string, params?: any[]): Promise<T[]> {
    const startTime = Date.now();
    const queryHash = this.hashQuery(text);
    
    try {
      const result = await this.pool.query(text, params);
      this.recordQueryMetrics(queryHash, Date.now() - startTime);
      return result.rows;
    } catch (error) {
      this.recordQueryMetrics(queryHash, Date.now() - startTime, true);
      throw error;
    }
  }

  /**
   * Execute a query and return a single row
   */
  async queryOne<T = any>(text: string, params?: any[]): Promise<T | null> {
    const startTime = Date.now();
    const queryHash = this.hashQuery(text);
    
    try {
      const result = await this.pool.query(text, params);
      this.recordQueryMetrics(queryHash, Date.now() - startTime);
      return result.rows[0] || null;
    } catch (error) {
      this.recordQueryMetrics(queryHash, Date.now() - startTime, true);
      throw error;
    }
  }

  /**
   * Execute multiple queries in a transaction
   */
  async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Set the current user ID for audit logging
   */
  async setCurrentUser(client: PoolClient, userId: string): Promise<void> {
    await client.query('SELECT set_config($1, $2, true)', ['app.current_user_id', userId]);
  }

  /**
   * Get database connection pool stats
   */
  getPoolStats() {
    return {
      totalCount: this.pool.totalCount,
      idleCount: this.pool.idleCount,
      waitingCount: this.pool.waitingCount
    };
  }

  /**
   * Health check for database connectivity
   */
  async healthCheck(): Promise<{ status: string; timestamp: Date; version?: string }> {
    try {
      const result = await this.query('SELECT version(), NOW() as timestamp');
      return {
        status: 'healthy',
        timestamp: result[0].timestamp,
        version: result[0].version
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        timestamp: new Date()
      };
    }
  }

  /**
   * Hash query for metrics tracking
   */
  private hashQuery(query: string): string {
    // Simple hash function for query identification
    let hash = 0;
    const normalizedQuery = query.replace(/\$\d+/g, '$?').replace(/\s+/g, ' ').trim();
    
    for (let i = 0; i < normalizedQuery.length; i++) {
      const char = normalizedQuery.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    return hash.toString();
  }

  /**
   * Record query performance metrics
   */
  private recordQueryMetrics(queryHash: string, executionTime: number, isError: boolean = false): void {
    if (isError) return; // Don't record metrics for failed queries
    
    const existing = this.queryMetrics.get(queryHash);
    if (existing) {
      existing.count++;
      existing.totalTime += executionTime;
      existing.avgTime = existing.totalTime / existing.count;
    } else {
      this.queryMetrics.set(queryHash, {
        count: 1,
        totalTime: executionTime,
        avgTime: executionTime
      });
    }
  }

  /**
   * Get query performance metrics
   */
  getQueryMetrics(): Array<{ queryHash: string; count: number; avgTime: number; totalTime: number }> {
    return Array.from(this.queryMetrics.entries()).map(([queryHash, metrics]) => ({
      queryHash,
      ...metrics
    }));
  }

  /**
   * Reset query metrics
   */
  resetQueryMetrics(): void {
    this.queryMetrics.clear();
  }

  /**
   * Execute query with caching support
   */
  async queryCached<T = any>(
    text: string, 
    params: any[] = [], 
    cacheKey?: string, 
    ttl: number = 300
  ): Promise<T[]> {
    if (!cacheKey) {
      return this.query<T>(text, params);
    }

    // Import cache service dynamically to avoid circular dependencies
    const { getCacheService } = await import('../services/cache/index.js');
    const cache = getCacheService();
    
    return cache.getOrSet(
      cacheKey,
      () => this.query<T>(text, params),
      { ttl }
    );
  }

  /**
   * Prepare and execute optimized queries with connection reuse
   */
  async preparedQuery<T = any>(
    name: string,
    text: string,
    params: any[] = []
  ): Promise<T[]> {
    const client = await this.pool.connect();
    
    try {
      // Use prepared statements for better performance
      const result = await client.query({
        name,
        text,
        values: params
      });
      
      return result.rows;
    } finally {
      client.release();
    }
  }
}

// Singleton instance
let dbService: DatabaseService | null = null;

export function getDatabase(): DatabaseService {
  if (!dbService) {
    dbService = new DatabaseService();
  }
  return dbService;
}

// Query builder helpers
export class QueryBuilder {
  private selectClause: string = '';
  private fromClause: string = '';
  private whereConditions: string[] = [];
  private orderByClause: string = '';
  private limitClause: string = '';
  private offsetClause: string = '';
  private params: any[] = [];

  select(columns: string | string[]): QueryBuilder {
    this.selectClause = Array.isArray(columns) ? columns.join(', ') : columns;
    return this;
  }

  from(table: string): QueryBuilder {
    this.fromClause = table;
    return this;
  }

  where(condition: string, value?: any): QueryBuilder {
    if (value !== undefined) {
      this.params.push(value);
      this.whereConditions.push(`${condition} $${this.params.length}`);
    } else {
      this.whereConditions.push(condition);
    }
    return this;
  }

  whereIn(column: string, values: any[]): QueryBuilder {
    if (values.length === 0) {
      this.whereConditions.push('FALSE'); // No matches
      return this;
    }

    const placeholders = values.map(() => {
      this.params.push(values[this.params.length - values.length]);
      return `$${this.params.length}`;
    });

    this.whereConditions.push(`${column} IN (${placeholders.join(', ')})`);
    return this;
  }

  orderBy(column: string, direction: 'ASC' | 'DESC' = 'ASC'): QueryBuilder {
    this.orderByClause = `${column} ${direction}`;
    return this;
  }

  limit(count: number): QueryBuilder {
    this.params.push(count);
    this.limitClause = `$${this.params.length}`;
    return this;
  }

  offset(count: number): QueryBuilder {
    this.params.push(count);
    this.offsetClause = `$${this.params.length}`;
    return this;
  }

  build(): { text: string; params: any[] } {
    let query = `SELECT ${this.selectClause || '*'} FROM ${this.fromClause}`;

    if (this.whereConditions.length > 0) {
      query += ` WHERE ${this.whereConditions.join(' AND ')}`;
    }

    if (this.orderByClause) {
      query += ` ORDER BY ${this.orderByClause}`;
    }

    if (this.limitClause) {
      query += ` LIMIT ${this.limitClause}`;
    }

    if (this.offsetClause) {
      query += ` OFFSET ${this.offsetClause}`;
    }

    return {
      text: query,
      params: this.params
    };
  }
}

export function createQueryBuilder(): QueryBuilder {
  return new QueryBuilder();
}