-- 058 · task_sprints — persiste sprints en DB (antes vivían en localStorage)
--
-- Razón: hasta ahora los sprints del Task Management se guardaban en
-- localStorage del browser, lo que rompía multi-device, multi-usuario y
-- hacía imposible eliminarlos manualmente desde admin/server.
--
-- Esquema:
--   task_sprints      — sprints por cliente
--   crm_tasks.sprint_id  — FK opcional a task_sprints (ON DELETE SET NULL)
--
-- Idempotente. Re-ejecutar es seguro.
-- ROLLBACK:
--   ALTER TABLE crm_tasks DROP COLUMN IF EXISTS sprint_id;
--   DROP TABLE IF EXISTS task_sprints;

CREATE TABLE IF NOT EXISTS task_sprints (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  goal        TEXT DEFAULT '',
  start_date  DATE,
  end_date    DATE,
  status      TEXT NOT NULL DEFAULT 'planned'
              CHECK (status IN ('planned','active','completed','cancelled')),
  feedback    TEXT DEFAULT '',
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_sprints_client ON task_sprints(client_id);
CREATE INDEX IF NOT EXISTS idx_task_sprints_client_status ON task_sprints(client_id, status);

ALTER TABLE crm_tasks
  ADD COLUMN IF NOT EXISTS sprint_id UUID REFERENCES task_sprints(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_crm_tasks_sprint ON crm_tasks(sprint_id) WHERE sprint_id IS NOT NULL;

ALTER TABLE task_sprints DISABLE ROW LEVEL SECURITY;
