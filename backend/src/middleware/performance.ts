import { Request, Response, NextFunction } from 'express';
import { getCacheService } from '../services/cache/index.js';
import { getDatabase } from '../database/index.js';

export interface PerformanceMetrics {
  requestId: string;
  method: string;
  path: string;
  statusCode: number;
  responseTime: number;
  timestamp: Date;
  userAgent?: string;
  ip?: string;
  cacheHit?: boolean;
  dbQueries?: number;
  memoryUsage?: NodeJS.MemoryUsage;
}

class PerformanceMonitor {
  private metrics: PerformanceMetrics[] = [];
  private maxMetrics = 10000; // Keep last 10k requests
  private cache = getCacheService();

  /**
   * Add performance metric
   */
  addMetric(metric: PerformanceMetrics): void {
    this.metrics.push(metric);
    
    // Keep only recent metrics
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics);
    }
  }

  /**
   * Get performance statistics
   */
  getStats(timeWindow: number = 3600000): { // Default 1 hour
    avgResponseTime: number;
    requestCount: number;
    errorRate: number;
    slowRequests: number;
    cacheHitRate: number;
    topSlowEndpoints: Array<{ path: string; avgTime: number; count: number }>;
  } {
    const cutoff = new Date(Date.now() - timeWindow);
    const recentMetrics = this.metrics.filter(m => m.timestamp >= cutoff);
    
    if (recentMetrics.length === 0) {
      return {
        avgResponseTime: 0,
        requestCount: 0,
        errorRate: 0,
        slowRequests: 0,
        cacheHitRate: 0,
        topSlowEndpoints: []
      };
    }

    const totalTime = recentMetrics.reduce((sum, m) => sum + m.responseTime, 0);
    const errorCount = recentMetrics.filter(m => m.statusCode >= 400).length;
    const slowCount = recentMetrics.filter(m => m.responseTime > 1000).length; // > 1 second
    const cacheHits = recentMetrics.filter(m => m.cacheHit === true).length;
    const cacheRequests = recentMetrics.filter(m => m.cacheHit !== undefined).length;

    // Group by endpoint for slow endpoint analysis
    const endpointStats = new Map<string, { totalTime: number; count: number }>();
    
    recentMetrics.forEach(metric => {
      const key = `${metric.method} ${metric.path}`;
      const existing = endpointStats.get(key) || { totalTime: 0, count: 0 };
      existing.totalTime += metric.responseTime;
      existing.count += 1;
      endpointStats.set(key, existing);
    });

    const topSlowEndpoints = Array.from(endpointStats.entries())
      .map(([path, stats]) => ({
        path,
        avgTime: stats.totalTime / stats.count,
        count: stats.count
      }))
      .sort((a, b) => b.avgTime - a.avgTime)
      .slice(0, 10);

    return {
      avgResponseTime: totalTime / recentMetrics.length,
      requestCount: recentMetrics.length,
      errorRate: (errorCount / recentMetrics.length) * 100,
      slowRequests: slowCount,
      cacheHitRate: cacheRequests > 0 ? (cacheHits / cacheRequests) * 100 : 0,
      topSlowEndpoints
    };
  }

  /**
   * Get recent metrics
   */
  getRecentMetrics(limit: number = 100): PerformanceMetrics[] {
    return this.metrics.slice(-limit);
  }

  /**
   * Clear metrics
   */
  clearMetrics(): void {
    this.metrics = [];
  }
}

// Singleton instance
const performanceMonitor = new PerformanceMonitor();

/**
 * Performance monitoring middleware
 */
export function performanceMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    const requestId = req.headers['x-request-id'] as string || 
                     `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Add request ID to request for tracing
    (req as any).requestId = requestId;
    
    // Track initial memory usage
    const initialMemory = process.memoryUsage();
    
    // Override res.end to capture metrics
    const originalEnd = res.end;
    res.end = function(chunk?: any, encoding?: any) {
      const responseTime = Date.now() - startTime;
      const finalMemory = process.memoryUsage();
      
      const metric: PerformanceMetrics = {
        requestId,
        method: req.method,
        path: req.route?.path || req.path,
        statusCode: res.statusCode,
        responseTime,
        timestamp: new Date(),
        userAgent: req.get('User-Agent'),
        ip: req.ip || req.connection.remoteAddress,
        memoryUsage: {
          rss: finalMemory.rss - initialMemory.rss,
          heapTotal: finalMemory.heapTotal - initialMemory.heapTotal,
          heapUsed: finalMemory.heapUsed - initialMemory.heapUsed,
          external: finalMemory.external - initialMemory.external,
          arrayBuffers: finalMemory.arrayBuffers - initialMemory.arrayBuffers
        }
      };

      // Check if response was served from cache
      if (res.get('X-Cache-Status')) {
        metric.cacheHit = res.get('X-Cache-Status') === 'HIT';
      }

      performanceMonitor.addMetric(metric);
      
      // Log slow requests
      if (responseTime > 1000) {
        console.warn(`Slow request detected: ${req.method} ${req.path} - ${responseTime}ms`);
      }
      
      // Add performance headers
      res.set({
        'X-Response-Time': `${responseTime}ms`,
        'X-Request-ID': requestId
      });
      
      originalEnd.call(this, chunk, encoding);
    };
    
    next();
  };
}

/**
 * Cache hit tracking middleware
 */
export function cacheTrackingMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Override res.set to track cache headers
    const originalSet = res.set;
    res.set = function(field: any, val?: any) {
      if (typeof field === 'string' && field.toLowerCase() === 'x-cache-status') {
        // Cache status is being set, track it
      } else if (typeof field === 'object') {
        // Check if cache status is in the object
        Object.keys(field).forEach(key => {
          if (key.toLowerCase() === 'x-cache-status') {
            // Cache status is being set
          }
        });
      }
      
      return originalSet.call(this, field, val);
    };
    
    next();
  };
}

/**
 * Database query tracking middleware
 */
export function dbTrackingMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const db = getDatabase();
    const originalQuery = db.query;
    let queryCount = 0;
    
    // Override query method to count queries
    db.query = async function(...args: any[]) {
      queryCount++;
      return originalQuery.apply(this, args);
    };
    
    // Store query count in request
    (req as any).dbQueryCount = () => queryCount;
    
    // Restore original method when request ends
    res.on('finish', () => {
      db.query = originalQuery;
    });
    
    next();
  };
}

/**
 * Get performance statistics
 */
export function getPerformanceStats(timeWindow?: number) {
  return performanceMonitor.getStats(timeWindow);
}

/**
 * Get recent performance metrics
 */
export function getRecentMetrics(limit?: number) {
  return performanceMonitor.getRecentMetrics(limit);
}

/**
 * Clear performance metrics
 */
export function clearPerformanceMetrics() {
  performanceMonitor.clearMetrics();
}

/**
 * Health check endpoint data
 */
export async function getSystemHealth() {
  const cache = getCacheService();
  const db = getDatabase();
  
  const [cacheHealth, dbHealth, cacheStats, dbStats, perfStats] = await Promise.all([
    cache.healthCheck(),
    db.healthCheck(),
    cache.getStats(),
    Promise.resolve(db.getPoolStats()),
    Promise.resolve(performanceMonitor.getStats(300000)) // Last 5 minutes
  ]);

  return {
    timestamp: new Date(),
    services: {
      cache: cacheHealth,
      database: dbHealth
    },
    stats: {
      cache: cacheStats,
      database: dbStats,
      performance: perfStats
    },
    memory: process.memoryUsage(),
    uptime: process.uptime()
  };
}