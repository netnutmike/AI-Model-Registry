import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CommitTrackingService } from '../../services/cicd/commitTrackingService';
import { DatabaseService } from '../../services/database/databaseService';

describe('CommitTrackingService', () => {
  let commitTrackingService: CommitTrackingService;
  let mockDb: DatabaseService;

  beforeEach(() => {
    mockDb = {
      query: vi.fn()
    } as any;

    commitTrackingService = new CommitTrackingService(mockDb);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('trackCommit', () => {
    it('should store commit information correctly', async () => {
      const commitInfo = {
        sha: 'abc123def456',
        message: 'feat: update model my-group/my-model v1.2.3',
        author: 'Test User',
        email: 'test@example.com',
        timestamp: new Date('2023-01-01T00:00:00Z'),
        repository: 'user/test-repo',
        branch: 'main',
        modelId: 'my-group/my-model',
        versionId: '1.2.3'
      };

      await commitTrackingService.trackCommit(commitInfo);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO commit_tracking'),
        [
          'abc123def456',
          'feat: update model my-group/my-model v1.2.3',
          'Test User',
          'test@example.com',
          commitInfo.timestamp,
          'user/test-repo',
          'main',
          'my-group/my-model',
          '1.2.3'
        ]
      );
    });
  });

  describe('getCommitHistory', () => {
    it('should retrieve commit history for a model', async () => {
      const mockRows = [
        {
          sha: 'abc123',
          message: 'feat: update model',
          author: 'Test User',
          email: 'test@example.com',
          timestamp: new Date('2023-01-01T00:00:00Z'),
          repository: 'user/test-repo',
          branch: 'main',
          model_id: 'my-group/my-model',
          version_id: '1.2.3'
        }
      ];

      mockDb.query = vi.fn().mockResolvedValue({ rows: mockRows });

      const result = await commitTrackingService.getCommitHistory('my-group/my-model');

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT sha, message, author'),
        ['my-group/my-model']
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        sha: 'abc123',
        message: 'feat: update model',
        author: 'Test User',
        modelId: 'my-group/my-model',
        versionId: '1.2.3'
      });
    });

    it('should retrieve commit history for a specific version', async () => {
      mockDb.query = vi.fn().mockResolvedValue({ rows: [] });

      await commitTrackingService.getCommitHistory('my-group/my-model', '1.2.3');

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('AND version_id = $2'),
        ['my-group/my-model', '1.2.3']
      );
    });
  });

  describe('validateCommitSha', () => {
    it('should validate SHA-1 commit hashes', () => {
      const sha1 = 'a1b2c3d4e5f6789012345678901234567890abcd';
      expect(commitTrackingService.validateCommitSha(sha1)).toBe(true);
    });

    it('should validate SHA-256 commit hashes', () => {
      const sha256 = 'a1b2c3d4e5f6789012345678901234567890abcdef1234567890123456789012';
      expect(commitTrackingService.validateCommitSha(sha256)).toBe(true);
    });

    it('should reject invalid commit hashes', () => {
      expect(commitTrackingService.validateCommitSha('invalid')).toBe(false);
      expect(commitTrackingService.validateCommitSha('abc123')).toBe(false);
      expect(commitTrackingService.validateCommitSha('')).toBe(false);
    });
  });

  describe('extractModelFromCommitMessage', () => {
    it('should extract model information from commit messages', () => {
      const testCases = [
        {
          message: 'feat: update model my-group/my-model v1.2.3',
          expected: { modelId: 'my-group/my-model', version: '1.2.3' }
        },
        {
          message: 'model: my-group/my-model',
          expected: { modelId: 'my-group/my-model' }
        },
        {
          message: '[model] my-group/my-model: add new features',
          expected: { modelId: 'my-group/my-model' }
        },
        {
          message: 'my-group/my-model: fix bug',
          expected: { modelId: 'my-group/my-model' }
        },
        {
          message: 'regular commit message',
          expected: {}
        }
      ];

      testCases.forEach(({ message, expected }) => {
        const result = commitTrackingService.extractModelFromCommitMessage(message);
        expect(result).toEqual(expected);
      });
    });
  });

  describe('linkCommitToModel', () => {
    it('should link existing commit to a model version', async () => {
      await commitTrackingService.linkCommitToModel('abc123', 'my-group/my-model', '1.2.3');

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE commit_tracking'),
        ['abc123', 'my-group/my-model', '1.2.3']
      );
    });
  });

  describe('getCommitBySha', () => {
    it('should retrieve commit by SHA', async () => {
      const mockRow = {
        sha: 'abc123',
        message: 'feat: update model',
        author: 'Test User',
        email: 'test@example.com',
        timestamp: new Date('2023-01-01T00:00:00Z'),
        repository: 'user/test-repo',
        branch: 'main',
        model_id: 'my-group/my-model',
        version_id: '1.2.3'
      };

      mockDb.query = vi.fn().mockResolvedValue({ rows: [mockRow] });

      const result = await commitTrackingService.getCommitBySha('abc123');

      expect(result).toMatchObject({
        sha: 'abc123',
        message: 'feat: update model',
        modelId: 'my-group/my-model',
        versionId: '1.2.3'
      });
    });

    it('should return null for non-existent commit', async () => {
      mockDb.query = vi.fn().mockResolvedValue({ rows: [] });

      const result = await commitTrackingService.getCommitBySha('nonexistent');

      expect(result).toBeNull();
    });
  });
});