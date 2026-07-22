-- Phase 2A: Console API Keys for external integrations
CREATE TABLE IF NOT EXISTS console_api_keys (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  key_hash text NOT NULL,
  key_prefix text NOT NULL,
  scopes jsonb DEFAULT '["read"]',
  last_used_at timestamptz,
  expires_at timestamptz,
  active boolean DEFAULT true,
  created_by text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_console_api_keys_client ON console_api_keys(client_id);
CREATE INDEX IF NOT EXISTS idx_console_api_keys_hash ON console_api_keys(key_hash);

ALTER TABLE console_api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "console_api_keys_all" ON console_api_keys FOR ALL USING (true) WITH CHECK (true);
