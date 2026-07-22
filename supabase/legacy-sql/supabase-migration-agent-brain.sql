-- ============================================
-- Agent Brain — Learning System
-- Tablas para captura de decisiones, feedback humano, y aprendizajes
-- extraídos que alimentan de vuelta a los prompts de los agentes.
-- ============================================

-- Decisiones individuales de cada agente (cada respuesta, cada búsqueda, etc.)
CREATE TABLE IF NOT EXISTS agent_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
  client_slug text,
  contact_id uuid,
  agent_name text NOT NULL,           -- 'setter', 'prospector', 'orchestrator', 'setter_luka', etc.
  action_type text NOT NULL,          -- 'reply', 'search', 'enrich', 'outreach', etc.
  input jsonb,                        -- qué llegó al agente (user message, lead data, etc.)
  output jsonb,                       -- qué produjo (texto respuesta, leads, etc.)
  context jsonb,                      -- contexto adicional (pipeline, profile del contacto)
  reasoning text,                     -- chain-of-thought si lo expone el agente
  model text,
  tokens_in int DEFAULT 0,
  tokens_out int DEFAULT 0,
  cost_usd numeric(10,6) DEFAULT 0,
  duration_ms int,
  session_id text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_decisions_client ON agent_decisions (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_decisions_agent ON agent_decisions (agent_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_decisions_contact ON agent_decisions (contact_id, created_at DESC);

-- Feedback humano (y métrico) sobre cada decisión
CREATE TABLE IF NOT EXISTS agent_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id uuid REFERENCES agent_decisions(id) ON DELETE CASCADE,
  verdict text NOT NULL,              -- 'good', 'bad', 'neutral'
  source text NOT NULL DEFAULT 'human', -- 'human', 'metric', 'system'
  notes text,
  user_email text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_feedback_decision ON agent_feedback (decision_id);
CREATE INDEX IF NOT EXISTS idx_agent_feedback_verdict ON agent_feedback (verdict, created_at DESC);

-- Aprendizajes extraídos — lo que se inyecta de vuelta en los prompts
CREATE TABLE IF NOT EXISTS agent_learnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE, -- NULL = global (todos los clientes)
  agent_name text NOT NULL,
  pattern_type text NOT NULL,         -- 'do', 'dont', 'prefer', 'avoid', 'context'
  pattern text NOT NULL,              -- el aprendizaje redactado para el prompt
  rationale text,                     -- por qué se dedujo (referencia a decisiones)
  confidence numeric(3,2) DEFAULT 0.50, -- 0.00 - 1.00
  source_decision_ids uuid[] DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'archived'
  times_applied int DEFAULT 0,
  last_applied_at timestamptz,
  approved_by text,
  approved_at timestamptz,
  rejected_by text,
  rejected_at timestamptz,
  rejection_reason text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_learnings_status ON agent_learnings (status, agent_name);
CREATE INDEX IF NOT EXISTS idx_agent_learnings_client ON agent_learnings (client_id, agent_name, status);

-- Métricas de rendimiento por agente (evolución en el tiempo)
CREATE TABLE IF NOT EXISTS agent_performance_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
  agent_name text NOT NULL,
  metric_name text NOT NULL,          -- 'reply_rate', 'approval_rate', 'good_feedback_pct', 'avg_cost'
  value numeric NOT NULL,
  period text NOT NULL,               -- 'daily', 'weekly', 'monthly'
  period_start date NOT NULL,
  sample_size int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE (client_id, agent_name, metric_name, period, period_start)
);

-- Snapshots de evolución (foto semanal del cerebro)
CREATE TABLE IF NOT EXISTS agent_evolution_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
  agent_name text NOT NULL,
  snapshot_date date NOT NULL,
  metrics jsonb,                      -- accuracy, cost, conversion, etc.
  approved_learnings_count int DEFAULT 0,
  pending_learnings_count int DEFAULT 0,
  rejected_learnings_count int DEFAULT 0,
  top_patterns jsonb,                 -- los 10 aprendizajes más aplicados
  notes text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (client_id, agent_name, snapshot_date)
);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_agent_learnings_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_agent_learnings_updated_at ON agent_learnings;
CREATE TRIGGER trg_agent_learnings_updated_at
  BEFORE UPDATE ON agent_learnings
  FOR EACH ROW EXECUTE FUNCTION update_agent_learnings_timestamp();

-- RLS: permitir todo al service_role (enjambre-api y panel admin); opcional ajustar por cliente más adelante.
-- Enlaza crm_messages ↔ agent_decisions para poder dar feedback desde la vista CRM
ALTER TABLE crm_messages ADD COLUMN IF NOT EXISTS agent_decision_id uuid REFERENCES agent_decisions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_crm_messages_agent_decision ON crm_messages (agent_decision_id) WHERE agent_decision_id IS NOT NULL;

ALTER TABLE agent_decisions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_feedback           ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_learnings          ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_performance_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_evolution_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role all" ON agent_decisions;
CREATE POLICY "service_role all" ON agent_decisions
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role all" ON agent_feedback;
CREATE POLICY "service_role all" ON agent_feedback
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role all" ON agent_learnings;
CREATE POLICY "service_role all" ON agent_learnings
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role all" ON agent_performance_metrics;
CREATE POLICY "service_role all" ON agent_performance_metrics
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role all" ON agent_evolution_snapshots;
CREATE POLICY "service_role all" ON agent_evolution_snapshots
  FOR ALL USING (true) WITH CHECK (true);
