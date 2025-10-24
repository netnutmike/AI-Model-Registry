import { useApiQuery, useApiMutation } from './useApi';
import { Policy } from '@/types';
import { ApprovalRequest, PolicyViolation, ApprovalAction } from '@/services/governance';

// Approval request hooks
export const useApprovalRequests = (status?: string) => {
  return useApiQuery<ApprovalRequest[]>(
    ['governance', 'approvals', status || 'all'],
    '/governance/approvals',
    status ? { status } : undefined
  );
};

export const useApprovalRequest = (id: string, enabled = true) => {
  return useApiQuery<ApprovalRequest>(
    ['governance', 'approvals', id],
    `/governance/approvals/${id}`,
    undefined,
    { enabled: enabled && !!id }
  );
};

export const useSubmitApprovalRequest = () => {
  return useApiMutation<ApprovalRequest, { modelId: string; versionId: string; requestType: 'staging' | 'production' }>(
    '/governance/approvals',
    {
      invalidateQueries: [['governance', 'approvals']],
    }
  );
};

export const useReviewApprovalRequest = (id: string) => {
  return useApiMutation<ApprovalRequest, ApprovalAction>(
    `/governance/approvals/${id}/review`,
    {
      invalidateQueries: [['governance', 'approvals'], ['governance', 'approvals', id]],
    }
  );
};

// Policy hooks
export const usePolicies = () => {
  return useApiQuery<Policy[]>(
    ['governance', 'policies'],
    '/governance/policies'
  );
};

export const usePolicy = (id: string, enabled = true) => {
  return useApiQuery<Policy>(
    ['governance', 'policies', id],
    `/governance/policies/${id}`,
    undefined,
    { enabled: enabled && !!id }
  );
};

export const useCreatePolicy = () => {
  return useApiMutation<Policy, Partial<Policy>>('/governance/policies', {
    invalidateQueries: [['governance', 'policies']],
  });
};

export const useUpdatePolicy = (id: string) => {
  return useApiMutation<Policy, Partial<Policy>>(`/governance/policies/${id}`, {
    invalidateQueries: [['governance', 'policies'], ['governance', 'policies', id]],
  });
};

export const useDeletePolicy = () => {
  return useApiMutation<void, string>('/governance/policies', {
    invalidateQueries: [['governance', 'policies']],
  });
};

// Policy evaluation
export const useEvaluateModel = () => {
  return useApiMutation<PolicyViolation[], { modelId: string; versionId: string }>(
    '/governance/evaluate'
  );
};

// Dashboard
export const useGovernanceDashboard = () => {
  return useApiQuery<{
    pendingApprovals: number;
    policyViolations: number;
    recentActivity: any[];
    complianceScore: number;
  }>(
    ['governance', 'dashboard'],
    '/governance/dashboard'
  );
};