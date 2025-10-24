import { apiService } from './api';
import { Policy, Evaluation } from '@/types';

export interface ApprovalRequest {
  id: string;
  modelId: string;
  versionId: string;
  requestType: 'staging' | 'production';
  status: 'pending' | 'approved' | 'rejected';
  requestedBy: string;
  requestedAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
  comments?: string;
  policyViolations: PolicyViolation[];
  evaluationResults: Evaluation[];
}

export interface PolicyViolation {
  id: string;
  policyId: string;
  policyName: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  canOverride: boolean;
  overrideReason?: string;
  overriddenBy?: string;
  overriddenAt?: string;
}

export interface ApprovalAction {
  action: 'approve' | 'reject' | 'request_changes';
  comments?: string;
  overrides?: {
    violationId: string;
    reason: string;
  }[];
}

export class GovernanceService {
  // Approval requests
  async getApprovalRequests(status?: string): Promise<ApprovalRequest[]> {
    const params = status ? { status } : {};
    const response = await apiService.get<ApprovalRequest[]>('/governance/approvals', params);
    return response.data;
  }

  async getApprovalRequest(id: string): Promise<ApprovalRequest> {
    const response = await apiService.get<ApprovalRequest>(`/governance/approvals/${id}`);
    return response.data;
  }

  async submitApprovalRequest(modelId: string, versionId: string, requestType: 'staging' | 'production'): Promise<ApprovalRequest> {
    const response = await apiService.post<ApprovalRequest>('/governance/approvals', {
      modelId,
      versionId,
      requestType,
    });
    return response.data;
  }

  async reviewApprovalRequest(id: string, action: ApprovalAction): Promise<ApprovalRequest> {
    const response = await apiService.post<ApprovalRequest>(`/governance/approvals/${id}/review`, action);
    return response.data;
  }

  // Policy management
  async getPolicies(): Promise<Policy[]> {
    const response = await apiService.get<Policy[]>('/governance/policies');
    return response.data;
  }

  async getPolicy(id: string): Promise<Policy> {
    const response = await apiService.get<Policy>(`/governance/policies/${id}`);
    return response.data;
  }

  async createPolicy(policy: Partial<Policy>): Promise<Policy> {
    const response = await apiService.post<Policy>('/governance/policies', policy);
    return response.data;
  }

  async updatePolicy(id: string, policy: Partial<Policy>): Promise<Policy> {
    const response = await apiService.put<Policy>(`/governance/policies/${id}`, policy);
    return response.data;
  }

  async deletePolicy(id: string): Promise<void> {
    await apiService.delete(`/governance/policies/${id}`);
  }

  // Policy evaluation
  async evaluateModel(modelId: string, versionId: string): Promise<PolicyViolation[]> {
    const response = await apiService.post<PolicyViolation[]>('/governance/evaluate', {
      modelId,
      versionId,
    });
    return response.data;
  }

  // Dashboard data
  async getGovernanceDashboard(): Promise<{
    pendingApprovals: number;
    policyViolations: number;
    recentActivity: any[];
    complianceScore: number;
  }> {
    const response = await apiService.get<any>('/governance/dashboard');
    return response.data;
  }
}

export const governanceService = new GovernanceService();