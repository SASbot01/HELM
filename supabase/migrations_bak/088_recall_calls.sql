Aa                -- 088_recall_calls.sql
-- Recall.ai integration — graba y transcribe llamadas de Meet/Zoom/Teams.
-- Tecnología portada desde ~/ora; disponible para TODOS los tenants del
-- shell apex-operations (apex, black-wolf, creator-founder, asesorias-suiza,
-- nayra, enformaconhugo, detras-de-camara).
--
-- Pipeline:
--   1. /api/recall/upcoming-calls — lista eventos del Google Calendar del
--      member logueado, los clasifica vía callClassifier (reglas + Claude).
--   2. /api/recall/auto-schedule  — para cada call shouldAttachBot=true,
--      crea un Recall bot con join_at = startISO. Devuelve bot_id.
--   3. Recall webhook llama /api/recall/webhook con bot.status_change,
--      transcript.data (segmentos en vivo) y bot.done.
--   4. /api/recall/finalize       — al terminar, descarga transcript + video
--      desde Recall, llama Claude para summary + feedback, guarda todo en
--      esta tabla.
--
-- Idempotente.

CREATE TABLE IF NOT EXISTS recall_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  member_id uuid REFERENCES team(id) ON DELETE SET NULL,

  -- Recall bot identity
  bot_id text NOT NULL,
  meeting_url text NOT NULL,
  platform text,                            -- 'google_meet' | 'zoom' | 'microsoft_teams'
  meeting_id text,

  -- Metadata del evento de calendar (cuando viene de auto-schedule)
  calendar_event_id text,
  title text,
  closer_email text,
  classification jsonb,                     -- output del callClassifier (kind, label, reason, confidence)

  -- Lifecycle
  status text NOT NULL DEFAULT 'scheduled', -- scheduled | joining | in_call_recording | in_call_not_recording | done | fatal
  scheduled_at timestamptz,                 -- join_at enviado a Recall
  started_at timestamptz,                   -- bot empezó a grabar
  ended_at timestamptz,                     -- bot terminó

  -- CRM link (auto-match por email de participantes)
  contact_id uuid REFERENCES crm_contacts(id) ON DELETE SET NULL,
  participants jsonb DEFAULT '[]'::jsonb,   -- [{email, name, status}, ...]

  -- Resultados post-call
  recording_url text,
  transcript jsonb DEFAULT '[]'::jsonb,     -- [{speaker, text, startMs, endMs}, ...]
  summary text,                             -- markdown
  feedback text,                            -- markdown (puntos fuertes / mejorar)
  action_items jsonb DEFAULT '[]'::jsonb,
  keywords text[] DEFAULT '{}',

  -- Auditoría
  raw_webhook_events jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  UNIQUE (client_id, bot_id)
);

CREATE INDEX IF NOT EXISTS idx_recall_calls_client     ON recall_calls (client_id, scheduled_at DESC);
CREATE INDEX IF NOT EXISTS idx_recall_calls_status     ON recall_calls (client_id, status);
CREATE INDEX IF NOT EXISTS idx_recall_calls_contact    ON recall_calls (contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_recall_calls_member     ON recall_calls (member_id, scheduled_at DESC) WHERE member_id IS NOT NULL;

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_recall_calls_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_recall_calls_updated_at ON recall_calls;
CREATE TRIGGER trg_recall_calls_updated_at
  BEFORE UPDATE ON recall_calls
  FOR EACH ROW EXECUTE FUNCTION update_recall_calls_timestamp();

-- RLS: anon full (igual que el resto de tablas del platform — el guard real
-- vive en los endpoints del API que filtran por client_id de la sesión).
ALTER TABLE recall_calls ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for anon" ON recall_calls;
CREATE POLICY "Allow all for anon" ON recall_calls FOR ALL USING (true) WITH CHECK (true);
