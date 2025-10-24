import { apiService } from './api';
import { Deployment } from '@/types';

export interface DeploymentMetrics {
  requestsPerSecond: number;
  averageLatency: number;
  errorRate: number;
  cpuUsage: number;
  memoryUsage: number;
  uptime: number;
}

export interface DeploymentConfig {
  modelId: string;
  versionId: string;
  environment: 'staging' | 'production';
  trafficPercentage: number;
  replicas: number;
  resources: {
    cpu: string;
    memory: string;
  };
  autoScaling: {
    enabled: boolean;
    minReplicas: number;
    maxReplicas: number;
    targetCpuUtilization: number;
  };
}

export interface TrafficSplit {
  deploymentId: string;
  percentage: number;
}

export interface RollbackConfig {
  targetDeploymentId: string;
  reason: string;
}

export class DeploymentService {
  // Deployment management
  async getDeployments(environment?: string): Promise<Deployment[]> {
    const params = environment ? { environment } : {};
    const response = await apiService.get<Deployment[]>('/deployments', params);
    return response.data;
  }

  async getDeployment(id: string): Promise<Deployment> {
    const response = await apiService.get<Deployment>(`/deployments/${id}`);
    return response.data;
  }

  async createDeployment(config: DeploymentConfig): Promise<Deployment> {
    const response = await apiService.post<Deployment>('/deployments', config);
    return response.data;
  }

  async updateDeployment(id: string, config: Partial<DeploymentConfig>): Promise<Deployment> {
    const response = await apiService.put<Deployment>(`/deployments/${id}`, config);
    return response.data;
  }

  async deleteDeployment(id: string): Promise<void> {
    await apiService.delete(`/deployments/${id}`);
  }

  // Traffic management
  async updateTrafficSplit(environment: string, splits: TrafficSplit[]): Promise<void> {
    await apiService.post(`/deployments/traffic/${environment}`, { splits });
  }

  async getTrafficSplit(environment: string): Promise<TrafficSplit[]> {
    const response = await apiService.get<TrafficSplit[]>(`/deployments/traffic/${environment}`);
    return response.data;
  }

  // Rollback
  async rollbackDeployment(config: RollbackConfig): Promise<Deployment> {
    const response = await apiService.post<Deployment>('/deployments/rollback', config);
    return response.data;
  }

  async getRollbackHistory(deploymentId: string): Promise<any[]> {
    const response = await apiService.get<any[]>(`/deployments/${deploymentId}/rollbacks`);
    return response.data;
  }

  // Monitoring
  async getDeploymentMetrics(id: string, timeRange: string = '1h'): Promise<DeploymentMetrics> {
    const response = await apiService.get<DeploymentMetrics>(`/deployments/${id}/metrics`, { timeRange });
    return response.data;
  }

  async getDeploymentLogs(id: string, lines: number = 100): Promise<string[]> {
    const response = await apiService.get<string[]>(`/deployments/${id}/logs`, { lines });
    return response.data;
  }

  async getDeploymentHealth(id: string): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    checks: Array<{
      name: string;
      status: 'passing' | 'warning' | 'critical';
      message: string;
    }>;
  }> {
    const response = await apiService.get<any>(`/deployments/${id}/health`);
    return response.data;
  }

  // Dashboard data
  async getDeploymentDashboard(): Promise<{
    totalDeployments: number;
    activeDeployments: number;
    failedDeployments: number;
    averageUptime: number;
    recentDeployments: Deployment[];
  }> {
    const response = await apiService.get<any>('/deployments/dashboard');
    return response.data;
  }
}

export const deploymentService = new DeploymentService();