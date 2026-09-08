-- WhatsApp per-client configuration (replaces manychat_config for WhatsApp)
CREATE TABLE IF NOT EXISTS whatsapp_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL UNIQUE,
  connected BOOLEAN DEFAULT false,
  phone_number TEXT DEFAULT '',
  allowed_numbers TEXT DEFAULT '',
  group_id TEXT DEFAULT '',
  setter_enabled BOOLEAN DEFAULT false,
  setter_message TEXT DEFAULT '',
  setter_delay_minutes INT DEFAULT 5,
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_config_client ON whatsapp_config(client_id);
