-- 092_mid_lesson_grants.sql
-- Acceso por lección a nivel de user (modelo Members).
--
-- Contexto: la migration 091 introdujo `training_lessons.locked` para marcar
-- lecciones que requieren permiso antes de mostrar contenido. Hasta ahora el
-- único bypass era ser admin o que la lesson tuviera locked=false. Esta
-- migration añade dos mecanismos de grant que el panel Members puede usar:
--
--   1. `mid_route_subscriptions.full_access` (boolean) — atajo "este user
--      tiene acceso completo a toda la ruta" para los miembros que ya pagaron
--      la formación. Marcar true desbloquea TODAS las lessons locked de la
--      ruta de una sola vez. Es la primitiva que usa el admin para los
--      members heredados del lanzamiento.
--   2. `mid_lesson_grants` (tabla) — grant individual lesson-by-lesson para
--      el flujo nuevo: el visitante se inscribe gratis, ve la primera clase,
--      y el admin le desbloquea manualmente las siguientes cuando confirme
--      por DM de Instagram.
--
-- Estos dos mecanismos coexisten — la query de "unlocked?" hace OR de ambos.

ALTER TABLE mid_route_subscriptions
  ADD COLUMN IF NOT EXISTS full_access boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS mid_lesson_grants (
  user_id uuid NOT NULL REFERENCES infoproducto_users(id) ON DELETE CASCADE,
  lesson_id uuid NOT NULL REFERENCES training_lessons(id) ON DELETE CASCADE,
  tenant_slug text NOT NULL,
  -- Quién dio el grant. Si en el futuro queremos auditar "quién desbloqueó
  -- a quién", esta FK lo cubre. ON DELETE SET NULL para no borrar grants
  -- históricos si despedimos a un admin.
  granted_by uuid REFERENCES infoproducto_users(id) ON DELETE SET NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, lesson_id)
);

CREATE INDEX IF NOT EXISTS idx_mid_lesson_grants_tenant
  ON mid_lesson_grants (tenant_slug, user_id);

CREATE INDEX IF NOT EXISTS idx_mid_lesson_grants_lesson
  ON mid_lesson_grants (lesson_id);
