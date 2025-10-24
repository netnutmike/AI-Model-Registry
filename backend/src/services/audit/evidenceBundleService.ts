import { Pool } from 'pg';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import archiver from 'archiver';
import {
  EvidenceBundle,
  EvidenceBundleEntity,
  CreateEvidenceBundleRequest,
  EvidenceBundleType,
  EvidenceBundleStatus,
  AuditLogQuery,
  ComplianceReport,
  ComplianceReportEntity,
  CreateComplianceReportRequest,
  ComplianceReportStatus
} from '../../types/index.js';

export class EvidenceBundleService {
  private readonly bundleStoragePath: string;

  constructor(
    private db: Pool,
    bundleStoragePath: string = process.env.EVIDENCE_BUNDLE_PATH || './storage/evidence-bundles'
  ) {
    this.bundleStoragePath = bundleStoragePath;
  }

  /**
   * Create a new evidence bundle for compliance reporting
   */
  async createEvidenceBundle(request: CreateEvidenceBundleRequest, generatedBy: string): Promise<EvidenceBundle> {
    const client = await this.db.connect();
    
    try {
      await client.query('BEGIN');

      // Create evidence bundle record
      const result = await client.query(`
        INSERT INTO evidence_bundles (
          name, description, bundle_type, status, query_criteria, 
          expires_at, generated_by, generated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        RETURNING *
      `, [
        request.name,
        request.description,
        request.bundleType,
        EvidenceBundleStatus.GENERATING,
        JSON.stringify(request.queryCriteria),
        request.expiresAt,
        generatedBy
      ]);

      await client.query('COMMIT');

      const bundle = this.mapEntityToEvidenceBundle(result.rows[0]);

      // Start async generation process
      this.generateEvidenceBundle(bundle.id).catch(error => {
        console.error(`Failed to generate evidence bundle ${bundle.id}:`, error);
        this.updateBundleStatus(bundle.id, EvidenceBundleStatus.ERROR, error.message);
      });

      return bundle;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get evidence bundle by ID
   */
  async getEvidenceBundle(id: string): Promise<EvidenceBundle | null> {
    const result = await this.db.query(`
      SELECT * FROM evidence_bundles WHERE id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapEntityToEvidenceBundle(result.rows[0]);
  }

  /**
   * List evidence bundles with filtering
   */
  async listEvidenceBundles(
    bundleType?: EvidenceBundleType,
    status?: EvidenceBundleStatus,
    generatedBy?: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<{
    bundles: EvidenceBundle[];
    total: number;
    hasMore: boolean;
  }> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (bundleType) {
      conditions.push(`bundle_type = $${paramIndex++}`);
      params.push(bundleType);
    }

    if (status) {
      conditions.push(`status = $${paramIndex++}`);
      params.push(status);
    }

    if (generatedBy) {
      conditions.push(`generated_by = $${paramIndex++}`);
      params.push(generatedBy);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countResult = await this.db.query(`
      SELECT COUNT(*) as total FROM evidence_bundles ${whereClause}
    `, params);

    const total = parseInt(countResult.rows[0].total);

    // Get paginated results
    const dataResult = await this.db.query(`
      SELECT * FROM evidence_bundles 
      ${whereClause}
      ORDER BY generated_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `, [...params, limit, offset]);

    const bundles = dataResult.rows.map(row => this.mapEntityToEvidenceBundle(row));
    const hasMore = offset + bundles.length < total;

    return { bundles, total, hasMore };
  }

  /**
   * Download evidence bundle file
   */
  async downloadEvidenceBundle(id: string): Promise<{
    filePath: string;
    fileName: string;
    mimeType: string;
  } | null> {
    const bundle = await this.getEvidenceBundle(id);
    
    if (!bundle || bundle.status !== EvidenceBundleStatus.READY || !bundle.filePath) {
      return null;
    }

    const fullPath = path.join(this.bundleStoragePath, bundle.filePath);
    
    try {
      await fs.access(fullPath);
      return {
        filePath: fullPath,
        fileName: `${bundle.name}.zip`,
        mimeType: 'application/zip'
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Delete expired evidence bundles
   */
  async cleanupExpiredBundles(): Promise<number> {
    const result = await this.db.query(`
      SELECT id, file_path FROM evidence_bundles 
      WHERE expires_at IS NOT NULL AND expires_at < NOW()
      AND status != 'expired'
    `);

    let deletedCount = 0;

    for (const row of result.rows) {
      try {
        // Delete file if exists
        if (row.file_path) {
          const fullPath = path.join(this.bundleStoragePath, row.file_path);
          try {
            await fs.unlink(fullPath);
          } catch (error) {
            console.warn(`Failed to delete evidence bundle file ${fullPath}:`, error);
          }
        }

        // Update status to expired
        await this.db.query(`
          UPDATE evidence_bundles 
          SET status = 'expired', file_path = NULL, file_size = NULL, file_hash = NULL
          WHERE id = $1
        `, [row.id]);

        deletedCount++;
      } catch (error) {
        console.error(`Failed to cleanup evidence bundle ${row.id}:`, error);
      }
    }

    return deletedCount;
  }

  /**
   * Generate audit trail reconstruction for specific entity
   */
  async reconstructAuditTrail(
    entityType: string,
    entityId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<{
    entity: { type: string; id: string };
    timeline: Array<{
      timestamp: Date;
      eventType: string;
      action: string;
      userId?: string;
      details: Record<string, any>;
      hash: string;
    }>;
    integrityVerified: boolean;
  }> {
    const conditions = ['entity_type = $1', 'entity_id = $2'];
    const params: any[] = [entityType, entityId];
    let paramIndex = 3;

    if (startDate) {
      conditions.push(`timestamp >= $${paramIndex++}`);
      params.push(startDate);
    }

    if (endDate) {
      conditions.push(`timestamp <= $${paramIndex++}`);
      params.push(endDate);
    }

    // Get audit logs for entity
    const result = await this.db.query(`
      SELECT event_type, action, user_id, details, timestamp, current_hash
      FROM audit_logs 
      WHERE ${conditions.join(' AND ')}
      ORDER BY timestamp ASC
    `, params);

    const timeline = result.rows.map(row => ({
      timestamp: row.timestamp,
      eventType: row.event_type,
      action: row.action,
      userId: row.user_id,
      details: row.details,
      hash: row.current_hash
    }));

    // Verify integrity for this subset
    const integrityResult = await this.db.query(`
      SELECT * FROM verify_audit_chain_integrity($1, $2)
    `, [startDate, endDate]);

    return {
      entity: { type: entityType, id: entityId },
      timeline,
      integrityVerified: integrityResult.rows[0].is_valid
    };
  }

  /**
   * Create compliance report
   */
  async createComplianceReport(request: CreateComplianceReportRequest, generatedBy: string): Promise<ComplianceReport> {
    const result = await this.db.query(`
      INSERT INTO compliance_reports (
        report_type, title, description, reporting_period_start, 
        reporting_period_end, template_version, generated_by, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING *
    `, [
      request.reportType,
      request.title,
      request.description,
      request.reportingPeriodStart,
      request.reportingPeriodEnd,
      request.templateVersion,
      generatedBy
    ]);

    const report = this.mapEntityToComplianceReport(result.rows[0]);

    // Start async report generation
    this.generateComplianceReport(report.id).catch(error => {
      console.error(`Failed to generate compliance report ${report.id}:`, error);
      this.updateReportStatus(report.id, ComplianceReportStatus.ARCHIVED, error.message);
    });

    return report;
  }

  /**
   * Get compliance report by ID
   */
  async getComplianceReport(id: string): Promise<ComplianceReport | null> {
    const result = await this.db.query(`
      SELECT * FROM compliance_reports WHERE id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapEntityToComplianceReport(result.rows[0]);
  }

  /**
   * List compliance reports
   */
  async listComplianceReports(
    reportType?: string,
    status?: ComplianceReportStatus,
    limit: number = 50,
    offset: number = 0
  ): Promise<{
    reports: ComplianceReport[];
    total: number;
    hasMore: boolean;
  }> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (reportType) {
      conditions.push(`report_type = $${paramIndex++}`);
      params.push(reportType);
    }

    if (status) {
      conditions.push(`status = $${paramIndex++}`);
      params.push(status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countResult = await this.db.query(`
      SELECT COUNT(*) as total FROM compliance_reports ${whereClause}
    `, params);

    const total = parseInt(countResult.rows[0].total);

    // Get paginated results
    const dataResult = await this.db.query(`
      SELECT * FROM compliance_reports 
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `, [...params, limit, offset]);

    const reports = dataResult.rows.map(row => this.mapEntityToComplianceReport(row));
    const hasMore = offset + reports.length < total;

    return { reports, total, hasMore };
  }

  private async generateEvidenceBundle(bundleId: string): Promise<void> {
    const bundle = await this.getEvidenceBundle(bundleId);
    if (!bundle) {
      throw new Error(`Evidence bundle ${bundleId} not found`);
    }

    try {
      // Ensure storage directory exists
      await fs.mkdir(this.bundleStoragePath, { recursive: true });

      const fileName = `evidence-bundle-${bundleId}-${Date.now()}.zip`;
      const filePath = path.join(this.bundleStoragePath, fileName);

      // Create zip archive
      const output = require('fs').createWriteStream(filePath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      archive.pipe(output);

      // Query audit logs based on criteria
      const queryCriteria = bundle.queryCriteria as AuditLogQuery;
      const auditResult = await this.queryAuditLogs(queryCriteria);

      // Add audit logs to archive
      const auditLogsJson = JSON.stringify(auditResult.logs, null, 2);
      archive.append(auditLogsJson, { name: 'audit-logs.json' });

      // Add metadata
      const metadata = {
        bundleId: bundle.id,
        bundleName: bundle.name,
        bundleType: bundle.bundleType,
        generatedAt: bundle.generatedAt,
        generatedBy: bundle.generatedBy,
        queryCriteria: bundle.queryCriteria,
        totalRecords: auditResult.logs.length,
        integrityVerified: false // Will be set below
      };

      // Verify integrity for the queried period
      if (queryCriteria.startDate || queryCriteria.endDate) {
        const integrityResult = await this.db.query(`
          SELECT * FROM verify_audit_chain_integrity($1, $2)
        `, [queryCriteria.startDate, queryCriteria.endDate]);
        
        metadata.integrityVerified = integrityResult.rows[0].is_valid;
        
        // Add integrity report
        const integrityReport = {
          verificationTimestamp: new Date(),
          isValid: integrityResult.rows[0].is_valid,
          totalRecords: integrityResult.rows[0].total_records,
          invalidRecords: integrityResult.rows[0].invalid_records,
          firstInvalidId: integrityResult.rows[0].first_invalid_id,
          errorMessage: integrityResult.rows[0].error_message
        };
        
        archive.append(JSON.stringify(integrityReport, null, 2), { name: 'integrity-report.json' });
      }

      archive.append(JSON.stringify(metadata, null, 2), { name: 'metadata.json' });

      // Finalize archive
      await archive.finalize();

      // Wait for file to be written
      await new Promise((resolve, reject) => {
        output.on('close', resolve);
        output.on('error', reject);
      });

      // Calculate file hash and size
      const fileBuffer = await fs.readFile(filePath);
      const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
      const fileSize = fileBuffer.length;

      // Update bundle record
      await this.db.query(`
        UPDATE evidence_bundles 
        SET status = $1, file_path = $2, file_size = $3, file_hash = $4, completed_at = NOW()
        WHERE id = $5
      `, [EvidenceBundleStatus.READY, fileName, fileSize, fileHash, bundleId]);

    } catch (error) {
      await this.updateBundleStatus(bundleId, EvidenceBundleStatus.ERROR, error.message);
      throw error;
    }
  }

  private async generateComplianceReport(reportId: string): Promise<void> {
    const report = await this.getComplianceReport(reportId);
    if (!report) {
      throw new Error(`Compliance report ${reportId} not found`);
    }

    try {
      await this.db.query(`
        UPDATE compliance_reports 
        SET status = $1, generated_at = NOW()
        WHERE id = $2
      `, [ComplianceReportStatus.GENERATING, reportId]);

      // Generate report based on type
      const reportData = await this.generateReportData(report);

      // Save report file (implementation would depend on report format)
      const fileName = `compliance-report-${reportId}-${Date.now()}.json`;
      const filePath = path.join(this.bundleStoragePath, fileName);
      
      await fs.writeFile(filePath, JSON.stringify(reportData, null, 2));

      const fileBuffer = await fs.readFile(filePath);
      const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
      const fileSize = fileBuffer.length;

      await this.db.query(`
        UPDATE compliance_reports 
        SET status = $1, file_path = $2, file_size = $3, file_hash = $4
        WHERE id = $5
      `, [ComplianceReportStatus.READY, fileName, fileSize, fileHash, reportId]);

    } catch (error) {
      await this.updateReportStatus(reportId, ComplianceReportStatus.ARCHIVED, error.message);
      throw error;
    }
  }

  private async generateReportData(report: ComplianceReport): Promise<any> {
    // This would be customized based on report type
    const auditLogs = await this.queryAuditLogs({
      startDate: report.reportingPeriodStart,
      endDate: report.reportingPeriodEnd,
      limit: 10000
    });

    return {
      reportId: report.id,
      reportType: report.reportType,
      title: report.title,
      reportingPeriod: {
        start: report.reportingPeriodStart,
        end: report.reportingPeriodEnd
      },
      generatedAt: new Date(),
      summary: {
        totalAuditLogs: auditLogs.logs.length,
        uniqueUsers: new Set(auditLogs.logs.map(log => log.userId).filter(Boolean)).size,
        eventTypes: [...new Set(auditLogs.logs.map(log => log.eventType))],
        entityTypes: [...new Set(auditLogs.logs.map(log => log.entityType))]
      },
      auditLogs: auditLogs.logs
    };
  }

  private async queryAuditLogs(query: AuditLogQuery): Promise<{ logs: any[] }> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (query.eventType) {
      conditions.push(`event_type = $${paramIndex++}`);
      params.push(query.eventType);
    }

    if (query.entityType) {
      conditions.push(`entity_type = $${paramIndex++}`);
      params.push(query.entityType);
    }

    if (query.entityId) {
      conditions.push(`entity_id = $${paramIndex++}`);
      params.push(query.entityId);
    }

    if (query.userId) {
      conditions.push(`user_id = $${paramIndex++}`);
      params.push(query.userId);
    }

    if (query.startDate) {
      conditions.push(`timestamp >= $${paramIndex++}`);
      params.push(query.startDate);
    }

    if (query.endDate) {
      conditions.push(`timestamp <= $${paramIndex++}`);
      params.push(query.endDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = query.limit || 1000;

    const result = await this.db.query(`
      SELECT * FROM audit_logs 
      ${whereClause}
      ORDER BY timestamp DESC
      LIMIT $${paramIndex++}
    `, [...params, limit]);

    return { logs: result.rows };
  }

  private async updateBundleStatus(bundleId: string, status: EvidenceBundleStatus, errorMessage?: string): Promise<void> {
    await this.db.query(`
      UPDATE evidence_bundles 
      SET status = $1, error_message = $2, completed_at = NOW()
      WHERE id = $3
    `, [status, errorMessage, bundleId]);
  }

  private async updateReportStatus(reportId: string, status: ComplianceReportStatus, errorMessage?: string): Promise<void> {
    await this.db.query(`
      UPDATE compliance_reports 
      SET status = $1
      WHERE id = $2
    `, [status, reportId]);
  }

  private mapEntityToEvidenceBundle(entity: EvidenceBundleEntity): EvidenceBundle {
    return {
      id: entity.id,
      name: entity.name,
      description: entity.description,
      bundleType: entity.bundle_type as EvidenceBundleType,
      status: entity.status as EvidenceBundleStatus,
      queryCriteria: entity.query_criteria,
      filePath: entity.file_path,
      fileSize: entity.file_size,
      fileHash: entity.file_hash,
      expiresAt: entity.expires_at,
      generatedBy: entity.generated_by,
      generatedAt: entity.generated_at,
      completedAt: entity.completed_at,
      errorMessage: entity.error_message
    };
  }

  private mapEntityToComplianceReport(entity: ComplianceReportEntity): ComplianceReport {
    return {
      id: entity.id,
      reportType: entity.report_type,
      title: entity.title,
      description: entity.description,
      reportingPeriodStart: entity.reporting_period_start,
      reportingPeriodEnd: entity.reporting_period_end,
      status: entity.status as ComplianceReportStatus,
      templateVersion: entity.template_version,
      generatedBy: entity.generated_by,
      reviewedBy: entity.reviewed_by,
      approvedBy: entity.approved_by,
      filePath: entity.file_path,
      fileSize: entity.file_size,
      fileHash: entity.file_hash,
      createdAt: entity.created_at,
      generatedAt: entity.generated_at,
      reviewedAt: entity.reviewed_at,
      approvedAt: entity.approved_at
    };
  }
}