-- 045 · client_operators (tabla genérica para "perfiles dentro del cliente")
-- Análoga a `stores` de FBA Academy, pero genérica y reutilizable.
-- Caso de uso inicial: separar Portillo y Lukas dentro de asesorias-suiza.
-- Idempotente — ejecutar varias veces es seguro.

CREATE TABLE IF NOT EXISTS client_operators (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  slug          VARCHAR(64) NOT NULL,
  display_name  VARCHAR(120) NOT NULL,
  email         VARCHAR(160),
  avatar_url    TEXT,
  short_bio     TEXT,
  status        VARCHAR(16) NOT NULL DEFAULT 'active',
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'client_operators_client_slug_key'
  ) THEN
    ALTER TABLE client_operators
      ADD CONSTRAINT client_operators_client_slug_key UNIQUE (client_id, slug);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'client_operators_status_chk'
  ) THEN
    ALTER TABLE client_operators
      ADD CONSTRAINT client_operators_status_chk
      CHECK (status IN ('active', 'paused'));
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_client_operators_client ON client_operators(client_id);
