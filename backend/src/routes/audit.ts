import { Router } from 'express';
import { Pool } from 'pg';
import { 
  AuditService, 
  EvidenceBundleService, 
  GDPRComplianceService,
  CreateAuditLogRequest,
  CreateEvidenceBundleRequest,
  CreateDataSubjectRequestRequest,
  CreateDataRetentionPolicyRequest,
  CreateComplianceReportRequest,
  AuditLogQuery,
  EvidenceBundleType,
  EvidenceBundleStatus,
  DataSubjectRequestType,
  DataSubjectRequestStatus,
  DataCategory,
  SensitivityLevel,
  ComplianceReportStatus
} from '../services/audit/index.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validation.js';
import { UserRole, AuthenticatedRequest } from '../types/index.js';
import { body, query, param } from 'express-validator';

export function createAuditRoutes(db: Pool): Router {
  const router = Router();
  const auditService = new AuditService(db);
  const evidenceBundleService = new EvidenceBundleService(db);
  const gdprService = new GDPRComplianceService(db);

  // Apply authentication to all routes
  router.use(authenticateToken);

  // Audit Log Routes
  
  /**
   * Create audit log entry
   */
  router.post('/logs',
    requireRole([UserRole.ADMIN, UserRole.AUDITOR]),
    [
      body('eventType').isString().notEmpty(),
      body('entityType').isString().notEmpty(),
      body('entityId').isString().notEmpty(),
      body('action').isString().notEmpty(),
      body('details').optional().isObject(),
      body('metadata').optional().isObject()
    ],
    validateRequest,
    async (req: AuthenticatedRequest, res) => {
      try {
        const request: CreateAuditLogRequest = req.body;
        
        const auditLog = await auditService.createAuditLog(request, {
          userId: req.user?.id,
          sessionId: req.session?.id,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent')
        });

        res.status(201).json(auditLog);
      } catch (error) {
        console.error('Error creating audit log:', error);
        res.status(500).json({ error: 'Failed to create audit log' });
      }
    }
  );

  /**
   * Query audit logs
   */
  router.get('/logs',
    requireRole([UserRole.AUDITOR, UserRole.ADMIN, UserRole.MRC]),
    [
      query('eventType').optional().isString(),
      query('entityType').optional().isString(),
      query('entityId').optional().isString(),
      query('userId').optional().isString(),
      query('action').optional().isString(),
      query('startDate').optional().isISO8601(),
      query('endDate').optional().isISO8601(),
      query('limit').optional().isInt({ min: 1, max: 1000 }),
      query('offset').optional().isInt({ min: 0 })
    ],
    validateRequest,
    async (req: AuthenticatedRequest, res) => {
      try {
        const query: AuditLogQuery = {
          eventType: req.query.eventType as string,
          entityType: req.query.entityType as string,
          entityId: req.query.entityId as string,
          userId: req.query.userId as string,
          action: req.query.action as string,
          startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
          endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
          limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
          offset: req.query.offset ? parseInt(req.query.offset as string) : undefined
        };

        const result = await auditService.queryAuditLogs(query);
        res.json(result);
      } catch (error) {
        console.error('Error querying audit logs:', error);
        res.status(500).json({ error: 'Failed to query audit logs' });
      }
    }
  );

  /**
   * Get entity audit trail
   */
  router.get('/logs/entity/:entityType/:entityId',
    requireRole([UserRole.AUDITOR, UserRole.ADMIN, UserRole.MRC]),
    [
      param('entityType').isString().notEmpty(),
      param('entityId').isString().notEmpty()
    ],
    validateRequest,
    async (req: AuthenticatedRequest, res) => {
      try {
        const { entityType, entityId } = req.params;
        const auditTrail = await auditService.getEntityAuditTrail(entityType, entityId);
        res.json(auditTrail);
      } catch (error) {
        console.error('Error getting entity audit trail:', error);
        res.status(500).json({ error: 'Failed to get entity audit trail' });
      }
    }
  );

  /**
   * Verify hash chain integrity
   */
  router.post('/logs/verify-integrity',
    requireRole([UserRole.AUDITOR, UserRole.ADMIN]),
    [
      body('startTimestamp').optional().isISO8601(),
      body('endTimestamp').optional().isISO8601()
    ],
    validateRequest,
    async (req: AuthenticatedRequest, res) => {
      try {
        const { startTimestamp, endTimestamp } = req.body;
        
        const result = await auditService.verifyHashChainIntegrity({
          startTimestamp: startTimestamp ? new Date(startTimestamp) : undefined,
          endTimestamp: endTimestamp ? new Date(endTimestamp) : undefined
        });

        res.json(result);
      } catch (error) {
        console.error('Error verifying hash chain integrity:', error);
        res.status(500).json({ error: 'Failed to verify hash chain integrity' });
      }
    }
  );

  /**
   * Get audit statistics
   */
  router.get('/logs/statistics',
    requireRole([UserRole.AUDITOR, UserRole.ADMIN]),
    [
      query('startDate').optional().isISO8601(),
      query('endDate').optional().isISO8601()
    ],
    validateRequest,
    async (req: AuthenticatedRequest, res) => {
      try {
        const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
        const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
        
        const statistics = await auditService.getAuditStatistics(startDate, endDate);
        res.json(statistics);
      } catch (error) {
        console.error('Error getting audit statistics:', error);
        res.status(500).json({ error: 'Failed to get audit statistics' });
      }
    }
  );

  /**
   * Get hash chain state
   */
  router.get('/logs/hash-chain-state',
    requireRole([UserRole.AUDITOR, UserRole.ADMIN]),
    async (req: AuthenticatedRequest, res) => {
      try {
        const state = await auditService.getHashChainState();
        res.json(state);
      } catch (error) {
        console.error('Error getting hash chain state:', error);
        res.status(500).json({ error: 'Failed to get hash chain state' });
      }
    }
  );

  // Evidence Bundle Routes

  /**
   * Create evidence bundle
   */
  router.post('/evidence-bundles',
    requireRole([UserRole.AUDITOR, UserRole.ADMIN]),
    [
      body('name').isString().notEmpty(),
      body('description').optional().isString(),
      body('bundleType').isIn(Object.values(EvidenceBundleType)),
      body('queryCriteria').isObject(),
      body('expiresAt').optional().isISO8601()
    ],
    validateRequest,
    async (req: AuthenticatedRequest, res) => {
      try {
        const request: CreateEvidenceBundleRequest = {
          ...req.body,
          expiresAt: req.body.expiresAt ? new Date(req.body.expiresAt) : undefined
        };
        
        const bundle = await evidenceBundleService.createEvidenceBundle(request, req.user!.id);
        res.status(201).json(bundle);
      } catch (error) {
        console.error('Error creating evidence bundle:', error);
        res.status(500).json({ error: 'Failed to create evidence bundle' });
      }
    }
  );

  /**
   * Get evidence bundle
   */
  router.get('/evidence-bundles/:id',
    requireRole([UserRole.AUDITOR, UserRole.ADMIN]),
    [param('id').isUUID()],
    validateRequest,
    async (req: AuthenticatedRequest, res) => {
      try {
        const bundle = await evidenceBundleService.getEvidenceBundle(req.params.id);
        
        if (!bundle) {
          return res.status(404).json({ error: 'Evidence bundle not found' });
        }

        res.json(bundle);
      } catch (error) {
        console.error('Error getting evidence bundle:', error);
        res.status(500).json({ error: 'Failed to get evidence bundle' });
      }
    }
  );

  /**
   * List evidence bundles
   */
  router.get('/evidence-bundles',
    requireRole([UserRole.AUDITOR, UserRole.ADMIN]),
    [
      query('bundleType').optional().isIn(Object.values(EvidenceBundleType)),
      query('status').optional().isIn(Object.values(EvidenceBundleStatus)),
      query('generatedBy').optional().isString(),
      query('limit').optional().isInt({ min: 1, max: 100 }),
      query('offset').optional().isInt({ min: 0 })
    ],
    validateRequest,
    async (req: AuthenticatedRequest, res) => {
      try {
        const result = await evidenceBundleService.listEvidenceBundles(
          req.query.bundleType as EvidenceBundleType,
          req.query.status as EvidenceBundleStatus,
          req.query.generatedBy as string,
          req.query.limit ? parseInt(req.query.limit as string) : undefined,
          req.query.offset ? parseInt(req.query.offset as string) : undefined
        );

        res.json(result);
      } catch (error) {
        console.error('Error listing evidence bundles:', error);
        res.status(500).json({ error: 'Failed to list evidence bundles' });
      }
    }
  );

  /**
   * Download evidence bundle
   */
  router.get('/evidence-bundles/:id/download',
    requireRole([UserRole.AUDITOR, UserRole.ADMIN]),
    [param('id').isUUID()],
    validateRequest,
    async (req: AuthenticatedRequest, res) => {
      try {
        const downloadInfo = await evidenceBundleService.downloadEvidenceBundle(req.params.id);
        
        if (!downloadInfo) {
          return res.status(404).json({ error: 'Evidence bundle file not found or not ready' });
        }

        res.setHeader('Content-Type', downloadInfo.mimeType);
        res.setHeader('Content-Disposition', `attachment; filename="${downloadInfo.fileName}"`);
        res.sendFile(downloadInfo.filePath);
      } catch (error) {
        console.error('Error downloading evidence bundle:', error);
        res.status(500).json({ error: 'Failed to download evidence bundle' });
      }
    }
  );

  /**
   * Reconstruct audit trail
   */
  router.get('/audit-trail/:entityType/:entityId',
    requireRole([UserRole.AUDITOR, UserRole.ADMIN]),
    [
      param('entityType').isString().notEmpty(),
      param('entityId').isString().notEmpty(),
      query('startDate').optional().isISO8601(),
      query('endDate').optional().isISO8601()
    ],
    validateRequest,
    async (req: AuthenticatedRequest, res) => {
      try {
        const { entityType, entityId } = req.params;
        const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
        const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
        
        const auditTrail = await evidenceBundleService.reconstructAuditTrail(
          entityType,
          entityId,
          startDate,
          endDate
        );

        res.json(auditTrail);
      } catch (error) {
        console.error('Error reconstructing audit trail:', error);
        res.status(500).json({ error: 'Failed to reconstruct audit trail' });
      }
    }
  );

  // Compliance Report Routes

  /**
   * Create compliance report
   */
  router.post('/compliance-reports',
    requireRole([UserRole.AUDITOR, UserRole.ADMIN]),
    [
      body('reportType').isString().notEmpty(),
      body('title').isString().notEmpty(),
      body('description').optional().isString(),
      body('reportingPeriodStart').isISO8601(),
      body('reportingPeriodEnd').isISO8601(),
      body('templateVersion').optional().isString()
    ],
    validateRequest,
    async (req: AuthenticatedRequest, res) => {
      try {
        const request: CreateComplianceReportRequest = {
          ...req.body,
          reportingPeriodStart: new Date(req.body.reportingPeriodStart),
          reportingPeriodEnd: new Date(req.body.reportingPeriodEnd)
        };
        
        const report = await evidenceBundleService.createComplianceReport(request, req.user!.id);
        res.status(201).json(report);
      } catch (error) {
        console.error('Error creating compliance report:', error);
        res.status(500).json({ error: 'Failed to create compliance report' });
      }
    }
  );

  /**
   * Get compliance report
   */
  router.get('/compliance-reports/:id',
    requireRole([UserRole.AUDITOR, UserRole.ADMIN]),
    [param('id').isUUID()],
    validateRequest,
    async (req: AuthenticatedRequest, res) => {
      try {
        const report = await evidenceBundleService.getComplianceReport(req.params.id);
        
        if (!report) {
          return res.status(404).json({ error: 'Compliance report not found' });
        }

        res.json(report);
      } catch (error) {
        console.error('Error getting compliance report:', error);
        res.status(500).json({ error: 'Failed to get compliance report' });
      }
    }
  );

  /**
   * List compliance reports
   */
  router.get('/compliance-reports',
    requireRole([UserRole.AUDITOR, UserRole.ADMIN]),
    [
      query('reportType').optional().isString(),
      query('status').optional().isIn(Object.values(ComplianceReportStatus)),
      query('limit').optional().isInt({ min: 1, max: 100 }),
      query('offset').optional().isInt({ min: 0 })
    ],
    validateRequest,
    async (req: AuthenticatedRequest, res) => {
      try {
        const result = await evidenceBundleService.listComplianceReports(
          req.query.reportType as string,
          req.query.status as ComplianceReportStatus,
          req.query.limit ? parseInt(req.query.limit as string) : undefined,
          req.query.offset ? parseInt(req.query.offset as string) : undefined
        );

        res.json(result);
      } catch (error) {
        console.error('Error listing compliance reports:', error);
        res.status(500).json({ error: 'Failed to list compliance reports' });
      }
    }
  );

  // GDPR Compliance Routes

  /**
   * Create data subject request
   */
  router.post('/gdpr/data-subject-requests',
    requireRole([UserRole.ADMIN, UserRole.AUDITOR]),
    [
      body('requestType').isIn(Object.values(DataSubjectRequestType)),
      body('subjectIdentifier').isString().notEmpty(),
      body('subjectType').isString().notEmpty(),
      body('justification').optional().isString()
    ],
    validateRequest,
    async (req: AuthenticatedRequest, res) => {
      try {
        const request: CreateDataSubjectRequestRequest = req.body;
        
        const dsRequest = await gdprService.createDataSubjectRequest(request, req.user!.id);
        res.status(201).json(dsRequest);
      } catch (error) {
        console.error('Error creating data subject request:', error);
        res.status(500).json({ error: 'Failed to create data subject request' });
      }
    }
  );

  /**
   * Process data subject request
   */
  router.put('/gdpr/data-subject-requests/:id/process',
    requireRole([UserRole.ADMIN]),
    [
      param('id').isUUID(),
      body('status').isIn(Object.values(DataSubjectRequestStatus)),
      body('completionDetails').optional().isObject()
    ],
    validateRequest,
    async (req: AuthenticatedRequest, res) => {
      try {
        const { status, completionDetails } = req.body;
        
        const dsRequest = await gdprService.processDataSubjectRequest(
          req.params.id,
          req.user!.id,
          status,
          completionDetails
        );

        res.json(dsRequest);
      } catch (error) {
        console.error('Error processing data subject request:', error);
        res.status(500).json({ error: 'Failed to process data subject request' });
      }
    }
  );

  /**
   * List data subject requests
   */
  router.get('/gdpr/data-subject-requests',
    requireRole([UserRole.ADMIN, UserRole.AUDITOR]),
    [
      query('requestType').optional().isIn(Object.values(DataSubjectRequestType)),
      query('status').optional().isIn(Object.values(DataSubjectRequestStatus)),
      query('subjectType').optional().isString(),
      query('limit').optional().isInt({ min: 1, max: 100 }),
      query('offset').optional().isInt({ min: 0 })
    ],
    validateRequest,
    async (req: AuthenticatedRequest, res) => {
      try {
        const result = await gdprService.listDataSubjectRequests(
          req.query.requestType as DataSubjectRequestType,
          req.query.status as DataSubjectRequestStatus,
          req.query.subjectType as string,
          req.query.limit ? parseInt(req.query.limit as string) : undefined,
          req.query.offset ? parseInt(req.query.offset as string) : undefined
        );

        res.json(result);
      } catch (error) {
        console.error('Error listing data subject requests:', error);
        res.status(500).json({ error: 'Failed to list data subject requests' });
      }
    }
  );

  /**
   * Create data retention policy
   */
  router.post('/gdpr/retention-policies',
    requireRole([UserRole.ADMIN]),
    [
      body('name').isString().notEmpty(),
      body('description').optional().isString(),
      body('entityType').isString().notEmpty(),
      body('retentionPeriodDays').isInt({ min: 1 }),
      body('deletionCriteria').optional().isObject()
    ],
    validateRequest,
    async (req: AuthenticatedRequest, res) => {
      try {
        const request: CreateDataRetentionPolicyRequest = req.body;
        
        const policy = await gdprService.createDataRetentionPolicy(request, req.user!.id);
        res.status(201).json(policy);
      } catch (error) {
        console.error('Error creating data retention policy:', error);
        res.status(500).json({ error: 'Failed to create data retention policy' });
      }
    }
  );

  /**
   * List data retention policies
   */
  router.get('/gdpr/retention-policies',
    requireRole([UserRole.ADMIN, UserRole.AUDITOR]),
    [
      query('entityType').optional().isString(),
      query('isActive').optional().isBoolean(),
      query('limit').optional().isInt({ min: 1, max: 100 }),
      query('offset').optional().isInt({ min: 0 })
    ],
    validateRequest,
    async (req: AuthenticatedRequest, res) => {
      try {
        const result = await gdprService.listDataRetentionPolicies(
          req.query.entityType as string,
          req.query.isActive ? req.query.isActive === 'true' : undefined,
          req.query.limit ? parseInt(req.query.limit as string) : undefined,
          req.query.offset ? parseInt(req.query.offset as string) : undefined
        );

        res.json(result);
      } catch (error) {
        console.error('Error listing data retention policies:', error);
        res.status(500).json({ error: 'Failed to list data retention policies' });
      }
    }
  );

  /**
   * Get personal data inventory
   */
  router.get('/gdpr/personal-data-inventory',
    requireRole([UserRole.ADMIN, UserRole.AUDITOR]),
    [
      query('tableName').optional().isString(),
      query('dataCategory').optional().isIn(Object.values(DataCategory)),
      query('sensitivityLevel').optional().isIn(Object.values(SensitivityLevel))
    ],
    validateRequest,
    async (req: AuthenticatedRequest, res) => {
      try {
        const inventory = await gdprService.getPersonalDataInventory(
          req.query.tableName as string,
          req.query.dataCategory as DataCategory,
          req.query.sensitivityLevel as SensitivityLevel
        );

        res.json(inventory);
      } catch (error) {
        console.error('Error getting personal data inventory:', error);
        res.status(500).json({ error: 'Failed to get personal data inventory' });
      }
    }
  );

  /**
   * Identify personal data for subject
   */
  router.get('/gdpr/personal-data/:subjectType/:subjectIdentifier',
    requireRole([UserRole.ADMIN, UserRole.AUDITOR]),
    [
      param('subjectType').isString().notEmpty(),
      param('subjectIdentifier').isString().notEmpty()
    ],
    validateRequest,
    async (req: AuthenticatedRequest, res) => {
      try {
        const { subjectType, subjectIdentifier } = req.params;
        
        const personalData = await gdprService.identifyPersonalDataForSubject(
          subjectIdentifier,
          subjectType
        );

        res.json(personalData);
      } catch (error) {
        console.error('Error identifying personal data:', error);
        res.status(500).json({ error: 'Failed to identify personal data' });
      }
    }
  );

  /**
   * Enforce data retention policies
   */
  router.post('/gdpr/enforce-retention',
    requireRole([UserRole.ADMIN]),
    async (req: AuthenticatedRequest, res) => {
      try {
        const result = await gdprService.enforceDataRetentionPolicies();
        res.json(result);
      } catch (error) {
        console.error('Error enforcing data retention policies:', error);
        res.status(500).json({ error: 'Failed to enforce data retention policies' });
      }
    }
  );

  return router;
}