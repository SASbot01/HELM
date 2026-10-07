-- 078_mid_events.sql
-- Calendario de eventos / clases en directo del Infoproducto.
--
-- Cada evento representa una clase Zoom (u otro link de directo) programada.
-- Cuando termina y el admin sube la grabación, opcionalmente puede empujar
-- esa grabación como una training_lessons dentro del módulo de Formación
-- que el admin elija — el FK recording_lesson_id apunta a esa lesson creada
-- automáticamente para mantener la trazabilidad.

CREATE TABLE IF NOT EXISTS mid_events (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_slug          TEXT NOT NULL,
  title                TEXT NOT NULL,
  description          TEXT,
  start_at             TIMESTAMPTZ NOT NULL,
  end_at               TIMESTAMPTZ,                       -- opcional; si vacío UI muestra +1h
  zoom_url             TEXT,                              -- link de la clase en directo
  recording_url        TEXT,                              -- link de la grabación post-clase
  recording_lesson_id  UUID REFERENCES training_lessons(id) ON DELETE SET NULL,
  created_by           UUID REFERENCES infoproducto_users(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS mid_events_tenant_start_idx
  ON mid_events (tenant_slug, start_at);

COMMENT ON TABLE mid_events IS
  'Calendario de clases en directo del Infoproducto. recording_lesson_id se rellena cuando el admin empuja la grabación a Formación.';

COMMENT ON COLUMN mid_events.recording_lesson_id IS
  'FK a training_lessons creada automáticamente al empujar la grabación a un módulo de Formación. NULL si el evento no se ha grabado / no se ha empujado.';
