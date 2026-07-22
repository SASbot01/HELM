-- ─────────────────────────────────────────────────────────────────────────────
-- Booking multi-tenant: cada cliente tiene sus propios hosts configurables.
-- 1) Nueva tabla booking_hosts
-- 2) bookings.host pasa de CHECK fijo a text libre (referencia booking_hosts.slug)
-- 3) Seed para black-wolf con alex/alejandro/team
-- Idempotente.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Tabla de hosts por cliente
CREATE TABLE IF NOT EXISTS booking_hosts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  slug text NOT NULL,                   -- 'alex', 'team', 'soporte', ...
  name text NOT NULL,
  role text DEFAULT '',
  description text DEFAULT '',
  email text DEFAULT '',
  duration_minutes int NOT NULL DEFAULT 30,
  google_account_index int DEFAULT 1,   -- para OAuth multi-cuenta del mismo tenant
  host_type text DEFAULT 'individual'
    CHECK (host_type IN ('individual', 'team', 'round_robin')),
  team_members jsonb DEFAULT '[]'::jsonb, -- slugs de hosts si host_type='team'|'round_robin'
  is_active boolean NOT NULL DEFAULT true,
  position int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (client_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_booking_hosts_client ON booking_hosts (client_id, is_active, position);

ALTER TABLE booking_hosts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for anon" ON booking_hosts;
CREATE POLICY "Allow all for anon" ON booking_hosts FOR ALL USING (true) WITH CHECK (true);

-- Trigger updated_at reutiliza set_updated_at() creado para bookings
DROP TRIGGER IF EXISTS booking_hosts_updated_at ON booking_hosts;
CREATE TRIGGER booking_hosts_updated_at
  BEFORE UPDATE ON booking_hosts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 2) Relax bookings.host: ahora es text libre (valida el front vs booking_hosts)
DO $$
DECLARE c text;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'bookings'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%host%in%'
  LOOP
    EXECUTE format('ALTER TABLE bookings DROP CONSTRAINT %I', c);
  END LOOP;
END $$;

-- 3) Seed para black-wolf (idempotente)
DO $$
DECLARE bw_id uuid;
BEGIN
  SELECT id INTO bw_id FROM clients WHERE slug = 'black-wolf';
  IF bw_id IS NULL THEN RETURN; END IF;

  INSERT INTO booking_hosts (client_id, slug, name, role, description, email, duration_minutes, google_account_index, host_type, team_members, position)
  VALUES
    (bw_id, 'alex',      'Alex',      'CEO · Dirección de cliente',     'Conversación comercial y discovery.',         'alex.ceo@blackwolfsec.io',      30, 1, 'individual', '[]'::jsonb, 1),
    (bw_id, 'alejandro', 'Alejandro', 'CTO · Implantación técnica',     'Integraciones, arquitectura, scope técnico.', 'alejandro.cto@blackwolfsec.io', 45, 2, 'individual', '[]'::jsonb, 2),
    (bw_id, 'team',      'Equipo',    'Alex + Alejandro',               'Demo conjunta para cerrar y acordar scope.',  'ventas@blackwolfsec.io',        45, 1, 'team',       '["alex","alejandro"]'::jsonb, 3)
  ON CONFLICT (client_id, slug) DO UPDATE SET
    name = EXCLUDED.name,
    role = EXCLUDED.role,
    description = EXCLUDED.description,
    email = EXCLUDED.email,
    duration_minutes = EXCLUDED.duration_minutes,
    google_account_index = EXCLUDED.google_account_index,
    host_type = EXCLUDED.host_type,
    team_members = EXCLUDED.team_members,
    position = EXCLUDED.position,
    updated_at = now();
END $$;
