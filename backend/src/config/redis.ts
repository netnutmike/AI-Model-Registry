import Redis, { RedisOptions } from 'ioredis';

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db: number;
  keyPrefix: string;
  maxRetriesPerRequest: number;
  retryDelayOnFailover: number;
  enableReadyCheck: boolean;
  lazyConnect: boolean;
  connectTimeout: number;
  commandTimeout: number;
  maxMemoryPolicy: string;
}

export function getRedisConfig(): RedisConfig {
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0', 10),
    keyPrefix: process.env.REDIS_KEY_PREFIX || 'ai-model-registry:',
    maxRetriesPerRequest: parseInt(process.env.REDIS_MAX_RETRIES || '3', 10),
    retryDelayOnFailover: parseInt(process.env.REDIS_RETRY_DELAY || '100', 10),
    enableReadyCheck: process.env.REDIS_READY_CHECK !== 'false',
    lazyConnect: process.env.REDIS_LAZY_CONNECT === 'true',
    connectTimeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT || '10000', 10),
    commandTimeout: parseInt(process.env.REDIS_COMMAND_TIMEOUT || '5000', 10),
    maxMemoryPolicy: process.env.REDIS_MAX_MEMORY_POLICY || 'allkeys-lru'
  };
}

export function createRedisConnection(): Redis {
  const config = getRedisConfig();
  
  const redisOptions: RedisOptions = {
    host: config.host,
    port: config.port,
    password: config.password,
    db: config.db,
    keyPrefix: config.keyPrefix,
    maxRetriesPerRequest: config.maxRetriesPerRequest,
    retryDelayOnFailover: config.retryDelayOnFailover,
    enableReadyCheck: config.enableReadyCheck,
    lazyConnect: config.lazyConnect,
    connectTimeout: config.connectTimeout,
    commandTimeout: config.commandTimeout,
    // Connection pool settings
    family: 4,
    keepAlive: true,
    // Cluster support for ElastiCache
    enableOfflineQueue: false,
    // TLS support for production
    tls: process.env.REDIS_TLS === 'true' ? {} : undefined
  };

  const redis = new Redis(redisOptions);

  // Handle connection events
  redis.on('connect', () => {
    console.log('Connected to Redis');
  });

  redis.on('ready', () => {
    console.log('Redis connection ready');
  });

  redis.on('error', (error) => {
    console.error('Redis connection error:', error);
  });

  redis.on('close', () => {
    console.log('Redis connection closed');
  });

  redis.on('reconnecting', () => {
    console.log('Reconnecting to Redis...');
  });

  return redis;
}

// Singleton Redis instance
let redisClient: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = createRedisConnection();
  }
  return redisClient;
}

export async function closeRedisConnection(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}

// Redis key patterns for different data types
export const CACHE_KEYS = {
  MODEL: (id: string) => `model:${id}`,
  MODEL_VERSION: (modelId: string, version: string) => `model:${modelId}:version:${version}`,
  MODEL_VERSIONS: (modelId: string) => `model:${modelId}:versions`,
  MODEL_SEARCH: (query: string, filters: string) => `search:models:${Buffer.from(query + filters).toString('base64')}`,
  MODEL_CARD: (modelId: string, version: string) => `model-card:${modelId}:${version}`,
  EVALUATION_RESULTS: (versionId: string) => `evaluation:${versionId}`,
  POLICY_RESULTS: (versionId: string) => `policy:${versionId}`,
  USER_SESSION: (sessionId: string) => `session:${sessionId}`,
  USER_PERMISSIONS: (userId: string) => `permissions:${userId}`,
  DEPLOYMENT_STATUS: (deploymentId: string) => `deployment:${deploymentId}`,
  ARTIFACT_METADATA: (artifactId: string) => `artifact:${artifactId}`,
  LINEAGE_GRAPH: (modelId: string) => `lineage:${modelId}`,
  AUDIT_SUMMARY: (date: string) => `audit:summary:${date}`
} as const;

// Cache TTL settings (in seconds)
export const CACHE_TTL = {
  MODEL: 3600, // 1 hour
  MODEL_VERSION: 1800, // 30 minutes
  MODEL_SEARCH: 300, // 5 minutes
  MODEL_CARD: 7200, // 2 hours
  EVALUATION_RESULTS: 3600, // 1 hour
  POLICY_RESULTS: 1800, // 30 minutes
  USER_SESSION: 86400, // 24 hours
  USER_PERMISSIONS: 3600, // 1 hour
  DEPLOYMENT_STATUS: 60, // 1 minute
  ARTIFACT_METADATA: 7200, // 2 hours
  LINEAGE_GRAPH: 3600, // 1 hour
  AUDIT_SUMMARY: 86400 // 24 hours
} as const;