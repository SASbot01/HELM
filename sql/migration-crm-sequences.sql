-- Phase 1: CRM Sequences + Agent Conversations link to contacts
-- Run this migration to add sequence automation and conversation tracking

-- ═══════════════════════════════════════════════════════════════════
-- 1. CRM Sequences — automated follow-up sequences tied to pipeline stages
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS crm_sequences (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  pipeline_id uuid REFERENCES crm_pipelines(id) ON DELETE SET NULL,
  stage_key text NOT NULL,
  name text NOT NULL,
  steps jsonb NOT NULL DEFAULT '[]',
  -- steps format: [{ "delay_hours": 24, "channel": "email"|"whatsapp"|"instagram", "subject": "", "content": "..." }]
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_sequences_client ON crm_sequences(client_id);
CREATE INDEX IF NOT EXISTS idx_crm_sequences_pipeline ON crm_sequences(pipeline_id, stage_key);

ALTER TABLE crm_sequences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_sequences_all" ON crm_sequences FOR ALL USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════════
-- 2. CRM Sequence Enrollments — tracks which contacts are in which sequences
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS crm_sequence_enrollments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  sequence_id uuid NOT NULL REFERENCES crm_sequences(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES crm_contacts(id) ON DELETE CASCADE,
  current_step integer DEFAULT 0,
  status text DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'exited')),
  next_action_at timestamptz,
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  UNIQUE(sequence_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_enrollments_client ON crm_sequence_enrollments(client_id);
CREATE INDEX IF NOT EXISTS idx_crm_enrollments_sequence ON crm_sequence_enrollments(sequence_id);
CREATE INDEX IF NOT EXISTS idx_crm_enrollments_contact ON crm_sequence_enrollments(contact_id);
CREATE INDEX IF NOT EXISTS idx_crm_enrollments_next_action ON crm_sequence_enrollments(next_action_at) WHERE status = 'active';

ALTER TABLE crm_sequence_enrollments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_sequence_enrollments_all" ON crm_sequence_enrollments FOR ALL USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════════
-- 3. Link agent conversations to CRM contacts
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE agent_conversations ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES crm_contacts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_agent_conversations_contact ON agent_conversations(contact_id);
