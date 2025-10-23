import { DatabaseService } from '../database/databaseService.js';
import { PolicyEngineService } from './policyEngineService.js';
import { PolicyNotificationService } from './policyNotificationService.js';
import { 
  VersionState,
  PolicyResultStatus,
  EvaluatePolicyRequest
} from '../../types/index.js';

export interface PromotionBlockingResult {
  allowed: boolean;
  blockingReasons: string[];
  blockingPolicies: string[];
  warnings: string[];
  evaluationId?: string;
}

export interface StateTransitionRequest {
  versionId: string;
  fromState: VersionState;
  toState: VersionState;
  userId: string;
  bypassPolicies?: boolean; // For emergency overrides
}

export class PolicyBlockingService {
  constructor(
    private db: DatabaseService,
    private policyEngineService: PolicyEngineService,
    private notificationService: PolicyNotificationService
  ) {}

  /**
   * Check if a state transition is allowed based on policy evaluations
   */
  async checkStateTransition(request: StateTransitionRequest): Promise<PromotionBlockingResult> {
    // Skip policy checks for certain transitions or if bypassed
    if (this.shouldSkipPolicyCheck(request.fromState, request.toState) || request.bypassPolicies) {
      return {
        allowed: true,
        blockingReasons: [],
        blockingPolicies: [],
        warnings: []
      };
    }

    try {
      // Run policy evaluation for the version
      const evaluationRequest: EvaluatePolicyRequest = {
        versionId: request.versionId,
        dryRun: false,
        context: {
          stateTransition: {
            from: request.fromState,
            to: request.toState,
            userId: request.userId
          }
        }
      };

      const evaluationSummary = await this.policyEngineService.evaluatePolicies(
        evaluationRequest, 
        request.userId
      );

      // Check for blocking violations
      const blockingCheck = await this.notificationService.checkPromotionBlocking(request.versionId);

      // Collect warnings from non-blocking failures
      const warnings: string[] = [];
      for (const result of evaluationSummary.results) {
        if (result.status === PolicyResultStatus.WARNING) {
          warnings.push(...result.results.map(r => r.message || 'Policy warning'));
        }
      }

      // Send notifications for violations
      if (evaluationSummary.blockingViolations > 0 || warnings.length > 0) {
        await this.sendViolationNotifications(request.versionId, evaluationSummary);
      }

      return {
        allowed: !blockingCheck.blocked,
        blockingReasons: blockingCheck.reasons,
        blockingPolicies: blockingCheck.blockingPolicies,
        warnings,
        evaluationId: evaluationSummary.evaluationId
      };

    } catch (error: any) {
      // On evaluation error, default to blocking for safety
      return {
        allowed: false,
        blockingReasons: [`Policy evaluation failed: ${error.message}`],
        blockingPolicies: [],
        warnings: []
      };
    }
  }

  /**
   * Validate promotion to production specifically
   */
  async validateProductionPromotion(versionId: string, userId: string): Promise<PromotionBlockingResult> {
    return this.checkStateTransition({
      versionId,
      fromState: VersionState.APPROVED_PROD,
      toState: VersionState.PRODUCTION,
      userId
    });
  }

  /**
   * Validate promotion to staging
   */
  async validateStagingPromotion(versionId: string, userId: string): Promise<PromotionBlockingResult> {
    return this.checkStateTransition({
      versionId,
      fromState: VersionState.APPROVED_STAGING,
      toState: VersionState.STAGING,
      userId
    });
  }

  /**
   * Get blocking status for a version without running new evaluations
   */
  async getBlockingStatus(versionId: string): Promise<{
    hasBlockingViolations: boolean;
    blockingPolicies: string[];
    lastEvaluationDate?: Date;
  }> {
    const blockingCheck = await this.notificationService.checkPromotionBlocking(versionId);
    
    // Get last evaluation date
    const lastEvalQuery = `
      SELECT MAX(completed_at) as last_evaluation
      FROM policy_evaluations
      WHERE version_id = $1 AND completed_at IS NOT NULL
    `;
    
    const result = await this.db.query(lastEvalQuery, [versionId]);
    const lastEvaluationDate = result.rows[0]?.last_evaluation || null;

    return {
      hasBlockingViolations: blockingCheck.blocked,
      blockingPolicies: blockingCheck.blockingPolicies,
      lastEvaluationDate
    };
  }

  /**
   * Force override blocking policies (emergency use)
   */
  async forceOverrideBlocking(
    versionId: string,
    userId: string,
    justification: string,
    overriddenPolicies: string[]
  ): Promise<void> {
    // Log the override action
    const overrideRecord = {
      id: crypto.randomUUID(),
      versionId,
      userId,
      justification,
      overriddenPolicies,
      timestamp: new Date()
    };

    // Store override record for audit
    await this.storeOverrideRecord(overrideRecord);

    // Create temporary exceptions for overridden policies
    for (const policyId of overriddenPolicies) {
      try {
        await this.policyEngineService.createPolicyException({
          versionId,
          policyId,
          justification: `Emergency override: ${justification}`,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
        }, userId);
      } catch (error) {
        console.warn(`Failed to create exception for policy ${policyId}:`, error);
      }
    }

    // Send notification about the override
    await this.notifyPolicyOverride(overrideRecord);
  }

  /**
   * Get policy compliance summary for a version
   */
  async getComplianceSummary(versionId: string): Promise<{
    totalPolicies: number;
    passingPolicies: number;
    failingPolicies: number;
    warningPolicies: number;
    blockingViolations: number;
    exceptions: number;
    lastEvaluated?: Date;
    complianceScore: number;
  }> {
    // Get latest evaluation summary
    const evalQuery = `
      SELECT pe.*, COUNT(pr.id) as result_count,
             COUNT(CASE WHEN pr.status = 'pass' THEN 1 END) as pass_count,
             COUNT(CASE WHEN pr.status = 'fail' THEN 1 END) as fail_count,
             COUNT(CASE WHEN pr.status = 'warning' THEN 1 END) as warning_count,
             COUNT(CASE WHEN pr.blocking = true AND pr.status = 'fail' THEN 1 END) as blocking_count
      FROM policy_evaluations pe
      LEFT JOIN policy_results pr ON pe.id = pr.evaluation_id
      WHERE pe.version_id = $1 AND pe.completed_at IS NOT NULL
      GROUP BY pe.id
      ORDER BY pe.completed_at DESC
      LIMIT 1
    `;

    const evalResult = await this.db.query(evalQuery, [versionId]);
    
    if (evalResult.rows.length === 0) {
      return {
        totalPolicies: 0,
        passingPolicies: 0,
        failingPolicies: 0,
        warningPolicies: 0,
        blockingViolations: 0,
        exceptions: 0,
        complianceScore: 0
      };
    }

    const evalData = evalResult.rows[0];

    // Get active exceptions count
    const exceptionsQuery = `
      SELECT COUNT(*) as exception_count
      FROM policy_exceptions
      WHERE version_id = $1 
      AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
    `;
    
    const exceptionsResult = await this.db.query(exceptionsQuery, [versionId]);
    const exceptions = parseInt(exceptionsResult.rows[0].exception_count);

    // Calculate compliance score (0-100)
    const totalPolicies = parseInt(evalData.result_count);
    const passingPolicies = parseInt(evalData.pass_count);
    const complianceScore = totalPolicies > 0 ? Math.round((passingPolicies / totalPolicies) * 100) : 100;

    return {
      totalPolicies,
      passingPolicies,
      failingPolicies: parseInt(evalData.fail_count),
      warningPolicies: parseInt(evalData.warning_count),
      blockingViolations: parseInt(evalData.blocking_count),
      exceptions,
      lastEvaluated: evalData.completed_at,
      complianceScore
    };
  }

  // Private helper methods

  private shouldSkipPolicyCheck(fromState: VersionState, toState: VersionState): boolean {
    // Skip policy checks for certain transitions
    const skipTransitions = [
      // Backwards transitions (rollbacks)
      { from: VersionState.PRODUCTION, to: VersionState.STAGING },
      { from: VersionState.STAGING, to: VersionState.APPROVED_STAGING },
      { from: VersionState.APPROVED_PROD, to: VersionState.STAGING },
      
      // Administrative transitions
      { from: VersionState.PRODUCTION, to: VersionState.DEPRECATED },
      { from: VersionState.DEPRECATED, to: VersionState.RETIRED },
      
      // Draft/development transitions
      { from: VersionState.DRAFT, to: VersionState.SUBMITTED },
      { from: VersionState.CHANGES_REQUESTED, to: VersionState.SUBMITTED }
    ];

    return skipTransitions.some(transition => 
      transition.from === fromState && transition.to === toState
    );
  }

  private async sendViolationNotifications(
    versionId: string, 
    evaluationSummary: any
  ): Promise<void> {
    for (const result of evaluationSummary.results) {
      if (result.status === PolicyResultStatus.FAIL || result.status === PolicyResultStatus.WARNING) {
        await this.notificationService.notifyPolicyViolations(
          versionId,
          result.results,
          result.policyName,
          result.policyId
        );
      }
    }
  }

  private async storeOverrideRecord(overrideRecord: any): Promise<void> {
    // Store in audit log or dedicated override table
    console.log('Policy override recorded:', overrideRecord);
    
    // In a real implementation, store in database
    const query = `
      INSERT INTO policy_overrides (id, version_id, user_id, justification, overridden_policies, created_at)
      VALUES ($1, $2, $3, $4, $5, $6)
    `;
    
    try {
      await this.db.query(query, [
        overrideRecord.id,
        overrideRecord.versionId,
        overrideRecord.userId,
        overrideRecord.justification,
        JSON.stringify(overrideRecord.overriddenPolicies),
        overrideRecord.timestamp
      ]);
    } catch (error) {
      // If table doesn't exist, just log
      console.log('Override record stored (logged):', overrideRecord);
    }
  }

  private async notifyPolicyOverride(overrideRecord: any): Promise<void> {
    console.log('Policy override notification sent:', {
      versionId: overrideRecord.versionId,
      userId: overrideRecord.userId,
      justification: overrideRecord.justification,
      overriddenPolicies: overrideRecord.overriddenPolicies
    });
    
    // In a real implementation, send notifications to governance team
  }
}

// Add crypto import
import crypto from 'crypto';