-- AI Model Registry Model Cards Table
-- Migration: 004_add_model_cards_table
-- Description: Create table for storing generated model cards

-- Model cards table
CREATE TABLE model_cards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  model_id UUID NOT NULL REFERENCES models(id) ON DELETE CASCADE,
  version_id UUID NOT NULL REFERENCES model_versions(id) ON DELETE CASCADE,
  version VARCHAR(20) NOT NULL,
  content JSONB NOT NULL,
  generated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  -- Constraints
  CONSTRAINT model_cards_content_not_empty CHECK (jsonb_typeof(content) = 'object'),
  
  -- Unique constraint to ensure one model card per version
  UNIQUE(version_id)
);

-- Indexes for model cards table
CREATE INDEX idx_model_cards_model_id ON model_cards(model_id);
CREATE INDEX idx_model_cards_version_id ON model_cards(version_id);
CREATE INDEX idx_model_cards_generated_at ON model_cards(generated_at);
CREATE INDEX idx_model_cards_content ON model_cards USING GIN(content);

-- Apply audit trigger to model cards table
CREATE TRIGGER audit_model_cards_trigger
  AFTER INSERT OR UPDATE OR DELETE ON model_cards
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();