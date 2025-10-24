import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MlflowAdapter } from '../../services/mlPlatforms/mlflowAdapter';
import axios from 'axios';

// Mock axios
vi.mock('axios');
const mockedAxios = vi.mocked(axios);

describe('MlflowAdapter', () => {
  let mlflowAdapter: MlflowAdapter;
  let mockAxiosInstance: any;

  beforeEach(() => {
    mockAxiosInstance = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn()
    };

    mockedAxios.create = vi.fn().mockReturnValue(mockAxiosInstance);
    
    mlflowAdapter = new MlflowAdapter('http://localhost:5000', 'test-api-key');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('testConnection', () => {
    it('should return true for successful connection', async () => {
      mockAxiosInstance.get.mockResolvedValue({ status: 200 });

      const result = await mlflowAdapter.testConnection();

      expect(result).toBe(true);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/2.0/mlflow/experiments/list');
    });

    it('should return false for failed connection', async () => {
      mockAxiosInstance.get.mockRejectedValue(new Error('Connection failed'));

      const result = await mlflowAdapter.testConnection();

      expect(result).toBe(false);
    });
  });

  describe('listModels', () => {
    it('should list models with their latest versions', async () => {
      const mockRegisteredModels = {
        data: {
          registered_models: [
            {
              name: 'test-model',
              description: 'Test model description'
            }
          ]
        }
      };

      const mockModelVersions = {
        data: {
          model_versions: [
            {
              name: 'test-model',
              version: '1',
              current_stage: 'Production',
              run_id: 'run-123',
              user_id: 'user-123',
              creation_timestamp: 1640995200000,
              last_updated_timestamp: 1640995200000,
              source: 's3://bucket/model',
              tags: { env: 'prod' }
            }
          ]
        }
      };

      const mockRun = {
        data: {
          run: {
            data: {
              metrics: { accuracy: 0.95 },
              params: { learning_rate: 0.01 }
            }
          }
        }
      };

      mockAxiosInstance.get
        .mockResolvedValueOnce(mockRegisteredModels)
        .mockResolvedValueOnce(mockModelVersions)
        .mockResolvedValueOnce(mockRun);

      const result = await mlflowAdapter.listModels(10, 0);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 'test-model',
        name: 'test-model',
        version: '1',
        description: 'Test model description',
        metadata: {
          stage: 'Production',
          runId: 'run-123',
          userId: 'user-123'
        },
        metrics: { accuracy: 0.95 },
        parameters: { learning_rate: 0.01 },
        source: {
          platform: 'mlflow',
          runId: 'run-123'
        }
      });
    });

    it('should handle empty model list', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: { registered_models: [] }
      });

      const result = await mlflowAdapter.listModels();

      expect(result).toHaveLength(0);
    });

    it('should handle API errors gracefully', async () => {
      mockAxiosInstance.get.mockRejectedValue(new Error('API Error'));

      const result = await mlflowAdapter.listModels();

      expect(result).toHaveLength(0);
    });
  });

  describe('getModel', () => {
    it('should get model with specific version', async () => {
      const mockRegisteredModel = {
        data: {
          registered_model: {
            name: 'test-model',
            description: 'Test model'
          }
        }
      };

      const mockModelVersion = {
        data: {
          model_version: {
            name: 'test-model',
            version: '2',
            current_stage: 'Staging',
            run_id: 'run-456',
            creation_timestamp: 1640995200000,
            last_updated_timestamp: 1640995200000,
            source: 's3://bucket/model-v2'
          }
        }
      };

      mockAxiosInstance.get
        .mockResolvedValueOnce(mockRegisteredModel)
        .mockResolvedValueOnce(mockModelVersion)
        .mockResolvedValueOnce({ data: { run: { data: {} } } });

      const result = await mlflowAdapter.getModel('test-model', '2');

      expect(result).toMatchObject({
        id: 'test-model',
        version: '2',
        metadata: {
          stage: 'Staging',
          runId: 'run-456'
        }
      });
    });

    it('should get latest version when no version specified', async () => {
      const mockRegisteredModel = {
        data: {
          registered_model: {
            name: 'test-model',
            description: 'Test model'
          }
        }
      };

      const mockLatestVersion = {
        data: {
          model_versions: [
            {
              name: 'test-model',
              version: '3',
              current_stage: 'Production',
              creation_timestamp: 1640995200000,
              last_updated_timestamp: 1640995200000
            }
          ]
        }
      };

      mockAxiosInstance.get
        .mockResolvedValueOnce(mockRegisteredModel)
        .mockResolvedValueOnce(mockLatestVersion)
        .mockResolvedValueOnce({ data: { run: { data: {} } } });

      const result = await mlflowAdapter.getModel('test-model');

      expect(result).toMatchObject({
        id: 'test-model',
        version: '3'
      });
    });

    it('should return null for non-existent model', async () => {
      mockAxiosInstance.get.mockRejectedValue({ response: { status: 404 } });

      const result = await mlflowAdapter.getModel('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('importModel', () => {
    it('should import model successfully', async () => {
      const mockModel = {
        id: 'test-model',
        name: 'test-model',
        version: '1',
        description: 'Test model',
        tags: [],
        metadata: {},
        artifacts: [
          { name: 'model', type: 'mlflow-model', uri: 's3://bucket/model' }
        ],
        metrics: {},
        parameters: {},
        createdAt: new Date(),
        updatedAt: new Date(),
        source: { platform: 'mlflow', url: 'http://localhost:5000' }
      };

      // Mock getModel to return the model
      vi.spyOn(mlflowAdapter, 'getModel').mockResolvedValue(mockModel);

      const result = await mlflowAdapter.importModel('test-model', '1', {
        includeArtifacts: true,
        includeMetrics: true,
        includeParameters: true,
        overwriteExisting: false
      });

      expect(result.success).toBe(true);
      expect(result.modelId).toBe('imported-test-model');
      expect(result.versionId).toBe('imported-1');
      expect(result.importedArtifacts).toBe(1);
    });

    it('should fail import for non-existent model', async () => {
      vi.spyOn(mlflowAdapter, 'getModel').mockResolvedValue(null);

      const result = await mlflowAdapter.importModel('non-existent', '1', {
        includeArtifacts: true,
        includeMetrics: true,
        includeParameters: true,
        overwriteExisting: false
      });

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Model not found in MLflow');
    });
  });

  describe('searchModels', () => {
    it('should search models by name', async () => {
      const mockSearchResults = {
        data: {
          registered_models: [
            {
              name: 'search-model',
              description: 'Searchable model'
            }
          ]
        }
      };

      const mockVersions = {
        data: {
          model_versions: [
            {
              name: 'search-model',
              version: '1',
              creation_timestamp: 1640995200000,
              last_updated_timestamp: 1640995200000
            }
          ]
        }
      };

      mockAxiosInstance.get
        .mockResolvedValueOnce(mockSearchResults)
        .mockResolvedValueOnce(mockVersions)
        .mockResolvedValueOnce({ data: { run: { data: {} } } });

      const result = await mlflowAdapter.searchModels('search');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('search-model');
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/api/2.0/mlflow/registered-models/search',
        expect.objectContaining({
          params: expect.objectContaining({
            filter: expect.stringContaining("name ILIKE '%search%'")
          })
        })
      );
    });

    it('should search with tag filters', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: { registered_models: [] } });

      await mlflowAdapter.searchModels('test', { tags: ['production', 'validated'] });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/api/2.0/mlflow/registered-models/search',
        expect.objectContaining({
          params: expect.objectContaining({
            filter: expect.stringContaining("tags.production = 'true' OR tags.validated = 'true'")
          })
        })
      );
    });
  });
});