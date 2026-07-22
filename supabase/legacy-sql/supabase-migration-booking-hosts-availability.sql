-- Adds weekly availability windows to booking_hosts.
-- Format: jsonb array of time ranges per weekday, 24h HH:MM.
--   [
--     {"dow": 1, "start": "09:00", "end": "13:00"},
--     {"dow": 1, "start": "16:00", "end": "19:00"},
--     {"dow": 2, "start": "09:00", "end": "18:00"},
--     ...
--   ]
-- dow: 0 = Domingo, 1 = Lunes, …, 6 = Sábado.
-- Default [] — callers fall back to 09:00–18:00 L-V.

ALTER TABLE booking_hosts
  ADD COLUMN IF NOT EXISTS weekly_availability jsonb NOT NULL DEFAULT '[]'::jsonb;
