import { describe, it, expect, beforeEach } from 'vitest';
import { ServiceAuthManager } from '../../messaging/serviceAuth.js';
import { CircuitBreaker, CircuitBreakerState } from '../../gateway/circuitBreaker.js';
import { LoadBalancer, LoadBalancingStrategy } from '../../gateway/loadBalancer.js';

describe('Messaging System Unit Tests', () => {
  describe('Service Authentication', () => {
    let authManager: ServiceAuthManager;

    beforeEach(() => {
      authManager = new ServiceAuthManager();
    });

    it('should generate and verify service tokens', () => {
      const serviceName = 'auth'; // Use existing service
      
      // Generate token
      const token = authManager.generateServiceToken(serviceName);
      expect(token).toBeTruthy();
      expect(typeof token).toBe('string');

      // Verify token
      const decoded = authManager.verifyServiceToken(token!);
      expect(decoded).toBeTruthy();
      expect(decoded!.serviceName).toBe(serviceName);
      expect(Array.isArray(decoded!.permissions)).toBe(true);
    });

    it('should reject invalid tokens', () => {
      const invalidToken = 'invalid.token.here';
      
      const decoded = authManager.verifyServiceToken(invalidToken);
      expect(decoded).toBeNull();
    });

    it('should generate and verify API keys', () => {
      const serviceName = 'model-registry'; // Use existing service
      
      // Generate API key
      const apiKey = authManager.generateApiKey(serviceName);
      expect(apiKey).toBeTruthy();
      expect(apiKey!.startsWith(serviceName)).toBe(true);

      // Verify API key
      const credentials = authManager.verifyApiKey(apiKey!);
      expect(credentials).toBeTruthy();
      expect(credentials!.serviceName).toBe(serviceName);
    });

    it('should manage service permissions', () => {
      const serviceName = 'policy-engine'; // Use existing service
      const token = authManager.generateServiceToken(serviceName);
      const decoded = authManager.verifyServiceToken(token!);

      expect(decoded).toBeTruthy();
      
      // Check if service has specific permissions
      const hasPolicyRead = authManager.hasPermission(decoded!, 'policy.read');
      const hasInvalidPermission = authManager.hasPermission(decoded!, 'invalid.permission');
      
      expect(typeof hasPolicyRead).toBe('boolean');
      expect(hasPolicyRead).toBe(true); // policy-engine should have policy.read
      expect(hasInvalidPermission).toBe(false);
    });

    it('should refresh service credentials', async () => {
      const serviceName = 'evaluation'; // Use existing service
      
      // Get initial API key
      const initialApiKey = authManager.generateApiKey(serviceName);
      expect(initialApiKey).toBeTruthy();

      // Verify initial API key works
      const initialCredentials = authManager.verifyApiKey(initialApiKey!);
      expect(initialCredentials).toBeTruthy();

      // Refresh credentials (this changes the secret key used for API keys)
      const refreshed = authManager.refreshServiceCredentials(serviceName);
      expect(refreshed).toBe(true);

      // Generate new API key with new credentials
      const newApiKey = authManager.generateApiKey(serviceName);
      expect(newApiKey).toBeTruthy();
      
      // New API key should work
      const newCredentials = authManager.verifyApiKey(newApiKey!);
      expect(newCredentials).toBeTruthy();
      
      // The API keys should be different (different secret key used)
      expect(newApiKey).not.toBe(initialApiKey);
    });

    it('should list services and get stats', () => {
      const services = authManager.listServices();
      expect(Array.isArray(services)).toBe(true);
      expect(services.length).toBeGreaterThan(0);

      const stats = authManager.getStats();
      expect(stats.totalServices).toBeGreaterThan(0);
      expect(Array.isArray(stats.services)).toBe(true);
    });
  });

  describe('Circuit Breaker', () => {
    it('should start in closed state', () => {
      const circuitBreaker = new CircuitBreaker(3, 1000);
      expect(circuitBreaker.isClosed()).toBe(true);
      expect(circuitBreaker.isOpen()).toBe(false);
      expect(circuitBreaker.isHalfOpen()).toBe(false);
    });

    it('should open circuit after failure threshold', () => {
      const circuitBreaker = new CircuitBreaker(2, 1000); // 2 failures, 1 second reset

      expect(circuitBreaker.isClosed()).toBe(true);

      // Record failures
      circuitBreaker.recordFailure();
      expect(circuitBreaker.isClosed()).toBe(true);

      circuitBreaker.recordFailure();
      expect(circuitBreaker.isOpen()).toBe(true);
    });

    it('should transition to half-open after reset timeout', async () => {
      const circuitBreaker = new CircuitBreaker(1, 100); // 1 failure, 100ms reset

      // Trigger circuit breaker
      circuitBreaker.recordFailure();
      expect(circuitBreaker.isOpen()).toBe(true);

      // Wait for reset timeout
      await new Promise(resolve => setTimeout(resolve, 150));

      expect(circuitBreaker.isHalfOpen()).toBe(true);
    });

    it('should close circuit on successful request in half-open state', async () => {
      const circuitBreaker = new CircuitBreaker(1, 100);

      // Open circuit
      circuitBreaker.recordFailure();
      expect(circuitBreaker.isOpen()).toBe(true);

      // Wait for half-open
      await new Promise(resolve => setTimeout(resolve, 150));
      expect(circuitBreaker.isHalfOpen()).toBe(true);

      // Record success
      circuitBreaker.recordSuccess();
      expect(circuitBreaker.isClosed()).toBe(true);
    });

    it('should provide circuit breaker stats', () => {
      const circuitBreaker = new CircuitBreaker(3, 5000);

      const stats = circuitBreaker.getStats();
      expect(stats.state).toBe(CircuitBreakerState.CLOSED);
      expect(stats.failureCount).toBe(0);
      expect(stats.successCount).toBe(0);

      circuitBreaker.recordFailure();
      const updatedStats = circuitBreaker.getStats();
      expect(updatedStats.failureCount).toBe(1);
    });

    it('should support manual control', () => {
      const circuitBreaker = new CircuitBreaker(3, 5000);

      // Force open
      circuitBreaker.forceOpen();
      expect(circuitBreaker.isOpen()).toBe(true);

      // Force close
      circuitBreaker.forceClose();
      expect(circuitBreaker.isClosed()).toBe(true);

      // Reset
      circuitBreaker.recordFailure();
      circuitBreaker.reset();
      expect(circuitBreaker.isClosed()).toBe(true);
      expect(circuitBreaker.getStats().failureCount).toBe(0);
    });
  });

  describe('Load Balancer', () => {
    let loadBalancer: LoadBalancer;

    beforeEach(() => {
      loadBalancer = new LoadBalancer();
    });

    it('should distribute requests using round robin', () => {
      const service = {
        name: 'test-service',
        instances: [
          { name: 'test-service', url: 'http://localhost:8001', healthCheckUrl: '', timeout: 5000, isHealthy: true, lastHealthCheck: new Date(), consecutiveFailures: 0 },
          { name: 'test-service', url: 'http://localhost:8002', healthCheckUrl: '', timeout: 5000, isHealthy: true, lastHealthCheck: new Date(), consecutiveFailures: 0 },
          { name: 'test-service', url: 'http://localhost:8003', healthCheckUrl: '', timeout: 5000, isHealthy: true, lastHealthCheck: new Date(), consecutiveFailures: 0 }
        ],
        isHealthy: true,
        lastHealthCheck: new Date()
      };

      const selectedUrls = [];
      for (let i = 0; i < 6; i++) {
        const instance = loadBalancer.getNextInstance(service);
        selectedUrls.push(instance!.url);
      }

      // Should cycle through all instances
      expect(selectedUrls[0]).toBe('http://localhost:8001');
      expect(selectedUrls[1]).toBe('http://localhost:8002');
      expect(selectedUrls[2]).toBe('http://localhost:8003');
      expect(selectedUrls[3]).toBe('http://localhost:8001'); // Back to first
    });

    it('should only select healthy instances', () => {
      const service = {
        name: 'test-service',
        instances: [
          { name: 'test-service', url: 'http://localhost:8001', healthCheckUrl: '', timeout: 5000, isHealthy: false, lastHealthCheck: new Date(), consecutiveFailures: 3 },
          { name: 'test-service', url: 'http://localhost:8002', healthCheckUrl: '', timeout: 5000, isHealthy: true, lastHealthCheck: new Date(), consecutiveFailures: 0 },
          { name: 'test-service', url: 'http://localhost:8003', healthCheckUrl: '', timeout: 5000, isHealthy: false, lastHealthCheck: new Date(), consecutiveFailures: 2 }
        ],
        isHealthy: true,
        lastHealthCheck: new Date()
      };

      for (let i = 0; i < 5; i++) {
        const instance = loadBalancer.getNextInstance(service);
        expect(instance!.url).toBe('http://localhost:8002'); // Only healthy instance
      }
    });

    it('should return null when no healthy instances available', () => {
      const service = {
        name: 'test-service',
        instances: [
          { name: 'test-service', url: 'http://localhost:8001', healthCheckUrl: '', timeout: 5000, isHealthy: false, lastHealthCheck: new Date(), consecutiveFailures: 3 },
          { name: 'test-service', url: 'http://localhost:8002', healthCheckUrl: '', timeout: 5000, isHealthy: false, lastHealthCheck: new Date(), consecutiveFailures: 3 }
        ],
        isHealthy: false,
        lastHealthCheck: new Date()
      };

      const instance = loadBalancer.getNextInstance(service);
      expect(instance).toBeNull();
    });

    it('should support different load balancing strategies', () => {
      loadBalancer.setStrategy(LoadBalancingStrategy.RANDOM);
      expect(loadBalancer.getStrategy()).toBe(LoadBalancingStrategy.RANDOM);

      loadBalancer.setStrategy(LoadBalancingStrategy.LEAST_CONNECTIONS);
      expect(loadBalancer.getStrategy()).toBe(LoadBalancingStrategy.LEAST_CONNECTIONS);
    });

    it('should track connection counts', () => {
      const instanceUrl = 'http://localhost:8001';
      
      expect(loadBalancer.getConnectionStats()[instanceUrl]).toBeUndefined();
      
      loadBalancer.recordConnection(instanceUrl);
      expect(loadBalancer.getConnectionStats()[instanceUrl]).toBe(1);
      
      loadBalancer.recordConnection(instanceUrl);
      expect(loadBalancer.getConnectionStats()[instanceUrl]).toBe(2);
      
      loadBalancer.recordDisconnection(instanceUrl);
      expect(loadBalancer.getConnectionStats()[instanceUrl]).toBe(1);
    });

    it('should support weighted round robin', () => {
      loadBalancer.setStrategy(LoadBalancingStrategy.WEIGHTED_ROUND_ROBIN);
      loadBalancer.setWeights({
        'http://localhost:8001': 3,
        'http://localhost:8002': 1,
        'http://localhost:8003': 2
      });

      const service = {
        name: 'test-service',
        instances: [
          { name: 'test-service', url: 'http://localhost:8001', healthCheckUrl: '', timeout: 5000, isHealthy: true, lastHealthCheck: new Date(), consecutiveFailures: 0 },
          { name: 'test-service', url: 'http://localhost:8002', healthCheckUrl: '', timeout: 5000, isHealthy: true, lastHealthCheck: new Date(), consecutiveFailures: 0 },
          { name: 'test-service', url: 'http://localhost:8003', healthCheckUrl: '', timeout: 5000, isHealthy: true, lastHealthCheck: new Date(), consecutiveFailures: 0 }
        ],
        isHealthy: true,
        lastHealthCheck: new Date()
      };

      const selectedUrls = [];
      for (let i = 0; i < 12; i++) { // 3+1+2 = 6 weight units, so 12 requests = 2 full cycles
        const instance = loadBalancer.getNextInstance(service);
        selectedUrls.push(instance!.url);
      }

      // Count occurrences
      const counts = selectedUrls.reduce((acc, url) => {
        acc[url] = (acc[url] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      // Should respect weights (approximately)
      expect(counts['http://localhost:8001']).toBeGreaterThan(counts['http://localhost:8002']);
      expect(counts['http://localhost:8003']).toBeGreaterThan(counts['http://localhost:8002']);
    });

    it('should reset counters', () => {
      const instanceUrl = 'http://localhost:8001';
      
      loadBalancer.recordConnection(instanceUrl);
      expect(loadBalancer.getConnectionStats()[instanceUrl]).toBe(1);
      
      loadBalancer.resetCounters();
      expect(loadBalancer.getConnectionStats()[instanceUrl]).toBeUndefined();
    });
  });
});