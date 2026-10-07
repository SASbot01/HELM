-- 046_task_pipelines.sql
-- Pipelines + etapas editables para Task Management.
-- Cada cliente puede tener múltiples pipelines (tableros) y dentro de cada uno
-- N stages personalizables (nombre, color, posición, terminal). El campo
-- `crm_tasks.status` se mantiene por compatibilidad — se espeja desde
-- task_stages.key cuando una tarea cambia de stage.
-- Idempotente: ON CONFLICT en seeds.

-- ───────── 1. Tablas ─────────
CREATE TABLE IF NOT EXISTS task_pipelines (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  is_default  BOOLEAN NOT NULL DEFAULT false,
  position    INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT task_pipelines_client_name_uniq UNIQUE (client_id, name)
);

CREATE INDEX IF NOT EXISTS task_pipelines_client_idx ON task_pipelines(client_id);

CREATE TABLE IF NOT EXISTS task_stages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id  UUID NOT NULL REFERENCES task_pipelines(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  key          TEXT NOT NULL,
  position     INT NOT NULL DEFAULT 0,
  color        TEXT NOT NULL DEFAULT '#71717a',
  is_terminal  BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT task_stages_pipeline_key_uniq UNIQUE (pipeline_id, key)
);

CREATE INDEX IF NOT EXISTS task_stages_pipeline_idx ON task_stages(pipeline_id);

-- ───────── 2. crm_tasks: añadir pipeline + stage ─────────
ALTER TABLE crm_tasks
  ADD COLUMN IF NOT EXISTS pipeline_id UUID REFERENCES task_pipelines(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS stage_id    UUID REFERENCES task_stages(id)    ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS crm_tasks_pipeline_idx ON crm_tasks(pipeline_id);
CREATE INDEX IF NOT EXISTS crm_tasks_stage_idx    ON crm_tasks(stage_id);

-- ───────── 3. Trigger: espejar stage.key -> crm_tasks.status ─────────
CREATE OR REPLACE FUNCTION sync_task_status_from_stage()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  stage_key TEXT;
  stage_terminal BOOLEAN;
BEGIN
  IF NEW.stage_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.stage_id IS DISTINCT FROM OLD.stage_id) THEN
    SELECT key, is_terminal INTO stage_key, stage_terminal
    FROM task_stages WHERE id = NEW.stage_id;
    IF stage_key IS NOT NULL THEN
      NEW.status := stage_key;
      NEW.completed := COALESCE(stage_terminal, false);
      IF stage_terminal AND NEW.completed_at IS NULL THEN
        NEW.completed_at := now();
      ELSIF NOT stage_terminal THEN
        NEW.completed_at := NULL;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_task_status_from_stage ON crm_tasks;
CREATE TRIGGER trg_sync_task_status_from_stage
  BEFORE INSERT OR UPDATE OF stage_id ON crm_tasks
  FOR EACH ROW EXECUTE FUNCTION sync_task_status_from_stage();

-- ───────── 4. Seed por cliente: pipeline default "Principal" + 4 stages ─────────
DO $$
DECLARE
  c RECORD;
  pid UUID;
BEGIN
  FOR c IN SELECT id FROM clients LOOP
    -- pipeline default "Principal"
    INSERT INTO task_pipelines (client_id, name, is_default, position)
    VALUES (c.id, 'Principal', true, 0)
    ON CONFLICT (client_id, name) DO UPDATE SET is_default = true
    RETURNING id INTO pid;

    IF pid IS NULL THEN
      SELECT id INTO pid FROM task_pipelines WHERE client_id = c.id AND name = 'Principal';
    END IF;

    -- stages base (idempotente por (pipeline_id, key))
    INSERT INTO task_stages (pipeline_id, name, key, position, color, is_terminal) VALUES
      (pid, 'Por Hacer',    'todo',         0, '#71717a', false),
      (pid, 'En Progreso',  'in_progress',  1, '#fafafa', false),
      (pid, 'Revisión',     'review',       2, '#a1a1aa', false),
      (pid, 'Hecho',        'done',         3, '#4ade80', true)
    ON CONFLICT (pipeline_id, key) DO NOTHING;
  END LOOP;
END $$;

-- ───────── 5. RLS ─────────
ALTER TABLE task_pipelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_stages    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS task_pipelines_all ON task_pipelines;
CREATE POLICY task_pipelines_all ON task_pipelines FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS task_stages_all ON task_stages;
CREATE POLICY task_stages_all ON task_stages FOR ALL USING (true) WITH CHECK (true);
