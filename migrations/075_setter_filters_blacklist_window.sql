-- ============================================================
-- Migration 075: Setter filters — blacklist + ventana horaria
-- ============================================================
-- Sprint Setter WhatsApp (523b8b96…) — tareas 🔴 high:
--   • [setter-filtros] Black-list de contactos (no contactar a estos)
--   • [setter-filtros] Ventana horaria (no contactar fuera de horario)
--
-- Columnas nuevas en whatsapp_config:
--   • setter_blacklist text[]   — números normalizados (E.164 sin +) o JIDs
--   • setter_window jsonb       — { enabled, start:"HH:MM", end:"HH:MM",
--                                   days:[0..6 lun..dom], timezone }
--                                 NULL/disabled = sin filtro horario.
-- Idempotente (IF NOT EXISTS).
-- ============================================================

ALTER TABLE whatsapp_config
  ADD COLUMN IF NOT EXISTS setter_blacklist text[],
  ADD COLUMN IF NOT EXISTS setter_window jsonb;

-- Default vacío (no es NOT NULL — NULL = sin filtro, comportamiento previo).
-- Si quieres bootstrap rápido para un cliente:
--   UPDATE whatsapp_config SET
--     setter_window = '{"enabled":true,"start":"09:00","end":"21:00","days":[0,1,2,3,4,5,6],"timezone":"Europe/Madrid"}'::jsonb
--   WHERE client_id = '<uuid>';

COMMENT ON COLUMN whatsapp_config.setter_blacklist IS
  'Lista de números (E.164 sin +) o JIDs (xxx@s.whatsapp.net) que el setter NO debe contactar. NULL/empty = sin blacklist.';
COMMENT ON COLUMN whatsapp_config.setter_window IS
  'Ventana horaria configurada: { enabled: bool, start: "HH:MM", end: "HH:MM", days: [0..6 lun..dom], timezone: IANA }. NULL/disabled = setter responde 24/7.';
