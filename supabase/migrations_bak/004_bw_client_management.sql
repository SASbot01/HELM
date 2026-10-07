-- BlackWolf Client Management: onboarding, deliverables, support tickets
-- Each "client project" maps to a client in the clients table

CREATE TABLE IF NOT EXISTS bw_client_projects (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  target_client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'onboarding',  -- onboarding, active, upsell_ready, churned
  closer text DEFAULT '',
  product text DEFAULT '',
  sale_date date,
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  UNIQUE(target_client_id)
);

CREATE TABLE IF NOT EXISTS bw_onboarding_steps (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES bw_client_projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text DEFAULT '',
  position integer DEFAULT 0,
  completed boolean DEFAULT false,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bw_client_deliverables (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES bw_client_projects(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'link',  -- video, file, link
  title text NOT NULL,
  url text DEFAULT '',
  description text DEFAULT '',
  position integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bw_support_tickets (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES bw_client_projects(id) ON DELETE CASCADE,
  subject text NOT NULL,
  status text NOT NULL DEFAULT 'open',  -- open, in_progress, resolved, closed
  priority text NOT NULL DEFAULT 'medium',  -- low, medium, high, urgent
  category text DEFAULT 'general',  -- general, technical, billing, feature_request
  created_by text DEFAULT '',
  assigned_to text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bw_ticket_messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_id uuid NOT NULL REFERENCES bw_support_tickets(id) ON DELETE CASCADE,
  sender text NOT NULL,
  sender_type text NOT NULL DEFAULT 'team',  -- team, client
  message text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Indices
CREATE INDEX IF NOT EXISTS idx_bw_projects_target ON bw_client_projects(target_client_id);
CREATE INDEX IF NOT EXISTS idx_bw_steps_project ON bw_onboarding_steps(project_id);
CREATE INDEX IF NOT EXISTS idx_bw_deliverables_project ON bw_client_deliverables(project_id);
CREATE INDEX IF NOT EXISTS idx_bw_tickets_project ON bw_support_tickets(project_id);
CREATE INDEX IF NOT EXISTS idx_bw_ticket_msgs ON bw_ticket_messages(ticket_id);

-- RLS
ALTER TABLE bw_client_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE bw_onboarding_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE bw_client_deliverables ENABLE ROW LEVEL SECURITY;
ALTER TABLE bw_support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE bw_ticket_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon full access" ON bw_client_projects FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon full access" ON bw_onboarding_steps FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon full access" ON bw_client_deliverables FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon full access" ON bw_support_tickets FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon full access" ON bw_ticket_messages FOR ALL USING (true) WITH CHECK (true);
