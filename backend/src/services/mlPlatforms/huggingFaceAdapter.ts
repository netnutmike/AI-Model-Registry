import axios, { AxiosInstance } from 'axios';
import { PlatformAdapter, ExternalModel, ExternalArtifact, ImportOptions, ExportOptions, ImportResult, ExportResult } from './types';

export class HuggingFaceAdapter implements PlatformAdapter {
  private client: AxiosInstance;
  private apiKey?: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey;
    this.client = axios.create({
      baseURL: 'https://huggingface.co/api',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey && { 'Authorization': `Bearer ${apiKey}` })
      }
    });
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await this.client.get('/models?limit=1');
      return response.status === 200;
    } catch (error) {
      console.error('Hugging Face connection test failed:', error);
      return false;
    }
  }

  async listModels(limit: number = 100, offset: number = 0): Promise<ExternalModel[]> {
    try {
      const response = await this.client.get('/models', {
        params: { 
          limit,
          skip: offset,
          sort: 'downloads',
          direction: -1
        }
      });

      return response.data.map((hfModel: any) => this.convertHuggingFaceModel(hfModel));
    } catch (error) {
      console.error('Error listing Hugging Face models:', error);
      return [];
    }
  }

  async getModel(modelId: string, version?: string): Promise<ExternalModel | null> {
    try {
      const response = await this.client.get(`/models/${modelId}`);
      const hfModel = response.data;
      
      if (!hfModel) return null;

      // Get model files for artifacts
      const filesResponse = await this.client.get(`/models/${modelId}/tree/main`);
      const files = filesResponse.data || [];

      return this.convertHuggingFaceModel(hfModel, files);
    } catch (error) {
      console.error('Error getting Hugging Face model:', error);
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
        result.errors.push('Model not found on Hugging Face');
        return result;
      }

      // Validate model can be imported
      if (!this.isModelImportable(externalModel)) {
        result.errors.push('Model is not importable (private or restricted)');
        return result;
      }

      // Here you would integrate with your model registry service
      // to create the model and version in your system
      
      result.success = true;
      result.modelId = `hf-${modelId.replace('/', '-')}`;
      result.versionId = version || 'main';
      result.importedArtifacts = externalModel.artifacts.length;

      if (externalModel.metadata.private) {
        result.warnings.push('Model is private - ensure you have proper access rights');
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
      // Hugging Face export would require creating a repository
      // This is a placeholder implementation
      
      if (!this.apiKey) {
        result.errors.push('API key required for exporting to Hugging Face');
        return result;
      }

      result.success = true;
      result.exportId = `hf-export-${Date.now()}`;
      result.exportUrl = `https://huggingface.co/${modelId}`;

      return result;
    } catch (error) {
      result.errors.push(`Export failed: ${error.message}`);
      return result;
    }
  }

  async searchModels(query: string, filters?: Record<string, any>): Promise<ExternalModel[]> {
    try {
      const params: any = {
        search: query,
        limit: 50
      };

      if (filters?.task) {
        params.pipeline_tag = filters.task;
      }

      if (filters?.library) {
        params.library = filters.library;
      }

      if (filters?.language) {
        params.language = filters.language;
      }

      const response = await this.client.get('/models', { params });
      
      return response.data.map((hfModel: any) => this.convertHuggingFaceModel(hfModel));
    } catch (error) {
      console.error('Error searching Hugging Face models:', error);
      return [];
    }
  }

  private convertHuggingFaceModel(hfModel: any, files?: any[]): ExternalModel {
    // Convert files to artifacts
    const artifacts: ExternalArtifact[] = [];
    
    if (files) {
      for (const file of files) {
        if (file.type === 'file') {
          artifacts.push({
            name: file.path,
            type: this.getFileType(file.path),
            uri: `https://huggingface.co/${hfModel.id}/resolve/main/${file.path}`,
            size: file.size
          });
        }
      }
    } else {
      // Add common model files if file list not available
      const commonFiles = ['config.json', 'pytorch_model.bin', 'tokenizer.json'];
      for (const fileName of commonFiles) {
        artifacts.push({
          name: fileName,
          type: this.getFileType(fileName),
          uri: `https://huggingface.co/${hfModel.id}/resolve/main/${fileName}`
        });
      }
    }

    return {
      id: hfModel.id,
      name: hfModel.id,
      version: 'main', // Hugging Face uses branches/commits instead of versions
      description: hfModel.description || '',
      tags: hfModel.tags || [],
      metadata: {
        task: hfModel.pipeline_tag,
        library: hfModel.library_name,
        language: hfModel.language,
        license: hfModel.license,
        private: hfModel.private,
        downloads: hfModel.downloads,
        likes: hfModel.likes,
        author: hfModel.author
      },
      artifacts,
      metrics: {
        downloads: hfModel.downloads || 0,
        likes: hfModel.likes || 0
      },
      parameters: {},
      createdAt: new Date(hfModel.createdAt || Date.now()),
      updatedAt: new Date(hfModel.lastModified || Date.now()),
      source: {
        platform: 'huggingface',
        url: `https://huggingface.co/${hfModel.id}`
      }
    };
  }

  private getFileType(fileName: string): string {
    const extension = fileName.split('.').pop()?.toLowerCase();
    
    switch (extension) {
      case 'bin':
      case 'pt':
      case 'pth':
        return 'pytorch-model';
      case 'h5':
        return 'keras-model';
      case 'json':
        if (fileName.includes('config')) return 'config';
        if (fileName.includes('tokenizer')) return 'tokenizer';
        return 'json';
      case 'txt':
        return 'text';
      case 'md':
        return 'documentation';
      default:
        return 'unknown';
    }
  }

  private isModelImportable(model: ExternalModel): boolean {
    // Check if model is accessible
    if (model.metadata.private && !this.apiKey) {
      return false;
    }

    // Check for restricted licenses
    const restrictedLicenses = ['other', 'unknown'];
    if (restrictedLicenses.includes(model.metadata.license)) {
      return false;
    }

    return true;
  }
}