import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PolicyBlockingService, StateTransitionRequest } from '../../services/policyEngine/policyBlockingService.js';
import { PolicyEngineService } from '../../services/policyEngine/policyEngineService.js';
import { PolicyNotificationService } from '../../services/policyEngine/policyNotificationService.js';
import { DatabaseService } from '../../services/database/databaseService.js';
import { VersionState, PolicyResultStatus } from '../../types/index.js';

// Mock services
const mockDb = {
  query: vi.fn(),
  transaction: vi.fn(),
  getClient: vi.fn(),
  close: vi.fn(),
  getPoolStatus: vi.fn()
} as unknown as DatabaseService;

const mockPolicyEngineService = {
  evaluatePolicies: vi.fn(),
  createPolicyException: vi.fn()
} as unknown as PolicyEngineService;

const mockNotificationService = {
  checkPromotionBlocking: vi.fn(),
  notifyPolicyViolations: vi.fn()
} as unknown as PolicyNotificationService;

describe('PolicyBlockingService', () => {
  let service: PolicyBlockingService;

  beforeEach(() => {
    service = new PolicyBlockingService(mockDb, mockPolicyEngineService, mockNotificationService);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('checkStateTransition', () => {
    it('should allow transition when no blocking violations exist', async () => {
      const request: StateTransitionRequest = {
        versionId: 'version-123',
        fromState: VersionState.APPROVED_STAGING,
        toState: VersionState.STAGING,
        userId: 'user-123'
      };

      const mockEvaluationSummary = {
        evaluationId: 'eval-123',
        versionId: 'version-123',
        totalPolicies: 2,
        passedPolicies: 2,
        failedPolicies: 0,
        warningPolicies: 0,
        blockingViolations: 0,
        overallStatus: 'pass' as const,
        results: []
      };

      const mockBlockingCheck = {
        blocked: false,
        reasons: [],
        blockingPolicies: []
      };

      (mockPolicyEngineService.evaluatePolicies as any).mockResolvedValueOnce(mockEvaluationSummary);
      (mockNotificationService.checkPromotionBlocking as any).mockResolvedValueOnce(mockBlockingCheck);

      const result = await service.checkStateTransition(request);

      expect(result.allowed).toBe(true);
      expect(result.blockingReasons).toHaveLength(0);
      expect(result.blockingPolicies).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it('should block transition when blocking violations exist', async () => {
      const request: StateTransitionRequest = {
        versionId: 'version-123',
        fromState: VersionState.APPROVED_PROD,
        toState: VersionState.PRODUCTION,
        userId: 'user-123'
      };

      const mockEvaluationSummary = {
        evaluationId: 'eval-123',
        versionId: 'version-123',
        totalPolicies: 2,
        passedPolicies: 1,
        failedPolicies: 1,
        warningPolicies: 0,
        blockingViolations: 1,
        overallStatus: 'fail' as const,
        results: [{
          policyId: 'policy-1',
          policyName: 'Security Policy',
          status: PolicyResultStatus.FAIL,
          results: [{
            id: 'result-1',
            evaluationId: 'eval-123',
            ruleName: 'security_check',
            status: PolicyResultStatus.FAIL,
            message: 'Security scan failed',
            details: {},
            blocking: true,
            createdAt: new Date()
          }],
          blocking: true
        }]
      };

      const mockBlockingCheck = {
        blocked: true,
        reasons: ['Security scan failed'],
        blockingPolicies: ['Security Policy']
      };

      (mockPolicyEngineService.evaluatePolicies as any).mockResolvedValueOnce(mockEvaluationSummary);
      (mockNotificationService.checkPromotionBlocking as any).mockResolvedValueOnce(mockBlockingCheck);

      const result = await service.checkStateTransition(request);

      expect(result.allowed).toBe(false);
      expect(result.blockingReasons).toContain('Security scan failed');
      expect(result.blockingPolicies).toContain('Security Policy');
    });

    it('should skip policy checks for certain transitions', async () => {
      const request: StateTransitionRequest = {
        versionId: 'version-123',
        fromState: VersionState.PRODUCTION,
        toState: VersionState.DEPRECATED,
        userId: 'user-123'
      };

      const result = await service.checkStateTransition(request);

      expect(result.allowed).toBe(true);
      expect(mockPolicyEngineService.evaluatePolicies).not.toHaveBeenCalled();
    });

    it('should allow bypass when bypassPolicies is true', async () => {
      const request: StateTransitionRequest = {
        versionId: 'version-123',
        fromState: VersionState.APPROVED_PROD,
        toState: VersionState.PRODUCTION,
        userId: 'user-123',
        bypassPolicies: true
      };

      const result = await service.checkStateTransition(request);

      expect(result.allowed).toBe(true);
      expect(mockPolicyEngineService.evaluatePolicies).not.toHaveBeenCalled();
    });
  });

  describe('getComplianceSummary', () => {
    it('should return compliance summary with score calculation', async () => {
      const mockEvalResult = {
        rows: [{
          result_count: '10',
          pass_count: '8',
          fail_count: '1',
          warning_count: '1',
          blocking_count: '0',
          completed_at: new Date()
        }]
      };

      const mockExceptionsResult = {
        rows: [{ exception_count: '2' }]
      };

      mockDb.query = vi.fn()
        .mockResolvedValueOnce(mockEvalResult)
        .mockResolvedValueOnce(mockExceptionsResult);

      const result = await service.getComplianceSummary('version-123');

      expect(result.totalPolicies).toBe(10);
      expect(result.passingPolicies).toBe(8);
      expect(result.failingPolicies).toBe(1);
      expect(result.warningPolicies).toBe(1);
      expect(result.blockingViolations).toBe(0);
      expect(result.exceptions).toBe(2);
      expect(result.complianceScore).toBe(80); // 8/10 * 100
    });

    it('should return default values when no evaluations exist', async () => {
      mockDb.query = vi.fn().mockResolvedValueOnce({ rows: [] });

      const result = await service.getComplianceSummary('version-123');

      expect(result.totalPolicies).toBe(0);
      expect(result.complianceScore).toBe(0);
    });
  });
});