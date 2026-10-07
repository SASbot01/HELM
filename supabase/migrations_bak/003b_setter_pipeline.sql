-- Add setter_pipeline_id to whatsapp_config so the setter only responds
-- to contacts belonging to the selected pipeline
ALTER TABLE whatsapp_config
  ADD COLUMN IF NOT EXISTS setter_pipeline_id UUID REFERENCES crm_pipelines(id) ON DELETE SET NULL;
