-- AI Model Registry Policy Engine Tables
-- Migration: 005_add_policy_tables
-- Description: Create tables for policy definitions, evaluations, and results

-- Create enum types for policy engine
CREATE TYPE policy_status AS ENUM ('draft', 'active', 'inactive', 'deprecated');
CREATE TYPE policy_severity AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE policy_evaluation_status AS ENUM ('pending', 'running', 'completed', 'failed');
CREATE TYPE policy_result_status AS ENUM ('pass', 'fail', 'warning', 'error');

-- Policies table
CREATE TABLE policies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  version VARCHAR(20) NOT NULL,
  status policy_status NOT NULL DEFAULT 'draft',
  severity policy_severity NOT NULL DEFAULT 'medium',
  rule_definition JSONB NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_by VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  activated_at TIMESTAMP WITH TIME ZONE,
  
  -- Constraints
  CONSTRAINT policy_name_check CHECK (name ~ '^[a-zA-Z0-9\-_\s]+$'),
  CONSTRAINT policy_version_check CHECK (version ~ '^\d+\.\d+\.\d+$'),
  CONSTRAINT policy_rule_structure CHECK (
    rule_definition ? 'conditions' AND 
    rule_definition ? 'actions'
  ),
  
  -- Unique constraint on name/version combination
  UNIQUE(name, version)
);

-- Policy evaluations table
CREATE TABLE policy_evaluations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  version_id UUID NOT NULL REFERENCES model_versions(id) ON DELETE CASCADE,
  policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
  status policy_evaluation_status NOT NULL DEFAULT 'pending',
  context JSONB NOT NULL DEFAULT '{}',
  dry_run BOOLEAN NOT NULL DEFAULT false,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  
  -- Unique constraint to prevent duplicate evaluations
  UNIQUE(version_id, policy_id, started_at)
);

-- Policy results table
CREATE TABLE policy_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  evaluation_id UUID NOT NULL REFERENCES policy_evaluations(id) ON DELETE CASCADE,
  rule_name VARCHAR(100) NOT NULL,
  status policy_result_status NOT NULL,
  message TEXT,
  details JSONB DEFAULT '{}',
  blocking BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  -- Index for efficient querying
  INDEX idx_policy_results_evaluation_id (evaluation_id),
  INDEX idx_policy_results_status (status),
  INDEX idx_policy_results_blocking (blocking)
);

-- Policy exceptions table for handling violations
CREATE TABLE policy_exceptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  version_id UUID NOT NULL REFERENCES model_versions(id) ON DELETE CASCADE,
  policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
  justification TEXT NOT NULL,
  approved_by VARCHAR(255) NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  -- Unique constraint to prevent duplicate exceptions
  UNIQUE(version_id, policy_id)
);

-- Indexes for performance optimization

-- Policies indexes
CREATE INDEX idx_policies_name ON policies(name);
CREATE INDEX idx_policies_status ON policies(status);
CREATE INDEX idx_policies_severity ON policies(severity);
CREATE INDEX idx_policies_created_by ON policies(created_by);
CREATE INDEX idx_policies_created_at ON policies(created_at);

-- Policy evaluations indexes
CREATE INDEX idx_policy_evaluations_version_id ON policy_evaluations(version_id);
CREATE INDEX idx_policy_evaluations_policy_id ON policy_evaluations(policy_id);
CREATE INDEX idx_policy_evaluations_status ON policy_evaluations(status);
CREATE INDEX idx_policy_evaluations_started_at ON policy_evaluations(started_at);

-- Policy exceptions indexes
CREATE INDEX idx_policy_exceptions_version_id ON policy_exceptions(version_id);
CREATE INDEX idx_policy_exceptions_policy_id ON policy_exceptions(policy_id);
CREATE INDEX idx_policy_exceptions_approved_by ON policy_exceptions(approved_by);
CREATE INDEX idx_policy_exceptions_expires_at ON policy_exceptions(expires_at);

-- Apply updated_at triggers
CREATE TRIGGER update_policies_updated_at 
  BEFORE UPDATE ON policies 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to validate policy rule definition structure
CREATE OR REPLACE FUNCTION validate_policy_rule_definition()
RETURNS TRIGGER AS $$
BEGIN
  -- Validate that conditions is an array
  IF NOT (NEW.rule_definition->'conditions' ? 0) THEN
    RAISE EXCEPTION 'Policy rule definition must have at least one condition';
  END IF;
  
  -- Validate that actions is an array
  IF NOT (NEW.rule_definition->'actions' ? 0) THEN
    RAISE EXCEPTION 'Policy rule definition must have at least one action';
  END IF;
  
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply rule definition validation trigger
CREATE TRIGGER validate_policy_rule_definition_trigger
  BEFORE INSERT OR UPDATE OF rule_definition ON policies
  FOR EACH ROW EXECUTE FUNCTION validate_policy_rule_definition();

-- Function to set activated_at when status changes to active
CREATE OR REPLACE FUNCTION set_policy_activated_at()
RETURNS TRIGGER AS $$
BEGIN
  -- Set activated_at when status changes to active
  IF NEW.status = 'active' AND (OLD IS NULL OR OLD.status != 'active') THEN
    NEW.activated_at = CURRENT_TIMESTAMP;
  END IF;
  
  -- Clear activated_at when status changes from active
  IF NEW.status != 'active' AND OLD IS NOT NULL AND OLD.status = 'active' THEN
    NEW.activated_at = NULL;
  END IF;
  
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply activated_at trigger
CREATE TRIGGER set_policy_activated_at_trigger
  BEFORE UPDATE OF status ON policies
  FOR EACH ROW EXECUTE FUNCTION set_policy_activated_at();

-- Apply audit triggers to policy tables
CREATE TRIGGER audit_policies_trigger
  AFTER INSERT OR UPDATE OR DELETE ON policies
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

CREATE TRIGGER audit_policy_evaluations_trigger
  AFTER INSERT OR UPDATE OR DELETE ON policy_evaluations
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

CREATE TRIGGER audit_policy_results_trigger
  AFTER INSERT OR UPDATE OR DELETE ON policy_results
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

CREATE TRIGGER audit_policy_exceptions_trigger
  AFTER INSERT OR UPDATE OR DELETE ON policy_exceptions
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();