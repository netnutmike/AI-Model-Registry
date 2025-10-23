import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LineageService, CreateLineageNodeRequest, CreateLineageEdgeRequest } from '../../services/modelRegistry/lineageService.js';
import { DatabaseService } from '../../services/database/databaseService.js';

// Mock DatabaseService
const mockDb = {
  query: vi.fn(),
  transaction: vi.fn(),
  getClient: vi.fn(),
  close: vi.fn(),
  getPoolStatus: vi.fn()
} as unknown as DatabaseService;

describe('LineageService', () => {
  let service: LineageService;

  beforeEach(() => {
    service = new LineageService(mockDb);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('createNode', () => {
    it('should create a lineage node successfully', async () => {
      const request: CreateLineageNodeRequest = {
        type: 'dataset',
        name: 'training-data-v1',
        version: '1.0',
        uri: 'https://data.example.com/dataset-v1',
        metadata: { size: 1000000, format: 'parquet' }
      };

      const mockNodeEntity = {
        id: 'node-123',
        type: 'dataset',
        name: 'training-data-v1',
        version: '1.0',
        uri: 'https://data.example.com/dataset-v1',
        metadata: JSON.stringify({ size: 1000000, format: 'parquet' }),
        created_at: new Date()
      };

      mockDb.query = vi.fn()
        .mockResolvedValueOnce({ rows: [] }) // SET app.current_user_id
        .mockResolvedValueOnce({ rows: [mockNodeEntity] }); // INSERT

      const result = await service.createNode(request, 'user-123');

      expect(result).toEqual({
        id: 'node-123',
        type: 'dataset',
        name: 'training-data-v1',
        version: '1.0',
        uri: 'https://data.example.com/dataset-v1',
        metadata: { size: 1000000, format: 'parquet' },
        createdAt: mockNodeEntity.created_at
      });

      expect(mockDb.query).toHaveBeenCalledTimes(2);
    });
  });

  describe('createEdge', () => {
    it('should create a lineage edge successfully', async () => {
      const request: CreateLineageEdgeRequest = {
        sourceId: 'dataset-node-123',
        targetId: 'model-node-456',
        relationship: 'trained_on',
        metadata: { trackedAt: '2023-01-01T00:00:00Z' }
      };

      const mockEdgeEntity = {
        id: 'edge-789',
        source_id: 'dataset-node-123',
        target_id: 'model-node-456',
        relationship: 'trained_on',
        metadata: JSON.stringify({ trackedAt: '2023-01-01T00:00:00Z' }),
        created_at: new Date()
      };

      mockDb.query = vi.fn()
        .mockResolvedValueOnce({ rows: [] }) // SET app.current_user_id
        .mockResolvedValueOnce({ rows: [mockEdgeEntity] }); // INSERT

      const result = await service.createEdge(request, 'user-123');

      expect(result).toEqual({
        id: 'edge-789',
        sourceId: 'dataset-node-123',
        targetId: 'model-node-456',
        relationship: 'trained_on',
        metadata: { trackedAt: '2023-01-01T00:00:00Z' },
        createdAt: mockEdgeEntity.created_at
      });
    });

    it('should throw error for nonexistent source or target node', async () => {
      const request: CreateLineageEdgeRequest = {
        sourceId: 'nonexistent-source',
        targetId: 'nonexistent-target',
        relationship: 'trained_on'
      };

      const foreignKeyError = new Error('Foreign key constraint');
      (foreignKeyError as any).code = '23503';

      mockDb.query = vi.fn()
        .mockResolvedValueOnce({ rows: [] }) // SET app.current_user_id
        .mockRejectedValueOnce(foreignKeyError); // INSERT

      await expect(service.createEdge(request, 'user-123'))
        .rejects.toThrow('Source or target node not found');
    });
  });

  describe('trackDatasetLineage', () => {
    it('should track dataset lineage for model version', async () => {
      // Mock finding existing dataset node (not found)
      mockDb.query = vi.fn()
        .mockResolvedValueOnce({ rows: [] }) // Find dataset node
        .mockResolvedValueOnce({ rows: [] }) // SET app.current_user_id for create node
        .mockResolvedValueOnce({ rows: [{ // Create dataset node
          id: 'dataset-node-123',
          type: 'dataset',
          name: 'training-data',
          version: '1.0',
          uri: 'https://data.example.com/dataset',
          metadata: '{}',
          created_at: new Date()
        }] })
        .mockResolvedValueOnce({ rows: [] }) // Find model node (not found)
        .mockResolvedValueOnce({ rows: [{ // Get version by ID
          id: 'version-123',
          model_id: 'model-123',
          version: '1.0.0',
          commit_sha: 'a'.repeat(40)
        }] })
        .mockResolvedValueOnce({ rows: [{ // Get model by ID
          id: 'model-123',
          name: 'test-model',
          group: 'ml-team'
        }] })
        .mockResolvedValueOnce({ rows: [] }) // SET app.current_user_id for create node
        .mockResolvedValueOnce({ rows: [{ // Create model node
          id: 'model-node-456',
          type: 'model',
          name: 'ml-team/test-model',
          version: '1.0.0',
          metadata: '{}',
          created_at: new Date()
        }] })
        .mockResolvedValueOnce({ rows: [] }) // SET app.current_user_id for create edge
        .mockResolvedValueOnce({ rows: [{ // Create edge
          id: 'edge-789',
          source_id: 'dataset-node-123',
          target_id: 'model-node-456',
          relationship: 'trained_on',
          metadata: '{}',
          created_at: new Date()
        }] });

      await service.trackDatasetLineage(
        'version-123',
        'training-data',
        '1.0',
        'https://data.example.com/dataset',
        'user-123'
      );

      // Verify that the appropriate queries were called
      expect(mockDb.query).toHaveBeenCalledTimes(10);
    });
  });

  describe('generateSHA256', () => {
    it('should generate SHA256 hash for string content', () => {
      const content = 'test content';
      const hash = service.generateSHA256(content);
      
      expect(hash).toBeDefined();
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should generate SHA256 hash for buffer content', () => {
      const content = Buffer.from('test content');
      const hash = service.generateSHA256(content);
      
      expect(hash).toBeDefined();
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should generate different hashes for different content', () => {
      const hash1 = service.generateSHA256('content1');
      const hash2 = service.generateSHA256('content2');
      
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('verifySHA256', () => {
    it('should verify matching SHA256 hashes', () => {
      const content = 'test content';
      const hash = service.generateSHA256(content);
      
      const isValid = service.verifySHA256(content, hash);
      
      expect(isValid).toBe(true);
    });

    it('should reject non-matching SHA256 hashes', () => {
      const content = 'test content';
      const wrongHash = 'a'.repeat(64);
      
      const isValid = service.verifySHA256(content, wrongHash);
      
      expect(isValid).toBe(false);
    });
  });
});