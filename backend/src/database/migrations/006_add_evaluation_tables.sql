-- AI Model Registry Evaluation Service Tables
-- Migration: 006_add_evaluation_tables
-- Description: Create tables for evaluation suites, datasets, and jobs

-- Create enum types for evaluation service
CREATE TYPE evaluation_suite_status AS ENUM ('draft', 'active', 'inactive', 'deprecated');
CREATE TYPE evaluation_test_type AS ENUM ('bias', 'safety', 'effectiveness', 'robustness', 'fairness', 'performance');
CREATE TYPE dataset_type AS ENUM ('training', 'validation', 'test', 'benchmark');
CREATE TYPE evaluation_job_status AS ENUM ('pending', 'queued', 'running', 'completed', 'failed', 'cancelled');
CREATE TYPE job_priority AS ENUM ('low', 'normal', 'high', 'urgent');

-- Evaluation suites table
CREATE TABLE evaluation_suites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  version VARCHAR(20) NOT NULL,
  status evaluation_suite_status NOT NULL DEFAULT 'draft',
  configuration JSONB NOT NULL,
  created_by VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  -- Constraints
  CONSTRAINT evaluation_suites_name_check CHECK (name ~ '^[a-zA-Z0-9\-_\s]+$'),
  CONSTRAINT evaluation_suites_version_check CHECK (version ~ '^\d+\.\d+\.\d+$'),
  CONSTRAINT evaluation_suites_configuration_check CHECK (
    configuration ? 'datasets' AND 
    configuration ? 'testTypes' AND 
    configuration ? 'thresholds' AND
    configuration ? 'timeout' AND
    configuration ? 'retryPolicy'
  ),
  
  -- Unique constraint on name/version combination
  UNIQUE(name, version)
);

-- Evaluation datasets table
CREATE TABLE evaluation_datasets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  type dataset_type NOT NULL,
  uri TEXT NOT NULL,
  sha256 CHAR(64) NOT NULL,
  size BIGINT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  -- Constraints
  CONSTRAINT evaluation_datasets_name_check CHECK (name ~ '^[a-zA-Z0-9\-_\s]+$'),
  CONSTRAINT evaluation_datasets_sha256_check CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  CONSTRAINT evaluation_datasets_size_positive CHECK (size > 0),
  
  -- Unique constraint on name
  UNIQUE(name)
);

-- Evaluation jobs table
CREATE TABLE evaluation_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  version_id UUID NOT NULL REFERENCES model_versions(id) ON DELETE CASCADE,
  suite_id UUID NOT NULL REFERENCES evaluation_suites(id) ON DELETE CASCADE,
  status evaluation_job_status NOT NULL DEFAULT 'pending',
  priority job_priority NOT NULL DEFAULT 'normal',
  configuration JSONB NOT NULL,
  results JSONB,
  error_message TEXT,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  -- Constraints
  CONSTRAINT evaluation_jobs_configuration_check CHECK (
    configuration ? 'suiteConfiguration' AND 
    configuration ? 'modelArtifacts' AND 
    configuration ? 'environment'
  ),
  CONSTRAINT evaluation_jobs_results_check CHECK (
    results IS NULL OR (
      results ? 'taskMetrics' AND 
      results ? 'biasMetrics' AND 
      results ? 'safetyMetrics' AND 
      results ? 'robustnessMetrics'
    )
  ),
  CONSTRAINT evaluation_jobs_timing_check CHECK (
    (started_at IS NULL AND completed_at IS NULL) OR
    (started_at IS NOT NULL AND (completed_at IS NULL OR completed_at >= started_at))
  )
);

-- Junction table for evaluation suite datasets (many-to-many relationship)
CREATE TABLE evaluation_suite_datasets (
  suite_id UUID NOT NULL REFERENCES evaluation_suites(id) ON DELETE CASCADE,
  dataset_id UUID NOT NULL REFERENCES evaluation_datasets(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  PRIMARY KEY (suite_id, dataset_id)
);

-- Indexes for performance optimization

-- Evaluation suites indexes
CREATE INDEX idx_evaluation_suites_name ON evaluation_suites(name);
CREATE INDEX idx_evaluation_suites_status ON evaluation_suites(status);
CREATE INDEX idx_evaluation_suites_created_by ON evaluation_suites(created_by);
CREATE INDEX idx_evaluation_suites_created_at ON evaluation_suites(created_at);
CREATE INDEX idx_evaluation_suites_name_search ON evaluation_suites USING GIN(to_tsvector('english', name || ' ' || description));

-- Evaluation datasets indexes
CREATE INDEX idx_evaluation_datasets_name ON evaluation_datasets(name);
CREATE INDEX idx_evaluation_datasets_type ON evaluation_datasets(type);
CREATE INDEX idx_evaluation_datasets_sha256 ON evaluation_datasets(sha256);
CREATE INDEX idx_evaluation_datasets_created_at ON evaluation_datasets(created_at);

-- Evaluation jobs indexes
CREATE INDEX idx_evaluation_jobs_version_id ON evaluation_jobs(version_id);
CREATE INDEX idx_evaluation_jobs_suite_id ON evaluation_jobs(suite_id);
CREATE INDEX idx_evaluation_jobs_status ON evaluation_jobs(status);
CREATE INDEX idx_evaluation_jobs_priority ON evaluation_jobs(priority);
CREATE INDEX idx_evaluation_jobs_created_at ON evaluation_jobs(created_at);
CREATE INDEX idx_evaluation_jobs_started_at ON evaluation_jobs(started_at);
CREATE INDEX idx_evaluation_jobs_completed_at ON evaluation_jobs(completed_at);

-- Evaluation suite datasets indexes
CREATE INDEX idx_evaluation_suite_datasets_suite_id ON evaluation_suite_datasets(suite_id);
CREATE INDEX idx_evaluation_suite_datasets_dataset_id ON evaluation_suite_datasets(dataset_id);

-- Apply updated_at triggers
CREATE TRIGGER update_evaluation_suites_updated_at 
  BEFORE UPDATE ON evaluation_suites 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Apply audit triggers
CREATE TRIGGER audit_evaluation_suites_trigger
  AFTER INSERT OR UPDATE OR DELETE ON evaluation_suites
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

CREATE TRIGGER audit_evaluation_datasets_trigger
  AFTER INSERT OR UPDATE OR DELETE ON evaluation_datasets
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

CREATE TRIGGER audit_evaluation_jobs_trigger
  AFTER INSERT OR UPDATE OR DELETE ON evaluation_jobs
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

-- Function to validate evaluation job status transitions
CREATE OR REPLACE FUNCTION validate_evaluation_job_status_transition()
RETURNS TRIGGER AS $$
DECLARE
  valid_transitions JSONB := '{
    "pending": ["queued", "cancelled"],
    "queued": ["running", "cancelled"],
    "running": ["completed", "failed", "cancelled"],
    "completed": [],
    "failed": ["queued"],
    "cancelled": []
  }';
BEGIN
  -- Allow initial state setting
  IF OLD IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Check if transition is valid
  IF NOT (valid_transitions->OLD.status::text ? NEW.status::text) THEN
    RAISE EXCEPTION 'Invalid evaluation job status transition from % to %', OLD.status, NEW.status;
  END IF;
  
  -- Set timestamps based on status
  IF NEW.status = 'running' AND OLD.status != 'running' THEN
    NEW.started_at = CURRENT_TIMESTAMP;
  END IF;
  
  IF NEW.status IN ('completed', 'failed', 'cancelled') AND OLD.status NOT IN ('completed', 'failed', 'cancelled') THEN
    NEW.completed_at = CURRENT_TIMESTAMP;
  END IF;
  
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply evaluation job status transition validation trigger
CREATE TRIGGER validate_evaluation_job_status_transition_trigger
  BEFORE UPDATE OF status ON evaluation_jobs
  FOR EACH ROW EXECUTE FUNCTION validate_evaluation_job_status_transition();