import axios from 'axios';
import winston from 'winston';

export interface ServiceInstance {
  name: string;
  url: string;
  healthCheckUrl: string;
  timeout: number;
  isHealthy: boolean;
  lastHealthCheck: Date;
  consecutiveFailures: number;
}

export interface Service {
  name: string;
  instances: ServiceInstance[];
  isHealthy: boolean;
  lastHealthCheck: Date;
}

export class ServiceRegistry {
  private services: Map<string, Service>;
  private healthCheckInterval: NodeJS.Timeout | null;
  private logger: winston.Logger;
  private readonly HEALTH_CHECK_INTERVAL = 30000; // 30 seconds
  private readonly MAX_CONSECUTIVE_FAILURES = 3;

  constructor() {
    this.services = new Map();
    this.healthCheckInterval = null;
    
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

  public registerService(instance: Omit<ServiceInstance, 'isHealthy' | 'lastHealthCheck' | 'consecutiveFailures'>): void {
    const serviceName = instance.name;
    
    if (!this.services.has(serviceName)) {
      this.services.set(serviceName, {
        name: serviceName,
        instances: [],
        isHealthy: false,
        lastHealthCheck: new Date()
      });
    }

    const service = this.services.get(serviceName)!;
    
    // Check if instance already exists
    const existingInstance = service.instances.find(inst => inst.url === instance.url);
    if (existingInstance) {
      this.logger.warn(`Service instance already registered: ${serviceName} at ${instance.url}`);
      return;
    }

    const serviceInstance: ServiceInstance = {
      ...instance,
      isHealthy: false,
      lastHealthCheck: new Date(),
      consecutiveFailures: 0
    };

    service.instances.push(serviceInstance);
    
    this.logger.info(`Registered service instance: ${serviceName} at ${instance.url}`);
    
    // Perform initial health check
    this.checkInstanceHealth(serviceInstance);
  }

  public deregisterService(serviceName: string, instanceUrl?: string): void {
    const service = this.services.get(serviceName);
    if (!service) {
      this.logger.warn(`Service not found for deregistration: ${serviceName}`);
      return;
    }

    if (instanceUrl) {
      // Remove specific instance
      service.instances = service.instances.filter(instance => instance.url !== instanceUrl);
      this.logger.info(`Deregistered service instance: ${serviceName} at ${instanceUrl}`);
      
      if (service.instances.length === 0) {
        this.services.delete(serviceName);
        this.logger.info(`Removed service completely: ${serviceName}`);
      }
    } else {
      // Remove entire service
      this.services.delete(serviceName);
      this.logger.info(`Deregistered service: ${serviceName}`);
    }
  }

  public getService(serviceName: string): Service | undefined {
    return this.services.get(serviceName);
  }

  public getAllServices(): Service[] {
    return Array.from(this.services.values());
  }

  public getHealthyInstances(serviceName: string): ServiceInstance[] {
    const service = this.services.get(serviceName);
    if (!service) {
      return [];
    }
    
    return service.instances.filter(instance => instance.isHealthy);
  }

  public startHealthChecking(): void {
    if (this.healthCheckInterval) {
      this.logger.warn('Health checking already started');
      return;
    }

    this.logger.info('Starting health check monitoring');
    
    // Perform initial health checks
    this.performHealthChecks();
    
    // Schedule periodic health checks
    this.healthCheckInterval = setInterval(() => {
      this.performHealthChecks();
    }, this.HEALTH_CHECK_INTERVAL);
  }

  public stopHealthChecking(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      this.logger.info('Stopped health check monitoring');
    }
  }

  private async performHealthChecks(): Promise<void> {
    const promises: Promise<void>[] = [];
    
    for (const service of this.services.values()) {
      for (const instance of service.instances) {
        promises.push(this.checkInstanceHealth(instance));
      }
    }
    
    await Promise.allSettled(promises);
    
    // Update service health status
    this.updateServiceHealthStatus();
  }

  private async checkInstanceHealth(instance: ServiceInstance): Promise<void> {
    try {
      const response = await axios.get(instance.healthCheckUrl, {
        timeout: instance.timeout,
        validateStatus: (status) => status >= 200 && status < 300
      });

      if (response.status >= 200 && response.status < 300) {
        if (!instance.isHealthy) {
          this.logger.info(`Service instance recovered: ${instance.name} at ${instance.url}`);
        }
        
        instance.isHealthy = true;
        instance.consecutiveFailures = 0;
      } else {
        this.markInstanceUnhealthy(instance, `HTTP ${response.status}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.markInstanceUnhealthy(instance, errorMessage);
    }
    
    instance.lastHealthCheck = new Date();
  }

  private markInstanceUnhealthy(instance: ServiceInstance, reason: string): void {
    instance.consecutiveFailures++;
    
    if (instance.consecutiveFailures >= this.MAX_CONSECUTIVE_FAILURES) {
      if (instance.isHealthy) {
        this.logger.error(`Service instance marked unhealthy: ${instance.name} at ${instance.url} - ${reason}`);
      }
      instance.isHealthy = false;
    } else {
      this.logger.warn(`Health check failed for ${instance.name} at ${instance.url} (${instance.consecutiveFailures}/${this.MAX_CONSECUTIVE_FAILURES}) - ${reason}`);
    }
  }

  private updateServiceHealthStatus(): void {
    for (const service of this.services.values()) {
      const healthyInstances = service.instances.filter(instance => instance.isHealthy);
      const wasHealthy = service.isHealthy;
      
      service.isHealthy = healthyInstances.length > 0;
      service.lastHealthCheck = new Date();
      
      if (wasHealthy !== service.isHealthy) {
        if (service.isHealthy) {
          this.logger.info(`Service recovered: ${service.name} (${healthyInstances.length}/${service.instances.length} instances healthy)`);
        } else {
          this.logger.error(`Service unhealthy: ${service.name} (no healthy instances)`);
        }
      }
    }
  }

  public getServiceStats(): Record<string, any> {
    const stats: Record<string, any> = {};
    
    for (const service of this.services.values()) {
      const healthyCount = service.instances.filter(instance => instance.isHealthy).length;
      
      stats[service.name] = {
        totalInstances: service.instances.length,
        healthyInstances: healthyCount,
        isHealthy: service.isHealthy,
        lastHealthCheck: service.lastHealthCheck,
        instances: service.instances.map(instance => ({
          url: instance.url,
          isHealthy: instance.isHealthy,
          lastHealthCheck: instance.lastHealthCheck,
          consecutiveFailures: instance.consecutiveFailures
        }))
      };
    }
    
    return stats;
  }
}