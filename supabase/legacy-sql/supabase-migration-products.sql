-- =============================================
-- Migration: Add products table
-- =============================================

CREATE TABLE IF NOT EXISTS products (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  price numeric DEFAULT 0,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(client_id, name)
);

CREATE INDEX IF NOT EXISTS idx_products_client_id ON products(client_id);
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on products" ON products
  FOR ALL USING (true) WITH CHECK (true);

-- Seed: FBA Academy products only
INSERT INTO products (client_id, name, price, active)
SELECT id, 'FBA Academy Pro', 2997, true FROM clients WHERE slug = 'fba-academy'
ON CONFLICT (client_id, name) DO NOTHING;
INSERT INTO products (client_id, name, price, active)
SELECT id, 'Mentoring 1:1', 5000, true FROM clients WHERE slug = 'fba-academy'
ON CONFLICT (client_id, name) DO NOTHING;
INSERT INTO products (client_id, name, price, active)
SELECT id, 'China Bootcamp', 10000, true FROM clients WHERE slug = 'fba-academy'
ON CONFLICT (client_id, name) DO NOTHING;
