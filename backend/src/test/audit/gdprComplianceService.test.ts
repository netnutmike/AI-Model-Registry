import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Pool } from 'pg';
import { GDPRComplianceService } from '../../services/audit/gdprComplianceService.js';
import {
  CreateDataSubjectRequestRequest,
  DataSubjectRequestType,
  DataSubjectRequestStatus,
  CreateDataRetentionPolicyRequest,
  DataCategory,
  SensitivityLevel
} from '../../types/index.js';

const mockClient = {
  query: vi.fn(),
  release: vi.fn(),
};

const mockPool = {
  connect: vi.fn().mockResolvedValue(mockClient),
  query: vi.fn(),
} as unknown as Pool;

describe('GDPRComplianceService', () => {
  let gdprService: GDPRComplianceService;

  beforeEach(() => {
    vi.clearAllMocks();
    gdprService = new GDPRComplianceService(mockPool);
  });

  describe('createDataSubjectRequest', () => {
    it('should create data subject access request', async () => {
      const request: CreateDataSubjectRequestRequest = {
        requestType: DataSubjectRequestType.ACCESS,
        subjectIdentifier: 'user@example.com',
        subjectType: 'email',
        justification: 'User requested access to their personal data'
      };

      const mockRequestEntity = {
        id: 'dsr-123',
        request_type: 'access',
        subject_identifier: 'user@example.com',
        subject_type: 'email',
        status: 'pending',
        justification: 'User requested access to their personal data',
        requested_by: 'admin-123',
        requested_at: new Date('2024-01-01T10:00:00Z'),
        processed_by: null,
        processed_at: null,
        completion_details: null
      };

      mockPool.query = vi.fn().mockResolvedValueOnce({
        rows: [mockRequestEntity]
      });

      const result = await gdprService.createDataSubjectRequest(request, 'admin-123');

      expect(result).toEqual({
        id: 'dsr-123',
        requestType: DataSubjectRequestType.ACCESS,
        subjectIdentifier: 'user@example.com',
        subjectType: 'email',
        status: DataSubjectRequestStatus.PENDING,
        justification: 'User requested access to their personal data',
        requestedBy: 'admin-123',
        requestedAt: new Date('2024-01-01T10:00:00Z'),
        processedBy: null,
        processedAt: null,
        completionDetails: null
      });
    });

    it('should create data subject deletion request', async () => {
      const request: CreateDataSubjectRequestRequest = {
        requestType: DataSubjectRequestType.DELETION,
        subjectIdentifier: 'user@example.com',
        subjectType: 'email',
        justification: 'User requested deletion of their personal data'
      };

      const mockRequestEntity = {
        id: 'dsr-456',
        request_type: 'deletion',
        subject_identifier: 'user@example.com',
        subject_type: 'email',
        status: 'pending',
        justification: 'User requested deletion of their personal data',
        requested_by: 'admin-123',
        requested_at: new Date('2024-01-01T10:00:00Z'),
        processed_by: null,
        processed_at: null,
        completion_details: null
      };

      mockPool.query = vi.fn().mockResolvedValueOnce({
        rows: [mockRequestEntity]
      });

      const result = await gdprService.createDataSubjectRequest(request, 'admin-123');

      expect(result.requestType).toBe(DataSubjectRequestType.DELETION);
      expect(result.subjectIdentifier).toBe('user@example.com');
    });
  });

  describe('processDataSubjectRequest', () => {
    it('should process access request successfully', async () => {
      const mockRequest = {
        id: 'dsr-123',
        request_type: 'access',
        subject_identifier: 'user@example.com',
        subject_type: 'email',
        status: 'pending',
        justification: 'User requested access',
        requested_by: 'admin-123',
        requested_at: new Date('2024-01-01T10:00:00Z'),
        processed_by: null,
        processed_at: null,
        completion_details: null
      };

      const mockUpdatedRequest = {
        ...mockRequest,
        status: 'completed',
        processed_by: 'admin-456',
        processed_at: new Date('2024-01-01T11:00:00Z'),
        completion_details: {
          requestType: 'access',
          subjectIdentifier: 'user@example.com',
          dataExtracted: { tables: [] },
          extractedAt: new Date(),
          format: 'json'
        }
      };

      // Mock getting the request and updating it
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [mockRequest] }) // Get request
        .mockResolvedValueOnce({ rows: [mockUpdatedRequest] }) // Update request
        .mockResolvedValueOnce(undefined); // COMMIT
      
      // Mock the pool query for personal data inventory
      mockPool.query = vi.fn().mockResolvedValueOnce({ rows: [] });

      const result = await gdprService.processDataSubjectRequest(
        'dsr-123',
        'admin-456',
        DataSubjectRequestStatus.COMPLETED
      );

      expect(result.status).toBe(DataSubjectRequestStatus.COMPLETED);
      expect(result.processedBy).toBe('admin-456');
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('should process deletion request successfully', async () => {
      const mockRequest = {
        id: 'dsr-456',
        request_type: 'deletion',
        subject_identifier: 'user@example.com',
        subject_type: 'email',
        status: 'pending',
        justification: 'User requested deletion',
        requested_by: 'admin-123',
        requested_at: new Date('2024-01-01T10:00:00Z'),
        processed_by: null,
        processed_at: null,
        completion_details: null
      };

      const mockUpdatedRequest = {
        ...mockRequest,
        status: 'completed',
        processed_by: 'admin-456',
        processed_at: new Date('2024-01-01T11:00:00Z'),
        completion_details: {
          requestType: 'deletion',
          subjectIdentifier: 'user@example.com',
          recordsDeleted: 5,
          tablesAffected: ['users', 'user_sessions'],
          deletedAt: new Date()
        }
      };

      // Mock getting the request and updating it
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [mockRequest] }) // Get request
        .mockResolvedValueOnce({ rows: [mockUpdatedRequest] }) // Update request
        .mockResolvedValueOnce(undefined); // COMMIT
      
      // Mock the pool query for personal data inventory
      mockPool.query = vi.fn().mockResolvedValueOnce({ rows: [] });

      const result = await gdprService.processDataSubjectRequest(
        'dsr-456',
        'admin-456',
        DataSubjectRequestStatus.COMPLETED
      );

      expect(result.status).toBe(DataSubjectRequestStatus.COMPLETED);
      expect(result.completionDetails?.recordsDeleted).toBe(5);
    });

    it('should handle request not found', async () => {
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // Get request (not found)
        .mockResolvedValueOnce(undefined); // ROLLBACK

      await expect(
        gdprService.processDataSubjectRequest(
          'nonexistent',
          'admin-456',
          DataSubjectRequestStatus.COMPLETED
        )
      ).rejects.toThrow('Data subject request nonexistent not found');
    });
  });

  describe('listDataSubjectRequests', () => {
    it('should list data subject requests with filters', async () => {
      const mockRequests = [
        {
          id: 'dsr-1',
          request_type: 'access',
          subject_identifier: 'user1@example.com',
          subject_type: 'email',
          status: 'pending',
          justification: 'Access request',
          requested_by: 'admin-1',
          requested_at: new Date('2024-01-01T10:00:00Z'),
          processed_by: null,
          processed_at: null,
          completion_details: null
        },
        {
          id: 'dsr-2',
          request_type: 'deletion',
          subject_identifier: 'user2@example.com',
          subject_type: 'email',
          status: 'completed',
          justification: 'Deletion request',
          requested_by: 'admin-1',
          requested_at: new Date('2024-01-02T10:00:00Z'),
          processed_by: 'admin-2',
          processed_at: new Date('2024-01-02T11:00:00Z'),
          completion_details: { recordsDeleted: 3 }
        }
      ];

      // Mock count and data queries
      mockPool.query = vi.fn()
        .mockResolvedValueOnce({ rows: [{ total: '2' }] })
        .mockResolvedValueOnce({ rows: mockRequests });

      const result = await gdprService.listDataSubjectRequests(
        undefined,
        undefined,
        'email',
        10,
        0
      );

      expect(result.total).toBe(2);
      expect(result.requests).toHaveLength(2);
      expect(result.hasMore).toBe(false);
      expect(result.requests[0].requestType).toBe(DataSubjectRequestType.ACCESS);
      expect(result.requests[1].requestType).toBe(DataSubjectRequestType.DELETION);
    });
  });

  describe('createDataRetentionPolicy', () => {
    it('should create data retention policy', async () => {
      const request: CreateDataRetentionPolicyRequest = {
        name: 'User Data Retention',
        description: 'Retention policy for user personal data',
        entityType: 'users',
        retentionPeriodDays: 2555, // 7 years
        deletionCriteria: {
          conditions: ['inactive_for_days > 2555']
        }
      };

      const mockPolicyEntity = {
        id: 'policy-123',
        name: 'User Data Retention',
        description: 'Retention policy for user personal data',
        entity_type: 'users',
        retention_period_days: 2555,
        deletion_criteria: { conditions: ['inactive_for_days > 2555'] },
        is_active: true,
        created_by: 'admin-123',
        created_at: new Date('2024-01-01T10:00:00Z'),
        updated_at: new Date('2024-01-01T10:00:00Z')
      };

      mockPool.query = vi.fn().mockResolvedValueOnce({
        rows: [mockPolicyEntity]
      });

      const result = await gdprService.createDataRetentionPolicy(request, 'admin-123');

      expect(result).toEqual({
        id: 'policy-123',
        name: 'User Data Retention',
        description: 'Retention policy for user personal data',
        entityType: 'users',
        retentionPeriodDays: 2555,
        deletionCriteria: { conditions: ['inactive_for_days > 2555'] },
        isActive: true,
        createdBy: 'admin-123',
        createdAt: new Date('2024-01-01T10:00:00Z'),
        updatedAt: new Date('2024-01-01T10:00:00Z')
      });
    });
  });

  describe('updateDataRetentionPolicy', () => {
    it('should update data retention policy', async () => {
      const updates = {
        description: 'Updated retention policy description',
        retentionPeriodDays: 1825 // 5 years
      };

      const mockUpdatedPolicy = {
        id: 'policy-123',
        name: 'User Data Retention',
        description: 'Updated retention policy description',
        entity_type: 'users',
        retention_period_days: 1825,
        deletion_criteria: {},
        is_active: true,
        created_by: 'admin-123',
        created_at: new Date('2024-01-01T10:00:00Z'),
        updated_at: new Date('2024-01-02T10:00:00Z')
      };

      mockPool.query = vi.fn().mockResolvedValueOnce({
        rows: [mockUpdatedPolicy]
      });

      const result = await gdprService.updateDataRetentionPolicy('policy-123', updates);

      expect(result.description).toBe('Updated retention policy description');
      expect(result.retentionPeriodDays).toBe(1825);
    });

    it('should throw error for non-existent policy', async () => {
      mockPool.query = vi.fn().mockResolvedValueOnce({ rows: [] });

      await expect(
        gdprService.updateDataRetentionPolicy('nonexistent', { description: 'test' })
      ).rejects.toThrow('Data retention policy nonexistent not found');
    });

    it('should throw error for no updates', async () => {
      await expect(
        gdprService.updateDataRetentionPolicy('policy-123', {})
      ).rejects.toThrow('No updates provided');
    });
  });

  describe('listDataRetentionPolicies', () => {
    it('should list data retention policies with filters', async () => {
      const mockPolicies = [
        {
          id: 'policy-1',
          name: 'User Data Policy',
          description: 'Policy for user data',
          entity_type: 'users',
          retention_period_days: 2555,
          deletion_criteria: {},
          is_active: true,
          created_by: 'admin-1',
          created_at: new Date('2024-01-01T10:00:00Z'),
          updated_at: new Date('2024-01-01T10:00:00Z')
        }
      ];

      // Mock count and data queries
      mockPool.query = vi.fn()
        .mockResolvedValueOnce({ rows: [{ total: '1' }] })
        .mockResolvedValueOnce({ rows: mockPolicies });

      const result = await gdprService.listDataRetentionPolicies(
        'users',
        true,
        10,
        0
      );

      expect(result.total).toBe(1);
      expect(result.policies).toHaveLength(1);
      expect(result.hasMore).toBe(false);
      expect(result.policies[0].entityType).toBe('users');
    });
  });

  describe('addPersonalDataInventory', () => {
    it('should add personal data inventory entry', async () => {
      const mockInventoryEntity = {
        id: 'pdi-123',
        table_name: 'users',
        column_name: 'email',
        data_category: 'contact',
        sensitivity_level: 'high',
        legal_basis: 'consent',
        retention_policy_id: 'policy-123',
        pseudonymization_method: 'hash',
        is_active: true,
        created_at: new Date('2024-01-01T10:00:00Z'),
        updated_at: new Date('2024-01-01T10:00:00Z')
      };

      mockPool.query = vi.fn().mockResolvedValueOnce({
        rows: [mockInventoryEntity]
      });

      const result = await gdprService.addPersonalDataInventory(
        'users',
        'email',
        DataCategory.CONTACT,
        SensitivityLevel.HIGH,
        'consent',
        'policy-123',
        'hash'
      );

      expect(result).toEqual({
        id: 'pdi-123',
        tableName: 'users',
        columnName: 'email',
        dataCategory: DataCategory.CONTACT,
        sensitivityLevel: SensitivityLevel.HIGH,
        legalBasis: 'consent',
        retentionPolicyId: 'policy-123',
        pseudonymizationMethod: 'hash',
        isActive: true,
        createdAt: new Date('2024-01-01T10:00:00Z'),
        updatedAt: new Date('2024-01-01T10:00:00Z')
      });
    });
  });

  describe('getPersonalDataInventory', () => {
    it('should get personal data inventory with filters', async () => {
      const mockInventory = [
        {
          id: 'pdi-1',
          table_name: 'users',
          column_name: 'email',
          data_category: 'contact',
          sensitivity_level: 'high',
          legal_basis: 'consent',
          retention_policy_id: null,
          pseudonymization_method: null,
          is_active: true,
          created_at: new Date('2024-01-01T10:00:00Z'),
          updated_at: new Date('2024-01-01T10:00:00Z')
        },
        {
          id: 'pdi-2',
          table_name: 'users',
          column_name: 'name',
          data_category: 'identity',
          sensitivity_level: 'medium',
          legal_basis: 'contract',
          retention_policy_id: null,
          pseudonymization_method: null,
          is_active: true,
          created_at: new Date('2024-01-01T10:00:00Z'),
          updated_at: new Date('2024-01-01T10:00:00Z')
        }
      ];

      mockPool.query = vi.fn().mockResolvedValueOnce({
        rows: mockInventory
      });

      const result = await gdprService.getPersonalDataInventory(
        'users',
        DataCategory.CONTACT
      );

      expect(result).toHaveLength(2);
      expect(result[0].tableName).toBe('users');
      expect(result[0].dataCategory).toBe(DataCategory.CONTACT);
    });
  });

  describe('identifyPersonalDataForSubject', () => {
    it('should identify personal data for subject', async () => {
      const mockInventory = [
        {
          id: 'pdi-1',
          table_name: 'users',
          column_name: 'email',
          data_category: 'contact',
          sensitivity_level: 'high',
          legal_basis: 'consent',
          retention_policy_id: null,
          pseudonymization_method: null,
          is_active: true,
          created_at: new Date('2024-01-01T10:00:00Z'),
          updated_at: new Date('2024-01-01T10:00:00Z')
        }
      ];

      // Mock inventory query and data lookup
      mockPool.query = vi.fn()
        .mockResolvedValueOnce({ rows: mockInventory })
        .mockResolvedValueOnce({ rows: [{ email: 'user@example.com' }] });

      const result = await gdprService.identifyPersonalDataForSubject(
        'user@example.com',
        'email'
      );

      expect(result.tables).toHaveLength(1);
      expect(result.tables[0].tableName).toBe('users');
      expect(result.tables[0].columns).toHaveLength(1);
      expect(result.tables[0].columns[0].columnName).toBe('email');
      expect(result.tables[0].columns[0].value).toBe('user@example.com');
    });
  });

  describe('pseudonymizePersonalData', () => {
    it('should pseudonymize data using hash method', async () => {
      mockPool.query = vi.fn()
        .mockResolvedValueOnce({ rowCount: 10 })
        .mockResolvedValueOnce({ rowCount: 1 });

      const result = await gdprService.pseudonymizePersonalData(
        'users',
        'email',
        'hash'
      );

      expect(result.recordsProcessed).toBe(10);
    });

    it('should pseudonymize data using encrypt method', async () => {
      mockPool.query = vi.fn()
        .mockResolvedValueOnce({ rowCount: 5 })
        .mockResolvedValueOnce({ rowCount: 1 });

      const result = await gdprService.pseudonymizePersonalData(
        'users',
        'phone',
        'encrypt'
      );

      expect(result.recordsProcessed).toBe(5);
    });

    it('should handle tokenize method (not implemented)', async () => {
      mockPool.query = vi.fn()
        .mockResolvedValueOnce({ rowCount: 1 });

      const result = await gdprService.pseudonymizePersonalData(
        'users',
        'ssn',
        'tokenize'
      );

      expect(result.recordsProcessed).toBe(0);
    });
  });

  describe('enforceDataRetentionPolicies', () => {
    it('should enforce data retention policies', async () => {
      const mockPolicies = [
        {
          id: 'policy-1',
          name: 'User Data Policy',
          description: 'Policy for user data',
          entity_type: 'users',
          retention_period_days: 365,
          deletion_criteria: {},
          is_active: true,
          created_by: 'admin-1',
          created_at: new Date('2024-01-01T10:00:00Z'),
          updated_at: new Date('2024-01-01T10:00:00Z')
        }
      ];

      // Mock policies list and audit log insertion
      mockPool.query = vi.fn()
        .mockResolvedValueOnce({ rows: [{ total: '1' }] })
        .mockResolvedValueOnce({ rows: mockPolicies })
        .mockResolvedValueOnce({ rowCount: 1 });

      const result = await gdprService.enforceDataRetentionPolicies();

      expect(result.policiesProcessed).toBe(1);
      expect(result.recordsDeleted).toBe(0); // Simplified implementation returns 0
      expect(result.errors).toHaveLength(0);
    });
  });
});