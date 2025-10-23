import { Router } from 'express';
import { PolicyEngineService } from '../services/policyEngine/index.js';
import { authenticate, requireAnyRole } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validation.js';
import { 
  policySchema, 
  updatePolicySchema, 
  evaluatePolicySchema, 
  policyExceptionSchema,
  policyQuerySchema,
  uuidSchema 
} from '../validation/schemas.js';
import { UserRole, AuthenticatedRequest, VersionState } from '../types/index.js';
import Joi from 'joi';

export function createPolicyEngineRoutes(policyEngineService: PolicyEngineService, authService: any): Router {
  const router = Router();

/**
 * @route POST /api/v1/policies
 * @desc Create a new policy
 * @access Private (Security Architect, Admin)
 */
router.post('/', 
  authenticate(authService),
  requireAnyRole(UserRole.SECURITY_ARCHITECT, UserRole.ADMIN),
  validateRequest({ body: policySchema }),
  async (req: AuthenticatedRequest, res) => {
    try {
      const policy = await policyEngineService.createPolicy(req.body, req.user!.id);
      res.status(201).json(policy);
    } catch (error: any) {
      if (error.message.includes('already exists')) {
        res.status(409).json({ error: { message: error.message } });
      } else {
        res.status(400).json({ error: { message: error.message } });
      }
    }
  }
);

/**
 * @route GET /api/v1/policies
 * @desc Get policies with filtering and pagination
 * @access Private (All authenticated users)
 */
router.get('/',
  authenticate(authService),
  validateRequest({ query: policyQuerySchema }),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { search, status, severity, createdBy, limit, offset, sortBy, sortOrder } = req.query as any;
      
      const page = Math.floor(offset / limit) + 1;
      const pageSize = limit;
      
      const filters = {
        search,
        status,
        severity,
        createdBy
      };

      const result = await policyEngineService.searchPolicies(filters, page, pageSize);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }
);

/**
 * @route GET /api/v1/policies/active
 * @desc Get all active policies
 * @access Private (All authenticated users)
 */
router.get('/active',
  authenticate(authService),
  async (req: AuthenticatedRequest, res) => {
    try {
      const policies = await policyEngineService.getActivePolicies();
      res.json(policies);
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }
);

/**
 * @route GET /api/v1/policies/:id
 * @desc Get policy by ID
 * @access Private (All authenticated users)
 */
router.get('/:id',
  authenticate(authService),
  validateRequest({ params: { id: uuidSchema } }),
  async (req: AuthenticatedRequest, res) => {
    try {
      const policy = await policyEngineService.getPolicyById(req.params.id);
      
      if (!policy) {
        return res.status(404).json({ error: { message: 'Policy not found' } });
      }
      
      res.json(policy);
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }
);

/**
 * @route PUT /api/v1/policies/:id
 * @desc Update policy
 * @access Private (Security Architect, Admin)
 */
router.put('/:id',
  authenticate(authService),
  requireAnyRole(UserRole.SECURITY_ARCHITECT, UserRole.ADMIN),
  validateRequest({ 
    params: { id: uuidSchema },
    body: updatePolicySchema 
  }),
  async (req: AuthenticatedRequest, res) => {
    try {
      const policy = await policyEngineService.updatePolicy(req.params.id, req.body, req.user!.id);
      res.json(policy);
    } catch (error: any) {
      if (error.message.includes('not found')) {
        res.status(404).json({ error: { message: error.message } });
      } else {
        res.status(400).json({ error: { message: error.message } });
      }
    }
  }
);

/**
 * @route POST /api/v1/policies/evaluate
 * @desc Evaluate policies for a model version
 * @access Private (Model Owner, MRC, Security Architect, SRE, Admin)
 */
router.post('/evaluate',
  authenticate(authService),
  requireAnyRole(UserRole.MODEL_OWNER, UserRole.MRC, UserRole.SECURITY_ARCHITECT, UserRole.SRE, UserRole.ADMIN),
  validateRequest({ body: evaluatePolicySchema }),
  async (req: AuthenticatedRequest, res) => {
    try {
      const evaluation = await policyEngineService.evaluatePolicies(req.body, req.user!.id);
      res.json(evaluation);
    } catch (error: any) {
      if (error.message.includes('not found')) {
        res.status(404).json({ error: { message: error.message } });
      } else {
        res.status(400).json({ error: { message: error.message } });
      }
    }
  }
);

/**
 * @route GET /api/v1/policies/evaluations/:id
 * @desc Get evaluation results by evaluation ID
 * @access Private (All authenticated users)
 */
router.get('/evaluations/:id',
  authenticate(authService),
  validateRequest({ params: { id: uuidSchema } }),
  async (req: AuthenticatedRequest, res) => {
    try {
      const evaluation = await policyEngineService.getEvaluationResults(req.params.id);
      
      if (!evaluation) {
        return res.status(404).json({ error: { message: 'Evaluation not found' } });
      }
      
      res.json(evaluation);
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }
);

/**
 * @route POST /api/v1/policies/exceptions
 * @desc Create policy exception
 * @access Private (MRC, Security Architect, Admin)
 */
router.post('/exceptions',
  authenticate(authService),
  requireAnyRole(UserRole.MRC, UserRole.SECURITY_ARCHITECT, UserRole.ADMIN),
  validateRequest({ body: policyExceptionSchema }),
  async (req: AuthenticatedRequest, res) => {
    try {
      const exception = await policyEngineService.createPolicyException(req.body, req.user!.id);
      res.status(201).json(exception);
    } catch (error: any) {
      if (error.message.includes('already exists')) {
        res.status(409).json({ error: { message: error.message } });
      } else if (error.message.includes('not found')) {
        res.status(404).json({ error: { message: error.message } });
      } else {
        res.status(400).json({ error: { message: error.message } });
      }
    }
  }
);

/**
 * @route GET /api/v1/policies/versions/:versionId/exceptions
 * @desc Get policy exceptions for a version
 * @access Private (All authenticated users)
 */
router.get('/versions/:versionId/exceptions',
  authenticate(authService),
  validateRequest({ params: { versionId: uuidSchema } }),
  async (req: AuthenticatedRequest, res) => {
    try {
      const exceptions = await policyEngineService.getVersionPolicyExceptions(req.params.versionId);
      res.json(exceptions);
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }
);

/**
 * @route GET /api/v1/policies/versions/:versionId/blocking-violations
 * @desc Check if version has blocking policy violations
 * @access Private (All authenticated users)
 */
router.get('/versions/:versionId/blocking-violations',
  authenticate(authService),
  validateRequest({ params: { versionId: uuidSchema } }),
  async (req: AuthenticatedRequest, res) => {
    try {
      const hasViolations = await policyEngineService.hasBlockingViolations(req.params.versionId);
      res.json({ hasBlockingViolations: hasViolations });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }
);

/**
 * @route POST /api/v1/policies/versions/:versionId/check-promotion
 * @desc Check if version promotion is allowed
 * @access Private (Model Owner, MRC, Security Architect, SRE, Admin)
 */
router.post('/versions/:versionId/check-promotion',
  authenticate(authService),
  requireAnyRole(UserRole.MODEL_OWNER, UserRole.MRC, UserRole.SECURITY_ARCHITECT, UserRole.SRE, UserRole.ADMIN),
  validateRequest({ 
    params: { versionId: uuidSchema },
    body: Joi.object({
      fromState: Joi.string().valid(...Object.values(VersionState)).required(),
      toState: Joi.string().valid(...Object.values(VersionState)).required(),
      bypassPolicies: Joi.boolean().default(false)
    })
  }),
  async (req: AuthenticatedRequest, res) => {
    try {
      // This would use PolicyBlockingService in a real implementation
      // For now, return a basic response
      const { fromState, toState, bypassPolicies } = req.body;
      
      if (bypassPolicies && !req.user!.roles.includes(UserRole.ADMIN)) {
        return res.status(403).json({ 
          error: { message: 'Only administrators can bypass policies' } 
        });
      }

      // Mock response - in real implementation would use PolicyBlockingService
      res.json({
        allowed: true,
        blockingReasons: [],
        blockingPolicies: [],
        warnings: []
      });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }
);

/**
 * @route GET /api/v1/policies/versions/:versionId/compliance-summary
 * @desc Get policy compliance summary for a version
 * @access Private (All authenticated users)
 */
router.get('/versions/:versionId/compliance-summary',
  authenticate(authService),
  validateRequest({ params: { versionId: uuidSchema } }),
  async (req: AuthenticatedRequest, res) => {
    try {
      // Mock compliance summary - in real implementation would use PolicyBlockingService
      res.json({
        totalPolicies: 5,
        passingPolicies: 4,
        failingPolicies: 1,
        warningPolicies: 0,
        blockingViolations: 0,
        exceptions: 1,
        complianceScore: 80,
        lastEvaluated: new Date()
      });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }
);

  return router;
}