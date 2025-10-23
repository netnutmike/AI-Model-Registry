import { DatabaseService } from '../database/databaseService.js';
import {
  EvaluationSuite,
  EvaluationSuiteEntity,
  EvaluationDataset,
  EvaluationDatasetEntity,
  EvaluationJob,
  EvaluationJobEntity,
  CreateEvaluationSuiteRequest,
  UpdateEvaluationSuiteRequest,
  CreateEvaluationDatasetRequest,
  RunEvaluationRequest,
  EvaluationHistoryQuery,
  EvaluationSuiteStatus,
  EvaluationJobStatus,
  JobPriority,
  DatasetType
} from '../../types/index.js';

export interface EvaluationSuiteSearchFilters {
  name?: string;
  status?: EvaluationSuiteStatus;
  createdBy?: string;
  limit?: number;
  offset?: number;
}

export interface EvaluationDatasetSearchFilters {
  name?: string;
  type?: DatasetType;
  limit?: number;
  offset?: number;
}

export class EvaluationService {
  constructor(private db: DatabaseService) {}

  // Evaluation Suite Management

  /**
   * Create a new evaluation suite
   */
  async createEvaluationSuite(
    request: CreateEvaluationSuiteRequest,
    createdBy: string
  ): Promise<EvaluationSuite> {
    const query = `
      INSERT INTO evaluation_suites (name, description, version, configuration, created_by)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;

    const result = await this.db.query(query, [
      request.name,
      request.description,
      request.version,
      JSON.stringify(request.configuration),
      createdBy
    ]);

    return this.mapEvaluationSuiteEntityToModel(result.rows[0]);
  }

  /**
   * Get evaluation suite by ID
   */
  async getEvaluationSuite(id: string): Promise<EvaluationSuite | null> {
    const query = `
      SELECT * FROM evaluation_suites
      WHERE id = $1
    `;

    const result = await this.db.query(query, [id]);
    
    if (result.rows.length === 0) {
      return null;
    }

    return this.mapEvaluationSuiteEntityToModel(result.rows[0]);
  }

  /**
   * Search evaluation suites with filters
   */
  async searchEvaluationSuites(filters: EvaluationSuiteSearchFilters): Promise<{
    suites: EvaluationSuite[];
    total: number;
  }> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (filters.name) {
      conditions.push(`name ILIKE $${paramIndex}`);
      params.push(`%${filters.name}%`);
      paramIndex++;
    }

    if (filters.status) {
      conditions.push(`status = $${paramIndex}`);
      params.push(filters.status);
      paramIndex++;
    }

    if (filters.createdBy) {
      conditions.push(`created_by = $${paramIndex}`);
      params.push(filters.createdBy);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    
    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM evaluation_suites
      ${whereClause}
    `;
    
    const countResult = await this.db.query(countQuery, params);
    const total = parseInt(countResult.rows[0].total);

    // Get paginated results
    const limit = filters.limit || 50;
    const offset = filters.offset || 0;

    const query = `
      SELECT * FROM evaluation_suites
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const result = await this.db.query(query, [...params, limit, offset]);

    const suites = result.rows.map(row => this.mapEvaluationSuiteEntityToModel(row));

    return { suites, total };
  }

  /**
   * Update evaluation suite
   */
  async updateEvaluationSuite(
    id: string,
    request: UpdateEvaluationSuiteRequest
  ): Promise<EvaluationSuite | null> {
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (request.description !== undefined) {
      updates.push(`description = $${paramIndex}`);
      params.push(request.description);
      paramIndex++;
    }

    if (request.status !== undefined) {
      updates.push(`status = $${paramIndex}`);
      params.push(request.status);
      paramIndex++;
    }

    if (request.configuration !== undefined) {
      updates.push(`configuration = $${paramIndex}`);
      params.push(JSON.stringify(request.configuration));
      paramIndex++;
    }

    if (updates.length === 0) {
      return this.getEvaluationSuite(id);
    }

    const query = `
      UPDATE evaluation_suites
      SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await this.db.query(query, [...params, id]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapEvaluationSuiteEntityToModel(result.rows[0]);
  }

  /**
   * Delete evaluation suite
   */
  async deleteEvaluationSuite(id: string): Promise<boolean> {
    const query = `
      DELETE FROM evaluation_suites
      WHERE id = $1
    `;

    const result = await this.db.query(query, [id]);
    return result.rowCount > 0;
  }

  // Evaluation Dataset Management

  /**
   * Create a new evaluation dataset
   */
  async createEvaluationDataset(
    request: CreateEvaluationDatasetRequest,
    uri: string,
    sha256: string,
    size: number
  ): Promise<EvaluationDataset> {
    const query = `
      INSERT INTO evaluation_datasets (name, type, uri, sha256, size, metadata)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;

    const result = await this.db.query(query, [
      request.name,
      request.type,
      uri,
      sha256,
      size,
      JSON.stringify(request.metadata || {})
    ]);

    return this.mapEvaluationDatasetEntityToModel(result.rows[0]);
  }

  /**
   * Get evaluation dataset by ID
   */
  async getEvaluationDataset(id: string): Promise<EvaluationDataset | null> {
    const query = `
      SELECT * FROM evaluation_datasets
      WHERE id = $1
    `;

    const result = await this.db.query(query, [id]);
    
    if (result.rows.length === 0) {
      return null;
    }

    return this.mapEvaluationDatasetEntityToModel(result.rows[0]);
  }

  /**
   * Search evaluation datasets with filters
   */
  async searchEvaluationDatasets(filters: EvaluationDatasetSearchFilters): Promise<{
    datasets: EvaluationDataset[];
    total: number;
  }> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (filters.name) {
      conditions.push(`name ILIKE $${paramIndex}`);
      params.push(`%${filters.name}%`);
      paramIndex++;
    }

    if (filters.type) {
      conditions.push(`type = $${paramIndex}`);
      params.push(filters.type);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    
    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM evaluation_datasets
      ${whereClause}
    `;
    
    const countResult = await this.db.query(countQuery, params);
    const total = parseInt(countResult.rows[0].total);

    // Get paginated results
    const limit = filters.limit || 50;
    const offset = filters.offset || 0;

    const query = `
      SELECT * FROM evaluation_datasets
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const result = await this.db.query(query, [...params, limit, offset]);

    const datasets = result.rows.map(row => this.mapEvaluationDatasetEntityToModel(row));

    return { datasets, total };
  }

  /**
   * Delete evaluation dataset
   */
  async deleteEvaluationDataset(id: string): Promise<boolean> {
    const query = `
      DELETE FROM evaluation_datasets
      WHERE id = $1
    `;

    const result = await this.db.query(query, [id]);
    return result.rowCount > 0;
  }

  /**
   * Associate dataset with evaluation suite
   */
  async addDatasetToSuite(suiteId: string, datasetId: string): Promise<void> {
    const query = `
      INSERT INTO evaluation_suite_datasets (suite_id, dataset_id)
      VALUES ($1, $2)
      ON CONFLICT (suite_id, dataset_id) DO NOTHING
    `;

    await this.db.query(query, [suiteId, datasetId]);
  }

  /**
   * Remove dataset from evaluation suite
   */
  async removeDatasetFromSuite(suiteId: string, datasetId: string): Promise<void> {
    const query = `
      DELETE FROM evaluation_suite_datasets
      WHERE suite_id = $1 AND dataset_id = $2
    `;

    await this.db.query(query, [suiteId, datasetId]);
  }

  /**
   * Get datasets associated with evaluation suite
   */
  async getSuiteDatasets(suiteId: string): Promise<EvaluationDataset[]> {
    const query = `
      SELECT ed.*
      FROM evaluation_datasets ed
      JOIN evaluation_suite_datasets esd ON ed.id = esd.dataset_id
      WHERE esd.suite_id = $1
      ORDER BY ed.name
    `;

    const result = await this.db.query(query, [suiteId]);
    return result.rows.map(row => this.mapEvaluationDatasetEntityToModel(row));
  }

  // Threshold Configuration Management

  /**
   * Validate evaluation thresholds against suite configuration
   */
  validateThresholds(suiteConfiguration: any, thresholds: any): boolean {
    const requiredMetricTypes = ['taskMetrics', 'biasMetrics', 'safetyMetrics', 'robustnessMetrics'];
    
    for (const metricType of requiredMetricTypes) {
      if (!thresholds[metricType]) {
        return false;
      }
    }

    return true;
  }

  // Private helper methods

  private mapEvaluationSuiteEntityToModel(entity: EvaluationSuiteEntity): EvaluationSuite {
    return {
      id: entity.id,
      name: entity.name,
      description: entity.description,
      version: entity.version,
      status: entity.status,
      configuration: entity.configuration,
      createdBy: entity.created_by,
      createdAt: entity.created_at,
      updatedAt: entity.updated_at
    };
  }

  private mapEvaluationDatasetEntityToModel(entity: EvaluationDatasetEntity): EvaluationDataset {
    return {
      id: entity.id,
      name: entity.name,
      type: entity.type,
      uri: entity.uri,
      sha256: entity.sha256,
      size: entity.size,
      metadata: entity.metadata
    };
  }
}