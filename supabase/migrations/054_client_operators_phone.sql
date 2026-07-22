-- 054 · client_operators.phone (closer needs phone for reminders + WhatsApp)
-- Idempotente.
-- ROLLBACK: ALTER TABLE client_operators DROP COLUMN IF EXISTS phone;

ALTER TABLE client_operators
  ADD COLUMN IF NOT EXISTS phone TEXT;
