-- 055 · booking_hosts: override de pipeline/stage destino al confirmar reserva
--
-- Permite que cada host (closer) decida en qué pipeline + stage entra el
-- contacto cuando alguien reserva con ese host, sin tocar código. Si están
-- vacíos, el endpoint cae al fallback hardcoded por cliente (compat).
--
-- Idempotente.
-- ROLLBACK:
--   ALTER TABLE booking_hosts DROP COLUMN IF EXISTS target_pipeline_slug;
--   ALTER TABLE booking_hosts DROP COLUMN IF EXISTS target_stage_key;

ALTER TABLE booking_hosts
  ADD COLUMN IF NOT EXISTS target_pipeline_slug TEXT,
  ADD COLUMN IF NOT EXISTS target_stage_key     TEXT;

COMMENT ON COLUMN booking_hosts.target_pipeline_slug IS
  'Pipeline destino al confirmar reserva con este host. Se busca por crm_pipelines.name (case-insensitive). Si NULL, fallback hardcoded por cliente.';
COMMENT ON COLUMN booking_hosts.target_stage_key IS
  'Stage key dentro del pipeline destino. Si NULL, fallback hardcoded ("llamada_agendada" / "agendado" según cliente).';
