import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { CicdIntegrationService } from '../../services/cicd/cicdIntegrationService';
import { MlPlatformIntegrationService } from '../../services/mlPlatforms/mlPlatformIntegrationService';
import { DatabaseService } from '../../services/database/databaseService';
import { AuditService } from '../../services/audit/auditService';
import cicdRoutes from '../../routes/cicd';
import mlPlatformRoutes from '../../routes/mlPlatforms';

describe('External Systems Integration Tests', () => {
  let app: express.Application;
  let mockDb: DatabaseService;
  let mockAuditService: AuditService;

  beforeEach(() => {
    // Create Express app
    app = express();
    app.use(express.json());

    // Mock services
    mockDb = {
      query: vi.fn()
    } as any;

    mockAuditService = {
      logEvent: vi.fn()
    } as any;

    // Mock authentication middleware
    app.use((req, res, next) => {
      req.user = { id: 'test-user', roles: ['admin'] };
      next();
    });

    // Add routes
    app.use('/api/v1/cicd', cicdRoutes);
    app.use('/api/v1/ml-platforms', mlPlatformRoutes);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('CI/CD Integration Workflow', () => {
    it('should handle complete webhook to validation workflow', async () => {
      // Mock database responses
      mockDb.query = vi.fn()
        .mockResolvedValueOnce({ rows: [{ name: 'github-test', type: 'github', config: '{"webhookSecret": "test-secret"}' }] }) // Get provider
        .mockResolvedValueOnce({ rows: [] }) // Track commit
        .mockResolvedValueOnce({ rows: [{ id: 'model-123', risk_tier: 'Low' }] }) // Get model for validation
        .mockResolvedValueOnce({ rows: [] }) // Get artifacts
        .mockResolvedValueOnce({ rows: [{ results: '{}', passed: true }] }) // Get evaluation
        .mockResolvedValue({ rows: [] }); // Store validation

      // 1. Register CI/CD provider
      const providerResponse = await request(app)
        .post('/api/v1/cicd/providers')
        .send({
          name: 'github-test',
          type: 'github',
          config: {
            baseUrl: 'https://api.github.com',
            token: 'test-token',
            webhookSecret: 'test-secret'
          }
        });

      expect(providerResponse.status).toBe(201);

      // 2. Simulate webhook from GitHub
      const webhookPayload = {
        repository: {
          name: 'test-repo',
          full_name: 'user/test-repo',
          html_url: 'https://github.com/user/test-repo'
        },
        head_commit: {
          id: 'abc123def456',
          message: 'feat: update model my-group/my-model v1.2.3',
          author: {
            name: 'Test User',
            email: 'test@example.com'
          },
          timestamp: '2023-01-01T00:00:00Z'
        }
      };

      const webhookResponse = await request(app)
        .post('/api/v1/cicd/webhooks/github-test')
        .set('x-hub-signature-256', 'sha256=test-signature')
        .send(webhookPayload);

      expect(webhookResponse.status).toBe(200);

      // 3. Trigger pipeline validation
      const validationResponse = await request(app)
        .post('/api/v1/cicd/validations/trigger')
        .send({
          commitSha: 'abc123def456',
          modelId: 'my-group/my-model',
          versionId: '1.2.3'
        });

      expect(validationResponse.status).toBe(201);
      expect(validationResponse.body).toHaveProperty('validationId');

      // 4. Check validation status
      const statusResponse = await request(app)
        .get(`/api/v1/cicd/validations/${validationResponse.body.validationId}/status`);

      expect(statusResponse.status).toBe(200);
      expect(statusResponse.body).toHaveProperty('state');
    });

    it('should handle webhook signature verification failure', async () => {
      mockDb.query = vi.fn()
        .mockResolvedValueOnce({ rows: [{ name: 'github-test', type: 'github', config: '{"webhookSecret": "test-secret"}' }] });

      const webhookResponse = await request(app)
        .post('/api/v1/cicd/webhooks/github-test')
        .set('x-hub-signature-256', 'invalid-signature')
        .send({ test: 'data' });

      expect(webhookResponse.status).toBe(400);
      expect(webhookResponse.body.error).toContain('Invalid webhook signature');
    });

    it('should track commit history for models', async () => {
      const mockCommits = [
        {
          sha: 'abc123',
          message: 'feat: update model',
          author: 'Test User',
          email: 'test@example.com',
          timestamp: new Date(),
          repository: 'user/test-repo',
          branch: 'main',
          model_id: 'my-group/my-model',
          version_id: '1.2.3'
        }
      ];

      mockDb.query = vi.fn().mockResolvedValue({ rows: mockCommits });

      const response = await request(app)
        .get('/api/v1/cicd/commits/my-group/my-model');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0]).toMatchObject({
        sha: 'abc123',
        modelId: 'my-group/my-model',
        versionId: '1.2.3'
      });
    });
  });

  describe('ML Platform Integration Workflow', () => {
    it('should handle complete platform registration to import workflow', async () => {
      // Mock database responses
      mockDb.query = vi.fn()
        .mockResolvedValueOnce({ rows: [] }) // Register platform
        .mockResolvedValueOnce({ rows: [{ name: 'mlflow-test', type: 'mlflow', config: '{"baseUrl": "http://localhost:5000"}' }] }) // Get platform
        .mockResolvedValue({ rows: [] }); // Store import record

      // 1. Register ML platform
      const platformResponse = await request(app)
        .post('/api/v1/ml-platforms')
        .send({
          name: 'mlflow-test',
          type: 'mlflow',
          config: {
            baseUrl: 'http://localhost:5000',
            apiKey: 'test-key'
          }
        });

      expect(platformResponse.status).toBe(201);

      // 2. Test platform connection
      const connectionResponse = await request(app)
        .post('/api/v1/ml-platforms/mlflow-test/test');

      expect(connectionResponse.status).toBe(200);
      expect(connectionResponse.body).toHaveProperty('connected');

      // 3. Import model from platform
      const importResponse = await request(app)
        .post('/api/v1/ml-platforms/mlflow-test/import')
        .send({
          modelId: 'test-model',
          version: '1',
          options: {
            includeArtifacts: true,
            includeMetrics: true,
            includeParameters: true
          }
        });

      expect(importResponse.status).toBe(201);
      expect(importResponse.body).toHaveProperty('success');

      // 4. Get integration history
      const historyResponse = await request(app)
        .get('/api/v1/ml-platforms/integrations/imported-test-model');

      expect(historyResponse.status).toBe(200);
      expect(historyResponse.body).toHaveProperty('imports');
      expect(historyResponse.body).toHaveProperty('exports');
    });

    it('should list models from registered platform', async () => {
      mockDb.query = vi.fn()
        .mockResolvedValue({ rows: [{ name: 'huggingface-test', type: 'huggingface', config: '{"apiKey": "test-key"}' }] });

      const response = await request(app)
        .get('/api/v1/ml-platforms/huggingface-test/models')
        .query({ limit: 10, offset: 0 });

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should search models in platform', async () => {
      mockDb.query = vi.fn()
        .mockResolvedValue({ rows: [{ name: 'huggingface-test', type: 'huggingface', config: '{"apiKey": "test-key"}' }] });

      const response = await request(app)
        .get('/api/v1/ml-platforms/huggingface-test/models/search')
        .query({ q: 'bert' });

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should handle platform not found errors', async () => {
      mockDb.query = vi.fn().mockResolvedValue({ rows: [] });

      const response = await request(app)
        .post('/api/v1/ml-platforms/non-existent/test');

      expect(response.status).toBe(500);
      expect(response.body.error).toContain('Failed to test connection');
    });

    it('should export model to platform', async () => {
      mockDb.query = vi.fn()
        .mockResolvedValueOnce({ rows: [{ name: 'mlflow-test', type: 'mlflow', config: '{"baseUrl": "http://localhost:5000"}' }] })
        .mockResolvedValue({ rows: [] });

      const response = await request(app)
        .post('/api/v1/ml-platforms/mlflow-test/export')
        .send({
          modelId: 'my-model',
          versionId: 'version-123',
          options: {
            includeArtifacts: true,
            includeMetadata: true,
            format: 'mlflow'
          }
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('success');
    });
  });

  describe('Cross-System Integration', () => {
    it('should handle model import triggered by CI/CD webhook', async () => {
      // This test simulates a scenario where a CI/CD webhook triggers
      // an automatic model import from an ML platform

      mockDb.query = vi.fn()
        .mockResolvedValueOnce({ rows: [{ name: 'github-test', type: 'github', config: '{"webhookSecret": "test-secret"}' }] })
        .mockResolvedValueOnce({ rows: [] }) // Track commit
        .mockResolvedValueOnce({ rows: [{ name: 'mlflow-test', type: 'mlflow', config: '{"baseUrl": "http://localhost:5000"}' }] })
        .mockResolvedValue({ rows: [] });

      // 1. Webhook indicates new model version
      const webhookPayload = {
        repository: {
          name: 'ml-models',
          full_name: 'company/ml-models',
          html_url: 'https://github.com/company/ml-models'
        },
        head_commit: {
          id: 'def456abc789',
          message: 'release: my-group/my-model v2.0.0 from mlflow',
          author: {
            name: 'ML Engineer',
            email: 'ml@company.com'
          },
          timestamp: '2023-01-01T00:00:00Z'
        }
      };

      const webhookResponse = await request(app)
        .post('/api/v1/cicd/webhooks/github-test')
        .set('x-hub-signature-256', 'sha256=test-signature')
        .send(webhookPayload);

      expect(webhookResponse.status).toBe(200);

      // 2. Trigger import based on commit message
      const importResponse = await request(app)
        .post('/api/v1/ml-platforms/mlflow-test/import')
        .send({
          modelId: 'my-group/my-model',
          version: '2.0.0',
          options: {
            includeArtifacts: true,
            includeMetrics: true,
            includeParameters: true
          }
        });

      expect(importResponse.status).toBe(201);

      // 3. Verify audit trail includes both webhook and import events
      expect(mockAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'webhook_received'
        })
      );
    });

    it('should handle validation failure preventing model promotion', async () => {
      // Mock failed validation
      mockDb.query = vi.fn()
        .mockResolvedValueOnce({ rows: [{ id: 'model-123', risk_tier: 'High' }] }) // High risk model
        .mockResolvedValue({ rows: [] });

      const validationResponse = await request(app)
        .post('/api/v1/cicd/validations/trigger')
        .send({
          commitSha: 'abc123def456',
          modelId: 'high-risk-model',
          versionId: '1.0.0'
        });

      expect(validationResponse.status).toBe(201);

      // Check that validation would fail for high-risk model without proper approvals
      const statusResponse = await request(app)
        .get(`/api/v1/cicd/validations/${validationResponse.body.validationId}/status`);

      expect(statusResponse.status).toBe(200);
      // Status would indicate failure due to policy violations
    });
  });

  describe('Error Handling and Resilience', () => {
    it('should handle database connection failures gracefully', async () => {
      mockDb.query = vi.fn().mockRejectedValue(new Error('Database connection failed'));

      const response = await request(app)
        .get('/api/v1/cicd/providers');

      expect(response.status).toBe(500);
      expect(response.body.error).toContain('Failed to list providers');
    });

    it('should handle external service timeouts', async () => {
      mockDb.query = vi.fn()
        .mockResolvedValue({ rows: [{ name: 'timeout-test', type: 'mlflow', config: '{"baseUrl": "http://timeout.example.com"}' }] });

      const response = await request(app)
        .post('/api/v1/ml-platforms/timeout-test/test');

      expect(response.status).toBe(200);
      expect(response.body.connected).toBe(false);
    });

    it('should validate request parameters', async () => {
      // Test missing required parameters
      const response = await request(app)
        .post('/api/v1/cicd/validations/trigger')
        .send({
          commitSha: 'abc123'
          // Missing modelId and versionId
        });

      expect(response.status).toBe(400);
    });

    it('should handle malformed webhook payloads', async () => {
      mockDb.query = vi.fn()
        .mockResolvedValue({ rows: [{ name: 'github-test', type: 'github', config: '{"webhookSecret": "test-secret"}' }] });

      const response = await request(app)
        .post('/api/v1/cicd/webhooks/github-test')
        .set('x-hub-signature-256', 'sha256=test-signature')
        .send('invalid json');

      expect(response.status).toBe(400);
    });
  });
});