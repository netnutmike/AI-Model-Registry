import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PolicyEvaluationEngine, EvaluationContext } from '../../services/policyEngine/policyEvaluationEngine.js';
import { DatabaseService } from '../../services/database/databaseService.js';
import { 
  Policy,
  PolicyStatus,
  PolicySeverity,
  PolicyResultStatus,
  PolicyCondition,
  PolicyAction
} from '../../types/index.js';

// Mock DatabaseService
const mockDb = {
  query: vi.fn(),
  transaction: vi.fn(),
  getClient: vi.fn(),
  close: vi.fn(),
  getPoolStatus: vi.fn()
} as unknown as DatabaseService;

describe('PolicyEvaluationEngine', () => {
  let engine: PolicyEvaluationEngine;

  beforeEach(() => {
    engine = new PolicyEvaluationEngine(mockDb);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('executePolicy', () => {
    it('should execute policy with passing conditions', async () => {
      const policy: Policy = {
        id: 'policy-1',
        name: 'Risk Tier Policy',
        description: 'Check risk tier',
        version: '1.0.0',
        status: PolicyStatus.ACTIVE,
        severity: PolicySeverity.MEDIUM,
        ruleDefinition: {
          conditions: [{
            type: 'field',
            field: 'risk_tier',
            operator: 'equals',
            value: 'Low',
            description: 'Risk tier must be Low'
          }],
          actions: [{
            type: 'warn',
            severity: PolicySeverity.MEDIUM,
            message: 'Risk tier validation',
            blocking: false
          }]
        },
        metadata: {},
        createdBy: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const context: EvaluationContext = {
        versionId: 'version-1',
        modelData: { riskTier: 'Low' },
        versionData: { risk_tier: 'Low', metadata: {} },
        artifacts: [],
        evaluations: [],
        metadata: {},
        userContext: {}
      };

      mockDb.query = vi.fn().mockResolvedValueOnce({ rows: [] }); // Store results

      const result = await engine.executePolicy(policy, context, false);

      expect(result.policyId).toBe('policy-1');
      expect(result.policyName).toBe('Risk Tier Policy');
      expect(result.overallStatus).toBe(PolicyResultStatus.PASS);
      expect(result.blocking).toBe(false);
      expect(result.results).toHaveLength(1);
      expect(result.results[0].status).toBe(PolicyResultStatus.PASS);
    });

    it('should execute policy with failing conditions and blocking actions', async () => {
      const policy: Policy = {
        id: 'policy-2',
        name: 'Security Policy',
        description: 'Security validation',
        version: '1.0.0',
        status: PolicyStatus.ACTIVE,
        severity: PolicySeverity.HIGH,
        ruleDefinition: {
          conditions: [{
            type: 'field',
            field: 'risk_tier',
            operator: 'not_equals',
            value: 'High',
            description: 'High risk models are not allowed'
          }],
          actions: [{
            type: 'block',
            severity: PolicySeverity.HIGH,
            message: 'High risk models require special approval',
            blocking: true
          }]
        },
        metadata: {},
        createdBy: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const context: EvaluationContext = {
        versionId: 'version-1',
        modelData: { riskTier: 'High' },
        versionData: { risk_tier: 'High', metadata: {} },
        artifacts: [],
        evaluations: [],
        metadata: {},
        userContext: {}
      };

      mockDb.query = vi.fn().mockResolvedValueOnce({ rows: [] }); // Store results

      const result = await engine.executePolicy(policy, context, false);

      expect(result.overallStatus).toBe(PolicyResultStatus.FAIL);
      expect(result.blocking).toBe(true);
      expect(result.results).toHaveLength(2); // 1 condition + 1 action
      expect(result.results[0].status).toBe(PolicyResultStatus.FAIL);
      expect(result.results[1].blocking).toBe(true);
    });

    it('should handle evaluation errors gracefully', async () => {
      const policy: Policy = {
        id: 'policy-3',
        name: 'Invalid Policy',
        description: 'Policy with invalid condition',
        version: '1.0.0',
        status: PolicyStatus.ACTIVE,
        severity: PolicySeverity.LOW,
        ruleDefinition: {
          conditions: [{
            type: 'invalid_type' as any,
            field: 'nonexistent_field',
            operator: 'equals',
            value: 'test'
          }],
          actions: [{
            type: 'warn',
            severity: PolicySeverity.LOW,
            message: 'Warning message',
            blocking: false
          }]
        },
        metadata: {},
        createdBy: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const context: EvaluationContext = {
        versionId: 'version-1',
        modelData: {},
        versionData: {},
        artifacts: [],
        evaluations: [],
        metadata: {},
        userContext: {}
      };

      const result = await engine.executePolicy(policy, context, true);

      expect(result.overallStatus).toBe(PolicyResultStatus.ERROR);
      expect(result.blocking).toBe(false);
      expect(result.results).toHaveLength(1);
      expect(result.results[0].status).toBe(PolicyResultStatus.ERROR);
    });

    it('should skip storing results in dry run mode', async () => {
      const policy: Policy = {
        id: 'policy-4',
        name: 'Dry Run Policy',
        description: 'Policy for dry run test',
        version: '1.0.0',
        status: PolicyStatus.ACTIVE,
        severity: PolicySeverity.LOW,
        ruleDefinition: {
          conditions: [{
            type: 'field',
            field: 'state',
            operator: 'equals',
            value: 'draft'
          }],
          actions: [{
            type: 'log',
            severity: PolicySeverity.LOW,
            message: 'Draft state detected',
            blocking: false
          }]
        },
        metadata: {},
        createdBy: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const context: EvaluationContext = {
        versionId: 'version-1',
        modelData: {},
        versionData: { state: 'draft' },
        artifacts: [],
        evaluations: [],
        metadata: {},
        userContext: {}
      };

      const result = await engine.executePolicy(policy, context, true);

      expect(result.overallStatus).toBe(PolicyResultStatus.PASS);
      expect(mockDb.query).not.toHaveBeenCalled(); // No database calls in dry run
    });
  });

  describe('buildEvaluationContext', () => {
    it('should build complete evaluation context', async () => {
      const mockVersionData = {
        id: 'version-1',
        model_id: 'model-1',
        version: '1.0.0',
        state: 'draft',
        metadata: JSON.stringify({ framework: 'pytorch' }),
        model_name: 'test-model',
        model_group: 'ml-team',
        risk_tier: 'Low',
        owners: ['owner@example.com'],
        tags: ['test']
      };

      const mockArtifacts = [
        { id: 'artifact-1', type: 'weights', size: 1000000, license: 'MIT' },
        { id: 'artifact-2', type: 'config', size: 5000, license: null }
      ];

      const mockEvaluations = [
        { 
          id: 'eval-1', 
          results: { taskMetrics: { accuracy: 0.95 } },
          thresholds: { taskMetrics: { accuracy: 0.9 } },
          passed: true,
          executed_at: new Date()
        }
      ];

      mockDb.query = vi.fn()
        .mockResolvedValueOnce({ rows: [mockVersionData] }) // Version query
        .mockResolvedValueOnce({ rows: mockArtifacts }) // Artifacts query
        .mockResolvedValueOnce({ rows: mockEvaluations }); // Evaluations query

      const context = await engine.buildEvaluationContext('version-1', { env: 'test' });

      expect(context.versionId).toBe('version-1');
      expect(context.modelData.name).toBe('test-model');
      expect(context.modelData.group).toBe('ml-team');
      expect(context.versionData.state).toBe('draft');
      expect(context.artifacts).toHaveLength(2);
      expect(context.evaluations).toHaveLength(1);
      expect(context.metadata.framework).toBe('pytorch');
      expect(context.userContext.env).toBe('test');
    });

    it('should throw error when version not found', async () => {
      mockDb.query = vi.fn().mockResolvedValueOnce({ rows: [] }); // Version not found

      await expect(engine.buildEvaluationContext('nonexistent-version'))
        .rejects.toThrow('Model version not found');
    });
  });

  describe('operator evaluation', () => {
    const testCases = [
      // Equality operators
      { operator: 'equals', actual: 'test', expected: 'test', result: true },
      { operator: 'equals', actual: 'test', expected: 'other', result: false },
      { operator: 'not_equals', actual: 'test', expected: 'other', result: true },
      { operator: 'not_equals', actual: 'test', expected: 'test', result: false },

      // Numeric operators
      { operator: 'greater_than', actual: 10, expected: 5, result: true },
      { operator: 'greater_than', actual: 5, expected: 10, result: false },
      { operator: 'less_than', actual: 5, expected: 10, result: true },
      { operator: 'less_than', actual: 10, expected: 5, result: false },
      { operator: 'greater_than_or_equal', actual: 10, expected: 10, result: true },
      { operator: 'less_than_or_equal', actual: 10, expected: 10, result: true },

      // String operators
      { operator: 'contains', actual: 'hello world', expected: 'world', result: true },
      { operator: 'contains', actual: 'hello world', expected: 'xyz', result: false },
      { operator: 'not_contains', actual: 'hello world', expected: 'xyz', result: true },

      // Array operators
      { operator: 'contains', actual: ['a', 'b', 'c'], expected: 'b', result: true },
      { operator: 'contains', actual: ['a', 'b', 'c'], expected: 'd', result: false },

      // Existence operators
      { operator: 'exists', actual: 'value', expected: null, result: true },
      { operator: 'exists', actual: null, expected: null, result: false },
      { operator: 'not_exists', actual: null, expected: null, result: true },
      { operator: 'not_exists', actual: 'value', expected: null, result: false },

      // Membership operators
      { operator: 'in', actual: 'b', expected: ['a', 'b', 'c'], result: true },
      { operator: 'in', actual: 'd', expected: ['a', 'b', 'c'], result: false },
      { operator: 'not_in', actual: 'd', expected: ['a', 'b', 'c'], result: true },

      // Regex operator
      { operator: 'matches_regex', actual: 'test123', expected: '^test\\d+$', result: true },
      { operator: 'matches_regex', actual: 'test', expected: '^test\\d+$', result: false },

      // Length operators
      { operator: 'length_equals', actual: 'hello', expected: 5, result: true },
      { operator: 'length_equals', actual: ['a', 'b', 'c'], expected: 3, result: true },
      { operator: 'length_greater_than', actual: 'hello', expected: 3, result: true },
      { operator: 'length_less_than', actual: 'hi', expected: 5, result: true }
    ];

    testCases.forEach(({ operator, actual, expected, result }) => {
      it(`should evaluate ${operator} correctly`, async () => {
        const policy: Policy = {
          id: 'test-policy',
          name: 'Test Policy',
          description: 'Test operator evaluation',
          version: '1.0.0',
          status: PolicyStatus.ACTIVE,
          severity: PolicySeverity.LOW,
          ruleDefinition: {
            conditions: [{
              type: 'field',
              field: 'testField',
              operator: operator as any,
              value: expected
            }],
            actions: [{
              type: 'log',
              severity: PolicySeverity.LOW,
              message: 'Test action',
              blocking: false
            }]
          },
          metadata: {},
          createdBy: 'user-1',
          createdAt: new Date(),
          updatedAt: new Date()
        };

        const context: EvaluationContext = {
          versionId: 'version-1',
          modelData: {},
          versionData: { testField: actual },
          artifacts: [],
          evaluations: [],
          metadata: {},
          userContext: {}
        };

        const evalResult = await engine.executePolicy(policy, context, true);
        const conditionResult = evalResult.results[0];

        expect(conditionResult.status).toBe(result ? PolicyResultStatus.PASS : PolicyResultStatus.FAIL);
      });
    });
  });

  describe('field value extraction', () => {
    it('should extract nested field values correctly', async () => {
      const policy: Policy = {
        id: 'nested-policy',
        name: 'Nested Field Policy',
        description: 'Test nested field extraction',
        version: '1.0.0',
        status: PolicyStatus.ACTIVE,
        severity: PolicySeverity.LOW,
        ruleDefinition: {
          conditions: [{
            type: 'metadata',
            field: 'training.epochs',
            operator: 'greater_than',
            value: 10
          }],
          actions: [{
            type: 'warn',
            severity: PolicySeverity.LOW,
            message: 'High epoch count detected',
            blocking: false
          }]
        },
        metadata: {},
        createdBy: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const context: EvaluationContext = {
        versionId: 'version-1',
        modelData: {},
        versionData: { 
          metadata: { 
            training: { 
              epochs: 50,
              batchSize: 32 
            } 
          } 
        },
        artifacts: [],
        evaluations: [],
        metadata: { training: { epochs: 50, batchSize: 32 } },
        userContext: {}
      };

      const result = await engine.executePolicy(policy, context, true);

      expect(result.results[0].status).toBe(PolicyResultStatus.FAIL); // 50 > 10, so condition fails, action executes
      expect(result.results[1].message).toBe('High epoch count detected');
    });

    it('should handle artifact aggregation fields', async () => {
      const policy: Policy = {
        id: 'artifact-policy',
        name: 'Artifact Policy',
        description: 'Test artifact field extraction',
        version: '1.0.0',
        status: PolicyStatus.ACTIVE,
        severity: PolicySeverity.MEDIUM,
        ruleDefinition: {
          conditions: [{
            type: 'artifact',
            field: 'total_size',
            operator: 'less_than',
            value: 1000000000 // 1GB
          }],
          actions: [{
            type: 'block',
            severity: PolicySeverity.HIGH,
            message: 'Model too large',
            blocking: true
          }]
        },
        metadata: {},
        createdBy: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const context: EvaluationContext = {
        versionId: 'version-1',
        modelData: {},
        versionData: {},
        artifacts: [
          { size: 500000000 }, // 500MB
          { size: 300000000 }  // 300MB
        ],
        evaluations: [],
        metadata: {},
        userContext: {}
      };

      const result = await engine.executePolicy(policy, context, true);

      expect(result.results[0].status).toBe(PolicyResultStatus.PASS); // 800MB < 1GB
    });
  });
});