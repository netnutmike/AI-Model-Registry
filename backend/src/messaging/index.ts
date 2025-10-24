import { EventBus, EventTypes, Event } from './eventBus.js';
import { ServiceClient, ServiceClientFactory, ServiceClientConfig } from './serviceClient.js';
import { ServiceAuthManager, authenticateService, requireServicePermission } from './serviceAuth.js';
import winston from 'winston';

export interface MessagingConfig {
  redis: {
    url: string;
  };
  services: Record<string, {
    baseURL: string;
    timeout: number;
    retries: number;
    retryDelay: number;
    circuitBreaker: {
      failureThreshold: number;
      resetTimeout: number;
    };
  }>;
}

export class MessagingManager {
  private eventBus: EventBus;
  private authManager: ServiceAuthManager;
  private logger: winston.Logger;
  private isInitialized: boolean;

  constructor(private config: MessagingConfig) {
    this.eventBus = new EventBus(config.redis.url);
    this.authManager = new ServiceAuthManager();
    this.isInitialized = false;

    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        })
      ]
    });
  }

  public async initialize(): Promise<void> {
    try {
      // Connect to event bus
      await this.eventBus.connect();

      // Initialize service clients
      this.initializeServiceClients();

      // Set up event handlers
      this.setupEventHandlers();

      this.isInitialized = true;
      this.logger.info('MessagingManager initialized successfully');

    } catch (error) {
      this.logger.error('Failed to initialize MessagingManager:', error);
      throw error;
    }
  }

  private initializeServiceClients(): void {
    for (const [serviceName, serviceConfig] of Object.entries(this.config.services)) {
      const token = this.authManager.generateServiceToken(serviceName);
      
      const clientConfig: ServiceClientConfig = {
        ...serviceConfig,
        authentication: {
          type: 'jwt',
          token: token || undefined
        }
      };

      ServiceClientFactory.createClient(serviceName, clientConfig);
      this.logger.info(`Initialized service client: ${serviceName}`);
    }
  }

  private setupEventHandlers(): void {
    // Set up cross-service event handlers

    // Model Registry Events
    this.eventBus.subscribe(EventTypes.MODEL_CREATED, async (event) => {
      await this.handleModelCreated(event);
    });

    this.eventBus.subscribe(EventTypes.VERSION_CREATED, async (event) => {
      await this.handleVersionCreated(event);
    });

    this.eventBus.subscribe(EventTypes.VERSION_STATE_CHANGED, async (event) => {
      await this.handleVersionStateChanged(event);
    });

    // Policy Engine Events
    this.eventBus.subscribe(EventTypes.POLICY_VIOLATION, async (event) => {
      await this.handlePolicyViolation(event);
    });

    this.eventBus.subscribe(EventTypes.APPROVAL_REQUIRED, async (event) => {
      await this.handleApprovalRequired(event);
    });

    // Evaluation Events
    this.eventBus.subscribe(EventTypes.EVALUATION_COMPLETED, async (event) => {
      await this.handleEvaluationCompleted(event);
    });

    this.eventBus.subscribe(EventTypes.THRESHOLD_VIOLATED, async (event) => {
      await this.handleThresholdViolated(event);
    });

    // Deployment Events
    this.eventBus.subscribe(EventTypes.DEPLOYMENT_FAILED, async (event) => {
      await this.handleDeploymentFailed(event);
    });

    this.eventBus.subscribe(EventTypes.SLO_VIOLATION, async (event) => {
      await this.handleSLOViolation(event);
    });

    this.logger.info('Event handlers configured');
  }

  // Event Handlers
  private async handleModelCreated(event: Event): Promise<void> {
    try {
      this.logger.info('Handling model created event', { modelId: event.data.modelId });

      // Notify audit service
      const auditClient = ServiceClientFactory.getClient('audit');
      if (auditClient) {
        await auditClient.post('/events/model-created', {
          modelId: event.data.modelId,
          userId: event.userId,
          timestamp: event.timestamp
        });
      }

      // Trigger initial policy evaluation
      const policyClient = ServiceClientFactory.getClient('policy-engine');
      if (policyClient) {
        await policyClient.post('/evaluate/model', {
          modelId: event.data.modelId,
          trigger: 'model_created'
        });
      }

    } catch (error) {
      this.logger.error('Failed to handle model created event:', error);
    }
  }

  private async handleVersionCreated(event: Event): Promise<void> {
    try {
      this.logger.info('Handling version created event', { 
        modelId: event.data.modelId,
        versionId: event.data.versionId 
      });

      // Trigger evaluation suite
      const evaluationClient = ServiceClientFactory.getClient('evaluation');
      if (evaluationClient) {
        await evaluationClient.post('/run/auto', {
          versionId: event.data.versionId,
          trigger: 'version_created'
        });
      }

      // Log to audit
      const auditClient = ServiceClientFactory.getClient('audit');
      if (auditClient) {
        await auditClient.post('/events/version-created', {
          modelId: event.data.modelId,
          versionId: event.data.versionId,
          userId: event.userId,
          timestamp: event.timestamp
        });
      }

    } catch (error) {
      this.logger.error('Failed to handle version created event:', error);
    }
  }

  private async handleVersionStateChanged(event: Event): Promise<void> {
    try {
      this.logger.info('Handling version state changed event', {
        versionId: event.data.versionId,
        oldState: event.data.oldState,
        newState: event.data.newState
      });

      // If moving to production, trigger deployment preparation
      if (event.data.newState === 'approved_prod') {
        const deploymentClient = ServiceClientFactory.getClient('deployment');
        if (deploymentClient) {
          await deploymentClient.post('/prepare', {
            versionId: event.data.versionId
          });
        }
      }

      // Log state change to audit
      const auditClient = ServiceClientFactory.getClient('audit');
      if (auditClient) {
        await auditClient.post('/events/state-changed', {
          versionId: event.data.versionId,
          oldState: event.data.oldState,
          newState: event.data.newState,
          userId: event.userId,
          timestamp: event.timestamp
        });
      }

    } catch (error) {
      this.logger.error('Failed to handle version state changed event:', error);
    }
  }

  private async handlePolicyViolation(event: Event): Promise<void> {
    try {
      this.logger.warn('Handling policy violation event', {
        policyId: event.data.policyId,
        resourceId: event.data.resourceId
      });

      // Block the resource if needed
      const policyClient = ServiceClientFactory.getClient('policy-engine');
      if (policyClient && event.data.blockingViolation) {
        await policyClient.post('/block', {
          resourceId: event.data.resourceId,
          reason: event.data.violationReason
        });
      }

      // Send notification (this would integrate with notification service)
      // For now, just log
      this.logger.error('Policy violation detected', {
        policy: event.data.policyName,
        resource: event.data.resourceId,
        violation: event.data.violationReason
      });

    } catch (error) {
      this.logger.error('Failed to handle policy violation event:', error);
    }
  }

  private async handleApprovalRequired(event: Event): Promise<void> {
    try {
      this.logger.info('Handling approval required event', {
        resourceId: event.data.resourceId,
        approvalType: event.data.approvalType
      });

      // Send notification to approvers (would integrate with notification service)
      this.logger.info('Approval required notification sent', {
        approvers: event.data.approvers,
        resource: event.data.resourceId
      });

    } catch (error) {
      this.logger.error('Failed to handle approval required event:', error);
    }
  }

  private async handleEvaluationCompleted(event: Event): Promise<void> {
    try {
      this.logger.info('Handling evaluation completed event', {
        evaluationId: event.data.evaluationId,
        passed: event.data.passed
      });

      // If evaluation failed, block progression
      if (!event.data.passed) {
        const policyClient = ServiceClientFactory.getClient('policy-engine');
        if (policyClient) {
          await policyClient.post('/block', {
            resourceId: event.data.versionId,
            reason: 'Evaluation thresholds not met'
          });
        }
      }

      // Update model registry with evaluation results
      const modelClient = ServiceClientFactory.getClient('model-registry');
      if (modelClient) {
        await modelClient.post(`/versions/${event.data.versionId}/evaluations`, {
          evaluationId: event.data.evaluationId,
          results: event.data.results,
          passed: event.data.passed
        });
      }

    } catch (error) {
      this.logger.error('Failed to handle evaluation completed event:', error);
    }
  }

  private async handleThresholdViolated(event: Event): Promise<void> {
    try {
      this.logger.warn('Handling threshold violated event', {
        metric: event.data.metric,
        threshold: event.data.threshold,
        actualValue: event.data.actualValue
      });

      // Block progression
      const policyClient = ServiceClientFactory.getClient('policy-engine');
      if (policyClient) {
        await policyClient.post('/block', {
          resourceId: event.data.resourceId,
          reason: `Threshold violated: ${event.data.metric}`
        });
      }

    } catch (error) {
      this.logger.error('Failed to handle threshold violated event:', error);
    }
  }

  private async handleDeploymentFailed(event: Event): Promise<void> {
    try {
      this.logger.error('Handling deployment failed event', {
        deploymentId: event.data.deploymentId,
        error: event.data.error
      });

      // Trigger rollback if needed
      const deploymentClient = ServiceClientFactory.getClient('deployment');
      if (deploymentClient && event.data.autoRollback) {
        await deploymentClient.post(`/deployments/${event.data.deploymentId}/rollback`, {
          reason: 'Automatic rollback due to deployment failure'
        });
      }

    } catch (error) {
      this.logger.error('Failed to handle deployment failed event:', error);
    }
  }

  private async handleSLOViolation(event: Event): Promise<void> {
    try {
      this.logger.warn('Handling SLO violation event', {
        deploymentId: event.data.deploymentId,
        slo: event.data.slo,
        actualValue: event.data.actualValue
      });

      // Trigger rollback if SLO violation is severe
      if (event.data.severity === 'critical') {
        const deploymentClient = ServiceClientFactory.getClient('deployment');
        if (deploymentClient) {
          await deploymentClient.post(`/deployments/${event.data.deploymentId}/rollback`, {
            reason: 'Automatic rollback due to critical SLO violation'
          });
        }
      }

    } catch (error) {
      this.logger.error('Failed to handle SLO violation event:', error);
    }
  }

  // Public API
  public async publishEvent(event: Event): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('MessagingManager not initialized');
    }
    
    await this.eventBus.publish(event);
  }

  public createEvent(type: string, source: string, data: any, options?: {
    correlationId?: string;
    userId?: string;
  }): Event {
    return this.eventBus.createEvent(type, source, data, options);
  }

  public getServiceClient(serviceName: string): ServiceClient | undefined {
    return ServiceClientFactory.getClient(serviceName);
  }

  public getAuthManager(): ServiceAuthManager {
    return this.authManager;
  }

  public getEventBus(): EventBus {
    return this.eventBus;
  }

  public async shutdown(): Promise<void> {
    try {
      await this.eventBus.disconnect();
      this.isInitialized = false;
      this.logger.info('MessagingManager shut down successfully');
    } catch (error) {
      this.logger.error('Error during MessagingManager shutdown:', error);
      throw error;
    }
  }

  public getHealthStatus(): {
    eventBus: boolean;
    serviceClients: Record<string, boolean>;
    isInitialized: boolean;
  } {
    return {
      eventBus: this.eventBus.isHealthy(),
      serviceClients: ServiceClientFactory.getHealthStatus(),
      isInitialized: this.isInitialized
    };
  }
}

// Export everything
export {
  EventBus,
  EventTypes,
  Event,
  ServiceClient,
  ServiceClientFactory,
  ServiceAuthManager,
  authenticateService,
  requireServicePermission
};