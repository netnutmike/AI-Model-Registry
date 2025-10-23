import { DatabaseService } from '../database/databaseService.js';
import crypto from 'crypto';

export interface LineageNode {
  id: string;
  type: 'dataset' | 'model' | 'training_run' | 'commit' | 'artifact';
  name: string;
  version?: string;
  uri?: string;
  metadata: Record<string, any>;
  createdAt: Date;
}

export interface LineageEdge {
  id: string;
  sourceId: string;
  targetId: string;
  relationship: 'derived_from' | 'trained_on' | 'based_on' | 'generated_by' | 'contains';
  metadata?: Record<string, any>;
  createdAt: Date;
}

export interface LineageGraph {
  nodes: LineageNode[];
  edges: LineageEdge[];
}

export interface CreateLineageNodeRequest {
  type: LineageNode['type'];
  name: string;
  version?: string;
  uri?: string;
  metadata?: Record<string, any>;
}

export interface CreateLineageEdgeRequest {
  sourceId: string;
  targetId: string;
  relationship: LineageEdge['relationship'];
  metadata?: Record<string, any>;
}

export class LineageService {
  constructor(private db: DatabaseService) {}

  /**
   * Create a lineage node
   */
  async createNode(request: CreateLineageNodeRequest, createdBy: string): Promise<LineageNode> {
    const nodeId = crypto.randomUUID();
    
    const query = `
      INSERT INTO lineage_nodes (id, type, name, version, uri, metadata)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    
    const values = [
      nodeId,
      request.type,
      request.name,
      request.version || null,
      request.uri || null,
      JSON.stringify(request.metadata || {})
    ];

    try {
      await this.db.query('SET app.current_user_id = $1', [createdBy]);
      
      const result = await this.db.query(query, values);
      const nodeEntity = result.rows[0];
      
      return this.mapNodeEntityToNode(nodeEntity);
    } catch (error: any) {
      throw error;
    }
  }

  /**
   * Create a lineage edge (relationship)
   */
  async createEdge(request: CreateLineageEdgeRequest, createdBy: string): Promise<LineageEdge> {
    const edgeId = crypto.randomUUID();
    
    const query = `
      INSERT INTO lineage_edges (id, source_id, target_id, relationship, metadata)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    
    const values = [
      edgeId,
      request.sourceId,
      request.targetId,
      request.relationship,
      JSON.stringify(request.metadata || {})
    ];

    try {
      await this.db.query('SET app.current_user_id = $1', [createdBy]);
      
      const result = await this.db.query(query, values);
      const edgeEntity = result.rows[0];
      
      return this.mapEdgeEntityToEdge(edgeEntity);
    } catch (error: any) {
      if (error.code === '23503') {
        throw new Error('Source or target node not found');
      }
      throw error;
    }
  }

  /**
   * Get lineage graph for a model version
   */
  async getModelVersionLineage(versionId: string, depth: number = 3): Promise<LineageGraph> {
    // First, find the model version node
    const versionNodeQuery = `
      SELECT * FROM lineage_nodes 
      WHERE type = 'model' AND metadata->>'versionId' = $1
    `;
    
    const versionNodeResult = await this.db.query(versionNodeQuery, [versionId]);
    
    if (versionNodeResult.rows.length === 0) {
      // Create a node for this version if it doesn't exist
      const version = await this.getVersionById(versionId);
      if (!version) {
        throw new Error('Version not found');
      }
      
      const model = await this.getModelById(version.modelId);
      if (!model) {
        throw new Error('Model not found');
      }
      
      const nodeRequest: CreateLineageNodeRequest = {
        type: 'model',
        name: `${model.group}/${model.name}`,
        version: version.version,
        metadata: {
          versionId: version.id,
          modelId: version.modelId,
          commitSha: version.commitSha,
          trainingJobId: version.trainingJobId
        }
      };
      
      await this.createNode(nodeRequest, 'system');
    }

    // Get all connected nodes within the specified depth
    const graphQuery = `
      WITH RECURSIVE lineage_graph AS (
        -- Base case: start with the model version node
        SELECT n.*, 0 as depth
        FROM lineage_nodes n
        WHERE n.type = 'model' AND n.metadata->>'versionId' = $1
        
        UNION ALL
        
        -- Recursive case: find connected nodes
        SELECT n.*, lg.depth + 1
        FROM lineage_nodes n
        JOIN lineage_edges e ON (n.id = e.source_id OR n.id = e.target_id)
        JOIN lineage_graph lg ON (
          (e.source_id = lg.id AND n.id = e.target_id) OR
          (e.target_id = lg.id AND n.id = e.source_id)
        )
        WHERE lg.depth < $2
      )
      SELECT DISTINCT * FROM lineage_graph
    `;
    
    const edgesQuery = `
      SELECT DISTINCT e.*
      FROM lineage_edges e
      WHERE e.source_id IN (
        WITH RECURSIVE lineage_graph AS (
          SELECT n.id, 0 as depth
          FROM lineage_nodes n
          WHERE n.type = 'model' AND n.metadata->>'versionId' = $1
          
          UNION ALL
          
          SELECT n.id, lg.depth + 1
          FROM lineage_nodes n
          JOIN lineage_edges e ON (n.id = e.source_id OR n.id = e.target_id)
          JOIN lineage_graph lg ON (
            (e.source_id = lg.id AND n.id = e.target_id) OR
            (e.target_id = lg.id AND n.id = e.source_id)
          )
          WHERE lg.depth < $2
        )
        SELECT id FROM lineage_graph
      )
      OR e.target_id IN (
        WITH RECURSIVE lineage_graph AS (
          SELECT n.id, 0 as depth
          FROM lineage_nodes n
          WHERE n.type = 'model' AND n.metadata->>'versionId' = $1
          
          UNION ALL
          
          SELECT n.id, lg.depth + 1
          FROM lineage_nodes n
          JOIN lineage_edges e ON (n.id = e.source_id OR n.id = e.target_id)
          JOIN lineage_graph lg ON (
            (e.source_id = lg.id AND n.id = e.target_id) OR
            (e.target_id = lg.id AND n.id = e.source_id)
          )
          WHERE lg.depth < $2
        )
        SELECT id FROM lineage_graph
      )
    `;

    const [nodesResult, edgesResult] = await Promise.all([
      this.db.query(graphQuery, [versionId, depth]),
      this.db.query(edgesQuery, [versionId, depth])
    ]);

    const nodes = nodesResult.rows.map(row => this.mapNodeEntityToNode(row));
    const edges = edgesResult.rows.map(row => this.mapEdgeEntityToEdge(row));

    return { nodes, edges };
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
    // Create or find dataset node
    let datasetNode = await this.findNodeByNameAndVersion('dataset', datasetName, datasetVersion);
    
    if (!datasetNode) {
      const nodeRequest: CreateLineageNodeRequest = {
        type: 'dataset',
        name: datasetName,
        version: datasetVersion,
        uri: datasetUri,
        metadata: {
          size: 0, // Would be populated from actual dataset metadata
          format: 'unknown'
        }
      };
      
      datasetNode = await this.createNode(nodeRequest, createdBy);
    }

    // Create or find model version node
    let modelNode = await this.findNodeByMetadata('model', { versionId });
    
    if (!modelNode) {
      const version = await this.getVersionById(versionId);
      if (!version) {
        throw new Error('Version not found');
      }
      
      const model = await this.getModelById(version.modelId);
      if (!model) {
        throw new Error('Model not found');
      }
      
      const nodeRequest: CreateLineageNodeRequest = {
        type: 'model',
        name: `${model.group}/${model.name}`,
        version: version.version,
        metadata: {
          versionId: version.id,
          modelId: version.modelId,
          commitSha: version.commitSha
        }
      };
      
      modelNode = await this.createNode(nodeRequest, createdBy);
    }

    // Create edge: model trained_on dataset
    const edgeRequest: CreateLineageEdgeRequest = {
      sourceId: datasetNode.id,
      targetId: modelNode.id,
      relationship: 'trained_on',
      metadata: {
        trackedAt: new Date().toISOString()
      }
    };

    await this.createEdge(edgeRequest, createdBy);
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
    // Create or find commit node
    let commitNode = await this.findNodeByNameAndVersion('commit', commitSha, undefined);
    
    if (!commitNode) {
      const nodeRequest: CreateLineageNodeRequest = {
        type: 'commit',
        name: commitSha,
        uri: repositoryUrl,
        metadata: {
          repository: repositoryUrl,
          sha: commitSha
        }
      };
      
      commitNode = await this.createNode(nodeRequest, createdBy);
    }

    // Create or find model version node
    let modelNode = await this.findNodeByMetadata('model', { versionId });
    
    if (!modelNode) {
      const version = await this.getVersionById(versionId);
      if (!version) {
        throw new Error('Version not found');
      }
      
      const model = await this.getModelById(version.modelId);
      if (!model) {
        throw new Error('Model not found');
      }
      
      const nodeRequest: CreateLineageNodeRequest = {
        type: 'model',
        name: `${model.group}/${model.name}`,
        version: version.version,
        metadata: {
          versionId: version.id,
          modelId: version.modelId,
          commitSha: version.commitSha
        }
      };
      
      modelNode = await this.createNode(nodeRequest, createdBy);
    }

    // Create edge: model derived_from commit
    const edgeRequest: CreateLineageEdgeRequest = {
      sourceId: commitNode.id,
      targetId: modelNode.id,
      relationship: 'derived_from',
      metadata: {
        trackedAt: new Date().toISOString()
      }
    };

    await this.createEdge(edgeRequest, createdBy);
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
    // Create or find training run node
    let trainingNode = await this.findNodeByNameAndVersion('training_run', trainingRunId, undefined);
    
    if (!trainingNode) {
      const nodeRequest: CreateLineageNodeRequest = {
        type: 'training_run',
        name: trainingRunId,
        uri: trainingRunUri,
        metadata: {
          hyperparameters,
          runId: trainingRunId
        }
      };
      
      trainingNode = await this.createNode(nodeRequest, createdBy);
    }

    // Create or find model version node
    let modelNode = await this.findNodeByMetadata('model', { versionId });
    
    if (!modelNode) {
      const version = await this.getVersionById(versionId);
      if (!version) {
        throw new Error('Version not found');
      }
      
      const model = await this.getModelById(version.modelId);
      if (!model) {
        throw new Error('Model not found');
      }
      
      const nodeRequest: CreateLineageNodeRequest = {
        type: 'model',
        name: `${model.group}/${model.name}`,
        version: version.version,
        metadata: {
          versionId: version.id,
          modelId: version.modelId,
          commitSha: version.commitSha
        }
      };
      
      modelNode = await this.createNode(nodeRequest, createdBy);
    }

    // Create edge: model generated_by training_run
    const edgeRequest: CreateLineageEdgeRequest = {
      sourceId: trainingNode.id,
      targetId: modelNode.id,
      relationship: 'generated_by',
      metadata: {
        trackedAt: new Date().toISOString()
      }
    };

    await this.createEdge(edgeRequest, createdBy);
  }

  /**
   * Generate SHA256 checksum for content
   */
  generateSHA256(content: string | Buffer): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Verify SHA256 checksum
   */
  verifySHA256(content: string | Buffer, expectedHash: string): boolean {
    const actualHash = this.generateSHA256(content);
    return actualHash === expectedHash;
  }

  // Private helper methods

  private async findNodeByNameAndVersion(type: string, name: string, version?: string): Promise<LineageNode | null> {
    const query = version 
      ? 'SELECT * FROM lineage_nodes WHERE type = $1 AND name = $2 AND version = $3'
      : 'SELECT * FROM lineage_nodes WHERE type = $1 AND name = $2 AND version IS NULL';
    
    const params = version ? [type, name, version] : [type, name];
    const result = await this.db.query(query, params);
    
    return result.rows.length > 0 ? this.mapNodeEntityToNode(result.rows[0]) : null;
  }

  private async findNodeByMetadata(type: string, metadata: Record<string, any>): Promise<LineageNode | null> {
    const query = 'SELECT * FROM lineage_nodes WHERE type = $1 AND metadata @> $2';
    const result = await this.db.query(query, [type, JSON.stringify(metadata)]);
    
    return result.rows.length > 0 ? this.mapNodeEntityToNode(result.rows[0]) : null;
  }

  private mapNodeEntityToNode(entity: any): LineageNode {
    return {
      id: entity.id,
      type: entity.type,
      name: entity.name,
      version: entity.version || undefined,
      uri: entity.uri || undefined,
      metadata: typeof entity.metadata === 'string' 
        ? JSON.parse(entity.metadata) 
        : entity.metadata,
      createdAt: entity.created_at
    };
  }

  private mapEdgeEntityToEdge(entity: any): LineageEdge {
    return {
      id: entity.id,
      sourceId: entity.source_id,
      targetId: entity.target_id,
      relationship: entity.relationship,
      metadata: entity.metadata 
        ? (typeof entity.metadata === 'string' ? JSON.parse(entity.metadata) : entity.metadata)
        : undefined,
      createdAt: entity.created_at
    };
  }

  // These would typically be injected or imported from the model registry service
  private async getVersionById(versionId: string): Promise<any> {
    const query = 'SELECT * FROM model_versions WHERE id = $1';
    const result = await this.db.query(query, [versionId]);
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  private async getModelById(modelId: string): Promise<any> {
    const query = 'SELECT * FROM models WHERE id = $1';
    const result = await this.db.query(query, [modelId]);
    return result.rows.length > 0 ? result.rows[0] : null;
  }
}