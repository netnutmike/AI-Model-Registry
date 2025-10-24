import { Pool } from 'pg';
import crypto from 'crypto';
import {
  DataSubjectRequest,
  DataSubjectRequestEntity,
  CreateDataSubjectRequestRequest,
  DataSubjectRequestType,
  DataSubjectRequestStatus,
  DataRetentionPolicy,
  DataRetentionPolicyEntity,
  CreateDataRetentionPolicyRequest,
  PersonalDataInventory,
  PersonalDataInventoryEntity,
  DataCategory,
  SensitivityLevel
} from '../../types/index.js';

export class GDPRComplianceService {
  constructor(private db: Pool) {}

  /**
   * Create a data subject access request (GDPR Article 15)
   */
  async createDataSubjectRequest(
    request: CreateDataSubjectRequestRequest,
    requestedBy: string
  ): Promise<DataSubjectRequest> {
    const result = await this.db.query(`
      INSERT INTO data_subject_requests (
        request_type, subject_identifier, subject_type, justification, 
        requested_by, requested_at
      ) VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING *
    `, [
      request.requestType,
      request.subjectIdentifier,
      request.subjectType,
      request.justification,
      requestedBy
    ]);

    return this.mapEntityToDataSubjectRequest(result.rows[0]);
  }

  /**
   * Process a data subject request
   */
  async processDataSubjectRequest(
    requestId: string,
    processedBy: string,
    status: DataSubjectRequestStatus,
    completionDetails?: Record<string, any>
  ): Promise<DataSubjectRequest> {
    const client = await this.db.connect();
    
    try {
      await client.query('BEGIN');

      // Get the request
      const requestResult = await client.query(`
        SELECT * FROM data_subject_requests WHERE id = $1
      `, [requestId]);

      if (requestResult.rows.length === 0) {
        throw new Error(`Data subject request ${requestId} not found`);
      }

      const request = this.mapEntityToDataSubjectRequest(requestResult.rows[0]);

      // Process based on request type
      let processedDetails = completionDetails || {};

      if (status === DataSubjectRequestStatus.COMPLETED) {
        switch (request.requestType) {
          case DataSubjectRequestType.ACCESS:
            processedDetails = await this.processAccessRequest(client, request);
            break;
          case DataSubjectRequestType.DELETION:
            processedDetails = await this.processDeletionRequest(client, request);
            break;
          case DataSubjectRequestType.RECTIFICATION:
            processedDetails = await this.processRectificationRequest(client, request);
            break;
          case DataSubjectRequestType.PORTABILITY:
            processedDetails = await this.processPortabilityRequest(client, request);
            break;
        }
      }

      // Update request status
      const updateResult = await client.query(`
        UPDATE data_subject_requests 
        SET status = $1, processed_by = $2, processed_at = NOW(), completion_details = $3
        WHERE id = $4
        RETURNING *
      `, [status, processedBy, JSON.stringify(processedDetails), requestId]);

      await client.query('COMMIT');

      return this.mapEntityToDataSubjectRequest(updateResult.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get data subject request by ID
   */
  async getDataSubjectRequest(id: string): Promise<DataSubjectRequest | null> {
    const result = await this.db.query(`
      SELECT * FROM data_subject_requests WHERE id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapEntityToDataSubjectRequest(result.rows[0]);
  }

  /**
   * List data subject requests with filtering
   */
  async listDataSubjectRequests(
    requestType?: DataSubjectRequestType,
    status?: DataSubjectRequestStatus,
    subjectType?: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<{
    requests: DataSubjectRequest[];
    total: number;
    hasMore: boolean;
  }> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (requestType) {
      conditions.push(`request_type = $${paramIndex++}`);
      params.push(requestType);
    }

    if (status) {
      conditions.push(`status = $${paramIndex++}`);
      params.push(status);
    }

    if (subjectType) {
      conditions.push(`subject_type = $${paramIndex++}`);
      params.push(subjectType);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countResult = await this.db.query(`
      SELECT COUNT(*) as total FROM data_subject_requests ${whereClause}
    `, params);

    const total = parseInt(countResult.rows[0].total);

    // Get paginated results
    const dataResult = await this.db.query(`
      SELECT * FROM data_subject_requests 
      ${whereClause}
      ORDER BY requested_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `, [...params, limit, offset]);

    const requests = dataResult.rows.map(row => this.mapEntityToDataSubjectRequest(row));
    const hasMore = offset + requests.length < total;

    return { requests, total, hasMore };
  }

  /**
   * Create data retention policy
   */
  async createDataRetentionPolicy(
    request: CreateDataRetentionPolicyRequest,
    createdBy: string
  ): Promise<DataRetentionPolicy> {
    const result = await this.db.query(`
      INSERT INTO data_retention_policies (
        name, description, entity_type, retention_period_days, 
        deletion_criteria, created_by, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
      RETURNING *
    `, [
      request.name,
      request.description,
      request.entityType,
      request.retentionPeriodDays,
      JSON.stringify(request.deletionCriteria || {}),
      createdBy
    ]);

    return this.mapEntityToDataRetentionPolicy(result.rows[0]);
  }

  /**
   * Update data retention policy
   */
  async updateDataRetentionPolicy(
    id: string,
    updates: Partial<CreateDataRetentionPolicyRequest>
  ): Promise<DataRetentionPolicy> {
    const setParts: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (updates.description !== undefined) {
      setParts.push(`description = $${paramIndex++}`);
      params.push(updates.description);
    }

    if (updates.retentionPeriodDays !== undefined) {
      setParts.push(`retention_period_days = $${paramIndex++}`);
      params.push(updates.retentionPeriodDays);
    }

    if (updates.deletionCriteria !== undefined) {
      setParts.push(`deletion_criteria = $${paramIndex++}`);
      params.push(JSON.stringify(updates.deletionCriteria));
    }

    if (setParts.length === 0) {
      throw new Error('No updates provided');
    }

    setParts.push(`updated_at = NOW()`);
    params.push(id);

    const result = await this.db.query(`
      UPDATE data_retention_policies 
      SET ${setParts.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `, params);

    if (result.rows.length === 0) {
      throw new Error(`Data retention policy ${id} not found`);
    }

    return this.mapEntityToDataRetentionPolicy(result.rows[0]);
  }

  /**
   * Get data retention policy by ID
   */
  async getDataRetentionPolicy(id: string): Promise<DataRetentionPolicy | null> {
    const result = await this.db.query(`
      SELECT * FROM data_retention_policies WHERE id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapEntityToDataRetentionPolicy(result.rows[0]);
  }

  /**
   * List data retention policies
   */
  async listDataRetentionPolicies(
    entityType?: string,
    isActive?: boolean,
    limit: number = 50,
    offset: number = 0
  ): Promise<{
    policies: DataRetentionPolicy[];
    total: number;
    hasMore: boolean;
  }> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (entityType) {
      conditions.push(`entity_type = $${paramIndex++}`);
      params.push(entityType);
    }

    if (isActive !== undefined) {
      conditions.push(`is_active = $${paramIndex++}`);
      params.push(isActive);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countResult = await this.db.query(`
      SELECT COUNT(*) as total FROM data_retention_policies ${whereClause}
    `, params);

    const total = parseInt(countResult.rows[0].total);

    // Get paginated results
    const dataResult = await this.db.query(`
      SELECT * FROM data_retention_policies 
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `, [...params, limit, offset]);

    const policies = dataResult.rows.map(row => this.mapEntityToDataRetentionPolicy(row));
    const hasMore = offset + policies.length < total;

    return { policies, total, hasMore };
  }

  /**
   * Enforce data retention policies (delete expired data)
   */
  async enforceDataRetentionPolicies(): Promise<{
    policiesProcessed: number;
    recordsDeleted: number;
    errors: string[];
  }> {
    const policies = await this.listDataRetentionPolicies(undefined, true, 1000);
    const errors: string[] = [];
    let totalDeleted = 0;

    for (const policy of policies.policies) {
      try {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - policy.retentionPeriodDays);

        // This is a simplified implementation - in practice, you'd need
        // specific deletion logic for each entity type
        const deletedCount = await this.deleteExpiredRecords(
          policy.entityType,
          cutoffDate,
          policy.deletionCriteria
        );

        totalDeleted += deletedCount;

        // Log the retention enforcement
        await this.db.query(`
          INSERT INTO audit_logs (
            event_type, entity_type, entity_id, action, details, timestamp
          ) VALUES ($1, $2, $3, $4, $5, NOW())
        `, [
          'data.retention_enforced',
          'data_retention_policy',
          policy.id,
          'delete_expired_records',
          JSON.stringify({
            policy_name: policy.name,
            cutoff_date: cutoffDate,
            records_deleted: deletedCount
          })
        ]);

      } catch (error) {
        errors.push(`Policy ${policy.name}: ${error.message}`);
      }
    }

    return {
      policiesProcessed: policies.policies.length,
      recordsDeleted: totalDeleted,
      errors
    };
  }

  /**
   * Add personal data inventory entry
   */
  async addPersonalDataInventory(
    tableName: string,
    columnName: string,
    dataCategory: DataCategory,
    sensitivityLevel: SensitivityLevel,
    legalBasis?: string,
    retentionPolicyId?: string,
    pseudonymizationMethod?: string
  ): Promise<PersonalDataInventory> {
    const result = await this.db.query(`
      INSERT INTO personal_data_inventory (
        table_name, column_name, data_category, sensitivity_level,
        legal_basis, retention_policy_id, pseudonymization_method,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
      RETURNING *
    `, [
      tableName,
      columnName,
      dataCategory,
      sensitivityLevel,
      legalBasis,
      retentionPolicyId,
      pseudonymizationMethod
    ]);

    return this.mapEntityToPersonalDataInventory(result.rows[0]);
  }

  /**
   * Get personal data inventory
   */
  async getPersonalDataInventory(
    tableName?: string,
    dataCategory?: DataCategory,
    sensitivityLevel?: SensitivityLevel
  ): Promise<PersonalDataInventory[]> {
    const conditions: string[] = ['is_active = true'];
    const params: any[] = [];
    let paramIndex = 1;

    if (tableName) {
      conditions.push(`table_name = $${paramIndex++}`);
      params.push(tableName);
    }

    if (dataCategory) {
      conditions.push(`data_category = $${paramIndex++}`);
      params.push(dataCategory);
    }

    if (sensitivityLevel) {
      conditions.push(`sensitivity_level = $${paramIndex++}`);
      params.push(sensitivityLevel);
    }

    const result = await this.db.query(`
      SELECT * FROM personal_data_inventory 
      WHERE ${conditions.join(' AND ')}
      ORDER BY table_name, column_name
    `, params);

    return result.rows.map(row => this.mapEntityToPersonalDataInventory(row));
  }

  /**
   * Identify personal data for a subject
   */
  async identifyPersonalDataForSubject(
    subjectIdentifier: string,
    subjectType: string
  ): Promise<{
    tables: Array<{
      tableName: string;
      columns: Array<{
        columnName: string;
        dataCategory: DataCategory;
        sensitivityLevel: SensitivityLevel;
        value?: any;
      }>;
    }>;
  }> {
    // Get all personal data inventory entries
    const inventory = await this.getPersonalDataInventory();
    
    const tablesWithData: Record<string, any> = {};

    // Group by table
    for (const item of inventory) {
      if (!tablesWithData[item.tableName]) {
        tablesWithData[item.tableName] = {
          tableName: item.tableName,
          columns: []
        };
      }

      // Try to find data for this subject (simplified - would need more sophisticated matching)
      let value: any = null;
      try {
        if (subjectType === 'email' && item.dataCategory === DataCategory.CONTACT) {
          const result = await this.db.query(`
            SELECT ${item.columnName} FROM ${item.tableName} 
            WHERE ${item.columnName} = $1 
            LIMIT 1
          `, [subjectIdentifier]);
          
          if (result.rows.length > 0) {
            value = result.rows[0][item.columnName];
          }
        }
      } catch (error) {
        // Ignore query errors for now
      }

      tablesWithData[item.tableName].columns.push({
        columnName: item.columnName,
        dataCategory: item.dataCategory,
        sensitivityLevel: item.sensitivityLevel,
        value
      });
    }

    return {
      tables: Object.values(tablesWithData)
    };
  }

  /**
   * Pseudonymize personal data
   */
  async pseudonymizePersonalData(
    tableName: string,
    columnName: string,
    method: 'hash' | 'encrypt' | 'tokenize'
  ): Promise<{ recordsProcessed: number }> {
    // This is a simplified implementation - in practice, you'd need
    // more sophisticated pseudonymization logic
    
    let recordsProcessed = 0;

    switch (method) {
      case 'hash':
        const hashResult = await this.db.query(`
          UPDATE ${tableName} 
          SET ${columnName} = encode(digest(${columnName}::text, 'sha256'), 'hex')
          WHERE ${columnName} IS NOT NULL
        `);
        recordsProcessed = hashResult.rowCount || 0;
        break;

      case 'encrypt':
        // Would use proper encryption key management
        const encryptResult = await this.db.query(`
          UPDATE ${tableName} 
          SET ${columnName} = encode(encrypt(${columnName}::bytea, 'encryption_key', 'aes'), 'base64')
          WHERE ${columnName} IS NOT NULL
        `);
        recordsProcessed = encryptResult.rowCount || 0;
        break;

      case 'tokenize':
        // Would use proper tokenization service
        recordsProcessed = 0; // Not implemented in this example
        break;
    }

    // Update inventory to reflect pseudonymization
    await this.db.query(`
      UPDATE personal_data_inventory 
      SET pseudonymization_method = $1, updated_at = NOW()
      WHERE table_name = $2 AND column_name = $3
    `, [method, tableName, columnName]);

    return { recordsProcessed };
  }

  private async processAccessRequest(client: any, request: DataSubjectRequest): Promise<Record<string, any>> {
    // Identify and extract all personal data for the subject
    const personalData = await this.identifyPersonalDataForSubject(
      request.subjectIdentifier,
      request.subjectType
    );

    return {
      requestType: 'access',
      subjectIdentifier: request.subjectIdentifier,
      dataExtracted: personalData,
      extractedAt: new Date(),
      format: 'json'
    };
  }

  private async processDeletionRequest(client: any, request: DataSubjectRequest): Promise<Record<string, any>> {
    // This would implement actual deletion logic based on personal data inventory
    const personalData = await this.identifyPersonalDataForSubject(
      request.subjectIdentifier,
      request.subjectType
    );

    let recordsDeleted = 0;

    // Simplified deletion - in practice, you'd need careful handling of referential integrity
    for (const table of personalData.tables) {
      for (const column of table.columns) {
        if (column.value) {
          try {
            const result = await client.query(`
              DELETE FROM ${table.tableName} 
              WHERE ${column.columnName} = $1
            `, [request.subjectIdentifier]);
            
            recordsDeleted += result.rowCount || 0;
          } catch (error) {
            // Log but continue with other deletions
            console.warn(`Failed to delete from ${table.tableName}.${column.columnName}:`, error);
          }
        }
      }
    }

    return {
      requestType: 'deletion',
      subjectIdentifier: request.subjectIdentifier,
      recordsDeleted,
      tablesAffected: personalData.tables.map(t => t.tableName),
      deletedAt: new Date()
    };
  }

  private async processRectificationRequest(client: any, request: DataSubjectRequest): Promise<Record<string, any>> {
    // This would implement data rectification logic
    return {
      requestType: 'rectification',
      subjectIdentifier: request.subjectIdentifier,
      message: 'Rectification processing not implemented in this example',
      processedAt: new Date()
    };
  }

  private async processPortabilityRequest(client: any, request: DataSubjectRequest): Promise<Record<string, any>> {
    // Extract data in portable format
    const personalData = await this.identifyPersonalDataForSubject(
      request.subjectIdentifier,
      request.subjectType
    );

    return {
      requestType: 'portability',
      subjectIdentifier: request.subjectIdentifier,
      dataExported: personalData,
      exportFormat: 'json',
      exportedAt: new Date()
    };
  }

  private async deleteExpiredRecords(
    entityType: string,
    cutoffDate: Date,
    deletionCriteria: Record<string, any>
  ): Promise<number> {
    // This is a simplified implementation - in practice, you'd need
    // specific deletion logic for each entity type based on your schema
    
    // For audit logs, we don't actually delete but mark as archived
    if (entityType === 'audit_logs') {
      // Audit logs should generally not be deleted due to compliance requirements
      return 0;
    }

    // For other entity types, implement appropriate deletion logic
    // This is just a placeholder
    return 0;
  }

  private mapEntityToDataSubjectRequest(entity: DataSubjectRequestEntity): DataSubjectRequest {
    return {
      id: entity.id,
      requestType: entity.request_type as DataSubjectRequestType,
      subjectIdentifier: entity.subject_identifier,
      subjectType: entity.subject_type,
      status: entity.status as DataSubjectRequestStatus,
      justification: entity.justification,
      requestedBy: entity.requested_by,
      requestedAt: entity.requested_at,
      processedBy: entity.processed_by,
      processedAt: entity.processed_at,
      completionDetails: entity.completion_details
    };
  }

  private mapEntityToDataRetentionPolicy(entity: DataRetentionPolicyEntity): DataRetentionPolicy {
    return {
      id: entity.id,
      name: entity.name,
      description: entity.description,
      entityType: entity.entity_type,
      retentionPeriodDays: entity.retention_period_days,
      deletionCriteria: entity.deletion_criteria,
      isActive: entity.is_active,
      createdBy: entity.created_by,
      createdAt: entity.created_at,
      updatedAt: entity.updated_at
    };
  }

  private mapEntityToPersonalDataInventory(entity: PersonalDataInventoryEntity): PersonalDataInventory {
    return {
      id: entity.id,
      tableName: entity.table_name,
      columnName: entity.column_name,
      dataCategory: entity.data_category as DataCategory,
      sensitivityLevel: entity.sensitivity_level as SensitivityLevel,
      legalBasis: entity.legal_basis,
      retentionPolicyId: entity.retention_policy_id,
      pseudonymizationMethod: entity.pseudonymization_method,
      isActive: entity.is_active,
      createdAt: entity.created_at,
      updatedAt: entity.updated_at
    };
  }
}