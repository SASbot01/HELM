-- ============================================
-- BlackWolf Migration Script
-- Run this on existing FBA Academy database to add multi-tenant support
-- ============================================

-- 1. Create new tables
CREATE TABLE IF NOT EXISTS clients (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  logo_url text DEFAULT '',
  primary_color text DEFAULT '#FF6B00',
  secondary_color text DEFAULT '#FFB800',
  bg_color text DEFAULT '#0A0A0A',
  bg_card_color text DEFAULT '#111111',
  bg_sidebar_color text DEFAULT '#0D0D0D',
  border_color text DEFAULT '#1F1F1F',
  text_color text DEFAULT '#FFFFFF',
  text_secondary_color text DEFAULT '#A0A0A0',
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_clients_slug ON clients(slug);
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on clients" ON clients
  FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS superadmins (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL DEFAULT '',
  email text NOT NULL UNIQUE,
  password text NOT NULL DEFAULT '',
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_superadmins_email ON superadmins(email);
ALTER TABLE superadmins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on superadmins" ON superadmins
  FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS superadmin_commissions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  commission_rate numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(client_id)
);
ALTER TABLE superadmin_commissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on superadmin_commissions" ON superadmin_commissions
  FOR ALL USING (true) WITH CHECK (true);

-- 2. Seed clients
INSERT INTO clients (slug, name, logo_url, primary_color, secondary_color, bg_color, bg_card_color, bg_sidebar_color, border_color, text_color, text_secondary_color) VALUES
  ('fba-academy', 'FBA Academy', '/assets/logos/fba-academy.jpeg', '#FF6B00', '#FFB800', '#0A0A0A', '#111111', '#0D0D0D', '#1F1F1F', '#FFFFFF', '#A0A0A0'),
  ('luxury-interiors', 'Luxury Design School', '/assets/logos/luxury-interiors.jpeg', '#C4944A', '#DDD5C8', '#1A0D12', '#231018', '#1A0D12', '#3D1520', '#DDD5C8', '#A08A6E'),
  ('detras-de-camara', 'Detrás de Cámara', NULL, '#22C55E', '#4ADE80', '#0F0F12', '#18181B', '#0F0F12', '#2A2D34', '#F5F6F7', '#6B7280')
ON CONFLICT (slug) DO NOTHING;

-- 3. Seed superadmin
INSERT INTO superadmins (name, email, password, active) VALUES
  ('Alex', 'alex@blackwolfsec.io', 'BlackWolf88', true)
ON CONFLICT (email) DO NOTHING;

-- 4. Seed commissions
INSERT INTO superadmin_commissions (client_id, commission_rate)
SELECT id, 0.02 FROM clients WHERE slug = 'fba-academy'
ON CONFLICT (client_id) DO NOTHING;
INSERT INTO superadmin_commissions (client_id, commission_rate)
SELECT id, 0.20 FROM clients WHERE slug = 'luxury-interiors'
ON CONFLICT (client_id) DO NOTHING;
INSERT INTO superadmin_commissions (client_id, commission_rate)
SELECT id, 0.10 FROM clients WHERE slug = 'detras-de-camara'
ON CONFLICT (client_id) DO NOTHING;

-- 5. Add client_id to existing tables (nullable first)
ALTER TABLE sales ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES clients(id);
ALTER TABLE reports ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES clients(id);
ALTER TABLE team ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES clients(id);
ALTER TABLE projections ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES clients(id);
ALTER TABLE payment_fees ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES clients(id);
ALTER TABLE n8n_config ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES clients(id);

-- 6. Backfill existing data with FBA Academy client_id
DO $$
DECLARE
  fba_id uuid;
BEGIN
  SELECT id INTO fba_id FROM clients WHERE slug = 'fba-academy';
  UPDATE sales SET client_id = fba_id WHERE client_id IS NULL;
  UPDATE reports SET client_id = fba_id WHERE client_id IS NULL;
  UPDATE team SET client_id = fba_id WHERE client_id IS NULL;
  UPDATE projections SET client_id = fba_id WHERE client_id IS NULL;
  UPDATE payment_fees SET client_id = fba_id WHERE client_id IS NULL;
  UPDATE n8n_config SET client_id = fba_id WHERE client_id IS NULL;
END $$;

-- 7. Make client_id NOT NULL
ALTER TABLE sales ALTER COLUMN client_id SET NOT NULL;
ALTER TABLE reports ALTER COLUMN client_id SET NOT NULL;
ALTER TABLE team ALTER COLUMN client_id SET NOT NULL;
ALTER TABLE projections ALTER COLUMN client_id SET NOT NULL;
ALTER TABLE payment_fees ALTER COLUMN client_id SET NOT NULL;
ALTER TABLE n8n_config ALTER COLUMN client_id SET NOT NULL;

-- 8. Create indexes on client_id
CREATE INDEX IF NOT EXISTS idx_sales_client_id ON sales(client_id);
CREATE INDEX IF NOT EXISTS idx_reports_client_id ON reports(client_id);
CREATE INDEX IF NOT EXISTS idx_team_client_id ON team(client_id);
CREATE INDEX IF NOT EXISTS idx_projections_client_id ON projections(client_id);
CREATE INDEX IF NOT EXISTS idx_payment_fees_client_id ON payment_fees(client_id);
CREATE INDEX IF NOT EXISTS idx_n8n_config_client_id ON n8n_config(client_id);

-- 9. Update uniqueness constraints
ALTER TABLE team DROP CONSTRAINT IF EXISTS team_email_key;
ALTER TABLE team ADD CONSTRAINT team_client_email_unique UNIQUE (client_id, email);

ALTER TABLE payment_fees DROP CONSTRAINT IF EXISTS payment_fees_method_key;
ALTER TABLE payment_fees ADD CONSTRAINT payment_fees_client_method_unique UNIQUE (client_id, method);

-- 10. Recreate view with client_id join
DROP VIEW IF EXISTS sales_with_net_cash;
CREATE OR REPLACE VIEW sales_with_net_cash AS
SELECT
  s.*,
  ROUND(s.cash_collected * (1 - COALESCE(pf.fee_rate, 0)), 2) AS net_cash
FROM sales s
LEFT JOIN payment_fees pf
  ON pf.method = s.payment_method
  AND pf.client_id = s.client_id;

-- 11. Add SuperAdmin as team member in each client
INSERT INTO team (client_id, name, email, password, role, active, commission_rate)
SELECT id, 'SuperAdmin', 'alex@blackwolfsec.io', 'BlackWolf88', 'director', true, 0
FROM clients WHERE slug = 'fba-academy'
ON CONFLICT (client_id, email) DO NOTHING;

INSERT INTO team (client_id, name, email, password, role, active, commission_rate)
SELECT id, 'SuperAdmin', 'alex@blackwolfsec.io', 'BlackWolf88', 'director', true, 0
FROM clients WHERE slug = 'luxury-interiors'
ON CONFLICT (client_id, email) DO NOTHING;

-- 12. Seed Luxury Design School payment fees
INSERT INTO payment_fees (client_id, method, fee_rate)
SELECT id, 'Transferencia', 0 FROM clients WHERE slug = 'luxury-interiors'
ON CONFLICT (client_id, method) DO NOTHING;
INSERT INTO payment_fees (client_id, method, fee_rate)
SELECT id, 'Stripe', 0.029 FROM clients WHERE slug = 'luxury-interiors'
ON CONFLICT (client_id, method) DO NOTHING;
INSERT INTO payment_fees (client_id, method, fee_rate)
SELECT id, 'PayPal', 0.035 FROM clients WHERE slug = 'luxury-interiors'
ON CONFLICT (client_id, method) DO NOTHING;
INSERT INTO payment_fees (client_id, method, fee_rate)
SELECT id, 'Tarjeta', 0.015 FROM clients WHERE slug = 'luxury-interiors'
ON CONFLICT (client_id, method) DO NOTHING;

-- 13. N8n config for Luxury Design School
INSERT INTO n8n_config (client_id, webhook_url, api_key, enabled, last_sync)
SELECT id, '', '', false, NULL FROM clients WHERE slug = 'luxury-interiors';

-- 14. Detrás de Cámara — Team, Payment Fees, N8n Config
INSERT INTO team (client_id, name, email, password, role, active, commission_rate)
SELECT id, 'SuperAdmin', 'alex@blackwolfsec.io', 'BlackWolf88', 'director', true, 0
FROM clients WHERE slug = 'detras-de-camara'
ON CONFLICT (client_id, email) DO NOTHING;

INSERT INTO payment_fees (client_id, method, fee_rate)
SELECT id, 'Transferencia', 0 FROM clients WHERE slug = 'detras-de-camara'
ON CONFLICT (client_id, method) DO NOTHING;
INSERT INTO payment_fees (client_id, method, fee_rate)
SELECT id, 'Stripe', 0.029 FROM clients WHERE slug = 'detras-de-camara'
ON CONFLICT (client_id, method) DO NOTHING;
INSERT INTO payment_fees (client_id, method, fee_rate)
SELECT id, 'PayPal', 0.035 FROM clients WHERE slug = 'detras-de-camara'
ON CONFLICT (client_id, method) DO NOTHING;
INSERT INTO payment_fees (client_id, method, fee_rate)
SELECT id, 'Tarjeta', 0.015 FROM clients WHERE slug = 'detras-de-camara'
ON CONFLICT (client_id, method) DO NOTHING;

INSERT INTO n8n_config (client_id, webhook_url, api_key, enabled, last_sync)
SELECT id, '', '', false, NULL FROM clients WHERE slug = 'detras-de-camara';
