import { Pool } from 'pg';
import {
  Deployment,
  DeploymentEntity,
  CreateDeploymentRequest,
  UpdateDeploymentRequest,
  DeploymentQuery,
  DeploymentStatus,
  DeploymentEnvironment,
  TrafficSplit,
  TrafficSplitEntity,
  CreateTrafficSplitRequest,
  RollbackOperation,
  RollbackOperationEntity,
  CreateRollbackRequest,
  RollbackStatus,
  DeploymentMetrics,
  DeploymentMetricsEntity,
  MetricsQuery,
  DeploymentAlert,
  DeploymentAlertEntity,
  AlertType,
  AlertSeverity
} from '../../types/index.js';

export class DeploymentService {
  constructor(private db: Pool) {}

  async createDeployment(
    request: CreateDeploymentRequest,
    deployedBy: string
  ): Promise<Deployment> {
    const query = `
      INSERT INTO deployments (
        version_id, environment, status, strategy, configuration,
        slo_targets, drift_thresholds, deployed_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;

    const values = [
      request.versionId,
      request.environment,
      DeploymentStatus.PENDING,
      request.strategy,
      JSON.stringify(request.configuration),
      JSON.stringify(request.sloTargets),
      JSON.stringify(request.driftThresholds),
      deployedBy
    ];

    const result = await this.db.query<DeploymentEntity>(query, values);
    return this.mapEntityToDeployment(result.rows[0]);
  }

  async getDeployment(id: string): Promise<Deployment | null> {
    const query = 'SELECT * FROM deployments WHERE id = $1';
    const result = await this.db.query<DeploymentEntity>(query, [id]);
    
    if (result.rows.length === 0) {
      return null;
    }

    return this.mapEntityToDeployment(result.rows[0]);
  }

  async getDeployments(queryParams: DeploymentQuery): Promise<Deployment[]> {
    let query = 'SELECT * FROM deployments WHERE 1=1';
    const values: any[] = [];
    let paramCount = 0;

    if (queryParams.environment) {
      query += ` AND environment = $${++paramCount}`;
      values.push(queryParams.environment);
    }

    if (queryParams.status) {
      query += ` AND status = $${++paramCount}`;
      values.push(queryParams.status);
    }

    if (queryParams.versionId) {
      query += ` AND version_id = $${++paramCount}`;
      values.push(queryParams.versionId);
    }

    if (queryParams.deployedBy) {
      query += ` AND deployed_by = $${++paramCount}`;
      values.push(queryParams.deployedBy);
    }

    if (queryParams.startDate) {
      query += ` AND deployed_at >= $${++paramCount}`;
      values.push(queryParams.startDate);
    }

    if (queryParams.endDate) {
      query += ` AND deployed_at <= $${++paramCount}`;
      values.push(queryParams.endDate);
    }

    query += ' ORDER BY deployed_at DESC';

    if (queryParams.limit) {
      query += ` LIMIT $${++paramCount}`;
      values.push(queryParams.limit);
    }

    if (queryParams.offset !== undefined) {
      query += ` OFFSET $${++paramCount}`;
      values.push(queryParams.offset);
    }

    const result = await this.db.query<DeploymentEntity>(query, values);
    return result.rows.map(row => this.mapEntityToDeployment(row));
  }

  async updateDeployment(
    id: string,
    request: UpdateDeploymentRequest
  ): Promise<Deployment | null> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 0;

    if (request.configuration) {
      updates.push(`configuration = $${++paramCount}`);
      values.push(JSON.stringify(request.configuration));
    }

    if (request.sloTargets) {
      updates.push(`slo_targets = $${++paramCount}`);
      values.push(JSON.stringify(request.sloTargets));
    }

    if (request.driftThresholds) {
      updates.push(`drift_thresholds = $${++paramCount}`);
      values.push(JSON.stringify(request.driftThresholds));
    }

    if (updates.length === 0) {
      return this.getDeployment(id);
    }

    const query = `
      UPDATE deployments 
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE id = $${++paramCount}
      RETURNING *
    `;
    values.push(id);

    const result = await this.db.query<DeploymentEntity>(query, values);
    
    if (result.rows.length === 0) {
      return null;
    }

    return this.mapEntityToDeployment(result.rows[0]);
  }

  async updateDeploymentStatus(
    id: string,
    status: DeploymentStatus
  ): Promise<Deployment | null> {
    const query = `
      UPDATE deployments 
      SET status = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `;

    const result = await this.db.query<DeploymentEntity>(query, [status, id]);
    
    if (result.rows.length === 0) {
      return null;
    }

    return this.mapEntityToDeployment(result.rows[0]);
  }

  async deleteDeployment(id: string): Promise<boolean> {
    const query = 'DELETE FROM deployments WHERE id = $1';
    const result = await this.db.query(query, [id]);
    return result.rowCount > 0;
  }

  // Traffic splitting methods
  async createTrafficSplit(request: CreateTrafficSplitRequest): Promise<TrafficSplit> {
    const query = `
      INSERT INTO traffic_splits (deployment_id, percentage)
      VALUES ($1, $2)
      RETURNING *
    `;

    const result = await this.db.query<TrafficSplitEntity>(query, [
      request.deploymentId,
      request.percentage
    ]);

    return this.mapEntityToTrafficSplit(result.rows[0]);
  }

  async getTrafficSplits(deploymentId: string): Promise<TrafficSplit[]> {
    const query = 'SELECT * FROM traffic_splits WHERE deployment_id = $1 ORDER BY started_at DESC';
    const result = await this.db.query<TrafficSplitEntity>(query, [deploymentId]);
    return result.rows.map(row => this.mapEntityToTrafficSplit(row));
  }

  async completeTrafficSplit(id: string): Promise<TrafficSplit | null> {
    const query = `
      UPDATE traffic_splits 
      SET completed_at = NOW()
      WHERE id = $1
      RETURNING *
    `;

    const result = await this.db.query<TrafficSplitEntity>(query, [id]);
    
    if (result.rows.length === 0) {
      return null;
    }

    return this.mapEntityToTrafficSplit(result.rows[0]);
  }

  // Rollback methods
  async createRollback(
    deploymentId: string,
    request: CreateRollbackRequest,
    initiatedBy: string
  ): Promise<RollbackOperation> {
    const query = `
      INSERT INTO rollback_operations (
        deployment_id, target_version_id, reason, status, initiated_by
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;

    const result = await this.db.query<RollbackOperationEntity>(query, [
      deploymentId,
      request.targetVersionId,
      request.reason,
      RollbackStatus.PENDING,
      initiatedBy
    ]);

    return this.mapEntityToRollbackOperation(result.rows[0]);
  }

  async getRollbackOperations(deploymentId: string): Promise<RollbackOperation[]> {
    const query = 'SELECT * FROM rollback_operations WHERE deployment_id = $1 ORDER BY initiated_at DESC';
    const result = await this.db.query<RollbackOperationEntity>(query, [deploymentId]);
    return result.rows.map(row => this.mapEntityToRollbackOperation(row));
  }

  async updateRollbackStatus(
    id: string,
    status: RollbackStatus,
    errorMessage?: string
  ): Promise<RollbackOperation | null> {
    const query = `
      UPDATE rollback_operations 
      SET status = $1, error_message = $2, 
          completed_at = CASE WHEN $1 IN ('completed', 'failed') THEN NOW() ELSE completed_at END
      WHERE id = $3
      RETURNING *
    `;

    const result = await this.db.query<RollbackOperationEntity>(query, [
      status,
      errorMessage || null,
      id
    ]);
    
    if (result.rows.length === 0) {
      return null;
    }

    return this.mapEntityToRollbackOperation(result.rows[0]);
  }

  // Metrics methods
  async recordMetrics(metrics: Omit<DeploymentMetrics, 'id'>): Promise<DeploymentMetrics> {
    const query = `
      INSERT INTO deployment_metrics (
        deployment_id, timestamp, availability, latency_p95, latency_p99,
        error_rate, input_drift, output_drift, performance_drift, request_count
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;

    const values = [
      metrics.deploymentId,
      metrics.timestamp,
      metrics.availability,
      metrics.latencyP95,
      metrics.latencyP99,
      metrics.errorRate,
      metrics.inputDrift || null,
      metrics.outputDrift || null,
      metrics.performanceDrift || null,
      metrics.requestCount
    ];

    const result = await this.db.query<DeploymentMetricsEntity>(query, values);
    return this.mapEntityToDeploymentMetrics(result.rows[0]);
  }

  async getMetrics(query: MetricsQuery): Promise<DeploymentMetrics[]> {
    let sql = `
      SELECT * FROM deployment_metrics 
      WHERE deployment_id = $1 
        AND timestamp >= $2 
        AND timestamp <= $3
    `;
    const values = [query.deploymentId, query.startTime, query.endTime];

    if (query.granularity) {
      // Group by time intervals for aggregation
      const interval = query.granularity === 'minute' ? '1 minute' : 
                      query.granularity === 'hour' ? '1 hour' : '1 day';
      
      sql = `
        SELECT 
          deployment_id,
          date_trunc('${query.granularity}', timestamp) as timestamp,
          AVG(availability) as availability,
          AVG(latency_p95) as latency_p95,
          AVG(latency_p99) as latency_p99,
          AVG(error_rate) as error_rate,
          AVG(input_drift) as input_drift,
          AVG(output_drift) as output_drift,
          AVG(performance_drift) as performance_drift,
          SUM(request_count) as request_count
        FROM deployment_metrics 
        WHERE deployment_id = $1 
          AND timestamp >= $2 
          AND timestamp <= $3
        GROUP BY deployment_id, date_trunc('${query.granularity}', timestamp)
      `;
    }

    sql += ' ORDER BY timestamp ASC';

    const result = await this.db.query<DeploymentMetricsEntity>(sql, values);
    return result.rows.map(row => this.mapEntityToDeploymentMetrics(row));
  }

  // Alert methods
  async createAlert(alert: Omit<DeploymentAlert, 'id'>): Promise<DeploymentAlert> {
    const query = `
      INSERT INTO deployment_alerts (
        deployment_id, type, severity, message, threshold, actual_value
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;

    const values = [
      alert.deploymentId,
      alert.type,
      alert.severity,
      alert.message,
      alert.threshold,
      alert.actualValue
    ];

    const result = await this.db.query<DeploymentAlertEntity>(query, values);
    return this.mapEntityToDeploymentAlert(result.rows[0]);
  }

  async getAlerts(deploymentId: string, acknowledged?: boolean): Promise<DeploymentAlert[]> {
    let query = 'SELECT * FROM deployment_alerts WHERE deployment_id = $1';
    const values: any[] = [deploymentId];

    if (acknowledged !== undefined) {
      query += ' AND acknowledged = $2';
      values.push(acknowledged);
    }

    query += ' ORDER BY triggered_at DESC';

    const result = await this.db.query<DeploymentAlertEntity>(query, values);
    return result.rows.map(row => this.mapEntityToDeploymentAlert(row));
  }

  async acknowledgeAlert(id: string): Promise<DeploymentAlert | null> {
    const query = `
      UPDATE deployment_alerts 
      SET acknowledged = true
      WHERE id = $1
      RETURNING *
    `;

    const result = await this.db.query<DeploymentAlertEntity>(query, [id]);
    
    if (result.rows.length === 0) {
      return null;
    }

    return this.mapEntityToDeploymentAlert(result.rows[0]);
  }

  async resolveAlert(id: string): Promise<DeploymentAlert | null> {
    const query = `
      UPDATE deployment_alerts 
      SET resolved_at = NOW()
      WHERE id = $1
      RETURNING *
    `;

    const result = await this.db.query<DeploymentAlertEntity>(query, [id]);
    
    if (result.rows.length === 0) {
      return null;
    }

    return this.mapEntityToDeploymentAlert(result.rows[0]);
  }

  // Helper methods for mapping database entities to domain objects
  private mapEntityToDeployment(entity: DeploymentEntity): Deployment {
    return {
      id: entity.id,
      versionId: entity.version_id,
      environment: entity.environment,
      status: entity.status,
      strategy: entity.strategy,
      configuration: typeof entity.configuration === 'string' ? JSON.parse(entity.configuration) : entity.configuration,
      trafficSplit: entity.traffic_split ? (typeof entity.traffic_split === 'string' ? JSON.parse(entity.traffic_split) : entity.traffic_split) : null,
      sloTargets: typeof entity.slo_targets === 'string' ? JSON.parse(entity.slo_targets) : entity.slo_targets,
      driftThresholds: typeof entity.drift_thresholds === 'string' ? JSON.parse(entity.drift_thresholds) : entity.drift_thresholds,
      deployedBy: entity.deployed_by,
      deployedAt: entity.deployed_at,
      updatedAt: entity.updated_at
    };
  }

  private mapEntityToTrafficSplit(entity: TrafficSplitEntity): TrafficSplit {
    return {
      id: entity.id,
      deploymentId: entity.deployment_id,
      percentage: entity.percentage,
      startedAt: entity.started_at,
      completedAt: entity.completed_at
    };
  }

  private mapEntityToRollbackOperation(entity: RollbackOperationEntity): RollbackOperation {
    return {
      id: entity.id,
      deploymentId: entity.deployment_id,
      targetVersionId: entity.target_version_id,
      reason: entity.reason,
      status: entity.status,
      initiatedBy: entity.initiated_by,
      initiatedAt: entity.initiated_at,
      completedAt: entity.completed_at,
      errorMessage: entity.error_message
    };
  }

  private mapEntityToDeploymentMetrics(entity: DeploymentMetricsEntity): DeploymentMetrics {
    return {
      id: entity.id,
      deploymentId: entity.deployment_id,
      timestamp: entity.timestamp,
      availability: entity.availability,
      latencyP95: entity.latency_p95,
      latencyP99: entity.latency_p99,
      errorRate: entity.error_rate,
      inputDrift: entity.input_drift,
      outputDrift: entity.output_drift,
      performanceDrift: entity.performance_drift,
      requestCount: entity.request_count
    };
  }

  private mapEntityToDeploymentAlert(entity: DeploymentAlertEntity): DeploymentAlert {
    return {
      id: entity.id,
      deploymentId: entity.deployment_id,
      type: entity.type,
      severity: entity.severity,
      message: entity.message,
      threshold: entity.threshold,
      actualValue: entity.actual_value,
      triggeredAt: entity.triggered_at,
      resolvedAt: entity.resolved_at,
      acknowledged: entity.acknowledged
    };
  }
}