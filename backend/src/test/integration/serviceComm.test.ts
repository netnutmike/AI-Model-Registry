import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { EventBus, EventTypes, MessagingManager, ServiceClient, ServiceClientFactory } from '../../messaging/index.js';
import { ServiceAuthManager } from '../../messaging/serviceAuth.js';
import { CircuitBreaker } from '../../gateway/circuitBreaker.js';
import Redis from 'redis';

describe('Service Communication Integration Tests', () => {
  let eventBus: EventBus;
  let authManager: ServiceAuthManager;
  let redisClient: any;

  beforeAll(async () => {
    // Setup test Redis connection
    redisClient = Redis.createClient({
      url: process.env.TEST_REDIS_URL || 'redis://localhost:6379'
    });
    
    try {
      await redisClient.connect();
    } catch (error) {
      console.warn('Redis not available for tests, skipping Redis-dependent tests');
    }

    // Initialize auth manager
    authManager = new ServiceAuthManager();
  });

  afterAll(async () => {
    if (redisClient?.isOpen) {
      await redisClient.disconnect();
    }
  });

  beforeEach(async () => {
    // Clean up Redis keys before each test
    if (redisClient?.isOpen) {
      await redisClient.flushDb();
    }
  });

  describe('EventBus Integration', () => {
    beforeEach(async () => {
      if (redisClient?.isOpen) {
        eventBus = new EventBus(process.env.TEST_REDIS_URL || 'redis://localhost:6379');
        await eventBus.connect();
      }
    });

    afterEach(async () => {
      if (eventBus?.isHealthy()) {
        await eventBus.disconnect();
      }
    });

    it('should publish and receive events', async () => {
      if (!redisClient?.isOpen) {
        console.warn('Skipping Redis test - Redis not available');
        return;
      }

      const receivedEvents: any[] = [];
      
      // Subscribe to event
      await eventBus.subscribe(EventTypes.MODEL_CREATED, async (event) => {
        receivedEvents.push(event);
      });

      // Create and publish event
      const testEvent = eventBus.createEvent(
        EventTypes.MODEL_CREATED,
        'test-service',
        { modelId: 'test-model-123', name: 'Test Model' },
        { userId: 'test-user' }
      );

      await eventBus.publish(testEvent);

      // Wait for event processing
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(receivedEvents).toHaveLength(1);
      expect(receivedEvents[0].type).toBe(EventTypes.MODEL_CREATED);
      expect(receivedEvents[0].data.modelId).toBe('test-model-123');
      expect(receivedEvents[0].userId).toBe('test-user');
    });

    it('should handle multiple subscribers for same event type', async () => {
      if (!redisClient?.isOpen) {
        console.warn('Skipping Redis test - Redis not available');
        return;
      }

      const receivedEvents1: any[] = [];
      const receivedEvents2: any[] = [];
      
      // Subscribe with multiple handlers
      await eventBus.subscribe(EventTypes.VERSION_CREATED, async (event) => {
        receivedEvents1.push(event);
      });

      await eventBus.subscribe(EventTypes.VERSION_CREATED, async (event) => {
        receivedEvents2.push(event);
      });

      // Publish event
      const testEvent = eventBus.createEvent(
        EventTypes.VERSION_CREATED,
        'test-service',
        { versionId: 'test-version-123' }
      );

      await eventBus.publish(testEvent);

      // Wait for event processing
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(receivedEvents1).toHaveLength(1);
      expect(receivedEvents2).toHaveLength(1);
      expect(receivedEvents1[0].data.versionId).toBe('test-version-123');
      expect(receivedEvents2[0].data.versionId).toBe('test-version-123');
    });

    it('should handle event publishing when no subscribers exist', async () => {
      if (!redisClient?.isOpen) {
        console.warn('Skipping Redis test - Redis not available');
        return;
      }

      // Publish event without subscribers
      const testEvent = eventBus.createEvent(
        EventTypes.POLICY_VIOLATION,
        'test-service',
        { policyId: 'test-policy' }
      );

      // Should not throw error
      await expect(eventBus.publish(testEvent)).resolves.toBeUndefined();
    });

    it('should provide health status', async () => {
      if (!redisClient?.isOpen) {
        console.warn('Skipping Redis test - Redis not available');
        return;
      }

      expect(eventBus.isHealthy()).toBe(true);

      const stats = eventBus.getStats();
      expect(stats.isConnected).toBe(true);
      expect(Array.isArray(stats.subscribedEventTypes)).toBe(true);
      expect(typeof stats.handlerCount).toBe('number');
    });
  });

  describe('Service Authentication', () => {
    it('should generate and verify service tokens', () => {
      const serviceName = 'test-service';
      
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
      const serviceName = 'test-service';
      
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
      const serviceName = 'test-service';
      const token = authManager.generateServiceToken(serviceName);
      const decoded = authManager.verifyServiceToken(token!);

      expect(decoded).toBeTruthy();
      
      // Check if service has specific permissions
      const hasModelRead = authManager.hasPermission(decoded!, 'model.read');
      const hasInvalidPermission = authManager.hasPermission(decoded!, 'invalid.permission');
      
      expect(typeof hasModelRead).toBe('boolean');
      expect(hasInvalidPermission).toBe(false);
    });

    it('should refresh service credentials', () => {
      const serviceName = 'test-service';
      
      // Get initial token
      const initialToken = authManager.generateServiceToken(serviceName);
      expect(initialToken).toBeTruthy();

      // Refresh credentials
      const refreshed = authManager.refreshServiceCredentials(serviceName);
      expect(refreshed).toBe(true);

      // Generate new token (should be different)
      const newToken = authManager.generateServiceToken(serviceName);
      expect(newToken).toBeTruthy();
      expect(newToken).not.toBe(initialToken);
    });
  });

  describe('Service Client Integration', () => {
    let mockServer: any;
    const testPort = 9999;

    beforeAll(async () => {
      // Create a simple mock server for testing
      const express = await import('express');
      const app = express.default();
      
      app.use(express.json());
      
      app.get('/health', (req, res) => {
        res.json({ status: 'healthy' });
      });

      app.get('/test', (req, res) => {
        res.json({ message: 'test response', headers: req.headers });
      });

      app.post('/test', (req, res) => {
        res.json({ message: 'test post response', body: req.body });
      });

      app.get('/error', (req, res) => {
        res.status(500).json({ error: 'test error' });
      });

      app.get('/timeout', (req, res) => {
        // Don't respond to simulate timeout
      });

      mockServer = app.listen(testPort);
    });

    afterAll(async () => {
      if (mockServer) {
        mockServer.close();
      }
    });

    it('should create service client and make successful requests', async () => {
      const client = ServiceClientFactory.createClient('test-service', {
        baseURL: `http://localhost:${testPort}`,
        timeout: 5000,
        retries: 2,
        retryDelay: 100,
        circuitBreaker: {
          failureThreshold: 3,
          resetTimeout: 5000
        }
      });

      // Test GET request
      const response = await client.get('/test');
      expect(response.status).toBe(200);
      expect(response.data.message).toBe('test response');

      // Test POST request
      const postResponse = await client.post('/test', { data: 'test' });
      expect(postResponse.status).toBe(200);
      expect(postResponse.data.body.data).toBe('test');
    });

    it('should add authentication headers', async () => {
      const token = authManager.generateServiceToken('test-service');
      
      const client = ServiceClientFactory.createClient('auth-test-service', {
        baseURL: `http://localhost:${testPort}`,
        timeout: 5000,
        retries: 2,
        retryDelay: 100,
        circuitBreaker: {
          failureThreshold: 3,
          resetTimeout: 5000
        },
        authentication: {
          type: 'jwt',
          token: token!
        }
      });

      const response = await client.get('/test');
      expect(response.data.headers.authorization).toBe(`Bearer ${token}`);
    });

    it('should handle service errors', async () => {
      const client = ServiceClientFactory.createClient('error-test-service', {
        baseURL: `http://localhost:${testPort}`,
        timeout: 5000,
        retries: 1,
        retryDelay: 100,
        circuitBreaker: {
          failureThreshold: 3,
          resetTimeout: 5000
        }
      });

      await expect(client.get('/error')).rejects.toThrow();
    });

    it('should implement retry logic', async () => {
      const client = ServiceClientFactory.createClient('retry-test-service', {
        baseURL: `http://localhost:${testPort}`,
        timeout: 1000,
        retries: 2,
        retryDelay: 50,
        circuitBreaker: {
          failureThreshold: 5,
          resetTimeout: 5000
        }
      });

      // This should timeout and retry
      const startTime = Date.now();
      
      try {
        await client.get('/timeout');
      } catch (error) {
        const duration = Date.now() - startTime;
        // Should have taken time for retries
        expect(duration).toBeGreaterThan(1000); // At least one timeout
      }
    });

    it('should provide health status', () => {
      const client = ServiceClientFactory.getClient('test-service');
      expect(client).toBeTruthy();
      expect(client!.isHealthy()).toBe(true);

      const stats = client!.getCircuitBreakerStats();
      expect(stats).toBeTruthy();
      expect(typeof stats.state).toBe('string');
    });
  });

  describe('Circuit Breaker Integration', () => {
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
      expect(stats.state).toBe('closed');
      expect(stats.failureCount).toBe(0);
      expect(stats.successCount).toBe(0);

      circuitBreaker.recordFailure();
      const updatedStats = circuitBreaker.getStats();
      expect(updatedStats.failureCount).toBe(1);
    });
  });

  describe('End-to-End Workflow Tests', () => {
    let messagingManager: MessagingManager;

    beforeEach(async () => {
      if (!redisClient?.isOpen) {
        return;
      }

      const config = {
        redis: {
          url: process.env.TEST_REDIS_URL || 'redis://localhost:6379'
        },
        services: {
          'test-service': {
            baseURL: 'http://localhost:9999',
            timeout: 5000,
            retries: 2,
            retryDelay: 100,
            circuitBreaker: {
              failureThreshold: 3,
              resetTimeout: 5000
            }
          }
        }
      };

      messagingManager = new MessagingManager(config);
      await messagingManager.initialize();
    });

    afterEach(async () => {
      if (messagingManager) {
        await messagingManager.shutdown();
      }
    });

    it('should handle complete model creation workflow', async () => {
      if (!redisClient?.isOpen) {
        console.warn('Skipping Redis test - Redis not available');
        return;
      }

      const workflowEvents: any[] = [];

      // Subscribe to workflow events
      const eventBus = messagingManager.getEventBus();
      
      await eventBus.subscribe(EventTypes.MODEL_CREATED, async (event) => {
        workflowEvents.push({ type: 'model_created', event });
        
        // Simulate policy evaluation trigger
        const policyEvent = messagingManager.createEvent(
          EventTypes.POLICY_EVALUATED,
          'policy-engine',
          { modelId: event.data.modelId, passed: true }
        );
        await messagingManager.publishEvent(policyEvent);
      });

      await eventBus.subscribe(EventTypes.POLICY_EVALUATED, async (event) => {
        workflowEvents.push({ type: 'policy_evaluated', event });
      });

      // Trigger workflow
      const modelCreatedEvent = messagingManager.createEvent(
        EventTypes.MODEL_CREATED,
        'model-registry',
        { modelId: 'test-model-123', name: 'Test Model' },
        { userId: 'test-user' }
      );

      await messagingManager.publishEvent(modelCreatedEvent);

      // Wait for workflow completion
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(workflowEvents).toHaveLength(2);
      expect(workflowEvents[0].type).toBe('model_created');
      expect(workflowEvents[1].type).toBe('policy_evaluated');
      expect(workflowEvents[1].event.data.modelId).toBe('test-model-123');
    });

    it('should provide comprehensive health status', () => {
      if (!redisClient?.isOpen) {
        console.warn('Skipping Redis test - Redis not available');
        return;
      }

      const health = messagingManager.getHealthStatus();
      
      expect(health.isInitialized).toBe(true);
      expect(typeof health.eventBus).toBe('boolean');
      expect(typeof health.serviceClients).toBe('object');
    });
  });
});