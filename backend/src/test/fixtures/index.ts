import { 
  Model, 
  ModelVersion, 
  Artifact, 
  Evaluation, 
  Approval,
  RiskTier,
  VersionState,
  ArtifactType,
  ApprovalRole,
  ApprovalStatus,
  ModelMetadata,
  EvaluationResults,
  EvaluationThresholds
} from '../../types/index.js';

/**
 * Test data factories for creating consistent test fixtures
 */

export class TestDataFactory {
  private static counter = 1;

  private static getNextId(): string {
    return `test-${String(this.counter++).padStart(4, '0')}-${Date.now()}`;
  }

  static createModel(overrides: Partial<Model> = {}): Model {
    const id = this.getNextId();
    return {
      id,
      name: `test-model-${id}`,
      group: 'test',
      description: `Test model ${id} for automated testing`,
      owners: ['test@example.com'],
      riskTier: RiskTier.LOW,
      tags: ['test', 'automated'],
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides
    };
  }

  static createModelVersion(modelId: string, overrides: Partial<ModelVersion> = {}): ModelVersion {
    const id = this.getNextId();
    return {
      id,
      modelId,
      version: '1.0.0',
      state: VersionState.DRAFT,
      commitSha: 'a'.repeat(40),
      metadata: this.createModelMetadata(),
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides
    };
  }

  static createArtifact(versionId: string, overrides: Partial<Artifact> = {}): Artifact {
    const id = this.getNextId();
    return {
      id,
      versionId,
      type: ArtifactType.WEIGHTS,
      uri: `s3://test-bucket/models/${id}/model.bin`,
      sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      size: 1000000,
      license: 'MIT',
      createdAt: new Date(),
      ...overrides
    };
  }

  static createEvaluation(versionId: string, overrides: Partial<Evaluation> = {}): Evaluation {
    const id = this.getNextId();
    return {
      id,
      versionId,
      suiteId: `suite-${id}`,
      results: this.createEvaluationResults(),
      thresholds: this.createEvaluationThresholds(),
      passed: true,
      executedAt: new Date(),
      ...overrides
    };
  }

  static createApproval(versionId: string, overrides: Partial<Approval> = {}): Approval {
    const id = this.getNextId();
    return {
      id,
      versionId,
      approverUserId: 'approver@example.com',
      approverRole: ApprovalRole.MRC,
      status: ApprovalStatus.PENDING,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides
    };
  }

  static createModelMetadata(overrides: Partial<ModelMetadata> = {}): ModelMetadata {
    return {
      framework: 'tensorflow',
      frameworkVersion: '2.10.0',
      modelType: 'neural-network',
      inputSchema: { features: 'array' },
      outputSchema: { prediction: 'number' },
      hyperparameters: { learning_rate: 0.001, epochs: 100 },
      intendedUse: 'Test model for automated testing',
      ...overrides
    };
  }

  static createEvaluationResults(overrides: Partial<EvaluationResults> = {}): EvaluationResults {
    return {
      taskMetrics: { accuracy: 0.95, f1_score: 0.92 },
      biasMetrics: { demographic_parity: 0.98 },
      safetyMetrics: { toxicity_score: 0.01 },
      robustnessMetrics: { adversarial_accuracy: 0.90 },
      ...overrides
    };
  }

  static createEvaluationThresholds(overrides: Partial<EvaluationThresholds> = {}): EvaluationThresholds {
    return {
      taskMetrics: { accuracy: 0.90, f1_score: 0.85 },
      biasMetrics: { demographic_parity: 0.95 },
      safetyMetrics: { toxicity_score: 0.05 },
      robustnessMetrics: { adversarial_accuracy: 0.85 },
      ...overrides
    };
  }

  static reset(): void {
    this.counter = 1;
  }
}

// Predefined test scenarios
export const TestScenarios = {
  // Low risk model that should pass all checks
  lowRiskModel: (): Model => TestDataFactory.createModel({
    name: 'low-risk-classifier',
    riskTier: RiskTier.LOW,
    description: 'Low risk classification model for testing'
  }),

  // High risk model requiring multiple approvals
  highRiskModel: (): Model => TestDataFactory.createModel({
    name: 'high-risk-fraud-detector',
    riskTier: RiskTier.HIGH,
    description: 'High risk fraud detection model requiring extensive approvals',
    owners: ['senior-engineer@example.com', 'ml-lead@example.com']
  }),

  // Model version ready for production
  productionReadyVersion: (modelId: string): ModelVersion => TestDataFactory.createModelVersion(modelId, {
    version: '2.1.0',
    state: VersionState.APPROVED_PROD,
    commitSha: 'b'.repeat(40),
    metadata: TestDataFactory.createModelMetadata({
      framework: 'pytorch',
      frameworkVersion: '1.12.0',
      modelType: 'transformer'
    })
  }),

  // Failed evaluation scenario
  failedEvaluation: (versionId: string): Evaluation => TestDataFactory.createEvaluation(versionId, {
    results: TestDataFactory.createEvaluationResults({
      taskMetrics: { accuracy: 0.75, f1_score: 0.70 }, // Below threshold
      biasMetrics: { demographic_parity: 0.80 } // Below threshold
    }),
    passed: false
  }),

  // Complete approval workflow for high-risk model
  highRiskApprovals: (versionId: string): Approval[] => [
    TestDataFactory.createApproval(versionId, {
      approverRole: ApprovalRole.MRC,
      status: ApprovalStatus.APPROVED,
      comments: 'Risk assessment completed - approved'
    }),
    TestDataFactory.createApproval(versionId, {
      approverRole: ApprovalRole.SECURITY,
      status: ApprovalStatus.APPROVED,
      comments: 'Security review passed'
    }),
    TestDataFactory.createApproval(versionId, {
      approverRole: ApprovalRole.SRE,
      status: ApprovalStatus.PENDING,
      comments: 'Infrastructure review in progress'
    })
  ],

  // Large model artifacts
  largeModelArtifacts: (versionId: string): Artifact[] => [
    TestDataFactory.createArtifact(versionId, {
      type: ArtifactType.WEIGHTS,
      size: 5000000000, // 5GB
      uri: 's3://large-models/weights.bin'
    }),
    TestDataFactory.createArtifact(versionId, {
      type: ArtifactType.CONTAINER,
      size: 2000000000, // 2GB
      uri: 'docker://registry.example.com/large-model:latest'
    }),
    TestDataFactory.createArtifact(versionId, {
      type: ArtifactType.CONFIG,
      size: 4096,
      uri: 's3://large-models/config.json'
    })
  ]
};

// Database cleanup utilities for tests
export class TestDatabaseUtils {
  static async cleanupTestData(db: any): Promise<void> {
    // Delete in reverse dependency order
    await db.query("DELETE FROM audit_logs WHERE entity_id LIKE 'test-%'");
    await db.query("DELETE FROM approvals WHERE id LIKE 'test-%'");
    await db.query("DELETE FROM evaluations WHERE id LIKE 'test-%'");
    await db.query("DELETE FROM artifacts WHERE id LIKE 'test-%'");
    await db.query("DELETE FROM model_versions WHERE id LIKE 'test-%'");
    await db.query("DELETE FROM models WHERE id LIKE 'test-%'");
  }

  static async insertTestModel(db: any, model: Model): Promise<void> {
    await db.query(`
      INSERT INTO models (id, name, "group", description, owners, risk_tier, tags, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [
      model.id,
      model.name,
      model.group,
      model.description,
      model.owners,
      model.riskTier,
      model.tags,
      model.createdAt,
      model.updatedAt
    ]);
  }

  static async insertTestVersion(db: any, version: ModelVersion): Promise<void> {
    await db.query(`
      INSERT INTO model_versions (id, model_id, version, state, commit_sha, training_job_id, metadata, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [
      version.id,
      version.modelId,
      version.version,
      version.state,
      version.commitSha,
      version.trainingJobId,
      JSON.stringify(version.metadata),
      version.createdAt,
      version.updatedAt
    ]);
  }

  static async insertTestArtifact(db: any, artifact: Artifact): Promise<void> {
    await db.query(`
      INSERT INTO artifacts (id, version_id, type, uri, sha256, size, license, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      artifact.id,
      artifact.versionId,
      artifact.type,
      artifact.uri,
      artifact.sha256,
      artifact.size,
      artifact.license,
      artifact.createdAt
    ]);
  }

  static async insertTestEvaluation(db: any, evaluation: Evaluation): Promise<void> {
    await db.query(`
      INSERT INTO evaluations (id, version_id, suite_id, results, thresholds, passed, executed_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      evaluation.id,
      evaluation.versionId,
      evaluation.suiteId,
      JSON.stringify(evaluation.results),
      JSON.stringify(evaluation.thresholds),
      evaluation.passed,
      evaluation.executedAt
    ]);
  }

  static async insertTestApproval(db: any, approval: Approval): Promise<void> {
    await db.query(`
      INSERT INTO approvals (id, version_id, approver_user_id, approver_role, status, comments, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      approval.id,
      approval.versionId,
      approval.approverUserId,
      approval.approverRole,
      approval.status,
      approval.comments,
      approval.createdAt,
      approval.updatedAt
    ]);
  }
}