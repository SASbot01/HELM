-- ============================================================
-- CEO Finance Entries — SQL Migration
-- Run this in Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS ceo_finance_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id),
  date date NOT NULL DEFAULT CURRENT_DATE,
  category text NOT NULL CHECK (category IN ('operativo', 'equipo', 'marketing', 'herramientas', 'otro', 'legal', 'tax')),
  description text NOT NULL,
  amount numeric(12,2) NOT NULL,
  recurring boolean DEFAULT false,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_ceo_finance_entries_client ON ceo_finance_entries (client_id);
CREATE INDEX idx_ceo_finance_entries_date ON ceo_finance_entries (client_id, date DESC);
CREATE INDEX idx_ceo_finance_entries_category ON ceo_finance_entries (client_id, category);

ALTER TABLE ceo_finance_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for anon" ON ceo_finance_entries FOR ALL USING (true) WITH CHECK (true);
