-- ============================================
-- CRM V2 Migration: Multi-pipeline, Files, Tasks, Enhanced Contacts
-- ============================================

-- 1. Add new fields to crm_contacts
ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS address text DEFAULT '';
ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS whatsapp text DEFAULT '';
ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS zoom_link text DEFAULT '';
ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS website text DEFAULT '';
ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS linkedin text DEFAULT '';
ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS pipeline_id uuid REFERENCES crm_pipelines(id);

-- 2. CRM Files
CREATE TABLE IF NOT EXISTS crm_files (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES crm_contacts(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_size integer DEFAULT 0,
  file_type text DEFAULT '',
  uploaded_by text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_files_client ON crm_files(client_id);
CREATE INDEX IF NOT EXISTS idx_crm_files_contact ON crm_files(contact_id);
ALTER TABLE crm_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on crm_files" ON crm_files
  FOR ALL USING (true) WITH CHECK (true);

-- 3. CRM Tasks
CREATE TABLE IF NOT EXISTS crm_tasks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES crm_contacts(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  description text DEFAULT '',
  due_date timestamptz,
  assigned_to text DEFAULT '',
  completed boolean DEFAULT false,
  completed_at timestamptz,
  priority text DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_tasks_client ON crm_tasks(client_id);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_contact ON crm_tasks(contact_id);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_due ON crm_tasks(due_date);
ALTER TABLE crm_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on crm_tasks" ON crm_tasks
  FOR ALL USING (true) WITH CHECK (true);

-- 4. Update crm_activities to support file attachments
ALTER TABLE crm_activities ADD COLUMN IF NOT EXISTS file_url text DEFAULT '';
ALTER TABLE crm_activities ADD COLUMN IF NOT EXISTS scheduled_at timestamptz;

-- 5. Insert default pipeline for each client that doesn't have one
INSERT INTO crm_pipelines (client_id, name, stages, is_default)
SELECT id, 'Default Pipeline', '[
  {"key": "lead", "label": "Lead", "color": "#6366F1"},
  {"key": "contacted", "label": "Contacted", "color": "#F59E0B"},
  {"key": "qualified", "label": "Qualified", "color": "#3B82F6"},
  {"key": "proposal", "label": "Proposal", "color": "#8B5CF6"},
  {"key": "negotiation", "label": "Negotiation", "color": "#EC4899"},
  {"key": "won", "label": "Won", "color": "#10B981"},
  {"key": "lost", "label": "Lost", "color": "#EF4444"}
]'::jsonb, true
FROM clients
WHERE id NOT IN (SELECT client_id FROM crm_pipelines);
