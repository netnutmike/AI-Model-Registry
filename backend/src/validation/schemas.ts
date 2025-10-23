import Joi from 'joi';
import { RiskTier, VersionState, ArtifactType, ApprovalRole, ApprovalStatus } from '../types/index.js';

// Validation schemas for core entities

export const modelSchema = Joi.object({
  name: Joi.string()
    .min(1)
    .max(100)
    .pattern(/^[a-zA-Z0-9\-_]+$/)
    .required()
    .messages({
      'string.pattern.base': 'Model name must contain only alphanumeric characters, hyphens, and underscores'
    }),
  
  group: Joi.string()
    .min(1)
    .max(50)
    .pattern(/^[a-zA-Z0-9\-_]+$/)
    .required()
    .messages({
      'string.pattern.base': 'Group name must contain only alphanumeric characters, hyphens, and underscores'
    }),
  
  description: Joi.string()
    .min(1)
    .max(1000)
    .required(),
  
  owners: Joi.array()
    .items(Joi.string().email())
    .min(1)
    .required(),
  
  riskTier: Joi.string()
    .valid(...Object.values(RiskTier))
    .required(),
  
  tags: Joi.array()
    .items(Joi.string().min(1).max(50))
    .default([])
});

export const modelVersionSchema = Joi.object({
  version: Joi.string()
    .pattern(/^\d+\.\d+\.\d+$/)
    .required()
    .messages({
      'string.pattern.base': 'Version must follow semantic versioning format (MAJOR.MINOR.PATCH)'
    }),
  
  commitSha: Joi.string()
    .pattern(/^[a-f0-9]{40}$/)
    .required()
    .messages({
      'string.pattern.base': 'Commit SHA must be a valid 40-character hexadecimal string'
    }),
  
  trainingJobId: Joi.string()
    .optional(),
  
  metadata: Joi.object({
    framework: Joi.string().required(),
    frameworkVersion: Joi.string().required(),
    modelType: Joi.string().required(),
    inputSchema: Joi.object().optional(),
    outputSchema: Joi.object().optional(),
    hyperparameters: Joi.object().optional(),
    trainingDataset: Joi.string().optional(),
    baseModel: Joi.string().optional(),
    intendedUse: Joi.string().optional(),
    limitations: Joi.string().optional(),
    ethicalConsiderations: Joi.string().optional()
  }).required()
});

export const artifactSchema = Joi.object({
  type: Joi.string()
    .valid(...Object.values(ArtifactType))
    .required(),
  
  license: Joi.string()
    .optional()
});

export const evaluationSchema = Joi.object({
  suiteId: Joi.string()
    .uuid()
    .required(),
  
  thresholds: Joi.object({
    taskMetrics: Joi.object().pattern(Joi.string(), Joi.number()).required(),
    biasMetrics: Joi.object().pattern(Joi.string(), Joi.number()).required(),
    safetyMetrics: Joi.object().pattern(Joi.string(), Joi.number()).required(),
    robustnessMetrics: Joi.object().pattern(Joi.string(), Joi.number()).required()
  }).required()
});

export const approvalSchema = Joi.object({
  approverRole: Joi.string()
    .valid(...Object.values(ApprovalRole))
    .required(),
  
  comments: Joi.string()
    .max(1000)
    .optional()
});

// Update schemas for PATCH operations
export const updateModelSchema = Joi.object({
  description: Joi.string().min(1).max(1000).optional(),
  owners: Joi.array().items(Joi.string().email()).min(1).optional(),
  riskTier: Joi.string().valid(...Object.values(RiskTier)).optional(),
  tags: Joi.array().items(Joi.string().min(1).max(50)).optional()
});

export const updateVersionStateSchema = Joi.object({
  state: Joi.string()
    .valid(...Object.values(VersionState))
    .required()
});

export const updateApprovalSchema = Joi.object({
  status: Joi.string()
    .valid(...Object.values(ApprovalStatus))
    .required(),
  
  comments: Joi.string()
    .max(1000)
    .optional()
});

// Query parameter schemas
export const modelQuerySchema = Joi.object({
  search: Joi.string().optional(),
  group: Joi.string().optional(),
  riskTier: Joi.string().valid(...Object.values(RiskTier)).optional(),
  tags: Joi.alternatives().try(
    Joi.string(),
    Joi.array().items(Joi.string())
  ).optional(),
  owner: Joi.string().email().optional(),
  limit: Joi.number().integer().min(1).max(100).default(20),
  offset: Joi.number().integer().min(0).default(0),
  sortBy: Joi.string().valid('name', 'createdAt', 'updatedAt').default('createdAt'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc')
});

export const versionQuerySchema = Joi.object({
  state: Joi.string().valid(...Object.values(VersionState)).optional(),
  limit: Joi.number().integer().min(1).max(100).default(20),
  offset: Joi.number().integer().min(0).default(0),
  sortBy: Joi.string().valid('version', 'createdAt').default('createdAt'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc')
});

// Common validation helpers
export const uuidSchema = Joi.string().uuid().required();
export const paginationSchema = Joi.object({
  limit: Joi.number().integer().min(1).max(100).default(20),
  offset: Joi.number().integer().min(0).default(0)
});

// Policy Engine validation schemas
export const policyConditionSchema = Joi.object({
  type: Joi.string().valid('field', 'metadata', 'artifact', 'evaluation').required(),
  field: Joi.string().required(),
  operator: Joi.string().valid(
    'equals', 'not_equals', 
    'greater_than', 'less_than', 'greater_than_or_equal', 'less_than_or_equal',
    'contains', 'not_contains', 
    'exists', 'not_exists', 
    'in', 'not_in',
    'matches_regex',
    'length_equals', 'length_greater_than', 'length_less_than'
  ).required(),
  value: Joi.any().required(),
  description: Joi.string().optional()
});

export const policyActionSchema = Joi.object({
  type: Joi.string().valid('block', 'warn', 'notify', 'log').required(),
  severity: Joi.string().valid('low', 'medium', 'high', 'critical').required(),
  message: Joi.string().required(),
  blocking: Joi.boolean().required()
});

export const policyRuleDefinitionSchema = Joi.object({
  conditions: Joi.array().items(policyConditionSchema).min(1).required(),
  actions: Joi.array().items(policyActionSchema).min(1).required()
});

export const policySchema = Joi.object({
  name: Joi.string()
    .min(1)
    .max(100)
    .pattern(/^[a-zA-Z0-9\-_\s]+$/)
    .required()
    .messages({
      'string.pattern.base': 'Policy name must contain only alphanumeric characters, hyphens, underscores, and spaces'
    }),
  
  description: Joi.string()
    .min(1)
    .max(1000)
    .required(),
  
  version: Joi.string()
    .pattern(/^\d+\.\d+\.\d+$/)
    .required()
    .messages({
      'string.pattern.base': 'Version must follow semantic versioning format (MAJOR.MINOR.PATCH)'
    }),
  
  severity: Joi.string()
    .valid('low', 'medium', 'high', 'critical')
    .required(),
  
  ruleDefinition: policyRuleDefinitionSchema.required(),
  
  metadata: Joi.object().default({})
});

export const updatePolicySchema = Joi.object({
  description: Joi.string().min(1).max(1000).optional(),
  status: Joi.string().valid('draft', 'active', 'inactive', 'deprecated').optional(),
  severity: Joi.string().valid('low', 'medium', 'high', 'critical').optional(),
  ruleDefinition: policyRuleDefinitionSchema.optional(),
  metadata: Joi.object().optional()
});

export const evaluatePolicySchema = Joi.object({
  versionId: Joi.string().uuid().required(),
  policyIds: Joi.array().items(Joi.string().uuid()).optional(),
  dryRun: Joi.boolean().default(false),
  context: Joi.object().default({})
});

export const policyExceptionSchema = Joi.object({
  versionId: Joi.string().uuid().required(),
  policyId: Joi.string().uuid().required(),
  justification: Joi.string().min(10).max(1000).required(),
  expiresAt: Joi.date().greater('now').optional()
});

// Policy query parameter schemas
export const policyQuerySchema = Joi.object({
  search: Joi.string().optional(),
  status: Joi.string().valid('draft', 'active', 'inactive', 'deprecated').optional(),
  severity: Joi.string().valid('low', 'medium', 'high', 'critical').optional(),
  createdBy: Joi.string().optional(),
  limit: Joi.number().integer().min(1).max(100).default(20),
  offset: Joi.number().integer().min(0).default(0),
  sortBy: Joi.string().valid('name', 'version', 'severity', 'createdAt', 'updatedAt').default('createdAt'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc')
});

// File upload validation
export const fileUploadSchema = Joi.object({
  fieldname: Joi.string().required(),
  originalname: Joi.string().required(),
  encoding: Joi.string().required(),
  mimetype: Joi.string().required(),
  size: Joi.number().integer().max(5 * 1024 * 1024 * 1024).required(), // 5GB max
  buffer: Joi.binary().required()
});

// Deployment Service validation schemas
export const resourceRequirementsSchema = Joi.object({
  cpu: Joi.string().pattern(/^\d+(\.\d+)?m?$/).required(),
  memory: Joi.string().pattern(/^\d+(\.\d+)?(Mi|Gi|Ti)?$/).required(),
  gpu: Joi.string().optional()
});

export const healthCheckConfigurationSchema = Joi.object({
  path: Joi.string().required(),
  port: Joi.number().integer().min(1).max(65535).required(),
  initialDelaySeconds: Joi.number().integer().min(0).default(30),
  periodSeconds: Joi.number().integer().min(1).default(10),
  timeoutSeconds: Joi.number().integer().min(1).default(5),
  failureThreshold: Joi.number().integer().min(1).default(3)
});

export const rolloutPolicySchema = Joi.object({
  maxUnavailable: Joi.string().pattern(/^\d+%?$/).default('25%'),
  maxSurge: Joi.string().pattern(/^\d+%?$/).default('25%'),
  progressDeadlineSeconds: Joi.number().integer().min(60).default(600)
});

export const deploymentConfigurationSchema = Joi.object({
  replicas: Joi.number().integer().min(1).max(100).required(),
  resources: resourceRequirementsSchema.required(),
  environment: Joi.object().pattern(Joi.string(), Joi.string()).default({}),
  healthCheck: healthCheckConfigurationSchema.required(),
  rolloutPolicy: rolloutPolicySchema.required()
});

export const sloTargetsSchema = Joi.object({
  availability: Joi.number().min(0).max(100).required(),
  latencyP95: Joi.number().integer().min(0).required(),
  latencyP99: Joi.number().integer().min(0).required(),
  errorRate: Joi.number().min(0).max(100).required()
});

export const driftThresholdsSchema = Joi.object({
  inputDrift: Joi.number().min(0).max(1).required(),
  outputDrift: Joi.number().min(0).max(1).required(),
  performanceDrift: Joi.number().min(0).max(1).required()
});

export const createDeploymentSchema = Joi.object({
  versionId: Joi.string().uuid().required(),
  environment: Joi.string().valid('staging', 'production', 'canary').required(),
  strategy: Joi.string().valid('blue_green', 'canary', 'rolling').required(),
  configuration: deploymentConfigurationSchema.required(),
  sloTargets: sloTargetsSchema.required(),
  driftThresholds: driftThresholdsSchema.required()
});

export const updateDeploymentSchema = Joi.object({
  configuration: deploymentConfigurationSchema.optional(),
  sloTargets: sloTargetsSchema.optional(),
  driftThresholds: driftThresholdsSchema.optional()
});

export const createTrafficSplitSchema = Joi.object({
  percentage: Joi.number().integer().min(0).max(100).required()
});

export const createRollbackSchema = Joi.object({
  targetVersionId: Joi.string().uuid().required(),
  reason: Joi.string().min(10).max(1000).required()
});

export const deploymentQuerySchema = Joi.object({
  environment: Joi.string().valid('staging', 'production', 'canary').optional(),
  status: Joi.string().valid(
    'pending', 'deploying', 'active', 'failed', 
    'rolling_back', 'rolled_back', 'terminated'
  ).optional(),
  versionId: Joi.string().uuid().optional(),
  deployedBy: Joi.string().uuid().optional(),
  startDate: Joi.date().optional(),
  endDate: Joi.date().optional(),
  limit: Joi.number().integer().min(1).max(100).default(20),
  offset: Joi.number().integer().min(0).default(0)
});

export const metricsQuerySchema = Joi.object({
  startTime: Joi.date().required(),
  endTime: Joi.date().greater(Joi.ref('startTime')).required(),
  granularity: Joi.string().valid('minute', 'hour', 'day').optional()
});

export const recordMetricsSchema = Joi.object({
  timestamp: Joi.date().default(() => new Date()),
  availability: Joi.number().min(0).max(100).required(),
  latencyP95: Joi.number().integer().min(0).required(),
  latencyP99: Joi.number().integer().min(0).required(),
  errorRate: Joi.number().min(0).max(100).required(),
  inputDrift: Joi.number().min(0).max(1).optional(),
  outputDrift: Joi.number().min(0).max(1).optional(),
  performanceDrift: Joi.number().min(0).max(1).optional(),
  requestCount: Joi.number().integer().min(0).default(0)
});