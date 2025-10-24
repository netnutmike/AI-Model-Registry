import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HuggingFaceAdapter } from '../../services/mlPlatforms/huggingFaceAdapter';
import axios from 'axios';

// Mock axios
vi.mock('axios');
const mockedAxios = vi.mocked(axios);

describe('HuggingFaceAdapter', () => {
  let huggingFaceAdapter: HuggingFaceAdapter;
  let mockAxiosInstance: any;

  beforeEach(() => {
    mockAxiosInstance = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn()
    };

    mockedAxios.create = vi.fn().mockReturnValue(mockAxiosInstance);
    
    huggingFaceAdapter = new HuggingFaceAdapter('test-api-key');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('testConnection', () => {
    it('should return true for successful connection', async () => {
      mockAxiosInstance.get.mockResolvedValue({ status: 200 });

      const result = await huggingFaceAdapter.testConnection();

      expect(result).toBe(true);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/models?limit=1');
    });

    it('should return false for failed connection', async () => {
      mockAxiosInstance.get.mockRejectedValue(new Error('Connection failed'));

      const result = await huggingFaceAdapter.testConnection();

      expect(result).toBe(false);
    });
  });

  describe('listModels', () => {
    it('should list models from Hugging Face', async () => {
      const mockModels = [
        {
          id: 'bert-base-uncased',
          description: 'BERT base model',
          tags: ['pytorch', 'bert', 'text-classification'],
          pipeline_tag: 'text-classification',
          library_name: 'transformers',
          downloads: 1000000,
          likes: 500,
          createdAt: '2023-01-01T00:00:00Z',
          lastModified: '2023-01-02T00:00:00Z',
          private: false,
          author: 'google'
        }
      ];

      mockAxiosInstance.get.mockResolvedValue({ data: mockModels });

      const result = await huggingFaceAdapter.listModels(10, 0);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 'bert-base-uncased',
        name: 'bert-base-uncased',
        version: 'main',
        description: 'BERT base model',
        tags: ['pytorch', 'bert', 'text-classification'],
        metadata: {
          task: 'text-classification',
          library: 'transformers',
          downloads: 1000000,
          likes: 500,
          private: false,
          author: 'google'
        },
        source: {
          platform: 'huggingface',
          url: 'https://huggingface.co/bert-base-uncased'
        }
      });
    });

    it('should handle API errors gracefully', async () => {
      mockAxiosInstance.get.mockRejectedValue(new Error('API Error'));

      const result = await huggingFaceAdapter.listModels();

      expect(result).toHaveLength(0);
    });
  });

  describe('getModel', () => {
    it('should get model details with files', async () => {
      const mockModel = {
        id: 'bert-base-uncased',
        description: 'BERT base model',
        tags: ['pytorch', 'bert'],
        pipeline_tag: 'text-classification',
        library_name: 'transformers',
        downloads: 1000000,
        likes: 500,
        createdAt: '2023-01-01T00:00:00Z',
        lastModified: '2023-01-02T00:00:00Z',
        private: false
      };

      const mockFiles = [
        {
          path: 'config.json',
          type: 'file',
          size: 1024
        },
        {
          path: 'pytorch_model.bin',
          type: 'file',
          size: 440000000
        },
        {
          path: 'tokenizer.json',
          type: 'file',
          size: 2048
        }
      ];

      mockAxiosInstance.get
        .mockResolvedValueOnce({ data: mockModel })
        .mockResolvedValueOnce({ data: mockFiles });

      const result = await huggingFaceAdapter.getModel('bert-base-uncased');

      expect(result).toMatchObject({
        id: 'bert-base-uncased',
        name: 'bert-base-uncased',
        version: 'main',
        artifacts: expect.arrayContaining([
          expect.objectContaining({
            name: 'config.json',
            type: 'config',
            uri: 'https://huggingface.co/bert-base-uncased/resolve/main/config.json',
            size: 1024
          }),
          expect.objectContaining({
            name: 'pytorch_model.bin',
            type: 'pytorch-model',
            size: 440000000
          })
        ])
      });
    });

    it('should return null for non-existent model', async () => {
      mockAxiosInstance.get.mockRejectedValue({ response: { status: 404 } });

      const result = await huggingFaceAdapter.getModel('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('importModel', () => {
    it('should import public model successfully', async () => {
      const mockModel = {
        id: 'bert-base-uncased',
        name: 'bert-base-uncased',
        version: 'main',
        description: 'BERT base model',
        tags: ['pytorch', 'bert'],
        metadata: { private: false, license: 'apache-2.0' },
        artifacts: [
          { name: 'config.json', type: 'config', uri: 'https://huggingface.co/bert-base-uncased/resolve/main/config.json' }
        ],
        metrics: {},
        parameters: {},
        createdAt: new Date(),
        updatedAt: new Date(),
        source: { platform: 'huggingface', url: 'https://huggingface.co/bert-base-uncased' }
      };

      vi.spyOn(huggingFaceAdapter, 'getModel').mockResolvedValue(mockModel);

      const result = await huggingFaceAdapter.importModel('bert-base-uncased', 'main', {
        includeArtifacts: true,
        includeMetrics: true,
        includeParameters: true,
        overwriteExisting: false
      });

      expect(result.success).toBe(true);
      expect(result.modelId).toBe('hf-bert-base-uncased');
      expect(result.versionId).toBe('main');
    });

    it('should fail import for private model without API key', async () => {
      const privateAdapter = new HuggingFaceAdapter(); // No API key

      const mockModel = {
        id: 'private-model',
        name: 'private-model',
        version: 'main',
        description: 'Private model',
        tags: [],
        metadata: { private: true },
        artifacts: [],
        metrics: {},
        parameters: {},
        createdAt: new Date(),
        updatedAt: new Date(),
        source: { platform: 'huggingface', url: 'https://huggingface.co/private-model' }
      };

      vi.spyOn(privateAdapter, 'getModel').mockResolvedValue(mockModel);

      const result = await privateAdapter.importModel('private-model', 'main', {
        includeArtifacts: true,
        includeMetrics: true,
        includeParameters: true,
        overwriteExisting: false
      });

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Model is not importable (private or restricted)');
    });

    it('should fail import for non-existent model', async () => {
      vi.spyOn(huggingFaceAdapter, 'getModel').mockResolvedValue(null);

      const result = await huggingFaceAdapter.importModel('non-existent', 'main', {
        includeArtifacts: true,
        includeMetrics: true,
        includeParameters: true,
        overwriteExisting: false
      });

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Model not found on Hugging Face');
    });
  });

  describe('searchModels', () => {
    it('should search models by query', async () => {
      const mockModels = [
        {
          id: 'bert-large-uncased',
          description: 'BERT large model',
          tags: ['pytorch', 'bert'],
          pipeline_tag: 'text-classification',
          library_name: 'transformers',
          downloads: 500000,
          likes: 250,
          createdAt: '2023-01-01T00:00:00Z',
          lastModified: '2023-01-02T00:00:00Z',
          private: false
        }
      ];

      mockAxiosInstance.get.mockResolvedValue({ data: mockModels });

      const result = await huggingFaceAdapter.searchModels('bert');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('bert-large-uncased');
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/models',
        expect.objectContaining({
          params: expect.objectContaining({
            search: 'bert',
            limit: 50
          })
        })
      );
    });

    it('should search with filters', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: [] });

      await huggingFaceAdapter.searchModels('classification', {
        task: 'text-classification',
        library: 'transformers',
        language: 'en'
      });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/models',
        expect.objectContaining({
          params: expect.objectContaining({
            search: 'classification',
            pipeline_tag: 'text-classification',
            library: 'transformers',
            language: 'en'
          })
        })
      );
    });

    it('should handle search errors gracefully', async () => {
      mockAxiosInstance.get.mockRejectedValue(new Error('Search failed'));

      const result = await huggingFaceAdapter.searchModels('test');

      expect(result).toHaveLength(0);
    });
  });

  describe('exportModel', () => {
    it('should fail export without API key', async () => {
      const adapterWithoutKey = new HuggingFaceAdapter();

      const result = await adapterWithoutKey.exportModel('model-id', 'version-id', {
        includeArtifacts: true,
        includeMetadata: true,
        format: 'huggingface'
      });

      expect(result.success).toBe(false);
      expect(result.errors).toContain('API key required for exporting to Hugging Face');
    });

    it('should succeed export with API key', async () => {
      const result = await huggingFaceAdapter.exportModel('model-id', 'version-id', {
        includeArtifacts: true,
        includeMetadata: true,
        format: 'huggingface'
      });

      expect(result.success).toBe(true);
      expect(result.exportUrl).toBe('https://huggingface.co/model-id');
    });
  });
});