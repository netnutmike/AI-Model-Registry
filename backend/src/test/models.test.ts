import { describe, it, expect, beforeEach } from 'vitest';
import { TestDataFactory, TestScenarios, TestDatabaseUtils } from './fixtures/index.js';
import { RiskTier, VersionState, ArtifactType, ApprovalRole } from '../types/index.js';
import { 
  isValidStateTransition, 
  getRequiredApprovalRoles, 
  parseSemanticVersion,
  compareVersions,
  generateModelId
} from '../utils/typeUtils.js';

describe('Data Models and Types', () => {
  beforeEach(() => {
    TestDataFactory.reset();
  });

  describe('TestDataFactory', () => {
    it('should create a valid model', () => {
      const model = TestDataFactory.createModel();
      
      expect(model.id).toBeDefined();
      expect(model.name).toMatch(/^test-model-/);
      expect(model.group).toBe('test');
      expect(model.owners).toHaveLength(1);
      expect(model.riskTier).toBe(RiskTier.LOW);
      expect(model.tags).toContain('test');
    });

    it('should create a model with overrides', () => {
      const model = TestDataFactory.createModel({
        name: 'custom-model',
        riskTier: RiskTier.HIGH,
        owners: ['user1@test.com', 'user2@test.com']
      });
      
      expect(model.name).toBe('custom-model');
      expect(model.riskTier).toBe(RiskTier.HIGH);
      expect(model.owners).toHaveLength(2);
    });

    it('should create a valid model version', () => {
      const modelId = 'test-model-123';
      const version = TestDataFactory.createModelVersion(modelId);
      
      expect(version.modelId).toBe(modelId);
      expect(version.version).toBe('1.0.0');
      expect(version.state).toBe(VersionState.DRAFT);
      expect(version.commitSha).toHaveLength(40);
      expect(version.metadata).toBeDefined();
    });

    it('should create a valid artifact', () => {
      const versionId = 'test-version-123';
      const artifact = TestDataFactory.createArtifact(versionId);
      
      expect(artifact.versionId).toBe(versionId);
      expect(artifact.type).toBe(ArtifactType.WEIGHTS);
      expect(artifact.sha256).toHaveLength(64);
      expect(artifact.size).toBeGreaterThan(0);
    });

    it('should create a valid evaluation', () => {
      const versionId = 'test-version-123';
      const evaluation = TestDataFactory.createEvaluation(versionId);
      
      expect(evaluation.versionId).toBe(versionId);
      expect(evaluation.results).toBeDefined();
      expect(evaluation.thresholds).toBeDefined();
      expect(evaluation.results.taskMetrics).toBeDefined();
      expect(evaluation.results.biasMetrics).toBeDefined();
    });

    it('should create a valid approval', () => {
      const versionId = 'test-version-123';
      const approval = TestDataFactory.createApproval(versionId);
      
      expect(approval.versionId).toBe(versionId);
      expect(approval.approverRole).toBe(ApprovalRole.MRC);
      expect(approval.approverUserId).toBeDefined();
    });
  });

  describe('TestScenarios', () => {
    it('should create a low risk model scenario', () => {
      const model = TestScenarios.lowRiskModel();
      
      expect(model.riskTier).toBe(RiskTier.LOW);
      expect(model.name).toBe('low-risk-classifier');
    });

    it('should create a high risk model scenario', () => {
      const model = TestScenarios.highRiskModel();
      
      expect(model.riskTier).toBe(RiskTier.HIGH);
      expect(model.owners).toHaveLength(2);
    });

    it('should create failed evaluation scenario', () => {
      const evaluation = TestScenarios.failedEvaluation('test-version');
      
      expect(evaluation.passed).toBe(false);
      expect(evaluation.results.taskMetrics.accuracy).toBeLessThan(0.90);
    });

    it('should create high risk approval workflow', () => {
      const approvals = TestScenarios.highRiskApprovals('test-version');
      
      expect(approvals).toHaveLength(3);
      expect(approvals.map(a => a.approverRole)).toContain(ApprovalRole.MRC);
      expect(approvals.map(a => a.approverRole)).toContain(ApprovalRole.SECURITY);
      expect(approvals.map(a => a.approverRole)).toContain(ApprovalRole.SRE);
    });
  });

  describe('Type Utilities', () => {
    it('should validate state transitions correctly', () => {
      expect(isValidStateTransition(VersionState.DRAFT, VersionState.SUBMITTED)).toBe(true);
      expect(isValidStateTransition(VersionState.SUBMITTED, VersionState.APPROVED_STAGING)).toBe(true);
      expect(isValidStateTransition(VersionState.DRAFT, VersionState.PRODUCTION)).toBe(false);
      expect(isValidStateTransition(VersionState.RETIRED, VersionState.DRAFT)).toBe(false);
    });

    it('should return correct approval roles for risk tiers', () => {
      expect(getRequiredApprovalRoles(RiskTier.LOW)).toEqual([ApprovalRole.MRC]);
      expect(getRequiredApprovalRoles(RiskTier.MEDIUM)).toEqual([ApprovalRole.MRC, ApprovalRole.SECURITY]);
      expect(getRequiredApprovalRoles(RiskTier.HIGH)).toEqual([ApprovalRole.MRC, ApprovalRole.SECURITY, ApprovalRole.SRE]);
    });

    it('should parse semantic versions correctly', () => {
      expect(parseSemanticVersion('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 });
      expect(parseSemanticVersion('10.0.1')).toEqual({ major: 10, minor: 0, patch: 1 });
      expect(() => parseSemanticVersion('invalid')).toThrow();
    });

    it('should compare versions correctly', () => {
      expect(compareVersions('1.0.0', '1.0.1')).toBeLessThan(0);
      expect(compareVersions('1.1.0', '1.0.9')).toBeGreaterThan(0);
      expect(compareVersions('2.0.0', '2.0.0')).toBe(0);
    });

    it('should generate model IDs correctly', () => {
      expect(generateModelId('nlp', 'SentimentClassifier')).toBe('nlp/sentimentclassifier');
      expect(generateModelId('ML', 'Fraud-Detector')).toBe('ml/fraud-detector');
    });
  });
});