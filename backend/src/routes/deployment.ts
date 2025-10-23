import { Router } from 'express';
import { Pool } from 'pg';
import { 
  DeploymentService, 
  MonitoringService, 
  RollbackService,
  DeploymentOrchestrator
} from '../services/deployment/index.js';
import { 
  CreateDeploymentRequest,
  UpdateDeploymentRequest,
  CreateTrafficSplitRequest,
  CreateRollbackRequest,
  DeploymentQuery,
  MetricsQuery,
  UserRole
} from '../types/index.js';
import { authenticateToken, requireRoles } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validation.js';
import { 
  createDeploymentSchema,
  updateDeploymentSchema,
  createTrafficSplitSchema,
  createRollbackSchema,
  deploymentQuerySchema,
  metricsQuerySchema
} from '../validation/schemas.js';

export function createDeploymentRouter(db: Pool): Router {
  const router = Router();
  const deploymentService = new DeploymentService(db);
  const monitoringService = new MonitoringService(db);
  const rollbackService = new RollbackService(db);
  const deploymentOrchestrator = new DeploymentOrchestrator(db);

  // Apply authentication to all routes
  router.use(authenticateToken);

  // Create deployment
  router.post(
    '/',
    requireRoles([UserRole.SRE, UserRole.ADMIN]),
    validateRequest(createDeploymentSchema),
    async (req, res) => {
      try {
        const request: CreateDeploymentRequest = req.body;
        const deployment = await deploymentOrchestrator.orchestrateDeployment(request, req.user!.id);
        
        res.status(201).json(deployment);
      } catch (error) {
        console.error('Error creating deployment:', error);
        res.status(500).json({ 
          error: 'Failed to create deployment',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  // Get deployments
  router.get(
    '/',
    validateRequest(deploymentQuerySchema, 'query'),
    async (req, res) => {
      try {
        const query: DeploymentQuery = req.query as any;
        const deployments = await deploymentService.getDeployments(query);
        res.json(deployments);
      } catch (error) {
        console.error('Error fetching deployments:', error);
        res.status(500).json({ 
          error: 'Failed to fetch deployments',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  // Get deployment by ID
  router.get('/:id', async (req, res) => {
    try {
      const deployment = await deploymentService.getDeployment(req.params.id);
      
      if (!deployment) {
        return res.status(404).json({ error: 'Deployment not found' });
      }
      
      res.json(deployment);
    } catch (error) {
      console.error('Error fetching deployment:', error);
      res.status(500).json({ 
        error: 'Failed to fetch deployment',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Update deployment
  router.put(
    '/:id',
    requireRoles([UserRole.SRE, UserRole.ADMIN]),
    validateRequest(updateDeploymentSchema),
    async (req, res) => {
      try {
        const request: UpdateDeploymentRequest = req.body;
        const deployment = await deploymentService.updateDeployment(req.params.id, request);
        
        if (!deployment) {
          return res.status(404).json({ error: 'Deployment not found' });
        }
        
        res.json(deployment);
      } catch (error) {
        console.error('Error updating deployment:', error);
        res.status(500).json({ 
          error: 'Failed to update deployment',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  // Delete deployment
  router.delete(
    '/:id',
    requireRoles([UserRole.SRE, UserRole.ADMIN]),
    async (req, res) => {
      try {
        // Stop monitoring before deletion
        await monitoringService.stopMonitoring(req.params.id);
        
        const deleted = await deploymentService.deleteDeployment(req.params.id);
        
        if (!deleted) {
          return res.status(404).json({ error: 'Deployment not found' });
        }
        
        res.status(204).send();
      } catch (error) {
        console.error('Error deleting deployment:', error);
        res.status(500).json({ 
          error: 'Failed to delete deployment',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  // Traffic splitting endpoints
  router.post(
    '/:id/traffic-splits',
    requireRoles([UserRole.SRE, UserRole.ADMIN]),
    validateRequest(createTrafficSplitSchema),
    async (req, res) => {
      try {
        const request: CreateTrafficSplitRequest = {
          ...req.body,
          deploymentId: req.params.id
        };
        
        const trafficSplit = await deploymentService.createTrafficSplit(request);
        res.status(201).json(trafficSplit);
      } catch (error) {
        console.error('Error creating traffic split:', error);
        res.status(500).json({ 
          error: 'Failed to create traffic split',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  router.get('/:id/traffic-splits', async (req, res) => {
    try {
      const trafficSplits = await deploymentService.getTrafficSplits(req.params.id);
      res.json(trafficSplits);
    } catch (error) {
      console.error('Error fetching traffic splits:', error);
      res.status(500).json({ 
        error: 'Failed to fetch traffic splits',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  router.put(
    '/traffic-splits/:splitId/complete',
    requireRoles([UserRole.SRE, UserRole.ADMIN]),
    async (req, res) => {
      try {
        const trafficSplit = await deploymentService.completeTrafficSplit(req.params.splitId);
        
        if (!trafficSplit) {
          return res.status(404).json({ error: 'Traffic split not found' });
        }
        
        res.json(trafficSplit);
      } catch (error) {
        console.error('Error completing traffic split:', error);
        res.status(500).json({ 
          error: 'Failed to complete traffic split',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  // Rollback endpoints
  router.post(
    '/:id/rollbacks',
    requireRoles([UserRole.SRE, UserRole.ADMIN]),
    validateRequest(createRollbackSchema),
    async (req, res) => {
      try {
        const request: CreateRollbackRequest = req.body;
        const rollback = await rollbackService.executeRollback(
          req.params.id,
          request,
          req.user!.id
        );
        
        res.status(201).json(rollback);
      } catch (error) {
        console.error('Error creating rollback:', error);
        res.status(500).json({ 
          error: 'Failed to create rollback',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  router.get('/:id/rollbacks', async (req, res) => {
    try {
      const rollbacks = await deploymentService.getRollbackOperations(req.params.id);
      res.json(rollbacks);
    } catch (error) {
      console.error('Error fetching rollbacks:', error);
      res.status(500).json({ 
        error: 'Failed to fetch rollbacks',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  router.get('/rollbacks/:rollbackId/status', async (req, res) => {
    try {
      const rollback = await rollbackService.getRollbackStatus(req.params.rollbackId);
      
      if (!rollback) {
        return res.status(404).json({ error: 'Rollback not found' });
      }
      
      res.json(rollback);
    } catch (error) {
      console.error('Error fetching rollback status:', error);
      res.status(500).json({ 
        error: 'Failed to fetch rollback status',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  router.post(
    '/rollbacks/:rollbackId/cancel',
    requireRoles([UserRole.SRE, UserRole.ADMIN]),
    async (req, res) => {
      try {
        const cancelled = await rollbackService.cancelRollback(req.params.rollbackId);
        
        if (!cancelled) {
          return res.status(400).json({ error: 'Cannot cancel rollback' });
        }
        
        res.json({ message: 'Rollback cancelled successfully' });
      } catch (error) {
        console.error('Error cancelling rollback:', error);
        res.status(500).json({ 
          error: 'Failed to cancel rollback',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  router.get('/:id/rollback-options', async (req, res) => {
    try {
      const options = await rollbackService.getOneClickRollbackOptions(req.params.id);
      res.json(options);
    } catch (error) {
      console.error('Error fetching rollback options:', error);
      res.status(500).json({ 
        error: 'Failed to fetch rollback options',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Monitoring endpoints
  router.post(
    '/:id/monitoring/start',
    requireRoles([UserRole.SRE, UserRole.ADMIN]),
    async (req, res) => {
      try {
        await monitoringService.startMonitoring(req.params.id);
        res.json({ message: 'Monitoring started successfully' });
      } catch (error) {
        console.error('Error starting monitoring:', error);
        res.status(500).json({ 
          error: 'Failed to start monitoring',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  router.post(
    '/:id/monitoring/stop',
    requireRoles([UserRole.SRE, UserRole.ADMIN]),
    async (req, res) => {
      try {
        await monitoringService.stopMonitoring(req.params.id);
        res.json({ message: 'Monitoring stopped successfully' });
      } catch (error) {
        console.error('Error stopping monitoring:', error);
        res.status(500).json({ 
          error: 'Failed to stop monitoring',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  // Metrics endpoints
  router.get(
    '/:id/metrics',
    validateRequest(metricsQuerySchema, 'query'),
    async (req, res) => {
      try {
        const query: MetricsQuery = {
          deploymentId: req.params.id,
          startTime: new Date(req.query.startTime as string),
          endTime: new Date(req.query.endTime as string),
          granularity: req.query.granularity as any
        };
        
        const metrics = await deploymentService.getMetrics(query);
        res.json(metrics);
      } catch (error) {
        console.error('Error fetching metrics:', error);
        res.status(500).json({ 
          error: 'Failed to fetch metrics',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  router.post(
    '/:id/metrics',
    requireRoles([UserRole.SRE, UserRole.ADMIN]),
    async (req, res) => {
      try {
        const metrics = await deploymentService.recordMetrics({
          deploymentId: req.params.id,
          ...req.body
        });
        
        res.status(201).json(metrics);
      } catch (error) {
        console.error('Error recording metrics:', error);
        res.status(500).json({ 
          error: 'Failed to record metrics',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  // Alerts endpoints
  router.get('/:id/alerts', async (req, res) => {
    try {
      const acknowledged = req.query.acknowledged === 'true' ? true : 
                          req.query.acknowledged === 'false' ? false : undefined;
      
      const alerts = await deploymentService.getAlerts(req.params.id, acknowledged);
      res.json(alerts);
    } catch (error) {
      console.error('Error fetching alerts:', error);
      res.status(500).json({ 
        error: 'Failed to fetch alerts',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  router.put(
    '/alerts/:alertId/acknowledge',
    requireRoles([UserRole.SRE, UserRole.ADMIN]),
    async (req, res) => {
      try {
        const alert = await deploymentService.acknowledgeAlert(req.params.alertId);
        
        if (!alert) {
          return res.status(404).json({ error: 'Alert not found' });
        }
        
        res.json(alert);
      } catch (error) {
        console.error('Error acknowledging alert:', error);
        res.status(500).json({ 
          error: 'Failed to acknowledge alert',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  router.put(
    '/alerts/:alertId/resolve',
    requireRoles([UserRole.SRE, UserRole.ADMIN]),
    async (req, res) => {
      try {
        const alert = await deploymentService.resolveAlert(req.params.alertId);
        
        if (!alert) {
          return res.status(404).json({ error: 'Alert not found' });
        }
        
        res.json(alert);
      } catch (error) {
        console.error('Error resolving alert:', error);
        res.status(500).json({ 
          error: 'Failed to resolve alert',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  // Deployment health endpoint
  router.get('/:id/health', async (req, res) => {
    try {
      const health = await deploymentOrchestrator.getDeploymentHealth(req.params.id);
      res.json(health);
    } catch (error) {
      console.error('Error fetching deployment health:', error);
      res.status(500).json({ 
        error: 'Failed to fetch deployment health',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  return router;
}