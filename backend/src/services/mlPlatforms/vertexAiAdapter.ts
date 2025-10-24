import { PlatformAdapter, ExternalModel, ExternalArtifact, ImportOptions, ExportOptions, ImportResult, ExportResult } from './types';

export class VertexAiAdapter implements PlatformAdapter {
  private projectId: string;
  private region: string;
  private credentials?: any;

  constructor(projectId: string, region: string = 'us-central1', credentials?: any) {
    this.projectId = projectId;
    this.region = region;
    this.credentials = credentials;
  }

  async testConnection(): Promise<boolean> {
    try {
      // Test connection by attempting to list models
      const response = await this.makeVertexAiRequest('GET', '/models', { pageSize: 1 });
      return response.ok;
    } catch (error) {
      console.error('Vertex AI connection test failed:', error);
      return false;
    }
  }

  async listModels(limit: number = 100, offset: number = 0): Promise<ExternalModel[]> {
    try {
      const response = await this.makeVertexAiRequest('GET', '/models', {
        pageSize: Math.min(limit, 100),
        pageToken: offset > 0 ? offset.toString() : undefined
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const models: ExternalModel[] = [];

      for (const vertexModel of data.models || []) {
        models.push(this.convertVertexAiModel(vertexModel));
      }

      return models;
    } catch (error) {
      console.error('Error listing Vertex AI models:', error);
      return [];
    }
  }

  async getModel(modelId: string, version?: string): Promise<ExternalModel | null> {
    try {
      const modelPath = version ? `${modelId}@${version}` : modelId;
      const response = await this.makeVertexAiRequest('GET', `/models/${modelPath}`);

      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const vertexModel = await response.json();
      return this.convertVertexAiModel(vertexModel);
    } catch (error) {
      console.error('Error getting Vertex AI model:', error);
      return null;
    }
  }

  async importModel(modelId: string, version: string, options: ImportOptions): Promise<ImportResult> {
    const result: ImportResult = {
      success: false,
      errors: [],
      warnings: [],
      importedArtifacts: 0
    };

    try {
      const externalModel = await this.getModel(modelId, version);
      if (!externalModel) {
        result.errors.push('Model not found in Vertex AI');
        return result;
      }

      // Check model accessibility
      if (!this.isModelAccessible(externalModel)) {
        result.errors.push('Model is not accessible or requires additional permissions');
        return result;
      }

      // Here you would integrate with your model registry service
      result.success = true;
      result.modelId = `vertex-${modelId.replace('/', '-')}`;
      result.versionId = version || 'latest';
      result.importedArtifacts = externalModel.artifacts.length;

      if (externalModel.metadata.encryptionSpec) {
        result.warnings.push('Model uses encryption - ensure proper key access');
      }

      return result;
    } catch (error) {
      result.errors.push(`Import failed: ${error.message}`);
      return result;
    }
  }

  async exportModel(modelId: string, versionId: string, options: ExportOptions): Promise<ExportResult> {
    const result: ExportResult = {
      success: false,
      errors: []
    };

    try {
      // Vertex AI export would involve uploading the model
      // This is a placeholder implementation
      
      result.success = true;
      result.exportId = `vertex-export-${Date.now()}`;
      result.exportUrl = `https://console.cloud.google.com/vertex-ai/models/${modelId}?project=${this.projectId}`;

      return result;
    } catch (error) {
      result.errors.push(`Export failed: ${error.message}`);
      return result;
    }
  }

  async searchModels(query: string, filters?: Record<string, any>): Promise<ExternalModel[]> {
    try {
      // Vertex AI doesn't have built-in search, so we'll list and filter
      const allModels = await this.listModels(1000);
      
      return allModels.filter(model => {
        const matchesQuery = model.name.toLowerCase().includes(query.toLowerCase()) ||
                           (model.description && model.description.toLowerCase().includes(query.toLowerCase()));
        
        if (!matchesQuery) return false;

        // Apply filters
        if (filters?.framework && !model.tags.includes(filters.framework)) {
          return false;
        }

        if (filters?.region && model.metadata.region !== filters.region) {
          return false;
        }

        return true;
      });
    } catch (error) {
      console.error('Error searching Vertex AI models:', error);
      return [];
    }
  }

  private async makeVertexAiRequest(method: string, path: string, params?: any): Promise<Response> {
    const baseUrl = `https://${this.region}-aiplatform.googleapis.com/v1/projects/${this.projectId}/locations/${this.region}`;
    
    let url = `${baseUrl}${path}`;
    
    if (method === 'GET' && params) {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          searchParams.append(key, value.toString());
        }
      });
      url += `?${searchParams.toString()}`;
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    // Add authentication header
    if (this.credentials?.accessToken) {
      headers['Authorization'] = `Bearer ${this.credentials.accessToken}`;
    }

    const requestOptions: RequestInit = {
      method,
      headers
    };

    if (method !== 'GET' && params) {
      requestOptions.body = JSON.stringify(params);
    }

    return fetch(url, requestOptions);
  }

  private convertVertexAiModel(vertexModel: any): ExternalModel {
    const artifacts: ExternalArtifact[] = [];
    
    // Add model artifacts from artifact URI
    if (vertexModel.artifactUri) {
      artifacts.push({
        name: 'model-artifacts',
        type: 'vertex-ai-model',
        uri: vertexModel.artifactUri
      });
    }

    // Add container artifacts
    if (vertexModel.containerSpec?.imageUri) {
      artifacts.push({
        name: 'container-image',
        type: 'docker-image',
        uri: vertexModel.containerSpec.imageUri
      });
    }

    // Extract model name from full resource name
    const modelName = vertexModel.name?.split('/').pop() || vertexModel.displayName;
    
    return {
      id: modelName,
      name: vertexModel.displayName || modelName,
      version: vertexModel.versionId || 'latest',
      description: vertexModel.description || '',
      tags: vertexModel.labels ? Object.keys(vertexModel.labels) : [],
      metadata: {
        resourceName: vertexModel.name,
        versionId: vertexModel.versionId,
        versionAliases: vertexModel.versionAliases,
        versionDescription: vertexModel.versionDescription,
        trainingPipeline: vertexModel.trainingPipeline,
        containerSpec: vertexModel.containerSpec,
        predictSchemata: vertexModel.predictSchemata,
        explanationSpec: vertexModel.explanationSpec,
        encryptionSpec: vertexModel.encryptionSpec,
        labels: vertexModel.labels,
        region: this.region,
        projectId: this.projectId
      },
      artifacts,
      metrics: {},
      parameters: {},
      createdAt: new Date(vertexModel.createTime),
      updatedAt: new Date(vertexModel.updateTime || vertexModel.createTime),
      source: {
        platform: 'vertexai',
        url: `https://console.cloud.google.com/vertex-ai/models/${modelName}?project=${this.projectId}`
      }
    };
  }

  private isModelAccessible(model: ExternalModel): boolean {
    // Check if model artifacts are accessible
    for (const artifact of model.artifacts) {
      if (artifact.uri.startsWith('gs://')) {
        // Basic GCS URI validation
        const gcsRegex = /^gs:\/\/[a-z0-9.-]+\/.*$/;
        if (!gcsRegex.test(artifact.uri)) {
          return false;
        }
      }
    }
    return true;
  }
}