export interface WebhookPayload {
  id: string;
  event: string;
  repository: {
    name: string;
    fullName: string;
    url: string;
  };
  commit?: {
    sha: string;
    message: string;
    author: {
      name: string;
      email: string;
    };
    timestamp: string;
  };
  pullRequest?: {
    id: number;
    title: string;
    state: 'open' | 'closed' | 'merged';
    sourceBranch: string;
    targetBranch: string;
    url: string;
  };
  provider: 'github' | 'gitlab' | 'bitbucket';
}

export interface CommitInfo {
  sha: string;
  message: string;
  author: string;
  email: string;
  timestamp: Date;
  repository: string;
  branch: string;
  modelId?: string;
  versionId?: string;
}

export interface PipelineValidationResult {
  id: string;
  commitSha: string;
  modelId: string;
  versionId: string;
  status: 'pending' | 'running' | 'passed' | 'failed';
  checks: {
    policyValidation: boolean;
    securityScan: boolean;
    qualityGates: boolean;
  };
  results: {
    policyViolations: string[];
    securityIssues: string[];
    qualityMetrics: Record<string, number>;
  };
  createdAt: Date;
  completedAt?: Date;
}

export interface CicdProvider {
  name: string;
  type: 'github' | 'gitlab' | 'bitbucket';
  config: {
    baseUrl: string;
    token: string;
    webhookSecret: string;
  };
}