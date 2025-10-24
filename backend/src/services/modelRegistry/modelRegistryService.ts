import { DatabaseService } from '../database/databaseService.js';
import { 
  Model, 
  ModelVersion, 
  Artifact, 
  CreateModelRequest, 
  CreateVersionRequest, 
  CreateArtifactRequest,
  ModelEntity,
  ModelVersionEntity,
  ArtifactEntity,
  VersionState,
  RiskTier,
  ArtifactType
} from '../../types/index.js';
import { LineageService, LineageGraph } from './lineageService.js';
import { ModelCardService, ModelCard } from './modelCardService.js';
import { getCacheService, CacheService } from '../cache/index.js';
import { CACHE_KEYS, CACHE_TTL } from '../../config/redis.js';
import crypto from 'crypto';

export interface ModelSearchFilters {
  group?: string;
  riskTier?: RiskTier;
  tags?: string[];
  owners?: string[];
  state?: VersionState;
  search?: string;
}

export interface ModelSearchResult {
  models: Model[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ArtifactUploadInfo {
  uploadUrl: string;
  artifactId: string;
  fields: Record<string, string>;
}

export class ModelRegistryService {
  private lineageService: LineageService;
  private modelCardService: ModelCardService;
  private cache: CacheService;

  constructor(private db: DatabaseService) {
    this.lineageService = new LineageService(db);
    this.modelCardService = new ModelCardService(db);
    this.cache = getCacheService();
  }

  /**
   * Create a new model
   */
  async createModel(request: CreateModelRequest, createdBy: string): Promise<Model> {
    const modelId = crypto.randomUUID();
    
    const query = `
      INSERT INTO models (id, name, "group", description, owners, risk_tier, tags)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
    
    const values = [
      modelId,
      request.name,
      request.group,
      request.description,
      request.owners,
      request.riskTier,
      request.tags || []
    ];

    try {
      // Set current user for audit logging
      await this.db.query('SET app.current_user_id = $1', [createdBy]);
      
      const result = await this.db.query(query, values);
      const modelEntity = result.rows[0] as ModelEntity;
      
      // Invalidate search cache
      await this.cache.invalidateByTags(['model-search']);
      
      const model = this.mapModelEntityToModel(modelEntity);
      
      // Cache the new model
      await this.cache.set(CACHE_KEYS.MODEL(modelId), model, { 
        ttl: CACHE_TTL.MODEL, 
        tags: [`model:${modelId}`, `group:${request.group}`] 
      });
      
      return model;
    } catch (error: any) {
      if (error.code === '23505') { // Unique constraint violation
        throw new Error(`Model ${request.group}/${request.name} already exists`);
      }
      throw error;
    }
  }

  /**
   * Get model by ID
   */
  async getModelById(modelId: string): Promise<Model | null> {
    const cacheKey = CACHE_KEYS.MODEL(modelId);
    
    return this.cache.getOrSet(
      cacheKey,
      async () => {
        const query = 'SELECT * FROM models WHERE id = $1';
        const result = await this.db.query(query, [modelId]);
        
        if (result.rows.length === 0) {
          return null;
        }
        
        return this.mapModelEntityToModel(result.rows[0] as ModelEntity);
      },
      { ttl: CACHE_TTL.MODEL, tags: [`model:${modelId}`] }
    );
  }

  /**
   * Get model by group and name
   */
  async getModelByGroupAndName(group: string, name: string): Promise<Model | null> {
    const cacheKey = `model:group:${group}:name:${name}`;
    
    return this.cache.getOrSet(
      cacheKey,
      async () => {
        const query = 'SELECT * FROM models WHERE "group" = $1 AND name = $2';
        const result = await this.db.query(query, [group, name]);
        
        if (result.rows.length === 0) {
          return null;
        }
        
        return this.mapModelEntityToModel(result.rows[0] as ModelEntity);
      },
      { ttl: CACHE_TTL.MODEL, tags: [`group:${group}`] }
    );
  }

  /**
   * Search and filter models with pagination
   */
  async searchModels(
    filters: ModelSearchFilters = {}, 
    page: number = 1, 
    pageSize: number = 20
  ): Promise<ModelSearchResult> {
    // Create cache key from search parameters
    const searchKey = JSON.stringify({ filters, page, pageSize });
    const cacheKey = CACHE_KEYS.MODEL_SEARCH('', searchKey);
    
    return this.cache.getOrSet(
      cacheKey,
      async () => this.performModelSearch(filters, page, pageSize),
      { ttl: CACHE_TTL.MODEL_SEARCH, tags: ['model-search'] }
    );
  }

  /**
   * Perform the actual model search (extracted for caching)
   */
  private async performModelSearch(
    filters: ModelSearchFilters = {}, 
    page: number = 1, 
    pageSize: number = 20
  ): Promise<ModelSearchResult> {
    const offset = (page - 1) * pageSize;
    const conditions: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    // Build WHERE conditions
    if (filters.group) {
      conditions.push(`"group" = $${paramIndex++}`);
      values.push(filters.group);
    }

    if (filters.riskTier) {
      conditions.push(`risk_tier = $${paramIndex++}`);
      values.push(filters.riskTier);
    }

    if (filters.tags && filters.tags.length > 0) {
      conditions.push(`tags && $${paramIndex++}`);
      values.push(filters.tags);
    }

    if (filters.owners && filters.owners.length > 0) {
      conditions.push(`owners && $${paramIndex++}`);
      values.push(filters.owners);
    }

    if (filters.search) {
      conditions.push(`(
        to_tsvector('english', name || ' ' || description) @@ plainto_tsquery('english', $${paramIndex++})
        OR name ILIKE $${paramIndex++}
        OR description ILIKE $${paramIndex++}
      )`);
      values.push(filters.search, `%${filters.search}%`, `%${filters.search}%`);
      paramIndex += 2; // We added 3 parameters but incremented once already
    }

    // If filtering by version state, join with model_versions
    if (filters.state) {
      conditions.push(`EXISTS (
        SELECT 1 FROM model_versions mv 
        WHERE mv.model_id = models.id AND mv.state = $${paramIndex++}
      )`);
      values.push(filters.state);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Count query
    const countQuery = `
      SELECT COUNT(*) as total 
      FROM models 
      ${whereClause}
    `;
    
    // Data query with pagination
    const dataQuery = `
      SELECT * 
      FROM models 
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;
    
    values.push(pageSize, offset);

    const [countResult, dataResult] = await Promise.all([
      this.db.query(countQuery, values.slice(0, -2)), // Remove limit/offset for count
      this.db.query(dataQuery, values)
    ]);

    const total = parseInt(countResult.rows[0].total);
    const models = dataResult.rows.map((row: ModelEntity) => this.mapModelEntityToModel(row));

    return {
      models,
      total,
      page,
      pageSize
    };
  }

  /**
   * Update model metadata
   */
  async updateModel(
    modelId: string, 
    updates: Partial<CreateModelRequest>, 
    updatedBy: string
  ): Promise<Model> {
    const setClauses: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.description !== undefined) {
      setClauses.push(`description = $${paramIndex++}`);
      values.push(updates.description);
    }

    if (updates.owners !== undefined) {
      setClauses.push(`owners = $${paramIndex++}`);
      values.push(updates.owners);
    }

    if (updates.riskTier !== undefined) {
      setClauses.push(`risk_tier = $${paramIndex++}`);
      values.push(updates.riskTier);
    }

    if (updates.tags !== undefined) {
      setClauses.push(`tags = $${paramIndex++}`);
      values.push(updates.tags);
    }

    if (setClauses.length === 0) {
      throw new Error('No valid fields to update');
    }

    const query = `
      UPDATE models 
      SET ${setClauses.join(', ')}
      WHERE id = $${paramIndex++}
      RETURNING *
    `;
    
    values.push(modelId);

    try {
      await this.db.query('SET app.current_user_id = $1', [updatedBy]);
      
      const result = await this.db.query(query, values);
      
      if (result.rows.length === 0) {
        throw new Error('Model not found');
      }
      
      return this.mapModelEntityToModel(result.rows[0] as ModelEntity);
    } catch (error: any) {
      if (error.code === '23505') {
        throw new Error('Model name already exists in this group');
      }
      throw error;
    }
  }

  /**
   * Create a new model version
   */
  async createVersion(
    modelId: string, 
    request: CreateVersionRequest, 
    createdBy: string
  ): Promise<ModelVersion> {
    const versionId = crypto.randomUUID();
    
    const query = `
      INSERT INTO model_versions (id, model_id, version, commit_sha, training_job_id, metadata)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    
    const values = [
      versionId,
      modelId,
      request.version,
      request.commitSha,
      request.trainingJobId || null,
      JSON.stringify(request.metadata)
    ];

    try {
      await this.db.query('SET app.current_user_id = $1', [createdBy]);
      
      const result = await this.db.query(query, values);
      const versionEntity = result.rows[0] as ModelVersionEntity;
      
      return this.mapVersionEntityToVersion(versionEntity);
    } catch (error: any) {
      if (error.code === '23505') {
        throw new Error(`Version ${request.version} already exists for this model`);
      }
      if (error.code === '23503') {
        throw new Error('Model not found');
      }
      throw error;
    }
  }

  /**
   * Get model version by ID
   */
  async getVersionById(versionId: string): Promise<ModelVersion | null> {
    const query = 'SELECT * FROM model_versions WHERE id = $1';
    const result = await this.db.query(query, [versionId]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return this.mapVersionEntityToVersion(result.rows[0] as ModelVersionEntity);
  }

  /**
   * Get all versions for a model
   */
  async getModelVersions(modelId: string): Promise<ModelVersion[]> {
    const query = `
      SELECT * FROM model_versions 
      WHERE model_id = $1 
      ORDER BY created_at DESC
    `;
    
    const result = await this.db.query(query, [modelId]);
    
    return result.rows.map((row: ModelVersionEntity) => this.mapVersionEntityToVersion(row));
  }

  /**
   * Update version state
   */
  async updateVersionState(
    versionId: string, 
    newState: VersionState, 
    updatedBy: string
  ): Promise<ModelVersion> {
    const query = `
      UPDATE model_versions 
      SET state = $1
      WHERE id = $2
      RETURNING *
    `;

    try {
      await this.db.query('SET app.current_user_id = $1', [updatedBy]);
      
      const result = await this.db.query(query, [newState, versionId]);
      
      if (result.rows.length === 0) {
        throw new Error('Version not found');
      }
      
      return this.mapVersionEntityToVersion(result.rows[0] as ModelVersionEntity);
    } catch (error: any) {
      if (error.message.includes('Invalid state transition')) {
        throw new Error(`Invalid state transition to ${newState}`);
      }
      throw error;
    }
  }

  /**
   * Generate pre-signed URL for artifact upload
   */
  async generateArtifactUploadUrl(
    versionId: string,
    request: CreateArtifactRequest
  ): Promise<ArtifactUploadInfo> {
    // Verify version exists
    const version = await this.getVersionById(versionId);
    if (!version) {
      throw new Error('Version not found');
    }

    const artifactId = crypto.randomUUID();
    const key = `artifacts/${version.modelId}/${version.version}/${artifactId}`;
    
    // In a real implementation, this would generate a pre-signed S3 URL
    // For now, we'll return a mock structure
    return {
      uploadUrl: `https://s3.amazonaws.com/model-registry-artifacts/${key}`,
      artifactId,
      fields: {
        key,
        'Content-Type': 'application/octet-stream',
        'x-amz-meta-version-id': versionId,
        'x-amz-meta-artifact-type': request.type
      }
    };
  }

  /**
   * Create artifact record after successful upload
   */
  async createArtifact(
    versionId: string,
    artifactId: string,
    request: CreateArtifactRequest & { 
      uri: string; 
      size: number; 
      sha256?: string; 
    },
    createdBy: string
  ): Promise<Artifact> {
    // Generate SHA256 if not provided
    const sha256 = request.sha256 || this.generateMockSHA256(request.uri);
    
    const query = `
      INSERT INTO artifacts (id, version_id, type, uri, sha256, size, license)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
    
    const values = [
      artifactId,
      versionId,
      request.type,
      request.uri,
      sha256,
      request.size,
      request.license || null
    ];

    try {
      await this.db.query('SET app.current_user_id = $1', [createdBy]);
      
      const result = await this.db.query(query, values);
      const artifactEntity = result.rows[0] as ArtifactEntity;
      
      return this.mapArtifactEntityToArtifact(artifactEntity);
    } catch (error: any) {
      if (error.code === '23503') {
        throw new Error('Version not found');
      }
      throw error;
    }
  }

  /**
   * Get artifacts for a version
   */
  async getVersionArtifacts(versionId: string): Promise<Artifact[]> {
    const query = `
      SELECT * FROM artifacts 
      WHERE version_id = $1 
      ORDER BY created_at ASC
    `;
    
    const result = await this.db.query(query, [versionId]);
    
    return result.rows.map((row: ArtifactEntity) => this.mapArtifactEntityToArtifact(row));
  }

  /**
   * Get artifact by ID
   */
  async getArtifactById(artifactId: string): Promise<Artifact | null> {
    const query = 'SELECT * FROM artifacts WHERE id = $1';
    const result = await this.db.query(query, [artifactId]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return this.mapArtifactEntityToArtifact(result.rows[0] as ArtifactEntity);
  }

  /**
   * Generate download URL for artifact
   */
  async generateArtifactDownloadUrl(artifactId: string): Promise<string> {
    const artifact = await this.getArtifactById(artifactId);
    if (!artifact) {
      throw new Error('Artifact not found');
    }

    // In a real implementation, this would generate a pre-signed S3 download URL
    // For now, return the stored URI with a mock signed parameter
    const signedUrl = `${artifact.uri}?X-Amz-Expires=3600&X-Amz-Signature=mock-signature`;
    return signedUrl;
  }

  /**
   * Verify artifact integrity using SHA256
   */
  async verifyArtifactIntegrity(artifactId: string, providedSHA256: string): Promise<boolean> {
    const artifact = await this.getArtifactById(artifactId);
    if (!artifact) {
      throw new Error('Artifact not found');
    }

    return artifact.sha256 === providedSHA256;
  }

  // Private helper methods

  private mapModelEntityToModel(entity: ModelEntity): Model {
    return {
      id: entity.id,
      name: entity.name,
      group: entity.group,
      description: entity.description,
      owners: entity.owners,
      riskTier: entity.risk_tier,
      tags: entity.tags,
      createdAt: entity.created_at,
      updatedAt: entity.updated_at
    };
  }

  private mapVersionEntityToVersion(entity: ModelVersionEntity): ModelVersion {
    return {
      id: entity.id,
      modelId: entity.model_id,
      version: entity.version,
      state: entity.state,
      commitSha: entity.commit_sha,
      trainingJobId: entity.training_job_id || undefined,
      metadata: typeof entity.metadata === 'string' 
        ? JSON.parse(entity.metadata) 
        : entity.metadata,
      createdAt: entity.created_at,
      updatedAt: entity.updated_at
    };
  }

  private mapArtifactEntityToArtifact(entity: ArtifactEntity): Artifact {
    return {
      id: entity.id,
      versionId: entity.version_id,
      type: entity.type,
      uri: entity.uri,
      sha256: entity.sha256,
      size: entity.size,
      license: entity.license || undefined,
      createdAt: entity.created_at
    };
  }

  private generateMockSHA256(input: string): string {
    return crypto.createHash('sha256').update(input + Date.now()).digest('hex');
  }

  // Lineage tracking methods

  /**
   * Get lineage graph for a model version
   */
  async getVersionLineage(versionId: string, depth: number = 3): Promise<LineageGraph> {
    return this.lineageService.getModelVersionLineage(versionId, depth);
  }

  /**
   * Track dataset lineage for a model version
   */
  async trackDatasetLineage(
    versionId: string,
    datasetName: string,
    datasetVersion: string,
    datasetUri: string,
    createdBy: string
  ): Promise<void> {
    return this.lineageService.trackDatasetLineage(
      versionId,
      datasetName,
      datasetVersion,
      datasetUri,
      createdBy
    );
  }

  /**
   * Track commit lineage for a model version
   */
  async trackCommitLineage(
    versionId: string,
    commitSha: string,
    repositoryUrl: string,
    createdBy: string
  ): Promise<void> {
    return this.lineageService.trackCommitLineage(
      versionId,
      commitSha,
      repositoryUrl,
      createdBy
    );
  }

  /**
   * Track training run lineage
   */
  async trackTrainingRunLineage(
    versionId: string,
    trainingRunId: string,
    trainingRunUri: string,
    hyperparameters: Record<string, any>,
    createdBy: string
  ): Promise<void> {
    return this.lineageService.trackTrainingRunLineage(
      versionId,
      trainingRunId,
      trainingRunUri,
      hyperparameters,
      createdBy
    );
  }

  /**
   * Generate SHA256 checksum for content
   */
  generateSHA256(content: string | Buffer): string {
    return this.lineageService.generateSHA256(content);
  }

  /**
   * Verify SHA256 checksum
   */
  verifySHA256(content: string | Buffer, expectedHash: string): boolean {
    return this.lineageService.verifySHA256(content, expectedHash);
  }

  // Model Card methods

  /**
   * Generate model card for a version
   */
  async generateModelCard(versionId: string): Promise<ModelCard> {
    return this.modelCardService.generateModelCard(versionId);
  }

  /**
   * Get model card for a version
   */
  async getModelCard(versionId: string): Promise<ModelCard | null> {
    return this.modelCardService.getModelCard(versionId);
  }

  /**
   * Export model card as HTML
   */
  async exportModelCardAsHTML(versionId: string): Promise<string> {
    return this.modelCardService.exportModelCardAsHTML(versionId);
  }

  /**
   * Export model card as JSON
   */
  async exportModelCardAsJSON(versionId: string): Promise<object> {
    return this.modelCardService.exportModelCardAsJSON(versionId);
  }
}