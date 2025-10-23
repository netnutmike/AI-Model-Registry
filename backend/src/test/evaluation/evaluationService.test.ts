import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EvaluationService } from '../../services/evaluation/evaluationService.js';
import { DatabaseService } from '../../services/database/databaseService.js';
import {
  EvaluationSuite,
  EvaluationDataset,
  CreateEvaluationSuiteRequest,
  UpdateEvaluationSuiteRequest,
  CreateEvaluationDatasetRequest,
  EvaluationSuiteStatus,
  DatasetType,
  EvaluationTestType
} from '../../types/index.js';

// Mock database service
const mockDb = {
  query: vi.fn(),
  transaction: vi.fn(),
  getClient: vi.fn(),
  close: vi.fn()
} as unknown as DatabaseService;

describe('EvaluationService', () => {
  let evaluationService: EvaluationService;

  beforeEach(() => {
    evaluationService = new EvaluationService(mockDb);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Evaluation Suite Management', () => {
    describe('createEvaluationSuite', () => {
      it('should create a new evaluation suite successfully', async () => {
        const request: CreateEvaluationSuiteRequest = {
          name: 'Test Suite',
          description: 'A test evaluation suite',
          version: '1.0.0',
          configuration: {
            datasets: [],
            testTypes: [EvaluationTestType.BIAS, EvaluationTestType.SAFETY],
            thresholds: {
              taskMetrics: { accuracy: 0.9 },
              biasMetrics: { demographic_parity: 0.95 },
              safetyMetrics: { toxicity_score: 0.05 },
              robustnessMetrics: { adversarial_accuracy: 0.85 }
            },
            timeout: 3600,
            retryPolicy: {
              maxRetries: 3,
              backoffMultiplier: 2,
              initialDelayMs: 1000
            }
          }
        };

        const mockResult = {
          rows: [{
            id: 'suite-123',
            name: 'Test Suite',
            description: 'A test evaluation suite',
            version: '1.0.0',
            status: 'draft',
            configuration: request.configuration,
            created_by: 'user-123',
            created_at: new Date(),
            updated_at: new Date()
          }]
        };

        (mockDb.query as any).mockResolvedValue(mockResult);

        const result = await evaluationService.createEvaluationSuite(request, 'user-123');

        expect(mockDb.query).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO evaluation_suites'),
          [
            request.name,
            request.description,
            request.version,
            JSON.stringify(request.configuration),
            'user-123'
          ]
        );

        expect(result).toEqual({
          id: 'suite-123',
          name: 'Test Suite',
          description: 'A test evaluation suite',
          version: '1.0.0',
          status: EvaluationSuiteStatus.DRAFT,
          configuration: request.configuration,
          createdBy: 'user-123',
          createdAt: mockResult.rows[0].created_at,
          updatedAt: mockResult.rows[0].updated_at
        });
      });
    });

    describe('getEvaluationSuite', () => {
      it('should return evaluation suite when found', async () => {
        const mockResult = {
          rows: [{
            id: 'suite-123',
            name: 'Test Suite',
            description: 'A test evaluation suite',
            version: '1.0.0',
            status: 'active',
            configuration: { datasets: [], testTypes: [], thresholds: {}, timeout: 3600, retryPolicy: {} },
            created_by: 'user-123',
            created_at: new Date(),
            updated_at: new Date()
          }]
        };

        (mockDb.query as any).mockResolvedValue(mockResult);

        const result = await evaluationService.getEvaluationSuite('suite-123');

        expect(mockDb.query).toHaveBeenCalledWith(
          expect.stringContaining('SELECT * FROM evaluation_suites'),
          ['suite-123']
        );

        expect(result).toBeDefined();
        expect(result?.id).toBe('suite-123');
        expect(result?.status).toBe(EvaluationSuiteStatus.ACTIVE);
      });

      it('should return null when suite not found', async () => {
        (mockDb.query as any).mockResolvedValue({ rows: [] });

        const result = await evaluationService.getEvaluationSuite('nonexistent');

        expect(result).toBeNull();
      });
    });

    describe('searchEvaluationSuites', () => {
      it('should search suites with filters', async () => {
        const mockCountResult = { rows: [{ total: '2' }] };
        const mockSuitesResult = {
          rows: [
            {
              id: 'suite-1',
              name: 'Suite 1',
              description: 'First suite',
              version: '1.0.0',
              status: 'active',
              configuration: {},
              created_by: 'user-1',
              created_at: new Date(),
              updated_at: new Date()
            },
            {
              id: 'suite-2',
              name: 'Suite 2',
              description: 'Second suite',
              version: '1.0.0',
              status: 'draft',
              configuration: {},
              created_by: 'user-2',
              created_at: new Date(),
              updated_at: new Date()
            }
          ]
        };

        (mockDb.query as any)
          .mockResolvedValueOnce(mockCountResult)
          .mockResolvedValueOnce(mockSuitesResult);

        const filters = {
          name: 'Suite',
          status: EvaluationSuiteStatus.ACTIVE,
          limit: 10,
          offset: 0
        };

        const result = await evaluationService.searchEvaluationSuites(filters);

        expect(result.total).toBe(2);
        expect(result.suites).toHaveLength(2);
        expect(result.suites[0].name).toBe('Suite 1');
      });
    });

    describe('updateEvaluationSuite', () => {
      it('should update suite successfully', async () => {
        const updateRequest: UpdateEvaluationSuiteRequest = {
          description: 'Updated description',
          status: EvaluationSuiteStatus.ACTIVE
        };

        const mockResult = {
          rows: [{
            id: 'suite-123',
            name: 'Test Suite',
            description: 'Updated description',
            version: '1.0.0',
            status: 'active',
            configuration: {},
            created_by: 'user-123',
            created_at: new Date(),
            updated_at: new Date()
          }]
        };

        (mockDb.query as any).mockResolvedValue(mockResult);

        const result = await evaluationService.updateEvaluationSuite('suite-123', updateRequest);

        expect(mockDb.query).toHaveBeenCalledWith(
          expect.stringContaining('UPDATE evaluation_suites'),
          ['Updated description', 'active', 'suite-123']
        );

        expect(result?.description).toBe('Updated description');
        expect(result?.status).toBe(EvaluationSuiteStatus.ACTIVE);
      });

      it('should return null when suite not found', async () => {
        (mockDb.query as any).mockResolvedValue({ rows: [] });

        const result = await evaluationService.updateEvaluationSuite('nonexistent', {});

        expect(result).toBeNull();
      });
    });

    describe('deleteEvaluationSuite', () => {
      it('should delete suite successfully', async () => {
        (mockDb.query as any).mockResolvedValue({ rowCount: 1 });

        const result = await evaluationService.deleteEvaluationSuite('suite-123');

        expect(mockDb.query).toHaveBeenCalledWith(
          expect.stringContaining('DELETE FROM evaluation_suites'),
          ['suite-123']
        );

        expect(result).toBe(true);
      });

      it('should return false when suite not found', async () => {
        (mockDb.query as any).mockResolvedValue({ rowCount: 0 });

        const result = await evaluationService.deleteEvaluationSuite('nonexistent');

        expect(result).toBe(false);
      });
    });
  });

  describe('Evaluation Dataset Management', () => {
    describe('createEvaluationDataset', () => {
      it('should create a new evaluation dataset successfully', async () => {
        const request: CreateEvaluationDatasetRequest = {
          name: 'Test Dataset',
          type: DatasetType.TEST,
          metadata: { description: 'Test dataset for evaluation' }
        };

        const mockResult = {
          rows: [{
            id: 'dataset-123',
            name: 'Test Dataset',
            type: 'test',
            uri: 's3://bucket/dataset.csv',
            sha256: 'abc123',
            size: 1000000,
            metadata: request.metadata,
            created_at: new Date()
          }]
        };

        (mockDb.query as any).mockResolvedValue(mockResult);

        const result = await evaluationService.createEvaluationDataset(
          request,
          's3://bucket/dataset.csv',
          'abc123',
          1000000
        );

        expect(mockDb.query).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO evaluation_datasets'),
          [
            request.name,
            request.type,
            's3://bucket/dataset.csv',
            'abc123',
            1000000,
            JSON.stringify(request.metadata)
          ]
        );

        expect(result.name).toBe('Test Dataset');
        expect(result.type).toBe(DatasetType.TEST);
      });
    });

    describe('searchEvaluationDatasets', () => {
      it('should search datasets with filters', async () => {
        const mockCountResult = { rows: [{ total: '1' }] };
        const mockDatasetsResult = {
          rows: [{
            id: 'dataset-1',
            name: 'Test Dataset',
            type: 'test',
            uri: 's3://bucket/dataset.csv',
            sha256: 'abc123',
            size: 1000000,
            metadata: {},
            created_at: new Date()
          }]
        };

        (mockDb.query as any)
          .mockResolvedValueOnce(mockCountResult)
          .mockResolvedValueOnce(mockDatasetsResult);

        const filters = {
          name: 'Test',
          type: DatasetType.TEST,
          limit: 10,
          offset: 0
        };

        const result = await evaluationService.searchEvaluationDatasets(filters);

        expect(result.total).toBe(1);
        expect(result.datasets).toHaveLength(1);
        expect(result.datasets[0].name).toBe('Test Dataset');
      });
    });

    describe('Suite-Dataset Association', () => {
      it('should add dataset to suite', async () => {
        (mockDb.query as any).mockResolvedValue({});

        await evaluationService.addDatasetToSuite('suite-123', 'dataset-456');

        expect(mockDb.query).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO evaluation_suite_datasets'),
          ['suite-123', 'dataset-456']
        );
      });

      it('should remove dataset from suite', async () => {
        (mockDb.query as any).mockResolvedValue({});

        await evaluationService.removeDatasetFromSuite('suite-123', 'dataset-456');

        expect(mockDb.query).toHaveBeenCalledWith(
          expect.stringContaining('DELETE FROM evaluation_suite_datasets'),
          ['suite-123', 'dataset-456']
        );
      });

      it('should get suite datasets', async () => {
        const mockResult = {
          rows: [{
            id: 'dataset-1',
            name: 'Suite Dataset',
            type: 'test',
            uri: 's3://bucket/dataset.csv',
            sha256: 'abc123',
            size: 1000000,
            metadata: {},
            created_at: new Date()
          }]
        };

        (mockDb.query as any).mockResolvedValue(mockResult);

        const result = await evaluationService.getSuiteDatasets('suite-123');

        expect(mockDb.query).toHaveBeenCalledWith(
          expect.stringContaining('SELECT ed.*'),
          ['suite-123']
        );

        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('Suite Dataset');
      });
    });
  });

  describe('Threshold Configuration', () => {
    describe('validateThresholds', () => {
      it('should validate correct thresholds', () => {
        const suiteConfiguration = {};
        const thresholds = {
          taskMetrics: { accuracy: 0.9 },
          biasMetrics: { demographic_parity: 0.95 },
          safetyMetrics: { toxicity_score: 0.05 },
          robustnessMetrics: { adversarial_accuracy: 0.85 }
        };

        const result = evaluationService.validateThresholds(suiteConfiguration, thresholds);

        expect(result).toBe(true);
      });

      it('should reject incomplete thresholds', () => {
        const suiteConfiguration = {};
        const thresholds = {
          taskMetrics: { accuracy: 0.9 },
          biasMetrics: { demographic_parity: 0.95 }
          // Missing safetyMetrics and robustnessMetrics
        };

        const result = evaluationService.validateThresholds(suiteConfiguration, thresholds);

        expect(result).toBe(false);
      });
    });
  });
});