import express from 'express';
import { MlPlatformIntegrationService } from '../services/mlPlatforms/mlPlatformIntegrationService';
import { DatabaseService } from '../services/database/databaseService';
import { AuditService } from '../services/audit/auditService';
import { authMiddleware } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { body, param, query } from 'express-validator';

const router = express.Router();

// Initialize services
const db = new DatabaseService();
const auditService = new AuditService(db);
const mlPlatformService = new MlPlatformIntegrationService(db, auditService);

/**
 * @swagger
 * /api/v1/ml-platforms:
 *   post:
 *     summary: Register an ML platform
 *     tags: [ML Platform Integration]
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
 *                 enum: [mlflow, huggingface, sagemaker, vertexai]
 *               config:
 *                 type: object
 */
router.post('/',
  authMiddleware,
  [
    body('name').isString().notEmpty(),
    body('type').isIn(['mlflow', 'huggingface', 'sagemaker', 'vertexai']),
    body('config').isObject()
  ],
  validateRequest,
  async (req, res) => {
    try {
      await mlPlatformService.registerPlatform(req.body);
      res.status(201).json({ message: 'Platform registered successfully' });
    } catch (error) {
      console.error('Error registering ML platform:', error);
      res.status(500).json({ error: 'Failed to register platform' });
    }
  }
);

/**
 * @swagger
 * /api/v1/ml-platforms:
 *   get:
 *     summary: List all ML platforms
 *     tags: [ML Platform Integration]
 *     security:
 *       - bearerAuth: []
 */
router.get('/',
  authMiddleware,
  async (req, res) => {
    try {
      const platforms = await mlPlatformService.listPlatforms();
      res.json(platforms);
    } catch (error) {
      console.error('Error listing ML platforms:', error);
      res.status(500).json({ error: 'Failed to list platforms' });
    }
  }
);

/**
 * @swagger
 * /api/v1/ml-platforms/{name}:
 *   delete:
 *     summary: Remove an ML platform
 *     tags: [ML Platform Integration]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 */
router.delete('/:name',
  authMiddleware,
  [param('name').isString().notEmpty()],
  validateRequest,
  async (req, res) => {
    try {
      await mlPlatformService.removePlatform(req.params.name);
      res.json({ message: 'Platform removed successfully' });
    } catch (error) {
      console.error('Error removing ML platform:', error);
      res.status(500).json({ error: 'Failed to remove platform' });
    }
  }
);

/**
 * @swagger
 * /api/v1/ml-platforms/{name}/test:
 *   post:
 *     summary: Test connection to an ML platform
 *     tags: [ML Platform Integration]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 */
router.post('/:name/test',
  authMiddleware,
  [param('name').isString().notEmpty()],
  validateRequest,
  async (req, res) => {
    try {
      const isConnected = await mlPlatformService.testPlatformConnection(req.params.name);
      res.json({ connected: isConnected });
    } catch (error) {
      console.error('Error testing platform connection:', error);
      res.status(500).json({ error: 'Failed to test connection' });
    }
  }
);

/**
 * @swagger
 * /api/v1/ml-platforms/{name}/models:
 *   get:
 *     summary: List models from an ML platform
 *     tags: [ML Platform Integration]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 */
router.get('/:name/models',
  authMiddleware,
  [
    param('name').isString().notEmpty(),
    query('limit').optional().isInt({ min: 1, max: 1000 }),
    query('offset').optional().isInt({ min: 0 })
  ],
  validateRequest,
  async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const offset = parseInt(req.query.offset as string) || 0;
      
      const models = await mlPlatformService.listPlatformModels(
        req.params.name,
        limit,
        offset
      );
      res.json(models);
    } catch (error) {
      console.error('Error listing platform models:', error);
      res.status(500).json({ error: 'Failed to list models' });
    }
  }
);

/**
 * @swagger
 * /api/v1/ml-platforms/{name}/models/{modelId}:
 *   get:
 *     summary: Get model details from an ML platform
 *     tags: [ML Platform Integration]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: modelId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: version
 *         schema:
 *           type: string
 */
router.get('/:name/models/:modelId',
  authMiddleware,
  [
    param('name').isString().notEmpty(),
    param('modelId').isString().notEmpty()
  ],
  validateRequest,
  async (req, res) => {
    try {
      const model = await mlPlatformService.getPlatformModel(
        req.params.name,
        req.params.modelId,
        req.query.version as string
      );
      
      if (!model) {
        return res.status(404).json({ error: 'Model not found' });
      }
      
      res.json(model);
    } catch (error) {
      console.error('Error getting platform model:', error);
      res.status(500).json({ error: 'Failed to get model' });
    }
  }
);

/**
 * @swagger
 * /api/v1/ml-platforms/{name}/models/search:
 *   get:
 *     summary: Search models in an ML platform
 *     tags: [ML Platform Integration]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 */
router.get('/:name/models/search',
  authMiddleware,
  [
    param('name').isString().notEmpty(),
    query('q').isString().notEmpty()
  ],
  validateRequest,
  async (req, res) => {
    try {
      const models = await mlPlatformService.searchPlatformModels(
        req.params.name,
        req.query.q as string,
        req.query
      );
      res.json(models);
    } catch (error) {
      console.error('Error searching platform models:', error);
      res.status(500).json({ error: 'Failed to search models' });
    }
  }
);

/**
 * @swagger
 * /api/v1/ml-platforms/{name}/import:
 *   post:
 *     summary: Import model from ML platform
 *     tags: [ML Platform Integration]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [modelId, version]
 *             properties:
 *               modelId:
 *                 type: string
 *               version:
 *                 type: string
 *               options:
 *                 type: object
 *                 properties:
 *                   includeArtifacts:
 *                     type: boolean
 *                     default: true
 *                   includeMetrics:
 *                     type: boolean
 *                     default: true
 *                   includeParameters:
 *                     type: boolean
 *                     default: true
 *                   targetGroup:
 *                     type: string
 *                   overwriteExisting:
 *                     type: boolean
 *                     default: false
 */
router.post('/:name/import',
  authMiddleware,
  [
    param('name').isString().notEmpty(),
    body('modelId').isString().notEmpty(),
    body('version').isString().notEmpty(),
    body('options').optional().isObject()
  ],
  validateRequest,
  async (req, res) => {
    try {
      const options = {
        includeArtifacts: true,
        includeMetrics: true,
        includeParameters: true,
        overwriteExisting: false,
        ...req.body.options
      };

      const result = await mlPlatformService.importModel(
        req.params.name,
        req.body.modelId,
        req.body.version,
        options,
        req.user.id
      );

      if (result.success) {
        res.status(201).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      console.error('Error importing model:', error);
      res.status(500).json({ error: 'Failed to import model' });
    }
  }
);

/**
 * @swagger
 * /api/v1/ml-platforms/{name}/export:
 *   post:
 *     summary: Export model to ML platform
 *     tags: [ML Platform Integration]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: name
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
 *               options:
 *                 type: object
 *                 properties:
 *                   includeArtifacts:
 *                     type: boolean
 *                     default: true
 *                   includeMetadata:
 *                     type: boolean
 *                     default: true
 *                   format:
 *                     type: string
 *                     enum: [mlflow, huggingface, native]
 *                     default: native
 */
router.post('/:name/export',
  authMiddleware,
  [
    param('name').isString().notEmpty(),
    body('modelId').isString().notEmpty(),
    body('versionId').isString().notEmpty(),
    body('options').optional().isObject()
  ],
  validateRequest,
  async (req, res) => {
    try {
      const options = {
        includeArtifacts: true,
        includeMetadata: true,
        format: 'native' as const,
        ...req.body.options
      };

      const result = await mlPlatformService.exportModel(
        req.params.name,
        req.body.modelId,
        req.body.versionId,
        options,
        req.user.id
      );

      if (result.success) {
        res.status(201).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      console.error('Error exporting model:', error);
      res.status(500).json({ error: 'Failed to export model' });
    }
  }
);

/**
 * @swagger
 * /api/v1/ml-platforms/integrations/{modelId}:
 *   get:
 *     summary: Get integration history for a model
 *     tags: [ML Platform Integration]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: modelId
 *         required: true
 *         schema:
 *           type: string
 */
router.get('/integrations/:modelId',
  authMiddleware,
  [param('modelId').isString().notEmpty()],
  validateRequest,
  async (req, res) => {
    try {
      const history = await mlPlatformService.getIntegrationHistory(req.params.modelId);
      res.json(history);
    } catch (error) {
      console.error('Error getting integration history:', error);
      res.status(500).json({ error: 'Failed to get integration history' });
    }
  }
);

export default router;