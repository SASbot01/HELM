-- =============================================================================
-- Logistics V2 Migration
-- Adds: pricing learning table, auto-populate trigger, CRM auto-order trigger,
--        pricing stats view, and RLS policies
-- =============================================================================


-- =============================================================================
-- 1. Pricing Learning Table (logistics_pricing_history)
-- Stores completed orders' pricing data so the AI can learn from real outcomes.
-- Each row captures shipment parameters and actual final price, enabling
-- better rate-per-kg estimates over time.
-- =============================================================================

CREATE TABLE IF NOT EXISTS logistics_pricing_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  order_id UUID REFERENCES logistics_orders(id) ON DELETE SET NULL,

  -- Shipment params (the features the AI uses)
  product_category TEXT,
  shipping_method TEXT,
  origin_country TEXT,
  destination_country TEXT,
  billable_weight NUMERIC(10,2),
  carton_count INTEGER,
  needs_customs BOOLEAN,
  is_dangerous BOOLEAN,

  -- Pricing outcome
  estimated_price_min NUMERIC(10,2),
  estimated_price_max NUMERIC(10,2),
  final_price NUMERIC(10,2),
  rate_per_kg NUMERIC(10,4),           -- final_price / billable_weight

  -- Accuracy tracking
  estimation_error_pct NUMERIC(6,2),   -- how far off the midpoint was from final

  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lph_method_dest ON logistics_pricing_history(shipping_method, destination_country);
CREATE INDEX IF NOT EXISTS idx_lph_category ON logistics_pricing_history(product_category);


-- =============================================================================
-- 2. Auto-populate Pricing History Trigger
-- When a logistics_order gets its final_price set (or changed), automatically
-- insert a row into logistics_pricing_history with computed rate_per_kg and
-- estimation_error_pct.
-- =============================================================================

CREATE OR REPLACE FUNCTION log_pricing_history()
RETURNS TRIGGER AS $$
BEGIN
  -- Only log when final_price is set and billable_weight exists
  IF NEW.final_price IS NOT NULL AND NEW.billable_weight IS NOT NULL AND NEW.billable_weight > 0 THEN
    -- Only fire when final_price actually changed
    IF OLD.final_price IS DISTINCT FROM NEW.final_price THEN
      INSERT INTO logistics_pricing_history (
        client_id, order_id, product_category, shipping_method,
        origin_country, destination_country, billable_weight, carton_count,
        needs_customs, is_dangerous,
        estimated_price_min, estimated_price_max, final_price,
        rate_per_kg, estimation_error_pct
      ) VALUES (
        NEW.client_id, NEW.id, NEW.product_category, NEW.shipping_method,
        NEW.origin_country, NEW.destination_country, NEW.billable_weight, NEW.carton_count,
        NEW.needs_customs, NEW.is_dangerous,
        NEW.estimated_price_min, NEW.estimated_price_max, NEW.final_price,
        ROUND(NEW.final_price / NEW.billable_weight, 4),
        CASE WHEN NEW.estimated_price_min IS NOT NULL AND NEW.estimated_price_max IS NOT NULL
          THEN ROUND(
            ((NEW.final_price - (NEW.estimated_price_min + NEW.estimated_price_max) / 2.0)
             / NULLIF((NEW.estimated_price_min + NEW.estimated_price_max) / 2.0, 0)) * 100, 2)
          ELSE NULL
        END
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_log_pricing ON logistics_orders;
CREATE TRIGGER trg_log_pricing
  AFTER UPDATE ON logistics_orders
  FOR EACH ROW
  EXECUTE FUNCTION log_pricing_history();


-- =============================================================================
-- 3. Auto-create Logistics Order when CRM Lead Hits cerrado_ganado
-- When a logistics-tagged contact's stage changes to 'cerrado_ganado',
-- automatically creates a logistics_order from the contact's data and
-- custom_fields.
-- =============================================================================

CREATE OR REPLACE FUNCTION auto_create_logistics_order()
RETURNS TRIGGER AS $$
BEGIN
  -- Only fire for logistics-tagged contacts moving to cerrado_ganado
  IF NEW.stage = 'cerrado_ganado'
     AND (OLD.stage IS NULL OR OLD.stage <> 'cerrado_ganado')
     AND NEW.tags @> '["logistics"]'::jsonb THEN

    INSERT INTO logistics_orders (
      client_id, customer_name, customer_email, customer_phone, customer_company,
      product_description, product_category,
      destination_country, shipping_method,
      weight_kg, carton_count,
      dimensions_l, dimensions_w, dimensions_h,
      estimated_price_min, estimated_price_max,
      source, notes, status
    ) VALUES (
      NEW.client_id,
      NEW.name,
      NEW.email,
      NEW.phone,
      NEW.company,
      COALESCE(NEW.custom_fields->>'product_description', NEW.custom_fields->>'producto_interes', ''),
      COALESCE(NEW.custom_fields->>'product_category', ''),
      COALESCE(NEW.custom_fields->>'destination_country', ''),
      COALESCE(NEW.custom_fields->>'shipping_method', 'sea'),
      (NEW.custom_fields->>'weight_kg')::NUMERIC,
      (NEW.custom_fields->>'carton_count')::INTEGER,
      (NEW.custom_fields->>'dimensions_l')::NUMERIC,
      (NEW.custom_fields->>'dimensions_w')::NUMERIC,
      (NEW.custom_fields->>'dimensions_h')::NUMERIC,
      (NEW.custom_fields->>'estimated_price_min')::NUMERIC,
      (NEW.custom_fields->>'estimated_price_max')::NUMERIC,
      'crm_pipeline',
      COALESCE(NEW.notes, ''),
      'pending_quote'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_logistics_order ON crm_contacts;
CREATE TRIGGER trg_auto_logistics_order
  AFTER UPDATE ON crm_contacts
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_logistics_order();


-- =============================================================================
-- 4. Pricing Stats View for AI
-- Provides aggregate pricing statistics grouped by shipping method, destination,
-- and product category for quick rate lookups and estimation calibration.
-- =============================================================================

CREATE OR REPLACE VIEW logistics_pricing_stats AS
SELECT
  shipping_method,
  destination_country,
  product_category,
  COUNT(*) AS sample_count,
  ROUND(AVG(rate_per_kg), 4) AS avg_rate_per_kg,
  ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY rate_per_kg), 4) AS p25_rate,
  ROUND(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY rate_per_kg), 4) AS median_rate,
  ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY rate_per_kg), 4) AS p75_rate,
  ROUND(MIN(rate_per_kg), 4) AS min_rate,
  ROUND(MAX(rate_per_kg), 4) AS max_rate,
  ROUND(AVG(estimation_error_pct), 2) AS avg_error_pct
FROM logistics_pricing_history
WHERE final_price IS NOT NULL AND rate_per_kg IS NOT NULL
GROUP BY shipping_method, destination_country, product_category;


-- =============================================================================
-- 5. Row Level Security for Pricing History
-- =============================================================================

ALTER TABLE logistics_pricing_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS logistics_pricing_history_all ON logistics_pricing_history;
CREATE POLICY logistics_pricing_history_all ON logistics_pricing_history
  FOR ALL USING (true) WITH CHECK (true);
