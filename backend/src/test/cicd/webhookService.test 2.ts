import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebhookService } from '../../services/cicd/webhookService';
import { AuditService } from '../../services/audit/auditService';
import { DatabaseService } from '../../services/database/databaseService';

describe('WebhookService', () => {
  let webhookService: WebhookService;
  let mockAuditService: AuditService;
  let mockDb: DatabaseService;

  beforeEach(() => {
    mockDb = {
      query: vi.fn()
    } as any;

    mockAuditService = {
      logEvent: vi.fn()
    } as any;

    webhookService = new WebhookService(mockAuditService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('verifyWebhookSignature', () => {
    it('should verify GitHub webhook signature correctly', () => {
      const payload = '{"test": "data"}';
      const secret = 'test-secret';
      // Calculate the actual expected signature
      const crypto = require('crypto');
      const expectedSignature = 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');

      const result = webhookService.verifyWebhookSignature(payload, expectedSignature, secret, 'github');
      expect(result).toBe(true);
    });

    it('should reject invalid GitHub webhook signature', () => {
      const payload = '{"test": "data"}';
      const secret = 'test-secret';
      const signature = 'sha256=invalid-signature';

      const result = webhookService.verifyWebhookSignature(payload, signature, secret, 'github');
      expect(result).toBe(false);
    });

    it('should verify GitLab webhook signature correctly', () => {
      const payload = '{"test": "data"}';
      const secret = 'test-secret';
      // Calculate the actual expected signature for GitLab
      const crypto = require('crypto');
      const expectedSignature = crypto.createHmac('sha256', secret).update(payload).digest('hex');

      const result = webhookService.verifyWebhookSignature(payload, expectedSignature, secret, 'gitlab');
      expect(result).toBe(true);
    });
  });

  describe('parseWebhookPayload', () => {
    it('should parse GitHub push payload correctly', () => {
      const githubPayload = {
        repository: {
          name: 'test-repo',
          full_name: 'user/test-repo',
          html_url: 'https://github.com/user/test-repo'
        },
        head_commit: {
          id: 'abc123',
          message: 'feat: update model my-group/my-model v1.2.3',
          author: {
            name: 'Test User',
            email: 'test@example.com'
          },
          timestamp: '2023-01-01T00:00:00Z'
        }
      };

      const result = webhookService.parseWebhookPayload(githubPayload, 'github');

      expect(result).toMatchObject({
        provider: 'github',
        repository: {
          name: 'test-repo',
          fullName: 'user/test-repo',
          url: 'https://github.com/user/test-repo'
        },
        commit: {
          sha: 'abc123',
          message: 'feat: update model my-group/my-model v1.2.3',
          author: {
            name: 'Test User',
            email: 'test@example.com'
          }
        }
      });
    });

    it('should parse GitHub pull request payload correctly', () => {
      const githubPayload = {
        action: 'opened',
        repository: {
          name: 'test-repo',
          full_name: 'user/test-repo',
          html_url: 'https://github.com/user/test-repo'
        },
        pull_request: {
          number: 123,
          title: 'Add new model',
          state: 'open',
          head: { ref: 'feature-branch' },
          base: { ref: 'main' },
          html_url: 'https://github.com/user/test-repo/pull/123'
        }
      };

      const result = webhookService.parseWebhookPayload(githubPayload, 'github');

      expect(result).toMatchObject({
        event: 'opened',
        provider: 'github',
        pullRequest: {
          id: 123,
          title: 'Add new model',
          state: 'open',
          sourceBranch: 'feature-branch',
          targetBranch: 'main'
        }
      });
    });

    it('should parse GitLab push payload correctly', () => {
      const gitlabPayload = {
        object_kind: 'push',
        project: {
          name: 'test-repo',
          path_with_namespace: 'user/test-repo',
          web_url: 'https://gitlab.com/user/test-repo'
        },
        commits: [{
          id: 'abc123',
          message: 'feat: update model my-group/my-model v1.2.3',
          author: {
            name: 'Test User',
            email: 'test@example.com'
          },
          timestamp: '2023-01-01T00:00:00Z'
        }]
      };

      const result = webhookService.parseWebhookPayload(gitlabPayload, 'gitlab');

      expect(result).toMatchObject({
        event: 'push',
        provider: 'gitlab',
        repository: {
          name: 'test-repo',
          fullName: 'user/test-repo',
          url: 'https://gitlab.com/user/test-repo'
        },
        commit: {
          sha: 'abc123',
          message: 'feat: update model my-group/my-model v1.2.3'
        }
      });
    });
  });

  describe('processWebhook', () => {
    it('should process webhook and log audit event', async () => {
      const payload = {
        id: 'test-id',
        event: 'push',
        repository: {
          name: 'test-repo',
          fullName: 'user/test-repo',
          url: 'https://github.com/user/test-repo'
        },
        commit: {
          sha: 'abc123',
          message: 'feat: update model my-group/my-model v1.2.3',
          author: { name: 'Test User', email: 'test@example.com' },
          timestamp: '2023-01-01T00:00:00Z'
        },
        provider: 'github' as const
      };

      await webhookService.processWebhook(payload);

      expect(mockAuditService.logEvent).toHaveBeenCalledWith({
        eventType: 'webhook_received',
        userId: 'system',
        resourceType: 'cicd',
        resourceId: 'user/test-repo',
        details: {
          provider: 'github',
          event: 'push',
          repository: 'test-repo',
          commitSha: 'abc123'
        }
      });
    });
  });
});