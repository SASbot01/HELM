-- Task Management V2: Enhanced tasks, roadmaps, objectives
-- Run this migration in Supabase SQL Editor

-- 1. Create roadmaps table FIRST (crm_tasks will reference it)
CREATE TABLE IF NOT EXISTS roadmaps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  month text NOT NULL DEFAULT '',          -- '2026-04' format
  description text DEFAULT '',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'completed')),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_roadmaps_client ON roadmaps(client_id);
CREATE INDEX idx_roadmaps_month ON roadmaps(month);

ALTER TABLE roadmaps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on roadmaps" ON roadmaps
  FOR ALL USING (true) WITH CHECK (true);

-- 2. Create roadmap_objectives table
CREATE TABLE IF NOT EXISTS roadmap_objectives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  roadmap_id uuid NOT NULL REFERENCES roadmaps(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  description text DEFAULT '',
  kpi_label text DEFAULT '',               -- e.g. 'Revenue target'
  kpi_target numeric DEFAULT 0,
  kpi_current numeric DEFAULT 0,
  position int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_roadmap_objectives_roadmap ON roadmap_objectives(roadmap_id);

ALTER TABLE roadmap_objectives ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on roadmap_objectives" ON roadmap_objectives
  FOR ALL USING (true) WITH CHECK (true);

-- 3. Alter crm_tasks: add new columns
ALTER TABLE crm_tasks
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'todo',
  ADD COLUMN IF NOT EXISTS estimated_hours numeric,
  ADD COLUMN IF NOT EXISTS actual_hours numeric,
  ADD COLUMN IF NOT EXISTS roadmap_id uuid REFERENCES roadmaps(id) ON DELETE SET NULL;

-- Add check constraints
ALTER TABLE crm_tasks ADD CONSTRAINT crm_tasks_category_check
  CHECK (category IN ('project', 'support', 'ai', 'general'));

ALTER TABLE crm_tasks ADD CONSTRAINT crm_tasks_status_check
  CHECK (status IN ('todo', 'in_progress', 'review', 'done'));

CREATE INDEX idx_crm_tasks_roadmap ON crm_tasks(roadmap_id);
CREATE INDEX idx_crm_tasks_status ON crm_tasks(status);
CREATE INDEX idx_crm_tasks_category ON crm_tasks(category);

-- 4. Backfill: sync existing completed tasks to status='done'
UPDATE crm_tasks SET status = 'done' WHERE completed = true AND status = 'todo';
