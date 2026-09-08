-- 057 · WhatsApp broadcast persistente — kill-switch + log por destinatario
--
-- Modelo:
--   bulk_send_jobs        — un job (un envío masivo). Estado pausable.
--   bulk_send_recipients  — un row por contacto. Estado individual sent/failed/pending.
--
-- Flujo:
--   1) UI POST /api/bulk-send?action=create → crea job + recipients (status=pending)
--   2) Cron /api/cron/process-bulk-sends cada minuto:
--      a) Lee jobs status='running'
--      b) Reserva atómicamente N recipients (por job) status pending → processing
--      c) Envía vía Enjambre WhatsApp /api/whatsapp/send con throttling
--      d) Marca sent/failed
--   3) UI puede pause/resume/abort en cualquier momento → cron respeta el flag
--
-- Idempotente. Re-ejecutar es seguro.
-- ROLLBACK: DROP TABLE IF EXISTS bulk_send_recipients; DROP TABLE IF EXISTS bulk_send_jobs;

CREATE TABLE IF NOT EXISTS bulk_send_jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  created_by      UUID REFERENCES team(id) ON DELETE SET NULL,
  channel         TEXT NOT NULL DEFAULT 'whatsapp' CHECK (channel IN ('whatsapp')),
  account_index   INTEGER NOT NULL DEFAULT 1,
  message         TEXT NOT NULL,
  as_audio        BOOLEAN NOT NULL DEFAULT false,
  voice_id        TEXT,
  total           INTEGER NOT NULL DEFAULT 0,
  sent            INTEGER NOT NULL DEFAULT 0,
  failed          INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'running'
                  CHECK (status IN ('running','paused','aborted','completed')),
  segment         JSONB DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_bulk_send_jobs_client_status
  ON bulk_send_jobs(client_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS bulk_send_recipients (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id          UUID NOT NULL REFERENCES bulk_send_jobs(id) ON DELETE CASCADE,
  contact_id      UUID REFERENCES crm_contacts(id) ON DELETE SET NULL,
  phone           TEXT NOT NULL,
  name            TEXT,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','processing','sent','failed','skipped')),
  attempts        INTEGER NOT NULL DEFAULT 0,
  last_error      TEXT,
  sent_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bulk_send_recipients_job_status
  ON bulk_send_recipients(job_id, status);

CREATE INDEX IF NOT EXISTS idx_bulk_send_recipients_pending
  ON bulk_send_recipients(job_id) WHERE status = 'pending';

ALTER TABLE bulk_send_jobs DISABLE ROW LEVEL SECURITY;
ALTER TABLE bulk_send_recipients DISABLE ROW LEVEL SECURITY;
