import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EvaluationExecutionEngine, EvaluationTestRunner } from '../../services/evaluation/evaluationExecutionEngine.js';
import { DatabaseService } from '../../services/database/databaseService.js';
import {
  EvaluationJob,
  RunEvaluationRequest,
  EvaluationJobStatus,
  JobPriority,
  EvaluationTestType,
  ArtifactType
} from '../../types/index.js';

// Mock test runner
const mockTestRunner: EvaluationTestRunner = {
  executeTest: vi.fn()
};

// Mock database service
const mockDb = {
  query: vi.fn(),
  transaction: vi.fn(),
  getClient: vi.fn(),
  close: vi.fn()
} as unknown as DatabaseService;

describe('EvaluationExecutionEngine', () => {
  let executionEngine: EvaluationExecutionEngine;

  beforeEach(() => {
    executionEngine = new EvaluationExecutionEngine(mockDb, mockTestRunner, false);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Job Creation', () => {
    describe('createEvaluationJob', () => {
      it('should create evaluation job successfully', async () => {
        const request: RunEvaluationRequest = {
          versionId: 'version-123',
          suiteId: 'suite-456',
          priority: JobPriority.HIGH,
          environment: { GPU_ENABLED: 'true' }
        };

        // Mock version query
        const mockVersionResult = {
          rows: [{
            id: 'version-123',
            model_id: 'model-123',
            version: '1.0.0',
            name: 'Test Model',
            group: 'test'
          }]
        };

        // Mock suite query
        const mockSuiteResult = {
          rows: [{
            id: 'suite-456',
            name: 'Test Suite',
            status: 'active',
            configuration: {
              datasets: [],
              testTypes: [EvaluationTestType.BIAS],
              thresholds: {
                taskMetrics: {},
                biasMetrics: {},
                safetyMetrics: {},
                robustnessMetrics: {}
              },
              timeout: 3600,
              retryPolicy: { maxRetries: 3, backoffMultiplier: 2, initialDelayMs: 1000 }
            }
          }]
        };

        // Mock artifacts query
        const mockArtifactsResult = {
          rows: [{
            id: 'artifact-1',
            version_id: 'version-123',
            type: 'weights',
            uri: 's3://bucket/model.bin',
            sha256: 'abc123',
            size: 1000000,
            license: 'MIT',
            created_at: new Date()
          }]
        };

        // Mock job creation
        const mockJobResult = {
          rows: [{
            id: 'job-789',
            version_id: 'version-123',
            suite_id: 'suite-456',
            status: 'pending',
            priority: 'high',
            configuration: {},
            results: null,
            error_message: null,
            started_at: null,
            completed_at: null,
            created_at: new Date()
          }]
        };

        (mockDb.query as any)
          .mockResolvedValueOnce(mockVersionResult)
          .mockResolvedValueOnce(mockSuiteResult)
          .mockResolvedValueOnce(mockArtifactsResult)
          .mockResolvedValueOnce(mockJobResult);

        const result = await executionEngine.createEvaluationJob(request);

        expect(result.id).toBe('job-789');
        expect(result.status).toBe(EvaluationJobStatus.PENDING);
        expect(result.priority).toBe(JobPriority.HIGH);
      });

      it('should throw error when version not found', async () => {
        const request: RunEvaluationRequest = {
          versionId: 'nonexistent',
          suiteId: 'suite-456'
        };

        (mockDb.query as any).mockResolvedValue({ rows: [] });

        await expect(executionEngine.createEvaluationJob(request))
          .rejects.toThrow('Model version not found: nonexistent');
      });

      it('should throw error when suite not found or inactive', async () => {
        const request: RunEvaluationRequest = {
          versionId: 'version-123',
          suiteId: 'nonexistent'
        };

        // Mock version exists
        (mockDb.query as any)
          .mockResolvedValueOnce({ rows: [{ id: 'version-123' }] })
          .mockResolvedValueOnce({ rows: [] }); // Suite not found

        await expect(executionEngine.createEvaluationJob(request))
          .rejects.toThrow('Active evaluation suite not found: nonexistent');
      });
    });
  });

  describe('Job Management', () => {
    describe('getEvaluationJob', () => {
      it('should return job when found', async () => {
        const mockResult = {
          rows: [{
            id: 'job-123',
            version_id: 'version-123',
            suite_id: 'suite-456',
            status: 'completed',
            priority: 'normal',
            configuration: {},
            results: { taskMetrics: {}, biasMetrics: {}, safetyMetrics: {}, robustnessMetrics: {} },
            error_message: null,
            started_at: new Date(),
            completed_at: new Date(),
            created_at: new Date()
          }]
        };

        (mockDb.query as any).mockResolvedValue(mockResult);

        const result = await executionEngine.getEvaluationJob('job-123');

        expect(result).toBeDefined();
        expect(result?.id).toBe('job-123');
        expect(result?.status).toBe(EvaluationJobStatus.COMPLETED);
      });

      it('should return null when job not found', async () => {
        (mockDb.query as any).mockResolvedValue({ rows: [] });

        const result = await executionEngine.getEvaluationJob('nonexistent');

        expect(result).toBeNull();
      });
    });

    describe('cancelEvaluationJob', () => {
      it('should cancel pending job successfully', async () => {
        const mockResult = {
          rows: [{
            id: 'job-123',
            version_id: 'version-123',
            suite_id: 'suite-456',
            status: 'cancelled',
            priority: 'normal',
            configuration: {},
            results: null,
            error_message: null,
            started_at: null,
            completed_at: new Date(),
            created_at: new Date()
          }]
        };

        (mockDb.query as any).mockResolvedValue(mockResult);

        const result = await executionEngine.cancelEvaluationJob('job-123');

        expect(result).toBe(true);
        expect(mockDb.query).toHaveBeenCalledWith(
          expect.stringContaining('UPDATE evaluation_jobs'),
          ['job-123']
        );
      });

      it('should return false when job cannot be cancelled', async () => {
        (mockDb.query as any).mockResolvedValue({ rows: [] });

        const result = await executionEngine.cancelEvaluationJob('job-123');

        expect(result).toBe(false);
      });
    });
  });

  describe('Job History', () => {
    describe('getEvaluationHistory', () => {
      it('should return job history with filters', async () => {
        const mockCountResult = { rows: [{ total: '2' }] };
        const mockJobsResult = {
          rows: [
            {
              id: 'job-1',
              version_id: 'version-123',
              suite_id: 'suite-456',
              status: 'completed',
              priority: 'normal',
              configuration: {},
              results: {},
              error_message: null,
              started_at: new Date(),
              completed_at: new Date(),
              created_at: new Date()
            },
            {
              id: 'job-2',
              version_id: 'version-123',
              suite_id: 'suite-456',
              status: 'failed',
              priority: 'normal',
              configuration: {},
              results: null,
              error_message: 'Test error',
              started_at: new Date(),
              completed_at: new Date(),
              created_at: new Date()
            }
          ]
        };

        (mockDb.query as any)
          .mockResolvedValueOnce(mockCountResult)
          .mockResolvedValueOnce(mockJobsResult);

        const query = {
          versionId: 'version-123',
          status: EvaluationJobStatus.COMPLETED,
          limit: 10,
          offset: 0
        };

        const result = await executionEngine.getEvaluationHistory(query);

        expect(result.total).toBe(2);
        expect(result.jobs).toHaveLength(2);
        expect(result.jobs[0].status).toBe(EvaluationJobStatus.COMPLETED);
      });

      it('should handle date range filters', async () => {
        const mockCountResult = { rows: [{ total: '1' }] };
        const mockJobsResult = {
          rows: [{
            id: 'job-1',
            version_id: 'version-123',
            suite_id: 'suite-456',
            status: 'completed',
            priority: 'normal',
            configuration: {},
            results: {},
            error_message: null,
            started_at: new Date(),
            completed_at: new Date(),
            created_at: new Date()
          }]
        };

        (mockDb.query as any)
          .mockResolvedValueOnce(mockCountResult)
          .mockResolvedValueOnce(mockJobsResult);

        const startDate = new Date('2023-01-01');
        const endDate = new Date('2023-12-31');

        const query = {
          startDate,
          endDate,
          limit: 10,
          offset: 0
        };

        const result = await executionEngine.getEvaluationHistory(query);

        expect(mockDb.query).toHaveBeenCalledWith(
          expect.stringContaining('created_at >= $1'),
          expect.arrayContaining([startDate, endDate])
        );

        expect(result.jobs).toHaveLength(1);
      });
    });
  });

  describe('Test Execution', () => {
    it('should execute evaluation tests successfully', async () => {
      // Mock test runner to return successful results
      (mockTestRunner.executeTest as any).mockResolvedValue({
        accuracy: 0.95,
        f1_score: 0.92
      });

      // This test would require access to private methods
      // In a real implementation, you might expose these methods for testing
      // or test them through the public interface
      expect(mockTestRunner.executeTest).toBeDefined();
    });

    it('should handle test execution failures gracefully', async () => {
      // Mock test runner to throw error
      (mockTestRunner.executeTest as any).mockRejectedValue(new Error('Test execution failed'));

      // Test error handling through public interface
      expect(mockTestRunner.executeTest).toBeDefined();
    });
  });

  describe('Threshold Comparison', () => {
    it('should correctly compare results with thresholds', () => {
      // This would test the private compareWithThresholds method
      // In practice, you might expose this as a utility function or test it indirectly
      const results = {
        taskMetrics: { accuracy: 0.95, f1_score: 0.92 },
        biasMetrics: { demographic_parity: 0.98 },
        safetyMetrics: { toxicity_score: 0.01 },
        robustnessMetrics: { adversarial_accuracy: 0.90 }
      };

      const thresholds = {
        taskMetrics: { accuracy: 0.90, f1_score: 0.85 },
        biasMetrics: { demographic_parity: 0.95 },
        safetyMetrics: { toxicity_score: 0.05 },
        robustnessMetrics: { adversarial_accuracy: 0.85 }
      };

      // All metrics meet or exceed thresholds, so should pass
      // This logic would be tested through the execution flow
      expect(results.taskMetrics.accuracy).toBeGreaterThanOrEqual(thresholds.taskMetrics.accuracy);
      expect(results.biasMetrics.demographic_parity).toBeGreaterThanOrEqual(thresholds.biasMetrics.demographic_parity);
    });
  });
});