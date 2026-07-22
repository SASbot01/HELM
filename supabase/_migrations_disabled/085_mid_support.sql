-- 085_mid_support.sql
-- Chat de soporte 1:1 entre miembros y admins del Infoproducto.
--
-- Modelo simple: un thread por (tenant_slug, user_id). El user habla con
-- "el equipo" — cualquier admin del tenant ve la conversación y puede
-- responder. No es DM admin↔admin, es soporte estilo Intercom: el cliente
-- abre el widget, escribe, todos los admins lo ven.
--
-- Renderizado en MidLayout como FAB esquina inferior izquierda.

CREATE TABLE IF NOT EXISTS mid_support_threads (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_slug       TEXT NOT NULL,
  user_id           UUID NOT NULL REFERENCES infoproducto_users(id) ON DELETE CASCADE,
  status            TEXT NOT NULL DEFAULT 'open',  -- open | closed
  last_message_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  unread_for_admin  INTEGER NOT NULL DEFAULT 0,
  unread_for_user   INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_slug, user_id)
);

CREATE INDEX IF NOT EXISTS mid_support_threads_tenant_idx
  ON mid_support_threads (tenant_slug, status, last_message_at DESC);

CREATE TABLE IF NOT EXISTS mid_support_messages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id    UUID NOT NULL REFERENCES mid_support_threads(id) ON DELETE CASCADE,
  tenant_slug  TEXT NOT NULL,
  sender_id    UUID NOT NULL REFERENCES infoproducto_users(id) ON DELETE CASCADE,
  -- sender_role guarda el rol al momento del envío (snapshot). Permite
  -- distinguir mensajes del user vs respuestas del equipo aunque después
  -- el rol del sender cambie.
  sender_role  TEXT NOT NULL,                      -- user | admin
  content      TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS mid_support_messages_thread_idx
  ON mid_support_messages (thread_id, created_at);

COMMENT ON TABLE mid_support_threads IS
  'Conversación de soporte entre un miembro y el equipo (admins) del tenant. Uno por user. Aparece como widget bottom-left en /mid/<slug>/*.';
