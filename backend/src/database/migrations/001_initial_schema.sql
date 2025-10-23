-- AI Model Registry Initial Database Schema
-- Migration: 001_initial_schema
-- Description: Create core tables for models, versions, artifacts, evaluations, and approvals

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create enum types
CREATE TYPE risk_tier AS ENUM ('Low', 'Medium', 'High');
CREATE TYPE version_state AS ENUM (
  'draft', 
  'submitted', 
  'changes_requested', 
  'approved_staging', 
  'staging', 
  'approved_prod', 
  'production', 
  'deprecated', 
  'retired'
);
CREATE TYPE artifact_type AS ENUM ('weights', 'container', 'tokenizer', 'config');
CREATE TYPE approval_role AS ENUM ('MRC', 'Security', 'SRE');
CREATE TYPE approval_status AS ENUM ('pending', 'approved', 'rejected');

-- Models table
CREATE TABLE models (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  "group" VARCHAR(50) NOT NULL,
  description TEXT NOT NULL,
  owners TEXT[] NOT NULL,
  risk_tier risk_tier NOT NULL,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  -- Constraints
  CONSTRAINT models_name_check CHECK (name ~ '^[a-zA-Z0-9\-_]+$'),
  CONSTRAINT models_group_check CHECK ("group" ~ '^[a-zA-Z0-9\-_]+$'),
  CONSTRAINT models_owners_not_empty CHECK (array_length(owners, 1) > 0),
  
  -- Unique constraint on group/name combination
  UNIQUE("group", name)
);

-- Model versions table
CREATE TABLE model_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  model_id UUID NOT NULL REFERENCES models(id) ON DELETE CASCADE,
  version VARCHAR(20) NOT NULL,
  state version_state NOT NULL DEFAULT 'draft',
  commit_sha CHAR(40) NOT NULL,
  training_job_id VARCHAR(255),
  metadata JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  -- Constraints
  CONSTRAINT version_semantic_check CHECK (version ~ '^\d+\.\d+\.\d+$'),
  CONSTRAINT commit_sha_check CHECK (commit_sha ~ '^[a-f0-9]{40}$'),
  
  -- Unique constraint on model_id/version combination
  UNIQUE(model_id, version)
);

-- Artifacts table
CREATE TABLE artifacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  version_id UUID NOT NULL REFERENCES model_versions(id) ON DELETE CASCADE,
  type artifact_type NOT NULL,
  uri TEXT NOT NULL,
  sha256 CHAR(64) NOT NULL,
  size BIGINT NOT NULL,
  license VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  -- Constraints
  CONSTRAINT sha256_check CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  CONSTRAINT size_positive CHECK (size > 0)
);

-- Evaluations table
CREATE TABLE evaluations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  version_id UUID NOT NULL REFERENCES model_versions(id) ON DELETE CASCADE,
  suite_id UUID NOT NULL,
  results JSONB NOT NULL,
  thresholds JSONB NOT NULL,
  passed BOOLEAN NOT NULL,
  executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  -- Constraints to ensure results and thresholds have required structure
  CONSTRAINT results_structure CHECK (
    results ? 'taskMetrics' AND 
    results ? 'biasMetrics' AND 
    results ? 'safetyMetrics' AND 
    results ? 'robustnessMetrics'
  ),
  CONSTRAINT thresholds_structure CHECK (
    thresholds ? 'taskMetrics' AND 
    thresholds ? 'biasMetrics' AND 
    thresholds ? 'safetyMetrics' AND 
    thresholds ? 'robustnessMetrics'
  )
);

-- Approvals table
CREATE TABLE approvals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  version_id UUID NOT NULL REFERENCES model_versions(id) ON DELETE CASCADE,
  approver_user_id VARCHAR(255) NOT NULL,
  approver_role approval_role NOT NULL,
  status approval_status NOT NULL DEFAULT 'pending',
  comments TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  -- Unique constraint to prevent duplicate approvals from same role for same version
  UNIQUE(version_id, approver_role)
);

-- Audit log table for immutable audit trail
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID NOT NULL,
  action VARCHAR(50) NOT NULL,
  actor_user_id VARCHAR(255) NOT NULL,
  changes JSONB,
  metadata JSONB,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  hash_chain VARCHAR(64) -- For cryptographic integrity
) PARTITION BY RANGE (timestamp);

-- Create audit log partitions for current and next year
CREATE TABLE audit_logs_2024 PARTITION OF audit_logs
  FOR VALUES FROM ('2024-01-01') TO ('2025-01-01');
CREATE TABLE audit_logs_2025 PARTITION OF audit_logs
  FOR VALUES FROM ('2025-01-01') TO ('2026-01-01');

-- Indexes for performance optimization

-- Models indexes
CREATE INDEX idx_models_group ON models("group");
CREATE INDEX idx_models_risk_tier ON models(risk_tier);
CREATE INDEX idx_models_owners ON models USING GIN(owners);
CREATE INDEX idx_models_tags ON models USING GIN(tags);
CREATE INDEX idx_models_created_at ON models(created_at);
CREATE INDEX idx_models_name_search ON models USING GIN(to_tsvector('english', name || ' ' || description));

-- Model versions indexes
CREATE INDEX idx_model_versions_model_id ON model_versions(model_id);
CREATE INDEX idx_model_versions_state ON model_versions(state);
CREATE INDEX idx_model_versions_created_at ON model_versions(created_at);
CREATE INDEX idx_model_versions_version ON model_versions(version);

-- Artifacts indexes
CREATE INDEX idx_artifacts_version_id ON artifacts(version_id);
CREATE INDEX idx_artifacts_type ON artifacts(type);
CREATE INDEX idx_artifacts_sha256 ON artifacts(sha256);

-- Evaluations indexes
CREATE INDEX idx_evaluations_version_id ON evaluations(version_id);
CREATE INDEX idx_evaluations_suite_id ON evaluations(suite_id);
CREATE INDEX idx_evaluations_passed ON evaluations(passed);
CREATE INDEX idx_evaluations_executed_at ON evaluations(executed_at);

-- Approvals indexes
CREATE INDEX idx_approvals_version_id ON approvals(version_id);
CREATE INDEX idx_approvals_approver_user_id ON approvals(approver_user_id);
CREATE INDEX idx_approvals_status ON approvals(status);
CREATE INDEX idx_approvals_role ON approvals(approver_role);

-- Audit logs indexes
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_actor ON audit_logs(actor_user_id);
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp);

-- Functions and triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers
CREATE TRIGGER update_models_updated_at 
  BEFORE UPDATE ON models 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_model_versions_updated_at 
  BEFORE UPDATE ON model_versions 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_approvals_updated_at 
  BEFORE UPDATE ON approvals 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to validate version state transitions
CREATE OR REPLACE FUNCTION validate_version_state_transition()
RETURNS TRIGGER AS $$
DECLARE
  valid_transitions JSONB := '{
    "draft": ["submitted"],
    "submitted": ["changes_requested", "approved_staging"],
    "changes_requested": ["submitted"],
    "approved_staging": ["staging"],
    "staging": ["approved_prod", "changes_requested"],
    "approved_prod": ["production"],
    "production": ["deprecated"],
    "deprecated": ["retired"],
    "retired": []
  }';
BEGIN
  -- Allow initial state setting
  IF OLD IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Check if transition is valid
  IF NOT (valid_transitions->OLD.state::text ? NEW.state::text) THEN
    RAISE EXCEPTION 'Invalid state transition from % to %', OLD.state, NEW.state;
  END IF;
  
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply state transition validation trigger
CREATE TRIGGER validate_model_version_state_transition
  BEFORE UPDATE OF state ON model_versions
  FOR EACH ROW EXECUTE FUNCTION validate_version_state_transition();

-- Function for audit logging
CREATE OR REPLACE FUNCTION audit_log_trigger()
RETURNS TRIGGER AS $$
DECLARE
  audit_action TEXT;
  changes_json JSONB;
BEGIN
  -- Determine action
  IF TG_OP = 'INSERT' THEN
    audit_action := 'CREATE';
    changes_json := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    audit_action := 'UPDATE';
    changes_json := jsonb_build_object(
      'old', to_jsonb(OLD),
      'new', to_jsonb(NEW)
    );
  ELSIF TG_OP = 'DELETE' THEN
    audit_action := 'DELETE';
    changes_json := to_jsonb(OLD);
  END IF;
  
  -- Insert audit log (actor_user_id should be set by application)
  INSERT INTO audit_logs (entity_type, entity_id, action, actor_user_id, changes)
  VALUES (
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    audit_action,
    COALESCE(current_setting('app.current_user_id', true), 'system'),
    changes_json
  );
  
  RETURN COALESCE(NEW, OLD);
END;
$$ language 'plpgsql';

-- Apply audit triggers to all main tables
CREATE TRIGGER audit_models_trigger
  AFTER INSERT OR UPDATE OR DELETE ON models
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

CREATE TRIGGER audit_model_versions_trigger
  AFTER INSERT OR UPDATE OR DELETE ON model_versions
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

CREATE TRIGGER audit_artifacts_trigger
  AFTER INSERT OR UPDATE OR DELETE ON artifacts
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

CREATE TRIGGER audit_evaluations_trigger
  AFTER INSERT OR UPDATE OR DELETE ON evaluations
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

CREATE TRIGGER audit_approvals_trigger
  AFTER INSERT OR UPDATE OR DELETE ON approvals
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();