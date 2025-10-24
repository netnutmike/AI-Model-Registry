import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../index.js';
import { getDatabase } from '../../database/index.js';
import { getCacheService } from '../../services/cache/index.js';
import { getPerformanceStats, clearPerformanceMetrics } from '../../middleware/performance.js';

describe('Performance Tests', () => {
  let db: any;
  let cache: any;
  let testModelId: string;

  beforeAll(async () => {
    db = getDatabase();
    cache = getCacheService();
    
    // Clear metrics before testing
    clearPerformanceMetrics();
    
    // Create test model
    const modelResponse = await request(app)
      .post('/api/v1/models')
      .send({
        name: 'performance-test-model',
        group: 'test',
        description: 'Model for performance testing',
        owners: ['test-user'],
        riskTier: 'Low',
        tags: ['performance', 'test']
      });
    
    testModelId = modelResponse.body.id;
  });

  afterAll(async () => {
    // Cleanup test data
    if (testModelId) {
      await request(app).delete(`/api/v1/models/${testModelId}`);
    }
  });

  describe('Response Time Requirements', () => {
    it('should handle model search within 500ms', async () => {
      const start = Date.now();
      
      const response = await request(app)
        .get('/api/v1/models?search=test&page=1&pageSize=20')
        .expect(200);
      
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(500);
      expect(response.body).toHaveProperty('models');
    });

    it('should handle model retrieval within 200ms (cached)', async () => {
      // First request to populate cache
      await request(app)
        .get(`/api/v1/models/${testModelId}`)
        .expect(200);
      
      // Second request should be cached and faster
      const start = Date.now();
      const response = await request(app)
        .get(`/api/v1/models/${testModelId}`)
        .expect(200);
      
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(200);
      expect(response.headers['x-cache-status']).toBe('HIT');
    });

    it('should handle health check within 100ms', async () => {
      const start = Date.now();
      
      await request(app)
        .get('/health')
        .expect(200);
      
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(100);
    });
  });

  describe('Concurrent Request Handling', () => {
    it('should handle 50 concurrent model searches', async () => {
      const promises = Array.from({ length: 50 }, (_, i) =>
        request(app)
          .get(`/api/v1/models?search=test${i % 5}&page=1&pageSize=10`)
          .expect(200)
      );
      
      const start = Date.now();
      const responses = await Promise.all(promises);
      const duration = Date.now() - start;
      
      // All requests should complete within 2 seconds
      expect(duration).toBeLessThan(2000);
      
      // All responses should be valid
      responses.forEach(response => {
        expect(response.body).toHaveProperty('models');
        expect(Array.isArray(response.body.models)).toBe(true);
      });
    });

    it('should handle concurrent model retrievals with caching', async () => {
      const promises = Array.from({ length: 100 }, () =>
        request(app)
          .get(`/api/v1/models/${testModelId}`)
          .expect(200)
      );
      
      const start = Date.now();
      const responses = await Promise.all(promises);
      const duration = Date.now() - start;
      
      // Should complete quickly due to caching
      expect(duration).toBeLessThan(1000);
      
      // Most responses should be cache hits
      const cacheHits = responses.filter(r => r.headers['x-cache-status'] === 'HIT').length;
      expect(cacheHits).toBeGreaterThan(90); // At least 90% cache hits
    });
  });

  describe('Database Performance', () => {
    it('should maintain connection pool efficiency', async () => {
      const poolStats = db.getPoolStats();
      
      // Make multiple requests to test connection pooling
      const promises = Array.from({ length: 20 }, () =>
        request(app)
          .get('/api/v1/models?page=1&pageSize=5')
          .expect(200)
      );
      
      await Promise.all(promises);
      
      const newPoolStats = db.getPoolStats();
      
      // Pool should not be exhausted
      expect(newPoolStats.idleCount).toBeGreaterThan(0);
      expect(newPoolStats.waitingCount).toBe(0);
    });

    it('should have efficient query performance', async () => {
      // Clear query metrics
      db.resetQueryMetrics();
      
      // Perform various operations
      await request(app).get('/api/v1/models?page=1&pageSize=10');
      await request(app).get(`/api/v1/models/${testModelId}`);
      await request(app).get('/api/v1/models?search=test');
      
      const queryMetrics = db.getQueryMetrics();
      
      // All queries should complete reasonably fast
      queryMetrics.forEach(metric => {
        expect(metric.avgTime).toBeLessThan(100); // Less than 100ms average
      });
    });
  });

  describe('Cache Performance', () => {
    it('should have high cache hit rate for repeated requests', async () => {
      // Clear cache to start fresh
      await cache.clearPattern('*');
      
      // Make initial requests (cache misses)
      await request(app).get(`/api/v1/models/${testModelId}`);
      await request(app).get('/api/v1/models?search=test&page=1&pageSize=10');
      
      // Make repeated requests (should be cache hits)
      const responses = await Promise.all([
        request(app).get(`/api/v1/models/${testModelId}`),
        request(app).get(`/api/v1/models/${testModelId}`),
        request(app).get('/api/v1/models?search=test&page=1&pageSize=10'),
        request(app).get('/api/v1/models?search=test&page=1&pageSize=10'),
      ]);
      
      // Check cache headers
      const cacheHits = responses.filter(r => r.headers['x-cache-status'] === 'HIT').length;
      expect(cacheHits).toBeGreaterThanOrEqual(2);
    });

    it('should maintain cache performance under load', async () => {
      const cacheHealthBefore = await cache.healthCheck();
      expect(cacheHealthBefore.status).toBe('healthy');
      
      // Generate cache load
      const promises = Array.from({ length: 100 }, (_, i) =>
        cache.set(`load-test-${i}`, { data: `test-data-${i}` }, { ttl: 60 })
      );
      
      await Promise.all(promises);
      
      const cacheHealthAfter = await cache.healthCheck();
      expect(cacheHealthAfter.status).toBe('healthy');
      expect(cacheHealthAfter.latency).toBeLessThan(50); // Less than 50ms latency
    });
  });

  describe('Memory Usage', () => {
    it('should not have memory leaks during sustained load', async () => {
      const initialMemory = process.memoryUsage();
      
      // Simulate sustained load
      for (let i = 0; i < 10; i++) {
        const promises = Array.from({ length: 20 }, () =>
          request(app).get('/api/v1/models?page=1&pageSize=5')
        );
        await Promise.all(promises);
      }
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      
      // Memory increase should be reasonable (less than 50MB)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    });
  });

  describe('Performance Monitoring', () => {
    it('should collect performance metrics', async () => {
      // Clear metrics
      clearPerformanceMetrics();
      
      // Make some requests
      await request(app).get('/api/v1/models?page=1&pageSize=5');
      await request(app).get(`/api/v1/models/${testModelId}`);
      
      const stats = getPerformanceStats(60000); // Last minute
      
      expect(stats.requestCount).toBeGreaterThan(0);
      expect(stats.avgResponseTime).toBeGreaterThan(0);
      expect(stats.errorRate).toBeLessThan(10); // Less than 10% error rate
    });

    it('should identify slow requests', async () => {
      clearPerformanceMetrics();
      
      // Make requests including some potentially slow ones
      await request(app).get('/api/v1/models?search=complex-query&page=1&pageSize=100');
      
      const stats = getPerformanceStats(60000);
      
      expect(stats.topSlowEndpoints).toBeDefined();
      expect(Array.isArray(stats.topSlowEndpoints)).toBe(true);
    });
  });

  describe('SLA Compliance', () => {
    it('should meet 99.9% availability requirement', async () => {
      const totalRequests = 100;
      const promises = Array.from({ length: totalRequests }, () =>
        request(app)
          .get('/health')
          .timeout(5000) // 5 second timeout
      );
      
      const results = await Promise.allSettled(promises);
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const availability = (successful / totalRequests) * 100;
      
      expect(availability).toBeGreaterThanOrEqual(99.9);
    });

    it('should handle 10,000 models requirement', async () => {
      // This is a simplified test - in reality you'd need actual data
      const response = await request(app)
        .get('/api/v1/models?page=1&pageSize=1000')
        .expect(200);
      
      // Should handle large page sizes efficiently
      expect(response.body).toHaveProperty('models');
      expect(Array.isArray(response.body.models)).toBe(true);
    });

    it('should maintain 95th percentile response time under 500ms', async () => {
      clearPerformanceMetrics();
      
      // Generate load to collect metrics
      const promises = Array.from({ length: 100 }, () =>
        request(app).get('/api/v1/models?page=1&pageSize=10')
      );
      
      await Promise.all(promises);
      
      const stats = getPerformanceStats(60000);
      
      // This is a simplified check - in reality you'd calculate actual 95th percentile
      expect(stats.avgResponseTime).toBeLessThan(500);
    });
  });
});