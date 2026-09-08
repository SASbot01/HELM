-- ============================================
-- ManyChat config per client (WhatsApp + Instagram via ManyChat API)
-- La tabla la usa Dashboard-Ops- (getManychatConfig/saveManychatConfig)
-- y AiSetterPage.jsx para enviar mensajes por /fb/sending/sendContent.
-- ============================================

CREATE TABLE IF NOT EXISTS manychat_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid UNIQUE REFERENCES clients(id) ON DELETE CASCADE,
  api_key text,
  page_id text,
  webhook_secret text,
  auto_sync_crm boolean DEFAULT false,
  sync_tags text,
  last_sync timestamptz,
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_manychat_config_client ON manychat_config (client_id);

ALTER TABLE manychat_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role all" ON manychat_config;
CREATE POLICY "service_role all" ON manychat_config FOR ALL USING (true) WITH CHECK (true);
