-- 099 · account_signups — auto-registro SaaS abierto con confirmación por email.
--
-- Flujo (self-service, sin invitación):
--   1) El visitante rellena /registro (nombre de negocio + email + password).
--      → POST /api/auth?action=signup crea una fila `pending` aquí y envía un
--        email vía Resend con un link `/confirmar?token=...`.
--   2) El visitante abre el link.
--      → POST /api/auth?action=confirm-signup materializa el cliente:
--        crea `clients` + pipeline por defecto + `team` (owner) y marca
--        la fila como `confirmed`. Devuelve una auth_session para auto-login.
--
-- Mantener el registro pendiente aquí (y NO crear el `clients` hasta confirmar)
-- evita ensuciar la lista de perfiles con cuentas sin verificar.
--
-- Los endpoints usan SERVICE_KEY (bypass RLS). Habilitamos RLS sin políticas
-- para que la anon key del frontend NO pueda leer hashes ni tokens.
--
-- Idempotente. ROLLBACK: DROP TABLE IF EXISTS account_signups;

CREATE TABLE IF NOT EXISTS account_signups (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email          TEXT NOT NULL,
  password_hash  TEXT NOT NULL,                 -- werkzeug-scrypt (compatible con team.password_hash)
  business_name  TEXT NOT NULL,
  slug           TEXT,                          -- slug propuesto; se re-verifica al confirmar
  token          TEXT NOT NULL UNIQUE,          -- 64-char random hex del link de confirmación
  status         TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','confirmed','expired')),
  client_id      UUID REFERENCES clients(id) ON DELETE SET NULL,  -- set al confirmar
  ip             INET,
  user_agent     TEXT,
  expires_at     TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '2 days'),
  confirmed_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_account_signups_token ON account_signups(token);
CREATE INDEX IF NOT EXISTS idx_account_signups_email ON account_signups(lower(email));

-- Solo una solicitud pendiente por email a la vez (evita spam de reenvíos).
CREATE UNIQUE INDEX IF NOT EXISTS idx_account_signups_one_pending
  ON account_signups(lower(email)) WHERE status = 'pending';

ALTER TABLE account_signups ENABLE ROW LEVEL SECURITY;
-- Sin políticas: solo el service role (endpoints serverless) puede tocar la tabla.

-- Columnas que el flujo de owner necesita en `team` (defensivo/idempotente):
-- el login server-side (api/auth) ya lee password_hash; owner_scope marca al
-- dueño del perfil. IF NOT EXISTS para no chocar con instalaciones donde ya existen.
ALTER TABLE team ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE team ADD COLUMN IF NOT EXISTS owner_scope   VARCHAR(32);

COMMENT ON TABLE account_signups IS
  'Registros SaaS pendientes de confirmación por email. Al confirmar se materializa clients+team.';
