-- EMAIL MARKETING TABLES
CREATE TABLE IF NOT EXISTS email_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS email_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL,
  list_id UUID REFERENCES email_lists(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT DEFAULT '',
  status TEXT DEFAULT 'subscribed',
  tags JSONB DEFAULT '[]',
  custom_data JSONB DEFAULT '{}',
  subscribed_at TIMESTAMPTZ DEFAULT now(),
  unsubscribed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL,
  name TEXT NOT NULL,
  subject TEXT DEFAULT '',
  html_content TEXT DEFAULT '',
  json_content JSONB DEFAULT '{}',
  category TEXT DEFAULT 'general',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS email_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL,
  name TEXT NOT NULL,
  subject TEXT DEFAULT '',
  from_name TEXT DEFAULT '',
  from_email TEXT DEFAULT '',
  reply_to TEXT DEFAULT '',
  list_id UUID REFERENCES email_lists(id),
  template_id UUID REFERENCES email_templates(id),
  html_content TEXT DEFAULT '',
  status TEXT DEFAULT 'draft',
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  total_sent INT DEFAULT 0,
  total_opened INT DEFAULT 0,
  total_clicked INT DEFAULT 0,
  total_bounced INT DEFAULT 0,
  total_unsubscribed INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- CHATBOT / MANYCHAT TABLES
CREATE TABLE IF NOT EXISTS chat_flows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  trigger_type TEXT DEFAULT 'keyword',
  trigger_value TEXT DEFAULT '',
  channel TEXT DEFAULT 'instagram',
  active BOOLEAN DEFAULT true,
  nodes JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL,
  platform_id TEXT DEFAULT '',
  platform TEXT DEFAULT 'instagram',
  name TEXT DEFAULT '',
  username TEXT DEFAULT '',
  email TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  avatar_url TEXT DEFAULT '',
  tags JSONB DEFAULT '[]',
  custom_data JSONB DEFAULT '{}',
  last_interaction TIMESTAMPTZ DEFAULT now(),
  subscribed BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL,
  contact_id UUID REFERENCES chat_contacts(id) ON DELETE CASCADE,
  flow_id UUID REFERENCES chat_flows(id),
  channel TEXT DEFAULT 'instagram',
  status TEXT DEFAULT 'active',
  assigned_to TEXT DEFAULT '',
  last_message TEXT DEFAULT '',
  last_message_at TIMESTAMPTZ DEFAULT now(),
  unread_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL,
  conversation_id UUID REFERENCES chat_conversations(id) ON DELETE CASCADE,
  sender_type TEXT DEFAULT 'contact',
  content TEXT DEFAULT '',
  message_type TEXT DEFAULT 'text',
  media_url TEXT DEFAULT '',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_broadcasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL,
  name TEXT NOT NULL,
  channel TEXT DEFAULT 'instagram',
  message_content TEXT DEFAULT '',
  message_type TEXT DEFAULT 'text',
  media_url TEXT DEFAULT '',
  target_tags JSONB DEFAULT '[]',
  status TEXT DEFAULT 'draft',
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  total_sent INT DEFAULT 0,
  total_delivered INT DEFAULT 0,
  total_read INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- EMAIL CONFIG (stores Resend API key, sender info per client)
CREATE TABLE IF NOT EXISTS email_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL UNIQUE,
  provider TEXT DEFAULT 'resend',
  api_key TEXT DEFAULT '',
  from_name TEXT DEFAULT '',
  from_email TEXT DEFAULT '',
  reply_to TEXT DEFAULT '',
  domain TEXT DEFAULT '',
  verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS policies (allow all for authenticated/service role)
ALTER TABLE email_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_broadcasts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all" ON email_config FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON email_lists FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON email_subscribers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON email_templates FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON email_campaigns FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON chat_flows FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON chat_contacts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON chat_conversations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON chat_messages FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON chat_broadcasts FOR ALL USING (true) WITH CHECK (true);
