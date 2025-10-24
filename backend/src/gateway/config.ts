import { GatewayConfig } from './apiGateway.js';

export const gatewayConfig: GatewayConfig = {
  port: parseInt(process.env.GATEWAY_PORT || '8000'),
  services: [
    {
      name: 'auth',
      path: '/api/v1/auth',
      target: [
        process.env.AUTH_SERVICE_URL || 'http://localhost:8001'
      ],
      healthCheck: '/health',
      timeout: 5000,
      retries: 3,
      circuitBreaker: {
        failureThreshold: 5,
        resetTimeout: 60000
      }
    },
    {
      name: 'model-registry',
      path: '/api/v1/models',
      target: [
        process.env.MODEL_REGISTRY_SERVICE_URL || 'http://localhost:8002'
      ],
      healthCheck: '/health',
      timeout: 10000,
      retries: 3,
      circuitBreaker: {
        failureThreshold: 5,
        resetTimeout: 60000
      }
    },
    {
      name: 'policy-engine',
      path: '/api/v1/policies',
      target: [
        process.env.POLICY_ENGINE_SERVICE_URL || 'http://localhost:8003'
      ],
      healthCheck: '/health',
      timeout: 5000,
      retries: 3,
      circuitBreaker: {
        failureThreshold: 5,
        resetTimeout: 60000
      }
    },
    {
      name: 'evaluation',
      path: '/api/v1/evaluations',
      target: [
        process.env.EVALUATION_SERVICE_URL || 'http://localhost:8004'
      ],
      healthCheck: '/health',
      timeout: 15000,
      retries: 2,
      circuitBreaker: {
        failureThreshold: 3,
        resetTimeout: 120000
      }
    },
    {
      name: 'deployment',
      path: '/api/v1/deployments',
      target: [
        process.env.DEPLOYMENT_SERVICE_URL || 'http://localhost:8005'
      ],
      healthCheck: '/health',
      timeout: 10000,
      retries: 3,
      circuitBreaker: {
        failureThreshold: 5,
        resetTimeout: 60000
      }
    },
    {
      name: 'audit',
      path: '/api/v1/audit',
      target: [
        process.env.AUDIT_SERVICE_URL || 'http://localhost:8006'
      ],
      healthCheck: '/health',
      timeout: 5000,
      retries: 3,
      circuitBreaker: {
        failureThreshold: 5,
        resetTimeout: 60000
      }
    }
  ],
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX || '1000') // limit each IP to 1000 requests per windowMs
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: 'json'
  }
};

export const microserviceConfig = {
  auth: {
    port: parseInt(process.env.AUTH_SERVICE_PORT || '8001'),
    name: 'Authentication Service'
  },
  modelRegistry: {
    port: parseInt(process.env.MODEL_REGISTRY_SERVICE_PORT || '8002'),
    name: 'Model Registry Service'
  },
  policyEngine: {
    port: parseInt(process.env.POLICY_ENGINE_SERVICE_PORT || '8003'),
    name: 'Policy Engine Service'
  },
  evaluation: {
    port: parseInt(process.env.EVALUATION_SERVICE_PORT || '8004'),
    name: 'Evaluation Service'
  },
  deployment: {
    port: parseInt(process.env.DEPLOYMENT_SERVICE_PORT || '8005'),
    name: 'Deployment Service'
  },
  audit: {
    port: parseInt(process.env.AUDIT_SERVICE_PORT || '8006'),
    name: 'Audit Service'
  }
};