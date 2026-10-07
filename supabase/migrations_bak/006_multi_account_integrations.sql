-- Multi-account integrations
-- Portillo and Luca need two WhatsApp numbers, two Resend accounts and two Gmail accounts.
-- Everything else is keyed by (client_id, account_index) with retro-compat default = 1.

-- 1. Flag per client
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS multi_account_integrations BOOLEAN NOT NULL DEFAULT false;

UPDATE clients SET multi_account_integrations = true WHERE slug IN ('portillo', 'luca');

-- 2. email_config: drop unique(client_id), add account_index + account_label, unique(client_id, account_index)
ALTER TABLE email_config
  ADD COLUMN IF NOT EXISTS account_index INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS account_label TEXT NOT NULL DEFAULT '';

DO $$
DECLARE
  cons_name text;
BEGIN
  SELECT conname INTO cons_name
    FROM pg_constraint
   WHERE conrelid = 'email_config'::regclass
     AND contype = 'u'
     AND pg_get_constraintdef(oid) ILIKE '%(client_id)%'
   LIMIT 1;
  IF cons_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE email_config DROP CONSTRAINT %I', cons_name);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS email_config_client_account_uidx
  ON email_config (client_id, account_index);

-- 3. whatsapp_config: same shape
ALTER TABLE whatsapp_config
  ADD COLUMN IF NOT EXISTS account_index INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS account_label TEXT NOT NULL DEFAULT '';

DO $$
DECLARE
  cons_name text;
BEGIN
  SELECT conname INTO cons_name
    FROM pg_constraint
   WHERE conrelid = 'whatsapp_config'::regclass
     AND contype = 'u'
     AND pg_get_constraintdef(oid) ILIKE '%(client_id)%'
   LIMIT 1;
  IF cons_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE whatsapp_config DROP CONSTRAINT %I', cons_name);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_config_client_account_uidx
  ON whatsapp_config (client_id, account_index);

-- 4. email_campaigns: remember which account each campaign sends from
ALTER TABLE email_campaigns
  ADD COLUMN IF NOT EXISTS account_index INT NOT NULL DEFAULT 1;

-- 5. user_integrations: allow two Google accounts per client (account_index applies across all services)
ALTER TABLE user_integrations
  ADD COLUMN IF NOT EXISTS account_index INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS account_label TEXT NOT NULL DEFAULT '';

DO $$
DECLARE
  cons_name text;
BEGIN
  SELECT conname INTO cons_name
    FROM pg_constraint
   WHERE conrelid = 'user_integrations'::regclass
     AND contype = 'u'
     AND pg_get_constraintdef(oid) ILIKE '%(client_id%member_id%service)%'
   LIMIT 1;
  IF cons_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE user_integrations DROP CONSTRAINT %I', cons_name);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS user_integrations_client_member_service_account_uidx
  ON user_integrations (client_id, member_id, service, account_index);
