import { useApiQuery, useApiMutation } from './useApi';
import { Deployment } from '@/types';
import { DeploymentConfig, DeploymentMetrics, TrafficSplit, RollbackConfig } from '@/services/deployments';

// Deployment queries
export const useDeployments = (environment?: string) => {
  return useApiQuery<Deployment[]>(
    ['deployments', environment || 'all'],
    '/deployments',
    environment ? { environment } : undefined
  );
};

export const useDeployment = (id: string, enabled = true) => {
  return useApiQuery<Deployment>(
    ['deployments', id],
    `/deployments/${id}`,
    undefined,
    { enabled: enabled && !!id }
  );
};

export const useDeploymentMetrics = (id: string, timeRange = '1h', enabled = true) => {
  return useApiQuery<DeploymentMetrics>(
    ['deployments', id, 'metrics', timeRange],
    `/deployments/${id}/metrics`,
    { timeRange },
    { 
      enabled: enabled && !!id,
      staleTime: 30 * 1000, // 30 seconds
      cacheTime: 60 * 1000, // 1 minute
    }
  );
};

export const useDeploymentHealth = (id: string, enabled = true) => {
  return useApiQuery<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    checks: Array<{
      name: string;
      status: 'passing' | 'warning' | 'critical';
      message: string;
    }>;
  }>(
    ['deployments', id, 'health'],
    `/deployments/${id}/health`,
    undefined,
    { 
      enabled: enabled && !!id,
      staleTime: 10 * 1000, // 10 seconds
      cacheTime: 30 * 1000, // 30 seconds
    }
  );
};

export const useDeploymentLogs = (id: string, lines = 100, enabled = true) => {
  return useApiQuery<string[]>(
    ['deployments', id, 'logs', lines.toString()],
    `/deployments/${id}/logs`,
    { lines },
    { 
      enabled: enabled && !!id,
      staleTime: 5 * 1000, // 5 seconds
    }
  );
};

export const useTrafficSplit = (environment: string, enabled = true) => {
  return useApiQuery<TrafficSplit[]>(
    ['deployments', 'traffic', environment],
    `/deployments/traffic/${environment}`,
    undefined,
    { enabled: enabled && !!environment }
  );
};

export const useRollbackHistory = (deploymentId: string, enabled = true) => {
  return useApiQuery<any[]>(
    ['deployments', deploymentId, 'rollbacks'],
    `/deployments/${deploymentId}/rollbacks`,
    undefined,
    { enabled: enabled && !!deploymentId }
  );
};

export const useDeploymentDashboard = () => {
  return useApiQuery<{
    totalDeployments: number;
    activeDeployments: number;
    failedDeployments: number;
    averageUptime: number;
    recentDeployments: Deployment[];
  }>(
    ['deployments', 'dashboard'],
    '/deployments/dashboard'
  );
};

// Deployment mutations
export const useCreateDeployment = () => {
  return useApiMutation<Deployment, DeploymentConfig>('/deployments', {
    invalidateQueries: [['deployments']],
  });
};

export const useUpdateDeployment = (id: string) => {
  return useApiMutation<Deployment, Partial<DeploymentConfig>>(`/deployments/${id}`, {
    invalidateQueries: [['deployments'], ['deployments', id]],
  });
};

export const useDeleteDeployment = () => {
  return useApiMutation<void, string>('/deployments', {
    invalidateQueries: [['deployments']],
  });
};

export const useUpdateTrafficSplit = (environment: string) => {
  return useApiMutation<void, { splits: TrafficSplit[] }>(`/deployments/traffic/${environment}`, {
    invalidateQueries: [['deployments', 'traffic', environment], ['deployments']],
  });
};

export const useRollbackDeployment = () => {
  return useApiMutation<Deployment, RollbackConfig>('/deployments/rollback', {
    invalidateQueries: [['deployments']],
  });
};