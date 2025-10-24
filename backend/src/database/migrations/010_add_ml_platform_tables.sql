-- ML Platform Integration Tables

-- Table for storing ML platform configurations
CREATE TABLE IF NOT EXISTS ml_platforms (
    name VARCHAR(255) PRIMARY KEY,
    type VARCHAR(50) NOT NULL CHECK (type IN ('mlflow', 'huggingface', 'sagemaker', 'vertexai')),
    config JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table for tracking model imports from external platforms
CREATE TABLE IF NOT EXISTS model_imports (
    id SERIAL PRIMARY KEY,
    platform_name VARCHAR(255) NOT NULL,
    external_model_id VARCHAR(500) NOT NULL,
    external_version VARCHAR(255) NOT NULL,
    internal_model_id VARCHAR(255) NOT NULL,
    internal_version_id VARCHAR(255) NOT NULL,
    imported_by VARCHAR(255) NOT NULL,
    imported_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    FOREIGN KEY (platform_name) REFERENCES ml_platforms(name) ON DELETE CASCADE,
    FOREIGN KEY (internal_model_id) REFERENCES models(id) ON DELETE CASCADE,
    FOREIGN KEY (internal_version_id) REFERENCES model_versions(id) ON DELETE CASCADE
);

-- Table for tracking model exports to external platforms
CREATE TABLE IF NOT EXISTS model_exports (
    id SERIAL PRIMARY KEY,
    platform_name VARCHAR(255) NOT NULL,
    model_id VARCHAR(255) NOT NULL,
    version_id VARCHAR(255) NOT NULL,
    export_id VARCHAR(255) NOT NULL,
    export_url TEXT,
    exported_by VARCHAR(255) NOT NULL,
    exported_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    FOREIGN KEY (platform_name) REFERENCES ml_platforms(name) ON DELETE CASCADE,
    FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE CASCADE,
    FOREIGN KEY (version_id) REFERENCES model_versions(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_model_imports_platform ON model_imports(platform_name);
CREATE INDEX IF NOT EXISTS idx_model_imports_internal_model ON model_imports(internal_model_id);
CREATE INDEX IF NOT EXISTS idx_model_imports_external_model ON model_imports(external_model_id);
CREATE INDEX IF NOT EXISTS idx_model_imports_imported_at ON model_imports(imported_at);

CREATE INDEX IF NOT EXISTS idx_model_exports_platform ON model_exports(platform_name);
CREATE INDEX IF NOT EXISTS idx_model_exports_model ON model_exports(model_id);
CREATE INDEX IF NOT EXISTS idx_model_exports_version ON model_exports(version_id);
CREATE INDEX IF NOT EXISTS idx_model_exports_exported_at ON model_exports(exported_at);

-- Unique constraints to prevent duplicate imports/exports
CREATE UNIQUE INDEX IF NOT EXISTS idx_model_imports_unique ON model_imports(
    platform_name, external_model_id, external_version, internal_model_id, internal_version_id
);

-- Comments for documentation
COMMENT ON TABLE ml_platforms IS 'Configuration for ML platform integrations (MLflow, Hugging Face, SageMaker, Vertex AI)';
COMMENT ON TABLE model_imports IS 'Tracks models imported from external ML platforms';
COMMENT ON TABLE model_exports IS 'Tracks models exported to external ML platforms';

COMMENT ON COLUMN ml_platforms.config IS 'JSON configuration including baseUrl, apiKey, region, projectId, and credentials';
COMMENT ON COLUMN model_imports.external_model_id IS 'Model identifier in the external platform';
COMMENT ON COLUMN model_imports.external_version IS 'Version identifier in the external platform';
COMMENT ON COLUMN model_exports.export_id IS 'Export operation identifier';
COMMENT ON COLUMN model_exports.export_url IS 'URL to the exported model in the external platform';