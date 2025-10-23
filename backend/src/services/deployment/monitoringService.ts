import { Pool } from 'pg';
import {
  Deployment,
  DeploymentMetrics,
  DeploymentAlert,
  SLOTargets,
  DriftThresholds,
  AlertType,
  AlertSeverity,
  DeploymentStatus,
  RollbackStatus
} from '../../types/index.js';
import { DeploymentService } from './deploymentService.js';

export interface MonitoringConfiguration {
  sloCheckIntervalMs: number;
  driftCheckIntervalMs: number;
  alertCooldownMs: number;
  autoRollbackEnabled: boolean;
  autoRollbackThreshold: number; // number of critical alerts before auto-rollback
}

export class MonitoringService {
  private deploymentService: DeploymentService;
  private config: MonitoringConfiguration;
  private activeMonitors: Map<string, NodeJS.Timeout> = new Map();

  constructor(
    private db: Pool,
    config?: Partial<MonitoringConfiguration>
  ) {
    this.deploymentService = new DeploymentService(db);
    this.config = {
      sloCheckIntervalMs: 60000, // 1 minute
      driftCheckIntervalMs: 300000, // 5 minutes
      alertCooldownMs: 900000, // 15 minutes
      autoRollbackEnabled: false,
      autoRollbackThreshold: 3,
      ...config
    };
  }

  async startMonitoring(deploymentId: string): Promise<void> {
    if (this.activeMonitors.has(deploymentId)) {
      return; // Already monitoring
    }

    const deployment = await this.deploymentService.getDeployment(deploymentId);
    if (!deployment || deployment.status !== DeploymentStatus.ACTIVE) {
      throw new Error(`Cannot monitor deployment ${deploymentId}: not active`);
    }

    // Start SLO monitoring
    const sloInterval = setInterval(async () => {
      await this.checkSLOs(deploymentId);
    }, this.config.sloCheckIntervalMs);

    // Start drift monitoring
    const driftInterval = setInterval(async () => {
      await this.checkDrift(deploymentId);
    }, this.config.driftCheckIntervalMs);

    // Store intervals for cleanup
    this.activeMonitors.set(deploymentId, sloInterval);
    this.activeMonitors.set(`${deploymentId}_drift`, driftInterval);
  }

  async stopMonitoring(deploymentId: string): Promise<void> {
    const sloInterval = this.activeMonitors.get(deploymentId);
    const driftInterval = this.activeMonitors.get(`${deploymentId}_drift`);

    if (sloInterval) {
      clearInterval(sloInterval);
      this.activeMonitors.delete(deploymentId);
    }

    if (driftInterval) {
      clearInterval(driftInterval);
      this.activeMonitors.delete(`${deploymentId}_drift`);
    }
  }

  async checkSLOs(deploymentId: string): Promise<void> {
    try {
      const deployment = await this.deploymentService.getDeployment(deploymentId);
      if (!deployment) {
        return;
      }

      // Get recent metrics (last 5 minutes)
      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - 5 * 60 * 1000);
      
      const metrics = await this.deploymentService.getMetrics({
        deploymentId,
        startTime,
        endTime
      });

      if (metrics.length === 0) {
        return;
      }

      // Calculate average metrics over the period
      const avgMetrics = this.calculateAverageMetrics(metrics);
      const sloTargets = deployment.sloTargets;

      // Check each SLO target
      await this.checkAvailabilitySLO(deploymentId, avgMetrics.availability, sloTargets.availability);
      await this.checkLatencySLO(deploymentId, avgMetrics.latencyP95, sloTargets.latencyP95, 'P95');
      await this.checkLatencySLO(deploymentId, avgMetrics.latencyP99, sloTargets.latencyP99, 'P99');
      await this.checkErrorRateSLO(deploymentId, avgMetrics.errorRate, sloTargets.errorRate);

      // Check for auto-rollback conditions
      if (this.config.autoRollbackEnabled) {
        await this.checkAutoRollbackConditions(deploymentId);
      }

    } catch (error) {
      console.error(`Error checking SLOs for deployment ${deploymentId}:`, error);
    }
  }

  async checkDrift(deploymentId: string): Promise<void> {
    try {
      const deployment = await this.deploymentService.getDeployment(deploymentId);
      if (!deployment) {
        return;
      }

      // Get recent metrics (last 15 minutes)
      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - 15 * 60 * 1000);
      
      const metrics = await this.deploymentService.getMetrics({
        deploymentId,
        startTime,
        endTime
      });

      if (metrics.length === 0) {
        return;
      }

      // Calculate average drift metrics
      const avgMetrics = this.calculateAverageMetrics(metrics);
      const driftThresholds = deployment.driftThresholds;

      // Check drift thresholds
      if (avgMetrics.inputDrift !== undefined && avgMetrics.inputDrift > driftThresholds.inputDrift) {
        await this.createDriftAlert(
          deploymentId,
          'input_drift',
          driftThresholds.inputDrift,
          avgMetrics.inputDrift,
          'Input drift detected above threshold'
        );
      }

      if (avgMetrics.outputDrift !== undefined && avgMetrics.outputDrift > driftThresholds.outputDrift) {
        await this.createDriftAlert(
          deploymentId,
          'output_drift',
          driftThresholds.outputDrift,
          avgMetrics.outputDrift,
          'Output drift detected above threshold'
        );
      }

      if (avgMetrics.performanceDrift !== undefined && avgMetrics.performanceDrift > driftThresholds.performanceDrift) {
        await this.createDriftAlert(
          deploymentId,
          'performance_drift',
          driftThresholds.performanceDrift,
          avgMetrics.performanceDrift,
          'Performance drift detected above threshold'
        );
      }

    } catch (error) {
      console.error(`Error checking drift for deployment ${deploymentId}:`, error);
    }
  }

  async triggerRollback(
    deploymentId: string,
    reason: string,
    initiatedBy: string
  ): Promise<void> {
    try {
      // Get deployment to find previous version
      const deployment = await this.deploymentService.getDeployment(deploymentId);
      if (!deployment) {
        throw new Error(`Deployment ${deploymentId} not found`);
      }

      // Find previous successful deployment for the same environment
      const previousDeployments = await this.deploymentService.getDeployments({
        environment: deployment.environment,
        status: DeploymentStatus.ACTIVE,
        limit: 2
      });

      const previousDeployment = previousDeployments.find(d => d.id !== deploymentId);
      if (!previousDeployment) {
        throw new Error('No previous deployment found for rollback');
      }

      // Create rollback operation
      await this.deploymentService.createRollback(
        deploymentId,
        {
          targetVersionId: previousDeployment.versionId,
          reason
        },
        initiatedBy
      );

      // Update deployment status
      await this.deploymentService.updateDeploymentStatus(
        deploymentId,
        DeploymentStatus.ROLLING_BACK
      );

      // Stop monitoring during rollback
      await this.stopMonitoring(deploymentId);

    } catch (error) {
      console.error(`Error triggering rollback for deployment ${deploymentId}:`, error);
      throw error;
    }
  }

  private async checkAvailabilitySLO(
    deploymentId: string,
    actualAvailability: number,
    targetAvailability: number
  ): Promise<void> {
    if (actualAvailability < targetAvailability) {
      const severity = actualAvailability < (targetAvailability - 1) ? 
        AlertSeverity.CRITICAL : AlertSeverity.WARNING;

      await this.createSLOAlert(
        deploymentId,
        AlertType.LOW_AVAILABILITY,
        severity,
        targetAvailability,
        actualAvailability,
        `Availability ${actualAvailability.toFixed(2)}% is below target ${targetAvailability}%`
      );
    }
  }

  private async checkLatencySLO(
    deploymentId: string,
    actualLatency: number,
    targetLatency: number,
    percentile: string
  ): Promise<void> {
    if (actualLatency > targetLatency) {
      const severity = actualLatency > (targetLatency * 1.5) ? 
        AlertSeverity.CRITICAL : AlertSeverity.WARNING;

      await this.createSLOAlert(
        deploymentId,
        AlertType.HIGH_LATENCY,
        severity,
        targetLatency,
        actualLatency,
        `${percentile} latency ${actualLatency}ms exceeds target ${targetLatency}ms`
      );
    }
  }

  private async checkErrorRateSLO(
    deploymentId: string,
    actualErrorRate: number,
    targetErrorRate: number
  ): Promise<void> {
    if (actualErrorRate > targetErrorRate) {
      const severity = actualErrorRate > (targetErrorRate * 2) ? 
        AlertSeverity.CRITICAL : AlertSeverity.WARNING;

      await this.createSLOAlert(
        deploymentId,
        AlertType.HIGH_ERROR_RATE,
        severity,
        targetErrorRate,
        actualErrorRate,
        `Error rate ${actualErrorRate.toFixed(2)}% exceeds target ${targetErrorRate}%`
      );
    }
  }

  private async createSLOAlert(
    deploymentId: string,
    type: AlertType,
    severity: AlertSeverity,
    threshold: number,
    actualValue: number,
    message: string
  ): Promise<void> {
    // Check if similar alert exists within cooldown period
    const recentAlerts = await this.deploymentService.getAlerts(deploymentId, false);
    const cooldownTime = new Date(Date.now() - this.config.alertCooldownMs);
    
    const recentSimilarAlert = recentAlerts.find(alert => 
      alert.type === type && 
      alert.triggeredAt > cooldownTime &&
      !alert.resolvedAt
    );

    if (recentSimilarAlert) {
      return; // Skip creating duplicate alert
    }

    await this.deploymentService.createAlert({
      deploymentId,
      type,
      severity,
      message,
      threshold,
      actualValue,
      triggeredAt: new Date(),
      acknowledged: false
    });
  }

  private async createDriftAlert(
    deploymentId: string,
    driftType: string,
    threshold: number,
    actualValue: number,
    message: string
  ): Promise<void> {
    await this.deploymentService.createAlert({
      deploymentId,
      type: AlertType.DRIFT_DETECTED,
      severity: AlertSeverity.WARNING,
      message: `${message}: ${actualValue.toFixed(4)} > ${threshold}`,
      threshold,
      actualValue,
      triggeredAt: new Date(),
      acknowledged: false
    });
  }

  private async checkAutoRollbackConditions(deploymentId: string): Promise<void> {
    if (!this.config.autoRollbackEnabled) {
      return;
    }

    // Get recent critical alerts (last 30 minutes)
    const alerts = await this.deploymentService.getAlerts(deploymentId, false);
    const recentTime = new Date(Date.now() - 30 * 60 * 1000);
    
    const recentCriticalAlerts = alerts.filter(alert => 
      alert.severity === AlertSeverity.CRITICAL &&
      alert.triggeredAt > recentTime &&
      !alert.resolvedAt
    );

    if (recentCriticalAlerts.length >= this.config.autoRollbackThreshold) {
      await this.triggerRollback(
        deploymentId,
        `Auto-rollback triggered: ${recentCriticalAlerts.length} critical alerts`,
        'system'
      );
    }
  }

  private calculateAverageMetrics(metrics: DeploymentMetrics[]): DeploymentMetrics {
    if (metrics.length === 0) {
      throw new Error('No metrics to calculate average');
    }

    const totals = metrics.reduce((acc, metric) => ({
      availability: acc.availability + metric.availability,
      latencyP95: acc.latencyP95 + metric.latencyP95,
      latencyP99: acc.latencyP99 + metric.latencyP99,
      errorRate: acc.errorRate + metric.errorRate,
      inputDrift: acc.inputDrift + (metric.inputDrift || 0),
      outputDrift: acc.outputDrift + (metric.outputDrift || 0),
      performanceDrift: acc.performanceDrift + (metric.performanceDrift || 0),
      requestCount: acc.requestCount + metric.requestCount
    }), {
      availability: 0,
      latencyP95: 0,
      latencyP99: 0,
      errorRate: 0,
      inputDrift: 0,
      outputDrift: 0,
      performanceDrift: 0,
      requestCount: 0
    });

    const count = metrics.length;
    const firstMetric = metrics[0];

    return {
      id: 'average',
      deploymentId: firstMetric.deploymentId,
      timestamp: new Date(),
      availability: totals.availability / count,
      latencyP95: Math.round(totals.latencyP95 / count),
      latencyP99: Math.round(totals.latencyP99 / count),
      errorRate: totals.errorRate / count,
      inputDrift: totals.inputDrift > 0 ? totals.inputDrift / count : undefined,
      outputDrift: totals.outputDrift > 0 ? totals.outputDrift / count : undefined,
      performanceDrift: totals.performanceDrift > 0 ? totals.performanceDrift / count : undefined,
      requestCount: totals.requestCount
    };
  }

  // Cleanup method to stop all monitoring
  async shutdown(): Promise<void> {
    for (const [deploymentId, interval] of this.activeMonitors) {
      clearInterval(interval);
    }
    this.activeMonitors.clear();
  }
}