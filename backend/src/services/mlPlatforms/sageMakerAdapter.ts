import { SageMakerClient, ListModelsCommand, DescribeModelCommand, ListModelPackagesCommand, DescribeModelPackageCommand } from '@aws-sdk/client-sagemaker';
import { PlatformAdapter, ExternalModel, ExternalArtifact, ImportOptions, ExportOptions, ImportResult, ExportResult } from './types';

export class SageMakerAdapter implements PlatformAdapter {
  private client: SageMakerClient;
  private region: string;

  constructor(region: string = 'us-east-1', credentials?: any) {
    this.region = region;
    this.client = new SageMakerClient({
      region,
      ...(credentials && { credentials })
    });
  }

  async testConnection(): Promise<boolean> {
    try {
      const command = new ListModelsCommand({ MaxResults: 1 });
      await this.client.send(command);
      return true;
    } catch (error) {
      console.error('SageMaker connection test failed:', error);
      return false;
    }
  }

  async listModels(limit: number = 100, offset: number = 0): Promise<ExternalModel[]> {
    try {
      const models: ExternalModel[] = [];

      // List SageMaker models
      const modelsCommand = new ListModelsCommand({
        MaxResults: Math.min(limit, 100),
        SortBy: 'CreationTime',
        SortOrder: 'Descending'
      });
      
      const modelsResponse = await this.client.send(modelsCommand);
      
      for (const model of modelsResponse.Models || []) {
        const detailCommand = new DescribeModelCommand({ ModelName: model.ModelName });
        const detail = await this.client.send(detailCommand);
        
        models.push(this.convertSageMakerModel(detail));
      }

      // Also list model packages (versioned models)
      if (models.length < limit) {
        const packagesCommand = new ListModelPackagesCommand({
          MaxResults: Math.min(limit - models.length, 100),
          SortBy: 'CreationTime',
          SortOrder: 'Descending'
        });
        
        const packagesResponse = await this.client.send(packagesCommand);
        
        for (const pkg of packagesResponse.ModelPackageSummaryList || []) {
          const detailCommand = new DescribeModelPackageCommand({ 
            ModelPackageName: pkg.ModelPackageName 
          });
          const detail = await this.client.send(detailCommand);
          
          models.push(this.convertSageMakerModelPackage(detail));
        }
      }

      return models.slice(offset, offset + limit);
    } catch (error) {
      console.error('Error listing SageMaker models:', error);
      return [];
    }
  }

  async getModel(modelId: string, version?: string): Promise<ExternalModel | null> {
    try {
      // Try to get as model first
      try {
        const command = new DescribeModelCommand({ ModelName: modelId });
        const response = await this.client.send(command);
        return this.convertSageMakerModel(response);
      } catch (error) {
        // If not found as model, try as model package
        const packageCommand = new DescribeModelPackageCommand({ ModelPackageName: modelId });
        const packageResponse = await this.client.send(packageCommand);
        return this.convertSageMakerModelPackage(packageResponse);
      }
    } catch (error) {
      console.error('Error getting SageMaker model:', error);
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
        result.errors.push('Model not found in SageMaker');
        return result;
      }

      // Check if model artifacts are accessible
      if (!this.areArtifactsAccessible(externalModel)) {
        result.errors.push('Model artifacts are not accessible or in different region');
        return result;
      }

      // Here you would integrate with your model registry service
      result.success = true;
      result.modelId = `sm-${modelId}`;
      result.versionId = version || 'latest';
      result.importedArtifacts = externalModel.artifacts.length;

      if (externalModel.metadata.modelPackageStatus !== 'Completed') {
        result.warnings.push('Model package is not in completed state');
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
      // SageMaker export would involve creating a model package
      // This is a placeholder implementation
      
      result.success = true;
      result.exportId = `sm-export-${Date.now()}`;
      result.exportUrl = `https://console.aws.amazon.com/sagemaker/home?region=${this.region}#/models/${modelId}`;

      return result;
    } catch (error) {
      result.errors.push(`Export failed: ${error.message}`);
      return result;
    }
  }

  async searchModels(query: string, filters?: Record<string, any>): Promise<ExternalModel[]> {
    try {
      // SageMaker doesn't have built-in search, so we'll list and filter
      const allModels = await this.listModels(1000);
      
      return allModels.filter(model => {
        const matchesQuery = model.name.toLowerCase().includes(query.toLowerCase()) ||
                           (model.description && model.description.toLowerCase().includes(query.toLowerCase()));
        
        if (!matchesQuery) return false;

        // Apply filters
        if (filters?.status && model.metadata.modelPackageStatus !== filters.status) {
          return false;
        }

        if (filters?.framework && !model.metadata.framework?.includes(filters.framework)) {
          return false;
        }

        return true;
      });
    } catch (error) {
      console.error('Error searching SageMaker models:', error);
      return [];
    }
  }

  private convertSageMakerModel(model: any): ExternalModel {
    const artifacts: ExternalArtifact[] = [];
    
    // Add primary container artifacts
    if (model.PrimaryContainer) {
      if (model.PrimaryContainer.ModelDataUrl) {
        artifacts.push({
          name: 'model-data',
          type: 'sagemaker-model',
          uri: model.PrimaryContainer.ModelDataUrl
        });
      }
      
      if (model.PrimaryContainer.Image) {
        artifacts.push({
          name: 'container-image',
          type: 'docker-image',
          uri: model.PrimaryContainer.Image
        });
      }
    }

    // Add additional containers
    if (model.Containers) {
      model.Containers.forEach((container: any, index: number) => {
        if (container.ModelDataUrl) {
          artifacts.push({
            name: `model-data-${index}`,
            type: 'sagemaker-model',
            uri: container.ModelDataUrl
          });
        }
      });
    }

    return {
      id: model.ModelName,
      name: model.ModelName,
      version: 'latest',
      description: model.ModelName,
      tags: Object.keys(model.Tags || {}),
      metadata: {
        arn: model.ModelArn,
        executionRoleArn: model.ExecutionRoleArn,
        primaryContainer: model.PrimaryContainer,
        containers: model.Containers,
        vpcConfig: model.VpcConfig,
        enableNetworkIsolation: model.EnableNetworkIsolation
      },
      artifacts,
      metrics: {},
      parameters: {},
      createdAt: new Date(model.CreationTime),
      updatedAt: new Date(model.CreationTime),
      source: {
        platform: 'sagemaker',
        url: `https://console.aws.amazon.com/sagemaker/home?region=${this.region}#/models/${model.ModelName}`
      }
    };
  }

  private convertSageMakerModelPackage(pkg: any): ExternalModel {
    const artifacts: ExternalArtifact[] = [];
    
    // Add inference specification artifacts
    if (pkg.InferenceSpecification?.Containers) {
      pkg.InferenceSpecification.Containers.forEach((container: any, index: number) => {
        if (container.ModelDataUrl) {
          artifacts.push({
            name: `inference-model-${index}`,
            type: 'sagemaker-model',
            uri: container.ModelDataUrl
          });
        }
        
        artifacts.push({
          name: `inference-image-${index}`,
          type: 'docker-image',
          uri: container.Image
        });
      });
    }

    return {
      id: pkg.ModelPackageName,
      name: pkg.ModelPackageName,
      version: pkg.ModelPackageVersion?.toString() || '1',
      description: pkg.ModelPackageDescription || pkg.ModelPackageName,
      tags: Object.keys(pkg.Tags || {}),
      metadata: {
        arn: pkg.ModelPackageArn,
        status: pkg.ModelPackageStatus,
        statusDetails: pkg.ModelPackageStatusDetails,
        inferenceSpecification: pkg.InferenceSpecification,
        sourceAlgorithmSpecification: pkg.SourceAlgorithmSpecification,
        validationSpecification: pkg.ValidationSpecification,
        modelPackageGroupName: pkg.ModelPackageGroupName,
        modelApprovalStatus: pkg.ModelApprovalStatus
      },
      artifacts,
      metrics: {},
      parameters: {},
      createdAt: new Date(pkg.CreationTime),
      updatedAt: new Date(pkg.LastModifiedTime || pkg.CreationTime),
      source: {
        platform: 'sagemaker',
        url: `https://console.aws.amazon.com/sagemaker/home?region=${this.region}#/model-packages/${pkg.ModelPackageName}`
      }
    };
  }

  private areArtifactsAccessible(model: ExternalModel): boolean {
    // Check if S3 URIs are accessible (basic validation)
    for (const artifact of model.artifacts) {
      if (artifact.uri.startsWith('s3://')) {
        // Basic S3 URI validation
        const s3Regex = /^s3:\/\/[a-z0-9.-]+\/.*$/;
        if (!s3Regex.test(artifact.uri)) {
          return false;
        }
      }
    }
    return true;
  }
}