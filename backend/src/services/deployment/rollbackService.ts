import { Pool } from 'pg';
import {
  RollbackOperation,
  RollbackStatus,
  Deployment,
  DeploymentStatus,
  CreateRollbackRequest
} from '../../types/index.js';
import { DeploymentService } from './deploymentService.js';
import { MonitoringService } from './monitoringService.js';

export interface RollbackConfiguration {
  maxRollbackTimeMs: number;
  healthCheckRetries: number;
  healthCheckIntervalMs: number;
  rollbackTimeoutMs: number;
}

export class RollbackService {
  private deploymentService: DeploymentService;
  private monitoringService: MonitoringService;
  private config: RollbackConfiguration;

  constructor(
    private db: Pool,
    config?: Partial<RollbackConfiguration>
  ) {
    this.deploymentService = new DeploymentService(db);
    this.monitoringService = new MonitoringService(db);
    this.config = {
      maxRollbackTimeMs: 600000, // 10 minutes
      healthCheckRetries: 5,
      healthCheckIntervalMs: 30000, // 30 seconds
      rollbackTimeoutMs: 300000, // 5 minutes
      ...config
    };
  }

  async executeRollback(
    deploymentId: string,
    request: CreateRollbackRequest,
    initiatedBy: string
  ): Promise<RollbackOperation> {
    // Validate deployment exists and can be rolled back
    const deployment = await this.deploymentService.getDeployment(deploymentId);
    if (!deployment) {
      throw new Error(`Deployment ${deploymentId} not found`);
    }

    if (deployment.status === DeploymentStatus.ROLLING_BACK) {
      throw new Error(`Deployment ${deploymentId} is already rolling back`);
    }

    if (deployment.status !== DeploymentStatus.ACTIVE && deployment.status !== DeploymentStatus.FAILED) {
      throw new Error(`Cannot rollback deployment ${deploymentId} with status ${deployment.status}`);
    }

    // Validate target version exists
    const targetVersionExists = await this.validateTargetVersion(request.targetVersionId);
    if (!targetVersionExists) {
      throw new Error(`Target version ${request.targetVersionId} not found`);
    }

    // Create rollback operation
    const rollback = await this.deploymentService.createRollback(
      deploymentId,
      request,
      initiatedBy
    );

    // Start rollback process asynchronously
    this.performRollback(rollback.id, deploymentId, request.targetVersionId)
      .catch(error => {
        console.error(`Rollback ${rollback.id} failed:`, error);
        this.deploymentService.updateRollbackStatus(
          rollback.id,
          RollbackStatus.FAILED,
          error.message
        );
      });

    return rollback;
  }

  async getRollbackStatus(rollbackId: string): Promise<RollbackOperation | null> {
    const query = 'SELECT * FROM rollback_operations WHERE id = $1';
    const result = await this.db.query(query, [rollbackId]);
    
    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  }

  async cancelRollback(rollbackId: string): Promise<boolean> {
    const rollback = await this.getRollbackStatus(rollbackId);
    if (!rollback) {
      return false;
    }

    if (rollback.status !== RollbackStatus.PENDING && rollback.status !== RollbackStatus.IN_PROGRESS) {
      return false; // Cannot cancel completed or failed rollbacks
    }

    await this.deploymentService.updateRollbackStatus(
      rollbackId,
      RollbackStatus.FAILED,
      'Rollback cancelled by user'
    );

    return true;
  }

  async getOneClickRollbackOptions(deploymentId: string): Promise<Deployment[]> {
    const deployment = await this.deploymentService.getDeployment(deploymentId);
    if (!deployment) {
      throw new Error(`Deployment ${deploymentId} not found`);
    }

    // Get previous successful deployments in the same environment
    const previousDeployments = await this.deploymentService.getDeployments({
      environment: deployment.environment,
      status: DeploymentStatus.ACTIVE,
      limit: 5
    });

    // Filter out current deployment and return options
    return previousDeployments.filter(d => d.id !== deploymentId);
  }

  private async performRollback(
    rollbackId: string,
    deploymentId: string,
    targetVersionId: string
  ): Promise<void> {
    try {
      // Update rollback status to in progress
      await this.deploymentService.updateRollbackStatus(rollbackId, RollbackStatus.IN_PROGRESS);

      // Update deployment status to rolling back
      await this.deploymentService.updateDeploymentStatus(deploymentId, DeploymentStatus.ROLLING_BACK);

      // Stop monitoring for current deployment
      await this.monitoringService.stopMonitoring(deploymentId);

      // Perform the actual rollback steps
      await this.executeRollbackSteps(deploymentId, targetVersionId);

      // Verify rollback success
      const rollbackSuccessful = await this.verifyRollbackSuccess(deploymentId, targetVersionId);

      if (rollbackSuccessful) {
        // Update deployment status to rolled back
        await this.deploymentService.updateDeploymentStatus(deploymentId, DeploymentStatus.ROLLED_BACK);
        
        // Update rollback status to completed
        await this.deploymentService.updateRollbackStatus(rollbackId, RollbackStatus.COMPLETED);

        // Restart monitoring if needed
        await this.monitoringService.startMonitoring(deploymentId);
      } else {
        throw new Error('Rollback verification failed');
      }

    } catch (error) {
      // Update deployment status to failed
      await this.deploymentService.updateDeploymentStatus(deploymentId, DeploymentStatus.FAILED);
      
      // Update rollback status to failed
      await this.deploymentService.updateRollbackStatus(
        rollbackId,
        RollbackStatus.FAILED,
        error instanceof Error ? error.message : 'Unknown error'
      );
      
      throw error;
    }
  }

  private async executeRollbackSteps(
    deploymentId: string,
    targetVersionId: string
  ): Promise<void> {
    const deployment = await this.deploymentService.getDeployment(deploymentId);
    if (!deployment) {
      throw new Error(`Deployment ${deploymentId} not found`);
    }

    // Step 1: Prepare rollback configuration
    const rollbackConfig = await this.prepareRollbackConfiguration(deployment, targetVersionId);

    // Step 2: Execute traffic shift (if using canary/blue-green)
    if (deployment.strategy === 'canary' || deployment.strategy === 'blue_green') {
      await this.executeTrafficShift(deploymentId, 0); // Route traffic away
    }

    // Step 3: Deploy target version
    await this.deployTargetVersion(deploymentId, targetVersionId, rollbackConfig);

    // Step 4: Restore traffic (if applicable)
    if (deployment.strategy === 'canary' || deployment.strategy === 'blue_green') {
      await this.executeTrafficShift(deploymentId, 100); // Route traffic to rolled back version
    }
  }

  private async prepareRollbackConfiguration(
    deployment: Deployment,
    targetVersionId: string
  ): Promise<any> {
    // Get target version details
    const targetVersionQuery = 'SELECT * FROM model_versions WHERE id = $1';
    const targetVersionResult = await this.db.query(targetVersionQuery, [targetVersionId]);
    
    if (targetVersionResult.rows.length === 0) {
      throw new Error(`Target version ${targetVersionId} not found`);
    }

    const targetVersion = targetVersionResult.rows[0];

    // Prepare rollback configuration based on deployment configuration
    return {
      ...deployment.configuration,
      version: targetVersion.version,
      versionId: targetVersionId,
      rollbackTimestamp: new Date().toISOString()
    };
  }

  private async executeTrafficShift(deploymentId: string, percentage: number): Promise<void> {
    // Create traffic split record
    await this.deploymentService.createTrafficSplit({
      deploymentId,
      percentage
    });

    // Simulate traffic shift execution
    // In a real implementation, this would interact with load balancers, service mesh, etc.
    await this.simulateTrafficShift(deploymentId, percentage);
  }

  private async deployTargetVersion(
    deploymentId: string,
    targetVersionId: string,
    config: any
  ): Promise<void> {
    // Simulate deployment of target version
    // In a real implementation, this would:
    // 1. Pull artifacts for target version
    // 2. Update container images
    // 3. Apply Kubernetes manifests
    // 4. Wait for pods to be ready
    
    await this.simulateVersionDeployment(targetVersionId, config);
  }

  private async verifyRollbackSuccess(
    deploymentId: string,
    targetVersionId: string
  ): Promise<boolean> {
    let retries = 0;
    
    while (retries < this.config.healthCheckRetries) {
      try {
        // Perform health checks
        const healthCheckPassed = await this.performHealthCheck(deploymentId);
        
        if (healthCheckPassed) {
          // Verify the correct version is deployed
          const versionVerified = await this.verifyDeployedVersion(deploymentId, targetVersionId);
          
          if (versionVerified) {
            return true;
          }
        }
        
        retries++;
        
        if (retries < this.config.healthCheckRetries) {
          await this.sleep(this.config.healthCheckIntervalMs);
        }
        
      } catch (error) {
        console.error(`Health check attempt ${retries + 1} failed:`, error);
        retries++;
        
        if (retries < this.config.healthCheckRetries) {
          await this.sleep(this.config.healthCheckIntervalMs);
        }
      }
    }
    
    return false;
  }

  private async performHealthCheck(deploymentId: string): Promise<boolean> {
    // Simulate health check
    // In a real implementation, this would check:
    // 1. Pod readiness and liveness
    // 2. Service endpoints
    // 3. Application health endpoints
    // 4. Basic functionality tests
    
    return new Promise((resolve) => {
      setTimeout(() => {
        // Simulate 90% success rate for health checks
        resolve(Math.random() > 0.1);
      }, 1000);
    });
  }

  private async verifyDeployedVersion(
    deploymentId: string,
    expectedVersionId: string
  ): Promise<boolean> {
    // Simulate version verification
    // In a real implementation, this would check:
    // 1. Container image tags
    // 2. Application version endpoints
    // 3. Deployment labels/annotations
    
    return new Promise((resolve) => {
      setTimeout(() => {
        // Simulate successful version verification
        resolve(true);
      }, 500);
    });
  }

  private async validateTargetVersion(versionId: string): Promise<boolean> {
    const query = 'SELECT id FROM model_versions WHERE id = $1';
    const result = await this.db.query(query, [versionId]);
    return result.rows.length > 0;
  }

  private async simulateTrafficShift(deploymentId: string, percentage: number): Promise<void> {
    // Simulate traffic shifting delay
    return new Promise((resolve) => {
      setTimeout(resolve, 2000);
    });
  }

  private async simulateVersionDeployment(versionId: string, config: any): Promise<void> {
    // Simulate deployment delay
    return new Promise((resolve) => {
      setTimeout(resolve, 5000);
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}