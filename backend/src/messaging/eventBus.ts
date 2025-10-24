import Redis from 'redis';
import winston from 'winston';

export interface Event {
  id: string;
  type: string;
  source: string;
  data: any;
  timestamp: Date;
  correlationId?: string;
  userId?: string;
}

export interface EventHandler {
  eventType: string;
  handler: (event: Event) => Promise<void>;
}

export class EventBus {
  private publisher: Redis.RedisClientType;
  private subscriber: Redis.RedisClientType;
  private handlers: Map<string, EventHandler[]>;
  private logger: winston.Logger;
  private isConnected: boolean;

  constructor(redisUrl?: string) {
    const redisConfig = {
      url: redisUrl || process.env.REDIS_URL || 'redis://localhost:6379'
    };

    this.publisher = Redis.createClient(redisConfig);
    this.subscriber = Redis.createClient(redisConfig);
    this.handlers = new Map();
    this.isConnected = false;

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

    this.setupErrorHandlers();
  }

  private setupErrorHandlers(): void {
    this.publisher.on('error', (error) => {
      this.logger.error('Redis publisher error:', error);
    });

    this.subscriber.on('error', (error) => {
      this.logger.error('Redis subscriber error:', error);
    });

    this.publisher.on('connect', () => {
      this.logger.info('Redis publisher connected');
    });

    this.subscriber.on('connect', () => {
      this.logger.info('Redis subscriber connected');
    });
  }

  public async connect(): Promise<void> {
    try {
      await Promise.all([
        this.publisher.connect(),
        this.subscriber.connect()
      ]);

      this.isConnected = true;
      this.logger.info('EventBus connected to Redis');

      // Set up message handling
      this.subscriber.on('message', (channel, message) => {
        this.handleMessage(channel, message);
      });

    } catch (error) {
      this.logger.error('Failed to connect to Redis:', error);
      throw error;
    }
  }

  public async disconnect(): Promise<void> {
    try {
      await Promise.all([
        this.publisher.disconnect(),
        this.subscriber.disconnect()
      ]);

      this.isConnected = false;
      this.logger.info('EventBus disconnected from Redis');
    } catch (error) {
      this.logger.error('Error disconnecting from Redis:', error);
      throw error;
    }
  }

  public async publish(event: Event): Promise<void> {
    if (!this.isConnected) {
      throw new Error('EventBus is not connected');
    }

    try {
      const channel = `events:${event.type}`;
      const message = JSON.stringify(event);

      await this.publisher.publish(channel, message);

      this.logger.debug('Event published', {
        eventId: event.id,
        eventType: event.type,
        source: event.source,
        channel
      });
    } catch (error) {
      this.logger.error('Failed to publish event:', error);
      throw error;
    }
  }

  public async subscribe(eventType: string, handler: (event: Event) => Promise<void>): Promise<void> {
    if (!this.isConnected) {
      throw new Error('EventBus is not connected');
    }

    const channel = `events:${eventType}`;

    // Add handler to our registry
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, []);
    }

    this.handlers.get(eventType)!.push({
      eventType,
      handler
    });

    // Subscribe to the channel
    await this.subscriber.subscribe(channel, (message) => {
      this.handleMessage(channel, message);
    });

    this.logger.info(`Subscribed to event type: ${eventType}`);
  }

  public async unsubscribe(eventType: string): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    const channel = `events:${eventType}`;

    try {
      await this.subscriber.unsubscribe(channel);
      this.handlers.delete(eventType);

      this.logger.info(`Unsubscribed from event type: ${eventType}`);
    } catch (error) {
      this.logger.error(`Failed to unsubscribe from ${eventType}:`, error);
    }
  }

  private async handleMessage(channel: string, message: string): Promise<void> {
    try {
      const event: Event = JSON.parse(message);
      const eventType = event.type;

      this.logger.debug('Event received', {
        eventId: event.id,
        eventType: event.type,
        source: event.source,
        channel
      });

      const handlers = this.handlers.get(eventType);
      if (!handlers || handlers.length === 0) {
        this.logger.warn(`No handlers registered for event type: ${eventType}`);
        return;
      }

      // Execute all handlers for this event type
      const handlerPromises = handlers.map(async ({ handler }) => {
        try {
          await handler(event);
        } catch (error) {
          this.logger.error(`Handler failed for event ${event.id}:`, error);
          // Don't throw here to prevent one handler failure from affecting others
        }
      });

      await Promise.allSettled(handlerPromises);

    } catch (error) {
      this.logger.error('Failed to handle message:', error);
    }
  }

  public createEvent(type: string, source: string, data: any, options?: {
    correlationId?: string;
    userId?: string;
  }): Event {
    return {
      id: this.generateEventId(),
      type,
      source,
      data,
      timestamp: new Date(),
      correlationId: options?.correlationId,
      userId: options?.userId
    };
  }

  private generateEventId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  public isHealthy(): boolean {
    return this.isConnected;
  }

  public getStats(): {
    isConnected: boolean;
    subscribedEventTypes: string[];
    handlerCount: number;
  } {
    return {
      isConnected: this.isConnected,
      subscribedEventTypes: Array.from(this.handlers.keys()),
      handlerCount: Array.from(this.handlers.values()).reduce((total, handlers) => total + handlers.length, 0)
    };
  }
}

// Event type constants
export const EventTypes = {
  // Model Registry Events
  MODEL_CREATED: 'model.created',
  MODEL_UPDATED: 'model.updated',
  VERSION_CREATED: 'version.created',
  VERSION_STATE_CHANGED: 'version.state.changed',
  ARTIFACT_UPLOADED: 'artifact.uploaded',
  MODEL_CARD_GENERATED: 'model_card.generated',

  // Policy Engine Events
  POLICY_CREATED: 'policy.created',
  POLICY_UPDATED: 'policy.updated',
  POLICY_EVALUATED: 'policy.evaluated',
  POLICY_VIOLATION: 'policy.violation',
  APPROVAL_REQUIRED: 'approval.required',
  APPROVAL_GRANTED: 'approval.granted',
  APPROVAL_DENIED: 'approval.denied',

  // Evaluation Events
  EVALUATION_STARTED: 'evaluation.started',
  EVALUATION_COMPLETED: 'evaluation.completed',
  EVALUATION_FAILED: 'evaluation.failed',
  THRESHOLD_VIOLATED: 'threshold.violated',

  // Deployment Events
  DEPLOYMENT_STARTED: 'deployment.started',
  DEPLOYMENT_COMPLETED: 'deployment.completed',
  DEPLOYMENT_FAILED: 'deployment.failed',
  ROLLBACK_INITIATED: 'rollback.initiated',
  ROLLBACK_COMPLETED: 'rollback.completed',
  SLO_VIOLATION: 'slo.violation',

  // Audit Events
  AUDIT_LOG_CREATED: 'audit_log.created',
  EVIDENCE_BUNDLE_GENERATED: 'evidence_bundle.generated',
  GDPR_REQUEST_PROCESSED: 'gdpr_request.processed',

  // System Events
  SERVICE_STARTED: 'service.started',
  SERVICE_STOPPED: 'service.stopped',
  HEALTH_CHECK_FAILED: 'health_check.failed'
} as const;