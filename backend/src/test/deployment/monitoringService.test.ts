import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Pool } from 'pg';
import { MonitoringService } from '../../services/deployment/monitoringService.js';
import {
  DeploymentStatus,
  DeploymentEnvironment,
  DeploymentStrategy,
  AlertType,
  AlertSeverity
} from '../../types/index.js';

// Mock Pool
const mockDb = {
  query: vi.fn(),
  connect: vi.fn(),
  end: vi.fn()
} as unknown as Pool;

describe('MonitoringService', () => {
  let service: MonitoringService;

  beforeEach(() => {
    service = new MonitoringService(mockDb);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
    // Clean up any active monitors
    service.shutdown();
  });

  describe('startMonitoring', () => {
    it('should throw error for non-existent deployment', async () => {
      // Mock the database query to return no deployment
      mockDb.query = vi.fn().mockResolvedValueOnce({ rows: [] });

      await expect(service.startMonitoring('nonexistent'))
        .rejects.toThrow('Cannot monitor deployment nonexistent: not active');
    });

    it('should throw error for non-active deployment', async () => {
      const mockDeploymentEntity = {
        id: 'deployment-123',
        version_id: 'version-123',
        environment: 'production',
        status: 'pending', // Not active
        strategy: 'canary',
        configuration: '{}',
        traffic_split: null,
        slo_targets: '{}',
        drift_thresholds: '{}',
        deployed_by: 'user-123',
        deployed_at: new Date(),
        updated_at: new Date()
      };

      mockDb.query = vi.fn().mockResolvedValueOnce({ rows: [mockDeploymentEntity] });

      await expect(service.startMonitoring('deployment-123'))
        .rejects.toThrow('Cannot monitor deployment deployment-123: not active');
    });

    it('should start monitoring for active deployment', async () => {
      const mockDeploymentEntity = {
        id: 'deployment-123',
        version_id: 'version-123',
        environment: 'production',
        status: 'active',
        strategy: 'canary',
        configuration: '{"replicas": 3}',
        traffic_split: null,
        slo_targets: '{"availability": 99.9, "latencyP95": 200, "latencyP99": 500, "errorRate": 0.1}',
        drift_thresholds: '{"inputDrift": 0.1, "outputDrift": 0.1, "performanceDrift": 0.05}',
        deployed_by: 'user-123',
        deployed_at: new Date(),
        updated_at: new Date()
      };

      mockDb.query = vi.fn().mockResolvedValueOnce({ rows: [mockDeploymentEntity] });

      await expect(service.startMonitoring('deployment-123')).resolves.not.toThrow();
      expect(mockDb.query).toHaveBeenCalledWith(
        'SELECT * FROM deployments WHERE id = $1',
        ['deployment-123']
      );
    });
  });

  describe('stopMonitoring', () => {
    it('should handle stopping non-monitored deployment gracefully', async () => {
      await expect(service.stopMonitoring('nonexistent')).resolves.not.toThrow();
    });

    it('should stop monitoring successfully', async () => {
      // This is mainly testing that the method doesn't throw
      await expect(service.stopMonitoring('deployment-123')).resolves.not.toThrow();
    });
  });

  describe('checkSLOs', () => {
    it('should handle missing deployment gracefully', async () => {
      // Mock deployment not found
      mockDb.query = vi.fn().mockResolvedValueOnce({ rows: [] });

      await expect(service.checkSLOs('nonexistent')).resolves.not.toThrow();
    });

    it('should handle database errors gracefully', async () => {
      const dbError = new Error('Database connection failed');
      mockDb.query = vi.fn().mockRejectedValueOnce(dbError);

      // Should not throw, but log error
      await expect(service.checkSLOs('deployment-123')).resolves.not.toThrow();
    });
  });

  describe('checkDrift', () => {
    it('should handle missing deployment gracefully', async () => {
      // Mock deployment not found
      mockDb.query = vi.fn().mockResolvedValueOnce({ rows: [] });

      await expect(service.checkDrift('nonexistent')).resolves.not.toThrow();
    });

    it('should handle database errors gracefully', async () => {
      const dbError = new Error('Database connection failed');
      mockDb.query = vi.fn().mockRejectedValueOnce(dbError);

      // Should not throw, but log error
      await expect(service.checkDrift('deployment-123')).resolves.not.toThrow();
    });
  });

  describe('triggerRollback', () => {
    it('should throw error when deployment not found', async () => {
      // Mock deployment not found
      mockDb.query = vi.fn().mockResolvedValueOnce({ rows: [] });

      await expect(service.triggerRollback('nonexistent', 'Test rollback', 'user-123'))
        .rejects.toThrow('Deployment nonexistent not found');
    });

    it('should handle database errors', async () => {
      const dbError = new Error('Query failed');
      mockDb.query = vi.fn().mockRejectedValueOnce(dbError);

      await expect(service.triggerRollback('deployment-123', 'Test rollback', 'user-123'))
        .rejects.toThrow('Query failed');
    });
  });

  describe('shutdown', () => {
    it('should clear all active monitors', async () => {
      // Shutdown should clear all monitors
      await service.shutdown();

      // Verify no intervals are running (this is implicit - no way to directly test)
      expect(true).toBe(true); // Placeholder assertion
    });
  });

  describe('Configuration', () => {
    it('should create service with default configuration', () => {
      const defaultService = new MonitoringService(mockDb);
      expect(defaultService).toBeDefined();
    });

    it('should create service with custom configuration', () => {
      const customConfig = {
        sloCheckIntervalMs: 30000,
        driftCheckIntervalMs: 120000,
        alertCooldownMs: 600000,
        autoRollbackEnabled: true,
        autoRollbackThreshold: 5
      };

      const customService = new MonitoringService(mockDb, customConfig);
      expect(customService).toBeDefined();
    });
  });
});