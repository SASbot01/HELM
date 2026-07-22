-- Commission rules (tier-based) — reglas de comisión del equipo por venta.
-- Antes: cada miembro tenía un rate fijo (team.commission_rate) que se aplicaba
-- sobre el total mensual. No permitía tiers por monto de venta.
-- Ahora: por cliente + rol se define un umbral y dos rates (igual/mayor vs menor).
-- Ejemplo Black Wolf: closer cobra 10% si venta >=30k, 7% si <30k.

CREATE TABLE IF NOT EXISTS commission_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL,                    -- 'closer' | 'setter' | 'manager' | 'director'
  threshold NUMERIC NOT NULL DEFAULT 0,  -- umbral de venta (en misma moneda que sales)
  rate_at_or_above NUMERIC NOT NULL,     -- rate si sale_amount >= threshold (0.10 = 10%)
  rate_below NUMERIC NOT NULL,           -- rate si sale_amount < threshold (0.07 = 7%)
  active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, role)
);

CREATE INDEX IF NOT EXISTS idx_commission_rules_client ON commission_rules(client_id);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION commission_rules_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_commission_rules_updated_at ON commission_rules;
CREATE TRIGGER trg_commission_rules_updated_at
BEFORE UPDATE ON commission_rules
FOR EACH ROW EXECUTE FUNCTION commission_rules_set_updated_at();

-- Seed Black Wolf — closer 10%/7% umbral 30k
INSERT INTO commission_rules (client_id, role, threshold, rate_at_or_above, rate_below, notes)
SELECT id, 'closer', 30000, 0.10, 0.07, 'Seed inicial: >=30k → 10%, <30k → 7%'
FROM clients WHERE slug = 'black-wolf'
ON CONFLICT (client_id, role) DO NOTHING;
