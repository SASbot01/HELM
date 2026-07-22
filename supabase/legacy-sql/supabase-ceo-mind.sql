-- ============================================================
-- CEO Mind — SQL Migration
-- 7 new tables for CEO visibility features
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. CEO Meetings (must be first — ceo_ideas references it)
CREATE TABLE IF NOT EXISTS ceo_meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id),
  title text NOT NULL,
  date date NOT NULL DEFAULT CURRENT_DATE,
  duration_minutes integer,
  participants text,
  summary text,
  action_items text,
  key_topics text,
  sentiment text CHECK (sentiment IN ('positive', 'negative', 'neutral', 'mixed')),
  transcript_url text,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled')),
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'fireflies', 'google_calendar')),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_ceo_meetings_client ON ceo_meetings (client_id);
CREATE INDEX idx_ceo_meetings_date ON ceo_meetings (client_id, date DESC);

-- 2. CEO Projects
CREATE TABLE IF NOT EXISTS ceo_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id),
  name text NOT NULL,
  description text,
  owner text,
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  status text NOT NULL DEFAULT 'idea' CHECK (status IN ('idea', 'planned', 'in_progress', 'paused', 'completed')),
  start_date date,
  end_date date,
  progress integer DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  tags text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_ceo_projects_client ON ceo_projects (client_id);
CREATE INDEX idx_ceo_projects_status ON ceo_projects (client_id, status);

-- 3. CEO Ideas (references ceo_meetings and ceo_projects)
CREATE TABLE IF NOT EXISTS ceo_ideas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id),
  title text NOT NULL,
  description text,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'meeting', 'ai_suggestion')),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewing', 'approved', 'discarded')),
  meeting_id uuid REFERENCES ceo_meetings(id) ON DELETE SET NULL,
  project_id uuid REFERENCES ceo_projects(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_ceo_ideas_client ON ceo_ideas (client_id);
CREATE INDEX idx_ceo_ideas_status ON ceo_ideas (client_id, status);

-- 4. CEO Daily Digests
CREATE TABLE IF NOT EXISTS ceo_daily_digests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id),
  date date NOT NULL,
  summary text,
  key_metrics text,
  decisions_needed text,
  highlights text,
  alerts text,
  generated_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE (client_id, date)
);

CREATE INDEX idx_ceo_daily_digests_date ON ceo_daily_digests (client_id, date DESC);

-- 5. CEO Weekly Digests
CREATE TABLE IF NOT EXISTS ceo_weekly_digests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id),
  week_start date NOT NULL,
  week_end date NOT NULL,
  numbers_summary text,
  executive_summary text,
  decisions_taken text,
  next_steps text,
  alerts text,
  generated_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE (client_id, week_start)
);

CREATE INDEX idx_ceo_weekly_digests_week ON ceo_weekly_digests (client_id, week_start DESC);

-- 6. CEO Team Notes (private CEO notes per team member)
CREATE TABLE IF NOT EXISTS ceo_team_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id),
  member_id uuid NOT NULL,
  note text,
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE (client_id, member_id)
);

CREATE INDEX idx_ceo_team_notes_member ON ceo_team_notes (client_id, member_id);

-- 7. CEO Integrations (Fase 2 prep)
CREATE TABLE IF NOT EXISTS ceo_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id),
  service text NOT NULL CHECK (service IN ('fireflies', 'google_calendar', 'google_drive')),
  api_key text,
  config jsonb DEFAULT '{}'::jsonb,
  enabled boolean DEFAULT false,
  last_sync timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE (client_id, service)
);

CREATE INDEX idx_ceo_integrations_service ON ceo_integrations (client_id, service);

-- ============================================================
-- Enable RLS on all tables
-- ============================================================
ALTER TABLE ceo_meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE ceo_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE ceo_ideas ENABLE ROW LEVEL SECURITY;
ALTER TABLE ceo_daily_digests ENABLE ROW LEVEL SECURITY;
ALTER TABLE ceo_weekly_digests ENABLE ROW LEVEL SECURITY;
ALTER TABLE ceo_team_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE ceo_integrations ENABLE ROW LEVEL SECURITY;

-- RLS policies: allow all for anon key (app handles auth via team table)
CREATE POLICY "Allow all for anon" ON ceo_meetings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON ceo_projects FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON ceo_ideas FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON ceo_daily_digests FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON ceo_weekly_digests FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON ceo_team_notes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON ceo_integrations FOR ALL USING (true) WITH CHECK (true);
