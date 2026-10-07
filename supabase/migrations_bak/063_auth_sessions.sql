-- 063 · auth_sessions — sesión independiente por miembro (#42 sprint mayor)
--
-- Modelo nuevo de auth (additive, no breaking). El flow legacy sigue
-- funcionando hasta que migremos completamente:
--   - localStorage.bw_client_<slug>_user (legacy)
--   - localStorage.bw_superadmin (legacy)
--
-- El flow nuevo emite tokens al iniciar sesión y el cliente puede usarlos
-- en lugar del localStorage legacy. Cuando todos los flows estén migrados,
-- depreciamos el legacy.
--
-- Schema:
--   auth_sessions
--     id           UUID PK
--     token        TEXT UNIQUE NOT NULL  -- random 64-char (no JWT — server-side state)
--     member_id    UUID REFERENCES team(id) ON DELETE CASCADE — null si superadmin
--     superadmin_id UUID — referencia opcional a admin row
--     client_id    UUID NOT NULL REFERENCES clients(id) — tenant activo de la sesión
--     ip           INET
--     user_agent   TEXT
--     created_at   TIMESTAMPTZ DEFAULT now()
--     last_used_at TIMESTAMPTZ DEFAULT now()
--     expires_at   TIMESTAMPTZ NOT NULL  -- típico: created_at + 30d
--     revoked_at   TIMESTAMPTZ
--
-- Idempotente.
-- ROLLBACK: DROP TABLE IF EXISTS auth_sessions;

CREATE TABLE IF NOT EXISTS auth_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token         TEXT NOT NULL UNIQUE,
  member_id     UUID REFERENCES team(id) ON DELETE CASCADE,
  superadmin_id UUID,
  client_id     UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  ip            INET,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days'),
  revoked_at    TIMESTAMPTZ,
  CHECK (member_id IS NOT NULL OR superadmin_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_token  ON auth_sessions(token) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_auth_sessions_member ON auth_sessions(member_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_auth_sessions_active ON auth_sessions(expires_at, revoked_at);

ALTER TABLE auth_sessions DISABLE ROW LEVEL SECURITY;

-- Helper: marcar como revoked todas las sesiones expiradas (rotation).
-- El cron diario podría llamar esto para limpiar.
COMMENT ON TABLE auth_sessions IS
  'Per-member auth sessions. Token random server-side (no JWT). Revoked al logout o expiry. Cliente envía Authorization: Bearer <token> en cada request.';
