-- ─────────────────────────────────────────────────────────────────────────────
-- Bookings: sistema interno de reservas (alternativa a Calendly externo).
-- Un prospecto externo reserva un slot con alex, alejandro o team.
-- Se guarda en esta tabla. El equipo BlackWolf lo ve desde Dashboard-Ops.
-- Ejecutar completo en Supabase SQL Editor. Idempotente.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  host text NOT NULL CHECK (host IN ('alex', 'alejandro', 'team')),
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  duration_minutes int NOT NULL DEFAULT 30,

  guest_name text NOT NULL,
  guest_email text NOT NULL,
  guest_company text DEFAULT '',
  guest_phone text DEFAULT '',
  reason text DEFAULT '',

  status text NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('confirmed', 'cancelled', 'completed', 'no_show')),

  meeting_url text DEFAULT '',
  notes text DEFAULT '',
  utm_source text DEFAULT '',
  utm_campaign text DEFAULT '',

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bookings_client   ON bookings (client_id);
CREATE INDEX IF NOT EXISTS idx_bookings_host     ON bookings (client_id, host);
CREATE INDEX IF NOT EXISTS idx_bookings_start    ON bookings (client_id, start_at);
CREATE INDEX IF NOT EXISTS idx_bookings_status   ON bookings (client_id, status);

ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for anon" ON bookings;
CREATE POLICY "Allow all for anon" ON bookings
  FOR ALL USING (true) WITH CHECK (true);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS bookings_updated_at ON bookings;
CREATE TRIGGER bookings_updated_at
  BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
