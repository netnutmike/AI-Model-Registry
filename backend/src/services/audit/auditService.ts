import { Pool } from 'pg';
import crypto from 'crypto';
import {
  AuditLog,
  AuditLogEntity,
  CreateAuditLogRequest,
  AuditLogQuery,
  HashChainIntegrityResult,
  VerifyIntegrityRequest,
  AuthenticatedRequest
} from '../../types/index.js';

export class AuditService {
  constructor(private db: Pool) {}

  /**
   * Create an immutable audit log entry with cryptographic hash chain
   */
  async createAuditLog(
    request: CreateAuditLogRequest,
    context?: {
      userId?: string;
      sessionId?: string;
      ipAddress?: string;
      userAgent?: string;
    }
  ): Promise<AuditLog> {
    const client = await this.db.connect();
    
    try {
      await client.query('BEGIN');

      // Validate event type exists
      const eventTypeResult = await client.query(
        'SELECT event_type, required_fields FROM audit_event_types WHERE event_type = $1 AND is_active = true',
        [request.eventType]
      );

      if (eventTypeResult.rows.length === 0) {
        throw new Error(`Invalid or inactive event type: ${request.eventType}`);
      }

      const eventType = eventTypeResult.rows[0];
      
      // Validate required fields are present
      const missingFields = eventType.required_fields.filter(
        (field: string) => !(field in (request.details || {}))
      );
      
      if (missingFields.length > 0) {
        throw new Error(`Missing required fields for event type ${request.eventType}: ${missingFields.join(', ')}`);
      }

      // Insert audit log (trigger will handle hash chain)
      const result = await client.query(`
        INSERT INTO audit_logs (
          event_type, entity_type, entity_id, user_id, session_id,
          action, details, metadata, ip_address, user_agent, timestamp
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
        RETURNING *
      `, [
        request.eventType,
        request.entityType,
        request.entityId,
        context?.userId,
        context?.sessionId,
        request.action,
        JSON.stringify(request.details || {}),
        JSON.stringify(request.metadata || {}),
        context?.ipAddress,
        context?.userAgent
      ]);

      await client.query('COMMIT');

      return this.mapEntityToAuditLog(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Query audit logs with filtering and pagination
   */
  async queryAuditLogs(query: AuditLogQuery): Promise<{
    logs: AuditLog[];
    total: number;
    hasMore: boolean;
  }> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    // Build WHERE conditions
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

    if (query.action) {
      conditions.push(`action = $${paramIndex++}`);
      params.push(query.action);
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
    const limit = query.limit || 100;
    const offset = query.offset || 0;

    // Get total count
    const countResult = await this.db.query(`
      SELECT COUNT(*) as total FROM audit_logs ${whereClause}
    `, params);

    const total = parseInt(countResult.rows[0].total);

    // Get paginated results
    const dataResult = await this.db.query(`
      SELECT * FROM audit_logs 
      ${whereClause}
      ORDER BY timestamp DESC, id DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `, [...params, limit, offset]);

    const logs = dataResult.rows.map(row => this.mapEntityToAuditLog(row));
    const hasMore = offset + logs.length < total;

    return { logs, total, hasMore };
  }

  /**
   * Verify the integrity of the audit log hash chain
   */
  async verifyHashChainIntegrity(request: VerifyIntegrityRequest = {}): Promise<HashChainIntegrityResult> {
    const result = await this.db.query(`
      SELECT * FROM verify_audit_chain_integrity($1, $2)
    `, [request.startTimestamp, request.endTimestamp]);

    return {
      isValid: result.rows[0].is_valid,
      totalRecords: parseInt(result.rows[0].total_records),
      invalidRecords: parseInt(result.rows[0].invalid_records),
      firstInvalidId: result.rows[0].first_invalid_id,
      errorMessage: result.rows[0].error_message
    };
  }

  /**
   * Get audit logs for a specific entity with full history
   */
  async getEntityAuditTrail(entityType: string, entityId: string): Promise<AuditLog[]> {
    const result = await this.db.query(`
      SELECT * FROM audit_logs 
      WHERE entity_type = $1 AND entity_id = $2
      ORDER BY timestamp ASC
    `, [entityType, entityId]);

    return result.rows.map(row => this.mapEntityToAuditLog(row));
  }

  /**
   * Get audit statistics for reporting
   */
  async getAuditStatistics(startDate?: Date, endDate?: Date): Promise<{
    totalLogs: number;
    logsByEventType: Record<string, number>;
    logsByEntityType: Record<string, number>;
    logsByUser: Record<string, number>;
    integrityStatus: HashChainIntegrityResult;
  }> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (startDate) {
      conditions.push(`timestamp >= $${paramIndex++}`);
      params.push(startDate);
    }

    if (endDate) {
      conditions.push(`timestamp <= $${paramIndex++}`);
      params.push(endDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Total logs
    const totalResult = await this.db.query(`
      SELECT COUNT(*) as total FROM audit_logs ${whereClause}
    `, params);

    // Logs by event type
    const eventTypeResult = await this.db.query(`
      SELECT event_type, COUNT(*) as count 
      FROM audit_logs ${whereClause}
      GROUP BY event_type
      ORDER BY count DESC
    `, params);

    // Logs by entity type
    const entityTypeResult = await this.db.query(`
      SELECT entity_type, COUNT(*) as count 
      FROM audit_logs ${whereClause}
      GROUP BY entity_type
      ORDER BY count DESC
    `, params);

    // Logs by user (top 10)
    const userResult = await this.db.query(`
      SELECT user_id, COUNT(*) as count 
      FROM audit_logs ${whereClause}
      AND user_id IS NOT NULL
      GROUP BY user_id
      ORDER BY count DESC
      LIMIT 10
    `, params);

    // Get integrity status
    const integrityStatus = await this.verifyHashChainIntegrity({ startTimestamp: startDate, endTimestamp: endDate });

    return {
      totalLogs: parseInt(totalResult.rows[0].total),
      logsByEventType: Object.fromEntries(
        eventTypeResult.rows.map(row => [row.event_type, parseInt(row.count)])
      ),
      logsByEntityType: Object.fromEntries(
        entityTypeResult.rows.map(row => [row.entity_type, parseInt(row.count)])
      ),
      logsByUser: Object.fromEntries(
        userResult.rows.map(row => [row.user_id, parseInt(row.count)])
      ),
      integrityStatus
    };
  }

  /**
   * Helper method to create audit log from authenticated request context
   */
  async auditFromRequest(
    req: AuthenticatedRequest,
    eventType: string,
    entityType: string,
    entityId: string,
    action: string,
    details?: Record<string, any>,
    metadata?: Record<string, any>
  ): Promise<AuditLog> {
    return this.createAuditLog(
      {
        eventType,
        entityType,
        entityId,
        action,
        details,
        metadata
      },
      {
        userId: req.user?.id,
        sessionId: req.session?.id,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      }
    );
  }

  /**
   * Batch create audit logs for bulk operations
   */
  async createBulkAuditLogs(
    logs: CreateAuditLogRequest[],
    context?: {
      userId?: string;
      sessionId?: string;
      ipAddress?: string;
      userAgent?: string;
    }
  ): Promise<AuditLog[]> {
    if (logs.length === 0) return [];

    const client = await this.db.connect();
    
    try {
      await client.query('BEGIN');

      const results: AuditLog[] = [];

      for (const logRequest of logs) {
        // Validate event type
        const eventTypeResult = await client.query(
          'SELECT event_type, required_fields FROM audit_event_types WHERE event_type = $1 AND is_active = true',
          [logRequest.eventType]
        );

        if (eventTypeResult.rows.length === 0) {
          throw new Error(`Invalid or inactive event type: ${logRequest.eventType}`);
        }

        const eventType = eventTypeResult.rows[0];
        
        // Validate required fields
        const missingFields = eventType.required_fields.filter(
          (field: string) => !(field in (logRequest.details || {}))
        );
        
        if (missingFields.length > 0) {
          throw new Error(`Missing required fields for event type ${logRequest.eventType}: ${missingFields.join(', ')}`);
        }

        // Insert audit log
        const result = await client.query(`
          INSERT INTO audit_logs (
            event_type, entity_type, entity_id, user_id, session_id,
            action, details, metadata, ip_address, user_agent, timestamp
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
          RETURNING *
        `, [
          logRequest.eventType,
          logRequest.entityType,
          logRequest.entityId,
          context?.userId,
          context?.sessionId,
          logRequest.action,
          JSON.stringify(logRequest.details || {}),
          JSON.stringify(logRequest.metadata || {}),
          context?.ipAddress,
          context?.userAgent
        ]);

        results.push(this.mapEntityToAuditLog(result.rows[0]));
      }

      await client.query('COMMIT');
      return results;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get hash chain state for monitoring
   */
  async getHashChainState(): Promise<{
    chainName: string;
    lastHash: string;
    lastSequenceNumber: number;
    updatedAt: Date;
  }> {
    const result = await this.db.query(`
      SELECT * FROM hash_chain_state WHERE chain_name = 'audit_logs'
    `);

    if (result.rows.length === 0) {
      throw new Error('Hash chain state not found');
    }

    const row = result.rows[0];
    return {
      chainName: row.chain_name,
      lastHash: row.last_hash,
      lastSequenceNumber: row.last_sequence_number,
      updatedAt: row.updated_at
    };
  }

  private mapEntityToAuditLog(entity: AuditLogEntity): AuditLog {
    return {
      id: entity.id,
      eventType: entity.event_type,
      entityType: entity.entity_type,
      entityId: entity.entity_id,
      userId: entity.user_id,
      sessionId: entity.session_id,
      action: entity.action,
      details: entity.details,
      metadata: entity.metadata,
      ipAddress: entity.ip_address,
      userAgent: entity.user_agent,
      previousHash: entity.previous_hash,
      currentHash: entity.current_hash,
      timestamp: entity.timestamp
    };
  }
}