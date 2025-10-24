import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Pool } from 'pg';
import { AuditService } from '../../services/audit/auditService.js';
import {
  CreateAuditLogRequest,
  AuditLogQuery,
  VerifyIntegrityRequest,
  AuthenticatedRequest
} from '../../types/index.js';

// Mock pg Pool
const mockClient = {
  query: vi.fn(),
  release: vi.fn(),
};

const mockPool = {
  connect: vi.fn().mockResolvedValue(mockClient),
  query: vi.fn(),
} as unknown as Pool;

describe('AuditService', () => {
  let auditService: AuditService;

  beforeEach(() => {
    vi.clearAllMocks();
    auditService = new AuditService(mockPool);
  });

  describe('createAuditLog', () => {
    it('should create audit log with valid event type', async () => {
      const request: CreateAuditLogRequest = {
        eventType: 'model.created',
        entityType: 'model',
        entityId: 'model-123',
        action: 'create',
        details: { name: 'test-model', group: 'test-group', risk_tier: 'Low' },
        metadata: { source: 'api' }
      };

      const context = {
        userId: 'user-123',
        sessionId: 'session-123',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0'
      };

      // Mock transaction calls and event type validation
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({
          rows: [{
            event_type: 'model.created',
            required_fields: ['name', 'group', 'risk_tier']
          }]
        })
        // Mock audit log insertion
        .mockResolvedValueOnce({
          rows: [{
            id: 'audit-123',
            event_type: 'model.created',
            entity_type: 'model',
            entity_id: 'model-123',
            user_id: 'user-123',
            session_id: 'session-123',
            action: 'create',
            details: { name: 'test-model', group: 'test-group', risk_tier: 'Low' },
            metadata: { source: 'api' },
            ip_address: '192.168.1.1',
            user_agent: 'Mozilla/5.0',
            previous_hash: 'prev-hash',
            current_hash: 'current-hash',
            timestamp: new Date('2024-01-01T00:00:00Z')
          }]
        })
        .mockResolvedValueOnce(undefined); // COMMIT

      const result = await auditService.createAuditLog(request, context);

      expect(result).toEqual({
        id: 'audit-123',
        eventType: 'model.created',
        entityType: 'model',
        entityId: 'model-123',
        userId: 'user-123',
        sessionId: 'session-123',
        action: 'create',
        details: { name: 'test-model', group: 'test-group', risk_tier: 'Low' },
        metadata: { source: 'api' },
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        previousHash: 'prev-hash',
        currentHash: 'current-hash',
        timestamp: new Date('2024-01-01T00:00:00Z')
      });

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('should reject invalid event type', async () => {
      const request: CreateAuditLogRequest = {
        eventType: 'invalid.event',
        entityType: 'model',
        entityId: 'model-123',
        action: 'create',
        details: {}
      };

      // Mock transaction and event type validation failure
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // Event type validation
        .mockResolvedValueOnce(undefined); // ROLLBACK

      await expect(auditService.createAuditLog(request)).rejects.toThrow(
        'Invalid or inactive event type: invalid.event'
      );
    });

    it('should reject missing required fields', async () => {
      const request: CreateAuditLogRequest = {
        eventType: 'model.created',
        entityType: 'model',
        entityId: 'model-123',
        action: 'create',
        details: { name: 'test-model' } // missing 'group' and 'risk_tier'
      };

      // Mock transaction and event type validation
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({
          rows: [{
            event_type: 'model.created',
            required_fields: ['name', 'group', 'risk_tier']
          }]
        })
        .mockResolvedValueOnce(undefined); // ROLLBACK

      await expect(auditService.createAuditLog(request)).rejects.toThrow(
        'Missing required fields for event type model.created: group, risk_tier'
      );
    });
  });

  describe('queryAuditLogs', () => {
    it('should query audit logs with filters', async () => {
      const query: AuditLogQuery = {
        eventType: 'model.created',
        entityType: 'model',
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31'),
        limit: 10,
        offset: 0
      };

      const mockAuditLogs = [
        {
          id: 'audit-1',
          event_type: 'model.created',
          entity_type: 'model',
          entity_id: 'model-1',
          user_id: 'user-1',
          session_id: 'session-1',
          action: 'create',
          details: {},
          metadata: {},
          ip_address: '192.168.1.1',
          user_agent: 'Mozilla/5.0',
          previous_hash: 'prev-hash-1',
          current_hash: 'current-hash-1',
          timestamp: new Date('2024-01-15T10:00:00Z')
        }
      ];

      // Mock count query
      mockPool.query = vi.fn()
        .mockResolvedValueOnce({ rows: [{ total: '1' }] })
        .mockResolvedValueOnce({ rows: mockAuditLogs });

      const result = await auditService.queryAuditLogs(query);

      expect(result.total).toBe(1);
      expect(result.logs).toHaveLength(1);
      expect(result.hasMore).toBe(false);
      expect(result.logs[0].eventType).toBe('model.created');
    });

    it('should handle empty results', async () => {
      const query: AuditLogQuery = {
        entityId: 'nonexistent-model'
      };

      // Mock empty results
      mockPool.query = vi.fn()
        .mockResolvedValueOnce({ rows: [{ total: '0' }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await auditService.queryAuditLogs(query);

      expect(result.total).toBe(0);
      expect(result.logs).toHaveLength(0);
      expect(result.hasMore).toBe(false);
    });
  });

  describe('verifyHashChainIntegrity', () => {
    it('should verify hash chain integrity successfully', async () => {
      const request: VerifyIntegrityRequest = {
        startTimestamp: new Date('2024-01-01'),
        endTimestamp: new Date('2024-01-31')
      };

      const mockIntegrityResult = {
        is_valid: true,
        total_records: '100',
        invalid_records: '0',
        first_invalid_id: null,
        error_message: 'Hash chain integrity verified'
      };

      mockPool.query = vi.fn().mockResolvedValueOnce({
        rows: [mockIntegrityResult]
      });

      const result = await auditService.verifyHashChainIntegrity(request);

      expect(result).toEqual({
        isValid: true,
        totalRecords: 100,
        invalidRecords: 0,
        firstInvalidId: null,
        errorMessage: 'Hash chain integrity verified'
      });
    });

    it('should detect hash chain integrity violations', async () => {
      const mockIntegrityResult = {
        is_valid: false,
        total_records: '100',
        invalid_records: '5',
        first_invalid_id: 'audit-invalid-1',
        error_message: 'Hash chain integrity compromised - 5 invalid records found'
      };

      mockPool.query = vi.fn().mockResolvedValueOnce({
        rows: [mockIntegrityResult]
      });

      const result = await auditService.verifyHashChainIntegrity();

      expect(result.isValid).toBe(false);
      expect(result.invalidRecords).toBe(5);
      expect(result.firstInvalidId).toBe('audit-invalid-1');
    });
  });

  describe('getEntityAuditTrail', () => {
    it('should get complete audit trail for entity', async () => {
      const mockAuditTrail = [
        {
          id: 'audit-1',
          event_type: 'model.created',
          entity_type: 'model',
          entity_id: 'model-123',
          user_id: 'user-1',
          session_id: 'session-1',
          action: 'create',
          details: { name: 'test-model' },
          metadata: {},
          ip_address: '192.168.1.1',
          user_agent: 'Mozilla/5.0',
          previous_hash: 'prev-hash-1',
          current_hash: 'current-hash-1',
          timestamp: new Date('2024-01-01T10:00:00Z')
        },
        {
          id: 'audit-2',
          event_type: 'model.updated',
          entity_type: 'model',
          entity_id: 'model-123',
          user_id: 'user-1',
          session_id: 'session-2',
          action: 'update',
          details: { changes: { description: 'Updated description' } },
          metadata: {},
          ip_address: '192.168.1.1',
          user_agent: 'Mozilla/5.0',
          previous_hash: 'current-hash-1',
          current_hash: 'current-hash-2',
          timestamp: new Date('2024-01-02T10:00:00Z')
        }
      ];

      mockPool.query = vi.fn().mockResolvedValueOnce({
        rows: mockAuditTrail
      });

      const result = await auditService.getEntityAuditTrail('model', 'model-123');

      expect(result).toHaveLength(2);
      expect(result[0].eventType).toBe('model.created');
      expect(result[1].eventType).toBe('model.updated');
    });
  });

  describe('getAuditStatistics', () => {
    it('should return comprehensive audit statistics', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      // Mock multiple query results
      mockPool.query = vi.fn()
        // Total logs
        .mockResolvedValueOnce({ rows: [{ total: '1000' }] })
        // Logs by event type
        .mockResolvedValueOnce({
          rows: [
            { event_type: 'model.created', count: '500' },
            { event_type: 'model.updated', count: '300' },
            { event_type: 'version.created', count: '200' }
          ]
        })
        // Logs by entity type
        .mockResolvedValueOnce({
          rows: [
            { entity_type: 'model', count: '800' },
            { entity_type: 'model_version', count: '200' }
          ]
        })
        // Logs by user
        .mockResolvedValueOnce({
          rows: [
            { user_id: 'user-1', count: '600' },
            { user_id: 'user-2', count: '400' }
          ]
        })
        // Integrity check
        .mockResolvedValueOnce({
          rows: [{
            is_valid: true,
            total_records: '1000',
            invalid_records: '0',
            first_invalid_id: null,
            error_message: 'Hash chain integrity verified'
          }]
        });

      const result = await auditService.getAuditStatistics(startDate, endDate);

      expect(result.totalLogs).toBe(1000);
      expect(result.logsByEventType['model.created']).toBe(500);
      expect(result.logsByEntityType['model']).toBe(800);
      expect(result.logsByUser['user-1']).toBe(600);
      expect(result.integrityStatus.isValid).toBe(true);
    });
  });

  describe('auditFromRequest', () => {
    it('should create audit log from authenticated request', async () => {
      const mockRequest = {
        user: { id: 'user-123' },
        session: { id: 'session-123' },
        ip: '192.168.1.1',
        get: vi.fn().mockReturnValue('Mozilla/5.0')
      } as unknown as AuthenticatedRequest;

      // Mock successful audit log creation
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({
          rows: [{
            event_type: 'model.created',
            required_fields: ['name']
          }]
        })
        .mockResolvedValueOnce({
          rows: [{
            id: 'audit-123',
            event_type: 'model.created',
            entity_type: 'model',
            entity_id: 'model-123',
            user_id: 'user-123',
            session_id: 'session-123',
            action: 'create',
            details: { name: 'test-model' },
            metadata: {},
            ip_address: '192.168.1.1',
            user_agent: 'Mozilla/5.0',
            previous_hash: 'prev-hash',
            current_hash: 'current-hash',
            timestamp: new Date('2024-01-01T00:00:00Z')
          }]
        })
        .mockResolvedValueOnce(undefined); // COMMIT

      const result = await auditService.auditFromRequest(
        mockRequest,
        'model.created',
        'model',
        'model-123',
        'create',
        { name: 'test-model' }
      );

      expect(result.userId).toBe('user-123');
      expect(result.sessionId).toBe('session-123');
      expect(result.ipAddress).toBe('192.168.1.1');
      expect(result.userAgent).toBe('Mozilla/5.0');
    });
  });

  describe('createBulkAuditLogs', () => {
    it('should create multiple audit logs in transaction', async () => {
      const logs: CreateAuditLogRequest[] = [
        {
          eventType: 'model.created',
          entityType: 'model',
          entityId: 'model-1',
          action: 'create',
          details: { name: 'model-1' }
        },
        {
          eventType: 'model.created',
          entityType: 'model',
          entityId: 'model-2',
          action: 'create',
          details: { name: 'model-2' }
        }
      ];

      // Mock event type validation for both logs
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({
          rows: [{
            event_type: 'model.created',
            required_fields: ['name']
          }]
        })
        .mockResolvedValueOnce({
          rows: [{
            id: 'audit-1',
            event_type: 'model.created',
            entity_type: 'model',
            entity_id: 'model-1',
            user_id: null,
            session_id: null,
            action: 'create',
            details: { name: 'model-1' },
            metadata: {},
            ip_address: null,
            user_agent: null,
            previous_hash: 'prev-hash-1',
            current_hash: 'current-hash-1',
            timestamp: new Date('2024-01-01T00:00:00Z')
          }]
        })
        .mockResolvedValueOnce({
          rows: [{
            event_type: 'model.created',
            required_fields: ['name']
          }]
        })
        .mockResolvedValueOnce({
          rows: [{
            id: 'audit-2',
            event_type: 'model.created',
            entity_type: 'model',
            entity_id: 'model-2',
            user_id: null,
            session_id: null,
            action: 'create',
            details: { name: 'model-2' },
            metadata: {},
            ip_address: null,
            user_agent: null,
            previous_hash: 'current-hash-1',
            current_hash: 'current-hash-2',
            timestamp: new Date('2024-01-01T00:01:00Z')
          }]
        })
        .mockResolvedValueOnce(undefined); // COMMIT

      const result = await auditService.createBulkAuditLogs(logs);

      expect(result).toHaveLength(2);
      expect(result[0].entityId).toBe('model-1');
      expect(result[1].entityId).toBe('model-2');
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('should handle empty bulk logs', async () => {
      const result = await auditService.createBulkAuditLogs([]);
      expect(result).toHaveLength(0);
    });
  });

  describe('getHashChainState', () => {
    it('should return current hash chain state', async () => {
      const mockChainState = {
        chain_name: 'audit_logs',
        last_hash: 'current-hash-123',
        last_sequence_number: 1000,
        updated_at: new Date('2024-01-01T12:00:00Z')
      };

      mockPool.query = vi.fn().mockResolvedValueOnce({
        rows: [mockChainState]
      });

      const result = await auditService.getHashChainState();

      expect(result).toEqual({
        chainName: 'audit_logs',
        lastHash: 'current-hash-123',
        lastSequenceNumber: 1000,
        updatedAt: new Date('2024-01-01T12:00:00Z')
      });
    });

    it('should throw error if hash chain state not found', async () => {
      mockPool.query = vi.fn().mockResolvedValueOnce({ rows: [] });

      await expect(auditService.getHashChainState()).rejects.toThrow(
        'Hash chain state not found'
      );
    });
  });
});