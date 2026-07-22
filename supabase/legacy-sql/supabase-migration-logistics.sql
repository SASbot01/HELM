-- Logistics business line for FBA Academy
-- Revenue split: 50/50 between logistics company and Emi

-- 1. Logistics orders (shipments)
CREATE TABLE IF NOT EXISTS logistics_orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  order_number TEXT,
  status TEXT DEFAULT 'pending_quote' CHECK (status IN ('pending_quote','quoted','confirmed','paid','in_warehouse','in_transit','customs','delivered','cancelled')),
  -- Product info
  product_description TEXT,
  product_category TEXT,
  carton_count INTEGER,
  weight_kg NUMERIC(10,2),
  dimensions_l NUMERIC(10,2),
  dimensions_w NUMERIC(10,2),
  dimensions_h NUMERIC(10,2),
  volumetric_weight NUMERIC(10,2),
  billable_weight NUMERIC(10,2),
  -- Shipping
  origin_country TEXT DEFAULT 'China',
  origin_city TEXT,
  destination_country TEXT,
  destination_city TEXT,
  shipping_method TEXT CHECK (shipping_method IN ('express','air','sea','train')),
  incoterm TEXT DEFAULT 'DDP',
  needs_customs BOOLEAN DEFAULT true,
  needs_insurance BOOLEAN DEFAULT false,
  is_dangerous BOOLEAN DEFAULT false,
  -- Pricing
  estimated_price_min NUMERIC(10,2),
  estimated_price_max NUMERIC(10,2),
  final_price NUMERIC(10,2),
  currency TEXT DEFAULT 'EUR',
  logistics_share NUMERIC(10,2),
  emi_share NUMERIC(10,2),
  -- Tracking
  tracking_number TEXT,
  estimated_delivery DATE,
  actual_delivery DATE,
  -- Customer
  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  customer_company TEXT,
  -- Internal
  assigned_agent TEXT,
  notes TEXT,
  source TEXT DEFAULT 'manual',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_logistics_orders_client ON logistics_orders(client_id);
CREATE INDEX IF NOT EXISTS idx_logistics_orders_status ON logistics_orders(status);
CREATE INDEX IF NOT EXISTS idx_logistics_orders_created ON logistics_orders(created_at DESC);

-- Auto order_number
CREATE OR REPLACE FUNCTION generate_logistics_order_number()
RETURNS TRIGGER AS $$
DECLARE seq INT;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(order_number FROM 'LOG-\d{4}-(\d+)') AS INT)), 0) + 1
    INTO seq
    FROM logistics_orders
    WHERE client_id = NEW.client_id;
  NEW.order_number := 'LOG-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(seq::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_logistics_order_number ON logistics_orders;
CREATE TRIGGER trg_logistics_order_number
  BEFORE INSERT ON logistics_orders
  FOR EACH ROW
  WHEN (NEW.order_number IS NULL)
  EXECUTE FUNCTION generate_logistics_order_number();

-- Auto compute shares on price change
CREATE OR REPLACE FUNCTION compute_logistics_shares()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.final_price IS NOT NULL THEN
    NEW.logistics_share := ROUND(NEW.final_price * 0.5, 2);
    NEW.emi_share := ROUND(NEW.final_price * 0.5, 2);
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_logistics_shares ON logistics_orders;
CREATE TRIGGER trg_logistics_shares
  BEFORE INSERT OR UPDATE ON logistics_orders
  FOR EACH ROW
  EXECUTE FUNCTION compute_logistics_shares();

-- 2. Logistics quotes (from landing calculator)
CREATE TABLE IF NOT EXISTS logistics_quotes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  product_type TEXT,
  weight_kg NUMERIC(10,2),
  dimensions_l NUMERIC(10,2),
  dimensions_w NUMERIC(10,2),
  dimensions_h NUMERIC(10,2),
  volumetric_weight NUMERIC(10,2),
  billable_weight NUMERIC(10,2),
  origin TEXT DEFAULT 'China',
  destination TEXT,
  shipping_method TEXT,
  estimated_price_min NUMERIC(10,2),
  estimated_price_max NUMERIC(10,2),
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  converted BOOLEAN DEFAULT false,
  converted_order_id UUID REFERENCES logistics_orders(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_logistics_quotes_client ON logistics_quotes(client_id);

-- 3. RLS
ALTER TABLE logistics_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE logistics_quotes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS logistics_orders_all ON logistics_orders;
CREATE POLICY logistics_orders_all ON logistics_orders FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS logistics_quotes_all ON logistics_quotes;
CREATE POLICY logistics_quotes_all ON logistics_quotes FOR ALL USING (true) WITH CHECK (true);
