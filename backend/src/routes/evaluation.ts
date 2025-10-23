import { Router, Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { 
  EvaluationService,
  EvaluationExecutionEngine,
  EvaluationReportingService,
  MockTestRunner
} from '../services/evaluation/index.js';
import { DatabaseService } from '../services/database/index.js';
import { authenticateToken, requireRoles } from '../middleware/auth.js';
import {
  AuthenticatedRequest,
  UserRole,
  CreateEvaluationSuiteRequest,
  UpdateEvaluationSuiteRequest,
  CreateEvaluationDatasetRequest,
  RunEvaluationRequest,
  EvaluationSuiteStatus,
  DatasetType,
  JobPriority,
  EvaluationJobStatus
} from '../types/index.js';

const router = Router();

// Initialize services (in production, these would be dependency injected)
const dbService = new DatabaseService({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'ai_model_registry',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password'
});

const evaluationService = new EvaluationService(dbService);
const testRunner = new MockTestRunner();
const executionEngine = new EvaluationExecutionEngine(dbService, testRunner);
const reportingService = new EvaluationReportingService(dbService);

// Validation middleware
const validateEvaluationSuite = [
  body('name')
    .isLength({ min: 1, max: 100 })
    .matches(/^[a-zA-Z0-9\-_\s]+$/)
    .withMessage('Name must be 1-100 characters and contain only letters, numbers, hyphens, underscores, and spaces'),
  body('description')
    .isLength({ min: 1, max: 1000 })
    .withMessage('Description must be 1-1000 characters'),
  body('version')
    .matches(/^\d+\.\d+\.\d+$/)
    .withMessage('Version must follow semantic versioning (MAJOR.MINOR.PATCH)'),
  body('configuration')
    .isObject()
    .withMessage('Configuration must be an object'),
  body('configuration.datasets')
    .isArray()
    .withMessage('Configuration must include datasets array'),
  body('configuration.testTypes')
    .isArray()
    .withMessage('Configuration must include testTypes array'),
  body('configuration.thresholds')
    .isObject()
    .withMessage('Configuration must include thresholds object'),
  body('configuration.timeout')
    .isInt({ min: 60, max: 7200 })
    .withMessage('Timeout must be between 60 and 7200 seconds'),
];

const validateEvaluationDataset = [
  body('name')
    .isLength({ min: 1, max: 100 })
    .matches(/^[a-zA-Z0-9\-_\s]+$/)
    .withMessage('Name must be 1-100 characters and contain only letters, numbers, hyphens, underscores, and spaces'),
  body('type')
    .isIn(Object.values(DatasetType))
    .withMessage('Type must be a valid dataset type'),
  body('metadata')
    .optional()
    .isObject()
    .withMessage('Metadata must be an object'),
];

const validateRunEvaluation = [
  body('versionId')
    .isUUID()
    .withMessage('Version ID must be a valid UUID'),
  body('suiteId')
    .isUUID()
    .withMessage('Suite ID must be a valid UUID'),
  body('priority')
    .optional()
    .isIn(Object.values(JobPriority))
    .withMessage('Priority must be a valid job priority'),
  body('environment')
    .optional()
    .isObject()
    .withMessage('Environment must be an object'),
];

// Evaluation Suite Management Routes

/**
 * Create evaluation suite
 */
router.post('/suites',
  authenticateToken,
  requireRoles([UserRole.MODEL_OWNER, UserRole.MRC, UserRole.ADMIN]),
  validateEvaluationSuite,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input data',
            details: errors.array(),
            traceId: req.headers['x-trace-id'] || 'unknown'
          }
        });
      }

      const request: CreateEvaluationSuiteRequest = req.body;
      const suite = await evaluationService.createEvaluationSuite(request, req.user!.id);

      res.status(201).json(suite);
    } catch (error) {
      console.error('Error creating evaluation suite:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to create evaluation suite',
          traceId: req.headers['x-trace-id'] || 'unknown'
        }
      });
    }
  }
);

/**
 * Get evaluation suite by ID
 */
router.get('/suites/:id',
  authenticateToken,
  param('id').isUUID().withMessage('ID must be a valid UUID'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input data',
            details: errors.array(),
            traceId: req.headers['x-trace-id'] || 'unknown'
          }
        });
      }

      const suite = await evaluationService.getEvaluationSuite(req.params.id);
      
      if (!suite) {
        return res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: 'Evaluation suite not found',
            traceId: req.headers['x-trace-id'] || 'unknown'
          }
        });
      }

      res.json(suite);
    } catch (error) {
      console.error('Error getting evaluation suite:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to get evaluation suite',
          traceId: req.headers['x-trace-id'] || 'unknown'
        }
      });
    }
  }
);

/**
 * Search evaluation suites
 */
router.get('/suites',
  authenticateToken,
  query('name').optional().isString(),
  query('status').optional().isIn(Object.values(EvaluationSuiteStatus)),
  query('createdBy').optional().isString(),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('offset').optional().isInt({ min: 0 }),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid query parameters',
            details: errors.array(),
            traceId: req.headers['x-trace-id'] || 'unknown'
          }
        });
      }

      const filters = {
        name: req.query.name as string,
        status: req.query.status as EvaluationSuiteStatus,
        createdBy: req.query.createdBy as string,
        limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
        offset: req.query.offset ? parseInt(req.query.offset as string) : undefined
      };

      const result = await evaluationService.searchEvaluationSuites(filters);
      res.json(result);
    } catch (error) {
      console.error('Error searching evaluation suites:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to search evaluation suites',
          traceId: req.headers['x-trace-id'] || 'unknown'
        }
      });
    }
  }
);

/**
 * Update evaluation suite
 */
router.put('/suites/:id',
  authenticateToken,
  requireRoles([UserRole.MODEL_OWNER, UserRole.MRC, UserRole.ADMIN]),
  param('id').isUUID().withMessage('ID must be a valid UUID'),
  body('description').optional().isLength({ min: 1, max: 1000 }),
  body('status').optional().isIn(Object.values(EvaluationSuiteStatus)),
  body('configuration').optional().isObject(),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input data',
            details: errors.array(),
            traceId: req.headers['x-trace-id'] || 'unknown'
          }
        });
      }

      const request: UpdateEvaluationSuiteRequest = req.body;
      const suite = await evaluationService.updateEvaluationSuite(req.params.id, request);

      if (!suite) {
        return res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: 'Evaluation suite not found',
            traceId: req.headers['x-trace-id'] || 'unknown'
          }
        });
      }

      res.json(suite);
    } catch (error) {
      console.error('Error updating evaluation suite:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to update evaluation suite',
          traceId: req.headers['x-trace-id'] || 'unknown'
        }
      });
    }
  }
);

/**
 * Delete evaluation suite
 */
router.delete('/suites/:id',
  authenticateToken,
  requireRoles([UserRole.ADMIN]),
  param('id').isUUID().withMessage('ID must be a valid UUID'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input data',
            details: errors.array(),
            traceId: req.headers['x-trace-id'] || 'unknown'
          }
        });
      }

      const deleted = await evaluationService.deleteEvaluationSuite(req.params.id);

      if (!deleted) {
        return res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: 'Evaluation suite not found',
            traceId: req.headers['x-trace-id'] || 'unknown'
          }
        });
      }

      res.status(204).send();
    } catch (error) {
      console.error('Error deleting evaluation suite:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to delete evaluation suite',
          traceId: req.headers['x-trace-id'] || 'unknown'
        }
      });
    }
  }
);

// Evaluation Execution Routes

/**
 * Run evaluation
 */
router.post('/jobs',
  authenticateToken,
  requireRoles([UserRole.MODEL_OWNER, UserRole.MRC, UserRole.SRE, UserRole.ADMIN]),
  validateRunEvaluation,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input data',
            details: errors.array(),
            traceId: req.headers['x-trace-id'] || 'unknown'
          }
        });
      }

      const request: RunEvaluationRequest = req.body;
      const job = await executionEngine.createEvaluationJob(request);

      res.status(201).json(job);
    } catch (error) {
      console.error('Error running evaluation:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to run evaluation',
          traceId: req.headers['x-trace-id'] || 'unknown'
        }
      });
    }
  }
);

/**
 * Get evaluation job by ID
 */
router.get('/jobs/:id',
  authenticateToken,
  param('id').isUUID().withMessage('ID must be a valid UUID'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input data',
            details: errors.array(),
            traceId: req.headers['x-trace-id'] || 'unknown'
          }
        });
      }

      const job = await executionEngine.getEvaluationJob(req.params.id);
      
      if (!job) {
        return res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: 'Evaluation job not found',
            traceId: req.headers['x-trace-id'] || 'unknown'
          }
        });
      }

      res.json(job);
    } catch (error) {
      console.error('Error getting evaluation job:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to get evaluation job',
          traceId: req.headers['x-trace-id'] || 'unknown'
        }
      });
    }
  }
);

/**
 * Cancel evaluation job
 */
router.post('/jobs/:id/cancel',
  authenticateToken,
  requireRoles([UserRole.MODEL_OWNER, UserRole.MRC, UserRole.SRE, UserRole.ADMIN]),
  param('id').isUUID().withMessage('ID must be a valid UUID'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input data',
            details: errors.array(),
            traceId: req.headers['x-trace-id'] || 'unknown'
          }
        });
      }

      const cancelled = await executionEngine.cancelEvaluationJob(req.params.id);

      if (!cancelled) {
        return res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: 'Evaluation job not found or cannot be cancelled',
            traceId: req.headers['x-trace-id'] || 'unknown'
          }
        });
      }

      res.json({ message: 'Evaluation job cancelled successfully' });
    } catch (error) {
      console.error('Error cancelling evaluation job:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to cancel evaluation job',
          traceId: req.headers['x-trace-id'] || 'unknown'
        }
      });
    }
  }
);

// Evaluation Reporting Routes

/**
 * Get evaluation history
 */
router.get('/history',
  authenticateToken,
  query('versionId').optional().isUUID(),
  query('suiteId').optional().isUUID(),
  query('status').optional().isIn(Object.values(EvaluationJobStatus)),
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601(),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('offset').optional().isInt({ min: 0 }),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid query parameters',
            details: errors.array(),
            traceId: req.headers['x-trace-id'] || 'unknown'
          }
        });
      }

      const query = {
        versionId: req.query.versionId as string,
        suiteId: req.query.suiteId as string,
        status: req.query.status as EvaluationJobStatus,
        startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
        endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
        offset: req.query.offset ? parseInt(req.query.offset as string) : undefined
      };

      const result = await reportingService.getEvaluationHistory(query);
      res.json(result);
    } catch (error) {
      console.error('Error getting evaluation history:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to get evaluation history',
          traceId: req.headers['x-trace-id'] || 'unknown'
        }
      });
    }
  }
);

/**
 * Get evaluation visualization data
 */
router.get('/visualization',
  authenticateToken,
  query('versionId').optional().isUUID(),
  query('suiteId').optional().isUUID(),
  query('days').optional().isInt({ min: 1, max: 365 }),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid query parameters',
            details: errors.array(),
            traceId: req.headers['x-trace-id'] || 'unknown'
          }
        });
      }

      const versionId = req.query.versionId as string;
      const suiteId = req.query.suiteId as string;
      const days = req.query.days ? parseInt(req.query.days as string) : 30;

      const data = await reportingService.getEvaluationVisualizationData(versionId, suiteId, days);
      res.json(data);
    } catch (error) {
      console.error('Error getting evaluation visualization data:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to get evaluation visualization data',
          traceId: req.headers['x-trace-id'] || 'unknown'
        }
      });
    }
  }
);

export default router;