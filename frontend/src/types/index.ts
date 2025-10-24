// Core types for the AI Model Registry frontend

export interface User {
  id: string;
  email: string;
  name: string;
  roles: UserRole[];
  permissions: string[];
}

export interface UserRole {
  id: string;
  name: string;
  permissions: string[];
}

export interface Model {
  id: string;
  name: string;
  group: string;
  description: string;
  owners: string[];
  riskTier: 'Low' | 'Medium' | 'High';
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ModelVersion {
  id: string;
  modelId: string;
  version: string;
  state: VersionState;
  commitSha: string;
  trainingJobId?: string;
  metadata: ModelMetadata;
  createdAt: string;
  updatedAt: string;
}

export enum VersionState {
  DRAFT = 'draft',
  SUBMITTED = 'submitted',
  CHANGES_REQUESTED = 'changes_requested',
  APPROVED_STAGING = 'approved_staging',
  STAGING = 'staging',
  APPROVED_PROD = 'approved_prod',
  PRODUCTION = 'production',
  DEPRECATED = 'deprecated',
  RETIRED = 'retired'
}

export interface ModelMetadata {
  framework: string;
  modelType: string;
  inputSchema?: Record<string, any>;
  outputSchema?: Record<string, any>;
  hyperparameters?: Record<string, any>;
  metrics?: Record<string, number>;
  [key: string]: any;
}

export interface Artifact {
  id: string;
  versionId: string;
  type: 'weights' | 'container' | 'tokenizer' | 'config';
  uri: string;
  sha256: string;
  size: number;
  license?: string;
  createdAt: string;
}

export interface Evaluation {
  id: string;
  versionId: string;
  suiteId: string;
  results: EvaluationResults;
  thresholds: EvaluationThresholds;
  passed: boolean;
  executedAt: string;
}

export interface EvaluationResults {
  taskMetrics: Record<string, number>;
  biasMetrics: Record<string, number>;
  safetyMetrics: Record<string, number>;
  robustnessMetrics: Record<string, number>;
}

export interface EvaluationThresholds {
  taskMetrics: Record<string, number>;
  biasMetrics: Record<string, number>;
  safetyMetrics: Record<string, number>;
  robustnessMetrics: Record<string, number>;
}

export interface Policy {
  id: string;
  name: string;
  description: string;
  rules: PolicyRule[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PolicyRule {
  id: string;
  condition: string;
  action: 'block' | 'warn' | 'require_approval';
  message: string;
}

export interface Deployment {
  id: string;
  versionId: string;
  environment: 'staging' | 'production';
  status: 'pending' | 'deploying' | 'active' | 'failed' | 'rolled_back';
  trafficPercentage: number;
  createdAt: string;
  updatedAt: string;
}

export interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (token: string) => void;
  logout: () => void;
}

export interface ApiResponse<T> {
  data: T;
  message?: string;
  success: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface SearchFilters {
  search?: string;
  group?: string;
  riskTier?: string;
  tags?: string[];
  owner?: string;
  state?: VersionState;
}