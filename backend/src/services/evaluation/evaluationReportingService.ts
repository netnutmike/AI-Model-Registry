import { DatabaseService } from '../database/databaseService.js';
import {
  EvaluationJob,
  EvaluationResults,
  EvaluationHistoryQuery,
  EvaluationJobStatus
} from '../../types/index.js';

export interface EvaluationTrend {
  date: Date;
  averageScore: number;
  passRate: number;
  jobCount: number;
}

export interface EvaluationSummary {
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  averageExecutionTime: number;
  passRate: number;
  trends: EvaluationTrend[];
}

export interface MetricTrend {
  metricName: string;
  category: 'taskMetrics' | 'biasMetrics' | 'safetyMetrics' | 'robustnessMetrics';
  values: Array<{
    date: Date;
    value: number;
    threshold: number;
    passed: boolean;
  }>;
}

export interface EvaluationVisualizationData {
  summary: EvaluationSummary;
  metricTrends: MetricTrend[];
  recentJobs: EvaluationJob[];
  topFailingMetrics: Array<{
    metricName: string;
    category: string;
    failureRate: number;
    averageScore: number;
  }>;
}

export class EvaluationReportingService {
  constructor(private db: DatabaseService) {}

  /**
   * Get evaluation results for a specific job
   */
  async getEvaluationResults(jobId: string): Promise<EvaluationJob | null> {
    const query = `
      SELECT ej.*, 
             mv.version, mv.model_id,
             m.name as model_name, m.group as model_group,
             es.name as suite_name, es.version as suite_version
      FROM evaluation_jobs ej
      JOIN model_versions mv ON ej.version_id = mv.id
      JOIN models m ON mv.model_id = m.id
      JOIN evaluation_suites es ON ej.suite_id = es.id
      WHERE ej.id = $1
    `;

    const result = await this.db.query(query, [jobId]);
    
    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      versionId: row.version_id,
      suiteId: row.suite_id,
      status: row.status,
      priority: row.priority,
      configuration: row.configuration,
      results: row.results,
      errorMessage: row.error_message,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      createdAt: row.created_at
    };
  }

  /**
   * Get evaluation history with enhanced filtering
   */
  async getEvaluationHistory(query: EvaluationHistoryQuery): Promise<{
    jobs: Array<EvaluationJob & {
      modelName: string;
      modelGroup: string;
      modelVersion: string;
      suiteName: string;
      suiteVersion: string;
      executionTime?: number;
    }>;
    total: number;
  }> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (query.versionId) {
      conditions.push(`ej.version_id = $${paramIndex}`);
      params.push(query.versionId);
      paramIndex++;
    }

    if (query.suiteId) {
      conditions.push(`ej.suite_id = $${paramIndex}`);
      params.push(query.suiteId);
      paramIndex++;
    }

    if (query.status) {
      conditions.push(`ej.status = $${paramIndex}`);
      params.push(query.status);
      paramIndex++;
    }

    if (query.startDate) {
      conditions.push(`ej.created_at >= $${paramIndex}`);
      params.push(query.startDate);
      paramIndex++;
    }

    if (query.endDate) {
      conditions.push(`ej.created_at <= $${paramIndex}`);
      params.push(query.endDate);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    
    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM evaluation_jobs ej
      ${whereClause}
    `;
    
    const countResult = await this.db.query(countQuery, params);
    const total = parseInt(countResult.rows[0].total);

    // Get paginated results with enhanced data
    const limit = query.limit || 50;
    const offset = query.offset || 0;

    const jobsQuery = `
      SELECT ej.*, 
             mv.version as model_version,
             m.name as model_name, m.group as model_group,
             es.name as suite_name, es.version as suite_version,
             EXTRACT(EPOCH FROM (ej.completed_at - ej.started_at)) as execution_time_seconds
      FROM evaluation_jobs ej
      JOIN model_versions mv ON ej.version_id = mv.id
      JOIN models m ON mv.model_id = m.id
      JOIN evaluation_suites es ON ej.suite_id = es.id
      ${whereClause}
      ORDER BY ej.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const result = await this.db.query(jobsQuery, [...params, limit, offset]);

    const jobs = result.rows.map(row => ({
      id: row.id,
      versionId: row.version_id,
      suiteId: row.suite_id,
      status: row.status,
      priority: row.priority,
      configuration: row.configuration,
      results: row.results,
      errorMessage: row.error_message,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      createdAt: row.created_at,
      modelName: row.model_name,
      modelGroup: row.model_group,
      modelVersion: row.model_version,
      suiteName: row.suite_name,
      suiteVersion: row.suite_version,
      executionTime: row.execution_time_seconds
    }));

    return { jobs, total };
  }

  /**
   * Get evaluation trends over time
   */
  async getEvaluationTrends(
    versionId?: string,
    suiteId?: string,
    days: number = 30
  ): Promise<EvaluationTrend[]> {
    const conditions: string[] = ['ej.status = \'completed\''];
    const params: any[] = [];
    let paramIndex = 1;

    if (versionId) {
      conditions.push(`ej.version_id = $${paramIndex}`);
      params.push(versionId);
      paramIndex++;
    }

    if (suiteId) {
      conditions.push(`ej.suite_id = $${paramIndex}`);
      params.push(suiteId);
      paramIndex++;
    }

    conditions.push(`ej.completed_at >= NOW() - INTERVAL '${days} days'`);

    const query = `
      SELECT 
        DATE(ej.completed_at) as date,
        AVG(CASE 
          WHEN e.passed THEN 1.0 
          ELSE 0.0 
        END) as pass_rate,
        COUNT(*) as job_count,
        AVG(CASE 
          WHEN e.passed THEN 
            (COALESCE((e.results->'taskMetrics')::text::numeric, 0) +
             COALESCE((e.results->'biasMetrics')::text::numeric, 0) +
             COALESCE((e.results->'safetyMetrics')::text::numeric, 0) +
             COALESCE((e.results->'robustnessMetrics')::text::numeric, 0)) / 4
          ELSE 0
        END) as average_score
      FROM evaluation_jobs ej
      JOIN evaluations e ON e.version_id = ej.version_id AND e.suite_id = ej.suite_id
      WHERE ${conditions.join(' AND ')}
      GROUP BY DATE(ej.completed_at)
      ORDER BY date DESC
    `;

    const result = await this.db.query(query, params);

    return result.rows.map(row => ({
      date: row.date,
      averageScore: parseFloat(row.average_score) || 0,
      passRate: parseFloat(row.pass_rate) || 0,
      jobCount: parseInt(row.job_count)
    }));
  }

  /**
   * Get metric trends for visualization
   */
  async getMetricTrends(
    versionId?: string,
    suiteId?: string,
    days: number = 30
  ): Promise<MetricTrend[]> {
    const conditions: string[] = ['ej.status = \'completed\''];
    const params: any[] = [];
    let paramIndex = 1;

    if (versionId) {
      conditions.push(`ej.version_id = $${paramIndex}`);
      params.push(versionId);
      paramIndex++;
    }

    if (suiteId) {
      conditions.push(`ej.suite_id = $${paramIndex}`);
      params.push(suiteId);
      paramIndex++;
    }

    conditions.push(`ej.completed_at >= NOW() - INTERVAL '${days} days'`);

    const query = `
      SELECT 
        ej.completed_at,
        e.results,
        e.thresholds,
        e.passed
      FROM evaluation_jobs ej
      JOIN evaluations e ON e.version_id = ej.version_id AND e.suite_id = ej.suite_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY ej.completed_at DESC
    `;

    const result = await this.db.query(query, params);

    // Process results to extract metric trends
    const metricTrendsMap = new Map<string, MetricTrend>();

    for (const row of result.rows) {
      const results = row.results as EvaluationResults;
      const thresholds = row.thresholds;
      const date = row.completed_at;
      const passed = row.passed;

      // Process each metric category
      const categories = ['taskMetrics', 'biasMetrics', 'safetyMetrics', 'robustnessMetrics'] as const;
      
      for (const category of categories) {
        const categoryResults = results[category];
        const categoryThresholds = thresholds[category];

        for (const [metricName, value] of Object.entries(categoryResults)) {
          const trendKey = `${category}.${metricName}`;
          
          if (!metricTrendsMap.has(trendKey)) {
            metricTrendsMap.set(trendKey, {
              metricName,
              category,
              values: []
            });
          }

          const trend = metricTrendsMap.get(trendKey)!;
          trend.values.push({
            date,
            value: value as number,
            threshold: categoryThresholds[metricName] || 0,
            passed
          });
        }
      }
    }

    // Sort values by date for each trend
    const trends = Array.from(metricTrendsMap.values());
    trends.forEach(trend => {
      trend.values.sort((a, b) => a.date.getTime() - b.date.getTime());
    });

    return trends;
  }

  /**
   * Get evaluation summary statistics
   */
  async getEvaluationSummary(
    versionId?: string,
    suiteId?: string,
    days: number = 30
  ): Promise<EvaluationSummary> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (versionId) {
      conditions.push(`version_id = $${paramIndex}`);
      params.push(versionId);
      paramIndex++;
    }

    if (suiteId) {
      conditions.push(`suite_id = $${paramIndex}`);
      params.push(suiteId);
      paramIndex++;
    }

    conditions.push(`created_at >= NOW() - INTERVAL '${days} days'`);

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const query = `
      SELECT 
        COUNT(*) as total_jobs,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_jobs,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_jobs,
        AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) as avg_execution_time,
        AVG(CASE 
          WHEN status = 'completed' AND results IS NOT NULL THEN 
            CASE WHEN EXISTS (
              SELECT 1 FROM evaluations e 
              WHERE e.version_id = evaluation_jobs.version_id 
                AND e.suite_id = evaluation_jobs.suite_id 
                AND e.passed = true
            ) THEN 1.0 ELSE 0.0 END
          ELSE NULL
        END) as pass_rate
      FROM evaluation_jobs
      ${whereClause}
    `;

    const result = await this.db.query(query, params);
    const row = result.rows[0];

    // Get trends
    const trends = await this.getEvaluationTrends(versionId, suiteId, days);

    return {
      totalJobs: parseInt(row.total_jobs) || 0,
      completedJobs: parseInt(row.completed_jobs) || 0,
      failedJobs: parseInt(row.failed_jobs) || 0,
      averageExecutionTime: parseFloat(row.avg_execution_time) || 0,
      passRate: parseFloat(row.pass_rate) || 0,
      trends
    };
  }

  /**
   * Get top failing metrics for analysis
   */
  async getTopFailingMetrics(
    versionId?: string,
    suiteId?: string,
    days: number = 30,
    limit: number = 10
  ): Promise<Array<{
    metricName: string;
    category: string;
    failureRate: number;
    averageScore: number;
  }>> {
    const conditions: string[] = ['ej.status = \'completed\''];
    const params: any[] = [];
    let paramIndex = 1;

    if (versionId) {
      conditions.push(`ej.version_id = $${paramIndex}`);
      params.push(versionId);
      paramIndex++;
    }

    if (suiteId) {
      conditions.push(`ej.suite_id = $${paramIndex}`);
      params.push(suiteId);
      paramIndex++;
    }

    conditions.push(`ej.completed_at >= NOW() - INTERVAL '${days} days'`);

    const query = `
      SELECT 
        e.results,
        e.thresholds,
        e.passed
      FROM evaluation_jobs ej
      JOIN evaluations e ON e.version_id = ej.version_id AND e.suite_id = ej.suite_id
      WHERE ${conditions.join(' AND ')}
    `;

    const result = await this.db.query(query, params);

    // Process results to calculate failure rates
    const metricStats = new Map<string, {
      category: string;
      metricName: string;
      totalCount: number;
      failureCount: number;
      totalScore: number;
    }>();

    for (const row of result.rows) {
      const results = row.results as EvaluationResults;
      const thresholds = row.thresholds;

      const categories = ['taskMetrics', 'biasMetrics', 'safetyMetrics', 'robustnessMetrics'] as const;
      
      for (const category of categories) {
        const categoryResults = results[category];
        const categoryThresholds = thresholds[category];

        for (const [metricName, value] of Object.entries(categoryResults)) {
          const key = `${category}.${metricName}`;
          
          if (!metricStats.has(key)) {
            metricStats.set(key, {
              category,
              metricName,
              totalCount: 0,
              failureCount: 0,
              totalScore: 0
            });
          }

          const stats = metricStats.get(key)!;
          stats.totalCount++;
          stats.totalScore += value as number;

          const threshold = categoryThresholds[metricName] || 0;
          if ((value as number) < threshold) {
            stats.failureCount++;
          }
        }
      }
    }

    // Calculate failure rates and sort
    const failingMetrics = Array.from(metricStats.values())
      .map(stats => ({
        metricName: stats.metricName,
        category: stats.category,
        failureRate: stats.totalCount > 0 ? stats.failureCount / stats.totalCount : 0,
        averageScore: stats.totalCount > 0 ? stats.totalScore / stats.totalCount : 0
      }))
      .filter(metric => metric.failureRate > 0)
      .sort((a, b) => b.failureRate - a.failureRate)
      .slice(0, limit);

    return failingMetrics;
  }

  /**
   * Get comprehensive visualization data
   */
  async getEvaluationVisualizationData(
    versionId?: string,
    suiteId?: string,
    days: number = 30
  ): Promise<EvaluationVisualizationData> {
    const [summary, metricTrends, recentJobsResult, topFailingMetrics] = await Promise.all([
      this.getEvaluationSummary(versionId, suiteId, days),
      this.getMetricTrends(versionId, suiteId, days),
      this.getEvaluationHistory({
        versionId,
        suiteId,
        limit: 10,
        offset: 0
      }),
      this.getTopFailingMetrics(versionId, suiteId, days)
    ]);

    return {
      summary,
      metricTrends,
      recentJobs: recentJobsResult.jobs,
      topFailingMetrics
    };
  }
}