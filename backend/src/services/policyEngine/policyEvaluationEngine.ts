import { DatabaseService } from '../database/databaseService.js';
import { 
  Policy, 
  PolicyCondition, 
  PolicyAction, 
  PolicyResult, 
  PolicyResultStatus,
  PolicySeverity
} from '../../types/index.js';
import crypto from 'crypto';

export interface EvaluationContext {
  versionId: string;
  modelData: any;
  versionData: any;
  artifacts: any[];
  evaluations: any[];
  metadata: Record<string, any>;
  userContext: Record<string, any>;
}

export interface EvaluationEngineResult {
  policyId: string;
  policyName: string;
  results: PolicyResult[];
  overallStatus: PolicyResultStatus;
  blocking: boolean;
  executionTime: number;
}

export class PolicyEvaluationEngine {
  constructor(private db: DatabaseService) {}

  /**
   * Execute policy evaluation for a given context
   */
  async executePolicy(
    policy: Policy, 
    context: EvaluationContext,
    dryRun: boolean = false
  ): Promise<EvaluationEngineResult> {
    const startTime = Date.now();
    const results: PolicyResult[] = [];
    let overallStatus = PolicyResultStatus.PASS;
    let hasBlocking = false;

    try {
      // Evaluate each condition in the policy
      for (let i = 0; i < policy.ruleDefinition.conditions.length; i++) {
        const condition = policy.ruleDefinition.conditions[i];
        const conditionResult = await this.evaluateCondition(condition, context, i);
        
        if (conditionResult.status === PolicyResultStatus.FAIL) {
          overallStatus = PolicyResultStatus.FAIL;
          
          // Execute actions for failed conditions
          for (let j = 0; j < policy.ruleDefinition.actions.length; j++) {
            const action = policy.ruleDefinition.actions[j];
            const actionResult = await this.executeAction(action, condition, context, j);
            results.push(actionResult);
            
            if (actionResult.blocking) {
              hasBlocking = true;
            }
          }
        } else if (conditionResult.status === PolicyResultStatus.WARNING && overallStatus === PolicyResultStatus.PASS) {
          overallStatus = PolicyResultStatus.WARNING;
        } else if (conditionResult.status === PolicyResultStatus.ERROR) {
          overallStatus = PolicyResultStatus.ERROR;
        }
        
        results.push(conditionResult);
      }

      // Store results if not dry run
      if (!dryRun) {
        await this.storeEvaluationResults(context.versionId, policy.id, results);
      }

      const executionTime = Date.now() - startTime;

      return {
        policyId: policy.id,
        policyName: policy.name,
        results,
        overallStatus,
        blocking: hasBlocking,
        executionTime
      };
    } catch (error: any) {
      const executionTime = Date.now() - startTime;
      
      // Create error result
      const errorResult: PolicyResult = {
        id: crypto.randomUUID(),
        evaluationId: '', // Will be set when stored
        ruleName: 'policy_execution_error',
        status: PolicyResultStatus.ERROR,
        message: `Policy execution failed: ${error.message}`,
        details: {
          error: error.message,
          stack: error.stack,
          policy: policy.name
        },
        blocking: false,
        createdAt: new Date()
      };

      return {
        policyId: policy.id,
        policyName: policy.name,
        results: [errorResult],
        overallStatus: PolicyResultStatus.ERROR,
        blocking: false,
        executionTime
      };
    }
  }

  /**
   * Evaluate a single condition
   */
  private async evaluateCondition(
    condition: PolicyCondition,
    context: EvaluationContext,
    conditionIndex: number
  ): Promise<PolicyResult> {
    const resultId = crypto.randomUUID();
    let status = PolicyResultStatus.PASS;
    let message = `Condition ${condition.field} ${condition.operator} passed`;
    const details: Record<string, any> = {
      condition,
      conditionIndex,
      actualValue: null,
      expectedValue: condition.value
    };

    try {
      // Get the actual value based on condition type and field
      const actualValue = await this.getConditionValue(condition, context);
      details.actualValue = actualValue;

      // Evaluate the condition based on operator
      const conditionMet = this.evaluateOperator(condition.operator, actualValue, condition.value);
      
      if (!conditionMet) {
        status = PolicyResultStatus.FAIL;
        message = condition.description || 
          `Condition ${condition.field} ${condition.operator} ${JSON.stringify(condition.value)} failed. Actual value: ${JSON.stringify(actualValue)}`;
      } else {
        message = condition.description || 
          `Condition ${condition.field} ${condition.operator} ${JSON.stringify(condition.value)} passed`;
      }

    } catch (error: any) {
      status = PolicyResultStatus.ERROR;
      message = `Error evaluating condition ${condition.field}: ${error.message}`;
      details.error = error.message;
    }

    return {
      id: resultId,
      evaluationId: '', // Will be set when stored
      ruleName: `condition_${conditionIndex}_${condition.type}_${condition.field}`,
      status,
      message,
      details,
      blocking: false,
      createdAt: new Date()
    };
  }

  /**
   * Execute an action for a failed condition
   */
  private async executeAction(
    action: PolicyAction,
    condition: PolicyCondition,
    context: EvaluationContext,
    actionIndex: number
  ): Promise<PolicyResult> {
    const resultId = crypto.randomUUID();
    
    // Determine status based on action type
    let status: PolicyResultStatus;
    switch (action.type) {
      case 'block':
        status = PolicyResultStatus.FAIL;
        break;
      case 'warn':
        status = PolicyResultStatus.WARNING;
        break;
      case 'notify':
      case 'log':
        status = PolicyResultStatus.WARNING;
        break;
      default:
        status = PolicyResultStatus.FAIL;
    }

    // Execute action-specific logic
    await this.executeActionLogic(action, condition, context);

    return {
      id: resultId,
      evaluationId: '', // Will be set when stored
      ruleName: `action_${actionIndex}_${action.type}`,
      status,
      message: action.message,
      details: {
        action,
        condition,
        severity: action.severity,
        actionType: action.type
      },
      blocking: action.blocking,
      createdAt: new Date()
    };
  }

  /**
   * Get value for condition evaluation
   */
  private async getConditionValue(condition: PolicyCondition, context: EvaluationContext): Promise<any> {
    switch (condition.type) {
      case 'field':
        return this.getFieldValue(context.versionData, condition.field);
      
      case 'metadata':
        return this.getMetadataValue(context.versionData, condition.field);
      
      case 'artifact':
        return this.getArtifactValue(context.artifacts, condition.field);
      
      case 'evaluation':
        return this.getEvaluationValue(context.evaluations, condition.field);
      
      default:
        throw new Error(`Unknown condition type: ${condition.type}`);
    }
  }

  /**
   * Get field value from nested object
   */
  private getFieldValue(data: any, fieldPath: string): any {
    if (!data) return null;
    
    const path = fieldPath.split('.');
    let value = data;
    
    for (const segment of path) {
      if (value && typeof value === 'object' && segment in value) {
        value = value[segment];
      } else {
        return null;
      }
    }
    
    return value;
  }

  /**
   * Get metadata value
   */
  private getMetadataValue(versionData: any, field: string): any {
    if (!versionData?.metadata) return null;
    return this.getFieldValue(versionData.metadata, field);
  }

  /**
   * Get artifact-related value
   */
  private getArtifactValue(artifacts: any[], field: string): any {
    if (!artifacts || !Array.isArray(artifacts)) return null;
    
    // Special fields
    if (field === 'count') {
      return artifacts.length;
    }
    
    if (field === 'total_size') {
      return artifacts.reduce((sum, artifact) => sum + (artifact.size || 0), 0);
    }
    
    if (field === 'types') {
      return [...new Set(artifacts.map(a => a.type))];
    }
    
    if (field === 'licenses') {
      return [...new Set(artifacts.map(a => a.license).filter(Boolean))];
    }
    
    // For other fields, return array of values from all artifacts
    return artifacts.map(artifact => this.getFieldValue(artifact, field)).filter(v => v !== null);
  }

  /**
   * Get evaluation-related value
   */
  private getEvaluationValue(evaluations: any[], field: string): any {
    if (!evaluations || !Array.isArray(evaluations)) return null;
    
    // Get the latest evaluation (assuming sorted by date)
    const latestEvaluation = evaluations[0];
    if (!latestEvaluation) return null;
    
    // Special fields for evaluation results
    if (field.startsWith('results.')) {
      const resultField = field.substring(8); // Remove 'results.'
      return this.getFieldValue(latestEvaluation.results, resultField);
    }
    
    if (field.startsWith('thresholds.')) {
      const thresholdField = field.substring(11); // Remove 'thresholds.'
      return this.getFieldValue(latestEvaluation.thresholds, thresholdField);
    }
    
    return this.getFieldValue(latestEvaluation, field);
  }

  /**
   * Evaluate operator
   */
  private evaluateOperator(operator: string, actualValue: any, expectedValue: any): boolean {
    switch (operator) {
      case 'equals':
        return actualValue === expectedValue;
      
      case 'not_equals':
        return actualValue !== expectedValue;
      
      case 'greater_than':
        return Number(actualValue) > Number(expectedValue);
      
      case 'less_than':
        return Number(actualValue) < Number(expectedValue);
      
      case 'greater_than_or_equal':
        return Number(actualValue) >= Number(expectedValue);
      
      case 'less_than_or_equal':
        return Number(actualValue) <= Number(expectedValue);
      
      case 'contains':
        if (Array.isArray(actualValue)) {
          return actualValue.includes(expectedValue);
        }
        return String(actualValue).includes(String(expectedValue));
      
      case 'not_contains':
        if (Array.isArray(actualValue)) {
          return !actualValue.includes(expectedValue);
        }
        return !String(actualValue).includes(String(expectedValue));
      
      case 'exists':
        return actualValue !== null && actualValue !== undefined;
      
      case 'not_exists':
        return actualValue === null || actualValue === undefined;
      
      case 'in':
        return Array.isArray(expectedValue) && expectedValue.includes(actualValue);
      
      case 'not_in':
        return Array.isArray(expectedValue) && !expectedValue.includes(actualValue);
      
      case 'matches_regex':
        try {
          const regex = new RegExp(expectedValue);
          return regex.test(String(actualValue));
        } catch {
          return false;
        }
      
      case 'length_equals':
        const length = Array.isArray(actualValue) ? actualValue.length : String(actualValue).length;
        return length === Number(expectedValue);
      
      case 'length_greater_than':
        const lengthGt = Array.isArray(actualValue) ? actualValue.length : String(actualValue).length;
        return lengthGt > Number(expectedValue);
      
      case 'length_less_than':
        const lengthLt = Array.isArray(actualValue) ? actualValue.length : String(actualValue).length;
        return lengthLt < Number(expectedValue);
      
      default:
        throw new Error(`Unknown operator: ${operator}`);
    }
  }

  /**
   * Execute action-specific logic
   */
  private async executeActionLogic(
    action: PolicyAction,
    condition: PolicyCondition,
    context: EvaluationContext
  ): Promise<void> {
    switch (action.type) {
      case 'block':
        // Blocking actions are handled by the blocking flag
        break;
      
      case 'warn':
        // Warning actions are handled by the status
        break;
      
      case 'notify':
        // In a real implementation, this would send notifications
        // For now, we'll just log the notification intent
        console.log(`Policy notification: ${action.message}`, {
          versionId: context.versionId,
          condition: condition.field,
          severity: action.severity
        });
        break;
      
      case 'log':
        // Log the policy violation
        console.log(`Policy violation logged: ${action.message}`, {
          versionId: context.versionId,
          condition: condition.field,
          severity: action.severity
        });
        break;
      
      default:
        console.warn(`Unknown action type: ${action.type}`);
    }
  }

  /**
   * Store evaluation results in database
   */
  private async storeEvaluationResults(
    versionId: string,
    policyId: string,
    results: PolicyResult[]
  ): Promise<void> {
    // Get the evaluation ID for this version/policy combination
    const evaluationQuery = `
      SELECT id FROM policy_evaluations 
      WHERE version_id = $1 AND policy_id = $2 
      ORDER BY started_at DESC 
      LIMIT 1
    `;
    
    const evaluationResult = await this.db.query(evaluationQuery, [versionId, policyId]);
    
    if (evaluationResult.rows.length === 0) {
      throw new Error('No evaluation record found for storing results');
    }
    
    const evaluationId = evaluationResult.rows[0].id;

    // Store each result
    const insertQuery = `
      INSERT INTO policy_results (id, evaluation_id, rule_name, status, message, details, blocking)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `;

    for (const result of results) {
      await this.db.query(insertQuery, [
        result.id,
        evaluationId,
        result.ruleName,
        result.status,
        result.message,
        JSON.stringify(result.details),
        result.blocking
      ]);
    }
  }

  /**
   * Build evaluation context from version data
   */
  async buildEvaluationContext(
    versionId: string,
    userContext: Record<string, any> = {}
  ): Promise<EvaluationContext> {
    // Get model version with model data
    const versionQuery = `
      SELECT mv.*, m.name as model_name, m."group" as model_group, 
             m.risk_tier, m.owners, m.tags
      FROM model_versions mv
      JOIN models m ON mv.model_id = m.id
      WHERE mv.id = $1
    `;
    
    const versionResult = await this.db.query(versionQuery, [versionId]);
    if (versionResult.rows.length === 0) {
      throw new Error('Model version not found');
    }
    
    const versionData = versionResult.rows[0];
    const modelData = {
      id: versionData.model_id,
      name: versionData.model_name,
      group: versionData.model_group,
      riskTier: versionData.risk_tier,
      owners: versionData.owners,
      tags: versionData.tags
    };

    // Get artifacts
    const artifactsQuery = 'SELECT * FROM artifacts WHERE version_id = $1 ORDER BY created_at ASC';
    const artifactsResult = await this.db.query(artifactsQuery, [versionId]);

    // Get evaluations
    const evaluationsQuery = `
      SELECT * FROM evaluations 
      WHERE version_id = $1 
      ORDER BY executed_at DESC
    `;
    const evaluationsResult = await this.db.query(evaluationsQuery, [versionId]);

    return {
      versionId,
      modelData,
      versionData,
      artifacts: artifactsResult.rows,
      evaluations: evaluationsResult.rows,
      metadata: typeof versionData.metadata === 'string' 
        ? JSON.parse(versionData.metadata) 
        : versionData.metadata,
      userContext
    };
  }
}