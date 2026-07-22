-- 079_onboarding_keys.sql
-- API keys de un solo uso para gatear /onboarding. Solo un admin de
-- BlackWolf puede generar keys; cada key abre el wizard una vez y se
-- consume al completar la creación del tenant.

CREATE TABLE IF NOT EXISTS onboarding_keys (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key                TEXT UNIQUE NOT NULL,
  created_by_email   TEXT,                                     -- email del admin BW
  notes              TEXT,                                     -- ej "para llamada con Juan"
  expires_at         TIMESTAMPTZ,                              -- opcional
  used_at            TIMESTAMPTZ,
  used_by_client_id  UUID REFERENCES clients(id) ON DELETE SET NULL,
  used_by_email      TEXT,                                     -- email del admin del tenant creado
  revoked_at         TIMESTAMPTZ,                              -- soft delete
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS onboarding_keys_state_idx
  ON onboarding_keys (used_at, revoked_at, expires_at);

COMMENT ON TABLE onboarding_keys IS
  'API keys de un solo uso para acceder a /onboarding. Generadas por admin BW desde /black-wolf/settings/nuevos-clientes. Consumidas al completar tenant-setup.';
