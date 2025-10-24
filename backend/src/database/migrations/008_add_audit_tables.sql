-- Migration: Add audit service tables
-- Description: Creates tables for immutable audit logging, evidence bundles, and GDPR compliance

-- Audit logs table with append-only design and hash chain integrity
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id VARCHAR(255) NOT NULL,
    user_id VARCHAR(255),
    session_id VARCHAR(255),
    action VARCHAR(100) NOT NULL,
    details JSONB NOT NULL DEFAULT '{}',
    metadata JSONB NOT NULL DEFAULT '{}',
    ip_address INET,
    user_agent TEXT,
    previous_hash VARCHAR(64),
    current_hash VARCHAR(64) NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- Indexes for efficient querying
    INDEX idx_audit_logs_timestamp (timestamp),
    INDEX idx_audit_logs_entity (entity_type, entity_id),
    INDEX idx_audit_logs_user (user_id),
    INDEX idx_audit_logs_event_type (event_type),
    INDEX idx_audit_logs_hash_chain (previous_hash, current_hash)
) PARTITION BY RANGE (timestamp);

-- Create monthly partitions for audit logs (example for current year)
CREATE TABLE audit_logs_2024_01 PARTITION OF audit_logs
    FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
CREATE TABLE audit_logs_2024_02 PARTITION OF audit_logs
    FOR VALUES FROM ('2024-02-01') TO ('2024-03-01');
CREATE TABLE audit_logs_2024_03 PARTITION OF audit_logs
    FOR VALUES FROM ('2024-03-01') TO ('2024-04-01');
CREATE TABLE audit_logs_2024_04 PARTITION OF audit_logs
    FOR VALUES FROM ('2024-04-01') TO ('2024-05-01');
CREATE TABLE audit_logs_2024_05 PARTITION OF audit_logs
    FOR VALUES FROM ('2024-05-01') TO ('2024-06-01');
CREATE TABLE audit_logs_2024_06 PARTITION OF audit_logs
    FOR VALUES FROM ('2024-06-01') TO ('2024-07-01');
CREATE TABLE audit_logs_2024_07 PARTITION OF audit_logs
    FOR VALUES FROM ('2024-07-01') TO ('2024-08-01');
CREATE TABLE audit_logs_2024_08 PARTITION OF audit_logs
    FOR VALUES FROM ('2024-08-01') TO ('2024-09-01');
CREATE TABLE audit_logs_2024_09 PARTITION OF audit_logs
    FOR VALUES FROM ('2024-09-01') TO ('2024-10-01');
CREATE TABLE audit_logs_2024_10 PARTITION OF audit_logs
    FOR VALUES FROM ('2024-10-01') TO ('2024-11-01');
CREATE TABLE audit_logs_2024_11 PARTITION OF audit_logs
    FOR VALUES FROM ('2024-11-01') TO ('2024-12-01');
CREATE TABLE audit_logs_2024_12 PARTITION OF audit_logs
    FOR VALUES FROM ('2024-12-01') TO ('2025-01-01');

-- Evidence bundles for compliance reporting
CREATE TABLE evidence_bundles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    bundle_type VARCHAR(100) NOT NULL, -- 'compliance_report', 'audit_trail', 'investigation'
    status VARCHAR(50) NOT NULL DEFAULT 'generating', -- 'generating', 'ready', 'expired', 'error'
    query_criteria JSONB NOT NULL,
    file_path VARCHAR(500),
    file_size BIGINT,
    file_hash VARCHAR(64),
    expires_at TIMESTAMP WITH TIME ZONE,
    generated_by VARCHAR(255) NOT NULL,
    generated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    
    INDEX idx_evidence_bundles_status (status),
    INDEX idx_evidence_bundles_type (bundle_type),
    INDEX idx_evidence_bundles_generated_by (generated_by),
    INDEX idx_evidence_bundles_generated_at (generated_at)
);

-- Data retention policies for GDPR compliance
CREATE TABLE data_retention_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    entity_type VARCHAR(100) NOT NULL,
    retention_period_days INTEGER NOT NULL,
    deletion_criteria JSONB NOT NULL DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    INDEX idx_retention_policies_entity_type (entity_type),
    INDEX idx_retention_policies_active (is_active)
);

-- Data subject access requests (GDPR)
CREATE TABLE data_subject_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_type VARCHAR(50) NOT NULL, -- 'access', 'deletion', 'rectification', 'portability'
    subject_identifier VARCHAR(255) NOT NULL, -- email, user_id, etc.
    subject_type VARCHAR(50) NOT NULL, -- 'user', 'email', 'ip_address'
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'rejected'
    justification TEXT,
    requested_by VARCHAR(255) NOT NULL,
    requested_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    processed_by VARCHAR(255),
    processed_at TIMESTAMP WITH TIME ZONE,
    completion_details JSONB,
    
    INDEX idx_dsr_status (status),
    INDEX idx_dsr_subject (subject_type, subject_identifier),
    INDEX idx_dsr_requested_at (requested_at)
);

-- Personal data inventory for GDPR compliance
CREATE TABLE personal_data_inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name VARCHAR(255) NOT NULL,
    column_name VARCHAR(255) NOT NULL,
    data_category VARCHAR(100) NOT NULL, -- 'identity', 'contact', 'behavioral', 'technical'
    sensitivity_level VARCHAR(50) NOT NULL, -- 'low', 'medium', 'high', 'critical'
    legal_basis VARCHAR(100), -- 'consent', 'contract', 'legal_obligation', 'legitimate_interest'
    retention_policy_id UUID REFERENCES data_retention_policies(id),
    pseudonymization_method VARCHAR(100), -- 'hash', 'encrypt', 'tokenize', 'none'
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    UNIQUE(table_name, column_name),
    INDEX idx_pdi_table (table_name),
    INDEX idx_pdi_category (data_category),
    INDEX idx_pdi_sensitivity (sensitivity_level)
);

-- Hash chain integrity tracking
CREATE TABLE hash_chain_state (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chain_name VARCHAR(100) NOT NULL UNIQUE,
    last_hash VARCHAR(64) NOT NULL,
    last_sequence_number BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    INDEX idx_hash_chain_name (chain_name)
);

-- Initialize the main audit log hash chain
INSERT INTO hash_chain_state (chain_name, last_hash, last_sequence_number)
VALUES ('audit_logs', '0000000000000000000000000000000000000000000000000000000000000000', 0);

-- Compliance reports metadata
CREATE TABLE compliance_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_type VARCHAR(100) NOT NULL, -- 'sox', 'gdpr', 'hipaa', 'custom'
    title VARCHAR(255) NOT NULL,
    description TEXT,
    reporting_period_start DATE NOT NULL,
    reporting_period_end DATE NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'draft', -- 'draft', 'generating', 'ready', 'archived'
    template_version VARCHAR(50),
    generated_by VARCHAR(255) NOT NULL,
    reviewed_by VARCHAR(255),
    approved_by VARCHAR(255),
    file_path VARCHAR(500),
    file_size BIGINT,
    file_hash VARCHAR(64),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    generated_at TIMESTAMP WITH TIME ZONE,
    reviewed_at TIMESTAMP WITH TIME ZONE,
    approved_at TIMESTAMP WITH TIME ZONE,
    
    INDEX idx_compliance_reports_type (report_type),
    INDEX idx_compliance_reports_status (status),
    INDEX idx_compliance_reports_period (reporting_period_start, reporting_period_end)
);

-- Audit event types enumeration for consistency
CREATE TABLE audit_event_types (
    event_type VARCHAR(100) PRIMARY KEY,
    description TEXT NOT NULL,
    entity_types TEXT[] NOT NULL, -- Array of applicable entity types
    required_fields TEXT[] NOT NULL DEFAULT '{}', -- Required fields in details JSON
    retention_days INTEGER NOT NULL DEFAULT 2555, -- 7 years default
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Insert standard audit event types
INSERT INTO audit_event_types (event_type, description, entity_types, required_fields, retention_days) VALUES
('model.created', 'Model registration', ARRAY['model'], ARRAY['name', 'group', 'risk_tier'], 2555),
('model.updated', 'Model metadata update', ARRAY['model'], ARRAY['changes'], 2555),
('model.deleted', 'Model deletion', ARRAY['model'], ARRAY['reason'], 2555),
('version.created', 'Model version creation', ARRAY['model_version'], ARRAY['version', 'commit_sha'], 2555),
('version.state_changed', 'Version state transition', ARRAY['model_version'], ARRAY['from_state', 'to_state', 'reason'], 2555),
('artifact.uploaded', 'Artifact upload', ARRAY['artifact'], ARRAY['type', 'size', 'sha256'], 2555),
('artifact.downloaded', 'Artifact download', ARRAY['artifact'], ARRAY['type'], 1095),
('approval.created', 'Approval request', ARRAY['approval'], ARRAY['role', 'version_id'], 2555),
('approval.updated', 'Approval decision', ARRAY['approval'], ARRAY['status', 'comments'], 2555),
('policy.evaluated', 'Policy evaluation', ARRAY['policy_evaluation'], ARRAY['policy_id', 'result'], 2555),
('evaluation.started', 'Evaluation job started', ARRAY['evaluation_job'], ARRAY['suite_id'], 2555),
('evaluation.completed', 'Evaluation job completed', ARRAY['evaluation_job'], ARRAY['status', 'results'], 2555),
('deployment.created', 'Deployment initiated', ARRAY['deployment'], ARRAY['environment', 'strategy'], 2555),
('deployment.updated', 'Deployment configuration changed', ARRAY['deployment'], ARRAY['changes'], 2555),
('deployment.rollback', 'Deployment rollback', ARRAY['rollback_operation'], ARRAY['reason', 'target_version'], 2555),
('user.login', 'User authentication', ARRAY['user'], ARRAY['method'], 365),
('user.logout', 'User session end', ARRAY['user'], ARRAY[], 365),
('user.permission_changed', 'User role/permission change', ARRAY['user'], ARRAY['old_roles', 'new_roles'], 2555),
('data.accessed', 'Sensitive data access', ARRAY['*'], ARRAY['resource', 'operation'], 2555),
('data.exported', 'Data export operation', ARRAY['*'], ARRAY['format', 'records_count'], 2555),
('system.backup', 'System backup operation', ARRAY['system'], ARRAY['type', 'status'], 2555),
('system.restore', 'System restore operation', ARRAY['system'], ARRAY['backup_id', 'status'], 2555);

-- Function to calculate hash for audit log entry
CREATE OR REPLACE FUNCTION calculate_audit_hash(
    p_event_type VARCHAR,
    p_entity_type VARCHAR,
    p_entity_id VARCHAR,
    p_user_id VARCHAR,
    p_action VARCHAR,
    p_details JSONB,
    p_timestamp TIMESTAMP WITH TIME ZONE,
    p_previous_hash VARCHAR
) RETURNS VARCHAR AS $$
DECLARE
    hash_input TEXT;
BEGIN
    -- Concatenate all fields in a deterministic order
    hash_input := COALESCE(p_event_type, '') || '|' ||
                  COALESCE(p_entity_type, '') || '|' ||
                  COALESCE(p_entity_id, '') || '|' ||
                  COALESCE(p_user_id, '') || '|' ||
                  COALESCE(p_action, '') || '|' ||
                  COALESCE(p_details::TEXT, '{}') || '|' ||
                  COALESCE(p_timestamp::TEXT, '') || '|' ||
                  COALESCE(p_previous_hash, '');
    
    -- Return SHA256 hash
    RETURN encode(digest(hash_input, 'sha256'), 'hex');
END;
$$ LANGUAGE plpgsql;

-- Trigger function to automatically set hash chain for audit logs
CREATE OR REPLACE FUNCTION set_audit_log_hash() RETURNS TRIGGER AS $$
DECLARE
    prev_hash VARCHAR(64);
    new_hash VARCHAR(64);
BEGIN
    -- Get the last hash from the chain
    SELECT last_hash INTO prev_hash
    FROM hash_chain_state
    WHERE chain_name = 'audit_logs'
    FOR UPDATE;
    
    -- Calculate new hash
    new_hash := calculate_audit_hash(
        NEW.event_type,
        NEW.entity_type,
        NEW.entity_id,
        NEW.user_id,
        NEW.action,
        NEW.details,
        NEW.timestamp,
        prev_hash
    );
    
    -- Set the hash values
    NEW.previous_hash := prev_hash;
    NEW.current_hash := new_hash;
    
    -- Update the chain state
    UPDATE hash_chain_state
    SET last_hash = new_hash,
        last_sequence_number = last_sequence_number + 1,
        updated_at = NOW()
    WHERE chain_name = 'audit_logs';
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for audit log hash chain
CREATE TRIGGER trigger_audit_log_hash
    BEFORE INSERT ON audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION set_audit_log_hash();

-- Function to verify hash chain integrity
CREATE OR REPLACE FUNCTION verify_audit_chain_integrity(
    start_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    end_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NULL
) RETURNS TABLE (
    is_valid BOOLEAN,
    total_records BIGINT,
    invalid_records BIGINT,
    first_invalid_id UUID,
    error_message TEXT
) AS $$
DECLARE
    rec RECORD;
    expected_hash VARCHAR(64);
    prev_hash VARCHAR(64) := '0000000000000000000000000000000000000000000000000000000000000000';
    invalid_count BIGINT := 0;
    total_count BIGINT := 0;
    first_invalid UUID := NULL;
BEGIN
    -- Set default timestamps if not provided
    start_timestamp := COALESCE(start_timestamp, '1970-01-01'::TIMESTAMP WITH TIME ZONE);
    end_timestamp := COALESCE(end_timestamp, NOW());
    
    -- Iterate through audit logs in chronological order
    FOR rec IN
        SELECT id, event_type, entity_type, entity_id, user_id, action, details, timestamp, previous_hash, current_hash
        FROM audit_logs
        WHERE timestamp BETWEEN start_timestamp AND end_timestamp
        ORDER BY timestamp, id
    LOOP
        total_count := total_count + 1;
        
        -- Calculate expected hash
        expected_hash := calculate_audit_hash(
            rec.event_type,
            rec.entity_type,
            rec.entity_id,
            rec.user_id,
            rec.action,
            rec.details,
            rec.timestamp,
            prev_hash
        );
        
        -- Check if hash matches and previous hash is correct
        IF rec.current_hash != expected_hash OR rec.previous_hash != prev_hash THEN
            invalid_count := invalid_count + 1;
            IF first_invalid IS NULL THEN
                first_invalid := rec.id;
            END IF;
        END IF;
        
        prev_hash := rec.current_hash;
    END LOOP;
    
    RETURN QUERY SELECT
        invalid_count = 0,
        total_count,
        invalid_count,
        first_invalid,
        CASE
            WHEN invalid_count = 0 THEN 'Hash chain integrity verified'
            ELSE 'Hash chain integrity compromised - ' || invalid_count || ' invalid records found'
        END;
END;
$$ LANGUAGE plpgsql;

-- Create indexes for performance
CREATE INDEX CONCURRENTLY idx_audit_logs_composite ON audit_logs (entity_type, entity_id, timestamp DESC);
CREATE INDEX CONCURRENTLY idx_audit_logs_user_action ON audit_logs (user_id, action, timestamp DESC);

-- Grant permissions (adjust as needed for your user roles)
-- GRANT SELECT ON audit_logs TO auditor_role;
-- GRANT SELECT ON evidence_bundles TO auditor_role;
-- GRANT ALL ON data_retention_policies TO admin_role;
-- GRANT ALL ON data_subject_requests TO privacy_officer_role;