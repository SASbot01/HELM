-- supabase-migration-demo-funnel.sql
-- Landing demo funnel: demo clients, Landing Minimal pipeline, onboarding answers

-- 1) clients: campos para demo trial + onboarding
ALTER TABLE clients ADD COLUMN IF NOT EXISTS demo_started_at TIMESTAMPTZ;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS demo_expires_at TIMESTAMPTZ;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS onboarded_at   TIMESTAMPTZ;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS onboarding_answers JSONB DEFAULT '{}'::jsonb;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS source_utm     JSONB DEFAULT '{}'::jsonb;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS lead_phone     TEXT;

COMMENT ON COLUMN clients.client_type IS 'growth | manufactura | consultoria | admin | demo';

CREATE INDEX IF NOT EXISTS idx_clients_demo_expires
  ON clients (demo_expires_at)
  WHERE client_type = 'demo';

-- 2) Pipeline "Landing Minimal" bajo el cliente interno black-wolf
INSERT INTO crm_pipelines (client_id, name, stages, is_default)
SELECT
  c.id,
  'Landing Minimal',
  jsonb_build_array(
    jsonb_build_object('key','pidedemo','label','PIDEDEMO','color','#F59E0B','description','Dejo email y telefono en la landing'),
    jsonb_build_object('key','demo_configurada','label','DEMO CONFIGURADA','color','#22C55E','description','Completo onboarding y agendo llamada con Alex')
  ),
  false
FROM clients c
WHERE c.slug = 'black-wolf'
  AND NOT EXISTS (
    SELECT 1 FROM crm_pipelines p
    WHERE p.client_id = c.id AND p.name = 'Landing Minimal'
  );

-- 3) Tabla para discovery del onboarding estándar (usuarios nuevos de cualquier cliente)
CREATE TABLE IF NOT EXISTS user_onboarding_answers (
  id             BIGSERIAL PRIMARY KEY,
  client_id      UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  team_id        UUID REFERENCES team(id) ON DELETE CASCADE,
  user_email     TEXT NOT NULL,
  role           TEXT,
  source         TEXT,                  -- de dónde viene (recomendación, google, linkedin, etc)
  crm_experience TEXT,                  -- nunca / basica / avanzada
  prev_tools     JSONB DEFAULT '[]'::jsonb,
  main_goal      TEXT,
  extra          JSONB DEFAULT '{}'::jsonb,
  completed_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (client_id, user_email)
);

CREATE INDEX IF NOT EXISTS idx_user_onboarding_client
  ON user_onboarding_answers (client_id);

-- 4) Rate limit signups landing (anti-abuse /api/demo-signup)
CREATE TABLE IF NOT EXISTS demo_signup_attempts (
  id         BIGSERIAL PRIMARY KEY,
  ip         TEXT NOT NULL,
  email      TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_demo_signup_attempts_ip_time
  ON demo_signup_attempts (ip, created_at DESC);
