import { DatabaseService } from '../database/databaseService';
import { PolicyEngineService } from '../policyEngine/policyEngineService';
import { AuditService } from '../audit/auditService';
import { PipelineValidationResult } from './types';

export class PipelineValidationService {
  private db: DatabaseService;
  private policyEngine: PolicyEngineService;
  private auditService: AuditService;

  constructor(
    db: DatabaseService,
    policyEngine: PolicyEngineService,
    auditService: AuditService
  ) {
    this.db = db;
    this.policyEngine = policyEngine;
    this.auditService = auditService;
  }

  /**
   * Run automated policy validation in CI pipeline
   */
  async validateInPipeline(
    commitSha: string,
    modelId: string,
    versionId: string,
    userId: string = 'ci-system'
  ): Promise<PipelineValidationResult> {
    const validationId = `pipeline-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Initialize validation record
    const validation: PipelineValidationResult = {
      id: validationId,
      commitSha,
      modelId,
      versionId,
      status: 'running',
      checks: {
        policyValidation: false,
        securityScan: false,
        qualityGates: false
      },
      results: {
        policyViolations: [],
        securityIssues: [],
        qualityMetrics: {}
      },
      createdAt: new Date()
    };

    try {
      // Store initial validation record
      await this.storePipelineValidation(validation);

      // Log validation start
      await this.auditService.logEvent({
        eventType: 'pipeline_validation_started',
        userId,
        resourceType: 'model_version',
        resourceId: versionId,
        details: {
          commitSha,
          modelId,
          validationId
        }
      });

      // Run policy validation
      validation.checks.policyValidation = await this.runPolicyValidation(modelId, versionId, validation);

      // Run security scan
      validation.checks.securityScan = await this.runSecurityScan(modelId, versionId, validation);

      // Run quality gates
      validation.checks.qualityGates = await this.runQualityGates(modelId, versionId, validation);

      // Determine overall status
      const allChecksPassed = Object.values(validation.checks).every(check => check === true);
      validation.status = allChecksPassed ? 'passed' : 'failed';
      validation.completedAt = new Date();

      // Update validation record
      await this.storePipelineValidation(validation);

      // Log validation completion
      await this.auditService.logEvent({
        eventType: 'pipeline_validation_completed',
        userId,
        resourceType: 'model_version',
        resourceId: versionId,
        details: {
          commitSha,
          modelId,
          validationId,
          status: validation.status,
          checks: validation.checks
        }
      });

      return validation;

    } catch (error) {
      validation.status = 'failed';
      validation.completedAt = new Date();
      validation.results.policyViolations.push(`Validation error: ${error.message}`);
      
      await this.storePipelineValidation(validation);
      
      await this.auditService.logEvent({
        eventType: 'pipeline_validation_error',
        userId,
        resourceType: 'model_version',
        resourceId: versionId,
        details: {
          commitSha,
          modelId,
          validationId,
          error: error.message
        }
      });

      throw error;
    }
  }

  private async runPolicyValidation(
    modelId: string,
    versionId: string,
    validation: PipelineValidationResult
  ): Promise<boolean> {
    try {
      // Get model version details
      const modelQuery = `
        SELECT mv.*, m.risk_tier, m.group_name, m.name
        FROM model_versions mv
        JOIN models m ON mv.model_id = m.id
        WHERE mv.id = $1
      `;
      const modelResult = await this.db.query(modelQuery, [versionId]);
      
      if (modelResult.rows.length === 0) {
        validation.results.policyViolations.push('Model version not found');
        return false;
      }

      const modelVersion = modelResult.rows[0];

      // Run policy evaluation
      const policyResult = await this.policyEngine.evaluateModel(
        modelId,
        versionId,
        'ci-system'
      );

      if (!policyResult.passed) {
        validation.results.policyViolations = policyResult.violations.map(v => v.message);
        return false;
      }

      return true;
    } catch (error) {
      validation.results.policyViolations.push(`Policy validation error: ${error.message}`);
      return false;
    }
  }

  private async runSecurityScan(
    modelId: string,
    versionId: string,
    validation: PipelineValidationResult
  ): Promise<boolean> {
    try {
      // Get model artifacts
      const artifactsQuery = `
        SELECT id, type, uri, sha256, license
        FROM artifacts
        WHERE version_id = $1
      `;
      const artifactsResult = await this.db.query(artifactsQuery, [versionId]);

      const securityIssues: string[] = [];

      for (const artifact of artifactsResult.rows) {
        // Check for license compliance
        if (!artifact.license || artifact.license === 'unknown') {
          securityIssues.push(`Artifact ${artifact.id} has unknown or missing license`);
        }

        // Check for prohibited licenses
        const prohibitedLicenses = ['GPL-3.0', 'AGPL-3.0'];
        if (prohibitedLicenses.includes(artifact.license)) {
          securityIssues.push(`Artifact ${artifact.id} uses prohibited license: ${artifact.license}`);
        }

        // Verify SHA256 checksum (simulate)
        if (!artifact.sha256 || artifact.sha256.length !== 64) {
          securityIssues.push(`Artifact ${artifact.id} has invalid SHA256 checksum`);
        }
      }

      validation.results.securityIssues = securityIssues;
      return securityIssues.length === 0;

    } catch (error) {
      validation.results.securityIssues.push(`Security scan error: ${error.message}`);
      return false;
    }
  }

  private async runQualityGates(
    modelId: string,
    versionId: string,
    validation: PipelineValidationResult
  ): Promise<boolean> {
    try {
      // Get latest evaluation results
      const evaluationQuery = `
        SELECT results, thresholds, passed
        FROM evaluations
        WHERE version_id = $1
        ORDER BY executed_at DESC
        LIMIT 1
      `;
      const evaluationResult = await this.db.query(evaluationQuery, [versionId]);

      if (evaluationResult.rows.length === 0) {
        validation.results.qualityMetrics = { error: 'No evaluation results found' };
        return false;
      }

      const evaluation = evaluationResult.rows[0];
      validation.results.qualityMetrics = evaluation.results;

      return evaluation.passed;

    } catch (error) {
      validation.results.qualityMetrics = { error: error.message };
      return false;
    }
  }

  /**
   * Store pipeline validation result
   */
  private async storePipelineValidation(validation: PipelineValidationResult): Promise<void> {
    const query = `
      INSERT INTO pipeline_validations (
        id, commit_sha, model_id, version_id, status, checks, results, created_at, completed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        checks = EXCLUDED.checks,
        results = EXCLUDED.results,
        completed_at = EXCLUDED.completed_at
    `;

    await this.db.query(query, [
      validation.id,
      validation.commitSha,
      validation.modelId,
      validation.versionId,
      validation.status,
      JSON.stringify(validation.checks),
      JSON.stringify(validation.results),
      validation.createdAt,
      validation.completedAt
    ]);
  }

  /**
   * Get pipeline validation result
   */
  async getPipelineValidation(validationId: string): Promise<PipelineValidationResult | null> {
    const query = `
      SELECT id, commit_sha, model_id, version_id, status, checks, results, created_at, completed_at
      FROM pipeline_validations
      WHERE id = $1
    `;

    const result = await this.db.query(query, [validationId]);
    
    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      commitSha: row.commit_sha,
      modelId: row.model_id,
      versionId: row.version_id,
      status: row.status,
      checks: JSON.parse(row.checks),
      results: JSON.parse(row.results),
      createdAt: row.created_at,
      completedAt: row.completed_at
    };
  }

  /**
   * Get validation history for a model
   */
  async getValidationHistory(modelId: string, limit: number = 50): Promise<PipelineValidationResult[]> {
    const query = `
      SELECT id, commit_sha, model_id, version_id, status, checks, results, created_at, completed_at
      FROM pipeline_validations
      WHERE model_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `;

    const result = await this.db.query(query, [modelId, limit]);
    
    return result.rows.map(row => ({
      id: row.id,
      commitSha: row.commit_sha,
      modelId: row.model_id,
      versionId: row.version_id,
      status: row.status,
      checks: JSON.parse(row.checks),
      results: JSON.parse(row.results),
      createdAt: row.created_at,
      completedAt: row.completed_at
    }));
  }

  /**
   * Generate CI/CD status check for external systems
   */
  generateStatusCheck(validation: PipelineValidationResult): {
    state: 'pending' | 'success' | 'failure' | 'error';
    description: string;
    targetUrl?: string;
  } {
    switch (validation.status) {
      case 'pending':
      case 'running':
        return {
          state: 'pending',
          description: 'Model governance validation in progress'
        };
      case 'passed':
        return {
          state: 'success',
          description: 'All governance checks passed'
        };
      case 'failed':
        const failedChecks = Object.entries(validation.checks)
          .filter(([_, passed]) => !passed)
          .map(([check, _]) => check);
        return {
          state: 'failure',
          description: `Failed checks: ${failedChecks.join(', ')}`
        };
      default:
        return {
          state: 'error',
          description: 'Validation error occurred'
        };
    }
  }
}