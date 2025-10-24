import { useApiQuery, usePaginatedQuery, useApiMutation } from './useApi';
import { Model, ModelVersion, Artifact, SearchFilters } from '@/types';

// Model queries
export const useModels = (filters?: SearchFilters, page = 1, limit = 20) => {
  return usePaginatedQuery<Model>(
    ['models', JSON.stringify(filters), page.toString(), limit.toString()],
    '/models',
    { ...filters, page, limit }
  );
};

export const useModel = (id: string, enabled = true) => {
  return useApiQuery<Model>(
    ['models', id],
    `/models/${id}`,
    undefined,
    { enabled: enabled && !!id }
  );
};

export const useModelVersions = (modelId: string, enabled = true) => {
  return useApiQuery<ModelVersion[]>(
    ['models', modelId, 'versions'],
    `/models/${modelId}/versions`,
    undefined,
    { enabled: enabled && !!modelId }
  );
};

export const useModelVersion = (modelId: string, version: string, enabled = true) => {
  return useApiQuery<ModelVersion>(
    ['models', modelId, 'versions', version],
    `/models/${modelId}/versions/${version}`,
    undefined,
    { enabled: enabled && !!modelId && !!version }
  );
};

export const useVersionArtifacts = (versionId: string, enabled = true) => {
  return useApiQuery<Artifact[]>(
    ['versions', versionId, 'artifacts'],
    `/versions/${versionId}/artifacts`,
    undefined,
    { enabled: enabled && !!versionId }
  );
};

export const useModelCard = (modelId: string, version?: string, enabled = true) => {
  const url = version 
    ? `/models/${modelId}/versions/${version}/model-card`
    : `/models/${modelId}/model-card`;
  
  return useApiQuery<any>(
    ['models', modelId, 'model-card', version || 'latest'],
    url,
    undefined,
    { enabled: enabled && !!modelId }
  );
};

export const useModelTags = () => {
  return useApiQuery<string[]>(
    ['models', 'tags'],
    '/models/tags'
  );
};

export const useModelGroups = () => {
  return useApiQuery<string[]>(
    ['models', 'groups'],
    '/models/groups'
  );
};

// Model mutations
export const useCreateModel = () => {
  return useApiMutation<Model, Partial<Model>>('/models', {
    invalidateQueries: [['models']],
  });
};

export const useUpdateModel = (modelId: string) => {
  return useApiMutation<Model, Partial<Model>>(`/models/${modelId}`, {
    invalidateQueries: [['models'], ['models', modelId]],
  });
};

export const useCreateModelVersion = (modelId: string) => {
  return useApiMutation<ModelVersion, Partial<ModelVersion>>(`/models/${modelId}/versions`, {
    invalidateQueries: [['models', modelId, 'versions']],
  });
};

export const useUploadArtifact = (versionId: string) => {
  return useApiMutation<Artifact, { file: File; type: string }>(`/versions/${versionId}/artifacts`, {
    invalidateQueries: [['versions', versionId, 'artifacts']],
  });
};