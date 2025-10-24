import express from 'express';
import { CicdIntegrationService } from '../services/cicd/cicdIntegrationService';
import { WebhookService } from '../services/cicd/webhookService';
import { CommitTrackingService } from '../services/cicd/commitTrackingService';
import { PipelineValidationService } from '../services/cicd/pipelineValidationService';
import { DatabaseService } from '../services/database/databaseService';
import { PolicyEngineService } from '../services/policyEngine/policyEngineService';
import { AuditService } from '../services/audit/auditService';
import { authMiddleware } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { body, param, query } from 'express-validator';

const router = express.Router();

// Initialize services
const db = new DatabaseService();
const auditService = new AuditService(db);
const policyEngine = new PolicyEngineService(db, auditService);
const webhookService = new WebhookService(auditService);
const commitTrackingService = new CommitTrackingService(db);
const pipelineValidationService = new PipelineValidationService(db, policyEngine, auditService);
const cicdService = new CicdIntegrationService(
  db,
  webhookService,
  commitTrackingService,
  pipelineValidationService
);

/**
 * @swagger
 * /api/v1/cicd/providers:
 *   post:
 *     summary: Register a CI/CD provider
 *     tags: [CI/CD Integration]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, type, config]
 *             properties:
 *               name:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [github, gitlab, bitbucket]
 *               config:
 *                 type: object
 *                 properties:
 *                   baseUrl:
 *                     type: string
 *                   token:
 *                     type: string
 *                   webhookSecret:
 *                     type: string
 */
router.post('/providers',
  authMiddleware,
  [
    body('name').isString().notEmpty(),
    body('type').isIn(['github', 'gitlab', 'bitbucket']),
    body('config.baseUrl').isURL(),
    body('config.token').isString().notEmpty(),
    body('config.webhookSecret').isString().notEmpty()
  ],
  validateRequest,
  async (req, res) => {
    try {
      await cicdService.registerProvider(req.body);
      res.status(201).json({ message: 'Provider registered successfully' });
    } catch (error) {
      console.error('Error registering CI/CD provider:', error);
      res.status(500).json({ error: 'Failed to register provider' });
    }
  }
);

/**
 * @swagger
 * /api/v1/cicd/providers:
 *   get:
 *     summary: List all CI/CD providers
 *     tags: [CI/CD Integration]
 *     security:
 *       - bearerAuth: []
 */
router.get('/providers',
  authMiddleware,
  async (req, res) => {
    try {
      const providers = await cicdService.listProviders();
      res.json(providers);
    } catch (error) {
      console.error('Error listing CI/CD providers:', error);
      res.status(500).json({ error: 'Failed to list providers' });
    }
  }
);

/**
 * @swagger
 * /api/v1/cicd/providers/{name}:
 *   delete:
 *     summary: Remove a CI/CD provider
 *     tags: [CI/CD Integration]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 */
router.delete('/providers/:name',
  authMiddleware,
  [param('name').isString().notEmpty()],
  validateRequest,
  async (req, res) => {
    try {
      await cicdService.removeProvider(req.params.name);
      res.json({ message: 'Provider removed successfully' });
    } catch (error) {
      console.error('Error removing CI/CD provider:', error);
      res.status(500).json({ error: 'Failed to remove provider' });
    }
  }
);

/**
 * @swagger
 * /api/v1/cicd/webhooks/{providerName}:
 *   post:
 *     summary: Handle webhook from CI/CD provider
 *     tags: [CI/CD Integration]
 *     parameters:
 *       - in: path
 *         name: providerName
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 */
router.post('/webhooks/:providerName',
  [param('providerName').isString().notEmpty()],
  validateRequest,
  async (req, res) => {
    try {
      const signature = req.headers['x-hub-signature-256'] || 
                       req.headers['x-gitlab-token'] || 
                       req.headers['x-hook-uuid'] || '';
      
      const result = await cicdService.handleWebhook(
        req.params.providerName,
        signature as string,
        JSON.stringify(req.body)
      );

      if (result.success) {
        res.json({ message: result.message });
      } else {
        res.status(400).json({ error: result.message });
      }
    } catch (error) {
      console.error('Error handling webhook:', error);
      res.status(500).json({ error: 'Failed to process webhook' });
    }
  }
);

/**
 * @swagger
 * /api/v1/cicd/commits/{modelId}:
 *   get:
 *     summary: Get commit history for a model
 *     tags: [CI/CD Integration]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: modelId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: versionId
 *         schema:
 *           type: string
 */
router.get('/commits/:modelId',
  authMiddleware,
  [param('modelId').isString().notEmpty()],
  validateRequest,
  async (req, res) => {
    try {
      const commits = await commitTrackingService.getCommitHistory(
        req.params.modelId,
        req.query.versionId as string
      );
      res.json(commits);
    } catch (error) {
      console.error('Error getting commit history:', error);
      res.status(500).json({ error: 'Failed to get commit history' });
    }
  }
);

/**
 * @swagger
 * /api/v1/cicd/commits/{sha}/link:
 *   post:
 *     summary: Link a commit to a model version
 *     tags: [CI/CD Integration]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sha
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [modelId, versionId]
 *             properties:
 *               modelId:
 *                 type: string
 *               versionId:
 *                 type: string
 */
router.post('/commits/:sha/link',
  authMiddleware,
  [
    param('sha').isString().notEmpty(),
    body('modelId').isString().notEmpty(),
    body('versionId').isString().notEmpty()
  ],
  validateRequest,
  async (req, res) => {
    try {
      await commitTrackingService.linkCommitToModel(
        req.params.sha,
        req.body.modelId,
        req.body.versionId
      );
      res.json({ message: 'Commit linked successfully' });
    } catch (error) {
      console.error('Error linking commit:', error);
      res.status(500).json({ error: 'Failed to link commit' });
    }
  }
);

/**
 * @swagger
 * /api/v1/cicd/validations/trigger:
 *   post:
 *     summary: Trigger pipeline validation
 *     tags: [CI/CD Integration]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [commitSha, modelId, versionId]
 *             properties:
 *               commitSha:
 *                 type: string
 *               modelId:
 *                 type: string
 *               versionId:
 *                 type: string
 */
router.post('/validations/trigger',
  authMiddleware,
  [
    body('commitSha').isString().notEmpty(),
    body('modelId').isString().notEmpty(),
    body('versionId').isString().notEmpty()
  ],
  validateRequest,
  async (req, res) => {
    try {
      const validationId = await cicdService.triggerPipelineValidation(
        req.body.commitSha,
        req.body.modelId,
        req.body.versionId
      );
      res.status(201).json({ validationId });
    } catch (error) {
      console.error('Error triggering validation:', error);
      res.status(500).json({ error: 'Failed to trigger validation' });
    }
  }
);

/**
 * @swagger
 * /api/v1/cicd/validations/{validationId}:
 *   get:
 *     summary: Get pipeline validation result
 *     tags: [CI/CD Integration]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: validationId
 *         required: true
 *         schema:
 *           type: string
 */
router.get('/validations/:validationId',
  authMiddleware,
  [param('validationId').isString().notEmpty()],
  validateRequest,
  async (req, res) => {
    try {
      const validation = await pipelineValidationService.getPipelineValidation(
        req.params.validationId
      );
      
      if (!validation) {
        return res.status(404).json({ error: 'Validation not found' });
      }
      
      res.json(validation);
    } catch (error) {
      console.error('Error getting validation:', error);
      res.status(500).json({ error: 'Failed to get validation' });
    }
  }
);

/**
 * @swagger
 * /api/v1/cicd/validations/{validationId}/status:
 *   get:
 *     summary: Get status check for external CI/CD system
 *     tags: [CI/CD Integration]
 *     parameters:
 *       - in: path
 *         name: validationId
 *         required: true
 *         schema:
 *           type: string
 */
router.get('/validations/:validationId/status',
  [param('validationId').isString().notEmpty()],
  validateRequest,
  async (req, res) => {
    try {
      const statusCheck = await cicdService.getStatusCheck(req.params.validationId);
      res.json(statusCheck);
    } catch (error) {
      console.error('Error getting status check:', error);
      res.status(500).json({ error: 'Failed to get status check' });
    }
  }
);

/**
 * @swagger
 * /api/v1/cicd/validations/history/{modelId}:
 *   get:
 *     summary: Get validation history for a model
 *     tags: [CI/CD Integration]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: modelId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 */
router.get('/validations/history/:modelId',
  authMiddleware,
  [
    param('modelId').isString().notEmpty(),
    query('limit').optional().isInt({ min: 1, max: 100 })
  ],
  validateRequest,
  async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const history = await pipelineValidationService.getValidationHistory(
        req.params.modelId,
        limit
      );
      res.json(history);
    } catch (error) {
      console.error('Error getting validation history:', error);
      res.status(500).json({ error: 'Failed to get validation history' });
    }
  }
);

/**
 * @swagger
 * /api/v1/cicd/repository/{repositoryUrl}/status:
 *   get:
 *     summary: Get integration status for a repository
 *     tags: [CI/CD Integration]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: repositoryUrl
 *         required: true
 *         schema:
 *           type: string
 */
router.get('/repository/:repositoryUrl/status',
  authMiddleware,
  [param('repositoryUrl').isString().notEmpty()],
  validateRequest,
  async (req, res) => {
    try {
      const status = await cicdService.getRepositoryIntegrationStatus(
        decodeURIComponent(req.params.repositoryUrl)
      );
      res.json(status);
    } catch (error) {
      console.error('Error getting repository status:', error);
      res.status(500).json({ error: 'Failed to get repository status' });
    }
  }
);

export default router;