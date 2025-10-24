import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

// Import service dependencies
import { DatabaseService } from '../services/database/index.js';
import { AuthService, AuthorizationService } from '../services/auth/index.js';
import { ModelRegistryService, LineageService, ModelCardService } from '../services/modelRegistry/index.js';
import { PolicyEngineService, PolicyEvaluationEngine, PolicyBlockingService } from '../services/policyEngine/index.js';
import { EvaluationService, EvaluationExecutionEngine, EvaluationReportingService } from '../services/evaluation/index.js';
import { DeploymentService, DeploymentOrchestrator, MonitoringService, RollbackService } from '../services/deployment/index.js';
import { AuditService, EvidenceBundleService, GDPRComplianceService } from '../services/audit/index.js';

// Import messaging system
import { MessagingManager, MessagingConfig } from '../messaging/index.js';

// Import route creators
import { createAuthRoutes } from '../routes/auth.js';
import { createModelRegistryRoutes } from '../routes/modelRegistry.js';
import { createPolicyEngineRoutes } from '../routes/policyEngine.js';
import { createEvaluationRoutes } from '../routes/evaluation.js';
import { createDeploymentRoutes } from '../routes/deployment.js';
import { createAuditRoutes } from '../routes/audit.js';

// Import middleware
import { authenticate } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validation.js';

export async function createMicroserviceApp(): Promise<express.Application> {
  const app = express();

  // Basic middleware
  app.use(helmet());
  app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true
  }));
  app.use(compression());
  app.use(morgan('combined'));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Rate limiting
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX || '1000'),
    message: {
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests, please try again later'
      }
    },
    standardHeaders: true,
    legacyHeaders: false,
  });
  
  app.use('/api', limiter);

  // Initialize messaging system
  console.log('🔧 Initializing messaging system...');
  
  const messagingConfig: MessagingConfig = {
    redis: {
      url: process.env.REDIS_URL || 'redis://localhost:6379'
    },
    services: {
      'auth': {
        baseURL: process.env.AUTH_SERVICE_URL || 'http://localhost:8001',
        timeout: 5000,
        retries: 3,
        retryDelay: 1000,
        circuitBreaker: { failureThreshold: 5, resetTimeout: 60000 }
      },
      'model-registry': {
        baseURL: process.env.MODEL_REGISTRY_SERVICE_URL || 'http://localhost:8002',
        timeout: 10000,
        retries: 3,
        retryDelay: 1000,
        circuitBreaker: { failureThreshold: 5, resetTimeout: 60000 }
      },
      'policy-engine': {
        baseURL: process.env.POLICY_ENGINE_SERVICE_URL || 'http://localhost:8003',
        timeout: 5000,
        retries: 3,
        retryDelay: 1000,
        circuitBreaker: { failureThreshold: 5, resetTimeout: 60000 }
      },
      'evaluation': {
        baseURL: process.env.EVALUATION_SERVICE_URL || 'http://localhost:8004',
        timeout: 15000,
        retries: 2,
        retryDelay: 2000,
        circuitBreaker: { failureThreshold: 3, resetTimeout: 120000 }
      },
      'deployment': {
        baseURL: process.env.DEPLOYMENT_SERVICE_URL || 'http://localhost:8005',
        timeout: 10000,
        retries: 3,
        retryDelay: 1000,
        circuitBreaker: { failureThreshold: 5, resetTimeout: 60000 }
      },
      'audit': {
        baseURL: process.env.AUDIT_SERVICE_URL || 'http://localhost:8006',
        timeout: 5000,
        retries: 3,
        retryDelay: 1000,
        circuitBreaker: { failureThreshold: 5, resetTimeout: 60000 }
      }
    }
  };

  const messagingManager = new MessagingManager(messagingConfig);
  await messagingManager.initialize();

  // Initialize services
  console.log('🔧 Initializing services...');
  
  const databaseService = new DatabaseService();
  await databaseService.initialize();

  // Auth services
  const authService = new AuthService(databaseService);
  const authzService = new AuthorizationService();

  // Model Registry services
  const modelRegistryService = new ModelRegistryService(databaseService);
  const lineageService = new LineageService(databaseService);
  const modelCardService = new ModelCardService(databaseService);

  // Policy Engine services
  const policyEvaluationEngine = new PolicyEvaluationEngine();
  const policyBlockingService = new PolicyBlockingService(databaseService);
  const policyEngineService = new PolicyEngineService(
    databaseService,
    policyEvaluationEngine,
    policyBlockingService
  );

  // Evaluation services
  const evaluationExecutionEngine = new EvaluationExecutionEngine();
  const evaluationReportingService = new EvaluationReportingService(databaseService);
  const evaluationService = new EvaluationService(
    databaseService,
    evaluationExecutionEngine,
    evaluationReportingService
  );

  // Deployment services
  const monitoringService = new MonitoringService();
  const rollbackService = new RollbackService(databaseService);
  const deploymentOrchestrator = new DeploymentOrchestrator(
    databaseService,
    monitoringService,
    rollbackService
  );
  const deploymentService = new DeploymentService(
    databaseService,
    deploymentOrchestrator
  );

  // Audit services
  const evidenceBundleService = new EvidenceBundleService(databaseService);
  const gdprComplianceService = new GDPRComplianceService(databaseService);
  const auditService = new AuditService(
    databaseService,
    evidenceBundleService,
    gdprComplianceService
  );

  console.log('✅ Services initialized successfully');

  // Health check endpoint
  app.get('/health', (req, res) => {
    const messagingHealth = messagingManager.getHealthStatus();
    
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      services: {
        database: 'healthy',
        auth: 'healthy',
        modelRegistry: 'healthy',
        policyEngine: 'healthy',
        evaluation: 'healthy',
        deployment: 'healthy',
        audit: 'healthy'
      },
      messaging: {
        eventBus: messagingHealth.eventBus ? 'healthy' : 'unhealthy',
        serviceClients: messagingHealth.serviceClients,
        initialized: messagingHealth.isInitialized
      }
    });
  });

  // API status endpoint
  app.get('/api/v1/status', (req, res) => {
    res.json({
      message: 'AI Model Registry API is running',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      mode: 'monolith',
      services: [
        'authentication',
        'model-registry',
        'policy-engine',
        'evaluation',
        'deployment',
        'audit'
      ]
    });
  });

  // Mount service routes
  console.log('🛣️  Setting up routes...');

  app.use('/api/v1/auth', createAuthRoutes(authService, authzService));
  app.use('/api/v1/models', createModelRegistryRoutes(
    modelRegistryService,
    lineageService,
    modelCardService,
    authService
  ));
  app.use('/api/v1/policies', createPolicyEngineRoutes(
    policyEngineService,
    authService
  ));
  app.use('/api/v1/evaluations', createEvaluationRoutes(
    evaluationService,
    authService
  ));
  app.use('/api/v1/deployments', createDeploymentRoutes(
    deploymentService,
    authService
  ));
  app.use('/api/v1/audit', createAuditRoutes(
    auditService,
    authService
  ));

  // Add messaging endpoints
  app.get('/api/v1/messaging/health', (req, res) => {
    const health = messagingManager.getHealthStatus();
    res.json({
      success: true,
      data: health
    });
  });

  app.get('/api/v1/messaging/services', (req, res) => {
    const authManager = messagingManager.getAuthManager();
    const stats = authManager.getStats();
    res.json({
      success: true,
      data: stats
    });
  });

  console.log('✅ Routes configured successfully');

  // Request logging middleware
  app.use((req, res, next) => {
    const start = Date.now();
    
    res.on('finish', () => {
      const duration = Date.now() - start;
      console.log(`${req.method} ${req.url} - ${res.statusCode} - ${duration}ms`);
    });
    
    next();
  });

  // Error handling middleware
  app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Application error:', err);
    
    // Log to audit service
    auditService.logEvent({
      eventType: 'ERROR',
      userId: (req as any).user?.id || 'anonymous',
      resourceType: 'system',
      resourceId: 'application',
      action: 'error',
      details: {
        error: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method
      },
      timestamp: new Date(),
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    }).catch(auditError => {
      console.error('Failed to log error to audit service:', auditError);
    });

    res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An internal server error occurred',
        ...(process.env.NODE_ENV === 'development' && { 
          details: err.message,
          stack: err.stack 
        }),
      },
    });
  });

  // 404 handler
  app.use('*', (req, res) => {
    res.status(404).json({
      error: {
        code: 'ROUTE_NOT_FOUND',
        message: 'The requested route was not found',
        path: req.originalUrl,
      },
    });
  });

  return app;
}

export async function createStandaloneService(serviceName: string): Promise<express.Application> {
  const app = express();

  // Basic middleware
  app.use(helmet());
  app.use(cors());
  app.use(compression());
  app.use(morgan('combined'));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Initialize database
  const databaseService = new DatabaseService();
  await databaseService.initialize();

  // Health check
  app.get('/health', (req, res) => {
    res.json({
      service: serviceName,
      status: 'healthy',
      timestamp: new Date().toISOString()
    });
  });

  // Service-specific setup
  switch (serviceName) {
    case 'auth':
      const authService = new AuthService(databaseService);
      const authzService = new AuthorizationService();
      app.use('/', createAuthRoutes(authService, authzService));
      break;

    case 'model-registry':
      const modelRegistryService = new ModelRegistryService(databaseService);
      const lineageService = new LineageService(databaseService);
      const modelCardService = new ModelCardService(databaseService);
      const authServiceForModels = new AuthService(databaseService);
      app.use('/', createModelRegistryRoutes(
        modelRegistryService,
        lineageService,
        modelCardService,
        authServiceForModels
      ));
      break;

    case 'policy-engine':
      const policyEvaluationEngine = new PolicyEvaluationEngine();
      const policyBlockingService = new PolicyBlockingService(databaseService);
      const policyEngineService = new PolicyEngineService(
        databaseService,
        policyEvaluationEngine,
        policyBlockingService
      );
      const authServiceForPolicies = new AuthService(databaseService);
      app.use('/', createPolicyEngineRoutes(policyEngineService, authServiceForPolicies));
      break;

    case 'evaluation':
      const evaluationExecutionEngine = new EvaluationExecutionEngine();
      const evaluationReportingService = new EvaluationReportingService(databaseService);
      const evaluationService = new EvaluationService(
        databaseService,
        evaluationExecutionEngine,
        evaluationReportingService
      );
      const authServiceForEval = new AuthService(databaseService);
      app.use('/', createEvaluationRoutes(evaluationService, authServiceForEval));
      break;

    case 'deployment':
      const monitoringService = new MonitoringService();
      const rollbackService = new RollbackService(databaseService);
      const deploymentOrchestrator = new DeploymentOrchestrator(
        databaseService,
        monitoringService,
        rollbackService
      );
      const deploymentService = new DeploymentService(
        databaseService,
        deploymentOrchestrator
      );
      const authServiceForDeploy = new AuthService(databaseService);
      app.use('/', createDeploymentRoutes(deploymentService, authServiceForDeploy));
      break;

    case 'audit':
      const evidenceBundleService = new EvidenceBundleService(databaseService);
      const gdprComplianceService = new GDPRComplianceService(databaseService);
      const auditService = new AuditService(
        databaseService,
        evidenceBundleService,
        gdprComplianceService
      );
      const authServiceForAudit = new AuthService(databaseService);
      app.use('/', createAuditRoutes(auditService, authServiceForAudit));
      break;

    default:
      throw new Error(`Unknown service: ${serviceName}`);
  }

  // Error handling
  app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error(`${serviceName} service error:`, err);
    res.status(500).json({
      error: {
        code: 'SERVICE_ERROR',
        message: `${serviceName} service error`,
        service: serviceName
      }
    });
  });

  return app;
}