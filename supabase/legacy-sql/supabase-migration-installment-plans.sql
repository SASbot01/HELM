-- Installment Plans: tracks payment plans for sales with multiple installments
CREATE TABLE IF NOT EXISTS installment_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id),
  sale_id UUID REFERENCES sales(id),
  client_name TEXT NOT NULL,
  client_email TEXT,
  client_phone TEXT,
  product TEXT,
  closer TEXT,
  total_installments INT NOT NULL DEFAULT 1,
  amount_per_installment NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  start_date DATE DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','defaulted')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Individual installment payments within a plan
CREATE TABLE IF NOT EXISTS installment_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES installment_plans(id) ON DELETE CASCADE,
  installment_number INT NOT NULL,
  amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  paid BOOLEAN NOT NULL DEFAULT false,
  paid_date TIMESTAMPTZ,
  marked_by TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_installment_plans_client ON installment_plans(client_id);
CREATE INDEX IF NOT EXISTS idx_installment_plans_status ON installment_plans(status);
CREATE INDEX IF NOT EXISTS idx_installment_payments_plan ON installment_payments(plan_id);

-- RLS
ALTER TABLE installment_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE installment_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "installment_plans_all" ON installment_plans FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "installment_payments_all" ON installment_payments FOR ALL USING (true) WITH CHECK (true);
