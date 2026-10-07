-- 077_mid_community.sql
-- Comunidad estilo Discord para el Infoproducto (/mid/<slug>/comunidad).
--
-- Modelo: cada tenant tiene N canales públicos (todos los miembros logueados
-- ven todos los canales). Cada canal es una lista plana de mensajes en
-- tiempo casi-real (polling 5s del frontend). Sin threads / replies — replies
-- inline con @mention y citando contexto del mensaje original si hace falta.
--
-- Auto-seed: el primer GET /api/mid/channels para un tenant sin canales
-- crea automáticamente uno llamado "general" para que la comunidad no
-- aparezca vacía.

-- ── mid_channels ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mid_channels (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_slug  TEXT NOT NULL,
  name         TEXT NOT NULL,
  description  TEXT,
  position     INTEGER NOT NULL DEFAULT 0,
  active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_slug, name)
);

CREATE INDEX IF NOT EXISTS mid_channels_tenant_idx
  ON mid_channels (tenant_slug, active, position);

COMMENT ON TABLE mid_channels IS
  'Canales tipo Discord del Infoproducto. Públicos: todos los miembros logueados del tenant ven todos los canales.';

-- ── mid_messages ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mid_messages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id   UUID NOT NULL REFERENCES mid_channels(id) ON DELETE CASCADE,
  tenant_slug  TEXT NOT NULL,
  user_id      UUID NOT NULL REFERENCES infoproducto_users(id) ON DELETE CASCADE,
  content      TEXT NOT NULL,
  -- Array de user_ids mencionados via @nombre. Se rellena al POST.
  mentions     JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Array de objetos { url, filename, size, mime }. Subidos a Supabase Storage
  -- bucket mid-attachments.
  attachments  JSONB NOT NULL DEFAULT '[]'::jsonb,
  edited_at    TIMESTAMPTZ,
  deleted_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS mid_messages_channel_idx
  ON mid_messages (channel_id, deleted_at, created_at DESC);

CREATE INDEX IF NOT EXISTS mid_messages_tenant_idx
  ON mid_messages (tenant_slug, created_at DESC);

COMMENT ON TABLE mid_messages IS
  'Mensajes de la comunidad. Soft delete via deleted_at (preserva historial). Mentions y attachments en JSONB para no normalizar prematuramente.';
