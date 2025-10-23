import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PolicyEngineService } from '../../services/policyEngine/policyEngineService.js';
import { PolicyEvaluationEngine } from '../../services/policyEngine/policyEvaluationEngine.js';
import { DatabaseService } from '../../services/database/databaseService.js';
import { 
  CreatePolicyRequest, 
  UpdatePolicyRequest,
  EvaluatePolicyRequest,
  CreatePolicyExceptionRequest,
  PolicyStatus,
  PolicySeverity,
  PolicyEvaluationStatus,
  PolicyResultStatus,
  PolicyRuleDefinition
} from '../../types/index.js';
import crypto from 'crypto';

// Mock DatabaseService
const mockDb = {
  query: vi.fn(),
  transaction: vi.fn(),
  getClient: vi.fn(),
  close: vi.fn(),
  getPoolStatus: vi.fn()
} as unknown as DatabaseService;

// Mock PolicyEvaluationEngine
vi.mock('../../services/policyEngine/policyEvaluationEngine.js', () => ({
  PolicyEvaluationEngine: vi.fn().mockImplementation(() => ({
    executePolicy: vi.fn(),
    buildEvaluationContext: vi.fn()
  }))
}));

describe('PolicyEngineService', () => {
  let service: PolicyEngineService;
  let mockEvaluationEngine: any;

  beforeEach(() => {
    service = new PolicyEngineService(mockDb);
    mockEvaluationEngine = (service as any).evaluationEngine;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('createPolicy', () => {
    it('should create a new policy successfully', async () => {
      const request: CreatePolicyRequest = {
        name: 'Test Policy',
        description: 'A test policy for validation',
        version: '1.0.0',
        severity: PolicySeverity.MEDIUM,
        ruleDefinition: {
          conditions: [{
            type: 'field',
            field: 'riskTier',
            operator: 'equals',
            value: 'High'
          }],
          actions: [{
            type: 'block',
            severity: PolicySeverity.HIGH,
            message: 'High risk models require additional approval',
            blocking: true
          }]
        },
        metadata: { category: 'risk-management' }
      };

      const mockPolicyEntity = {
        id: 'policy-123',
        name: 'Test Policy',
        description: 'A test policy for validation',
        version: '1.0.0',
        status: PolicyStatus.DRAFT,
        severity: PolicySeverity.MEDIUM,
        rule_definition: JSON.stringify(request.ruleDefinition),
        metadata: JSON.stringify(request.metadata),
        created_by: 'user-123',
        created_at: new Date(),
        updated_at: new Date(),
        activated_at: null
      };

      mockDb.query = vi.fn()
        .mockResolvedValueOnce({ rows: [] }) // SET app.current_user_id
        .mockResolvedValueOnce({ rows: [mockPolicyEntity] }); // INSERT policy

      const result = await service.createPolicy(request, 'user-123');

      expect(result).toEqual({
        id: 'policy-123',
        name: 'Test Policy',
        description: 'A test policy for validation',
        version: '1.0.0',
        status: PolicyStatus.DRAFT,
        severity: PolicySeverity.MEDIUM,
        ruleDefinition: request.ruleDefinition,
        metadata: request.metadata,
        createdBy: 'user-123',
        createdAt: mockPolicyEntity.created_at,
        updatedAt: mockPolicyEntity.updated_at,
        activatedAt: null
      });

      expect(mockDb.query).toHaveBeenCalledTimes(2);
    });

    it('should throw error for duplicate policy name/version', async () => {
      const request: CreatePolicyRequest = {
        name: 'Existing Policy',
        description: 'A policy that already exists',
        version: '1.0.0',
        severity: PolicySeverity.LOW,
        ruleDefinition: {
          conditions: [{
            type: 'field',
            field: 'state',
            operator: 'equals',
            value: 'production'
          }],
          actions: [{
            type: 'warn',
            severity: PolicySeverity.LOW,
            message: 'Production deployment detected',
            blocking: false
          }]
        }
      };

      const duplicateError = new Error('Duplicate key violation');
      (duplicateError as any).code = '23505';

      mockDb.query = vi.fn()
        .mockResolvedValueOnce({ rows: [] }) // SET app.current_user_id
        .mockRejectedValueOnce(duplicateError); // INSERT policy fails

      await expect(service.createPolicy(request, 'user-123'))
        .rejects.toThrow('Policy Existing Policy version 1.0.0 already exists');
    });
  });

  describe('getPolicyById', () => {
    it('should return policy when found', async () => {
      const mockPolicyEntity = {
        id: 'policy-123',
        name: 'Test Policy',
        description: 'A test policy',
        version: '1.0.0',
        status: PolicyStatus.ACTIVE,
        severity: PolicySeverity.MEDIUM,
        rule_definition: JSON.stringify({
          conditions: [{ type: 'field', field: 'riskTier', operator: 'equals', value: 'High' }],
          actions: [{ type: 'block', severity: PolicySeverity.HIGH, message: 'Blocked', blocking: true }]
        }),
        metadata: JSON.stringify({}),
        created_by: 'user-123',
        created_at: new Date(),
        updated_at: new Date(),
        activated_at: new Date()
      };

      mockDb.query = vi.fn().mockResolvedValueOnce({ rows: [mockPolicyEntity] });

      const result = await service.getPolicyById('policy-123');

      expect(result).toBeDefined();
      expect(result!.id).toBe('policy-123');
      expect(result!.name).toBe('Test Policy');
      expect(result!.status).toBe(PolicyStatus.ACTIVE);
    });

    it('should return null when policy not found', async () => {
      mockDb.query = vi.fn().mockResolvedValueOnce({ rows: [] });

      const result = await service.getPolicyById('nonexistent-policy');

      expect(result).toBeNull();
    });
  });

  describe('searchPolicies', () => {
    it('should return paginated policies with filters', async () => {
      const mockPolicies = [
        {
          id: 'policy-1',
          name: 'Policy 1',
          description: 'First policy',
          version: '1.0.0',
          status: PolicyStatus.ACTIVE,
          severity: PolicySeverity.HIGH,
          rule_definition: JSON.stringify({ conditions: [], actions: [] }),
          metadata: JSON.stringify({}),
          created_by: 'user-1',
          created_at: new Date(),
          updated_at: new Date(),
          activated_at: new Date()
        },
        {
          id: 'policy-2',
          name: 'Policy 2',
          description: 'Second policy',
          version: '1.0.0',
          status: PolicyStatus.ACTIVE,
          severity: PolicySeverity.MEDIUM,
          rule_definition: JSON.stringify({ conditions: [], actions: [] }),
          metadata: JSON.stringify({}),
          created_by: 'user-2',
          created_at: new Date(),
          updated_at: new Date(),
          activated_at: new Date()
        }
      ];

      mockDb.query = vi.fn()
        .mockResolvedValueOnce({ rows: [{ total: '2' }] }) // Count query
        .mockResolvedValueOnce({ rows: mockPolicies }); // Data query

      const filters = { status: PolicyStatus.ACTIVE };
      const result = await service.searchPolicies(filters, 1, 10);

      expect(result.total).toBe(2);
      expect(result.policies).toHaveLength(2);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(10);
    });
  });

  describe('updatePolicy', () => {
    it('should update policy successfully', async () => {
      const updates: UpdatePolicyRequest = {
        description: 'Updated description',
        status: PolicyStatus.ACTIVE,
        severity: PolicySeverity.HIGH
      };

      const mockUpdatedEntity = {
        id: 'policy-123',
        name: 'Test Policy',
        description: 'Updated description',
        version: '1.0.0',
        status: PolicyStatus.ACTIVE,
        severity: PolicySeverity.HIGH,
        rule_definition: JSON.stringify({ conditions: [], actions: [] }),
        metadata: JSON.stringify({}),
        created_by: 'user-123',
        created_at: new Date(),
        updated_at: new Date(),
        activated_at: new Date()
      };

      mockDb.query = vi.fn()
        .mockResolvedValueOnce({ rows: [] }) // SET app.current_user_id
        .mockResolvedValueOnce({ rows: [mockUpdatedEntity] }); // UPDATE policy

      const result = await service.updatePolicy('policy-123', updates, 'user-123');

      expect(result.description).toBe('Updated description');
      expect(result.status).toBe(PolicyStatus.ACTIVE);
      expect(result.severity).toBe(PolicySeverity.HIGH);
    });

    it('should throw error when policy not found', async () => {
      const updates: UpdatePolicyRequest = {
        description: 'Updated description'
      };

      mockDb.query = vi.fn()
        .mockResolvedValueOnce({ rows: [] }) // SET app.current_user_id
        .mockResolvedValueOnce({ rows: [] }); // UPDATE policy returns no rows

      await expect(service.updatePolicy('nonexistent-policy', updates, 'user-123'))
        .rejects.toThrow('Policy not found');
    });
  });

  describe('evaluatePolicies', () => {
    it('should evaluate policies for a version successfully', async () => {
      const request: EvaluatePolicyRequest = {
        versionId: 'version-123',
        dryRun: false,
        context: { environment: 'staging' }
      };

      const mockActivePolicies = [
        {
          id: 'policy-1',
          name: 'Risk Policy',
          description: 'Risk assessment policy',
          version: '1.0.0',
          status: PolicyStatus.ACTIVE,
          severity: PolicySeverity.HIGH,
          ruleDefinition: {
            conditions: [{ type: 'field', field: 'riskTier', operator: 'equals', value: 'High' }],
            actions: [{ type: 'block', severity: PolicySeverity.HIGH, message: 'High risk blocked', blocking: true }]
          },
          metadata: {},
          createdBy: 'user-1',
          createdAt: new Date(),
          updatedAt: new Date(),
          activatedAt: new Date()
        }
      ];

      const mockEvaluationResult = {
        policyId: 'policy-1',
        policyName: 'Risk Policy',
        results: [{
          id: 'result-1',
          evaluationId: 'eval-1',
          ruleName: 'condition_0_field_riskTier',
          status: PolicyResultStatus.PASS,
          message: 'Risk tier check passed',
          details: {},
          blocking: false,
          createdAt: new Date()
        }],
        overallStatus: PolicyResultStatus.PASS,
        blocking: false,
        executionTime: 100
      };

      // Mock database calls
      mockDb.query = vi.fn()
        .mockResolvedValueOnce({ rows: [] }) // SET app.current_user_id
        .mockResolvedValueOnce({ rows: [] }) // INSERT policy_evaluations
        .mockResolvedValueOnce({ rows: mockActivePolicies }); // Get active policies

      // Mock evaluation engine
      mockEvaluationEngine.buildEvaluationContext.mockResolvedValueOnce({
        versionId: 'version-123',
        modelData: {},
        versionData: {},
        artifacts: [],
        evaluations: [],
        metadata: {},
        userContext: request.context
      });

      mockEvaluationEngine.executePolicy.mockResolvedValueOnce(mockEvaluationResult);

      const result = await service.evaluatePolicies(request, 'user-123');

      expect(result.versionId).toBe('version-123');
      expect(result.totalPolicies).toBe(1);
      expect(result.passedPolicies).toBe(1);
      expect(result.failedPolicies).toBe(0);
      expect(result.overallStatus).toBe('pass');
      expect(result.results).toHaveLength(1);
    });

    it('should handle evaluation errors gracefully', async () => {
      const request: EvaluatePolicyRequest = {
        versionId: 'version-123',
        dryRun: false
      };

      mockDb.query = vi.fn()
        .mockResolvedValueOnce({ rows: [] }) // SET app.current_user_id
        .mockResolvedValueOnce({ rows: [] }) // INSERT policy_evaluations
        .mockResolvedValueOnce({ rows: [] }); // Get active policies - no policies found

      await expect(service.evaluatePolicies(request, 'user-123'))
        .rejects.toThrow('No policies found to evaluate');
    });
  });

  describe('createPolicyException', () => {
    it('should create policy exception successfully', async () => {
      const request: CreatePolicyExceptionRequest = {
        versionId: 'version-123',
        policyId: 'policy-123',
        justification: 'Emergency deployment required',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
      };

      const mockExceptionEntity = {
        id: 'exception-123',
        version_id: 'version-123',
        policy_id: 'policy-123',
        justification: 'Emergency deployment required',
        approved_by: 'user-123',
        expires_at: request.expiresAt,
        created_at: new Date()
      };

      mockDb.query = vi.fn()
        .mockResolvedValueOnce({ rows: [] }) // SET app.current_user_id
        .mockResolvedValueOnce({ rows: [mockExceptionEntity] }); // INSERT exception

      const result = await service.createPolicyException(request, 'user-123');

      expect(result.versionId).toBe('version-123');
      expect(result.policyId).toBe('policy-123');
      expect(result.justification).toBe('Emergency deployment required');
      expect(result.approvedBy).toBe('user-123');
    });

    it('should throw error for duplicate exception', async () => {
      const request: CreatePolicyExceptionRequest = {
        versionId: 'version-123',
        policyId: 'policy-123',
        justification: 'Duplicate exception'
      };

      const duplicateError = new Error('Duplicate key violation');
      (duplicateError as any).code = '23505';

      mockDb.query = vi.fn()
        .mockResolvedValueOnce({ rows: [] }) // SET app.current_user_id
        .mockRejectedValueOnce(duplicateError); // INSERT exception fails

      await expect(service.createPolicyException(request, 'user-123'))
        .rejects.toThrow('Policy exception already exists for this version and policy');
    });
  });

  describe('hasBlockingViolations', () => {
    it('should return false when no blocking violations exist', async () => {
      mockDb.query = vi.fn()
        .mockResolvedValueOnce({ rows: [] }) // Get exceptions
        .mockResolvedValueOnce({ rows: [] }); // Get blocking violations

      const result = await service.hasBlockingViolations('version-123');

      expect(result).toBe(false);
    });

    it('should return true when blocking violations exist without exceptions', async () => {
      mockDb.query = vi.fn()
        .mockResolvedValueOnce({ rows: [] }) // Get exceptions (none)
        .mockResolvedValueOnce({ rows: [{ policy_id: 'policy-1' }] }); // Get blocking violations

      const result = await service.hasBlockingViolations('version-123');

      expect(result).toBe(true);
    });

    it('should return false when blocking violations have active exceptions', async () => {
      mockDb.query = vi.fn()
        .mockResolvedValueOnce({ rows: [{ policy_id: 'policy-1' }] }) // Get exceptions
        .mockResolvedValueOnce({ rows: [{ policy_id: 'policy-1' }] }); // Get blocking violations

      const result = await service.hasBlockingViolations('version-123');

      expect(result).toBe(false);
    });
  });

  describe('getActivePolicies', () => {
    it('should return only active policies ordered by severity', async () => {
      const mockActivePolicies = [
        {
          id: 'policy-1',
          name: 'Critical Policy',
          severity: PolicySeverity.CRITICAL,
          status: PolicyStatus.ACTIVE,
          created_at: new Date('2024-01-01')
        },
        {
          id: 'policy-2',
          name: 'High Policy',
          severity: PolicySeverity.HIGH,
          status: PolicyStatus.ACTIVE,
          created_at: new Date('2024-01-02')
        }
      ];

      mockDb.query = vi.fn().mockResolvedValueOnce({ rows: mockActivePolicies });

      const result = await service.getActivePolicies();

      expect(result).toHaveLength(2);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining("WHERE status = 'active'")
      );
    });
  });
});