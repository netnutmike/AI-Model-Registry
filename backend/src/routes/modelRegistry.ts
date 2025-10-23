import { Router, Request, Response } from 'express';
import { ModelRegistryService } from '../services/modelRegistry/index.js';
import { authenticate, requireAnyRole } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validation.js';
import { 
  AuthenticatedRequest, 
  UserRole, 
  CreateModelRequest, 
  CreateVersionRequest,
  CreateArtifactRequest,
  VersionState,
  RiskTier,
  ArtifactType
} from '../types/index.js';
import Joi from 'joi';

// Validation schemas
const createModelSchema = Joi.object({
  name: Joi.string().pattern(/^[a-zA-Z0-9\-_]+$/).min(1).max(100).required(),
  group: Joi.string().pattern(/^[a-zA-Z0-9\-_]+$/).min(1).max(50).required(),
  description: Joi.string().min(1).max(1000).required(),
  owners: Joi.array().items(Joi.string().email()).min(1).required(),
  riskTier: Joi.string().valid(...Object.values(RiskTier)).required(),
  tags: Joi.array().items(Joi.string().max(50)).optional()
});

const createVersionSchema = Joi.object({
  version: Joi.string().pattern(/^\d+\.\d+\.\d+$/).required(),
  commitSha: Joi.string().pattern(/^[a-f0-9]{40}$/).required(),
  trainingJobId: Joi.string().max(255).optional(),
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

const createArtifactSchema = Joi.object({
  type: Joi.string().valid(...Object.values(ArtifactType)).required(),
  license: Joi.string().max(255).optional()
});

const updateModelSchema = Joi.object({
  description: Joi.string().min(1).max(1000).optional(),
  owners: Joi.array().items(Joi.string().email()).min(1).optional(),
  riskTier: Joi.string().valid(...Object.values(RiskTier)).optional(),
  tags: Joi.array().items(Joi.string().max(50)).optional()
}).min(1);

const updateVersionStateSchema = Joi.object({
  state: Joi.string().valid(...Object.values(VersionState)).required()
});

const completeArtifactUploadSchema = Joi.object({
  uri: Joi.string().uri().required(),
  size: Joi.number().integer().min(1).required(),
  sha256: Joi.string().pattern(/^[a-f0-9]{64}$/).optional()
});

const trackDatasetLineageSchema = Joi.object({
  datasetName: Joi.string().min(1).max(255).required(),
  datasetVersion: Joi.string().min(1).max(50).required(),
  datasetUri: Joi.string().uri().required()
});

const trackCommitLineageSchema = Joi.object({
  commitSha: Joi.string().pattern(/^[a-f0-9]{40}$/).required(),
  repositoryUrl: Joi.string().uri().required()
});

const trackTrainingRunLineageSchema = Joi.object({
  trainingRunId: Joi.string().min(1).max(255).required(),
  trainingRunUri: Joi.string().uri().required(),
  hyperparameters: Joi.object().required()
});

export function createModelRegistryRoutes(modelRegistryService: ModelRegistryService, authService: any): Router {
  const router = Router();

  /**
   * Create a new model
   */
  router.post('/models',
    authenticate(authService),
    requireAnyRole(UserRole.MODEL_OWNER, UserRole.ADMIN),
    validateRequest(createModelSchema),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const request = req.body as CreateModelRequest;
        const model = await modelRegistryService.createModel(request, req.user!.id);
        
        res.status(201).json({
          success: true,
          data: model
        });
      } catch (error: any) {
        console.error('Create model error:', error);
        
        if (error.message.includes('already exists')) {
          return res.status(409).json({
            error: {
              code: 'MODEL_EXISTS',
              message: error.message
            }
          });
        }
        
        res.status(500).json({
          error: {
            code: 'CREATE_MODEL_FAILED',
            message: 'Failed to create model'
          }
        });
      }
    }
  );

  /**
   * Search and list models
   */
  router.get('/models', authenticate(authService), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const {
        group,
        riskTier,
        tags,
        owners,
        state,
        search,
        page = '1',
        pageSize = '20'
      } = req.query;

      const filters: any = {};
      
      if (group) filters.group = group as string;
      if (riskTier) filters.riskTier = riskTier as RiskTier;
      if (tags) filters.tags = Array.isArray(tags) ? tags as string[] : [tags as string];
      if (owners) filters.owners = Array.isArray(owners) ? owners as string[] : [owners as string];
      if (state) filters.state = state as VersionState;
      if (search) filters.search = search as string;

      const pageNum = Math.max(1, parseInt(page as string) || 1);
      const pageSizeNum = Math.min(100, Math.max(1, parseInt(pageSize as string) || 20));

      const result = await modelRegistryService.searchModels(filters, pageNum, pageSizeNum);
      
      res.json({
        success: true,
        data: result
      });
    } catch (error: any) {
      console.error('Search models error:', error);
      res.status(500).json({
        error: {
          code: 'SEARCH_MODELS_FAILED',
          message: 'Failed to search models'
        }
      });
    }
  });

  /**
   * Get model by ID
   */
  router.get('/models/:modelId', authenticate(authService), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { modelId } = req.params;
      const model = await modelRegistryService.getModelById(modelId);
      
      if (!model) {
        return res.status(404).json({
          error: {
            code: 'MODEL_NOT_FOUND',
            message: 'Model not found'
          }
        });
      }
      
      res.json({
        success: true,
        data: model
      });
    } catch (error: any) {
      console.error('Get model error:', error);
      res.status(500).json({
        error: {
          code: 'GET_MODEL_FAILED',
          message: 'Failed to get model'
        }
      });
    }
  });

  /**
   * Update model
   */
  router.put('/models/:modelId',
    authenticate(authService),
    requireAnyRole(UserRole.MODEL_OWNER, UserRole.ADMIN),
    validateRequest(updateModelSchema),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { modelId } = req.params;
        const updates = req.body;
        
        const model = await modelRegistryService.updateModel(modelId, updates, req.user!.id);
        
        res.json({
          success: true,
          data: model
        });
      } catch (error: any) {
        console.error('Update model error:', error);
        
        if (error.message === 'Model not found') {
          return res.status(404).json({
            error: {
              code: 'MODEL_NOT_FOUND',
              message: 'Model not found'
            }
          });
        }
        
        if (error.message.includes('already exists')) {
          return res.status(409).json({
            error: {
              code: 'MODEL_NAME_EXISTS',
              message: error.message
            }
          });
        }
        
        res.status(500).json({
          error: {
            code: 'UPDATE_MODEL_FAILED',
            message: 'Failed to update model'
          }
        });
      }
    }
  );

  /**
   * Create a new model version
   */
  router.post('/models/:modelId/versions',
    authenticate(authService),
    requireAnyRole(UserRole.MODEL_OWNER, UserRole.ADMIN),
    validateRequest(createVersionSchema),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { modelId } = req.params;
        const request = req.body as CreateVersionRequest;
        
        const version = await modelRegistryService.createVersion(modelId, request, req.user!.id);
        
        res.status(201).json({
          success: true,
          data: version
        });
      } catch (error: any) {
        console.error('Create version error:', error);
        
        if (error.message === 'Model not found') {
          return res.status(404).json({
            error: {
              code: 'MODEL_NOT_FOUND',
              message: 'Model not found'
            }
          });
        }
        
        if (error.message.includes('already exists')) {
          return res.status(409).json({
            error: {
              code: 'VERSION_EXISTS',
              message: error.message
            }
          });
        }
        
        res.status(500).json({
          error: {
            code: 'CREATE_VERSION_FAILED',
            message: 'Failed to create version'
          }
        });
      }
    }
  );

  /**
   * Get model versions
   */
  router.get('/models/:modelId/versions', authenticate(authService), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { modelId } = req.params;
      const versions = await modelRegistryService.getModelVersions(modelId);
      
      res.json({
        success: true,
        data: versions
      });
    } catch (error: any) {
      console.error('Get versions error:', error);
      res.status(500).json({
        error: {
          code: 'GET_VERSIONS_FAILED',
          message: 'Failed to get model versions'
        }
      });
    }
  });

  /**
   * Get specific model version
   */
  router.get('/models/:modelId/versions/:version', authenticate(authService), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { modelId, version: versionNumber } = req.params;
      
      // First get all versions for the model to find the one with matching version number
      const versions = await modelRegistryService.getModelVersions(modelId);
      const version = versions.find(v => v.version === versionNumber);
      
      if (!version) {
        return res.status(404).json({
          error: {
            code: 'VERSION_NOT_FOUND',
            message: 'Version not found'
          }
        });
      }
      
      res.json({
        success: true,
        data: version
      });
    } catch (error: any) {
      console.error('Get version error:', error);
      res.status(500).json({
        error: {
          code: 'GET_VERSION_FAILED',
          message: 'Failed to get version'
        }
      });
    }
  });

  /**
   * Update version state
   */
  router.patch('/models/:modelId/versions/:version/state',
    authenticate(authService),
    requireAnyRole(UserRole.MODEL_OWNER, UserRole.MRC, UserRole.SECURITY_ARCHITECT, UserRole.ADMIN),
    validateRequest(updateVersionStateSchema),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { modelId, version: versionNumber } = req.params;
        const { state } = req.body;
        
        // Find version by model ID and version number
        const versions = await modelRegistryService.getModelVersions(modelId);
        const version = versions.find(v => v.version === versionNumber);
        
        if (!version) {
          return res.status(404).json({
            error: {
              code: 'VERSION_NOT_FOUND',
              message: 'Version not found'
            }
          });
        }
        
        const updatedVersion = await modelRegistryService.updateVersionState(version.id, state, req.user!.id);
        
        res.json({
          success: true,
          data: updatedVersion
        });
      } catch (error: any) {
        console.error('Update version state error:', error);
        
        if (error.message.includes('Invalid state transition')) {
          return res.status(400).json({
            error: {
              code: 'INVALID_STATE_TRANSITION',
              message: error.message
            }
          });
        }
        
        res.status(500).json({
          error: {
            code: 'UPDATE_VERSION_STATE_FAILED',
            message: 'Failed to update version state'
          }
        });
      }
    }
  );

  /**
   * Generate artifact upload URL
   */
  router.post('/models/:modelId/versions/:version/artifacts/upload-url',
    authenticate(authService),
    requireAnyRole(UserRole.MODEL_OWNER, UserRole.ADMIN),
    validateRequest(createArtifactSchema),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { modelId, version: versionNumber } = req.params;
        const request = req.body as CreateArtifactRequest;
        
        // Find version by model ID and version number
        const versions = await modelRegistryService.getModelVersions(modelId);
        const version = versions.find(v => v.version === versionNumber);
        
        if (!version) {
          return res.status(404).json({
            error: {
              code: 'VERSION_NOT_FOUND',
              message: 'Version not found'
            }
          });
        }
        
        const uploadInfo = await modelRegistryService.generateArtifactUploadUrl(version.id, request);
        
        res.json({
          success: true,
          data: uploadInfo
        });
      } catch (error: any) {
        console.error('Generate upload URL error:', error);
        res.status(500).json({
          error: {
            code: 'GENERATE_UPLOAD_URL_FAILED',
            message: 'Failed to generate upload URL'
          }
        });
      }
    }
  );

  /**
   * Complete artifact upload
   */
  router.post('/models/:modelId/versions/:version/artifacts/:artifactId/complete',
    authenticate(authService),
    requireAnyRole(UserRole.MODEL_OWNER, UserRole.ADMIN),
    validateRequest(completeArtifactUploadSchema),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { modelId, version: versionNumber, artifactId } = req.params;
        const { uri, size, sha256 } = req.body;
        
        // Find version by model ID and version number
        const versions = await modelRegistryService.getModelVersions(modelId);
        const version = versions.find(v => v.version === versionNumber);
        
        if (!version) {
          return res.status(404).json({
            error: {
              code: 'VERSION_NOT_FOUND',
              message: 'Version not found'
            }
          });
        }
        
        // Get the artifact type from the upload request (this would be stored temporarily in a real implementation)
        // For now, we'll default to 'weights'
        const artifactRequest = {
          type: ArtifactType.WEIGHTS,
          uri,
          size,
          sha256
        };
        
        const artifact = await modelRegistryService.createArtifact(
          version.id, 
          artifactId, 
          artifactRequest, 
          req.user!.id
        );
        
        res.status(201).json({
          success: true,
          data: artifact
        });
      } catch (error: any) {
        console.error('Complete artifact upload error:', error);
        
        if (error.message === 'Version not found') {
          return res.status(404).json({
            error: {
              code: 'VERSION_NOT_FOUND',
              message: 'Version not found'
            }
          });
        }
        
        res.status(500).json({
          error: {
            code: 'COMPLETE_UPLOAD_FAILED',
            message: 'Failed to complete artifact upload'
          }
        });
      }
    }
  );

  /**
   * Get version artifacts
   */
  router.get('/models/:modelId/versions/:version/artifacts', authenticate(authService), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { modelId, version: versionNumber } = req.params;
      
      // Find version by model ID and version number
      const versions = await modelRegistryService.getModelVersions(modelId);
      const version = versions.find(v => v.version === versionNumber);
      
      if (!version) {
        return res.status(404).json({
          error: {
            code: 'VERSION_NOT_FOUND',
            message: 'Version not found'
          }
        });
      }
      
      const artifacts = await modelRegistryService.getVersionArtifacts(version.id);
      
      res.json({
        success: true,
        data: artifacts
      });
    } catch (error: any) {
      console.error('Get artifacts error:', error);
      res.status(500).json({
        error: {
          code: 'GET_ARTIFACTS_FAILED',
          message: 'Failed to get artifacts'
        }
      });
    }
  });

  /**
   * Generate artifact download URL
   */
  router.get('/models/:modelId/versions/:version/artifacts/:artifactId/download',
    authenticate(authService),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { artifactId } = req.params;
        
        const downloadUrl = await modelRegistryService.generateArtifactDownloadUrl(artifactId);
        
        res.json({
          success: true,
          data: {
            downloadUrl,
            expiresIn: 3600 // 1 hour
          }
        });
      } catch (error: any) {
        console.error('Generate download URL error:', error);
        
        if (error.message === 'Artifact not found') {
          return res.status(404).json({
            error: {
              code: 'ARTIFACT_NOT_FOUND',
              message: 'Artifact not found'
            }
          });
        }
        
        res.status(500).json({
          error: {
            code: 'GENERATE_DOWNLOAD_URL_FAILED',
            message: 'Failed to generate download URL'
          }
        });
      }
    }
  );

  /**
   * Verify artifact integrity
   */
  router.post('/models/:modelId/versions/:version/artifacts/:artifactId/verify',
    authenticate(authService),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { artifactId } = req.params;
        const { sha256 } = req.body;
        
        if (!sha256 || !/^[a-f0-9]{64}$/.test(sha256)) {
          return res.status(400).json({
            error: {
              code: 'INVALID_SHA256',
              message: 'Valid SHA256 hash is required'
            }
          });
        }
        
        const isValid = await modelRegistryService.verifyArtifactIntegrity(artifactId, sha256);
        
        res.json({
          success: true,
          data: {
            artifactId,
            isValid,
            providedSHA256: sha256
          }
        });
      } catch (error: any) {
        console.error('Verify artifact error:', error);
        
        if (error.message === 'Artifact not found') {
          return res.status(404).json({
            error: {
              code: 'ARTIFACT_NOT_FOUND',
              message: 'Artifact not found'
            }
          });
        }
        
        res.status(500).json({
          error: {
            code: 'VERIFY_ARTIFACT_FAILED',
            message: 'Failed to verify artifact'
          }
        });
      }
    }
  );

  /**
   * Get lineage graph for a model version
   */
  router.get('/models/:modelId/versions/:version/lineage',
    authenticate(authService),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { modelId, version: versionNumber } = req.params;
        const { depth = '3' } = req.query;
        
        // Find version by model ID and version number
        const versions = await modelRegistryService.getModelVersions(modelId);
        const version = versions.find(v => v.version === versionNumber);
        
        if (!version) {
          return res.status(404).json({
            error: {
              code: 'VERSION_NOT_FOUND',
              message: 'Version not found'
            }
          });
        }
        
        const depthNum = Math.min(10, Math.max(1, parseInt(depth as string) || 3));
        const lineageGraph = await modelRegistryService.getVersionLineage(version.id, depthNum);
        
        res.json({
          success: true,
          data: lineageGraph
        });
      } catch (error: any) {
        console.error('Get lineage error:', error);
        res.status(500).json({
          error: {
            code: 'GET_LINEAGE_FAILED',
            message: 'Failed to get lineage graph'
          }
        });
      }
    }
  );

  /**
   * Track dataset lineage for a model version
   */
  router.post('/models/:modelId/versions/:version/lineage/dataset',
    authenticate(authService),
    requireAnyRole(UserRole.MODEL_OWNER, UserRole.ADMIN),
    validateRequest(trackDatasetLineageSchema),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { modelId, version: versionNumber } = req.params;
        const { datasetName, datasetVersion, datasetUri } = req.body;
        
        // Find version by model ID and version number
        const versions = await modelRegistryService.getModelVersions(modelId);
        const version = versions.find(v => v.version === versionNumber);
        
        if (!version) {
          return res.status(404).json({
            error: {
              code: 'VERSION_NOT_FOUND',
              message: 'Version not found'
            }
          });
        }
        
        await modelRegistryService.trackDatasetLineage(
          version.id,
          datasetName,
          datasetVersion,
          datasetUri,
          req.user!.id
        );
        
        res.status(201).json({
          success: true,
          message: 'Dataset lineage tracked successfully'
        });
      } catch (error: any) {
        console.error('Track dataset lineage error:', error);
        res.status(500).json({
          error: {
            code: 'TRACK_DATASET_LINEAGE_FAILED',
            message: 'Failed to track dataset lineage'
          }
        });
      }
    }
  );

  /**
   * Track commit lineage for a model version
   */
  router.post('/models/:modelId/versions/:version/lineage/commit',
    authenticate(authService),
    requireAnyRole(UserRole.MODEL_OWNER, UserRole.ADMIN),
    validateRequest(trackCommitLineageSchema),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { modelId, version: versionNumber } = req.params;
        const { commitSha, repositoryUrl } = req.body;
        
        // Find version by model ID and version number
        const versions = await modelRegistryService.getModelVersions(modelId);
        const version = versions.find(v => v.version === versionNumber);
        
        if (!version) {
          return res.status(404).json({
            error: {
              code: 'VERSION_NOT_FOUND',
              message: 'Version not found'
            }
          });
        }
        
        await modelRegistryService.trackCommitLineage(
          version.id,
          commitSha,
          repositoryUrl,
          req.user!.id
        );
        
        res.status(201).json({
          success: true,
          message: 'Commit lineage tracked successfully'
        });
      } catch (error: any) {
        console.error('Track commit lineage error:', error);
        res.status(500).json({
          error: {
            code: 'TRACK_COMMIT_LINEAGE_FAILED',
            message: 'Failed to track commit lineage'
          }
        });
      }
    }
  );

  /**
   * Track training run lineage for a model version
   */
  router.post('/models/:modelId/versions/:version/lineage/training-run',
    authenticate(authService),
    requireAnyRole(UserRole.MODEL_OWNER, UserRole.ADMIN),
    validateRequest(trackTrainingRunLineageSchema),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { modelId, version: versionNumber } = req.params;
        const { trainingRunId, trainingRunUri, hyperparameters } = req.body;
        
        // Find version by model ID and version number
        const versions = await modelRegistryService.getModelVersions(modelId);
        const version = versions.find(v => v.version === versionNumber);
        
        if (!version) {
          return res.status(404).json({
            error: {
              code: 'VERSION_NOT_FOUND',
              message: 'Version not found'
            }
          });
        }
        
        await modelRegistryService.trackTrainingRunLineage(
          version.id,
          trainingRunId,
          trainingRunUri,
          hyperparameters,
          req.user!.id
        );
        
        res.status(201).json({
          success: true,
          message: 'Training run lineage tracked successfully'
        });
      } catch (error: any) {
        console.error('Track training run lineage error:', error);
        res.status(500).json({
          error: {
            code: 'TRACK_TRAINING_RUN_LINEAGE_FAILED',
            message: 'Failed to track training run lineage'
          }
        });
      }
    }
  );

  /**
   * Generate model card for a version
   */
  router.post('/models/:modelId/versions/:version/model-card/generate',
    authenticate(authService),
    requireAnyRole(UserRole.MODEL_OWNER, UserRole.ADMIN),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { modelId, version: versionNumber } = req.params;
        
        // Find version by model ID and version number
        const versions = await modelRegistryService.getModelVersions(modelId);
        const version = versions.find(v => v.version === versionNumber);
        
        if (!version) {
          return res.status(404).json({
            error: {
              code: 'VERSION_NOT_FOUND',
              message: 'Version not found'
            }
          });
        }
        
        const modelCard = await modelRegistryService.generateModelCard(version.id);
        
        res.status(201).json({
          success: true,
          data: modelCard
        });
      } catch (error: any) {
        console.error('Generate model card error:', error);
        res.status(500).json({
          error: {
            code: 'GENERATE_MODEL_CARD_FAILED',
            message: 'Failed to generate model card'
          }
        });
      }
    }
  );

  /**
   * Get model card for a version
   */
  router.get('/models/:modelId/versions/:version/model-card',
    authenticate(authService),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { modelId, version: versionNumber } = req.params;
        
        // Find version by model ID and version number
        const versions = await modelRegistryService.getModelVersions(modelId);
        const version = versions.find(v => v.version === versionNumber);
        
        if (!version) {
          return res.status(404).json({
            error: {
              code: 'VERSION_NOT_FOUND',
              message: 'Version not found'
            }
          });
        }
        
        const modelCard = await modelRegistryService.getModelCard(version.id);
        
        if (!modelCard) {
          return res.status(404).json({
            error: {
              code: 'MODEL_CARD_NOT_FOUND',
              message: 'Model card not found. Generate one first.'
            }
          });
        }
        
        res.json({
          success: true,
          data: modelCard
        });
      } catch (error: any) {
        console.error('Get model card error:', error);
        res.status(500).json({
          error: {
            code: 'GET_MODEL_CARD_FAILED',
            message: 'Failed to get model card'
          }
        });
      }
    }
  );

  /**
   * Export model card as HTML
   */
  router.get('/models/:modelId/versions/:version/model-card/export/html',
    authenticate(authService),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { modelId, version: versionNumber } = req.params;
        
        // Find version by model ID and version number
        const versions = await modelRegistryService.getModelVersions(modelId);
        const version = versions.find(v => v.version === versionNumber);
        
        if (!version) {
          return res.status(404).json({
            error: {
              code: 'VERSION_NOT_FOUND',
              message: 'Version not found'
            }
          });
        }
        
        const html = await modelRegistryService.exportModelCardAsHTML(version.id);
        
        res.setHeader('Content-Type', 'text/html');
        res.setHeader('Content-Disposition', `attachment; filename="model-card-${modelId}-${versionNumber}.html"`);
        res.send(html);
      } catch (error: any) {
        console.error('Export model card HTML error:', error);
        
        if (error.message === 'Model card not found') {
          return res.status(404).json({
            error: {
              code: 'MODEL_CARD_NOT_FOUND',
              message: 'Model card not found. Generate one first.'
            }
          });
        }
        
        res.status(500).json({
          error: {
            code: 'EXPORT_MODEL_CARD_HTML_FAILED',
            message: 'Failed to export model card as HTML'
          }
        });
      }
    }
  );

  /**
   * Export model card as JSON
   */
  router.get('/models/:modelId/versions/:version/model-card/export/json',
    authenticate(authService),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { modelId, version: versionNumber } = req.params;
        
        // Find version by model ID and version number
        const versions = await modelRegistryService.getModelVersions(modelId);
        const version = versions.find(v => v.version === versionNumber);
        
        if (!version) {
          return res.status(404).json({
            error: {
              code: 'VERSION_NOT_FOUND',
              message: 'Version not found'
            }
          });
        }
        
        const jsonData = await modelRegistryService.exportModelCardAsJSON(version.id);
        
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="model-card-${modelId}-${versionNumber}.json"`);
        res.json(jsonData);
      } catch (error: any) {
        console.error('Export model card JSON error:', error);
        
        if (error.message === 'Model card not found') {
          return res.status(404).json({
            error: {
              code: 'MODEL_CARD_NOT_FOUND',
              message: 'Model card not found. Generate one first.'
            }
          });
        }
        
        res.status(500).json({
          error: {
            code: 'EXPORT_MODEL_CARD_JSON_FAILED',
            message: 'Failed to export model card as JSON'
          }
        });
      }
    }
  );

  /**
   * Health check for model registry service
   */
  router.get('/health', (req: Request, res: Response) => {
    res.json({
      success: true,
      service: 'model-registry',
      timestamp: new Date().toISOString()
    });
  });

  return router;
}