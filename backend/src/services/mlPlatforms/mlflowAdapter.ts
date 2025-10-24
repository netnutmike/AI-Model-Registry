import axios, { AxiosInstance } from 'axios';
import { PlatformAdapter, ExternalModel, ExternalArtifact, ImportOptions, ExportOptions, ImportResult, ExportResult } from './types';

export class MlflowAdapter implements PlatformAdapter {
  private client: AxiosInstance;
  private baseUrl: string;

  constructor(baseUrl: string, apiKey?: string) {
    this.baseUrl = baseUrl;
    this.client = axios.create({
      baseURL: baseUrl,
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey && { 'Authorization': `Bearer ${apiKey}` })
      }
    });
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await this.client.get('/api/2.0/mlflow/experiments/list');
      return response.status === 200;
    } catch (error) {
      console.error('MLflow connection test failed:', error);
      return false;
    }
  }

  async listModels(limit: number = 100, offset: number = 0): Promise<ExternalModel[]> {
    try {
      const response = await this.client.get('/api/2.0/mlflow/registered-models/list', {
        params: { max_results: limit, page_token: offset > 0 ? offset.toString() : undefined }
      });

      const models: ExternalModel[] = [];
      
      for (const mlflowModel of response.data.registered_models || []) {
        // Get latest version for each model
        const versionsResponse = await this.client.get('/api/2.0/mlflow/model-versions/search', {
          params: { filter: `name='${mlflowModel.name}'`, max_results: 1, order_by: ['version_number DESC'] }
        });

        const latestVersion = versionsResponse.data.model_versions?.[0];
        if (latestVersion) {
          models.push(await this.convertMlflowModel(mlflowModel, latestVersion));
        }
      }

      return models;
    } catch (error) {
      console.error('Error listing MLflow models:', error);
      return [];
    }
  }

  async getModel(modelId: string, version?: string): Promise<ExternalModel | null> {
    try {
      // Get registered model
      const modelResponse = await this.client.get('/api/2.0/mlflow/registered-models/get', {
        params: { name: modelId }
      });

      const mlflowModel = modelResponse.data.registered_model;
      if (!mlflowModel) return null;

      // Get specific version or latest
      let modelVersion;
      if (version) {
        const versionResponse = await this.client.get('/api/2.0/mlflow/model-versions/get', {
          params: { name: modelId, version }
        });
        modelVersion = versionResponse.data.model_version;
      } else {
        const versionsResponse = await this.client.get('/api/2.0/mlflow/model-versions/search', {
          params: { filter: `name='${modelId}'`, max_results: 1, order_by: ['version_number DESC'] }
        });
        modelVersion = versionsResponse.data.model_versions?.[0];
      }

      if (!modelVersion) return null;

      return await this.convertMlflowModel(mlflowModel, modelVersion);
    } catch (error) {
      console.error('Error getting MLflow model:', error);
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
        result.errors.push('Model not found in MLflow');
        return result;
      }

      // Here you would integrate with your model registry service
      // to create the model and version in your system
      
      // For now, we'll simulate the import
      result.success = true;
      result.modelId = `imported-${modelId}`;
      result.versionId = `imported-${version}`;
      result.importedArtifacts = externalModel.artifacts.length;

      if (!options.includeArtifacts) {
        result.warnings.push('Artifacts were not imported as per options');
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
      // Here you would get the model from your registry and export to MLflow
      // This is a placeholder implementation
      
      result.success = true;
      result.exportId = `export-${Date.now()}`;
      result.exportUrl = `${this.baseUrl}/models/${modelId}/${versionId}`;

      return result;
    } catch (error) {
      result.errors.push(`Export failed: ${error.message}`);
      return result;
    }
  }

  async searchModels(query: string, filters?: Record<string, any>): Promise<ExternalModel[]> {
    try {
      // Build MLflow search filter
      let filter = `name ILIKE '%${query}%'`;
      
      if (filters?.tags) {
        const tagFilters = filters.tags.map((tag: string) => `tags.${tag} = 'true'`);
        filter += ` AND (${tagFilters.join(' OR ')})`;
      }

      const response = await this.client.get('/api/2.0/mlflow/registered-models/search', {
        params: { filter, max_results: 50 }
      });

      const models: ExternalModel[] = [];
      
      for (const mlflowModel of response.data.registered_models || []) {
        const versionsResponse = await this.client.get('/api/2.0/mlflow/model-versions/search', {
          params: { filter: `name='${mlflowModel.name}'`, max_results: 1, order_by: ['version_number DESC'] }
        });

        const latestVersion = versionsResponse.data.model_versions?.[0];
        if (latestVersion) {
          models.push(await this.convertMlflowModel(mlflowModel, latestVersion));
        }
      }

      return models;
    } catch (error) {
      console.error('Error searching MLflow models:', error);
      return [];
    }
  }

  private async convertMlflowModel(mlflowModel: any, modelVersion: any): Promise<ExternalModel> {
    // Get run details for metrics and parameters
    let metrics = {};
    let parameters = {};
    
    if (modelVersion.run_id) {
      try {
        const runResponse = await this.client.get('/api/2.0/mlflow/runs/get', {
          params: { run_id: modelVersion.run_id }
        });
        
        const run = runResponse.data.run;
        metrics = run.data?.metrics || {};
        parameters = run.data?.params || {};
      } catch (error) {
        console.warn('Could not fetch run details:', error);
      }
    }

    // Convert artifacts
    const artifacts: ExternalArtifact[] = [];
    if (modelVersion.source) {
      artifacts.push({
        name: 'model',
        type: 'mlflow-model',
        uri: modelVersion.source
      });
    }

    return {
      id: mlflowModel.name,
      name: mlflowModel.name,
      version: modelVersion.version,
      description: mlflowModel.description || modelVersion.description,
      tags: Object.keys(modelVersion.tags || {}),
      metadata: {
        stage: modelVersion.current_stage,
        runId: modelVersion.run_id,
        userId: modelVersion.user_id,
        mlflowTags: modelVersion.tags
      },
      artifacts,
      metrics,
      parameters,
      createdAt: new Date(modelVersion.creation_timestamp),
      updatedAt: new Date(modelVersion.last_updated_timestamp),
      source: {
        platform: 'mlflow',
        url: `${this.baseUrl}/#/models/${mlflowModel.name}/versions/${modelVersion.version}`,
        runId: modelVersion.run_id
      }
    };
  }
}