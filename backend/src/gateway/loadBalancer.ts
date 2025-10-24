import { Service, ServiceInstance } from './serviceRegistry.js';

export enum LoadBalancingStrategy {
  ROUND_ROBIN = 'round_robin',
  LEAST_CONNECTIONS = 'least_connections',
  RANDOM = 'random',
  WEIGHTED_ROUND_ROBIN = 'weighted_round_robin'
}

export interface LoadBalancerConfig {
  strategy: LoadBalancingStrategy;
  weights?: Record<string, number>; // For weighted strategies
}

export class LoadBalancer {
  private roundRobinCounters: Map<string, number>;
  private connectionCounts: Map<string, number>;
  private config: LoadBalancerConfig;

  constructor(config: LoadBalancerConfig = { strategy: LoadBalancingStrategy.ROUND_ROBIN }) {
    this.roundRobinCounters = new Map();
    this.connectionCounts = new Map();
    this.config = config;
  }

  public getNextInstance(service: Service): ServiceInstance | null {
    const healthyInstances = service.instances.filter(instance => instance.isHealthy);
    
    if (healthyInstances.length === 0) {
      return null;
    }

    if (healthyInstances.length === 1) {
      return healthyInstances[0];
    }

    switch (this.config.strategy) {
      case LoadBalancingStrategy.ROUND_ROBIN:
        return this.roundRobinSelection(service.name, healthyInstances);
      
      case LoadBalancingStrategy.LEAST_CONNECTIONS:
        return this.leastConnectionsSelection(healthyInstances);
      
      case LoadBalancingStrategy.RANDOM:
        return this.randomSelection(healthyInstances);
      
      case LoadBalancingStrategy.WEIGHTED_ROUND_ROBIN:
        return this.weightedRoundRobinSelection(service.name, healthyInstances);
      
      default:
        return this.roundRobinSelection(service.name, healthyInstances);
    }
  }

  private roundRobinSelection(serviceName: string, instances: ServiceInstance[]): ServiceInstance {
    const currentCounter = this.roundRobinCounters.get(serviceName) || 0;
    const nextIndex = currentCounter % instances.length;
    
    this.roundRobinCounters.set(serviceName, currentCounter + 1);
    
    return instances[nextIndex];
  }

  private leastConnectionsSelection(instances: ServiceInstance[]): ServiceInstance {
    let selectedInstance = instances[0];
    let minConnections = this.getConnectionCount(selectedInstance.url);

    for (const instance of instances) {
      const connections = this.getConnectionCount(instance.url);
      if (connections < minConnections) {
        minConnections = connections;
        selectedInstance = instance;
      }
    }

    return selectedInstance;
  }

  private randomSelection(instances: ServiceInstance[]): ServiceInstance {
    const randomIndex = Math.floor(Math.random() * instances.length);
    return instances[randomIndex];
  }

  private weightedRoundRobinSelection(serviceName: string, instances: ServiceInstance[]): ServiceInstance {
    if (!this.config.weights) {
      return this.roundRobinSelection(serviceName, instances);
    }

    // Create weighted list based on instance weights
    const weightedInstances: ServiceInstance[] = [];
    
    for (const instance of instances) {
      const weight = this.config.weights[instance.url] || 1;
      for (let i = 0; i < weight; i++) {
        weightedInstances.push(instance);
      }
    }

    return this.roundRobinSelection(serviceName, weightedInstances);
  }

  public recordConnection(instanceUrl: string): void {
    const currentCount = this.connectionCounts.get(instanceUrl) || 0;
    this.connectionCounts.set(instanceUrl, currentCount + 1);
  }

  public recordDisconnection(instanceUrl: string): void {
    const currentCount = this.connectionCounts.get(instanceUrl) || 0;
    if (currentCount > 0) {
      this.connectionCounts.set(instanceUrl, currentCount - 1);
    }
  }

  private getConnectionCount(instanceUrl: string): number {
    return this.connectionCounts.get(instanceUrl) || 0;
  }

  public getConnectionStats(): Record<string, number> {
    return Object.fromEntries(this.connectionCounts);
  }

  public resetCounters(): void {
    this.roundRobinCounters.clear();
    this.connectionCounts.clear();
  }

  public setStrategy(strategy: LoadBalancingStrategy): void {
    this.config.strategy = strategy;
  }

  public setWeights(weights: Record<string, number>): void {
    this.config.weights = weights;
  }

  public getStrategy(): LoadBalancingStrategy {
    return this.config.strategy;
  }
}