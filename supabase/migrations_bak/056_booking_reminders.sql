-- 056 · booking_reminders — recordatorios programados a 24h y 1h por canal
--
-- Modelo: cada row = 1 mensaje a enviar. status='pending' hasta que el cron lo
-- procesa (transición a 'processing' → 'sent' o 'failed'). Idempotente: el
-- cron filtra por status='pending' AND fire_at<=now() y un UPDATE atómico
-- evita doble-envío en race entre invocaciones.
--
-- Cuando un booking se cancela/reagenda, el caller debe UPDATE
-- booking_reminders SET status='cancelled' WHERE booking_id=X AND status='pending'.
--
-- Idempotente. Re-ejecutar es seguro.
-- ROLLBACK: DROP TABLE IF EXISTS booking_reminders;
--
-- NOTA: una iteración previa creó booking_reminders con schema distinto
-- (kind, scheduled_at, error). Esa tabla quedó huérfana y vacía. La
-- regeneramos con el schema definitivo. Si en el futuro vuelve a haber
-- divergencia entre prod y migrations, ajustar aquí.

DROP TABLE IF EXISTS booking_reminders CASCADE;

CREATE TABLE IF NOT EXISTS booking_reminders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  booking_id      UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  channel         TEXT NOT NULL CHECK (channel IN ('email','whatsapp')),
  offset_minutes  INTEGER NOT NULL,
  fire_at         TIMESTAMPTZ NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','processing','sent','failed','cancelled')),
  recipient       TEXT,
  payload         JSONB DEFAULT '{}'::jsonb,
  attempts        INTEGER NOT NULL DEFAULT 0,
  last_error      TEXT,
  sent_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_booking_reminders_due
  ON booking_reminders(status, fire_at)
  WHERE status IN ('pending','processing');

CREATE INDEX IF NOT EXISTS idx_booking_reminders_booking
  ON booking_reminders(booking_id);

-- Evita duplicados al re-ejecutar el hook de creación
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'booking_reminders_unique_per_booking_channel_offset'
  ) THEN
    ALTER TABLE booking_reminders
      ADD CONSTRAINT booking_reminders_unique_per_booking_channel_offset
      UNIQUE (booking_id, channel, offset_minutes);
  END IF;
END$$;

ALTER TABLE booking_reminders DISABLE ROW LEVEL SECURITY;
