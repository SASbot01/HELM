-- ============================================
-- Workflows V2: graph-based execution, run tracking, delayed steps, webhook triggers
-- ============================================

-- 1. Expand workflows table for graph model
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS nodes jsonb DEFAULT '[]';
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS edges jsonb DEFAULT '[]';
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS version int DEFAULT 1;
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS folder text DEFAULT '';
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS description text DEFAULT '';

-- 2. Workflow run tracking
CREATE TABLE IF NOT EXISTS workflow_runs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  workflow_id uuid NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES crm_contacts(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed','cancelled','waiting')),
  trigger_data jsonb DEFAULT '{}',
  context jsonb DEFAULT '{}',
  current_node_id text,
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  error text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow ON workflow_runs(workflow_id, status);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_client ON workflow_runs(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_contact ON workflow_runs(contact_id);
ALTER TABLE workflow_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on workflow_runs" ON workflow_runs FOR ALL USING (true) WITH CHECK (true);

-- 3. Step-level execution log
CREATE TABLE IF NOT EXISTS workflow_run_steps (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  node_id text NOT NULL,
  node_type text NOT NULL,
  action_type text DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','completed','failed','skipped','waiting')),
  input jsonb DEFAULT '{}',
  output jsonb DEFAULT '{}',
  error text,
  started_at timestamptz,
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_wf_run_steps_run ON workflow_run_steps(run_id);
ALTER TABLE workflow_run_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on workflow_run_steps" ON workflow_run_steps FOR ALL USING (true) WITH CHECK (true);

-- 4. Delayed / waiting steps (for wait_delay and wait_event)
CREATE TABLE IF NOT EXISTS workflow_delayed_steps (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  workflow_id uuid NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  node_id text NOT NULL,
  delay_type text NOT NULL CHECK (delay_type IN ('delay','event')),
  resume_at timestamptz,
  wait_event text,
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','resumed','expired','cancelled')),
  context jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wf_delayed_status ON workflow_delayed_steps(status, resume_at);
ALTER TABLE workflow_delayed_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on workflow_delayed_steps" ON workflow_delayed_steps FOR ALL USING (true) WITH CHECK (true);

-- 5. Inbound webhook triggers
CREATE TABLE IF NOT EXISTS workflow_webhook_triggers (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  workflow_id uuid NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  webhook_key text NOT NULL UNIQUE,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wf_webhook_key ON workflow_webhook_triggers(webhook_key);
ALTER TABLE workflow_webhook_triggers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on workflow_webhook_triggers" ON workflow_webhook_triggers FOR ALL USING (true) WITH CHECK (true);
