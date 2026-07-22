-- Calendly OAuth integration: token storage + booking link columns

CREATE TABLE IF NOT EXISTS calendly_auth (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  token_type text DEFAULT 'Bearer',
  expires_at timestamptz NOT NULL,
  calendly_user_uri text,
  calendly_org_uri text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(client_id)
);

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS calendly_event_uri text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS calendly_invitee_uri text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS crm_contact_id uuid REFERENCES crm_contacts(id);

CREATE INDEX IF NOT EXISTS idx_bookings_calendly_invitee ON bookings(calendly_invitee_uri) WHERE calendly_invitee_uri IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_calendly_event ON bookings(calendly_event_uri) WHERE calendly_event_uri IS NOT NULL;
