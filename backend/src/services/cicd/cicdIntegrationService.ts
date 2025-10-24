import { DatabaseService } from '../database/databaseService';
import { WebhookService } from './webhookService';
import { CommitTrackingService } from './commitTrackingService';
import { PipelineValidationService } from './pipelineValidationService';
import { CicdProvider, WebhookPayload } from './types';

export class CicdIntegrationService {
  private db: DatabaseService;
  private webhookService: WebhookService;
  private commitTrackingService: CommitTrackingService;
  private pipelineValidationService: PipelineValidationService;

  constructor(
    db: DatabaseService,
    webhookService: WebhookService,
    commitTrackingService: CommitTrackingService,
    pipelineValidationService: PipelineValidationService
  ) {
    this.db = db;
    this.webhookService = webhookService;
    this.commitTrackingService = commitTrackingService;
    this.pipelineValidationService = pipelineValidationService;
  }

  /**
   * Register a CI/CD provider
   */
  async registerProvider(provider: CicdProvider): Promise<void> {
    const query = `
      INSERT INTO cicd_providers (name, type, config, created_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (name) DO UPDATE SET
        type = EXCLUDED.type,
        config = EXCLUDED.config,
        updated_at = NOW()
    `;

    await this.db.query(query, [
      provider.name,
      provider.type,
      JSON.stringify(provider.config)
    ]);
  }

  /**
   * Get CI/CD provider configuration
   */
  async getProvider(name: string): Promise<CicdProvider | null> {
    const query = `
      SELECT name, type, config
      FROM cicd_providers
      WHERE name = $1
    `;

    const result = await this.db.query(query, [name]);
    
    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      name: row.name,
      type: row.type,
      config: JSON.parse(row.config)
    };
  }

  /**
   * Handle incoming webhook
   */
  async handleWebhook(
    providerName: string,
    signature: string,
    payload: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      // Get provider configuration
      const provider = await this.getProvider(providerName);
      if (!provider) {
        return { success: false, message: 'Provider not found' };
      }

      // Verify webhook signature
      const isValid = this.webhookService.verifyWebhookSignature(
        payload,
        signature,
        provider.config.webhookSecret,
        provider.type
      );

      if (!isValid) {
        return { success: false, message: 'Invalid webhook signature' };
      }

      // Parse webhook payload
      const webhookPayload = this.webhookService.parseWebhookPayload(
        JSON.parse(payload),
        provider.type
      );

      if (!webhookPayload) {
        return { success: false, message: 'Failed to parse webhook payload' };
      }

      // Process webhook
      await this.webhookService.processWebhook(webhookPayload);

      // Track commit if present
      if (webhookPayload.commit) {
        const modelInfo = this.commitTrackingService.extractModelFromCommitMessage(
          webhookPayload.commit.message
        );

        await this.commitTrackingService.trackCommit({
          sha: webhookPayload.commit.sha,
          message: webhookPayload.commit.message,
          author: webhookPayload.commit.author.name,
          email: webhookPayload.commit.author.email,
          timestamp: new Date(webhookPayload.commit.timestamp),
          repository: webhookPayload.repository.fullName,
          branch: 'main', // Default, could be extracted from payload
          modelId: modelInfo.modelId,
          versionId: modelInfo.version
        });

        // Trigger pipeline validation if model is identified
        if (modelInfo.modelId && modelInfo.version) {
          await this.triggerPipelineValidation(
            webhookPayload.commit.sha,
            modelInfo.modelId,
            modelInfo.version
          );
        }
      }

      return { success: true, message: 'Webhook processed successfully' };

    } catch (error) {
      console.error('Webhook processing error:', error);
      return { success: false, message: `Processing error: ${error.message}` };
    }
  }

  /**
   * Trigger pipeline validation
   */
  async triggerPipelineValidation(
    commitSha: string,
    modelId: string,
    versionId: string
  ): Promise<string> {
    const validation = await this.pipelineValidationService.validateInPipeline(
      commitSha,
      modelId,
      versionId
    );

    return validation.id;
  }

  /**
   * Get status check for external CI/CD system
   */
  async getStatusCheck(validationId: string): Promise<any> {
    const validation = await this.pipelineValidationService.getPipelineValidation(validationId);
    
    if (!validation) {
      return {
        state: 'error',
        description: 'Validation not found'
      };
    }

    return this.pipelineValidationService.generateStatusCheck(validation);
  }

  /**
   * Create webhook URL for a provider
   */
  generateWebhookUrl(baseUrl: string, providerName: string): string {
    return `${baseUrl}/api/v1/cicd/webhooks/${providerName}`;
  }

  /**
   * Get integration status for a repository
   */
  async getRepositoryIntegrationStatus(repositoryUrl: string): Promise<{
    connected: boolean;
    lastWebhook?: Date;
    recentValidations: number;
  }> {
    // Check for recent webhook activity
    const webhookQuery = `
      SELECT MAX(created_at) as last_webhook
      FROM commit_tracking
      WHERE repository = $1
    `;
    const webhookResult = await this.db.query(webhookQuery, [repositoryUrl]);

    // Count recent validations
    const validationQuery = `
      SELECT COUNT(*) as validation_count
      FROM pipeline_validations pv
      JOIN commit_tracking ct ON pv.commit_sha = ct.sha
      WHERE ct.repository = $1
        AND pv.created_at > NOW() - INTERVAL '30 days'
    `;
    const validationResult = await this.db.query(validationQuery, [repositoryUrl]);

    return {
      connected: webhookResult.rows[0].last_webhook !== null,
      lastWebhook: webhookResult.rows[0].last_webhook,
      recentValidations: parseInt(validationResult.rows[0].validation_count)
    };
  }

  /**
   * List all configured providers
   */
  async listProviders(): Promise<Omit<CicdProvider, 'config'>[]> {
    const query = `
      SELECT name, type
      FROM cicd_providers
      ORDER BY name
    `;

    const result = await this.db.query(query);
    
    return result.rows.map(row => ({
      name: row.name,
      type: row.type,
      config: { baseUrl: '', token: '', webhookSecret: '' } // Don't expose sensitive config
    }));
  }

  /**
   * Remove a provider
   */
  async removeProvider(name: string): Promise<void> {
    const query = `DELETE FROM cicd_providers WHERE name = $1`;
    await this.db.query(query, [name]);
  }
}