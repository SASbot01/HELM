-- Phase 2C: Per-client programmable chatbots

CREATE TABLE IF NOT EXISTS chatbot_configs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Mi Chatbot',
  system_prompt text DEFAULT '',
  instructions text DEFAULT '',
  knowledge_base jsonb DEFAULT '[]',
  settings jsonb DEFAULT '{}',
  active boolean DEFAULT true,
  created_by text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chatbot_configs_client ON chatbot_configs(client_id);
ALTER TABLE chatbot_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chatbot_configs_all" ON chatbot_configs FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS chatbot_knowledge (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  chatbot_id uuid NOT NULL REFERENCES chatbot_configs(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('faq', 'document', 'conversation_learned', 'note')),
  title text DEFAULT '',
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chatbot_knowledge_chatbot ON chatbot_knowledge(chatbot_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_knowledge_client ON chatbot_knowledge(client_id);
ALTER TABLE chatbot_knowledge ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chatbot_knowledge_all" ON chatbot_knowledge FOR ALL USING (true) WITH CHECK (true);
