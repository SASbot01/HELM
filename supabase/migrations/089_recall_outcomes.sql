-- 089_recall_outcomes.sql
-- Extiende recall_calls con campos estructurados extraídos por Claude
-- en el pipeline finalize: outcome de la call, oferta lanzada, depósito,
-- cierre. Estos campos alimentan los reportes EOD por persona.

ALTER TABLE recall_calls
  ADD COLUMN IF NOT EXISTS outcome text,                  -- 'won' | 'lost' | 'follow_up' | 'no_show' | 'unknown'
  ADD COLUMN IF NOT EXISTS offer_made boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS offer_amount numeric,
  ADD COLUMN IF NOT EXISTS deposit_collected boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS deposit_amount numeric,
  ADD COLUMN IF NOT EXISTS deal_closed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS deal_amount numeric,
  ADD COLUMN IF NOT EXISTS extracted_lead_updates jsonb,  -- { status, notes, deal_value, next_step }
  ADD COLUMN IF NOT EXISTS crm_applied_at timestamptz,    -- cuando se sincronizó con crm_contacts
  ADD COLUMN IF NOT EXISTS sale_created_id uuid;          -- referencia a sales.id si se creó automáticamente

CREATE INDEX IF NOT EXISTS idx_recall_calls_outcome ON recall_calls (client_id, outcome) WHERE outcome IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_recall_calls_member_day ON recall_calls (client_id, member_id, started_at)
  WHERE member_id IS NOT NULL AND started_at IS NOT NULL;
