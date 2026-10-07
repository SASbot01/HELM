-- 048 · Añade operator_id (FK a client_operators) en las 5 tablas afectadas
-- y hace backfill desde owner_scope / account_label / booking host slug.
-- `owner_scope` se queda en paralelo durante el sprint de validación.
-- Idempotente.

ALTER TABLE crm_pipelines     ADD COLUMN IF NOT EXISTS operator_id UUID REFERENCES client_operators(id) ON DELETE SET NULL;
ALTER TABLE team              ADD COLUMN IF NOT EXISTS operator_id UUID REFERENCES client_operators(id) ON DELETE SET NULL;
ALTER TABLE user_integrations ADD COLUMN IF NOT EXISTS operator_id UUID REFERENCES client_operators(id) ON DELETE SET NULL;
ALTER TABLE booking_hosts     ADD COLUMN IF NOT EXISTS operator_id UUID REFERENCES client_operators(id) ON DELETE SET NULL;
ALTER TABLE sales             ADD COLUMN IF NOT EXISTS operator_id UUID REFERENCES client_operators(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_crm_pipelines_operator     ON crm_pipelines(operator_id);
CREATE INDEX IF NOT EXISTS idx_team_operator              ON team(operator_id);
CREATE INDEX IF NOT EXISTS idx_user_integrations_operator ON user_integrations(operator_id);
CREATE INDEX IF NOT EXISTS idx_booking_hosts_operator     ON booking_hosts(operator_id);
CREATE INDEX IF NOT EXISTS idx_sales_operator             ON sales(operator_id);

-- Backfill: pipelines desde owner_scope
WITH suiza AS (SELECT id FROM clients WHERE slug = 'asesorias-suiza')
UPDATE crm_pipelines p
SET operator_id = (
  SELECT co.id FROM client_operators co
  WHERE co.client_id = (SELECT id FROM suiza)
    AND co.slug = p.owner_scope
)
WHERE p.client_id = (SELECT id FROM suiza)
  AND p.owner_scope IN ('portillo', 'lukas')
  AND p.operator_id IS NULL;

-- Backfill: team desde owner_scope
WITH suiza AS (SELECT id FROM clients WHERE slug = 'asesorias-suiza')
UPDATE team t
SET operator_id = (
  SELECT co.id FROM client_operators co
  WHERE co.client_id = (SELECT id FROM suiza)
    AND co.slug = t.owner_scope
)
WHERE t.client_id = (SELECT id FROM suiza)
  AND t.owner_scope IN ('portillo', 'lukas')
  AND t.operator_id IS NULL;

-- Backfill: user_integrations desde account_label
-- Live state:
--   Stripe (acct_index=1, label='Portillo (live)') → portillo
--   Google (acct_index=2, label='Portillo')         → portillo
--   Google (acct_index=1, label='Lukas')            → lukas
WITH suiza AS (SELECT id FROM clients WHERE slug = 'asesorias-suiza')
UPDATE user_integrations ui
SET operator_id = (
  SELECT co.id FROM client_operators co
  WHERE co.client_id = ui.client_id
    AND co.slug = LOWER(SPLIT_PART(ui.account_label, ' ', 1))
)
WHERE ui.client_id = (SELECT id FROM suiza)
  AND ui.account_label IS NOT NULL
  AND LOWER(SPLIT_PART(ui.account_label, ' ', 1)) IN ('portillo', 'lukas')
  AND ui.operator_id IS NULL;

-- Backfill: booking_hosts por slug conocido
-- aterrizaje, seguros, analisissuiza, analisisuiza → portillo
-- lukas-seguros → lukas
WITH suiza AS (SELECT id FROM clients WHERE slug = 'asesorias-suiza')
UPDATE booking_hosts bh
SET operator_id = (
  SELECT co.id FROM client_operators co
  WHERE co.client_id = bh.client_id
    AND co.slug = CASE
      WHEN bh.slug = 'lukas-seguros' THEN 'lukas'
      WHEN bh.slug IN ('aterrizaje', 'seguros', 'analisissuiza', 'analisisuiza') THEN 'portillo'
      ELSE NULL
    END
)
WHERE bh.client_id = (SELECT id FROM suiza)
  AND bh.operator_id IS NULL;

-- Backfill: sales por `source` (la tabla sales NO tiene pipeline_id en este schema).
-- Stripe live actual = solo Portillo (acct_1S6I7L…). Todas las sales con
-- source LIKE 'stripe:%' o 'stripe-portillo' son de Portillo. Cuando Lukas
-- tenga su Stripe, el script de backfill de Lukas meterá operator_id al insertar.
WITH suiza AS (SELECT id FROM clients WHERE slug = 'asesorias-suiza')
UPDATE sales s
SET operator_id = (
  SELECT id FROM client_operators
  WHERE client_id = (SELECT id FROM suiza) AND slug = 'portillo'
)
WHERE s.client_id = (SELECT id FROM suiza)
  AND s.operator_id IS NULL
  AND (s.source LIKE 'stripe:%' OR s.source = 'stripe-portillo');
