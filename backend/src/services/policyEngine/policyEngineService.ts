import { DatabaseService } from '../database/databaseService.js';
import { 
  Policy, 
  PolicyEvaluation, 
  PolicyResult, 
  PolicyException,
  CreatePolicyRequest, 
  UpdatePolicyRequest,
  EvaluatePolicyRequest,
  CreatePolicyExceptionRequest,
  PolicyEntity,
  PolicyEvaluationEntity,
  PolicyResultEntity,
  PolicyExceptionEntity,
  PolicyStatus,
  PolicySeverity,
  PolicyEvaluationStatus,
  PolicyResultStatus,
  PolicyCondition,
  PolicyAction,
  ModelVersion,
  Artifact,
  Evaluation
} from '../../types/index.js';
import { PolicyEvaluationEngine } from './policyEvaluationEngine.js';
import crypto from 'crypto';

export interface PolicySearchFilters {
  status?: PolicyStatus;
  severity?: PolicySeverity;
  createdBy?: string;
  search?: string;
}

export interface PolicySearchResult {
  policies: Policy[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PolicyEvaluationResult {
  evaluationId: string;
  policyId: string;
  policyName: string;
  status: PolicyResultStatus;
  results: PolicyResult[];
  blocking: boolean;
}

export interface PolicyEvaluationSummary {
  evaluationId: string;
  versionId: string;
  totalPolicies: number;
  passedPolicies: number;
  failedPolicies: number;
  warningPolicies: number;
  blockingViolations: number;
  overallStatus: 'pass' | 'fail' | 'warning';
  results: PolicyEvaluationResult[];
}

export class PolicyEngineService {
  private evaluationEngine: PolicyEvaluationEngine;

  constructor(private db: DatabaseService) {
    this.evaluationEngine = new PolicyEvaluationEngine(db);
  }

  /**
   * Create a new policy
   */
  async createPolicy(request: CreatePolicyRequest, createdBy: string): Promise<Policy> {
    const policyId = crypto.randomUUID();
    
    const query = `
      INSERT INTO policies (id, name, description, version, severity, rule_definition, metadata, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;
    
    const values = [
      policyId,
      request.name,
      request.description,
      request.version,
      request.severity,
      JSON.stringify(request.ruleDefinition),
      JSON.stringify(request.metadata || {}),
      createdBy
    ];

    try {
      await this.db.query('SET app.current_user_id = $1', [createdBy]);
      
      const result = await this.db.query(query, values);
      const policyEntity = result.rows[0] as PolicyEntity;
      
      return this.mapPolicyEntityToPolicy(policyEntity);
    } catch (error: any) {
      if (error.code === '23505') { // Unique constraint violation
        throw new Error(`Policy ${request.name} version ${request.version} already exists`);
      }
      throw error;
    }
  }

  /**
   * Get policy by ID
   */
  async getPolicyById(policyId: string): Promise<Policy | null> {
    const query = 'SELECT * FROM policies WHERE id = $1';
    const result = await this.db.query(query, [policyId]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return this.mapPolicyEntityToPolicy(result.rows[0] as PolicyEntity);
  }

  /**
   * Search and filter policies with pagination
   */
  async searchPolicies(
    filters: PolicySearchFilters = {}, 
    page: number = 1, 
    pageSize: number = 20
  ): Promise<PolicySearchResult> {
    const offset = (page - 1) * pageSize;
    const conditions: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    // Build WHERE conditions
    if (filters.status) {
      conditions.push(`status = $${paramIndex++}`);
      values.push(filters.status);
    }

    if (filters.severity) {
      conditions.push(`severity = $${paramIndex++}`);
      values.push(filters.severity);
    }

    if (filters.createdBy) {
      conditions.push(`created_by = $${paramIndex++}`);
      values.push(filters.createdBy);
    }

    if (filters.search) {
      conditions.push(`(
        name ILIKE $${paramIndex++}
        OR description ILIKE $${paramIndex++}
      )`);
      values.push(`%${filters.search}%`, `%${filters.search}%`);
      paramIndex++; // We added 2 parameters but incremented once already
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Count query
    const countQuery = `
      SELECT COUNT(*) as total 
      FROM policies 
      ${whereClause}
    `;
    
    // Data query with pagination
    const dataQuery = `
      SELECT * 
      FROM policies 
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;
    
    values.push(pageSize, offset);

    const [countResult, dataResult] = await Promise.all([
      this.db.query(countQuery, values.slice(0, -2)), // Remove limit/offset for count
      this.db.query(dataQuery, values)
    ]);

    const total = parseInt(countResult.rows[0].total);
    const policies = dataResult.rows.map((row: PolicyEntity) => this.mapPolicyEntityToPolicy(row));

    return {
      policies,
      total,
      page,
      pageSize
    };
  }

  /**
   * Update policy
   */
  async updatePolicy(
    policyId: string, 
    updates: UpdatePolicyRequest, 
    updatedBy: string
  ): Promise<Policy> {
    const setClauses: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.description !== undefined) {
      setClauses.push(`description = $${paramIndex++}`);
      values.push(updates.description);
    }

    if (updates.status !== undefined) {
      setClauses.push(`status = $${paramIndex++}`);
      values.push(updates.status);
    }

    if (updates.severity !== undefined) {
      setClauses.push(`severity = $${paramIndex++}`);
      values.push(updates.severity);
    }

    if (updates.ruleDefinition !== undefined) {
      setClauses.push(`rule_definition = $${paramIndex++}`);
      values.push(JSON.stringify(updates.ruleDefinition));
    }

    if (updates.metadata !== undefined) {
      setClauses.push(`metadata = $${paramIndex++}`);
      values.push(JSON.stringify(updates.metadata));
    }

    if (setClauses.length === 0) {
      throw new Error('No valid fields to update');
    }

    const query = `
      UPDATE policies 
      SET ${setClauses.join(', ')}
      WHERE id = $${paramIndex++}
      RETURNING *
    `;
    
    values.push(policyId);

    try {
      await this.db.query('SET app.current_user_id = $1', [updatedBy]);
      
      const result = await this.db.query(query, values);
      
      if (result.rows.length === 0) {
        throw new Error('Policy not found');
      }
      
      return this.mapPolicyEntityToPolicy(result.rows[0] as PolicyEntity);
    } catch (error: any) {
      throw error;
    }
  }

  /**
   * Get active policies
   */
  async getActivePolicies(): Promise<Policy[]> {
    const query = `
      SELECT * FROM policies 
      WHERE status = 'active' 
      ORDER BY severity DESC, created_at ASC
    `;
    
    const result = await this.db.query(query);
    
    return result.rows.map((row: PolicyEntity) => this.mapPolicyEntityToPolicy(row));
  }

  /**
   * Evaluate policies for a model version
   */
  async evaluatePolicies(request: EvaluatePolicyRequest, evaluatedBy: string): Promise<PolicyEvaluationSummary> {
    const evaluationId = crypto.randomUUID();
    
    // Get policies to evaluate
    let policies: Policy[];
    if (request.policyIds && request.policyIds.length > 0) {
      policies = await this.getPoliciesByIds(request.policyIds);
    } else {
      policies = await this.getActivePolicies();
    }

    if (policies.length === 0) {
      throw new Error('No policies found to evaluate');
    }

    // Create evaluation record
    const evaluationQuery = `
      INSERT INTO policy_evaluations (id, version_id, policy_id, status, context, dry_run)
      VALUES ($1, $2, $3, $4, $5, $6)
    `;

    try {
      await this.db.query('SET app.current_user_id = $1', [evaluatedBy]);
      
      // Create evaluation records for each policy
      for (const policy of policies) {
        await this.db.query(evaluationQuery, [
          crypto.randomUUID(),
          request.versionId,
          policy.id,
          PolicyEvaluationStatus.PENDING,
          JSON.stringify(request.context || {}),
          request.dryRun || false
        ]);
      }

      // Execute policy evaluations
      const results: PolicyEvaluationResult[] = [];
      
      for (const policy of policies) {
        const policyResult = await this.executePolicyEvaluation(
          request.versionId,
          policy,
          request.context || {},
          request.dryRun || false
        );
        results.push(policyResult);
      }

      // Calculate summary
      const summary = this.calculateEvaluationSummary(evaluationId, request.versionId, results);
      
      return summary;
    } catch (error: any) {
      throw error;
    }
  }

  /**
   * Get evaluation results by evaluation ID
   */
  async getEvaluationResults(evaluationId: string): Promise<PolicyEvaluationSummary | null> {
    const query = `
      SELECT pe.*, p.name as policy_name
      FROM policy_evaluations pe
      JOIN policies p ON pe.policy_id = p.id
      WHERE pe.id = $1
    `;
    
    const result = await this.db.query(query, [evaluationId]);
    
    if (result.rows.length === 0) {
      return null;
    }

    // Get policy results for this evaluation
    const resultsQuery = `
      SELECT pr.*
      FROM policy_results pr
      JOIN policy_evaluations pe ON pr.evaluation_id = pe.id
      WHERE pe.id = $1
      ORDER BY pr.created_at ASC
    `;
    
    const resultsResult = await this.db.query(resultsQuery, [evaluationId]);
    const policyResults = resultsResult.rows.map((row: PolicyResultEntity) => 
      this.mapPolicyResultEntityToResult(row)
    );

    // Group results by policy
    const resultsByPolicy = new Map<string, PolicyResult[]>();
    for (const result of policyResults) {
      const policyId = result.evaluationId; // This needs to be mapped properly
      if (!resultsByPolicy.has(policyId)) {
        resultsByPolicy.set(policyId, []);
      }
      resultsByPolicy.get(policyId)!.push(result);
    }

    // Build evaluation results
    const evaluationResults: PolicyEvaluationResult[] = [];
    for (const row of result.rows) {
      const policyResults = resultsByPolicy.get(row.policy_id) || [];
      const blocking = policyResults.some(r => r.blocking && r.status === PolicyResultStatus.FAIL);
      
      evaluationResults.push({
        evaluationId: row.id,
        policyId: row.policy_id,
        policyName: row.policy_name,
        status: this.determineOverallPolicyStatus(policyResults),
        results: policyResults,
        blocking
      });
    }

    return this.calculateEvaluationSummary(evaluationId, result.rows[0].version_id, evaluationResults);
  }

  /**
   * Create policy exception
   */
  async createPolicyException(
    request: CreatePolicyExceptionRequest, 
    approvedBy: string
  ): Promise<PolicyException> {
    const exceptionId = crypto.randomUUID();
    
    const query = `
      INSERT INTO policy_exceptions (id, version_id, policy_id, justification, approved_by, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    
    const values = [
      exceptionId,
      request.versionId,
      request.policyId,
      request.justification,
      approvedBy,
      request.expiresAt || null
    ];

    try {
      await this.db.query('SET app.current_user_id = $1', [approvedBy]);
      
      const result = await this.db.query(query, values);
      const exceptionEntity = result.rows[0] as PolicyExceptionEntity;
      
      return this.mapPolicyExceptionEntityToException(exceptionEntity);
    } catch (error: any) {
      if (error.code === '23505') { // Unique constraint violation
        throw new Error('Policy exception already exists for this version and policy');
      }
      if (error.code === '23503') { // Foreign key violation
        throw new Error('Version or policy not found');
      }
      throw error;
    }
  }

  /**
   * Get policy exceptions for a version
   */
  async getVersionPolicyExceptions(versionId: string): Promise<PolicyException[]> {
    const query = `
      SELECT * FROM policy_exceptions 
      WHERE version_id = $1 
      AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
      ORDER BY created_at DESC
    `;
    
    const result = await this.db.query(query, [versionId]);
    
    return result.rows.map((row: PolicyExceptionEntity) => 
      this.mapPolicyExceptionEntityToException(row)
    );
  }

  /**
   * Check if version has blocking policy violations
   */
  async hasBlockingViolations(versionId: string): Promise<boolean> {
    // Check for active exceptions first
    const exceptions = await this.getVersionPolicyExceptions(versionId);
    const exceptionPolicyIds = new Set(exceptions.map(e => e.policyId));

    // Get latest evaluation results
    const query = `
      SELECT DISTINCT pr.blocking, pr.status, pe.policy_id
      FROM policy_results pr
      JOIN policy_evaluations pe ON pr.evaluation_id = pe.id
      WHERE pe.version_id = $1 
      AND pe.dry_run = false
      AND pr.blocking = true
      AND pr.status = 'fail'
      ORDER BY pe.started_at DESC
    `;
    
    const result = await this.db.query(query, [versionId]);
    
    // Check if any blocking violations don't have exceptions
    for (const row of result.rows) {
      if (!exceptionPolicyIds.has(row.policy_id)) {
        return true;
      }
    }
    
    return false;
  }

  // Private helper methods

  private async getPoliciesByIds(policyIds: string[]): Promise<Policy[]> {
    const query = `
      SELECT * FROM policies 
      WHERE id = ANY($1) AND status = 'active'
      ORDER BY severity DESC, created_at ASC
    `;
    
    const result = await this.db.query(query, [policyIds]);
    
    return result.rows.map((row: PolicyEntity) => this.mapPolicyEntityToPolicy(row));
  }

  private async executePolicyEvaluation(
    versionId: string,
    policy: Policy,
    context: Record<string, any>,
    dryRun: boolean
  ): Promise<PolicyEvaluationResult> {
    try {
      // Update evaluation status to running
      await this.updateEvaluationStatus(versionId, policy.id, PolicyEvaluationStatus.RUNNING);

      // Build evaluation context
      const evaluationContext = await this.evaluationEngine.buildEvaluationContext(versionId, context);
      
      // Execute policy using evaluation engine
      const engineResult = await this.evaluationEngine.executePolicy(policy, evaluationContext, dryRun);

      // Update evaluation status to completed
      await this.updateEvaluationStatus(versionId, policy.id, PolicyEvaluationStatus.COMPLETED);

      return {
        evaluationId: crypto.randomUUID(), // This should be the actual evaluation ID
        policyId: engineResult.policyId,
        policyName: engineResult.policyName,
        status: engineResult.overallStatus,
        results: engineResult.results,
        blocking: engineResult.blocking
      };
    } catch (error: any) {
      // Update evaluation status to failed
      await this.updateEvaluationStatus(versionId, policy.id, PolicyEvaluationStatus.FAILED, error.message);
      
      throw error;
    }
  }



  private async updateEvaluationStatus(
    versionId: string,
    policyId: string,
    status: PolicyEvaluationStatus,
    errorMessage?: string
  ): Promise<void> {
    const query = `
      UPDATE policy_evaluations 
      SET status = $1, completed_at = $2, error_message = $3
      WHERE version_id = $4 AND policy_id = $5
    `;
    
    const completedAt = status === PolicyEvaluationStatus.COMPLETED || status === PolicyEvaluationStatus.FAILED 
      ? new Date() 
      : null;
    
    await this.db.query(query, [status, completedAt, errorMessage || null, versionId, policyId]);
  }

  private determineOverallPolicyStatus(results: PolicyResult[]): PolicyResultStatus {
    if (results.some(r => r.status === PolicyResultStatus.ERROR)) {
      return PolicyResultStatus.ERROR;
    }
    if (results.some(r => r.status === PolicyResultStatus.FAIL)) {
      return PolicyResultStatus.FAIL;
    }
    if (results.some(r => r.status === PolicyResultStatus.WARNING)) {
      return PolicyResultStatus.WARNING;
    }
    return PolicyResultStatus.PASS;
  }

  private calculateEvaluationSummary(
    evaluationId: string,
    versionId: string,
    results: PolicyEvaluationResult[]
  ): PolicyEvaluationSummary {
    const totalPolicies = results.length;
    const passedPolicies = results.filter(r => r.status === PolicyResultStatus.PASS).length;
    const failedPolicies = results.filter(r => r.status === PolicyResultStatus.FAIL).length;
    const warningPolicies = results.filter(r => r.status === PolicyResultStatus.WARNING).length;
    const blockingViolations = results.filter(r => r.blocking && r.status === PolicyResultStatus.FAIL).length;

    let overallStatus: 'pass' | 'fail' | 'warning' = 'pass';
    if (failedPolicies > 0) {
      overallStatus = 'fail';
    } else if (warningPolicies > 0) {
      overallStatus = 'warning';
    }

    return {
      evaluationId,
      versionId,
      totalPolicies,
      passedPolicies,
      failedPolicies,
      warningPolicies,
      blockingViolations,
      overallStatus,
      results
    };
  }

  // Entity mapping methods

  private mapPolicyEntityToPolicy(entity: PolicyEntity): Policy {
    return {
      id: entity.id,
      name: entity.name,
      description: entity.description,
      version: entity.version,
      status: entity.status,
      severity: entity.severity,
      ruleDefinition: typeof entity.rule_definition === 'string' 
        ? JSON.parse(entity.rule_definition) 
        : entity.rule_definition,
      metadata: typeof entity.metadata === 'string' 
        ? JSON.parse(entity.metadata) 
        : entity.metadata,
      createdBy: entity.created_by,
      createdAt: entity.created_at,
      updatedAt: entity.updated_at,
      activatedAt: entity.activated_at
    };
  }

  private mapPolicyResultEntityToResult(entity: PolicyResultEntity): PolicyResult {
    return {
      id: entity.id,
      evaluationId: entity.evaluation_id,
      ruleName: entity.rule_name,
      status: entity.status,
      message: entity.message,
      details: typeof entity.details === 'string' 
        ? JSON.parse(entity.details) 
        : entity.details,
      blocking: entity.blocking,
      createdAt: entity.created_at
    };
  }

  private mapPolicyExceptionEntityToException(entity: PolicyExceptionEntity): PolicyException {
    return {
      id: entity.id,
      versionId: entity.version_id,
      policyId: entity.policy_id,
      justification: entity.justification,
      approvedBy: entity.approved_by,
      expiresAt: entity.expires_at,
      createdAt: entity.created_at
    };
  }
}