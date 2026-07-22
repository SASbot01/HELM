-- Fireflies Transcripts Cache
-- Stores synced call transcriptions from Fireflies.ai, linked to CRM contacts

CREATE TABLE IF NOT EXISTS fireflies_transcripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id),
  fireflies_id text NOT NULL,
  contact_id uuid REFERENCES crm_contacts(id) ON DELETE SET NULL,
  title text,
  date timestamptz,
  duration real,
  organizer_email text,
  participants text[],
  summary_overview text,
  summary_action_items text,
  summary_keywords text[],
  summary_short text,
  transcript_url text,
  audio_url text,
  meeting_link text,
  sentences jsonb,
  synced_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE(client_id, fireflies_id)
);

CREATE INDEX IF NOT EXISTS idx_fireflies_contact ON fireflies_transcripts(contact_id);
CREATE INDEX IF NOT EXISTS idx_fireflies_client ON fireflies_transcripts(client_id);
CREATE INDEX IF NOT EXISTS idx_fireflies_date ON fireflies_transcripts(date DESC);
