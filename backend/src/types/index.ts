// Core entity interfaces and types for AI Model Registry
import { Request } from 'express';

// User and Authentication types
export interface User {
  id: string;
  email: string;
  name: string;
  roles: UserRole[];
  ssoId?: string;
  isActive: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserSession {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  createdAt: Date;
}

export enum UserRole {
  MODEL_OWNER = 'Model_Owner',
  MRC = 'MRC',
  SECURITY_ARCHITECT = 'Security_Architect',
  SRE = 'SRE',
  AUDITOR = 'Auditor',
  ADMIN = 'Admin'
}

export interface JWTPayload {
  userId: string;
  email: string;
  roles: UserRole[];
  sessionId: string;
  iat: number;
  exp: number;
}

export interface AuthenticatedRequest extends Request {
  user?: User;
  session?: UserSession;
}

export interface Model {
  id: string;
  name: string;
  group: string;
  description: string;
  owners: string[];
  riskTier: RiskTier;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ModelVersion {
  id: string;
  modelId: string;
  version: string; // semantic version (MAJOR.MINOR.PATCH)
  state: VersionState;
  commitSha: string;
  trainingJobId?: string;
  metadata: ModelMetadata;
  createdAt: Date;
  updatedAt: Date;
}

export interface Artifact {
  id: string;
  versionId: string;
  type: ArtifactType;
  uri: string;
  sha256: string;
  size: number;
  license?: string;
  createdAt: Date;
}

export interface Evaluation {
  id: string;
  versionId: string;
  suiteId: string;
  results: EvaluationResults;
  thresholds: EvaluationThresholds;
  passed: boolean;
  executedAt: Date;
}

export interface Approval {
  id: string;
  versionId: string;
  approverUserId: string;
  approverRole: ApprovalRole;
  status: ApprovalStatus;
  comments?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Enums
export enum RiskTier {
  LOW = 'Low',
  MEDIUM = 'Medium',
  HIGH = 'High'
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

export enum ArtifactType {
  WEIGHTS = 'weights',
  CONTAINER = 'container',
  TOKENIZER = 'tokenizer',
  CONFIG = 'config'
}

export enum ApprovalRole {
  MRC = 'MRC',
  SECURITY = 'Security',
  SRE = 'SRE'
}

export enum ApprovalStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected'
}

// Supporting interfaces
export interface ModelMetadata {
  framework: string;
  frameworkVersion: string;
  modelType: string;
  inputSchema?: Record<string, any>;
  outputSchema?: Record<string, any>;
  hyperparameters?: Record<string, any>;
  trainingDataset?: string;
  baseModel?: string;
  intendedUse?: string;
  limitations?: string;
  ethicalConsiderations?: string;
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

// API Request/Response types
export interface CreateModelRequest {
  name: string;
  group: string;
  description: string;
  owners: string[];
  riskTier: RiskTier;
  tags?: string[];
}

export interface CreateVersionRequest {
  version: string;
  commitSha: string;
  trainingJobId?: string;
  metadata: ModelMetadata;
}

export interface CreateArtifactRequest {
  type: ArtifactType;
  license?: string;
}

export interface CreateEvaluationRequest {
  suiteId: string;
  thresholds: EvaluationThresholds;
}

export interface CreateApprovalRequest {
  approverRole: ApprovalRole;
  comments?: string;
}

// Database entity types (for ORM/query builders)
export interface ModelEntity extends Omit<Model, 'createdAt' | 'updatedAt'> {
  created_at: Date;
  updated_at: Date;
}

export interface ModelVersionEntity extends Omit<ModelVersion, 'modelId' | 'createdAt' | 'updatedAt'> {
  model_id: string;
  created_at: Date;
  updated_at: Date;
}

export interface ArtifactEntity extends Omit<Artifact, 'versionId' | 'createdAt'> {
  version_id: string;
  created_at: Date;
}

export interface EvaluationEntity extends Omit<Evaluation, 'versionId' | 'suiteId' | 'executedAt'> {
  version_id: string;
  suite_id: string;
  executed_at: Date;
}

export interface ApprovalEntity extends Omit<Approval, 'versionId' | 'approverUserId' | 'createdAt' | 'updatedAt'> {
  version_id: string;
  approver_user_id: string;
  created_at: Date;
  updated_at: Date;
}

// Policy Engine types
export interface Policy {
  id: string;
  name: string;
  description: string;
  version: string;
  status: PolicyStatus;
  severity: PolicySeverity;
  ruleDefinition: PolicyRuleDefinition;
  metadata: Record<string, any>;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  activatedAt?: Date;
}

export interface PolicyEvaluation {
  id: string;
  versionId: string;
  policyId: string;
  status: PolicyEvaluationStatus;
  context: Record<string, any>;
  dryRun: boolean;
  startedAt: Date;
  completedAt?: Date;
  errorMessage?: string;
}

export interface PolicyResult {
  id: string;
  evaluationId: string;
  ruleName: string;
  status: PolicyResultStatus;
  message?: string;
  details: Record<string, any>;
  blocking: boolean;
  createdAt: Date;
}

export interface PolicyException {
  id: string;
  versionId: string;
  policyId: string;
  justification: string;
  approvedBy: string;
  expiresAt?: Date;
  createdAt: Date;
}

export interface PolicyRuleDefinition {
  conditions: PolicyCondition[];
  actions: PolicyAction[];
}

export interface PolicyCondition {
  type: string;
  field: string;
  operator: string;
  value: any;
  description?: string;
}

export interface PolicyAction {
  type: string;
  severity: PolicySeverity;
  message: string;
  blocking: boolean;
}

// Policy Engine enums
export enum PolicyStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  DEPRECATED = 'deprecated'
}

export enum PolicySeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export enum PolicyEvaluationStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

export enum PolicyResultStatus {
  PASS = 'pass',
  FAIL = 'fail',
  WARNING = 'warning',
  ERROR = 'error'
}

// Policy API Request/Response types
export interface CreatePolicyRequest {
  name: string;
  description: string;
  version: string;
  severity: PolicySeverity;
  ruleDefinition: PolicyRuleDefinition;
  metadata?: Record<string, any>;
}

export interface UpdatePolicyRequest {
  description?: string;
  status?: PolicyStatus;
  severity?: PolicySeverity;
  ruleDefinition?: PolicyRuleDefinition;
  metadata?: Record<string, any>;
}

export interface EvaluatePolicyRequest {
  versionId: string;
  policyIds?: string[];
  dryRun?: boolean;
  context?: Record<string, any>;
}

export interface CreatePolicyExceptionRequest {
  versionId: string;
  policyId: string;
  justification: string;
  expiresAt?: Date;
}

// Policy database entity types
export interface PolicyEntity extends Omit<Policy, 'ruleDefinition' | 'createdBy' | 'createdAt' | 'updatedAt' | 'activatedAt'> {
  rule_definition: any;
  created_by: string;
  created_at: Date;
  updated_at: Date;
  activated_at?: Date;
}

export interface PolicyEvaluationEntity extends Omit<PolicyEvaluation, 'versionId' | 'policyId' | 'startedAt' | 'completedAt'> {
  version_id: string;
  policy_id: string;
  started_at: Date;
  completed_at?: Date;
}

export interface PolicyResultEntity extends Omit<PolicyResult, 'evaluationId' | 'ruleName' | 'createdAt'> {
  evaluation_id: string;
  rule_name: string;
  created_at: Date;
}

export interface PolicyExceptionEntity extends Omit<PolicyException, 'versionId' | 'policyId' | 'approvedBy' | 'expiresAt' | 'createdAt'> {
  version_id: string;
  policy_id: string;
  approved_by: string;
  expires_at?: Date;
  created_at: Date;
}

// Evaluation Service types
export interface EvaluationSuite {
  id: string;
  name: string;
  description: string;
  version: string;
  status: EvaluationSuiteStatus;
  configuration: EvaluationSuiteConfiguration;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface EvaluationSuiteConfiguration {
  datasets: EvaluationDataset[];
  testTypes: EvaluationTestType[];
  thresholds: EvaluationThresholds;
  timeout: number;
  retryPolicy: RetryPolicy;
}

export interface EvaluationDataset {
  id: string;
  name: string;
  type: DatasetType;
  uri: string;
  sha256: string;
  size: number;
  metadata: Record<string, any>;
}

export interface EvaluationJob {
  id: string;
  versionId: string;
  suiteId: string;
  status: EvaluationJobStatus;
  priority: JobPriority;
  configuration: EvaluationJobConfiguration;
  results?: EvaluationResults;
  errorMessage?: string;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
}

export interface EvaluationJobConfiguration {
  suiteConfiguration: EvaluationSuiteConfiguration;
  modelArtifacts: Artifact[];
  environment: Record<string, string>;
}

export interface RetryPolicy {
  maxRetries: number;
  backoffMultiplier: number;
  initialDelayMs: number;
}

// Evaluation Service enums
export enum EvaluationSuiteStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  DEPRECATED = 'deprecated'
}

export enum EvaluationTestType {
  BIAS = 'bias',
  SAFETY = 'safety',
  EFFECTIVENESS = 'effectiveness',
  ROBUSTNESS = 'robustness',
  FAIRNESS = 'fairness',
  PERFORMANCE = 'performance'
}

export enum DatasetType {
  TRAINING = 'training',
  VALIDATION = 'validation',
  TEST = 'test',
  BENCHMARK = 'benchmark'
}

export enum EvaluationJobStatus {
  PENDING = 'pending',
  QUEUED = 'queued',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

export enum JobPriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  URGENT = 'urgent'
}

// Evaluation API Request/Response types
export interface CreateEvaluationSuiteRequest {
  name: string;
  description: string;
  version: string;
  configuration: EvaluationSuiteConfiguration;
}

export interface UpdateEvaluationSuiteRequest {
  description?: string;
  status?: EvaluationSuiteStatus;
  configuration?: EvaluationSuiteConfiguration;
}

export interface CreateEvaluationDatasetRequest {
  name: string;
  type: DatasetType;
  metadata?: Record<string, any>;
}

export interface RunEvaluationRequest {
  versionId: string;
  suiteId: string;
  priority?: JobPriority;
  environment?: Record<string, string>;
}

export interface EvaluationHistoryQuery {
  versionId?: string;
  suiteId?: string;
  status?: EvaluationJobStatus;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

// Evaluation database entity types
export interface EvaluationSuiteEntity extends Omit<EvaluationSuite, 'createdBy' | 'createdAt' | 'updatedAt'> {
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

export interface EvaluationDatasetEntity extends Omit<EvaluationDataset, 'createdAt'> {
  created_at: Date;
}

export interface EvaluationJobEntity extends Omit<EvaluationJob, 'versionId' | 'suiteId' | 'startedAt' | 'completedAt' | 'createdAt' | 'errorMessage'> {
  version_id: string;
  suite_id: string;
  started_at?: Date;
  completed_at?: Date;
  created_at: Date;
  error_message?: string;
}

// User database entity types
export interface UserEntity extends Omit<User, 'createdAt' | 'updatedAt'> {
  created_at: Date;
  updated_at: Date;
}

export interface UserSessionEntity extends Omit<UserSession, 'userId' | 'createdAt'> {
  user_id: string;
  created_at: Date;
}