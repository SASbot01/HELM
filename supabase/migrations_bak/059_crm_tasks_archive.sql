-- 059 · crm_tasks_archive — histórico de tareas hechas (post-semana)
--
-- Razón: el dashboard se llena con todas las tareas en estado "done" y
-- pierde foco. Cuando termina la semana, las hechas se archivan a esta
-- tabla (cron diario 'archive-tasks') y el dashboard solo muestra:
--   - todas las no-done
--   - las done de la semana actual
--
-- Política: una tarea pasa a archive si completed=true AND completed_at <
-- startOfThisWeek(Europe/Madrid). startOfThisWeek = lunes 00:00 local.
--
-- Idempotente. Re-ejecutar es seguro.
-- ROLLBACK: DROP TABLE IF EXISTS crm_tasks_archive;

CREATE TABLE IF NOT EXISTS crm_tasks_archive (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_id     UUID,                         -- id original en crm_tasks (informacional)
  client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  contact_id      UUID,
  title           TEXT NOT NULL,
  description     TEXT,
  due_date        TIMESTAMPTZ,
  assigned_to     TEXT,
  completed       BOOLEAN NOT NULL DEFAULT true,
  completed_at    TIMESTAMPTZ,
  priority        TEXT,
  category        TEXT,
  status          TEXT,
  estimated_hours NUMERIC,
  actual_hours    NUMERIC,
  notes           TEXT,
  video_url       TEXT,
  roadmap_id      UUID,
  pipeline_id     UUID,
  stage_id        UUID,
  sprint_id       UUID,                         -- referencia laxa (sprint puede haber sido borrado)
  sprint_name     TEXT,                         -- snapshot del nombre del sprint al archivar
  archived_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  archive_week    DATE NOT NULL,                -- lunes 00:00 Europe/Madrid de la semana ARCHIVADA
  archived_by     TEXT NOT NULL DEFAULT 'cron'  -- 'cron' | <user email/id>
);

CREATE INDEX IF NOT EXISTS idx_crm_tasks_archive_client_week
  ON crm_tasks_archive(client_id, archive_week DESC);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_archive_assigned
  ON crm_tasks_archive(client_id, assigned_to);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_archive_sprint
  ON crm_tasks_archive(sprint_id) WHERE sprint_id IS NOT NULL;

ALTER TABLE crm_tasks_archive DISABLE ROW LEVEL SECURITY;
