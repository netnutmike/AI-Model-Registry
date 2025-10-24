import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PipelineValidationService } from '../../services/cicd/pipelineValidationService';
import { DatabaseService } from '../../services/database/databaseService';
import { PolicyEngineService } from '../../services/policyEngine/policyEngineService';
import { AuditService } from '../../services/audit/auditService';

describe('PipelineValidationService', () => {
  let pipelineValidationService: PipelineValidationService;
  let mockDb: DatabaseService;
  let mockPolicyEngine: PolicyEngineService;
  let mockAuditService: AuditService;

  beforeEach(() => {
    mockDb = {
      query: vi.fn()
    } as any;

    mockPolicyEngine = {
      evaluateModel: vi.fn()
    } as any;

    mockAuditService = {
      logEvent: vi.fn()
    } as any;

    pipelineValidationService = new PipelineValidationService(
      mockDb,
      mockPolicyEngine,
      mockAuditService
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('validateInPipeline', () => {
    it('should run complete validation pipeline successfully', async () => {
      // Mock model version query
      const mockModelVersion = {
        id: 'version-123',
        model_id: 'model-123',
        risk_tier: 'Medium',
        group_name: 'my-group',
        name: 'my-model'
      };
      
      // Mock artifacts query
      const mockArtifacts = [
        {
          id: 'artifact-1',
          type: 'weights',
          uri: 's3://bucket/model.bin',
          sha256: 'a'.repeat(64),
          license: 'MIT'
        }
      ];

      // Mock evaluation query
      const mockEvaluation = {
        results: { accuracy: 0.95, f1_score: 0.92 },
        thresholds: { accuracy: 0.90, f1_score: 0.85 },
        passed: true
      };

      mockDb.query = vi.fn()
        .mockResolvedValueOnce({ rows: [mockModelVersion] }) // Model version query
        .mockResolvedValueOnce({ rows: mockArtifacts }) // Artifacts query
        .mockResolvedValueOnce({ rows: [mockEvaluation] }) // Evaluation query
        .mockResolvedValue({ rows: [] }); // Store validation queries

      mockPolicyEngine.evaluateModel = vi.fn().mockResolvedValue({
        passed: true,
        violations: []
      });

      const result = await pipelineValidationService.validateInPipeline(
        'abc123',
        'model-123',
        'version-123',
        'user-123'
      );

      expect(result.status).toBe('passed');
      expect(result.checks.policyValidation).toBe(true);
      expect(result.checks.securityScan).toBe(true);
      expect(result.checks.qualityGates).toBe(true);

      // Verify audit logging
      expect(mockAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'pipeline_validation_started'
        })
      );

      expect(mockAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'pipeline_validation_completed'
        })
      );
    });

    it('should fail validation when policy evaluation fails', async () => {
      const mockModelVersion = {
        id: 'version-123',
        model_id: 'model-123',
        risk_tier: 'High',
        group_name: 'my-group',
        name: 'my-model'
      };

      mockDb.query = vi.fn()
        .mockResolvedValueOnce({ rows: [mockModelVersion] })
        .mockResolvedValue({ rows: [] });

      mockPolicyEngine.evaluateModel = vi.fn().mockResolvedValue({
        passed: false,
        violations: [
          { message: 'Model requires security review for High risk tier' }
        ]
      });

      const result = await pipelineValidationService.validateInPipeline(
        'abc123',
        'model-123',
        'version-123'
      );

      expect(result.status).toBe('failed');
      expect(result.checks.policyValidation).toBe(false);
      expect(result.results.policyViolations).toContain(
        'Model requires security review for High risk tier'
      );
    });

    it('should fail validation when security scan finds issues', async () => {
      const mockModelVersion = {
        id: 'version-123',
        model_id: 'model-123',
        risk_tier: 'Low',
        group_name: 'my-group',
        name: 'my-model'
      };

      const mockArtifacts = [
        {
          id: 'artifact-1',
          type: 'weights',
          uri: 's3://bucket/model.bin',
          sha256: 'invalid-checksum',
          license: 'GPL-3.0' // Prohibited license
        }
      ];

      mockDb.query = vi.fn()
        .mockResolvedValueOnce({ rows: [mockModelVersion] })
        .mockResolvedValueOnce({ rows: mockArtifacts })
        .mockResolvedValue({ rows: [] });

      mockPolicyEngine.evaluateModel = vi.fn().mockResolvedValue({
        passed: true,
        violations: []
      });

      const result = await pipelineValidationService.validateInPipeline(
        'abc123',
        'model-123',
        'version-123'
      );

      expect(result.status).toBe('failed');
      expect(result.checks.securityScan).toBe(false);
      expect(result.results.securityIssues).toContain(
        'Artifact artifact-1 uses prohibited license: GPL-3.0'
      );
      expect(result.results.securityIssues).toContain(
        'Artifact artifact-1 has invalid SHA256 checksum'
      );
    });

    it('should fail validation when quality gates are not met', async () => {
      const mockModelVersion = {
        id: 'version-123',
        model_id: 'model-123',
        risk_tier: 'Low',
        group_name: 'my-group',
        name: 'my-model'
      };

      const mockEvaluation = {
        results: { accuracy: 0.75, f1_score: 0.70 },
        thresholds: { accuracy: 0.90, f1_score: 0.85 },
        passed: false
      };

      mockDb.query = vi.fn()
        .mockResolvedValueOnce({ rows: [mockModelVersion] })
        .mockResolvedValueOnce({ rows: [] }) // No artifacts
        .mockResolvedValueOnce({ rows: [mockEvaluation] })
        .mockResolvedValue({ rows: [] });

      mockPolicyEngine.evaluateModel = vi.fn().mockResolvedValue({
        passed: true,
        violations: []
      });

      const result = await pipelineValidationService.validateInPipeline(
        'abc123',
        'model-123',
        'version-123'
      );

      expect(result.status).toBe('failed');
      expect(result.checks.qualityGates).toBe(false);
    });

    it('should handle validation errors gracefully', async () => {
      mockDb.query = vi.fn().mockRejectedValue(new Error('Database error'));

      const result = await pipelineValidationService.validateInPipeline(
        'abc123',
        'model-123',
        'version-123'
      );

      expect(result.status).toBe('failed');
      expect(result.results.policyViolations).toContain(
        'Validation error: Database error'
      );

      expect(mockAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'pipeline_validation_error'
        })
      );
    });
  });

  describe('getPipelineValidation', () => {
    it('should retrieve validation result by ID', async () => {
      const mockValidation = {
        id: 'validation-123',
        commit_sha: 'abc123',
        model_id: 'model-123',
        version_id: 'version-123',
        status: 'passed',
        checks: JSON.stringify({ policyValidation: true, securityScan: true, qualityGates: true }),
        results: JSON.stringify({ policyViolations: [], securityIssues: [], qualityMetrics: {} }),
        created_at: new Date(),
        completed_at: new Date()
      };

      mockDb.query = vi.fn().mockResolvedValue({ rows: [mockValidation] });

      const result = await pipelineValidationService.getPipelineValidation('validation-123');

      expect(result).toMatchObject({
        id: 'validation-123',
        commitSha: 'abc123',
        modelId: 'model-123',
        versionId: 'version-123',
        status: 'passed'
      });
    });

    it('should return null for non-existent validation', async () => {
      mockDb.query = vi.fn().mockResolvedValue({ rows: [] });

      const result = await pipelineValidationService.getPipelineValidation('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('generateStatusCheck', () => {
    it('should generate success status for passed validation', () => {
      const validation = {
        id: 'validation-123',
        commitSha: 'abc123',
        modelId: 'model-123',
        versionId: 'version-123',
        status: 'passed' as const,
        checks: { policyValidation: true, securityScan: true, qualityGates: true },
        results: { policyViolations: [], securityIssues: [], qualityMetrics: {} },
        createdAt: new Date(),
        completedAt: new Date()
      };

      const statusCheck = pipelineValidationService.generateStatusCheck(validation);

      expect(statusCheck).toEqual({
        state: 'success',
        description: 'All governance checks passed'
      });
    });

    it('should generate failure status for failed validation', () => {
      const validation = {
        id: 'validation-123',
        commitSha: 'abc123',
        modelId: 'model-123',
        versionId: 'version-123',
        status: 'failed' as const,
        checks: { policyValidation: false, securityScan: true, qualityGates: false },
        results: { policyViolations: [], securityIssues: [], qualityMetrics: {} },
        createdAt: new Date(),
        completedAt: new Date()
      };

      const statusCheck = pipelineValidationService.generateStatusCheck(validation);

      expect(statusCheck).toEqual({
        state: 'failure',
        description: 'Failed checks: policyValidation, qualityGates'
      });
    });

    it('should generate pending status for running validation', () => {
      const validation = {
        id: 'validation-123',
        commitSha: 'abc123',
        modelId: 'model-123',
        versionId: 'version-123',
        status: 'running' as const,
        checks: { policyValidation: false, securityScan: false, qualityGates: false },
        results: { policyViolations: [], securityIssues: [], qualityMetrics: {} },
        createdAt: new Date()
      };

      const statusCheck = pipelineValidationService.generateStatusCheck(validation);

      expect(statusCheck).toEqual({
        state: 'pending',
        description: 'Model governance validation in progress'
      });
    });
  });
});