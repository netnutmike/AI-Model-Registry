import { Pool, PoolConfig } from 'pg';

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl?: boolean;
  maxConnections: number;
  idleTimeoutMillis: number;
  connectionTimeoutMillis: number;
}

export function getDatabaseConfig(): DatabaseConfig {
  return {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'ai_model_registry',
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    ssl: process.env.DB_SSL === 'true',
    maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS || '20', 10),
    idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000', 10),
    connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT || '2000', 10)
  };
}

export function createConnectionPool(): Pool {
  const config = getDatabaseConfig();
  
  const poolConfig: PoolConfig = {
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.username,
    password: config.password,
    ssl: config.ssl ? { rejectUnauthorized: false } : false,
    max: config.maxConnections,
    min: Math.floor(config.maxConnections * 0.1), // Maintain 10% minimum connections
    idleTimeoutMillis: config.idleTimeoutMillis,
    connectionTimeoutMillis: config.connectionTimeoutMillis,
    acquireTimeoutMillis: 60000, // 60 seconds to acquire connection
    createTimeoutMillis: 30000, // 30 seconds to create connection
    destroyTimeoutMillis: 5000, // 5 seconds to destroy connection
    reapIntervalMillis: 1000, // Check for idle connections every second
    createRetryIntervalMillis: 200, // Retry connection creation every 200ms
    // Aurora-specific optimizations
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
    // Query optimization
    statement_timeout: 30000, // 30 second query timeout
    query_timeout: 30000,
    // Application name for monitoring
    application_name: 'ai-model-registry'
  };

  const pool = new Pool(poolConfig);

  // Handle pool errors
  pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
    process.exit(-1);
  });

  // Log connection events in development
  if (process.env.NODE_ENV === 'development') {
    pool.on('connect', () => {
      console.log('Connected to PostgreSQL database');
    });

    pool.on('remove', () => {
      console.log('Client removed from pool');
    });
  }

  return pool;
}

// Singleton pool instance
let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = createConnectionPool();
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}