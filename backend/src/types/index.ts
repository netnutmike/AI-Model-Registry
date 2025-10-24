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

// Deployment Service types
export interface Deployment {
  id: string;
  versionId: string;
  environment: DeploymentEnvironment;
  status: DeploymentStatus;
  strategy: DeploymentStrategy;
  configuration: DeploymentConfiguration;
  trafficSplit?: TrafficSplit;
  sloTargets: SLOTargets;
  driftThresholds: DriftThresholds;
  deployedBy: string;
  deployedAt: Date;
  updatedAt: Date;
}

export interface DeploymentConfiguration {
  replicas: number;
  resources: ResourceRequirements;
  environment: Record<string, string>;
  healthCheck: HealthCheckConfiguration;
  rolloutPolicy: RolloutPolicy;
}

export interface ResourceRequirements {
  cpu: string;
  memory: string;
  gpu?: string;
}

export interface HealthCheckConfiguration {
  path: string;
  port: number;
  initialDelaySeconds: number;
  periodSeconds: number;
  timeoutSeconds: number;
  failureThreshold: number;
}

export interface RolloutPolicy {
  maxUnavailable: string;
  maxSurge: string;
  progressDeadlineSeconds: number;
}

export interface TrafficSplit {
  id: string;
  deploymentId: string;
  percentage: number;
  startedAt: Date;
  completedAt?: Date;
}

export interface SLOTargets {
  availability: number; // percentage (e.g., 99.9)
  latencyP95: number; // milliseconds
  latencyP99: number; // milliseconds
  errorRate: number; // percentage
}

export interface DriftThresholds {
  inputDrift: number;
  outputDrift: number;
  performanceDrift: number;
}

export interface DeploymentMetrics {
  id: string;
  deploymentId: string;
  timestamp: Date;
  availability: number;
  latencyP95: number;
  latencyP99: number;
  errorRate: number;
  inputDrift?: number;
  outputDrift?: number;
  performanceDrift?: number;
  requestCount: number;
}

export interface DeploymentAlert {
  id: string;
  deploymentId: string;
  type: AlertType;
  severity: AlertSeverity;
  message: string;
  threshold: number;
  actualValue: number;
  triggeredAt: Date;
  resolvedAt?: Date;
  acknowledged: boolean;
}

export interface RollbackOperation {
  id: string;
  deploymentId: string;
  targetVersionId: string;
  reason: string;
  status: RollbackStatus;
  initiatedBy: string;
  initiatedAt: Date;
  completedAt?: Date;
  errorMessage?: string;
}

// Deployment Service enums
export enum DeploymentEnvironment {
  STAGING = 'staging',
  PRODUCTION = 'production',
  CANARY = 'canary'
}

export enum DeploymentStatus {
  PENDING = 'pending',
  DEPLOYING = 'deploying',
  ACTIVE = 'active',
  FAILED = 'failed',
  ROLLING_BACK = 'rolling_back',
  ROLLED_BACK = 'rolled_back',
  TERMINATED = 'terminated'
}

export enum DeploymentStrategy {
  BLUE_GREEN = 'blue_green',
  CANARY = 'canary',
  ROLLING = 'rolling'
}

export enum AlertType {
  SLO_BREACH = 'slo_breach',
  DRIFT_DETECTED = 'drift_detected',
  HIGH_ERROR_RATE = 'high_error_rate',
  HIGH_LATENCY = 'high_latency',
  LOW_AVAILABILITY = 'low_availability'
}

export enum AlertSeverity {
  INFO = 'info',
  WARNING = 'warning',
  CRITICAL = 'critical'
}

export enum RollbackStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

// Deployment API Request/Response types
export interface CreateDeploymentRequest {
  versionId: string;
  environment: DeploymentEnvironment;
  strategy: DeploymentStrategy;
  configuration: DeploymentConfiguration;
  sloTargets: SLOTargets;
  driftThresholds: DriftThresholds;
}

export interface UpdateDeploymentRequest {
  configuration?: Partial<DeploymentConfiguration>;
  sloTargets?: Partial<SLOTargets>;
  driftThresholds?: Partial<DriftThresholds>;
}

export interface CreateTrafficSplitRequest {
  deploymentId: string;
  percentage: number;
}

export interface CreateRollbackRequest {
  targetVersionId: string;
  reason: string;
}

export interface DeploymentQuery {
  environment?: DeploymentEnvironment;
  status?: DeploymentStatus;
  versionId?: string;
  deployedBy?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export interface MetricsQuery {
  deploymentId: string;
  startTime: Date;
  endTime: Date;
  granularity?: 'minute' | 'hour' | 'day';
}

// Deployment database entity types
export interface DeploymentEntity extends Omit<Deployment, 'versionId' | 'deployedBy' | 'deployedAt' | 'updatedAt'> {
  version_id: string;
  deployed_by: string;
  deployed_at: Date;
  updated_at: Date;
}

export interface TrafficSplitEntity extends Omit<TrafficSplit, 'deploymentId' | 'startedAt' | 'completedAt'> {
  deployment_id: string;
  started_at: Date;
  completed_at?: Date;
}

export interface DeploymentMetricsEntity extends Omit<DeploymentMetrics, 'deploymentId' | 'inputDrift' | 'outputDrift' | 'performanceDrift' | 'requestCount'> {
  deployment_id: string;
  input_drift?: number;
  output_drift?: number;
  performance_drift?: number;
  request_count: number;
}

export interface DeploymentAlertEntity extends Omit<DeploymentAlert, 'deploymentId' | 'actualValue' | 'triggeredAt' | 'resolvedAt'> {
  deployment_id: string;
  actual_value: number;
  triggered_at: Date;
  resolved_at?: Date;
}

export interface RollbackOperationEntity extends Omit<RollbackOperation, 'deploymentId' | 'targetVersionId' | 'initiatedBy' | 'initiatedAt' | 'completedAt' | 'errorMessage'> {
  deployment_id: string;
  target_version_id: string;
  initiated_by: string;
  initiated_at: Date;
  completed_at?: Date;
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

// Audit Service types
export interface AuditLog {
  id: string;
  eventType: string;
  entityType: string;
  entityId: string;
  userId?: string;
  sessionId?: string;
  action: string;
  details: Record<string, any>;
  metadata: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  previousHash?: string;
  currentHash: string;
  timestamp: Date;
}

export interface EvidenceBundle {
  id: string;
  name: string;
  description?: string;
  bundleType: EvidenceBundleType;
  status: EvidenceBundleStatus;
  queryCriteria: Record<string, any>;
  filePath?: string;
  fileSize?: number;
  fileHash?: string;
  expiresAt?: Date;
  generatedBy: string;
  generatedAt: Date;
  completedAt?: Date;
  errorMessage?: string;
}

export interface DataRetentionPolicy {
  id: string;
  name: string;
  description?: string;
  entityType: string;
  retentionPeriodDays: number;
  deletionCriteria: Record<string, any>;
  isActive: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DataSubjectRequest {
  id: string;
  requestType: DataSubjectRequestType;
  subjectIdentifier: string;
  subjectType: string;
  status: DataSubjectRequestStatus;
  justification?: string;
  requestedBy: string;
  requestedAt: Date;
  processedBy?: string;
  processedAt?: Date;
  completionDetails?: Record<string, any>;
}

export interface PersonalDataInventory {
  id: string;
  tableName: string;
  columnName: string;
  dataCategory: DataCategory;
  sensitivityLevel: SensitivityLevel;
  legalBasis?: string;
  retentionPolicyId?: string;
  pseudonymizationMethod?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface HashChainState {
  id: string;
  chainName: string;
  lastHash: string;
  lastSequenceNumber: number;
  updatedAt: Date;
}

export interface ComplianceReport {
  id: string;
  reportType: string;
  title: string;
  description?: string;
  reportingPeriodStart: Date;
  reportingPeriodEnd: Date;
  status: ComplianceReportStatus;
  templateVersion?: string;
  generatedBy: string;
  reviewedBy?: string;
  approvedBy?: string;
  filePath?: string;
  fileSize?: number;
  fileHash?: string;
  createdAt: Date;
  generatedAt?: Date;
  reviewedAt?: Date;
  approvedAt?: Date;
}

export interface AuditEventType {
  eventType: string;
  description: string;
  entityTypes: string[];
  requiredFields: string[];
  retentionDays: number;
  isActive: boolean;
  createdAt: Date;
}

export interface HashChainIntegrityResult {
  isValid: boolean;
  totalRecords: number;
  invalidRecords: number;
  firstInvalidId?: string;
  errorMessage: string;
}

// Audit Service enums
export enum EvidenceBundleType {
  COMPLIANCE_REPORT = 'compliance_report',
  AUDIT_TRAIL = 'audit_trail',
  INVESTIGATION = 'investigation'
}

export enum EvidenceBundleStatus {
  GENERATING = 'generating',
  READY = 'ready',
  EXPIRED = 'expired',
  ERROR = 'error'
}

export enum DataSubjectRequestType {
  ACCESS = 'access',
  DELETION = 'deletion',
  RECTIFICATION = 'rectification',
  PORTABILITY = 'portability'
}

export enum DataSubjectRequestStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  REJECTED = 'rejected'
}

export enum DataCategory {
  IDENTITY = 'identity',
  CONTACT = 'contact',
  BEHAVIORAL = 'behavioral',
  TECHNICAL = 'technical'
}

export enum SensitivityLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export enum ComplianceReportStatus {
  DRAFT = 'draft',
  GENERATING = 'generating',
  READY = 'ready',
  ARCHIVED = 'archived'
}

// Audit API Request/Response types
export interface CreateAuditLogRequest {
  eventType: string;
  entityType: string;
  entityId: string;
  action: string;
  details?: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface CreateEvidenceBundleRequest {
  name: string;
  description?: string;
  bundleType: EvidenceBundleType;
  queryCriteria: Record<string, any>;
  expiresAt?: Date;
}

export interface CreateDataRetentionPolicyRequest {
  name: string;
  description?: string;
  entityType: string;
  retentionPeriodDays: number;
  deletionCriteria?: Record<string, any>;
}

export interface CreateDataSubjectRequestRequest {
  requestType: DataSubjectRequestType;
  subjectIdentifier: string;
  subjectType: string;
  justification?: string;
}

export interface CreateComplianceReportRequest {
  reportType: string;
  title: string;
  description?: string;
  reportingPeriodStart: Date;
  reportingPeriodEnd: Date;
  templateVersion?: string;
}

export interface AuditLogQuery {
  eventType?: string;
  entityType?: string;
  entityId?: string;
  userId?: string;
  action?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export interface VerifyIntegrityRequest {
  startTimestamp?: Date;
  endTimestamp?: Date;
}

// Audit database entity types
export interface AuditLogEntity extends Omit<AuditLog, 'eventType' | 'entityType' | 'entityId' | 'userId' | 'sessionId' | 'ipAddress' | 'userAgent' | 'previousHash' | 'currentHash'> {
  event_type: string;
  entity_type: string;
  entity_id: string;
  user_id?: string;
  session_id?: string;
  ip_address?: string;
  user_agent?: string;
  previous_hash?: string;
  current_hash: string;
}

export interface EvidenceBundleEntity extends Omit<EvidenceBundle, 'bundleType' | 'queryCriteria' | 'filePath' | 'fileSize' | 'fileHash' | 'expiresAt' | 'generatedBy' | 'generatedAt' | 'completedAt' | 'errorMessage'> {
  bundle_type: string;
  query_criteria: any;
  file_path?: string;
  file_size?: number;
  file_hash?: string;
  expires_at?: Date;
  generated_by: string;
  generated_at: Date;
  completed_at?: Date;
  error_message?: string;
}

export interface DataRetentionPolicyEntity extends Omit<DataRetentionPolicy, 'entityType' | 'retentionPeriodDays' | 'deletionCriteria' | 'isActive' | 'createdBy' | 'createdAt' | 'updatedAt'> {
  entity_type: string;
  retention_period_days: number;
  deletion_criteria: any;
  is_active: boolean;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

export interface DataSubjectRequestEntity extends Omit<DataSubjectRequest, 'requestType' | 'subjectIdentifier' | 'subjectType' | 'requestedBy' | 'requestedAt' | 'processedBy' | 'processedAt' | 'completionDetails'> {
  request_type: string;
  subject_identifier: string;
  subject_type: string;
  requested_by: string;
  requested_at: Date;
  processed_by?: string;
  processed_at?: Date;
  completion_details?: any;
}

export interface PersonalDataInventoryEntity extends Omit<PersonalDataInventory, 'tableName' | 'columnName' | 'dataCategory' | 'sensitivityLevel' | 'legalBasis' | 'retentionPolicyId' | 'pseudonymizationMethod' | 'isActive' | 'createdAt' | 'updatedAt'> {
  table_name: string;
  column_name: string;
  data_category: string;
  sensitivity_level: string;
  legal_basis?: string;
  retention_policy_id?: string;
  pseudonymization_method?: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface HashChainStateEntity extends Omit<HashChainState, 'chainName' | 'lastHash' | 'lastSequenceNumber' | 'updatedAt'> {
  chain_name: string;
  last_hash: string;
  last_sequence_number: number;
  updated_at: Date;
}

export interface ComplianceReportEntity extends Omit<ComplianceReport, 'reportType' | 'reportingPeriodStart' | 'reportingPeriodEnd' | 'templateVersion' | 'generatedBy' | 'reviewedBy' | 'approvedBy' | 'filePath' | 'fileSize' | 'fileHash' | 'createdAt' | 'generatedAt' | 'reviewedAt' | 'approvedAt'> {
  report_type: string;
  reporting_period_start: Date;
  reporting_period_end: Date;
  template_version?: string;
  generated_by: string;
  reviewed_by?: string;
  approved_by?: string;
  file_path?: string;
  file_size?: number;
  file_hash?: string;
  created_at: Date;
  generated_at?: Date;
  reviewed_at?: Date;
  approved_at?: Date;
}

export interface AuditEventTypeEntity extends Omit<AuditEventType, 'eventType' | 'entityTypes' | 'requiredFields' | 'retentionDays' | 'isActive' | 'createdAt'> {
  event_type: string;
  entity_types: string[];
  required_fields: string[];
  retention_days: number;
  is_active: boolean;
  created_at: Date;
}