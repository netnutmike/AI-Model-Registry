-- Migration: Add deployment tables
-- Description: Creates tables for deployment management, traffic splitting, monitoring, and rollback operations

-- Deployments table
CREATE TABLE deployments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version_id UUID NOT NULL REFERENCES model_versions(id) ON DELETE CASCADE,
    environment VARCHAR(20) NOT NULL CHECK (environment IN ('staging', 'production', 'canary')),
    status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'deploying', 'active', 'failed', 'rolling_back', 'rolled_back', 'terminated')),
    strategy VARCHAR(20) NOT NULL CHECK (strategy IN ('blue_green', 'canary', 'rolling')),
    configuration JSONB NOT NULL,
    traffic_split JSONB,
    slo_targets JSONB NOT NULL,
    drift_thresholds JSONB NOT NULL,
    deployed_by UUID NOT NULL REFERENCES users(id),
    deployed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Traffic splits table
CREATE TABLE traffic_splits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deployment_id UUID NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
    percentage INTEGER NOT NULL CHECK (percentage >= 0 AND percentage <= 100),
    started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Deployment metrics table
CREATE TABLE deployment_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deployment_id UUID NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    availability DECIMAL(5,2) NOT NULL CHECK (availability >= 0 AND availability <= 100),
    latency_p95 INTEGER NOT NULL CHECK (latency_p95 >= 0),
    latency_p99 INTEGER NOT NULL CHECK (latency_p99 >= 0),
    error_rate DECIMAL(5,2) NOT NULL CHECK (error_rate >= 0 AND error_rate <= 100),
    input_drift DECIMAL(5,2) CHECK (input_drift >= 0),
    output_drift DECIMAL(5,2) CHECK (output_drift >= 0),
    performance_drift DECIMAL(5,2) CHECK (performance_drift >= 0),
    request_count INTEGER NOT NULL DEFAULT 0
);

-- Deployment alerts table
CREATE TABLE deployment_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deployment_id UUID NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
    type VARCHAR(30) NOT NULL CHECK (type IN ('slo_breach', 'drift_detected', 'high_error_rate', 'high_latency', 'low_availability')),
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
    message TEXT NOT NULL,
    threshold DECIMAL(10,2) NOT NULL,
    actual_value DECIMAL(10,2) NOT NULL,
    triggered_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMP WITH TIME ZONE,
    acknowledged BOOLEAN NOT NULL DEFAULT FALSE
);

-- Rollback operations table
CREATE TABLE rollback_operations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deployment_id UUID NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
    target_version_id UUID NOT NULL REFERENCES model_versions(id),
    reason TEXT NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
    initiated_by UUID NOT NULL REFERENCES users(id),
    initiated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT
);

-- Indexes for performance
CREATE INDEX idx_deployments_version_id ON deployments(version_id);
CREATE INDEX idx_deployments_environment ON deployments(environment);
CREATE INDEX idx_deployments_status ON deployments(status);
CREATE INDEX idx_deployments_deployed_at ON deployments(deployed_at);

CREATE INDEX idx_traffic_splits_deployment_id ON traffic_splits(deployment_id);
CREATE INDEX idx_traffic_splits_started_at ON traffic_splits(started_at);

CREATE INDEX idx_deployment_metrics_deployment_id ON deployment_metrics(deployment_id);
CREATE INDEX idx_deployment_metrics_timestamp ON deployment_metrics(timestamp);

CREATE INDEX idx_deployment_alerts_deployment_id ON deployment_alerts(deployment_id);
CREATE INDEX idx_deployment_alerts_triggered_at ON deployment_alerts(triggered_at);
CREATE INDEX idx_deployment_alerts_severity ON deployment_alerts(severity);
CREATE INDEX idx_deployment_alerts_acknowledged ON deployment_alerts(acknowledged);

CREATE INDEX idx_rollback_operations_deployment_id ON rollback_operations(deployment_id);
CREATE INDEX idx_rollback_operations_initiated_at ON rollback_operations(initiated_at);
CREATE INDEX idx_rollback_operations_status ON rollback_operations(status);

-- Update triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_deployments_updated_at BEFORE UPDATE ON deployments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();