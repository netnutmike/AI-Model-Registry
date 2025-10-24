import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { APIGateway, GatewayConfig } from '../../gateway/apiGateway.js';
import { ServiceRegistry } from '../../gateway/serviceRegistry.js';
import { LoadBalancer, LoadBalancingStrategy } from '../../gateway/loadBalancer.js';

describe('API Gateway Integration Tests', () => {
  let gateway: APIGateway;
  let mockServices: any[] = [];
  const gatewayPort = 8888;
  const mockServicePorts = [9001, 9002, 9003];

  beforeAll(async () => {
    // Create mock backend services
    for (let i = 0; i < mockServicePorts.length; i++) {
      const app = express();
      app.use(express.json());

      const serviceId = i + 1;
      
      app.get('/health', (req, res) => {
        res.json({ 
          status: 'healthy', 
          service: `mock-service-${serviceId}`,
          timestamp: new Date().toISOString()
        });
      });

      app.get('/test', (req, res) => {
        res.json({ 
          message: `Response from service ${serviceId}`,
          headers: req.headers,
          service: `mock-service-${serviceId}`
        });
      });

      app.post('/test', (req, res) => {
        res.json({ 
          message: `POST response from service ${serviceId}`,
          body: req.body,
          service: `mock-service-${serviceId}`
        });
      });

      app.get('/slow', (req, res) => {
        setTimeout(() => {
          res.json({ message: `Slow response from service ${serviceId}` });
        }, 2000);
      });

      app.get('/error', (req, res) => {
        res.status(500).json({ error: `Error from service ${serviceId}` });
      });

      const server = app.listen(mockServicePorts[i]);
      mockServices.push(server);
    }

    // Wait for services to start
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  afterAll(async () => {
    // Clean up mock services
    for (const server of mockServices) {
      server.close();
    }

    if (gateway) {
      gateway.stop();
    }
  });

  beforeEach(() => {
    // Reset gateway for each test
    if (gateway) {
      gateway.stop();
    }
  });

  describe('Gateway Routing', () => {
    it('should route requests to healthy services', async () => {
      const config: GatewayConfig = {
        port: gatewayPort,
        services: [
          {
            name: 'test-service',
            path: '/api/v1/test',
            target: [`http://localhost:${mockServicePorts[0]}`],
            healthCheck: '/health',
            timeout: 5000,
            retries: 2,
            circuitBreaker: {
              failureThreshold: 3,
              resetTimeout: 10000
            }
          }
        ],
        rateLimit: {
          windowMs: 60000,
          max: 100
        },
        logging: {
          level: 'error',
          format: 'json'
        }
      };

      gateway = new APIGateway(config);
      gateway.start();

      // Wait for gateway to start and health checks to complete
      await new Promise(resolve => setTimeout(resolve, 500));

      const response = await request(gateway.getApp())
        .get('/api/v1/test/test')
        .expect(200);

      expect(response.body.message).toContain('Response from service');
      expect(response.body.service).toBe('mock-service-1');
    });

    it('should load balance between multiple service instances', async () => {
      const config: GatewayConfig = {
        port: gatewayPort,
        services: [
          {
            name: 'load-balanced-service',
            path: '/api/v1/lb',
            target: [
              `http://localhost:${mockServicePorts[0]}`,
              `http://localhost:${mockServicePorts[1]}`,
              `http://localhost:${mockServicePorts[2]}`
            ],
            healthCheck: '/health',
            timeout: 5000,
            retries: 2,
            circuitBreaker: {
              failureThreshold: 3,
              resetTimeout: 10000
            }
          }
        ],
        rateLimit: {
          windowMs: 60000,
          max: 100
        },
        logging: {
          level: 'error',
          format: 'json'
        }
      };

      gateway = new APIGateway(config);
      gateway.start();

      // Wait for health checks
      await new Promise(resolve => setTimeout(resolve, 500));

      const responses = new Set();
      
      // Make multiple requests to see load balancing
      for (let i = 0; i < 6; i++) {
        const response = await request(gateway.getApp())
          .get('/api/v1/lb/test')
          .expect(200);
        
        responses.add(response.body.service);
      }

      // Should have responses from multiple services
      expect(responses.size).toBeGreaterThan(1);
    });

    it('should handle POST requests with body', async () => {
      const config: GatewayConfig = {
        port: gatewayPort,
        services: [
          {
            name: 'post-service',
            path: '/api/v1/post',
            target: [`http://localhost:${mockServicePorts[0]}`],
            healthCheck: '/health',
            timeout: 5000,
            retries: 2,
            circuitBreaker: {
              failureThreshold: 3,
              resetTimeout: 10000
            }
          }
        ],
        rateLimit: {
          windowMs: 60000,
          max: 100
        },
        logging: {
          level: 'error',
          format: 'json'
        }
      };

      gateway = new APIGateway(config);
      gateway.start();

      await new Promise(resolve => setTimeout(resolve, 500));

      const testData = { message: 'test data', value: 123 };

      const response = await request(gateway.getApp())
        .post('/api/v1/post/test')
        .send(testData)
        .expect(200);

      expect(response.body.body).toEqual(testData);
      expect(response.body.service).toBe('mock-service-1');
    });

    it('should return 404 for unknown routes', async () => {
      const config: GatewayConfig = {
        port: gatewayPort,
        services: [],
        rateLimit: {
          windowMs: 60000,
          max: 100
        },
        logging: {
          level: 'error',
          format: 'json'
        }
      };

      gateway = new APIGateway(config);
      gateway.start();

      await request(gateway.getApp())
        .get('/unknown/route')
        .expect(404);
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limits', async () => {
      const config: GatewayConfig = {
        port: gatewayPort,
        services: [
          {
            name: 'rate-limited-service',
            path: '/api/v1/limited',
            target: [`http://localhost:${mockServicePorts[0]}`],
            healthCheck: '/health',
            timeout: 5000,
            retries: 2,
            circuitBreaker: {
              failureThreshold: 3,
              resetTimeout: 10000
            }
          }
        ],
        rateLimit: {
          windowMs: 60000,
          max: 2 // Very low limit for testing
        },
        logging: {
          level: 'error',
          format: 'json'
        }
      };

      gateway = new APIGateway(config);
      gateway.start();

      await new Promise(resolve => setTimeout(resolve, 500));

      // First two requests should succeed
      await request(gateway.getApp())
        .get('/api/v1/limited/test')
        .expect(200);

      await request(gateway.getApp())
        .get('/api/v1/limited/test')
        .expect(200);

      // Third request should be rate limited
      await request(gateway.getApp())
        .get('/api/v1/limited/test')
        .expect(429);
    });
  });

  describe('Health Checks and Service Discovery', () => {
    it('should provide gateway health status', async () => {
      const config: GatewayConfig = {
        port: gatewayPort,
        services: [
          {
            name: 'health-service',
            path: '/api/v1/health',
            target: [`http://localhost:${mockServicePorts[0]}`],
            healthCheck: '/health',
            timeout: 5000,
            retries: 2,
            circuitBreaker: {
              failureThreshold: 3,
              resetTimeout: 10000
            }
          }
        ],
        rateLimit: {
          windowMs: 60000,
          max: 100
        },
        logging: {
          level: 'error',
          format: 'json'
        }
      };

      gateway = new APIGateway(config);
      gateway.start();

      await new Promise(resolve => setTimeout(resolve, 500));

      const response = await request(gateway.getApp())
        .get('/health')
        .expect(200);

      expect(response.body.gateway).toBe('healthy');
      expect(Array.isArray(response.body.services)).toBe(true);
      expect(response.body.services[0].name).toBe('health-service');
    });

    it('should provide service discovery information', async () => {
      const config: GatewayConfig = {
        port: gatewayPort,
        services: [
          {
            name: 'discovery-service',
            path: '/api/v1/discovery',
            target: [
              `http://localhost:${mockServicePorts[0]}`,
              `http://localhost:${mockServicePorts[1]}`
            ],
            healthCheck: '/health',
            timeout: 5000,
            retries: 2,
            circuitBreaker: {
              failureThreshold: 3,
              resetTimeout: 10000
            }
          }
        ],
        rateLimit: {
          windowMs: 60000,
          max: 100
        },
        logging: {
          level: 'error',
          format: 'json'
        }
      };

      gateway = new APIGateway(config);
      gateway.start();

      await new Promise(resolve => setTimeout(resolve, 500));

      const response = await request(gateway.getApp())
        .get('/services')
        .expect(200);

      expect(Array.isArray(response.body.services)).toBe(true);
      expect(response.body.services[0].name).toBe('discovery-service');
      expect(response.body.services[0].instances).toBe(2);
    });
  });

  describe('Error Handling and Circuit Breaker', () => {
    it('should handle service errors gracefully', async () => {
      const config: GatewayConfig = {
        port: gatewayPort,
        services: [
          {
            name: 'error-service',
            path: '/api/v1/error',
            target: [`http://localhost:${mockServicePorts[0]}`],
            healthCheck: '/health',
            timeout: 5000,
            retries: 1,
            circuitBreaker: {
              failureThreshold: 5,
              resetTimeout: 10000
            }
          }
        ],
        rateLimit: {
          windowMs: 60000,
          max: 100
        },
        logging: {
          level: 'error',
          format: 'json'
        }
      };

      gateway = new APIGateway(config);
      gateway.start();

      await new Promise(resolve => setTimeout(resolve, 500));

      const response = await request(gateway.getApp())
        .get('/api/v1/error/error')
        .expect(503);

      expect(response.body.error.code).toBe('SERVICE_UNAVAILABLE');
    });

    it('should handle service timeouts', async () => {
      const config: GatewayConfig = {
        port: gatewayPort,
        services: [
          {
            name: 'timeout-service',
            path: '/api/v1/timeout',
            target: [`http://localhost:${mockServicePorts[0]}`],
            healthCheck: '/health',
            timeout: 1000, // Short timeout
            retries: 1,
            circuitBreaker: {
              failureThreshold: 5,
              resetTimeout: 10000
            }
          }
        ],
        rateLimit: {
          windowMs: 60000,
          max: 100
        },
        logging: {
          level: 'error',
          format: 'json'
        }
      };

      gateway = new APIGateway(config);
      gateway.start();

      await new Promise(resolve => setTimeout(resolve, 500));

      const response = await request(gateway.getApp())
        .get('/api/v1/timeout/slow')
        .expect(503);

      expect(response.body.error.code).toBe('SERVICE_UNAVAILABLE');
    });

    it('should handle unavailable services', async () => {
      const config: GatewayConfig = {
        port: gatewayPort,
        services: [
          {
            name: 'unavailable-service',
            path: '/api/v1/unavailable',
            target: ['http://localhost:99999'], // Non-existent service
            healthCheck: '/health',
            timeout: 1000,
            retries: 1,
            circuitBreaker: {
              failureThreshold: 1,
              resetTimeout: 10000
            }
          }
        ],
        rateLimit: {
          windowMs: 60000,
          max: 100
        },
        logging: {
          level: 'error',
          format: 'json'
        }
      };

      gateway = new APIGateway(config);
      gateway.start();

      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for health checks to fail

      const response = await request(gateway.getApp())
        .get('/api/v1/unavailable/test')
        .expect(503);

      expect(response.body.error.code).toBe('CIRCUIT_BREAKER_OPEN');
    });
  });
});

describe('Service Registry Integration Tests', () => {
  let serviceRegistry: ServiceRegistry;

  beforeEach(() => {
    serviceRegistry = new ServiceRegistry();
  });

  afterEach(() => {
    serviceRegistry.stopHealthChecking();
  });

  it('should register and track service instances', () => {
    serviceRegistry.registerService({
      name: 'test-service',
      url: 'http://localhost:8001',
      healthCheckUrl: 'http://localhost:8001/health',
      timeout: 5000
    });

    const service = serviceRegistry.getService('test-service');
    expect(service).toBeTruthy();
    expect(service!.name).toBe('test-service');
    expect(service!.instances).toHaveLength(1);
    expect(service!.instances[0].url).toBe('http://localhost:8001');
  });

  it('should handle multiple instances of same service', () => {
    serviceRegistry.registerService({
      name: 'multi-service',
      url: 'http://localhost:8001',
      healthCheckUrl: 'http://localhost:8001/health',
      timeout: 5000
    });

    serviceRegistry.registerService({
      name: 'multi-service',
      url: 'http://localhost:8002',
      healthCheckUrl: 'http://localhost:8002/health',
      timeout: 5000
    });

    const service = serviceRegistry.getService('multi-service');
    expect(service!.instances).toHaveLength(2);
  });

  it('should deregister service instances', () => {
    serviceRegistry.registerService({
      name: 'dereg-service',
      url: 'http://localhost:8001',
      healthCheckUrl: 'http://localhost:8001/health',
      timeout: 5000
    });

    let service = serviceRegistry.getService('dereg-service');
    expect(service!.instances).toHaveLength(1);

    serviceRegistry.deregisterService('dereg-service', 'http://localhost:8001');
    service = serviceRegistry.getService('dereg-service');
    expect(service).toBeUndefined();
  });

  it('should provide service statistics', () => {
    serviceRegistry.registerService({
      name: 'stats-service',
      url: 'http://localhost:8001',
      healthCheckUrl: 'http://localhost:8001/health',
      timeout: 5000
    });

    const stats = serviceRegistry.getServiceStats();
    expect(stats['stats-service']).toBeTruthy();
    expect(stats['stats-service'].totalInstances).toBe(1);
    expect(stats['stats-service'].healthyInstances).toBe(0); // Initially unhealthy until health check
  });
});

describe('Load Balancer Integration Tests', () => {
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
});