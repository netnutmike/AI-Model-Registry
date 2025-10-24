import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Pool } from 'pg';
import { EvidenceBundleService } from '../../services/audit/evidenceBundleService.js';
import {
  CreateEvidenceBundleRequest,
  EvidenceBundleType,
  EvidenceBundleStatus,
  CreateComplianceReportRequest,
  ComplianceReportStatus
} from '../../types/index.js';

// Mock fs/promises
vi.mock('fs/promises', () => ({
  default: {
    mkdir: vi.fn(),
    access: vi.fn(),
    unlink: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn()
  }
}));

// Mock archiver
vi.mock('archiver', () => ({
  default: vi.fn(() => ({
    pipe: vi.fn(),
    append: vi.fn(),
    finalize: vi.fn()
  }))
}));

// Mock fs for createWriteStream
vi.mock('fs', () => ({
  createWriteStream: vi.fn(() => ({
    on: vi.fn((event, callback) => {
      if (event === 'close') {
        setTimeout(callback, 0);
      }
    })
  }))
}));

const mockClient = {
  query: vi.fn(),
  release: vi.fn(),
};

const mockPool = {
  connect: vi.fn().mockResolvedValue(mockClient),
  query: vi.fn(),
} as unknown as Pool;

describe('EvidenceBundleService', () => {
  let evidenceBundleService: EvidenceBundleService;

  beforeEach(() => {
    vi.clearAllMocks();
    evidenceBundleService = new EvidenceBundleService(mockPool, './test-storage');
  });

  describe('createEvidenceBundle', () => {
    it('should create evidence bundle successfully', async () => {
      const request: CreateEvidenceBundleRequest = {
        name: 'Test Evidence Bundle',
        description: 'Test bundle for compliance',
        bundleType: EvidenceBundleType.COMPLIANCE_REPORT,
        queryCriteria: {
          eventType: 'model.created',
          startDate: new Date('2024-01-01'),
          endDate: new Date('2024-01-31')
        },
        expiresAt: new Date('2024-12-31')
      };

      const mockBundleEntity = {
        id: 'bundle-123',
        name: 'Test Evidence Bundle',
        description: 'Test bundle for compliance',
        bundle_type: 'compliance_report',
        status: 'generating',
        query_criteria: request.queryCriteria,
        file_path: null,
        file_size: null,
        file_hash: null,
        expires_at: new Date('2024-12-31'),
        generated_by: 'user-123',
        generated_at: new Date('2024-01-01T10:00:00Z'),
        completed_at: null,
        error_message: null
      };

      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({
          rows: [mockBundleEntity]
        })
        .mockResolvedValueOnce(undefined); // COMMIT

      const result = await evidenceBundleService.createEvidenceBundle(request, 'user-123');

      expect(result).toEqual({
        id: 'bundle-123',
        name: 'Test Evidence Bundle',
        description: 'Test bundle for compliance',
        bundleType: EvidenceBundleType.COMPLIANCE_REPORT,
        status: EvidenceBundleStatus.GENERATING,
        queryCriteria: request.queryCriteria,
        filePath: null,
        fileSize: null,
        fileHash: null,
        expiresAt: new Date('2024-12-31'),
        generatedBy: 'user-123',
        generatedAt: new Date('2024-01-01T10:00:00Z'),
        completedAt: null,
        errorMessage: null
      });

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });
  });

  describe('getEvidenceBundle', () => {
    it('should return evidence bundle by ID', async () => {
      const mockBundleEntity = {
        id: 'bundle-123',
        name: 'Test Bundle',
        description: 'Test description',
        bundle_type: 'audit_trail',
        status: 'ready',
        query_criteria: { eventType: 'model.created' },
        file_path: 'bundle-123.zip',
        file_size: 1024,
        file_hash: 'abc123',
        expires_at: null,
        generated_by: 'user-123',
        generated_at: new Date('2024-01-01T10:00:00Z'),
        completed_at: new Date('2024-01-01T10:05:00Z'),
        error_message: null
      };

      mockPool.query = vi.fn().mockResolvedValueOnce({
        rows: [mockBundleEntity]
      });

      const result = await evidenceBundleService.getEvidenceBundle('bundle-123');

      expect(result).toEqual({
        id: 'bundle-123',
        name: 'Test Bundle',
        description: 'Test description',
        bundleType: EvidenceBundleType.AUDIT_TRAIL,
        status: EvidenceBundleStatus.READY,
        queryCriteria: { eventType: 'model.created' },
        filePath: 'bundle-123.zip',
        fileSize: 1024,
        fileHash: 'abc123',
        expiresAt: null,
        generatedBy: 'user-123',
        generatedAt: new Date('2024-01-01T10:00:00Z'),
        completedAt: new Date('2024-01-01T10:05:00Z'),
        errorMessage: null
      });
    });

    it('should return null for non-existent bundle', async () => {
      mockPool.query = vi.fn().mockResolvedValueOnce({ rows: [] });

      const result = await evidenceBundleService.getEvidenceBundle('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('listEvidenceBundles', () => {
    it('should list evidence bundles with filters', async () => {
      const mockBundles = [
        {
          id: 'bundle-1',
          name: 'Bundle 1',
          description: 'First bundle',
          bundle_type: 'compliance_report',
          status: 'ready',
          query_criteria: {},
          file_path: 'bundle-1.zip',
          file_size: 1024,
          file_hash: 'hash1',
          expires_at: null,
          generated_by: 'user-1',
          generated_at: new Date('2024-01-01T10:00:00Z'),
          completed_at: new Date('2024-01-01T10:05:00Z'),
          error_message: null
        }
      ];

      // Mock count and data queries
      mockPool.query = vi.fn()
        .mockResolvedValueOnce({ rows: [{ total: '1' }] })
        .mockResolvedValueOnce({ rows: mockBundles });

      const result = await evidenceBundleService.listEvidenceBundles(
        EvidenceBundleType.COMPLIANCE_REPORT,
        EvidenceBundleStatus.READY,
        'user-1',
        10,
        0
      );

      expect(result.total).toBe(1);
      expect(result.bundles).toHaveLength(1);
      expect(result.hasMore).toBe(false);
      expect(result.bundles[0].bundleType).toBe(EvidenceBundleType.COMPLIANCE_REPORT);
    });
  });

  describe('reconstructAuditTrail', () => {
    it('should reconstruct audit trail for entity', async () => {
      const mockAuditLogs = [
        {
          event_type: 'model.created',
          action: 'create',
          user_id: 'user-1',
          details: { name: 'test-model' },
          timestamp: new Date('2024-01-01T10:00:00Z'),
          current_hash: 'hash1'
        },
        {
          event_type: 'model.updated',
          action: 'update',
          user_id: 'user-1',
          details: { changes: { description: 'Updated' } },
          timestamp: new Date('2024-01-02T10:00:00Z'),
          current_hash: 'hash2'
        }
      ];

      const mockIntegrityResult = {
        is_valid: true,
        total_records: '2',
        invalid_records: '0',
        first_invalid_id: null,
        error_message: 'Hash chain integrity verified'
      };

      mockPool.query = vi.fn()
        .mockResolvedValueOnce({ rows: mockAuditLogs })
        .mockResolvedValueOnce({ rows: [mockIntegrityResult] });

      const result = await evidenceBundleService.reconstructAuditTrail(
        'model',
        'model-123',
        new Date('2024-01-01'),
        new Date('2024-01-31')
      );

      expect(result.entity).toEqual({ type: 'model', id: 'model-123' });
      expect(result.timeline).toHaveLength(2);
      expect(result.timeline[0].eventType).toBe('model.created');
      expect(result.timeline[1].eventType).toBe('model.updated');
      expect(result.integrityVerified).toBe(true);
    });
  });

  describe('createComplianceReport', () => {
    it('should create compliance report successfully', async () => {
      const request: CreateComplianceReportRequest = {
        reportType: 'sox',
        title: 'SOX Compliance Report Q1 2024',
        description: 'Quarterly SOX compliance report',
        reportingPeriodStart: new Date('2024-01-01'),
        reportingPeriodEnd: new Date('2024-03-31'),
        templateVersion: '1.0'
      };

      const mockReportEntity = {
        id: 'report-123',
        report_type: 'sox',
        title: 'SOX Compliance Report Q1 2024',
        description: 'Quarterly SOX compliance report',
        reporting_period_start: new Date('2024-01-01'),
        reporting_period_end: new Date('2024-03-31'),
        status: 'draft',
        template_version: '1.0',
        generated_by: 'user-123',
        reviewed_by: null,
        approved_by: null,
        file_path: null,
        file_size: null,
        file_hash: null,
        created_at: new Date('2024-01-01T10:00:00Z'),
        generated_at: null,
        reviewed_at: null,
        approved_at: null
      };

      mockPool.query = vi.fn().mockResolvedValueOnce({
        rows: [mockReportEntity]
      });

      const result = await evidenceBundleService.createComplianceReport(request, 'user-123');

      expect(result).toEqual({
        id: 'report-123',
        reportType: 'sox',
        title: 'SOX Compliance Report Q1 2024',
        description: 'Quarterly SOX compliance report',
        reportingPeriodStart: new Date('2024-01-01'),
        reportingPeriodEnd: new Date('2024-03-31'),
        status: ComplianceReportStatus.DRAFT,
        templateVersion: '1.0',
        generatedBy: 'user-123',
        reviewedBy: null,
        approvedBy: null,
        filePath: null,
        fileSize: null,
        fileHash: null,
        createdAt: new Date('2024-01-01T10:00:00Z'),
        generatedAt: null,
        reviewedAt: null,
        approvedAt: null
      });
    });
  });

  describe('getComplianceReport', () => {
    it('should return compliance report by ID', async () => {
      const mockReportEntity = {
        id: 'report-123',
        report_type: 'gdpr',
        title: 'GDPR Compliance Report',
        description: 'Annual GDPR compliance report',
        reporting_period_start: new Date('2024-01-01'),
        reporting_period_end: new Date('2024-12-31'),
        status: 'ready',
        template_version: '2.0',
        generated_by: 'user-123',
        reviewed_by: 'user-456',
        approved_by: null,
        file_path: 'report-123.json',
        file_size: 2048,
        file_hash: 'def456',
        created_at: new Date('2024-01-01T10:00:00Z'),
        generated_at: new Date('2024-01-01T10:30:00Z'),
        reviewed_at: new Date('2024-01-01T11:00:00Z'),
        approved_at: null
      };

      mockPool.query = vi.fn().mockResolvedValueOnce({
        rows: [mockReportEntity]
      });

      const result = await evidenceBundleService.getComplianceReport('report-123');

      expect(result).toEqual({
        id: 'report-123',
        reportType: 'gdpr',
        title: 'GDPR Compliance Report',
        description: 'Annual GDPR compliance report',
        reportingPeriodStart: new Date('2024-01-01'),
        reportingPeriodEnd: new Date('2024-12-31'),
        status: ComplianceReportStatus.READY,
        templateVersion: '2.0',
        generatedBy: 'user-123',
        reviewedBy: 'user-456',
        approvedBy: null,
        filePath: 'report-123.json',
        fileSize: 2048,
        fileHash: 'def456',
        createdAt: new Date('2024-01-01T10:00:00Z'),
        generatedAt: new Date('2024-01-01T10:30:00Z'),
        reviewedAt: new Date('2024-01-01T11:00:00Z'),
        approvedAt: null
      });
    });

    it('should return null for non-existent report', async () => {
      mockPool.query = vi.fn().mockResolvedValueOnce({ rows: [] });

      const result = await evidenceBundleService.getComplianceReport('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('listComplianceReports', () => {
    it('should list compliance reports with filters', async () => {
      const mockReports = [
        {
          id: 'report-1',
          report_type: 'sox',
          title: 'SOX Report Q1',
          description: 'Q1 SOX report',
          reporting_period_start: new Date('2024-01-01'),
          reporting_period_end: new Date('2024-03-31'),
          status: 'ready',
          template_version: '1.0',
          generated_by: 'user-1',
          reviewed_by: null,
          approved_by: null,
          file_path: 'report-1.json',
          file_size: 1024,
          file_hash: 'hash1',
          created_at: new Date('2024-01-01T10:00:00Z'),
          generated_at: new Date('2024-01-01T10:30:00Z'),
          reviewed_at: null,
          approved_at: null
        }
      ];

      // Mock count and data queries
      mockPool.query = vi.fn()
        .mockResolvedValueOnce({ rows: [{ total: '1' }] })
        .mockResolvedValueOnce({ rows: mockReports });

      const result = await evidenceBundleService.listComplianceReports(
        'sox',
        ComplianceReportStatus.READY,
        10,
        0
      );

      expect(result.total).toBe(1);
      expect(result.reports).toHaveLength(1);
      expect(result.hasMore).toBe(false);
      expect(result.reports[0].reportType).toBe('sox');
    });
  });

  describe('cleanupExpiredBundles', () => {
    it('should cleanup expired evidence bundles', async () => {
      const mockExpiredBundles = [
        { id: 'bundle-1', file_path: 'bundle-1.zip' },
        { id: 'bundle-2', file_path: 'bundle-2.zip' }
      ];

      // Mock fs operations
      const fs = await import('fs/promises');
      fs.default.unlink = vi.fn().mockResolvedValue(undefined);

      mockPool.query = vi.fn()
        .mockResolvedValueOnce({ rows: mockExpiredBundles })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rowCount: 1 });

      const result = await evidenceBundleService.cleanupExpiredBundles();

      expect(result).toBe(2);
      expect(fs.default.unlink).toHaveBeenCalledTimes(2);
    });
  });
});