-- 091_mid_lock_gating.sql
-- Gating de "candado + formulario" para lecciones y canales.
--
-- Caso de uso (Detrás de Cámara): la primera clase abierta, el resto con
-- candado; al pulsar candado se abre un popup-formulario para agendar
-- llamada con el equipo. Mismo patrón en la comunidad: solo un canal
-- abierto y el resto bloqueados con el mismo modal.
--
-- Modelo: una columna boolean `locked` en cada entidad (lessons + channels)
-- + una tabla `mid_gate_submissions` para guardar los leads que pulsan el
-- candado. El frontend decide qué modal mostrar y manda el submit aquí.

ALTER TABLE training_lessons
  ADD COLUMN IF NOT EXISTS locked boolean NOT NULL DEFAULT false;

ALTER TABLE mid_channels
  ADD COLUMN IF NOT EXISTS locked boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS mid_gate_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_slug text NOT NULL,
  -- Qué disparó el modal: lección bloqueada, canal bloqueado, o bonus
  -- específico (Cómo elaborar presupuestos). Mismo modal, distinta razón.
  source text NOT NULL CHECK (source IN ('lesson_locked', 'channel_locked', 'bonus_form')),
  -- ID de la entidad que lo disparó (lesson_id o channel_id). NULLable
  -- porque algunos triggers pueden no tener una entidad concreta (futuro).
  reference_id uuid,
  -- Etiqueta libre adicional para auditar ("bonus_presupuestos_n1", etc.)
  reference_label text,
  -- Los 4 campos del formulario son obligatorios desde frontend; en DB los
  -- dejamos nullable por compatibilidad con un futuro endpoint v2 que pida
  -- menos info (p. ej. para canales secundarios o WhatsApp landing).
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  -- Prefijo internacional del teléfono (ej "+34", "+1"). Se almacena por
  -- separado para poder filtrar leads por país sin parsear el phone.
  phone_country text,
  instagram text,
  notes text,
  -- Si el visitante estaba logueado al pulsar, lo correlacionamos.
  -- NULL = visitante anónimo (el modal funciona sin login).
  user_id uuid REFERENCES infoproducto_users(id) ON DELETE SET NULL,
  user_agent text,
  ip_addr text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mid_gate_submissions_tenant_created
  ON mid_gate_submissions (tenant_slug, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mid_gate_submissions_email
  ON mid_gate_submissions (tenant_slug, lower(email));
