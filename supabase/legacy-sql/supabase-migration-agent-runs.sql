-- ============================================
-- Migration: Agent Runs Tracking
-- Tracks AI agent executions and their results
-- ============================================

-- Agent Runs — tracks each execution of any AI agent
CREATE TABLE IF NOT EXISTS agent_runs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  agent_type text NOT NULL DEFAULT 'prospector' CHECK (agent_type IN ('prospector', 'personalizer', 'enricher')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  config jsonb DEFAULT '{}',
  results_summary jsonb DEFAULT '{}',
  logs text DEFAULT '[]',
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_client ON agent_runs(client_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_type ON agent_runs(agent_type);
CREATE INDEX IF NOT EXISTS idx_agent_runs_status ON agent_runs(status);
ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on agent_runs" ON agent_runs
  FOR ALL USING (true) WITH CHECK (true);
