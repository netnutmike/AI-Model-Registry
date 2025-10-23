import { Pool } from 'pg';
import {
  Deployment,
  DeploymentStatus,
  DeploymentStrategy,
  CreateDeploymentRequest,
  RollbackStatus,
  AlertSeverity
} from '../../types/index.js';
import { DeploymentService } from './deploymentService.js';
import { MonitoringService } from './monitoringService.js';
import { RollbackService } from './rollbackService.js';

export interface DeploymentOrchestrationConfig {
  canaryTrafficIncrement: number;
  canaryPromotionDelayMs: number;
  blueGreenSwitchDelayMs: number;
  rollingUpdateBatchSize: number;
  healthCheckTimeoutMs: number;
  autoPromoteCanary: boolean;
  autoRollbackOnFailure: boolean;
}

export class DeploymentOrchestrator {
  private deploymentService: DeploymentService;
  private monitoringService: MonitoringService;
  private rollbackService: RollbackService;
  private config: DeploymentOrchestrationConfig;

  constructor(
    private db: Pool,
    config?: Partial<DeploymentOrchestrationConfig>
  ) {
    this.deploymentService = new DeploymentService(db);
    this.monitoringService = new MonitoringService(db);
    this.rollbackService = new RollbackService(db);
    this.config = {
      canaryTrafficIncrement: 10, // 10% increments
      canaryPromotionDelayMs: 300000, // 5 minutes
      blueGreenSwitchDelayMs: 60000, // 1 minute
      rollingUpdateBatchSize: 1,
      healthCheckTimeoutMs: 300000, // 5 minutes
      autoPromoteCanary: false,
      autoRollbackOnFailure: true,
      ...config
    };
  }

  async orchestrateDeployment(
    request: CreateDeploymentRequest,
    deployedBy: string
  ): Promise<Deployment> {
    // Create the deployment record
    const deployment = await this.deploymentService.createDeployment(request, deployedBy);

    // Start the deployment process asynchronously
    this.executeDeploymentStrategy(deployment)
      .catch(error => {
        console.error(`Deployment ${deployment.id} failed:`, error);
        this.handleDeploymentFailure(deployment.id, error);
      });

    return deployment;
  }

  async executeDeploymentStrategy(deployment: Deployment): Promise<void> {
    try {
      // Update status to deploying
      await this.deploymentService.updateDeploymentStatus(
        deployment.id,
        DeploymentStatus.DEPLOYING
      );

      switch (deployment.strategy) {
        case DeploymentStrategy.CANARY:
          await this.executeCanaryDeployment(deployment);
          break;
        case DeploymentStrategy.BLUE_GREEN:
          await this.executeBlueGreenDeployment(deployment);
          break;
        case DeploymentStrategy.ROLLING:
          await this.executeRollingDeployment(deployment);
          break;
        default:
          throw new Error(`Unsupported deployment strategy: ${deployment.strategy}`);
      }

      // Mark deployment as active
      await this.deploymentService.updateDeploymentStatus(
        deployment.id,
        DeploymentStatus.ACTIVE
      );

      // Start monitoring
      await this.monitoringService.startMonitoring(deployment.id);

    } catch (error) {
      await this.handleDeploymentFailure(deployment.id, error);
      throw error;
    }
  }

  private async executeCanaryDeployment(deployment: Deployment): Promise<void> {
    console.log(`Starting canary deployment ${deployment.id}`);

    // Step 1: Deploy canary version with 0% traffic
    await this.deployCanaryVersion(deployment);

    // Step 2: Perform health checks
    await this.performHealthChecks(deployment.id);

    // Step 3: Gradually increase traffic
    let currentTraffic = 0;
    while (currentTraffic < 100) {
      const nextTraffic = Math.min(currentTraffic + this.config.canaryTrafficIncrement, 100);
      
      // Create traffic split
      await this.deploymentService.createTrafficSplit({
        deploymentId: deployment.id,
        percentage: nextTraffic
      });

      console.log(`Canary deployment ${deployment.id}: routing ${nextTraffic}% traffic`);

      // Wait for promotion delay
      if (nextTraffic < 100) {
        await this.sleep(this.config.canaryPromotionDelayMs);
        
        // Check for alerts before proceeding
        const alerts = await this.deploymentService.getAlerts(deployment.id, false);
        const criticalAlerts = alerts.filter(a => 
          a.severity === AlertSeverity.CRITICAL && !a.resolvedAt
        );
        
        if (criticalAlerts.length > 0) {
          throw new Error(`Canary deployment halted due to ${criticalAlerts.length} critical alerts`);
        }
      }

      currentTraffic = nextTraffic;
    }

    console.log(`Canary deployment ${deployment.id} completed successfully`);
  }

  private async executeBlueGreenDeployment(deployment: Deployment): Promise<void> {
    console.log(`Starting blue-green deployment ${deployment.id}`);

    // Step 1: Deploy green version (new version)
    await this.deployGreenVersion(deployment);

    // Step 2: Perform health checks on green version
    await this.performHealthChecks(deployment.id);

    // Step 3: Wait for switch delay
    await this.sleep(this.config.blueGreenSwitchDelayMs);

    // Step 4: Switch traffic from blue to green
    await this.deploymentService.createTrafficSplit({
      deploymentId: deployment.id,
      percentage: 100
    });

    console.log(`Blue-green deployment ${deployment.id} completed successfully`);
  }

  private async executeRollingDeployment(deployment: Deployment): Promise<void> {
    console.log(`Starting rolling deployment ${deployment.id}`);

    const totalReplicas = deployment.configuration.replicas;
    const batchSize = Math.min(this.config.rollingUpdateBatchSize, totalReplicas);
    
    let deployedReplicas = 0;
    
    while (deployedReplicas < totalReplicas) {
      const currentBatch = Math.min(batchSize, totalReplicas - deployedReplicas);
      
      // Deploy batch of replicas
      await this.deployReplicaBatch(deployment, currentBatch);
      
      // Perform health checks for the batch
      await this.performHealthChecks(deployment.id);
      
      deployedReplicas += currentBatch;
      
      console.log(`Rolling deployment ${deployment.id}: ${deployedReplicas}/${totalReplicas} replicas deployed`);
      
      // Small delay between batches
      if (deployedReplicas < totalReplicas) {
        await this.sleep(10000); // 10 seconds
      }
    }

    console.log(`Rolling deployment ${deployment.id} completed successfully`);
  }

  private async deployCanaryVersion(deployment: Deployment): Promise<void> {
    // Simulate canary version deployment
    console.log(`Deploying canary version for deployment ${deployment.id}`);
    await this.sleep(5000); // Simulate deployment time
  }

  private async deployGreenVersion(deployment: Deployment): Promise<void> {
    // Simulate green version deployment
    console.log(`Deploying green version for deployment ${deployment.id}`);
    await this.sleep(8000); // Simulate deployment time
  }

  private async deployReplicaBatch(deployment: Deployment, batchSize: number): Promise<void> {
    // Simulate batch deployment
    console.log(`Deploying batch of ${batchSize} replicas for deployment ${deployment.id}`);
    await this.sleep(3000); // Simulate deployment time
  }

  private async performHealthChecks(deploymentId: string): Promise<void> {
    const startTime = Date.now();
    const timeout = this.config.healthCheckTimeoutMs;
    
    while (Date.now() - startTime < timeout) {
      try {
        // Simulate health check
        const healthy = await this.simulateHealthCheck(deploymentId);
        
        if (healthy) {
          console.log(`Health checks passed for deployment ${deploymentId}`);
          return;
        }
        
        // Wait before retry
        await this.sleep(10000); // 10 seconds
        
      } catch (error) {
        console.error(`Health check failed for deployment ${deploymentId}:`, error);
        await this.sleep(10000); // 10 seconds
      }
    }
    
    throw new Error(`Health checks timed out for deployment ${deploymentId}`);
  }

  private async simulateHealthCheck(deploymentId: string): Promise<boolean> {
    // Simulate health check with 85% success rate
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(Math.random() > 0.15);
      }, 2000);
    });
  }

  private async handleDeploymentFailure(deploymentId: string, error: any): Promise<void> {
    console.error(`Handling deployment failure for ${deploymentId}:`, error);
    
    // Update deployment status to failed
    await this.deploymentService.updateDeploymentStatus(
      deploymentId,
      DeploymentStatus.FAILED
    );

    // Create alert for deployment failure
    await this.deploymentService.createAlert({
      deploymentId,
      type: 'slo_breach',
      severity: AlertSeverity.CRITICAL,
      message: `Deployment failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      threshold: 0,
      actualValue: 1,
      triggeredAt: new Date(),
      acknowledged: false
    });

    // Trigger automatic rollback if enabled
    if (this.config.autoRollbackOnFailure) {
      try {
        const rollbackOptions = await this.rollbackService.getOneClickRollbackOptions(deploymentId);
        
        if (rollbackOptions.length > 0) {
          const targetDeployment = rollbackOptions[0];
          
          await this.rollbackService.executeRollback(
            deploymentId,
            {
              targetVersionId: targetDeployment.versionId,
              reason: 'Automatic rollback due to deployment failure'
            },
            'system'
          );
          
          console.log(`Automatic rollback initiated for deployment ${deploymentId}`);
        }
      } catch (rollbackError) {
        console.error(`Failed to initiate automatic rollback for ${deploymentId}:`, rollbackError);
      }
    }
  }

  async getDeploymentHealth(deploymentId: string): Promise<{
    status: DeploymentStatus;
    healthScore: number;
    activeAlerts: number;
    criticalAlerts: number;
    lastMetricsTimestamp?: Date;
  }> {
    const deployment = await this.deploymentService.getDeployment(deploymentId);
    if (!deployment) {
      throw new Error(`Deployment ${deploymentId} not found`);
    }

    // Get recent alerts
    const alerts = await this.deploymentService.getAlerts(deploymentId, false);
    const activeAlerts = alerts.filter(a => !a.resolvedAt);
    const criticalAlerts = activeAlerts.filter(a => a.severity === AlertSeverity.CRITICAL);

    // Get recent metrics
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 5 * 60 * 1000); // Last 5 minutes
    
    const metrics = await this.deploymentService.getMetrics({
      deploymentId,
      startTime,
      endTime
    });

    // Calculate health score (0-100)
    let healthScore = 100;
    
    // Deduct points for alerts
    healthScore -= criticalAlerts.length * 30;
    healthScore -= (activeAlerts.length - criticalAlerts.length) * 10;
    
    // Deduct points for poor metrics
    if (metrics.length > 0) {
      const latestMetrics = metrics[metrics.length - 1];
      
      if (latestMetrics.availability < deployment.sloTargets.availability) {
        healthScore -= 20;
      }
      
      if (latestMetrics.errorRate > deployment.sloTargets.errorRate) {
        healthScore -= 15;
      }
      
      if (latestMetrics.latencyP95 > deployment.sloTargets.latencyP95) {
        healthScore -= 10;
      }
    }

    healthScore = Math.max(0, healthScore);

    return {
      status: deployment.status,
      healthScore,
      activeAlerts: activeAlerts.length,
      criticalAlerts: criticalAlerts.length,
      lastMetricsTimestamp: metrics.length > 0 ? metrics[metrics.length - 1].timestamp : undefined
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Cleanup method
  async shutdown(): Promise<void> {
    await this.monitoringService.shutdown();
  }
}