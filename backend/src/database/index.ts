import { Pool, PoolClient } from 'pg';
import { getPool } from '../config/database.js';

export class DatabaseService {
  private pool: Pool;

  constructor() {
    this.pool = getPool();
  }

  /**
   * Execute a query with parameters
   */
  async query<T = any>(text: string, params?: any[]): Promise<T[]> {
    const result = await this.pool.query(text, params);
    return result.rows;
  }

  /**
   * Execute a query and return a single row
   */
  async queryOne<T = any>(text: string, params?: any[]): Promise<T | null> {
    const result = await this.pool.query(text, params);
    return result.rows[0] || null;
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