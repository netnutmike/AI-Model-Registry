import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EvaluationReportingService } from '../../services/evaluation/evaluationReportingService.js';
import { DatabaseService } from '../../services/database/databaseService.js';
import {
  EvaluationHistoryQuery,
  EvaluationJobStatus
} from '../../types/index.js';

// Mock database service
const mockDb = {
  query: vi.fn(),
  transaction: vi.fn(),
  getClient: vi.fn(),
  close: vi.fn()
} as unknown as DatabaseService;

describe('EvaluationReportingService', () => {
  let reportingService: EvaluationReportingService;

  beforeEach(() => {
    reportingService = new EvaluationReportingService(mockDb);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Evaluation Results', () => {
    describe('getEvaluationResults', () => {
      it('should return evaluation job with enhanced data', async () => {
        const mockResult = {
          rows: [{
            id: 'job-123',
            version_id: 'version-123',
            suite_id: 'suite-456',
            status: 'completed',
            priority: 'normal',
            configuration: {},
            results: {
              taskMetrics: { accuracy: 0.95 },
              biasMetrics: { demographic_parity: 0.98 },
              safetyMetrics: { toxicity_score: 0.01 },
              robustnessMetrics: { adversarial_accuracy: 0.90 }
            },
            error_message: null,
            started_at: new Date('2023-01-01T10:00:00Z'),
            completed_at: new Date('2023-01-01T10:30:00Z'),
            created_at: new Date('2023-01-01T09:55:00Z'),
            version: '1.0.0',
            model_id: 'model-123',
            model_name: 'Test Model',
            model_group: 'test',
            suite_name: 'Test Suite',
            suite_version: '1.0.0'
          }]
        };

        (mockDb.query as any).mockResolvedValue(mockResult);

        const result = await reportingService.getEvaluationResults('job-123');

        expect(mockDb.query).toHaveBeenCalledWith(
          expect.stringContaining('SELECT ej.*'),
          ['job-123']
        );

        expect(result).toBeDefined();
        expect(result?.id).toBe('job-123');
        expect(result?.status).toBe(EvaluationJobStatus.COMPLETED);
        expect(result?.results).toBeDefined();
      });

      it('should return null when job not found', async () => {
        (mockDb.query as any).mockResolvedValue({ rows: [] });

        const result = await reportingService.getEvaluationResults('nonexistent');

        expect(result).toBeNull();
      });
    });
  });

  describe('Evaluation History', () => {
    describe('getEvaluationHistory', () => {
      it('should return enhanced evaluation history', async () => {
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
              started_at: new Date('2023-01-01T10:00:00Z'),
              completed_at: new Date('2023-01-01T10:30:00Z'),
              created_at: new Date('2023-01-01T09:55:00Z'),
              model_version: '1.0.0',
              model_name: 'Test Model',
              model_group: 'test',
              suite_name: 'Test Suite',
              suite_version: '1.0.0',
              execution_time_seconds: 1800
            },
            {
              id: 'job-2',
              version_id: 'version-123',
              suite_id: 'suite-456',
              status: 'failed',
              priority: 'high',
              configuration: {},
              results: null,
              error_message: 'Execution failed',
              started_at: new Date('2023-01-02T10:00:00Z'),
              completed_at: new Date('2023-01-02T10:15:00Z'),
              created_at: new Date('2023-01-02T09:55:00Z'),
              model_version: '1.0.0',
              model_name: 'Test Model',
              model_group: 'test',
              suite_name: 'Test Suite',
              suite_version: '1.0.0',
              execution_time_seconds: 900
            }
          ]
        };

        (mockDb.query as any)
          .mockResolvedValueOnce(mockCountResult)
          .mockResolvedValueOnce(mockJobsResult);

        const query: EvaluationHistoryQuery = {
          versionId: 'version-123',
          status: EvaluationJobStatus.COMPLETED,
          limit: 10,
          offset: 0
        };

        const result = await reportingService.getEvaluationHistory(query);

        expect(result.total).toBe(2);
        expect(result.jobs).toHaveLength(2);
        expect(result.jobs[0].modelName).toBe('Test Model');
        expect(result.jobs[0].executionTime).toBe(1800);
        expect(result.jobs[1].status).toBe(EvaluationJobStatus.FAILED);
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
            created_at: new Date(),
            model_version: '1.0.0',
            model_name: 'Test Model',
            model_group: 'test',
            suite_name: 'Test Suite',
            suite_version: '1.0.0',
            execution_time_seconds: 1800
          }]
        };

        (mockDb.query as any)
          .mockResolvedValueOnce(mockCountResult)
          .mockResolvedValueOnce(mockJobsResult);

        const startDate = new Date('2023-01-01');
        const endDate = new Date('2023-12-31');

        const query: EvaluationHistoryQuery = {
          startDate,
          endDate,
          limit: 10,
          offset: 0
        };

        const result = await reportingService.getEvaluationHistory(query);

        expect(mockDb.query).toHaveBeenCalledWith(
          expect.stringContaining('ej.created_at >= $1'),
          expect.arrayContaining([startDate, endDate])
        );

        expect(result.jobs).toHaveLength(1);
      });
    });
  });

  describe('Evaluation Trends', () => {
    describe('getEvaluationTrends', () => {
      it('should return evaluation trends over time', async () => {
        const mockResult = {
          rows: [
            {
              date: new Date('2023-01-01'),
              pass_rate: '0.8',
              job_count: '5',
              average_score: '0.85'
            },
            {
              date: new Date('2023-01-02'),
              pass_rate: '0.9',
              job_count: '3',
              average_score: '0.92'
            }
          ]
        };

        (mockDb.query as any).mockResolvedValue(mockResult);

        const result = await reportingService.getEvaluationTrends('version-123', 'suite-456', 7);

        expect(mockDb.query).toHaveBeenCalledWith(
          expect.stringContaining('DATE(ej.completed_at) as date'),
          ['version-123', 'suite-456']
        );

        expect(result).toHaveLength(2);
        expect(result[0].passRate).toBe(0.8);
        expect(result[0].jobCount).toBe(5);
        expect(result[0].averageScore).toBe(0.85);
        expect(result[1].passRate).toBe(0.9);
      });

      it('should handle optional parameters', async () => {
        const mockResult = { rows: [] };
        (mockDb.query as any).mockResolvedValue(mockResult);

        const result = await reportingService.getEvaluationTrends();

        expect(mockDb.query).toHaveBeenCalledWith(
          expect.stringContaining('INTERVAL \'30 days\''),
          []
        );

        expect(result).toHaveLength(0);
      });
    });
  });

  describe('Metric Trends', () => {
    describe('getMetricTrends', () => {
      it('should return metric trends for visualization', async () => {
        const mockResult = {
          rows: [
            {
              completed_at: new Date('2023-01-01T10:00:00Z'),
              results: {
                taskMetrics: { accuracy: 0.95, f1_score: 0.92 },
                biasMetrics: { demographic_parity: 0.98 },
                safetyMetrics: { toxicity_score: 0.01 },
                robustnessMetrics: { adversarial_accuracy: 0.90 }
              },
              thresholds: {
                taskMetrics: { accuracy: 0.90, f1_score: 0.85 },
                biasMetrics: { demographic_parity: 0.95 },
                safetyMetrics: { toxicity_score: 0.05 },
                robustnessMetrics: { adversarial_accuracy: 0.85 }
              },
              passed: true
            },
            {
              completed_at: new Date('2023-01-02T10:00:00Z'),
              results: {
                taskMetrics: { accuracy: 0.88, f1_score: 0.85 },
                biasMetrics: { demographic_parity: 0.92 },
                safetyMetrics: { toxicity_score: 0.02 },
                robustnessMetrics: { adversarial_accuracy: 0.87 }
              },
              thresholds: {
                taskMetrics: { accuracy: 0.90, f1_score: 0.85 },
                biasMetrics: { demographic_parity: 0.95 },
                safetyMetrics: { toxicity_score: 0.05 },
                robustnessMetrics: { adversarial_accuracy: 0.85 }
              },
              passed: false
            }
          ]
        };

        (mockDb.query as any).mockResolvedValue(mockResult);

        const result = await reportingService.getMetricTrends('version-123', 'suite-456', 7);

        expect(result.length).toBeGreaterThan(0);
        
        // Find accuracy trend
        const accuracyTrend = result.find(trend => 
          trend.metricName === 'accuracy' && trend.category === 'taskMetrics'
        );
        
        expect(accuracyTrend).toBeDefined();
        expect(accuracyTrend?.values).toHaveLength(2);
        expect(accuracyTrend?.values[0].value).toBe(0.95);
        expect(accuracyTrend?.values[0].threshold).toBe(0.90);
        expect(accuracyTrend?.values[0].passed).toBe(true);
      });
    });
  });

  describe('Evaluation Summary', () => {
    describe('getEvaluationSummary', () => {
      it('should return comprehensive evaluation summary', async () => {
        const mockSummaryResult = {
          rows: [{
            total_jobs: '10',
            completed_jobs: '8',
            failed_jobs: '2',
            avg_execution_time: '1800.5',
            pass_rate: '0.75'
          }]
        };

        const mockTrendsResult = {
          rows: [
            {
              date: new Date('2023-01-01'),
              pass_rate: '0.8',
              job_count: '5',
              average_score: '0.85'
            }
          ]
        };

        (mockDb.query as any)
          .mockResolvedValueOnce(mockSummaryResult)
          .mockResolvedValueOnce(mockTrendsResult);

        const result = await reportingService.getEvaluationSummary('version-123', 'suite-456', 30);

        expect(result.totalJobs).toBe(10);
        expect(result.completedJobs).toBe(8);
        expect(result.failedJobs).toBe(2);
        expect(result.averageExecutionTime).toBe(1800.5);
        expect(result.passRate).toBe(0.75);
        expect(result.trends).toHaveLength(1);
      });
    });
  });

  describe('Top Failing Metrics', () => {
    describe('getTopFailingMetrics', () => {
      it('should return metrics with highest failure rates', async () => {
        const mockResult = {
          rows: [
            {
              results: {
                taskMetrics: { accuracy: 0.85, f1_score: 0.80 },
                biasMetrics: { demographic_parity: 0.90 },
                safetyMetrics: { toxicity_score: 0.08 },
                robustnessMetrics: { adversarial_accuracy: 0.82 }
              },
              thresholds: {
                taskMetrics: { accuracy: 0.90, f1_score: 0.85 },
                biasMetrics: { demographic_parity: 0.95 },
                safetyMetrics: { toxicity_score: 0.05 },
                robustnessMetrics: { adversarial_accuracy: 0.85 }
              }
            },
            {
              results: {
                taskMetrics: { accuracy: 0.88, f1_score: 0.83 },
                biasMetrics: { demographic_parity: 0.92 },
                safetyMetrics: { toxicity_score: 0.06 },
                robustnessMetrics: { adversarial_accuracy: 0.84 }
              },
              thresholds: {
                taskMetrics: { accuracy: 0.90, f1_score: 0.85 },
                biasMetrics: { demographic_parity: 0.95 },
                safetyMetrics: { toxicity_score: 0.05 },
                robustnessMetrics: { adversarial_accuracy: 0.85 }
              }
            }
          ]
        };

        (mockDb.query as any).mockResolvedValue(mockResult);

        const result = await reportingService.getTopFailingMetrics('version-123', 'suite-456', 30, 5);

        expect(result.length).toBeGreaterThan(0);
        
        // Should include metrics that failed thresholds
        const failingMetrics = result.filter(metric => metric.failureRate > 0);
        expect(failingMetrics.length).toBeGreaterThan(0);
        
        // Results should be sorted by failure rate (highest first)
        for (let i = 1; i < result.length; i++) {
          expect(result[i].failureRate).toBeLessThanOrEqual(result[i - 1].failureRate);
        }
      });
    });
  });

  describe('Visualization Data', () => {
    describe('getEvaluationVisualizationData', () => {
      it('should return comprehensive visualization data', async () => {
        // Mock the individual methods instead of database calls
        const mockSummary = {
          totalJobs: 5,
          completedJobs: 4,
          failedJobs: 1,
          averageExecutionTime: 1200,
          passRate: 0.8,
          trends: [{
            date: new Date('2023-01-01'),
            averageScore: 0.85,
            passRate: 0.8,
            jobCount: 5
          }]
        };

        const mockMetricTrends = [{
          metricName: 'accuracy',
          category: 'taskMetrics' as const,
          values: [{
            date: new Date('2023-01-01'),
            value: 0.95,
            threshold: 0.90,
            passed: true
          }]
        }];

        const mockRecentJobs = [{
          id: 'job-1',
          versionId: 'version-123',
          suiteId: 'suite-456',
          status: 'completed' as const,
          priority: 'normal' as const,
          configuration: {},
          results: {},
          errorMessage: null,
          startedAt: new Date(),
          completedAt: new Date(),
          createdAt: new Date(),
          modelName: 'Test Model',
          modelGroup: 'test',
          modelVersion: '1.0.0',
          suiteName: 'Test Suite',
          suiteVersion: '1.0.0',
          executionTime: 1200
        }];

        const mockTopFailingMetrics = [{
          metricName: 'accuracy',
          category: 'taskMetrics',
          failureRate: 0.2,
          averageScore: 0.85
        }];

        // Spy on the individual methods
        vi.spyOn(reportingService, 'getEvaluationSummary').mockResolvedValue(mockSummary);
        vi.spyOn(reportingService, 'getMetricTrends').mockResolvedValue(mockMetricTrends);
        vi.spyOn(reportingService, 'getEvaluationHistory').mockResolvedValue({
          jobs: mockRecentJobs,
          total: 1
        });
        vi.spyOn(reportingService, 'getTopFailingMetrics').mockResolvedValue(mockTopFailingMetrics);

        const result = await reportingService.getEvaluationVisualizationData('version-123', 'suite-456', 30);

        expect(result.summary).toEqual(mockSummary);
        expect(result.metricTrends).toEqual(mockMetricTrends);
        expect(result.recentJobs).toEqual(mockRecentJobs);
        expect(result.topFailingMetrics).toEqual(mockTopFailingMetrics);
      });
    });
  });
});