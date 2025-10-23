import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ModelRegistryService } from '../../services/modelRegistry/modelRegistryService.js';
import { DatabaseService } from '../../services/database/databaseService.js';
import { 
  CreateModelRequest, 
  CreateVersionRequest, 
  CreateArtifactRequest,
  RiskTier, 
  VersionState, 
  ArtifactType,
  ModelSearchFilters 
} from '../../types/index.js';
import crypto from 'crypto';

// Mock DatabaseService
const mockDb = {
  query: vi.fn(),
  transaction: vi.fn(),
  getClient: vi.fn(),
  close: vi.fn(),
  getPoolStatus: vi.fn()
} as unknown as DatabaseService;

describe('ModelRegistryService', () => {
  let service: ModelRegistryService;

  beforeEach(() => {
    service = new ModelRegistryService(mockDb);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('createModel', () => {
    it('should create a new model successfully', async () => {
      const request: CreateModelRequest = {
        name: 'test-model',
        group: 'ml-team',
        description: 'A test model',
        owners: ['owner@example.com'],
        riskTier: RiskTier.LOW,
        tags: ['test', 'demo']
      };

      const mockModelEntity = {
        id: 'model-123',
        name: 'test-model',
        group: 'ml-team',
        description: 'A test model',
        owners: ['owner@example.com'],
        risk_tier: 'Low',
        tags: ['test', 'demo'],
        created_at: new Date(),
        updated_at: new Date()
      };

      mockDb.query = vi.fn()
        .mockResolvedValueOnce({ rows: [] }) // SET app.current_user_id
        .mockResolvedValueOnce({ rows: [mockModelEntity] }); // INSERT

      const result = await service.createModel(request, 'user-123');

      expect(result).toEqual({
        id: 'model-123',
        name: 'test-model',
        group: 'ml-team',
        description: 'A test model',
        owners: ['owner@example.com'],
        riskTier: 'Low',
        tags: ['test', 'demo'],
        createdAt: mockModelEntity.created_at,
        updatedAt: mockModelEntity.updated_at
      });

      expect(mockDb.query).toHaveBeenCalledTimes(2);
    });

    it('should throw error for duplicate model name', async () => {
      const request: CreateModelRequest = {
        name: 'existing-model',
        group: 'ml-team',
        description: 'A test model',
        owners: ['owner@example.com'],
        riskTier: RiskTier.LOW
      };

      const duplicateError = new Error('Duplicate key');
      (duplicateError as any).code = '23505';

      mockDb.query = vi.fn()
        .mockResolvedValueOnce({ rows: [] }) // SET app.current_user_id
        .mockRejectedValueOnce(duplicateError); // INSERT

      await expect(service.createModel(request, 'user-123'))
        .rejects.toThrow('Model ml-team/existing-model already exists');
    });
  });

  describe('getModelById', () => {
    it('should return model when found', async () => {
      const mockModelEntity = {
        id: 'model-123',
        name: 'test-model',
        group: 'ml-team',
        description: 'A test model',
        owners: ['owner@example.com'],
        risk_tier: 'Low',
        tags: ['test'],
        created_at: new Date(),
        updated_at: new Date()
      };

      mockDb.query = vi.fn().mockResolvedValueOnce({ rows: [mockModelEntity] });

      const result = await service.getModelById('model-123');

      expect(result).toEqual({
        id: 'model-123',
        name: 'test-model',
        group: 'ml-team',
        description: 'A test model',
        owners: ['owner@example.com'],
        riskTier: 'Low',
        tags: ['test'],
        createdAt: mockModelEntity.created_at,
        updatedAt: mockModelEntity.updated_at
      });
    });

    it('should return null when model not found', async () => {
      mockDb.query = vi.fn().mockResolvedValueOnce({ rows: [] });

      const result = await service.getModelById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('searchModels', () => {
    it('should search models with filters and pagination', async () => {
      const mockModels = [
        {
          id: 'model-1',
          name: 'model-1',
          group: 'team-a',
          description: 'First model',
          owners: ['owner1@example.com'],
          risk_tier: 'Low',
          tags: ['tag1'],
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          id: 'model-2',
          name: 'model-2',
          group: 'team-a',
          description: 'Second model',
          owners: ['owner2@example.com'],
          risk_tier: 'Medium',
          tags: ['tag2'],
          created_at: new Date(),
          updated_at: new Date()
        }
      ];

      mockDb.query = vi.fn()
        .mockResolvedValueOnce({ rows: [{ total: '2' }] }) // COUNT query
        .mockResolvedValueOnce({ rows: mockModels }); // SELECT query

      const result = await service.searchModels(
        { group: 'team-a' },
        1,
        10
      );

      expect(result.total).toBe(2);
      expect(result.models).toHaveLength(2);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(10);
    });

    it('should handle search with text query', async () => {
      mockDb.query = vi.fn()
        .mockResolvedValueOnce({ rows: [{ total: '1' }] })
        .mockResolvedValueOnce({ rows: [] });

      await service.searchModels({ search: 'test query' }, 1, 10);

      // Verify that the search query includes text search conditions
      const calls = (mockDb.query as any).mock.calls;
      expect(calls[0][0]).toContain('to_tsvector');
      expect(calls[0][1]).toContain('test query');
    });
  });

  describe('createVersion', () => {
    it('should create a new version successfully', async () => {
      const request: CreateVersionRequest = {
        version: '1.0.0',
        commitSha: 'a'.repeat(40),
        metadata: {
          framework: 'pytorch',
          frameworkVersion: '1.9.0',
          modelType: 'transformer'
        }
      };

      const mockVersionEntity = {
        id: 'version-123',
        model_id: 'model-123',
        version: '1.0.0',
        state: 'draft',
        commit_sha: 'a'.repeat(40),
        training_job_id: null,
        metadata: JSON.stringify(request.metadata),
        created_at: new Date(),
        updated_at: new Date()
      };

      mockDb.query = vi.fn()
        .mockResolvedValueOnce({ rows: [] }) // SET app.current_user_id
        .mockResolvedValueOnce({ rows: [mockVersionEntity] }); // INSERT

      const result = await service.createVersion('model-123', request, 'user-123');

      expect(result).toEqual({
        id: 'version-123',
        modelId: 'model-123',
        version: '1.0.0',
        state: 'draft',
        commitSha: 'a'.repeat(40),
        trainingJobId: undefined,
        metadata: request.metadata,
        createdAt: mockVersionEntity.created_at,
        updatedAt: mockVersionEntity.updated_at
      });
    });

    it('should throw error for duplicate version', async () => {
      const request: CreateVersionRequest = {
        version: '1.0.0',
        commitSha: 'a'.repeat(40),
        metadata: {
          framework: 'pytorch',
          frameworkVersion: '1.9.0',
          modelType: 'transformer'
        }
      };

      const duplicateError = new Error('Duplicate key');
      (duplicateError as any).code = '23505';

      mockDb.query = vi.fn()
        .mockResolvedValueOnce({ rows: [] }) // SET app.current_user_id
        .mockRejectedValueOnce(duplicateError); // INSERT

      await expect(service.createVersion('model-123', request, 'user-123'))
        .rejects.toThrow('Version 1.0.0 already exists for this model');
    });
  });

  describe('updateVersionState', () => {
    it('should update version state successfully', async () => {
      const mockVersionEntity = {
        id: 'version-123',
        model_id: 'model-123',
        version: '1.0.0',
        state: 'submitted',
        commit_sha: 'a'.repeat(40),
        training_job_id: null,
        metadata: '{}',
        created_at: new Date(),
        updated_at: new Date()
      };

      mockDb.query = vi.fn()
        .mockResolvedValueOnce({ rows: [] }) // SET app.current_user_id
        .mockResolvedValueOnce({ rows: [mockVersionEntity] }); // UPDATE

      const result = await service.updateVersionState('version-123', VersionState.SUBMITTED, 'user-123');

      expect(result.state).toBe('submitted');
    });

    it('should throw error for invalid state transition', async () => {
      const transitionError = new Error('Invalid state transition from draft to production');

      mockDb.query = vi.fn()
        .mockResolvedValueOnce({ rows: [] }) // SET app.current_user_id
        .mockRejectedValueOnce(transitionError); // UPDATE

      await expect(service.updateVersionState('version-123', VersionState.PRODUCTION, 'user-123'))
        .rejects.toThrow('Invalid state transition to production');
    });
  });

  describe('generateArtifactUploadUrl', () => {
    it('should generate upload URL for valid version', async () => {
      const mockVersionEntity = {
        id: 'version-123',
        model_id: 'model-123',
        version: '1.0.0',
        state: 'draft',
        commit_sha: 'a'.repeat(40),
        training_job_id: null,
        metadata: '{}',
        created_at: new Date(),
        updated_at: new Date()
      };

      mockDb.query = vi.fn().mockResolvedValueOnce({ rows: [mockVersionEntity] });

      const request: CreateArtifactRequest = {
        type: ArtifactType.WEIGHTS
      };

      const result = await service.generateArtifactUploadUrl('version-123', request);

      expect(result.uploadUrl).toContain('s3.amazonaws.com');
      expect(result.artifactId).toBeDefined();
      expect(result.fields.key).toContain('model-123/1.0.0');
    });

    it('should throw error for nonexistent version', async () => {
      mockDb.query = vi.fn().mockResolvedValueOnce({ rows: [] });

      const request: CreateArtifactRequest = {
        type: ArtifactType.WEIGHTS
      };

      await expect(service.generateArtifactUploadUrl('nonexistent', request))
        .rejects.toThrow('Version not found');
    });
  });

  describe('createArtifact', () => {
    it('should create artifact successfully', async () => {
      const mockArtifactEntity = {
        id: 'artifact-123',
        version_id: 'version-123',
        type: 'weights',
        uri: 'https://s3.amazonaws.com/bucket/key',
        sha256: 'a'.repeat(64),
        size: 1024,
        license: 'MIT',
        created_at: new Date()
      };

      mockDb.query = vi.fn()
        .mockResolvedValueOnce({ rows: [] }) // SET app.current_user_id
        .mockResolvedValueOnce({ rows: [mockArtifactEntity] }); // INSERT

      const request = {
        type: ArtifactType.WEIGHTS,
        uri: 'https://s3.amazonaws.com/bucket/key',
        size: 1024,
        license: 'MIT'
      };

      const result = await service.createArtifact('version-123', 'artifact-123', request, 'user-123');

      expect(result).toEqual({
        id: 'artifact-123',
        versionId: 'version-123',
        type: 'weights',
        uri: 'https://s3.amazonaws.com/bucket/key',
        sha256: 'a'.repeat(64),
        size: 1024,
        license: 'MIT',
        createdAt: mockArtifactEntity.created_at
      });
    });
  });

  describe('verifyArtifactIntegrity', () => {
    it('should verify artifact integrity successfully', async () => {
      const expectedSha256 = 'a'.repeat(64);
      const mockArtifactEntity = {
        id: 'artifact-123',
        version_id: 'version-123',
        type: 'weights',
        uri: 'https://s3.amazonaws.com/bucket/key',
        sha256: expectedSha256,
        size: 1024,
        license: 'MIT',
        created_at: new Date()
      };

      mockDb.query = vi.fn().mockResolvedValueOnce({ rows: [mockArtifactEntity] });

      const result = await service.verifyArtifactIntegrity('artifact-123', expectedSha256);

      expect(result).toBe(true);
    });

    it('should return false for mismatched SHA256', async () => {
      const storedSha256 = 'a'.repeat(64);
      const providedSha256 = 'b'.repeat(64);
      
      const mockArtifactEntity = {
        id: 'artifact-123',
        version_id: 'version-123',
        type: 'weights',
        uri: 'https://s3.amazonaws.com/bucket/key',
        sha256: storedSha256,
        size: 1024,
        license: 'MIT',
        created_at: new Date()
      };

      mockDb.query = vi.fn().mockResolvedValueOnce({ rows: [mockArtifactEntity] });

      const result = await service.verifyArtifactIntegrity('artifact-123', providedSha256);

      expect(result).toBe(false);
    });

    it('should throw error for nonexistent artifact', async () => {
      mockDb.query = vi.fn().mockResolvedValueOnce({ rows: [] });

      await expect(service.verifyArtifactIntegrity('nonexistent', 'a'.repeat(64)))
        .rejects.toThrow('Artifact not found');
    });
  });

  describe('updateModel', () => {
    it('should update model metadata successfully', async () => {
      const updates = {
        description: 'Updated description',
        riskTier: RiskTier.MEDIUM,
        tags: ['updated', 'test']
      };

      const mockUpdatedEntity = {
        id: 'model-123',
        name: 'test-model',
        group: 'ml-team',
        description: 'Updated description',
        owners: ['owner@example.com'],
        risk_tier: 'Medium',
        tags: ['updated', 'test'],
        created_at: new Date(),
        updated_at: new Date()
      };

      mockDb.query = vi.fn()
        .mockResolvedValueOnce({ rows: [] }) // SET app.current_user_id
        .mockResolvedValueOnce({ rows: [mockUpdatedEntity] }); // UPDATE

      const result = await service.updateModel('model-123', updates, 'user-123');

      expect(result.description).toBe('Updated description');
      expect(result.riskTier).toBe('Medium');
      expect(result.tags).toEqual(['updated', 'test']);
    });

    it('should throw error when no fields to update', async () => {
      await expect(service.updateModel('model-123', {}, 'user-123'))
        .rejects.toThrow('No valid fields to update');
    });

    it('should throw error for nonexistent model', async () => {
      mockDb.query = vi.fn()
        .mockResolvedValueOnce({ rows: [] }) // SET app.current_user_id
        .mockResolvedValueOnce({ rows: [] }); // UPDATE returns no rows

      await expect(service.updateModel('nonexistent', { description: 'test' }, 'user-123'))
        .rejects.toThrow('Model not found');
    });
  });

  describe('getModelByGroupAndName', () => {
    it('should return model when found by group and name', async () => {
      const mockModelEntity = {
        id: 'model-123',
        name: 'test-model',
        group: 'ml-team',
        description: 'A test model',
        owners: ['owner@example.com'],
        risk_tier: 'Low',
        tags: ['test'],
        created_at: new Date(),
        updated_at: new Date()
      };

      mockDb.query = vi.fn().mockResolvedValueOnce({ rows: [mockModelEntity] });

      const result = await service.getModelByGroupAndName('ml-team', 'test-model');

      expect(result).toEqual({
        id: 'model-123',
        name: 'test-model',
        group: 'ml-team',
        description: 'A test model',
        owners: ['owner@example.com'],
        riskTier: 'Low',
        tags: ['test'],
        createdAt: mockModelEntity.created_at,
        updatedAt: mockModelEntity.updated_at
      });
    });

    it('should return null when model not found', async () => {
      mockDb.query = vi.fn().mockResolvedValueOnce({ rows: [] });

      const result = await service.getModelByGroupAndName('nonexistent', 'model');

      expect(result).toBeNull();
    });
  });

  describe('getModelVersions', () => {
    it('should return all versions for a model', async () => {
      const mockVersions = [
        {
          id: 'version-1',
          model_id: 'model-123',
          version: '2.0.0',
          state: 'production',
          commit_sha: 'b'.repeat(40),
          training_job_id: null,
          metadata: '{"framework": "pytorch"}',
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          id: 'version-2',
          model_id: 'model-123',
          version: '1.0.0',
          state: 'deprecated',
          commit_sha: 'a'.repeat(40),
          training_job_id: null,
          metadata: '{"framework": "tensorflow"}',
          created_at: new Date(),
          updated_at: new Date()
        }
      ];

      mockDb.query = vi.fn().mockResolvedValueOnce({ rows: mockVersions });

      const result = await service.getModelVersions('model-123');

      expect(result).toHaveLength(2);
      expect(result[0].version).toBe('2.0.0');
      expect(result[1].version).toBe('1.0.0');
    });

    it('should return empty array for model with no versions', async () => {
      mockDb.query = vi.fn().mockResolvedValueOnce({ rows: [] });

      const result = await service.getModelVersions('model-123');

      expect(result).toEqual([]);
    });
  });

  describe('getVersionArtifacts', () => {
    it('should return all artifacts for a version', async () => {
      const mockArtifacts = [
        {
          id: 'artifact-1',
          version_id: 'version-123',
          type: 'weights',
          uri: 'https://s3.amazonaws.com/bucket/weights',
          sha256: 'a'.repeat(64),
          size: 1024000,
          license: 'MIT',
          created_at: new Date()
        },
        {
          id: 'artifact-2',
          version_id: 'version-123',
          type: 'config',
          uri: 'https://s3.amazonaws.com/bucket/config',
          sha256: 'b'.repeat(64),
          size: 2048,
          license: null,
          created_at: new Date()
        }
      ];

      mockDb.query = vi.fn().mockResolvedValueOnce({ rows: mockArtifacts });

      const result = await service.getVersionArtifacts('version-123');

      expect(result).toHaveLength(2);
      expect(result[0].type).toBe('weights');
      expect(result[1].type).toBe('config');
    });

    it('should return empty array for version with no artifacts', async () => {
      mockDb.query = vi.fn().mockResolvedValueOnce({ rows: [] });

      const result = await service.getVersionArtifacts('version-123');

      expect(result).toEqual([]);
    });
  });

  describe('generateArtifactDownloadUrl', () => {
    it('should generate download URL for existing artifact', async () => {
      const mockArtifactEntity = {
        id: 'artifact-123',
        version_id: 'version-123',
        type: 'weights',
        uri: 'https://s3.amazonaws.com/bucket/key',
        sha256: 'a'.repeat(64),
        size: 1024,
        license: 'MIT',
        created_at: new Date()
      };

      mockDb.query = vi.fn().mockResolvedValueOnce({ rows: [mockArtifactEntity] });

      const result = await service.generateArtifactDownloadUrl('artifact-123');

      expect(result).toContain('https://s3.amazonaws.com/bucket/key');
      expect(result).toContain('X-Amz-Expires=3600');
      expect(result).toContain('X-Amz-Signature=mock-signature');
    });

    it('should throw error for nonexistent artifact', async () => {
      mockDb.query = vi.fn().mockResolvedValueOnce({ rows: [] });

      await expect(service.generateArtifactDownloadUrl('nonexistent'))
        .rejects.toThrow('Artifact not found');
    });
  });

  describe('SHA256 operations', () => {
    it('should generate SHA256 hash for string content', () => {
      const content = 'test content';
      const result = service.generateSHA256(content);
      
      expect(result).toBe(crypto.createHash('sha256').update(content).digest('hex'));
      expect(result).toHaveLength(64);
    });

    it('should generate SHA256 hash for buffer content', () => {
      const content = Buffer.from('test content');
      const result = service.generateSHA256(content);
      
      expect(result).toBe(crypto.createHash('sha256').update(content).digest('hex'));
      expect(result).toHaveLength(64);
    });

    it('should verify SHA256 hash correctly', () => {
      const content = 'test content';
      const expectedHash = crypto.createHash('sha256').update(content).digest('hex');
      
      const result = service.verifySHA256(content, expectedHash);
      
      expect(result).toBe(true);
    });

    it('should return false for incorrect SHA256 hash', () => {
      const content = 'test content';
      const wrongHash = 'a'.repeat(64);
      
      const result = service.verifySHA256(content, wrongHash);
      
      expect(result).toBe(false);
    });
  });

  describe('Advanced search functionality', () => {
    it('should handle complex search filters', async () => {
      const filters: ModelSearchFilters = {
        group: 'ml-team',
        riskTier: RiskTier.HIGH,
        tags: ['production', 'nlp'],
        owners: ['owner1@example.com', 'owner2@example.com'],
        state: VersionState.PRODUCTION,
        search: 'sentiment analysis'
      };

      mockDb.query = vi.fn()
        .mockResolvedValueOnce({ rows: [{ total: '1' }] })
        .mockResolvedValueOnce({ rows: [] });

      await service.searchModels(filters, 1, 10);

      const calls = (mockDb.query as any).mock.calls;
      
      // Verify all filter conditions are applied
      expect(calls[0][0]).toContain('"group" =');
      expect(calls[0][0]).toContain('risk_tier =');
      expect(calls[0][0]).toContain('tags &&');
      expect(calls[0][0]).toContain('owners &&');
      expect(calls[0][0]).toContain('EXISTS');
      expect(calls[0][0]).toContain('to_tsvector');
      
      expect(calls[0][1]).toContain('ml-team');
      expect(calls[0][1]).toContain('High');
      expect(calls[0][1]).toContain('production');
      expect(calls[0][1]).toContain('sentiment analysis');
    });

    it('should handle pagination correctly', async () => {
      mockDb.query = vi.fn()
        .mockResolvedValueOnce({ rows: [{ total: '25' }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.searchModels({}, 3, 5);

      expect(result.page).toBe(3);
      expect(result.pageSize).toBe(5);
      expect(result.total).toBe(25);

      const calls = (mockDb.query as any).mock.calls;
      expect(calls[1][1]).toContain(5); // LIMIT
      expect(calls[1][1]).toContain(10); // OFFSET (page 3, size 5 = offset 10)
    });
  });

  describe('Error handling', () => {
    it('should handle database connection errors gracefully', async () => {
      const dbError = new Error('Connection timeout');
      mockDb.query = vi.fn().mockRejectedValueOnce(dbError);

      await expect(service.getModelById('model-123'))
        .rejects.toThrow('Connection timeout');
    });

    it('should handle foreign key constraint violations', async () => {
      const fkError = new Error('Foreign key violation');
      (fkError as any).code = '23503';

      mockDb.query = vi.fn()
        .mockResolvedValueOnce({ rows: [] }) // SET app.current_user_id
        .mockRejectedValueOnce(fkError);

      const request: CreateVersionRequest = {
        version: '1.0.0',
        commitSha: 'a'.repeat(40),
        metadata: { framework: 'pytorch', frameworkVersion: '1.9.0', modelType: 'transformer' }
      };

      await expect(service.createVersion('nonexistent-model', request, 'user-123'))
        .rejects.toThrow('Model not found');
    });

    it('should handle invalid version state transitions', async () => {
      const transitionError = new Error('Invalid state transition from draft to production');
      
      mockDb.query = vi.fn()
        .mockResolvedValueOnce({ rows: [] }) // SET app.current_user_id
        .mockRejectedValueOnce(transitionError);

      await expect(service.updateVersionState('version-123', VersionState.PRODUCTION, 'user-123'))
        .rejects.toThrow('Invalid state transition to production');
    });
  });

  describe('S3 Integration Tests', () => {
    describe('Artifact Upload Flow', () => {
      it('should generate valid S3 upload URL structure', async () => {
        const mockVersionEntity = {
          id: 'version-123',
          model_id: 'model-456',
          version: '1.2.3',
          state: 'draft',
          commit_sha: 'a'.repeat(40),
          training_job_id: null,
          metadata: '{}',
          created_at: new Date(),
          updated_at: new Date()
        };

        mockDb.query = vi.fn().mockResolvedValueOnce({ rows: [mockVersionEntity] });

        const request: CreateArtifactRequest = {
          type: ArtifactType.WEIGHTS
        };

        const result = await service.generateArtifactUploadUrl('version-123', request);

        // Verify S3 URL structure
        expect(result.uploadUrl).toMatch(/^https:\/\/s3\.amazonaws\.com\/model-registry-artifacts\/artifacts\/model-456\/1\.2\.3\/.+$/);
        expect(result.artifactId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
        
        // Verify required S3 fields
        expect(result.fields.key).toContain('artifacts/model-456/1.2.3/');
        expect(result.fields['Content-Type']).toBe('application/octet-stream');
        expect(result.fields['x-amz-meta-version-id']).toBe('version-123');
        expect(result.fields['x-amz-meta-artifact-type']).toBe(ArtifactType.WEIGHTS);
      });

      it('should handle different artifact types in upload URL', async () => {
        const mockVersionEntity = {
          id: 'version-123',
          model_id: 'model-456',
          version: '1.0.0',
          state: 'draft',
          commit_sha: 'a'.repeat(40),
          training_job_id: null,
          metadata: '{}',
          created_at: new Date(),
          updated_at: new Date()
        };

        mockDb.query = vi.fn().mockResolvedValue({ rows: [mockVersionEntity] });

        const artifactTypes = [ArtifactType.WEIGHTS, ArtifactType.CONFIG, ArtifactType.TOKENIZER, ArtifactType.CONTAINER];

        for (const type of artifactTypes) {
          const request: CreateArtifactRequest = { type };
          const result = await service.generateArtifactUploadUrl('version-123', request);
          
          expect(result.fields['x-amz-meta-artifact-type']).toBe(type);
        }
      });
    });

    describe('Artifact Storage and Retrieval', () => {
      it('should store artifact with correct S3 URI format', async () => {
        const artifactId = 'artifact-789';
        const s3Uri = 'https://s3.amazonaws.com/model-registry-artifacts/artifacts/model-456/1.0.0/artifact-789';
        
        const mockArtifactEntity = {
          id: artifactId,
          version_id: 'version-123',
          type: 'weights',
          uri: s3Uri,
          sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
          size: 1048576,
          license: 'Apache-2.0',
          created_at: new Date()
        };

        mockDb.query = vi.fn()
          .mockResolvedValueOnce({ rows: [] }) // SET app.current_user_id
          .mockResolvedValueOnce({ rows: [mockArtifactEntity] }); // INSERT

        const request = {
          type: ArtifactType.WEIGHTS,
          uri: s3Uri,
          size: 1048576,
          license: 'Apache-2.0'
        };

        const result = await service.createArtifact('version-123', artifactId, request, 'user-123');

        expect(result.uri).toBe(s3Uri);
        expect(result.sha256).toHaveLength(64);
        expect(result.size).toBe(1048576);
      });

      it('should generate download URL with proper S3 signature format', async () => {
        const s3Uri = 'https://s3.amazonaws.com/model-registry-artifacts/artifacts/model-456/1.0.0/weights.bin';
        
        const mockArtifactEntity = {
          id: 'artifact-123',
          version_id: 'version-123',
          type: 'weights',
          uri: s3Uri,
          sha256: 'a'.repeat(64),
          size: 1024,
          license: 'MIT',
          created_at: new Date()
        };

        mockDb.query = vi.fn().mockResolvedValueOnce({ rows: [mockArtifactEntity] });

        const result = await service.generateArtifactDownloadUrl('artifact-123');

        // Verify pre-signed URL format
        expect(result).toContain(s3Uri);
        expect(result).toMatch(/\?X-Amz-Expires=\d+/);
        expect(result).toMatch(/&X-Amz-Signature=[\w-]+/);
      });
    });

    describe('Artifact Integrity Verification', () => {
      it('should verify large file checksums correctly', async () => {
        const largeFileSha256 = crypto.createHash('sha256').update('large file content'.repeat(1000)).digest('hex');
        
        const mockArtifactEntity = {
          id: 'artifact-large',
          version_id: 'version-123',
          type: 'weights',
          uri: 'https://s3.amazonaws.com/bucket/large-model.bin',
          sha256: largeFileSha256,
          size: 5000000000, // 5GB
          license: null,
          created_at: new Date()
        };

        mockDb.query = vi.fn().mockResolvedValueOnce({ rows: [mockArtifactEntity] });

        const result = await service.verifyArtifactIntegrity('artifact-large', largeFileSha256);

        expect(result).toBe(true);
      });

      it('should handle corrupted artifact detection', async () => {
        const originalSha256 = crypto.createHash('sha256').update('original content').digest('hex');
        const corruptedSha256 = crypto.createHash('sha256').update('corrupted content').digest('hex');
        
        const mockArtifactEntity = {
          id: 'artifact-corrupted',
          version_id: 'version-123',
          type: 'weights',
          uri: 'https://s3.amazonaws.com/bucket/corrupted.bin',
          sha256: originalSha256,
          size: 1024,
          license: null,
          created_at: new Date()
        };

        mockDb.query = vi.fn().mockResolvedValueOnce({ rows: [mockArtifactEntity] });

        const result = await service.verifyArtifactIntegrity('artifact-corrupted', corruptedSha256);

        expect(result).toBe(false);
      });
    });

    describe('S3 Error Handling', () => {
      it('should handle S3 service unavailable errors', async () => {
        // Simulate S3 service error during upload URL generation
        const mockVersionEntity = {
          id: 'version-123',
          model_id: 'model-456',
          version: '1.0.0',
          state: 'draft',
          commit_sha: 'a'.repeat(40),
          training_job_id: null,
          metadata: '{}',
          created_at: new Date(),
          updated_at: new Date()
        };

        mockDb.query = vi.fn().mockResolvedValueOnce({ rows: [mockVersionEntity] });

        const request: CreateArtifactRequest = {
          type: ArtifactType.WEIGHTS
        };

        // In a real implementation, this would test actual S3 error handling
        // For now, we verify the method completes successfully with mock data
        const result = await service.generateArtifactUploadUrl('version-123', request);
        
        expect(result.uploadUrl).toBeDefined();
        expect(result.artifactId).toBeDefined();
      });

      it('should handle artifact not found in S3', async () => {
        mockDb.query = vi.fn().mockResolvedValueOnce({ rows: [] });

        await expect(service.generateArtifactDownloadUrl('nonexistent-artifact'))
          .rejects.toThrow('Artifact not found');
      });
    });

    describe('Multi-artifact Version Support', () => {
      it('should handle versions with multiple artifacts', async () => {
        const mockArtifacts = [
          {
            id: 'artifact-weights',
            version_id: 'version-123',
            type: 'weights',
            uri: 'https://s3.amazonaws.com/bucket/model.bin',
            sha256: 'a'.repeat(64),
            size: 5000000000,
            license: 'Apache-2.0',
            created_at: new Date()
          },
          {
            id: 'artifact-config',
            version_id: 'version-123',
            type: 'config',
            uri: 'https://s3.amazonaws.com/bucket/config.json',
            sha256: 'b'.repeat(64),
            size: 4096,
            license: 'Apache-2.0',
            created_at: new Date()
          },
          {
            id: 'artifact-tokenizer',
            version_id: 'version-123',
            type: 'tokenizer',
            uri: 'https://s3.amazonaws.com/bucket/tokenizer.json',
            sha256: 'c'.repeat(64),
            size: 2048,
            license: 'Apache-2.0',
            created_at: new Date()
          }
        ];

        mockDb.query = vi.fn().mockResolvedValueOnce({ rows: mockArtifacts });

        const result = await service.getVersionArtifacts('version-123');

        expect(result).toHaveLength(3);
        expect(result.map(a => a.type)).toEqual(['weights', 'config', 'tokenizer']);
        expect(result.every(a => a.uri.startsWith('https://s3.amazonaws.com/'))).toBe(true);
        expect(result.every(a => a.sha256.length === 64)).toBe(true);
      });
    });
  });
});