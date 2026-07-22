-- Migration: Add dual commission rates and start date to team table
-- Run this in Supabase SQL Editor

ALTER TABLE team ADD COLUMN IF NOT EXISTS closer_commission_rate NUMERIC DEFAULT NULL;
ALTER TABLE team ADD COLUMN IF NOT EXISTS setter_commission_rate NUMERIC DEFAULT NULL;
ALTER TABLE team ADD COLUMN IF NOT EXISTS commission_start_date DATE DEFAULT NULL;
ALTER TABLE team ADD COLUMN IF NOT EXISTS mgmt_commission_start_date DATE DEFAULT NULL;

-- Add commission payment tracking table
CREATE TABLE IF NOT EXISTS commission_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  member_id UUID REFERENCES team(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  role TEXT NOT NULL, -- 'closer', 'setter', 'manager', 'director'
  cash_base NUMERIC NOT NULL DEFAULT 0,
  rate NUMERIC NOT NULL DEFAULT 0,
  commission_amount NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'paid'
  paid_at TIMESTAMPTZ DEFAULT NULL,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commission_payments_client ON commission_payments(client_id);
CREATE INDEX IF NOT EXISTS idx_commission_payments_member ON commission_payments(member_id);
CREATE INDEX IF NOT EXISTS idx_commission_payments_period ON commission_payments(period_start, period_end);
