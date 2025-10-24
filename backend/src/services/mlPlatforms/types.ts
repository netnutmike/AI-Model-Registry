export interface MlPlatformConfig {
  name: string;
  type: 'mlflow' | 'huggingface' | 'sagemaker' | 'vertexai';
  config: {
    baseUrl?: string;
    apiKey?: string;
    region?: string;
    projectId?: string;
    credentials?: any;
  };
}

export interface ExternalModel {
  id: string;
  name: string;
  version: string;
  description?: string;
  tags: string[];
  metadata: Record<string, any>;
  artifacts: ExternalArtifact[];
  metrics?: Record<string, number>;
  parameters?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
  source: {
    platform: string;
    url: string;
    runId?: string;
  };
}

export interface ExternalArtifact {
  name: string;
  type: string;
  uri: string;
  size?: number;
  checksum?: string;
}

export interface ImportOptions {
  includeArtifacts: boolean;
  includeMetrics: boolean;
  includeParameters: boolean;
  targetGroup?: string;
  overwriteExisting: boolean;
}

export interface ExportOptions {
  includeArtifacts: boolean;
  includeMetadata: boolean;
  format: 'mlflow' | 'huggingface' | 'native';
}

export interface ImportResult {
  success: boolean;
  modelId?: string;
  versionId?: string;
  errors: string[];
  warnings: string[];
  importedArtifacts: number;
}

export interface ExportResult {
  success: boolean;
  exportUrl?: string;
  exportId?: string;
  errors: string[];
}

export interface PlatformAdapter {
  /**
   * Test connection to the platform
   */
  testConnection(): Promise<boolean>;

  /**
   * List available models
   */
  listModels(limit?: number, offset?: number): Promise<ExternalModel[]>;

  /**
   * Get model details
   */
  getModel(modelId: string, version?: string): Promise<ExternalModel | null>;

  /**
   * Import model from platform
   */
  importModel(modelId: string, version: string, options: ImportOptions): Promise<ImportResult>;

  /**
   * Export model to platform
   */
  exportModel(modelId: string, versionId: string, options: ExportOptions): Promise<ExportResult>;

  /**
   * Search models by criteria
   */
  searchModels(query: string, filters?: Record<string, any>): Promise<ExternalModel[]>;
}