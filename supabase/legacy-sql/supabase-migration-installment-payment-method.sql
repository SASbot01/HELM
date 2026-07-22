-- Add payment_method column to installment_plans
ALTER TABLE installment_plans ADD COLUMN IF NOT EXISTS payment_method TEXT;
