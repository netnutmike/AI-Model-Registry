import { Redis } from 'ioredis';
import { getRedisClient, CACHE_KEYS, CACHE_TTL } from '../../config/redis.js';

export interface CacheOptions {
  ttl?: number;
  compress?: boolean;
  tags?: string[];
}

export class CacheService {
  private redis: Redis;
  private compressionThreshold: number = 1024; // Compress data larger than 1KB

  constructor() {
    this.redis = getRedisClient();
  }

  /**
   * Get a value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.redis.get(key);
      if (!value) {
        return null;
      }

      // Check if value is compressed
      if (value.startsWith('gzip:')) {
        const compressed = Buffer.from(value.slice(5), 'base64');
        const decompressed = await this.decompress(compressed);
        return JSON.parse(decompressed);
      }

      return JSON.parse(value);
    } catch (error) {
      console.error(`Cache get error for key ${key}:`, error);
      return null;
    }
  }

  /**
   * Set a value in cache
   */
  async set<T>(key: string, value: T, options: CacheOptions = {}): Promise<void> {
    try {
      let serialized = JSON.stringify(value);
      
      // Compress large values
      if (options.compress || serialized.length > this.compressionThreshold) {
        const compressed = await this.compress(serialized);
        serialized = 'gzip:' + compressed.toString('base64');
      }

      const ttl = options.ttl || CACHE_TTL.MODEL;
      
      if (ttl > 0) {
        await this.redis.setex(key, ttl, serialized);
      } else {
        await this.redis.set(key, serialized);
      }

      // Add tags for cache invalidation
      if (options.tags && options.tags.length > 0) {
        await this.addTags(key, options.tags);
      }
    } catch (error) {
      console.error(`Cache set error for key ${key}:`, error);
    }
  }

  /**
   * Delete a value from cache
   */
  async delete(key: string): Promise<void> {
    try {
      await this.redis.del(key);
    } catch (error) {
      console.error(`Cache delete error for key ${key}:`, error);
    }
  }

  /**
   * Delete multiple keys from cache
   */
  async deleteMany(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    
    try {
      await this.redis.del(...keys);
    } catch (error) {
      console.error(`Cache delete many error:`, error);
    }
  }

  /**
   * Check if a key exists in cache
   */
  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.redis.exists(key);
      return result === 1;
    } catch (error) {
      console.error(`Cache exists error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Get or set pattern - fetch from cache or compute and cache
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    options: CacheOptions = {}
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const value = await factory();
    await this.set(key, value, options);
    return value;
  }

  /**
   * Increment a counter
   */
  async increment(key: string, amount: number = 1, ttl?: number): Promise<number> {
    try {
      const result = await this.redis.incrby(key, amount);
      if (ttl && result === amount) {
        // Set TTL only on first increment
        await this.redis.expire(key, ttl);
      }
      return result;
    } catch (error) {
      console.error(`Cache increment error for key ${key}:`, error);
      return 0;
    }
  }

  /**
   * Add items to a set
   */
  async addToSet(key: string, ...members: string[]): Promise<void> {
    try {
      if (members.length > 0) {
        await this.redis.sadd(key, ...members);
      }
    } catch (error) {
      console.error(`Cache add to set error for key ${key}:`, error);
    }
  }

  /**
   * Get all members of a set
   */
  async getSetMembers(key: string): Promise<string[]> {
    try {
      return await this.redis.smembers(key);
    } catch (error) {
      console.error(`Cache get set members error for key ${key}:`, error);
      return [];
    }
  }

  /**
   * Remove items from a set
   */
  async removeFromSet(key: string, ...members: string[]): Promise<void> {
    try {
      if (members.length > 0) {
        await this.redis.srem(key, ...members);
      }
    } catch (error) {
      console.error(`Cache remove from set error for key ${key}:`, error);
    }
  }

  /**
   * Add tags to a key for cache invalidation
   */
  private async addTags(key: string, tags: string[]): Promise<void> {
    const pipeline = this.redis.pipeline();
    
    for (const tag of tags) {
      const tagKey = `tag:${tag}`;
      pipeline.sadd(tagKey, key);
      pipeline.expire(tagKey, 86400); // Tags expire in 24 hours
    }
    
    await pipeline.exec();
  }

  /**
   * Invalidate cache by tags
   */
  async invalidateByTags(tags: string[]): Promise<void> {
    try {
      const keysToDelete: string[] = [];
      
      for (const tag of tags) {
        const tagKey = `tag:${tag}`;
        const keys = await this.redis.smembers(tagKey);
        keysToDelete.push(...keys);
        await this.redis.del(tagKey);
      }
      
      if (keysToDelete.length > 0) {
        await this.deleteMany([...new Set(keysToDelete)]);
      }
    } catch (error) {
      console.error(`Cache invalidate by tags error:`, error);
    }
  }

  /**
   * Clear all cache with pattern
   */
  async clearPattern(pattern: string): Promise<void> {
    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.deleteMany(keys);
      }
    } catch (error) {
      console.error(`Cache clear pattern error for pattern ${pattern}:`, error);
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    totalKeys: number;
    memoryUsage: string;
    hitRate?: number;
    missRate?: number;
  }> {
    try {
      const info = await this.redis.info('memory');
      const keyspace = await this.redis.info('keyspace');
      
      const memoryMatch = info.match(/used_memory_human:(.+)/);
      const memoryUsage = memoryMatch ? memoryMatch[1].trim() : 'unknown';
      
      const keysMatch = keyspace.match(/keys=(\d+)/);
      const totalKeys = keysMatch ? parseInt(keysMatch[1], 10) : 0;
      
      return {
        totalKeys,
        memoryUsage
      };
    } catch (error) {
      console.error('Cache stats error:', error);
      return {
        totalKeys: 0,
        memoryUsage: 'unknown'
      };
    }
  }

  /**
   * Health check for cache service
   */
  async healthCheck(): Promise<{ status: string; latency?: number }> {
    try {
      const start = Date.now();
      await this.redis.ping();
      const latency = Date.now() - start;
      
      return {
        status: 'healthy',
        latency
      };
    } catch (error) {
      return {
        status: 'unhealthy'
      };
    }
  }

  /**
   * Compress data using gzip
   */
  private async compress(data: string): Promise<Buffer> {
    const { gzip } = await import('zlib');
    const { promisify } = await import('util');
    const gzipAsync = promisify(gzip);
    
    return gzipAsync(Buffer.from(data, 'utf8'));
  }

  /**
   * Decompress gzipped data
   */
  private async decompress(data: Buffer): Promise<string> {
    const { gunzip } = await import('zlib');
    const { promisify } = await import('util');
    const gunzipAsync = promisify(gunzip);
    
    const decompressed = await gunzipAsync(data);
    return decompressed.toString('utf8');
  }
}

// Singleton instance
let cacheService: CacheService | null = null;

export function getCacheService(): CacheService {
  if (!cacheService) {
    cacheService = new CacheService();
  }
  return cacheService;
}

// Cache decorators for common patterns
export function cached(keyFactory: (...args: any[]) => string, ttl?: number) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      const cache = getCacheService();
      const key = keyFactory(...args);
      
      const cached = await cache.get(key);
      if (cached !== null) {
        return cached;
      }
      
      const result = await method.apply(this, args);
      await cache.set(key, result, { ttl });
      
      return result;
    };
    
    return descriptor;
  };
}