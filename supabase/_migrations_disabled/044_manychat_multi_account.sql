-- 044 · manychat_config multi-account
-- Objetivo: permitir varias cuentas ManyChat por cliente (Portillo + Lukas en
-- asesorias-suiza). La tabla venía siendo 1:1 con client_id — la abrimos a
-- (client_id, account_index).
-- Idempotente — ejecutar varias veces es seguro.

ALTER TABLE manychat_config ADD COLUMN IF NOT EXISTS account_index integer NOT NULL DEFAULT 1;
ALTER TABLE manychat_config ADD COLUMN IF NOT EXISTS account_label varchar(64);
ALTER TABLE manychat_config ADD COLUMN IF NOT EXISTS owner_scope   varchar(32);

-- Remove old unique/PK on client_id si existe (antes era 1:1).
DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'manychat_config'::regclass
    AND contype IN ('u','p')
    AND array_length(conkey, 1) = 1
    AND conkey[1] = (SELECT attnum FROM pg_attribute WHERE attrelid = 'manychat_config'::regclass AND attname = 'client_id');
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE manychat_config DROP CONSTRAINT %I', cname);
  END IF;
END$$;

-- Unique compuesto (client_id, account_index).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'manychat_config_client_acctidx_key'
  ) THEN
    ALTER TABLE manychat_config
      ADD CONSTRAINT manychat_config_client_acctidx_key UNIQUE (client_id, account_index);
  END IF;
END$$;

-- CHECK para owner_scope en valores conocidos.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'manychat_config_owner_scope_chk'
  ) THEN
    ALTER TABLE manychat_config ADD CONSTRAINT manychat_config_owner_scope_chk
      CHECK (owner_scope IS NULL OR owner_scope IN ('portillo', 'lukas'));
  END IF;
END$$;

-- Seed asesorias-suiza: la fila existente queda como Portillo (cuenta 1).
-- No creamos la de Lukas — el user la dará de alta desde la UI cuando tenga
-- el api_key.
UPDATE manychat_config
SET account_index = 1,
    account_label = COALESCE(account_label, 'Portillo'),
    owner_scope   = COALESCE(owner_scope, 'portillo')
WHERE client_id = (SELECT id FROM clients WHERE slug = 'asesorias-suiza')
  AND (owner_scope IS NULL OR owner_scope = '');
