import crypto from 'crypto';
import { WebhookPayload, CicdProvider } from './types';
import { AuditService } from '../audit/auditService';

export class WebhookService {
  private auditService: AuditService;

  constructor(auditService: AuditService) {
    this.auditService = auditService;
  }

  /**
   * Verify webhook signature for security
   */
  verifyWebhookSignature(
    payload: string,
    signature: string,
    secret: string,
    provider: 'github' | 'gitlab' | 'bitbucket'
  ): boolean {
    try {
      let expectedSignature: string;
      
      switch (provider) {
        case 'github':
          expectedSignature = 'sha256=' + crypto
            .createHmac('sha256', secret)
            .update(payload)
            .digest('hex');
          break;
        case 'gitlab':
          expectedSignature = crypto
            .createHmac('sha256', secret)
            .update(payload)
            .digest('hex');
          break;
        case 'bitbucket':
          expectedSignature = 'sha256=' + crypto
            .createHmac('sha256', secret)
            .update(payload)
            .digest('hex');
          break;
        default:
          return false;
      }

      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    } catch (error) {
      console.error('Webhook signature verification failed:', error);
      return false;
    }
  }

  /**
   * Parse webhook payload based on provider
   */
  parseWebhookPayload(rawPayload: any, provider: 'github' | 'gitlab' | 'bitbucket'): WebhookPayload | null {
    try {
      switch (provider) {
        case 'github':
          return this.parseGitHubPayload(rawPayload);
        case 'gitlab':
          return this.parseGitLabPayload(rawPayload);
        case 'bitbucket':
          return this.parseBitbucketPayload(rawPayload);
        default:
          return null;
      }
    } catch (error) {
      console.error('Failed to parse webhook payload:', error);
      return null;
    }
  }

  private parseGitHubPayload(payload: any): WebhookPayload {
    const event = payload.action ? `${payload.action}` : 'push';
    
    return {
      id: payload.delivery || payload.id || Date.now().toString(),
      event,
      repository: {
        name: payload.repository.name,
        fullName: payload.repository.full_name,
        url: payload.repository.html_url
      },
      commit: payload.head_commit ? {
        sha: payload.head_commit.id,
        message: payload.head_commit.message,
        author: {
          name: payload.head_commit.author.name,
          email: payload.head_commit.author.email
        },
        timestamp: payload.head_commit.timestamp
      } : undefined,
      pullRequest: payload.pull_request ? {
        id: payload.pull_request.number,
        title: payload.pull_request.title,
        state: payload.pull_request.state,
        sourceBranch: payload.pull_request.head.ref,
        targetBranch: payload.pull_request.base.ref,
        url: payload.pull_request.html_url
      } : undefined,
      provider: 'github'
    };
  }

  private parseGitLabPayload(payload: any): WebhookPayload {
    return {
      id: payload.checkout_sha || payload.object_attributes?.id || Date.now().toString(),
      event: payload.object_kind || 'push',
      repository: {
        name: payload.project.name,
        fullName: payload.project.path_with_namespace,
        url: payload.project.web_url
      },
      commit: payload.commits?.[0] ? {
        sha: payload.commits[0].id,
        message: payload.commits[0].message,
        author: {
          name: payload.commits[0].author.name,
          email: payload.commits[0].author.email
        },
        timestamp: payload.commits[0].timestamp
      } : undefined,
      pullRequest: payload.object_attributes?.source_branch ? {
        id: payload.object_attributes.iid,
        title: payload.object_attributes.title,
        state: payload.object_attributes.state,
        sourceBranch: payload.object_attributes.source_branch,
        targetBranch: payload.object_attributes.target_branch,
        url: payload.object_attributes.url
      } : undefined,
      provider: 'gitlab'
    };
  }

  private parseBitbucketPayload(payload: any): WebhookPayload {
    return {
      id: payload.uuid || Date.now().toString(),
      event: 'push',
      repository: {
        name: payload.repository.name,
        fullName: payload.repository.full_name,
        url: payload.repository.links.html.href
      },
      commit: payload.push?.changes?.[0]?.new ? {
        sha: payload.push.changes[0].new.target.hash,
        message: payload.push.changes[0].new.target.message,
        author: {
          name: payload.push.changes[0].new.target.author.user.display_name,
          email: payload.push.changes[0].new.target.author.user.email || ''
        },
        timestamp: payload.push.changes[0].new.target.date
      } : undefined,
      pullRequest: payload.pullrequest ? {
        id: payload.pullrequest.id,
        title: payload.pullrequest.title,
        state: payload.pullrequest.state,
        sourceBranch: payload.pullrequest.source.branch.name,
        targetBranch: payload.pullrequest.destination.branch.name,
        url: payload.pullrequest.links.html.href
      } : undefined,
      provider: 'bitbucket'
    };
  }

  /**
   * Process webhook event
   */
  async processWebhook(payload: WebhookPayload): Promise<void> {
    // Log webhook event for audit
    await this.auditService.logEvent({
      eventType: 'webhook_received',
      userId: 'system',
      resourceType: 'cicd',
      resourceId: payload.repository.fullName,
      details: {
        provider: payload.provider,
        event: payload.event,
        repository: payload.repository.name,
        commitSha: payload.commit?.sha
      }
    });

    // Handle different event types
    switch (payload.event) {
      case 'push':
        await this.handlePushEvent(payload);
        break;
      case 'opened':
      case 'synchronize':
        await this.handlePullRequestEvent(payload);
        break;
      default:
        console.log(`Unhandled webhook event: ${payload.event}`);
    }
  }

  private async handlePushEvent(payload: WebhookPayload): Promise<void> {
    if (!payload.commit) return;

    // Check if commit is related to a model
    const modelInfo = await this.extractModelInfoFromCommit(payload.commit.message);
    
    if (modelInfo) {
      // Trigger policy validation for the model
      console.log(`Triggering validation for model ${modelInfo.modelId} from commit ${payload.commit.sha}`);
    }
  }

  private async handlePullRequestEvent(payload: WebhookPayload): Promise<void> {
    if (!payload.pullRequest) return;

    console.log(`Processing PR ${payload.pullRequest.id}: ${payload.pullRequest.title}`);
    
    // Check if PR contains model changes and trigger validation
    // This would integrate with the policy engine to run checks
  }

  private async extractModelInfoFromCommit(message: string): Promise<{ modelId: string; versionId?: string } | null> {
    // Parse commit message for model references
    // Example: "feat: update model my-group/my-model v1.2.3"
    const modelRegex = /model\s+([a-zA-Z0-9-_]+\/[a-zA-Z0-9-_]+)(?:\s+v?(\d+\.\d+\.\d+))?/i;
    const match = message.match(modelRegex);
    
    if (match) {
      return {
        modelId: match[1],
        versionId: match[2]
      };
    }
    
    return null;
  }
}