import { apiService } from './api';
import { Model, ModelVersion, Artifact, SearchFilters, PaginatedResponse } from '@/types';

export class ModelService {
  // Model management
  async getModels(filters?: SearchFilters, page = 1, limit = 20): Promise<PaginatedResponse<Model>> {
    const params = {
      page,
      limit,
      ...filters,
    };
    return apiService.getPaginated<Model>('/models', params);
  }

  async getModel(id: string): Promise<Model> {
    const response = await apiService.get<Model>(`/models/${id}`);
    return response.data;
  }

  async createModel(model: Partial<Model>): Promise<Model> {
    const response = await apiService.post<Model>('/models', model);
    return response.data;
  }

  async updateModel(id: string, model: Partial<Model>): Promise<Model> {
    const response = await apiService.put<Model>(`/models/${id}`, model);
    return response.data;
  }

  async deleteModel(id: string): Promise<void> {
    await apiService.delete(`/models/${id}`);
  }

  // Version management
  async getModelVersions(modelId: string): Promise<ModelVersion[]> {
    const response = await apiService.get<ModelVersion[]>(`/models/${modelId}/versions`);
    return response.data;
  }

  async getModelVersion(modelId: string, version: string): Promise<ModelVersion> {
    const response = await apiService.get<ModelVersion>(`/models/${modelId}/versions/${version}`);
    return response.data;
  }

  async createModelVersion(modelId: string, version: Partial<ModelVersion>): Promise<ModelVersion> {
    const response = await apiService.post<ModelVersion>(`/models/${modelId}/versions`, version);
    return response.data;
  }

  async updateModelVersion(modelId: string, versionId: string, version: Partial<ModelVersion>): Promise<ModelVersion> {
    const response = await apiService.put<ModelVersion>(`/models/${modelId}/versions/${versionId}`, version);
    return response.data;
  }

  // Artifact management
  async getVersionArtifacts(versionId: string): Promise<Artifact[]> {
    const response = await apiService.get<Artifact[]>(`/versions/${versionId}/artifacts`);
    return response.data;
  }

  async uploadArtifact(versionId: string, file: File, type: string, onProgress?: (progress: number) => void): Promise<Artifact> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', type);

    const response = await apiService.uploadFile(`/versions/${versionId}/artifacts`, file, onProgress);
    return response.data;
  }

  async downloadArtifact(artifactId: string, filename: string): Promise<void> {
    await apiService.downloadFile(`/artifacts/${artifactId}/download`, filename);
  }

  // Model Card
  async getModelCard(modelId: string, version?: string): Promise<any> {
    const url = version 
      ? `/models/${modelId}/versions/${version}/model-card`
      : `/models/${modelId}/model-card`;
    const response = await apiService.get<any>(url);
    return response.data;
  }

  // Search and filtering
  async searchModels(query: string, filters?: SearchFilters): Promise<Model[]> {
    const params = {
      search: query,
      ...filters,
    };
    const response = await apiService.get<Model[]>('/models/search', params);
    return response.data;
  }

  async getModelTags(): Promise<string[]> {
    const response = await apiService.get<string[]>('/models/tags');
    return response.data;
  }

  async getModelGroups(): Promise<string[]> {
    const response = await apiService.get<string[]>('/models/groups');
    return response.data;
  }
}

export const modelService = new ModelService();