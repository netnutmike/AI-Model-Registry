-- CI/CD Integration Tables

-- Table for storing CI/CD provider configurations
CREATE TABLE IF NOT EXISTS cicd_providers (
    name VARCHAR(255) PRIMARY KEY,
    type VARCHAR(50) NOT NULL CHECK (type IN ('github', 'gitlab', 'bitbucket')),
    config JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table for tracking commits linked to models
CREATE TABLE IF NOT EXISTS commit_tracking (
    sha VARCHAR(64) PRIMARY KEY,
    message TEXT NOT NULL,
    author VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    repository VARCHAR(500) NOT NULL,
    branch VARCHAR(255) NOT NULL,
    model_id VARCHAR(255),
    version_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE SET NULL,
    FOREIGN KEY (version_id) REFERENCES model_versions(id) ON DELETE SET NULL
);

-- Table for storing pipeline validation results
CREATE TABLE IF NOT EXISTS pipeline_validations (
    id VARCHAR(255) PRIMARY KEY,
    commit_sha VARCHAR(64) NOT NULL,
    model_id VARCHAR(255) NOT NULL,
    version_id VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL CHECK (status IN ('pending', 'running', 'passed', 'failed')),
    checks JSONB NOT NULL,
    results JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    
    FOREIGN KEY (commit_sha) REFERENCES commit_tracking(sha) ON DELETE CASCADE,
    FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE CASCADE,
    FOREIGN KEY (version_id) REFERENCES model_versions(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_commit_tracking_model_id ON commit_tracking(model_id);
CREATE INDEX IF NOT EXISTS idx_commit_tracking_version_id ON commit_tracking(version_id);
CREATE INDEX IF NOT EXISTS idx_commit_tracking_repository ON commit_tracking(repository);
CREATE INDEX IF NOT EXISTS idx_commit_tracking_timestamp ON commit_tracking(timestamp);

CREATE INDEX IF NOT EXISTS idx_pipeline_validations_model_id ON pipeline_validations(model_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_validations_version_id ON pipeline_validations(version_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_validations_status ON pipeline_validations(status);
CREATE INDEX IF NOT EXISTS idx_pipeline_validations_created_at ON pipeline_validations(created_at);

-- Comments for documentation
COMMENT ON TABLE cicd_providers IS 'Configuration for CI/CD system integrations (GitHub, GitLab, Bitbucket)';
COMMENT ON TABLE commit_tracking IS 'Tracks git commits linked to model versions for traceability';
COMMENT ON TABLE pipeline_validations IS 'Results of automated policy validation in CI/CD pipelines';

COMMENT ON COLUMN cicd_providers.config IS 'JSON configuration including baseUrl, token, and webhookSecret';
COMMENT ON COLUMN commit_tracking.sha IS 'Git commit SHA (40 chars for SHA-1, 64 chars for SHA-256)';
COMMENT ON COLUMN pipeline_validations.checks IS 'JSON object with boolean results for each validation check';
COMMENT ON COLUMN pipeline_validations.results IS 'JSON object with detailed validation results and messages';