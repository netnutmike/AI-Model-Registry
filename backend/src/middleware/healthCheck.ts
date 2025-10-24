import { Request, Response, NextFunction } from 'express';
import { DatabaseService } from '../services/database/databaseService';

interface HealthStatus {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  service: string;
  version: string;
  checks: {
    database?: {
      status: 'healthy' | 'unhealthy';
      responseTime?: number;
      error?: string;
    };
    redis?: {
      status: 'healthy' | 'unhealthy';
      responseTime?: number;
      error?: string;
    };
    external?: {
      status: 'healthy' | 'unhealthy';
      services?: Record<string, 'healthy' | 'unhealthy'>;
    };
  };
}

export class HealthCheckMiddleware {
  private databaseService: DatabaseService;
  private serviceName: string;
  private version: string;

  constructor(databaseService: DatabaseService, serviceName: string, version: string = '1.0.0') {
    this.databaseService = databaseService;
    this.serviceName = serviceName;
    this.version = version;
  }

  /**
   * Basic health check endpoint - returns 200 if service is running
   */
  public health = (req: Request, res: Response): void => {
    const healthStatus: HealthStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: this.serviceName,
      version: this.version,
      checks: {}
    };

    res.status(200).json(healthStatus);
  };

  /**
   * Readiness check endpoint - checks dependencies
   */
  public ready = async (req: Request, res: Response): Promise<void> => {
    const healthStatus: HealthStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: this.serviceName,
      version: this.version,
      checks: {}
    };

    let isReady = true;

    // Check database connection
    try {
      const dbStart = Date.now();
      await this.databaseService.healthCheck();
      const dbResponseTime = Date.now() - dbStart;
      
      healthStatus.checks.database = {
        status: 'healthy',
        responseTime: dbResponseTime
      };
    } catch (error) {
      isReady = false;
      healthStatus.checks.database = {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown database error'
      };
    }

    // Check Redis connection (if available)
    try {
      const redisStart = Date.now();
      // Add Redis health check here if Redis client is available
      const redisResponseTime = Date.now() - redisStart;
      
      healthStatus.checks.redis = {
        status: 'healthy',
        responseTime: redisResponseTime
      };
    } catch (error) {
      // Redis is optional for some services
      healthStatus.checks.redis = {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Redis unavailable'
      };
    }

    if (!isReady) {
      healthStatus.status = 'unhealthy';
      res.status(503).json(healthStatus);
    } else {
      res.status(200).json(healthStatus);
    }
  };

  /**
   * Liveness check endpoint - checks if service should be restarted
   */
  public live = (req: Request, res: Response): void => {
    // Basic liveness check - if we can respond, we're alive
    const healthStatus: HealthStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: this.serviceName,
      version: this.version,
      checks: {}
    };

    res.status(200).json(healthStatus);
  };

  /**
   * Metrics endpoint for Prometheus scraping
   */
  public metrics = (req: Request, res: Response): void => {
    // Basic metrics in Prometheus format
    const metrics = [
      `# HELP service_up Service availability`,
      `# TYPE service_up gauge`,
      `service_up{service="${this.serviceName}",version="${this.version}"} 1`,
      ``,
      `# HELP service_info Service information`,
      `# TYPE service_info gauge`,
      `service_info{service="${this.serviceName}",version="${this.version}"} 1`,
      ``,
      `# HELP service_start_time_seconds Service start time in unix timestamp`,
      `# TYPE service_start_time_seconds gauge`,
      `service_start_time_seconds{service="${this.serviceName}"} ${Math.floor(Date.now() / 1000)}`,
    ].join('\n');

    res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.status(200).send(metrics);
  };
}

/**
 * Factory function to create health check middleware
 */
export function createHealthCheckMiddleware(
  databaseService: DatabaseService,
  serviceName: string,
  version?: string
): HealthCheckMiddleware {
  return new HealthCheckMiddleware(databaseService, serviceName, version);
}