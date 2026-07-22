-- ============================================================
-- AI Agent Chat — Persistent Conversations
-- ============================================================

CREATE TABLE IF NOT EXISTS agent_conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id),
  user_email TEXT,
  title TEXT NOT NULL DEFAULT 'Nueva conversación',
  context TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_agent_conversations_client ON agent_conversations(client_id);
CREATE INDEX idx_agent_conversations_updated ON agent_conversations(updated_at DESC);

CREATE TABLE IF NOT EXISTS agent_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES agent_conversations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id),
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_agent_messages_conversation ON agent_messages(conversation_id);
CREATE INDEX idx_agent_messages_created ON agent_messages(created_at ASC);

-- RLS
ALTER TABLE agent_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all agent_conversations" ON agent_conversations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all agent_messages" ON agent_messages FOR ALL USING (true) WITH CHECK (true);
