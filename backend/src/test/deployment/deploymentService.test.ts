import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Pool } from 'pg';
import { DeploymentService } from '../../services/deployment/deploymentService.js';
import {
  CreateDeploymentRequest,
  UpdateDeploymentRequest,
  CreateTrafficSplitRequest,
  CreateRollbackRequest,
  DeploymentEnvironment,
  DeploymentStatus,
  DeploymentStrategy,
  RollbackStatus,
  AlertType,
  AlertSeverity
} from '../../types/index.js';

// Mock Pool
const mockDb = {
  query: vi.fn(),
  connect: vi.fn(),
  end: vi.fn()
} as unknown as Pool;

describe('DeploymentService', () => {
  let service: DeploymentService;

  beforeEach(() => {
    service = new DeploymentService(mockDb);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('createDeployment', () => {
    it('should create a new deployment successfully', async () => {
      const request: CreateDeploymentRequest = {
        versionId: 'version-123',
        environment: DeploymentEnvironment.STAGING,
        strategy: DeploymentStrategy.ROLLING,
        configuration: {
          replicas: 3,
          resources: {
            cpu: '500m',
            memory: '1Gi'
          },
          environment: {},
          healthCheck: {
            path: '/health',
            port: 8080,
            initialDelaySeconds: 30,
            periodSeconds: 10,
            timeoutSeconds: 5,
            failureThreshold: 3
          },
          rolloutPolicy: {
            maxUnavailable: '25%',
            maxSurge: '25%',
            progressDeadlineSeconds: 600
          }
        },
        sloTargets: {
          availability: 99.9,
          latencyP95: 200,
          latencyP99: 500,
          errorRate: 0.1
        },
        driftThresholds: {
          inputDrift: 0.1,
          outputDrift: 0.1,
          performanceDrift: 0.05
        }
      };

      const mockDeploymentEntity = {
        id: 'deployment-123',
        version_id: 'version-123',
        environment: 'staging',
        status: 'pending',
        strategy: 'rolling',
        configuration: JSON.stringify(request.configuration),
        traffic_split: null,
        slo_targets: JSON.stringify(request.sloTargets),
        drift_thresholds: JSON.stringify(request.driftThresholds),
        deployed_by: 'user-123',
        deployed_at: new Date(),
        updated_at: new Date()
      };

      mockDb.query = vi.fn().mockResolvedValueOnce({ rows: [mockDeploymentEntity] });

      const result = await service.createDeployment(request, 'user-123');

      expect(result).toEqual({
        id: 'deployment-123',
        versionId: 'version-123',
        environment: 'staging',
        status: 'pending',
        strategy: 'rolling',
        configuration: request.configuration,
        trafficSplit: null,
        sloTargets: request.sloTargets,
        driftThresholds: request.driftThresholds,
        deployedBy: 'user-123',
        deployedAt: mockDeploymentEntity.deployed_at,
        updatedAt: mockDeploymentEntity.updated_at
      });

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO deployments'),
        expect.arrayContaining([
          'version-123',
          'staging',
          'pending',
          'rolling',
          JSON.stringify(request.configuration),
          JSON.stringify(request.sloTargets),
          JSON.stringify(request.driftThresholds),
          'user-123'
        ])
      );
    });
  });

  describe('getDeployment', () => {
    it('should return deployment when found', async () => {
      const mockDeploymentEntity = {
        id: 'deployment-123',
        version_id: 'version-123',
        environment: 'production',
        status: 'active',
        strategy: 'canary',
        configuration: '{"replicas": 5}',
        traffic_split: null,
        slo_targets: '{"availability": 99.9}',
        drift_thresholds: '{"inputDrift": 0.1}',
        deployed_by: 'user-123',
        deployed_at: new Date(),
        updated_at: new Date()
      };

      mockDb.query = vi.fn().mockResolvedValueOnce({ rows: [mockDeploymentEntity] });

      const result = await service.getDeployment('deployment-123');

      expect(result).toEqual({
        id: 'deployment-123',
        versionId: 'version-123',
        environment: 'production',
        status: 'active',
        strategy: 'canary',
        configuration: { replicas: 5 },
        trafficSplit: null,
        sloTargets: { availability: 99.9 },
        driftThresholds: { inputDrift: 0.1 },
        deployedBy: 'user-123',
        deployedAt: mockDeploymentEntity.deployed_at,
        updatedAt: mockDeploymentEntity.updated_at
      });
    });

    it('should return null when deployment not found', async () => {
      mockDb.query = vi.fn().mockResolvedValueOnce({ rows: [] });

      const result = await service.getDeployment('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('updateDeploymentStatus', () => {
    it('should update deployment status successfully', async () => {
      const mockUpdatedEntity = {
        id: 'deployment-123',
        version_id: 'version-123',
        environment: 'staging',
        status: 'active',
        strategy: 'rolling',
        configuration: '{}',
        traffic_split: null,
        slo_targets: '{}',
        drift_thresholds: '{}',
        deployed_by: 'user-123',
        deployed_at: new Date(),
        updated_at: new Date()
      };

      mockDb.query = vi.fn().mockResolvedValueOnce({ rows: [mockUpdatedEntity] });

      const result = await service.updateDeploymentStatus('deployment-123', DeploymentStatus.ACTIVE);

      expect(result?.status).toBe('active');
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE deployments'),
        ['active', 'deployment-123']
      );
    });
  });

  describe('createTrafficSplit', () => {
    it('should create traffic split successfully', async () => {
      const request: CreateTrafficSplitRequest = {
        deploymentId: 'deployment-123',
        percentage: 50
      };

      const mockTrafficSplitEntity = {
        id: 'split-123',
        deployment_id: 'deployment-123',
        percentage: 50,
        started_at: new Date(),
        completed_at: null
      };

      mockDb.query = vi.fn().mockResolvedValueOnce({ rows: [mockTrafficSplitEntity] });

      const result = await service.createTrafficSplit(request);

      expect(result).toEqual({
        id: 'split-123',
        deploymentId: 'deployment-123',
        percentage: 50,
        startedAt: mockTrafficSplitEntity.started_at,
        completedAt: null
      });
    });
  });

  describe('createRollback', () => {
    it('should create rollback operation successfully', async () => {
      const request: CreateRollbackRequest = {
        targetVersionId: 'version-456',
        reason: 'Critical bug found in production'
      };

      const mockRollbackEntity = {
        id: 'rollback-123',
        deployment_id: 'deployment-123',
        target_version_id: 'version-456',
        reason: 'Critical bug found in production',
        status: 'pending',
        initiated_by: 'user-123',
        initiated_at: new Date(),
        completed_at: null,
        error_message: null
      };

      mockDb.query = vi.fn().mockResolvedValueOnce({ rows: [mockRollbackEntity] });

      const result = await service.createRollback('deployment-123', request, 'user-123');

      expect(result).toEqual({
        id: 'rollback-123',
        deploymentId: 'deployment-123',
        targetVersionId: 'version-456',
        reason: 'Critical bug found in production',
        status: 'pending',
        initiatedBy: 'user-123',
        initiatedAt: mockRollbackEntity.initiated_at,
        completedAt: null,
        errorMessage: null
      });
    });
  });

  describe('recordMetrics', () => {
    it('should record deployment metrics successfully', async () => {
      const metrics = {
        deploymentId: 'deployment-123',
        timestamp: new Date(),
        availability: 99.5,
        latencyP95: 150,
        latencyP99: 300,
        errorRate: 0.05,
        inputDrift: 0.02,
        outputDrift: 0.03,
        performanceDrift: 0.01,
        requestCount: 1000
      };

      const mockMetricsEntity = {
        id: 'metrics-123',
        deployment_id: 'deployment-123',
        timestamp: metrics.timestamp,
        availability: 99.5,
        latency_p95: 150,
        latency_p99: 300,
        error_rate: 0.05,
        input_drift: 0.02,
        output_drift: 0.03,
        performance_drift: 0.01,
        request_count: 1000
      };

      mockDb.query = vi.fn().mockResolvedValueOnce({ rows: [mockMetricsEntity] });

      const result = await service.recordMetrics(metrics);

      expect(result).toEqual({
        id: 'metrics-123',
        deploymentId: 'deployment-123',
        timestamp: metrics.timestamp,
        availability: 99.5,
        latencyP95: 150,
        latencyP99: 300,
        errorRate: 0.05,
        inputDrift: 0.02,
        outputDrift: 0.03,
        performanceDrift: 0.01,
        requestCount: 1000
      });
    });
  });

  describe('createAlert', () => {
    it('should create deployment alert successfully', async () => {
      const alert = {
        deploymentId: 'deployment-123',
        type: AlertType.HIGH_LATENCY,
        severity: AlertSeverity.WARNING,
        message: 'P95 latency exceeds threshold',
        threshold: 200,
        actualValue: 250,
        triggeredAt: new Date(),
        acknowledged: false
      };

      const mockAlertEntity = {
        id: 'alert-123',
        deployment_id: 'deployment-123',
        type: 'high_latency',
        severity: 'warning',
        message: 'P95 latency exceeds threshold',
        threshold: 200,
        actual_value: 250,
        triggered_at: alert.triggeredAt,
        resolved_at: null,
        acknowledged: false
      };

      mockDb.query = vi.fn().mockResolvedValueOnce({ rows: [mockAlertEntity] });

      const result = await service.createAlert(alert);

      expect(result).toEqual({
        id: 'alert-123',
        deploymentId: 'deployment-123',
        type: 'high_latency',
        severity: 'warning',
        message: 'P95 latency exceeds threshold',
        threshold: 200,
        actualValue: 250,
        triggeredAt: alert.triggeredAt,
        resolvedAt: null,
        acknowledged: false
      });
    });
  });

  describe('getMetrics', () => {
    it('should retrieve metrics with time range', async () => {
      const query = {
        deploymentId: 'deployment-123',
        startTime: new Date('2023-01-01T00:00:00Z'),
        endTime: new Date('2023-01-01T01:00:00Z')
      };

      const mockMetrics = [
        {
          id: 'metrics-1',
          deployment_id: 'deployment-123',
          timestamp: new Date('2023-01-01T00:30:00Z'),
          availability: 99.9,
          latency_p95: 100,
          latency_p99: 200,
          error_rate: 0.01,
          input_drift: null,
          output_drift: null,
          performance_drift: null,
          request_count: 500
        }
      ];

      mockDb.query = vi.fn().mockResolvedValueOnce({ rows: mockMetrics });

      const result = await service.getMetrics(query);

      expect(result).toHaveLength(1);
      expect(result[0].deploymentId).toBe('deployment-123');
      expect(result[0].availability).toBe(99.9);
    });

    it('should handle aggregated metrics with granularity', async () => {
      const query = {
        deploymentId: 'deployment-123',
        startTime: new Date('2023-01-01T00:00:00Z'),
        endTime: new Date('2023-01-01T01:00:00Z'),
        granularity: 'hour' as const
      };

      mockDb.query = vi.fn().mockResolvedValueOnce({ rows: [] });

      await service.getMetrics(query);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('date_trunc'),
        expect.arrayContaining(['deployment-123'])
      );
    });
  });

  describe('getAlerts', () => {
    it('should retrieve alerts for deployment', async () => {
      const mockAlerts = [
        {
          id: 'alert-1',
          deployment_id: 'deployment-123',
          type: 'high_latency',
          severity: 'warning',
          message: 'Latency spike detected',
          threshold: 200,
          actual_value: 300,
          triggered_at: new Date(),
          resolved_at: null,
          acknowledged: false
        }
      ];

      mockDb.query = vi.fn().mockResolvedValueOnce({ rows: mockAlerts });

      const result = await service.getAlerts('deployment-123');

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('high_latency');
      expect(result[0].acknowledged).toBe(false);
    });

    it('should filter alerts by acknowledged status', async () => {
      mockDb.query = vi.fn().mockResolvedValueOnce({ rows: [] });

      await service.getAlerts('deployment-123', true);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('acknowledged = $2'),
        ['deployment-123', true]
      );
    });
  });

  describe('acknowledgeAlert', () => {
    it('should acknowledge alert successfully', async () => {
      const mockAcknowledgedAlert = {
        id: 'alert-123',
        deployment_id: 'deployment-123',
        type: 'high_latency',
        severity: 'warning',
        message: 'Alert acknowledged',
        threshold: 200,
        actual_value: 250,
        triggered_at: new Date(),
        resolved_at: null,
        acknowledged: true
      };

      mockDb.query = vi.fn().mockResolvedValueOnce({ rows: [mockAcknowledgedAlert] });

      const result = await service.acknowledgeAlert('alert-123');

      expect(result?.acknowledged).toBe(true);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('acknowledged = true'),
        ['alert-123']
      );
    });
  });

  describe('Error handling', () => {
    it('should handle database connection errors', async () => {
      const dbError = new Error('Connection timeout');
      mockDb.query = vi.fn().mockRejectedValueOnce(dbError);

      await expect(service.getDeployment('deployment-123'))
        .rejects.toThrow('Connection timeout');
    });

    it('should handle foreign key constraint violations', async () => {
      const fkError = new Error('Foreign key violation');
      (fkError as any).code = '23503';

      mockDb.query = vi.fn().mockRejectedValueOnce(fkError);

      const request: CreateDeploymentRequest = {
        versionId: 'nonexistent-version',
        environment: DeploymentEnvironment.STAGING,
        strategy: DeploymentStrategy.ROLLING,
        configuration: {
          replicas: 1,
          resources: { cpu: '100m', memory: '128Mi' },
          environment: {},
          healthCheck: {
            path: '/health',
            port: 8080,
            initialDelaySeconds: 30,
            periodSeconds: 10,
            timeoutSeconds: 5,
            failureThreshold: 3
          },
          rolloutPolicy: {
            maxUnavailable: '25%',
            maxSurge: '25%',
            progressDeadlineSeconds: 600
          }
        },
        sloTargets: {
          availability: 99.0,
          latencyP95: 500,
          latencyP99: 1000,
          errorRate: 1.0
        },
        driftThresholds: {
          inputDrift: 0.2,
          outputDrift: 0.2,
          performanceDrift: 0.1
        }
      };

      await expect(service.createDeployment(request, 'user-123'))
        .rejects.toThrow('Foreign key violation');
    });
  });

  describe('Complex queries', () => {
    it('should handle deployment queries with multiple filters', async () => {
      const queryParams = {
        environment: DeploymentEnvironment.PRODUCTION,
        status: DeploymentStatus.ACTIVE,
        versionId: 'version-123',
        deployedBy: 'user-123',
        startDate: new Date('2023-01-01'),
        endDate: new Date('2023-01-31'),
        limit: 10,
        offset: 0
      };

      mockDb.query = vi.fn().mockResolvedValueOnce({ rows: [] });

      await service.getDeployments(queryParams);

      const [query, values] = (mockDb.query as any).mock.calls[0];
      
      expect(query).toContain('environment = $1');
      expect(query).toContain('status = $2');
      expect(query).toContain('version_id = $3');
      expect(query).toContain('deployed_by = $4');
      expect(query).toContain('deployed_at >= $5');
      expect(query).toContain('deployed_at <= $6');
      expect(query).toContain('LIMIT $7');
      expect(query).toContain('OFFSET $8');
      
      expect(values).toEqual([
        'production',
        'active',
        'version-123',
        'user-123',
        queryParams.startDate,
        queryParams.endDate,
        10,
        0
      ]);
    });
  });
});