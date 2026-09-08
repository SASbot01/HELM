-- 060 · whatsapp_config.operator_id — vincula cuenta WA con operador del tenant
--
-- Razón: api/booking-reminders.js hace lookup `whatsapp_config.operator_id`
-- para resolver qué cuenta usar al enviar recordatorios a leads de un host
-- concreto. La columna no existía → la query devolvía siempre [] → todos
-- los reminders se mandaban con account_index=1 (default).
--
-- Backfill: por account_label match contra client_operators.display_name
-- o slug. Si no hay match, queda NULL (caller cae a default 1).
--
-- Idempotente.
-- ROLLBACK: ALTER TABLE whatsapp_config DROP COLUMN IF EXISTS operator_id;

ALTER TABLE whatsapp_config
  ADD COLUMN IF NOT EXISTS operator_id UUID REFERENCES client_operators(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_whatsapp_config_operator
  ON whatsapp_config(operator_id) WHERE operator_id IS NOT NULL;

UPDATE whatsapp_config wc
SET operator_id = co.id
FROM client_operators co
WHERE wc.operator_id IS NULL
  AND wc.account_label IS NOT NULL
  AND TRIM(wc.account_label) != ''
  AND co.client_id = wc.client_id
  AND (
    LOWER(co.display_name) = LOWER(TRIM(wc.account_label))
    OR LOWER(co.slug) = LOWER(TRIM(wc.account_label))
  );
