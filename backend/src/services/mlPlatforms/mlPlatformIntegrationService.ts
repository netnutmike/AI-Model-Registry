import { DatabaseService } from '../database/databaseService';
import { AuditService } from '../audit/auditService';
import { MlflowAdapter } from './mlflowAdapter';
import { HuggingFaceAdapter } from './huggingFaceAdapter';
import { SageMakerAdapter } from './sageMakerAdapter';
import { VertexAiAdapter } from './vertexAiAdapter';
import { MlPlatformConfig, PlatformAdapter, ExternalModel, ImportOptions, ExportOptions, ImportResult, ExportResult } from './types';

export class MlPlatformIntegrationService {
  private db: DatabaseService;
  private auditService: AuditService;
  private adapters: Map<string, PlatformAdapter> = new Map();

  constructor(db: DatabaseService, auditService: AuditService) {
    this.db = db;
    this.auditService = auditService;
  }

  /**
   * Register an ML platform configuration
   */
  async registerPlatform(config: MlPlatformConfig): Promise<void> {
    // Store configuration in database
    const query = `
      INSERT INTO ml_platforms (name, type, config, created_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (name) DO UPDATE SET
        type = EXCLUDED.type,
        config = EXCLUDED.config,
        updated_at = NOW()
    `;

    await this.db.query(query, [
      config.name,
      config.type,
      JSON.stringify(config.config)
    ]);

    // Initialize adapter
    await this.initializeAdapter(config);

    // Log registration
    await this.auditService.logEvent({
      eventType: 'ml_platform_registered',
      userId: 'system',
      resourceType: 'ml_platform',
      resourceId: config.name,
      details: {
        type: config.type,
        baseUrl: config.config.baseUrl
      }
    });
  }

  /**
   * Get platform configuration
   */
  async getPlatform(name: string): Promise<MlPlatformConfig | null> {
    const query = `
      SELECT name, type, config
      FROM ml_platforms
      WHERE name = $1
    `;

    const result = await this.db.query(query, [name]);
    
    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      name: row.name,
      type: row.type,
      config: JSON.parse(row.config)
    };
  }

  /**
   * List all registered platforms
   */
  async listPlatforms(): Promise<Omit<MlPlatformConfig, 'config'>[]> {
    const query = `
      SELECT name, type
      FROM ml_platforms
      ORDER BY name
    `;

    const result = await this.db.query(query);
    
    return result.rows.map(row => ({
      name: row.name,
      type: row.type,
      config: {} // Don't expose sensitive config
    }));
  }

  /**
   * Remove a platform
   */
  async removePlatform(name: string): Promise<void> {
    const query = `DELETE FROM ml_platforms WHERE name = $1`;
    await this.db.query(query, [name]);
    
    // Remove adapter
    this.adapters.delete(name);

    // Log removal
    await this.auditService.logEvent({
      eventType: 'ml_platform_removed',
      userId: 'system',
      resourceType: 'ml_platform',
      resourceId: name,
      details: {}
    });
  }

  /**
   * Test connection to a platform
   */
  async testPlatformConnection(name: string): Promise<boolean> {
    const adapter = await this.getAdapter(name);
    if (!adapter) {
      throw new Error(`Platform ${name} not found`);
    }

    return await adapter.testConnection();
  }

  /**
   * List models from a platform
   */
  async listPlatformModels(
    platformName: string,
    limit: number = 100,
    offset: number = 0
  ): Promise<ExternalModel[]> {
    const adapter = await this.getAdapter(platformName);
    if (!adapter) {
      throw new Error(`Platform ${platformName} not found`);
    }

    return await adapter.listModels(limit, offset);
  }

  /**
   * Get model details from a platform
   */
  async getPlatformModel(
    platformName: string,
    modelId: string,
    version?: string
  ): Promise<ExternalModel | null> {
    const adapter = await this.getAdapter(platformName);
    if (!adapter) {
      throw new Error(`Platform ${platformName} not found`);
    }

    return await adapter.getModel(modelId, version);
  }

  /**
   * Search models across platforms
   */
  async searchPlatformModels(
    platformName: string,
    query: string,
    filters?: Record<string, any>
  ): Promise<ExternalModel[]> {
    const adapter = await this.getAdapter(platformName);
    if (!adapter) {
      throw new Error(`Platform ${platformName} not found`);
    }

    return await adapter.searchModels(query, filters);
  }

  /**
   * Import model from external platform
   */
  async importModel(
    platformName: string,
    modelId: string,
    version: string,
    options: ImportOptions,
    userId: string
  ): Promise<ImportResult> {
    const adapter = await this.getAdapter(platformName);
    if (!adapter) {
      throw new Error(`Platform ${platformName} not found`);
    }

    // Log import start
    await this.auditService.logEvent({
      eventType: 'model_import_started',
      userId,
      resourceType: 'external_model',
      resourceId: `${platformName}:${modelId}:${version}`,
      details: {
        platform: platformName,
        modelId,
        version,
        options
      }
    });

    try {
      const result = await adapter.importModel(modelId, version, options);

      // Log import result
      await this.auditService.logEvent({
        eventType: result.success ? 'model_import_completed' : 'model_import_failed',
        userId,
        resourceType: 'external_model',
        resourceId: `${platformName}:${modelId}:${version}`,
        details: {
          platform: platformName,
          success: result.success,
          importedModelId: result.modelId,
          importedVersionId: result.versionId,
          errors: result.errors,
          warnings: result.warnings
        }
      });

      // Store import record
      if (result.success) {
        await this.storeImportRecord(
          platformName,
          modelId,
          version,
          result.modelId!,
          result.versionId!,
          userId
        );
      }

      return result;
    } catch (error) {
      // Log import error
      await this.auditService.logEvent({
        eventType: 'model_import_error',
        userId,
        resourceType: 'external_model',
        resourceId: `${platformName}:${modelId}:${version}`,
        details: {
          platform: platformName,
          error: error.message
        }
      });

      throw error;
    }
  }

  /**
   * Export model to external platform
   */
  async exportModel(
    platformName: string,
    modelId: string,
    versionId: string,
    options: ExportOptions,
    userId: string
  ): Promise<ExportResult> {
    const adapter = await this.getAdapter(platformName);
    if (!adapter) {
      throw new Error(`Platform ${platformName} not found`);
    }

    // Log export start
    await this.auditService.logEvent({
      eventType: 'model_export_started',
      userId,
      resourceType: 'model_version',
      resourceId: versionId,
      details: {
        platform: platformName,
        modelId,
        options
      }
    });

    try {
      const result = await adapter.exportModel(modelId, versionId, options);

      // Log export result
      await this.auditService.logEvent({
        eventType: result.success ? 'model_export_completed' : 'model_export_failed',
        userId,
        resourceType: 'model_version',
        resourceId: versionId,
        details: {
          platform: platformName,
          success: result.success,
          exportUrl: result.exportUrl,
          exportId: result.exportId,
          errors: result.errors
        }
      });

      // Store export record
      if (result.success) {
        await this.storeExportRecord(
          platformName,
          modelId,
          versionId,
          result.exportId!,
          result.exportUrl,
          userId
        );
      }

      return result;
    } catch (error) {
      // Log export error
      await this.auditService.logEvent({
        eventType: 'model_export_error',
        userId,
        resourceType: 'model_version',
        resourceId: versionId,
        details: {
          platform: platformName,
          error: error.message
        }
      });

      throw error;
    }
  }

  /**
   * Get import/export history for a model
   */
  async getIntegrationHistory(modelId: string): Promise<{
    imports: any[];
    exports: any[];
  }> {
    const importsQuery = `
      SELECT platform_name, external_model_id, external_version, imported_at, imported_by
      FROM model_imports
      WHERE internal_model_id = $1
      ORDER BY imported_at DESC
    `;

    const exportsQuery = `
      SELECT platform_name, export_id, export_url, exported_at, exported_by
      FROM model_exports
      WHERE model_id = $1
      ORDER BY exported_at DESC
    `;

    const [importsResult, exportsResult] = await Promise.all([
      this.db.query(importsQuery, [modelId]),
      this.db.query(exportsQuery, [modelId])
    ]);

    return {
      imports: importsResult.rows,
      exports: exportsResult.rows
    };
  }

  /**
   * Initialize all registered platforms
   */
  async initializeAllPlatforms(): Promise<void> {
    const platforms = await this.listPlatforms();
    
    for (const platform of platforms) {
      const config = await this.getPlatform(platform.name);
      if (config) {
        await this.initializeAdapter(config);
      }
    }
  }

  private async getAdapter(name: string): Promise<PlatformAdapter | null> {
    if (this.adapters.has(name)) {
      return this.adapters.get(name)!;
    }

    // Try to initialize adapter if not found
    const config = await this.getPlatform(name);
    if (config) {
      await this.initializeAdapter(config);
      return this.adapters.get(name) || null;
    }

    return null;
  }

  private async initializeAdapter(config: MlPlatformConfig): Promise<void> {
    let adapter: PlatformAdapter;

    switch (config.type) {
      case 'mlflow':
        adapter = new MlflowAdapter(
          config.config.baseUrl!,
          config.config.apiKey
        );
        break;
      case 'huggingface':
        adapter = new HuggingFaceAdapter(config.config.apiKey);
        break;
      case 'sagemaker':
        adapter = new SageMakerAdapter(
          config.config.region!,
          config.config.credentials
        );
        break;
      case 'vertexai':
        adapter = new VertexAiAdapter(
          config.config.projectId!,
          config.config.region!,
          config.config.credentials
        );
        break;
      default:
        throw new Error(`Unsupported platform type: ${config.type}`);
    }

    this.adapters.set(config.name, adapter);
  }

  private async storeImportRecord(
    platformName: string,
    externalModelId: string,
    externalVersion: string,
    internalModelId: string,
    internalVersionId: string,
    userId: string
  ): Promise<void> {
    const query = `
      INSERT INTO model_imports (
        platform_name, external_model_id, external_version,
        internal_model_id, internal_version_id, imported_by, imported_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
    `;

    await this.db.query(query, [
      platformName,
      externalModelId,
      externalVersion,
      internalModelId,
      internalVersionId,
      userId
    ]);
  }

  private async storeExportRecord(
    platformName: string,
    modelId: string,
    versionId: string,
    exportId: string,
    exportUrl: string | undefined,
    userId: string
  ): Promise<void> {
    const query = `
      INSERT INTO model_exports (
        platform_name, model_id, version_id, export_id, export_url, exported_by, exported_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
    `;

    await this.db.query(query, [
      platformName,
      modelId,
      versionId,
      exportId,
      exportUrl,
      userId
    ]);
  }
}