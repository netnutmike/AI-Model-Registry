import { DatabaseService } from '../database/databaseService.js';
import {
  EvaluationJob,
  EvaluationJobEntity,
  RunEvaluationRequest,
  EvaluationJobStatus,
  JobPriority,
  EvaluationResults,
  EvaluationThresholds,
  EvaluationTestType,
  Artifact
} from '../../types/index.js';
import { EventEmitter } from 'events';

export interface EvaluationExecutionResult {
  jobId: string;
  success: boolean;
  results?: EvaluationResults;
  error?: string;
}

export interface EvaluationTestRunner {
  executeTest(
    testType: EvaluationTestType,
    artifacts: Artifact[],
    dataset: any,
    configuration: any
  ): Promise<Record<string, number>>;
}

export class EvaluationExecutionEngine extends EventEmitter {
  private runningJobs = new Map<string, AbortController>();
  private jobQueue: string[] = [];
  private maxConcurrentJobs = 5;
  private currentRunningJobs = 0;

  constructor(
    private db: DatabaseService,
    private testRunner: EvaluationTestRunner,
    private autoStart: boolean = true
  ) {
    super();
    if (this.autoStart) {
      this.startJobProcessor();
    }
  }

  /**
   * Create and queue an evaluation job
   */
  async createEvaluationJob(request: RunEvaluationRequest): Promise<EvaluationJob> {
    // Get model version and artifacts
    const versionQuery = `
      SELECT mv.*, m.name as model_name, m.group as model_group
      FROM model_versions mv
      JOIN models m ON mv.model_id = m.id
      WHERE mv.id = $1
    `;
    
    const versionResult = await this.db.query(versionQuery, [request.versionId]);
    if (versionResult.rows.length === 0) {
      throw new Error(`Model version not found: ${request.versionId}`);
    }

    // Get evaluation suite
    const suiteQuery = `
      SELECT * FROM evaluation_suites
      WHERE id = $1 AND status = 'active'
    `;
    
    const suiteResult = await this.db.query(suiteQuery, [request.suiteId]);
    if (suiteResult.rows.length === 0) {
      throw new Error(`Active evaluation suite not found: ${request.suiteId}`);
    }

    // Get model artifacts
    const artifactsQuery = `
      SELECT * FROM artifacts
      WHERE version_id = $1
      ORDER BY type
    `;
    
    const artifactsResult = await this.db.query(artifactsQuery, [request.versionId]);
    const artifacts = artifactsResult.rows.map(row => ({
      id: row.id,
      versionId: row.version_id,
      type: row.type,
      uri: row.uri,
      sha256: row.sha256,
      size: row.size,
      license: row.license,
      createdAt: row.created_at
    }));

    // Create job configuration
    const jobConfiguration = {
      suiteConfiguration: suiteResult.rows[0].configuration,
      modelArtifacts: artifacts,
      environment: request.environment || {}
    };

    // Create evaluation job
    const createJobQuery = `
      INSERT INTO evaluation_jobs (version_id, suite_id, priority, configuration)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;

    const jobResult = await this.db.query(createJobQuery, [
      request.versionId,
      request.suiteId,
      request.priority || JobPriority.NORMAL,
      JSON.stringify(jobConfiguration)
    ]);

    const job = this.mapEvaluationJobEntityToModel(jobResult.rows[0]);

    // Add to queue only if auto-start is enabled
    if (this.autoStart) {
      this.queueJob(job.id);
    }

    this.emit('jobCreated', job);
    return job;
  }

  /**
   * Get evaluation job by ID
   */
  async getEvaluationJob(id: string): Promise<EvaluationJob | null> {
    const query = `
      SELECT * FROM evaluation_jobs
      WHERE id = $1
    `;

    const result = await this.db.query(query, [id]);
    
    if (result.rows.length === 0) {
      return null;
    }

    return this.mapEvaluationJobEntityToModel(result.rows[0]);
  }

  /**
   * Cancel evaluation job
   */
  async cancelEvaluationJob(id: string): Promise<boolean> {
    // Cancel running job if exists
    const abortController = this.runningJobs.get(id);
    if (abortController) {
      abortController.abort();
      this.runningJobs.delete(id);
      this.currentRunningJobs--;
    }

    // Remove from queue
    const queueIndex = this.jobQueue.indexOf(id);
    if (queueIndex > -1) {
      this.jobQueue.splice(queueIndex, 1);
    }

    // Update job status
    const query = `
      UPDATE evaluation_jobs
      SET status = 'cancelled', completed_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND status IN ('pending', 'queued', 'running')
      RETURNING *
    `;

    const result = await this.db.query(query, [id]);
    
    if (result.rows.length > 0) {
      const job = this.mapEvaluationJobEntityToModel(result.rows[0]);
      this.emit('jobCancelled', job);
      return true;
    }

    return false;
  }

  /**
   * Get evaluation job history with filters
   */
  async getEvaluationHistory(query: {
    versionId?: string;
    suiteId?: string;
    status?: EvaluationJobStatus;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<{ jobs: EvaluationJob[]; total: number }> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (query.versionId) {
      conditions.push(`version_id = $${paramIndex}`);
      params.push(query.versionId);
      paramIndex++;
    }

    if (query.suiteId) {
      conditions.push(`suite_id = $${paramIndex}`);
      params.push(query.suiteId);
      paramIndex++;
    }

    if (query.status) {
      conditions.push(`status = $${paramIndex}`);
      params.push(query.status);
      paramIndex++;
    }

    if (query.startDate) {
      conditions.push(`created_at >= $${paramIndex}`);
      params.push(query.startDate);
      paramIndex++;
    }

    if (query.endDate) {
      conditions.push(`created_at <= $${paramIndex}`);
      params.push(query.endDate);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    
    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM evaluation_jobs
      ${whereClause}
    `;
    
    const countResult = await this.db.query(countQuery, params);
    const total = parseInt(countResult.rows[0].total);

    // Get paginated results
    const limit = query.limit || 50;
    const offset = query.offset || 0;

    const jobsQuery = `
      SELECT * FROM evaluation_jobs
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const result = await this.db.query(jobsQuery, [...params, limit, offset]);

    const jobs = result.rows.map(row => this.mapEvaluationJobEntityToModel(row));

    return { jobs, total };
  }

  /**
   * Queue job for execution
   */
  private queueJob(jobId: string): void {
    // Update job status to queued
    this.updateJobStatus(jobId, EvaluationJobStatus.QUEUED);
    
    // Add to queue based on priority
    this.jobQueue.push(jobId);
    this.sortJobQueue();
    
    // Process queue
    this.processQueue();
  }

  /**
   * Sort job queue by priority
   */
  private async sortJobQueue(): Promise<void> {
    if (this.jobQueue.length <= 1) return;

    const jobsQuery = `
      SELECT id, priority FROM evaluation_jobs
      WHERE id = ANY($1)
    `;

    const result = await this.db.query(jobsQuery, [this.jobQueue]);
    const priorityMap = new Map<string, JobPriority>();
    
    result.rows.forEach(row => {
      priorityMap.set(row.id, row.priority);
    });

    const priorityOrder = {
      [JobPriority.URGENT]: 0,
      [JobPriority.HIGH]: 1,
      [JobPriority.NORMAL]: 2,
      [JobPriority.LOW]: 3
    };

    this.jobQueue.sort((a, b) => {
      const priorityA = priorityOrder[priorityMap.get(a) || JobPriority.NORMAL];
      const priorityB = priorityOrder[priorityMap.get(b) || JobPriority.NORMAL];
      return priorityA - priorityB;
    });
  }

  /**
   * Process job queue
   */
  private async processQueue(): Promise<void> {
    while (this.currentRunningJobs < this.maxConcurrentJobs && this.jobQueue.length > 0) {
      const jobId = this.jobQueue.shift();
      if (jobId) {
        this.executeJob(jobId);
      }
    }
  }

  /**
   * Execute evaluation job
   */
  private async executeJob(jobId: string): Promise<void> {
    const abortController = new AbortController();
    this.runningJobs.set(jobId, abortController);
    this.currentRunningJobs++;

    try {
      // Update job status to running
      await this.updateJobStatus(jobId, EvaluationJobStatus.RUNNING);

      // Get job details
      const job = await this.getEvaluationJob(jobId);
      if (!job) {
        throw new Error(`Job not found: ${jobId}`);
      }

      this.emit('jobStarted', job);

      // Execute evaluation
      const results = await this.runEvaluation(job, abortController.signal);

      // Compare results with thresholds
      const passed = this.compareWithThresholds(
        results,
        job.configuration.suiteConfiguration.thresholds
      );

      // Update job with results
      await this.updateJobResults(jobId, results, passed);

      this.emit('jobCompleted', { ...job, results, passed });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Update job status to failed
      await this.updateJobStatus(jobId, EvaluationJobStatus.FAILED, errorMessage);

      const job = await this.getEvaluationJob(jobId);
      this.emit('jobFailed', { ...job, errorMessage });

    } finally {
      this.runningJobs.delete(jobId);
      this.currentRunningJobs--;
      
      // Process next job in queue
      this.processQueue();
    }
  }

  /**
   * Run evaluation tests
   */
  private async runEvaluation(job: EvaluationJob, signal: AbortSignal): Promise<EvaluationResults> {
    const { suiteConfiguration, modelArtifacts } = job.configuration;
    const testTypes = suiteConfiguration.testTypes;

    const results: EvaluationResults = {
      taskMetrics: {},
      biasMetrics: {},
      safetyMetrics: {},
      robustnessMetrics: {}
    };

    // Execute each test type
    for (const testType of testTypes) {
      if (signal.aborted) {
        throw new Error('Evaluation cancelled');
      }

      try {
        const testResults = await this.testRunner.executeTest(
          testType,
          modelArtifacts,
          suiteConfiguration.datasets,
          suiteConfiguration
        );

        // Map results to appropriate metric category
        switch (testType) {
          case EvaluationTestType.EFFECTIVENESS:
          case EvaluationTestType.PERFORMANCE:
            Object.assign(results.taskMetrics, testResults);
            break;
          case EvaluationTestType.BIAS:
          case EvaluationTestType.FAIRNESS:
            Object.assign(results.biasMetrics, testResults);
            break;
          case EvaluationTestType.SAFETY:
            Object.assign(results.safetyMetrics, testResults);
            break;
          case EvaluationTestType.ROBUSTNESS:
            Object.assign(results.robustnessMetrics, testResults);
            break;
        }
      } catch (error) {
        console.error(`Test execution failed for ${testType}:`, error);
        // Continue with other tests
      }
    }

    return results;
  }

  /**
   * Compare results with thresholds
   */
  private compareWithThresholds(results: EvaluationResults, thresholds: EvaluationThresholds): boolean {
    const metricCategories = ['taskMetrics', 'biasMetrics', 'safetyMetrics', 'robustnessMetrics'] as const;

    for (const category of metricCategories) {
      const categoryResults = results[category];
      const categoryThresholds = thresholds[category];

      for (const [metric, threshold] of Object.entries(categoryThresholds)) {
        const result = categoryResults[metric];
        if (result === undefined || result < threshold) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Update job status
   */
  private async updateJobStatus(
    jobId: string,
    status: EvaluationJobStatus,
    errorMessage?: string
  ): Promise<void> {
    const query = `
      UPDATE evaluation_jobs
      SET status = $1, error_message = $2
      WHERE id = $3
    `;

    await this.db.query(query, [status, errorMessage || null, jobId]);
  }

  /**
   * Update job results
   */
  private async updateJobResults(
    jobId: string,
    results: EvaluationResults,
    passed: boolean
  ): Promise<void> {
    const query = `
      UPDATE evaluation_jobs
      SET status = 'completed', results = $1, completed_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `;

    await this.db.query(query, [JSON.stringify(results), jobId]);

    // Also update the evaluations table for compatibility
    const evaluationQuery = `
      INSERT INTO evaluations (version_id, suite_id, results, thresholds, passed, executed_at)
      SELECT version_id, suite_id, $1, 
             (configuration->'suiteConfiguration'->'thresholds')::jsonb,
             $2, CURRENT_TIMESTAMP
      FROM evaluation_jobs
      WHERE id = $3
    `;

    await this.db.query(evaluationQuery, [JSON.stringify(results), passed, jobId]);
  }

  /**
   * Start job processor
   */
  private startJobProcessor(): void {
    // Process queue every 5 seconds
    setInterval(() => {
      this.processQueue();
    }, 5000);

    // Restart failed jobs every minute
    setInterval(() => {
      this.restartFailedJobs();
    }, 60000);
  }

  /**
   * Restart failed jobs that can be retried
   */
  private async restartFailedJobs(): Promise<void> {
    const query = `
      SELECT * FROM evaluation_jobs
      WHERE status = 'failed' 
        AND created_at > NOW() - INTERVAL '1 hour'
        AND (configuration->>'retryCount')::int < 3
    `;

    const result = await this.db.query(query);

    for (const row of result.rows) {
      const job = this.mapEvaluationJobEntityToModel(row);
      
      // Update retry count
      const retryCount = (job.configuration as any).retryCount || 0;
      const updatedConfiguration = {
        ...job.configuration,
        retryCount: retryCount + 1
      };

      const updateQuery = `
        UPDATE evaluation_jobs
        SET status = 'pending', configuration = $1, error_message = NULL
        WHERE id = $2
      `;

      await this.db.query(updateQuery, [JSON.stringify(updatedConfiguration), job.id]);

      // Re-queue the job
      this.queueJob(job.id);
    }
  }

  /**
   * Map database entity to model
   */
  private mapEvaluationJobEntityToModel(entity: EvaluationJobEntity): EvaluationJob {
    return {
      id: entity.id,
      versionId: entity.version_id,
      suiteId: entity.suite_id,
      status: entity.status,
      priority: entity.priority,
      configuration: entity.configuration,
      results: entity.results,
      errorMessage: entity.error_message,
      startedAt: entity.started_at,
      completedAt: entity.completed_at,
      createdAt: entity.created_at
    };
  }
}