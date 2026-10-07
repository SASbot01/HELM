-- ============================================
-- Lead-magnet landing: setter default stage key per channel.
-- - whatsapp_config already has setter_pipeline_id; add the stage.
-- - manychat_config (Instagram + WhatsApp via ManyChat) gets both.
-- The webhook/setter code lands a new lead on pipeline+stage on first reply.
-- ============================================

ALTER TABLE whatsapp_config
  ADD COLUMN IF NOT EXISTS setter_default_stage_key text;

ALTER TABLE manychat_config
  ADD COLUMN IF NOT EXISTS setter_pipeline_id uuid REFERENCES crm_pipelines(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS setter_default_stage_key text;

-- crm_contacts gets a stage_key so a contact can sit on a specific stage of
-- the pipeline (independent of the legacy `status` field used for kanban).
ALTER TABLE crm_contacts
  ADD COLUMN IF NOT EXISTS stage_key text;

CREATE INDEX IF NOT EXISTS idx_crm_contacts_pipeline_stage
  ON crm_contacts (pipeline_id, stage_key);
