-- ============================================
-- Workflows — event-driven automations per client.
-- Each row is an on/off rule: "when <trigger> happens (matching <conditions>),
-- run <actions>". Engine is invoked from the webhook/event dispatchers.
-- ============================================

CREATE TABLE IF NOT EXISTS workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  trigger text NOT NULL,                 -- e.g. 'instagram_message_received', 'whatsapp_message_received', 'email_sent'
  conditions jsonb DEFAULT '{}'::jsonb,  -- optional filters: { pipeline_id, tag, keyword, ... }
  actions jsonb DEFAULT '[]'::jsonb,     -- ordered: [{ type:'assign_stage', stage_id:'...' }, ...]
  enabled boolean NOT NULL DEFAULT true,
  last_run_at timestamptz,
  run_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workflows_client_trigger ON workflows (client_id, trigger) WHERE enabled;
CREATE INDEX IF NOT EXISTS idx_workflows_client ON workflows (client_id);

ALTER TABLE workflows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role all" ON workflows;
CREATE POLICY "service_role all" ON workflows FOR ALL USING (true) WITH CHECK (true);
