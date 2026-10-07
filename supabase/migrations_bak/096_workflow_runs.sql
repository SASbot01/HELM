-- 096_workflow_runs.sql
--
-- Tablas de ejecución del motor de workflows v2 (api/lib/workflowEngine.js).
-- Las tablas EXISTEN ya en producción (creadas out-of-band cuando se montó
-- el visual builder en /ia/workflows), pero faltaba la migración versionada.
-- Idempotente — CREATE TABLE IF NOT EXISTS para no chocar con prod.
--
-- Modelo:
--   workflow_runs            → 1 fila por ejecución (status, contexto, resultado)
--   workflow_run_steps       → 1 fila por paso ejecutado (output, error, tiempos)
--   workflow_delayed_steps   → cola de pasos que esperan resume (wait/delay)
--
-- RLS: service-role only — los workflows no se ejecutan en contexto de
-- usuario, los lee/escribe el motor con service key.

-- ── workflow_runs ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workflow_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id     UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  client_id       UUID NOT NULL REFERENCES clients(id)   ON DELETE CASCADE,
  contact_id      UUID,
  status          TEXT NOT NULL DEFAULT 'pending',
    -- pending | running | completed | failed | waiting | cancelled
  trigger_data    JSONB DEFAULT '{}'::jsonb,
  context         JSONB DEFAULT '{}'::jsonb,
  current_node_id TEXT,
  error           TEXT,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow_id ON workflow_runs(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_client_id   ON workflow_runs(client_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_status      ON workflow_runs(status) WHERE status IN ('running', 'waiting');

-- ── workflow_run_steps ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workflow_run_steps (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id        UUID NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  node_id       TEXT NOT NULL,
  node_type     TEXT,        -- trigger | action | condition | delay
  action_type   TEXT,        -- send_whatsapp | send_email | if_else | wait_delay | …
  status        TEXT NOT NULL DEFAULT 'pending',
    -- pending | running | completed | failed | waiting | skipped
  input         JSONB,
  output        JSONB,
  error         TEXT,
  started_at    TIMESTAMPTZ DEFAULT now(),
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workflow_run_steps_run_id ON workflow_run_steps(run_id, started_at);

-- ── workflow_delayed_steps ────────────────────────────────────────────────
-- Cola de pasos en wait/delay. El cron /api/workflow?action=resume-delayed
-- debe recoger filas con resume_at <= now() y reanudar la ejecución.
CREATE TABLE IF NOT EXISTS workflow_delayed_steps (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id        UUID NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  workflow_id   UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  client_id     UUID NOT NULL REFERENCES clients(id)   ON DELETE CASCADE,
  node_id       TEXT NOT NULL,
  delay_type    TEXT NOT NULL DEFAULT 'delay',
  resume_at     TIMESTAMPTZ NOT NULL,
  context       JSONB DEFAULT '{}'::jsonb,
  resumed_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workflow_delayed_resume ON workflow_delayed_steps(resume_at) WHERE resumed_at IS NULL;

-- ── workflows table extensions ─────────────────────────────────────────────
-- v2 columns: nodes/edges JSON, version flag.
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS nodes   JSONB DEFAULT '[]'::jsonb;
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS edges   JSONB DEFAULT '[]'::jsonb;
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS version INT   NOT NULL DEFAULT 2;

-- ── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE workflow_runs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_run_steps       ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_delayed_steps   ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS automáticamente. No definimos políticas user-
-- level: los workflows son backend-only y el visual builder usa /api/workflow
-- con SUPABASE_SERVICE_KEY.
