import { DatabaseService } from '../index.js';
import { RiskTier, VersionState, ArtifactType, ApprovalRole, ApprovalStatus } from '../../types/index.js';

export async function seedDevelopmentData(db: DatabaseService): Promise<void> {
  console.log('🌱 Seeding development data...');

  // Sample models
  const models = [
    {
      id: '550e8400-e29b-41d4-a716-446655440001',
      name: 'sentiment-classifier',
      group: 'nlp',
      description: 'A BERT-based sentiment classification model for customer reviews',
      owners: ['alice@company.com', 'bob@company.com'],
      risk_tier: RiskTier.LOW,
      tags: ['nlp', 'sentiment', 'bert', 'classification']
    },
    {
      id: '550e8400-e29b-41d4-a716-446655440002',
      name: 'fraud-detector',
      group: 'fintech',
      description: 'Machine learning model for detecting fraudulent transactions',
      owners: ['charlie@company.com', 'diana@company.com'],
      risk_tier: RiskTier.HIGH,
      tags: ['fraud', 'detection', 'xgboost', 'finance']
    },
    {
      id: '550e8400-e29b-41d4-a716-446655440003',
      name: 'recommendation-engine',
      group: 'ml',
      description: 'Collaborative filtering model for product recommendations',
      owners: ['eve@company.com'],
      risk_tier: RiskTier.MEDIUM,
      tags: ['recommendation', 'collaborative-filtering', 'tensorflow']
    },
    {
      id: '550e8400-e29b-41d4-a716-446655440004',
      name: 'chatbot-llm',
      group: 'ai',
      description: 'Large language model fine-tuned for customer support',
      owners: ['frank@company.com', 'grace@company.com'],
      risk_tier: RiskTier.HIGH,
      tags: ['llm', 'chatbot', 'transformer', 'customer-support']
    }
  ];

  // Insert models
  for (const model of models) {
    await db.query(`
      INSERT INTO models (id, name, "group", description, owners, risk_tier, tags)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (id) DO NOTHING
    `, [
      model.id,
      model.name,
      model.group,
      model.description,
      model.owners,
      model.risk_tier,
      model.tags
    ]);
  }

  // Sample model versions
  const versions = [
    {
      id: '660e8400-e29b-41d4-a716-446655440001',
      model_id: '550e8400-e29b-41d4-a716-446655440001',
      version: '1.0.0',
      state: VersionState.PRODUCTION,
      commit_sha: 'a1b2c3d4e5f6789012345678901234567890abcd',
      training_job_id: 'job-001',
      metadata: {
        framework: 'transformers',
        frameworkVersion: '4.21.0',
        modelType: 'bert-base-uncased',
        inputSchema: { text: 'string' },
        outputSchema: { sentiment: 'string', confidence: 'number' },
        hyperparameters: { learning_rate: 0.001, batch_size: 32 },
        trainingDataset: 'customer-reviews-v1',
        intendedUse: 'Sentiment analysis of customer reviews',
        limitations: 'Trained on English text only'
      }
    },
    {
      id: '660e8400-e29b-41d4-a716-446655440002',
      model_id: '550e8400-e29b-41d4-a716-446655440001',
      version: '1.1.0',
      state: VersionState.STAGING,
      commit_sha: 'b2c3d4e5f6789012345678901234567890abcdef',
      training_job_id: 'job-002',
      metadata: {
        framework: 'transformers',
        frameworkVersion: '4.22.0',
        modelType: 'bert-base-uncased',
        inputSchema: { text: 'string' },
        outputSchema: { sentiment: 'string', confidence: 'number' },
        hyperparameters: { learning_rate: 0.0005, batch_size: 64 },
        trainingDataset: 'customer-reviews-v2',
        baseModel: 'nlp/sentiment-classifier:1.0.0',
        intendedUse: 'Improved sentiment analysis with better accuracy',
        limitations: 'Trained on English text only'
      }
    },
    {
      id: '660e8400-e29b-41d4-a716-446655440003',
      model_id: '550e8400-e29b-41d4-a716-446655440002',
      version: '2.0.0',
      state: VersionState.APPROVED_PROD,
      commit_sha: 'c3d4e5f6789012345678901234567890abcdef12',
      training_job_id: 'job-003',
      metadata: {
        framework: 'xgboost',
        frameworkVersion: '1.6.0',
        modelType: 'gradient-boosting',
        inputSchema: { 
          amount: 'number',
          merchant_category: 'string',
          time_of_day: 'number',
          user_history: 'object'
        },
        outputSchema: { fraud_probability: 'number', risk_score: 'number' },
        hyperparameters: { 
          n_estimators: 100,
          max_depth: 6,
          learning_rate: 0.1
        },
        trainingDataset: 'fraud-transactions-2023',
        intendedUse: 'Real-time fraud detection for payment processing',
        limitations: 'May have higher false positives for new merchant categories',
        ethicalConsiderations: 'Potential bias against certain demographic groups'
      }
    }
  ];

  // Insert model versions
  for (const version of versions) {
    await db.query(`
      INSERT INTO model_versions (id, model_id, version, state, commit_sha, training_job_id, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (id) DO NOTHING
    `, [
      version.id,
      version.model_id,
      version.version,
      version.state,
      version.commit_sha,
      version.training_job_id,
      JSON.stringify(version.metadata)
    ]);
  }

  // Sample artifacts
  const artifacts = [
    {
      id: '770e8400-e29b-41d4-a716-446655440001',
      version_id: '660e8400-e29b-41d4-a716-446655440001',
      type: ArtifactType.WEIGHTS,
      uri: 's3://ai-models/nlp/sentiment-classifier/1.0.0/model.bin',
      sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      size: 438000000,
      license: 'Apache-2.0'
    },
    {
      id: '770e8400-e29b-41d4-a716-446655440002',
      version_id: '660e8400-e29b-41d4-a716-446655440001',
      type: ArtifactType.CONFIG,
      uri: 's3://ai-models/nlp/sentiment-classifier/1.0.0/config.json',
      sha256: 'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3',
      size: 2048,
      license: 'Apache-2.0'
    },
    {
      id: '770e8400-e29b-41d4-a716-446655440003',
      version_id: '660e8400-e29b-41d4-a716-446655440002',
      type: ArtifactType.CONTAINER,
      uri: 'docker://registry.company.com/nlp/sentiment-classifier:1.1.0',
      sha256: 'b5d4045c3f466fa91fe2cc6abe79232a1a57cdf104f7a26e716e0a1e2789df78',
      size: 1200000000,
      license: 'Apache-2.0'
    }
  ];

  // Insert artifacts
  for (const artifact of artifacts) {
    await db.query(`
      INSERT INTO artifacts (id, version_id, type, uri, sha256, size, license)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (id) DO NOTHING
    `, [
      artifact.id,
      artifact.version_id,
      artifact.type,
      artifact.uri,
      artifact.sha256,
      artifact.size,
      artifact.license
    ]);
  }

  // Sample evaluations
  const evaluations = [
    {
      id: '880e8400-e29b-41d4-a716-446655440001',
      version_id: '660e8400-e29b-41d4-a716-446655440001',
      suite_id: '990e8400-e29b-41d4-a716-446655440001',
      results: {
        taskMetrics: { accuracy: 0.92, f1_score: 0.89, precision: 0.91, recall: 0.87 },
        biasMetrics: { demographic_parity: 0.95, equalized_odds: 0.93 },
        safetyMetrics: { toxicity_score: 0.02, harmful_content: 0.01 },
        robustnessMetrics: { adversarial_accuracy: 0.85, noise_robustness: 0.88 }
      },
      thresholds: {
        taskMetrics: { accuracy: 0.90, f1_score: 0.85 },
        biasMetrics: { demographic_parity: 0.90, equalized_odds: 0.90 },
        safetyMetrics: { toxicity_score: 0.05, harmful_content: 0.05 },
        robustnessMetrics: { adversarial_accuracy: 0.80, noise_robustness: 0.80 }
      },
      passed: true
    },
    {
      id: '880e8400-e29b-41d4-a716-446655440002',
      version_id: '660e8400-e29b-41d4-a716-446655440003',
      suite_id: '990e8400-e29b-41d4-a716-446655440002',
      results: {
        taskMetrics: { auc_roc: 0.96, precision: 0.88, recall: 0.92, f1_score: 0.90 },
        biasMetrics: { demographic_parity: 0.87, equalized_odds: 0.89 },
        safetyMetrics: { false_positive_rate: 0.03, false_negative_rate: 0.08 },
        robustnessMetrics: { feature_importance_stability: 0.94, prediction_consistency: 0.91 }
      },
      thresholds: {
        taskMetrics: { auc_roc: 0.95, precision: 0.85, recall: 0.90 },
        biasMetrics: { demographic_parity: 0.90, equalized_odds: 0.90 },
        safetyMetrics: { false_positive_rate: 0.05, false_negative_rate: 0.10 },
        robustnessMetrics: { feature_importance_stability: 0.90, prediction_consistency: 0.85 }
      },
      passed: false // Failed bias metrics
    }
  ];

  // Insert evaluations
  for (const evaluation of evaluations) {
    await db.query(`
      INSERT INTO evaluations (id, version_id, suite_id, results, thresholds, passed)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (id) DO NOTHING
    `, [
      evaluation.id,
      evaluation.version_id,
      evaluation.suite_id,
      JSON.stringify(evaluation.results),
      JSON.stringify(evaluation.thresholds),
      evaluation.passed
    ]);
  }

  // Sample approvals
  const approvals = [
    {
      id: 'aa0e8400-e29b-41d4-a716-446655440001',
      version_id: '660e8400-e29b-41d4-a716-446655440001',
      approver_user_id: 'mrc.reviewer@company.com',
      approver_role: ApprovalRole.MRC,
      status: ApprovalStatus.APPROVED,
      comments: 'Model meets all risk criteria for low-risk classification'
    },
    {
      id: 'aa0e8400-e29b-41d4-a716-446655440002',
      version_id: '660e8400-e29b-41d4-a716-446655440003',
      approver_user_id: 'mrc.reviewer@company.com',
      approver_role: ApprovalRole.MRC,
      status: ApprovalStatus.APPROVED,
      comments: 'Fraud detection model shows good performance metrics'
    },
    {
      id: 'aa0e8400-e29b-41d4-a716-446655440003',
      version_id: '660e8400-e29b-41d4-a716-446655440003',
      approver_user_id: 'security.reviewer@company.com',
      approver_role: ApprovalRole.SECURITY,
      status: ApprovalStatus.PENDING,
      comments: 'Reviewing security implications of bias metrics failure'
    }
  ];

  // Insert approvals
  for (const approval of approvals) {
    await db.query(`
      INSERT INTO approvals (id, version_id, approver_user_id, approver_role, status, comments)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (id) DO NOTHING
    `, [
      approval.id,
      approval.version_id,
      approval.approver_user_id,
      approval.approver_role,
      approval.status,
      approval.comments
    ]);
  }

  console.log('✅ Development data seeded successfully');
}