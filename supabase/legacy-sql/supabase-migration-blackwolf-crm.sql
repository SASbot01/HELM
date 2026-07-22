-- ============================================
-- BlackWolf Central - Migration: Black Wolf Client + Cold Call Reports + CRM
-- ============================================

-- =============================================
-- 1. BLACK WOLF CLIENT
-- =============================================
INSERT INTO clients (slug, name, logo_url, primary_color, secondary_color, bg_color, bg_card_color, bg_sidebar_color, border_color, text_color, text_secondary_color) VALUES
  ('black-wolf', 'Black Wolf', '/assets/logos/blackwolf-logo.png', '#6366F1', '#818CF8', '#09090B', '#111113', '#09090B', '#1E1E24', '#FFFFFF', '#A1A1AA')
ON CONFLICT (slug) DO NOTHING;

-- SuperAdmin Commission for Black Wolf
INSERT INTO superadmin_commissions (client_id, commission_rate)
SELECT id, 0 FROM clients WHERE slug = 'black-wolf'
ON CONFLICT (client_id) DO NOTHING;

-- Payment Fees (Black Wolf)
INSERT INTO payment_fees (client_id, method, fee_rate)
SELECT id, 'Transferencia', 0 FROM clients WHERE slug = 'black-wolf'
ON CONFLICT (client_id, method) DO NOTHING;
INSERT INTO payment_fees (client_id, method, fee_rate)
SELECT id, 'Stripe', 0.029 FROM clients WHERE slug = 'black-wolf'
ON CONFLICT (client_id, method) DO NOTHING;
INSERT INTO payment_fees (client_id, method, fee_rate)
SELECT id, 'PayPal', 0.035 FROM clients WHERE slug = 'black-wolf'
ON CONFLICT (client_id, method) DO NOTHING;
INSERT INTO payment_fees (client_id, method, fee_rate)
SELECT id, 'Tarjeta', 0.015 FROM clients WHERE slug = 'black-wolf'
ON CONFLICT (client_id, method) DO NOTHING;

-- Team (Black Wolf - SuperAdmin)
INSERT INTO team (client_id, name, email, password, role, active, commission_rate)
SELECT id, 'Alex', 'alex@blackwolfsec.io', 'BlackWolf88', 'ceo,director', true, 0 FROM clients WHERE slug = 'black-wolf'
ON CONFLICT (client_id, email) DO NOTHING;

-- N8n Config (Black Wolf)
INSERT INTO n8n_config (client_id, webhook_url, api_key, enabled, last_sync)
SELECT id, '', '', false, NULL FROM clients WHERE slug = 'black-wolf';


-- =============================================
-- 2. COLD CALL REPORTS
-- =============================================
-- Add 'cold_caller' as valid role in reports
ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_role_check;
ALTER TABLE reports ADD CONSTRAINT reports_role_check CHECK (role IN ('setter', 'closer', 'cold_caller'));

-- Add cold call specific columns to reports
ALTER TABLE reports ADD COLUMN IF NOT EXISTS deals integer DEFAULT 0;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS pick_ups integer DEFAULT 0;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS offers integer DEFAULT 0;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS schedule_calls integer DEFAULT 0;


-- =============================================
-- 3. CRM TABLES
-- =============================================

-- 3a. CRM Custom Fields Definition
CREATE TABLE IF NOT EXISTS crm_custom_fields (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  field_key text NOT NULL,
  field_type text NOT NULL DEFAULT 'text' CHECK (field_type IN ('text', 'number', 'date', 'select', 'multiselect', 'checkbox', 'url', 'email', 'phone', 'currency', 'textarea')),
  options jsonb DEFAULT '[]',
  required boolean DEFAULT false,
  position integer DEFAULT 0,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(client_id, field_key)
);

CREATE INDEX IF NOT EXISTS idx_crm_custom_fields_client ON crm_custom_fields(client_id);
ALTER TABLE crm_custom_fields ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on crm_custom_fields" ON crm_custom_fields
  FOR ALL USING (true) WITH CHECK (true);


-- 3b. CRM Contacts (Leads/Prospects/Customers)
CREATE TABLE IF NOT EXISTS crm_contacts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  email text DEFAULT '',
  phone text DEFAULT '',
  company text DEFAULT '',
  position text DEFAULT '',
  instagram text DEFAULT '',
  country text DEFAULT '',
  source text DEFAULT '',
  status text NOT NULL DEFAULT 'lead' CHECK (status IN ('lead', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost', 'churned')),
  assigned_to text DEFAULT '',
  tags jsonb DEFAULT '[]',
  custom_fields jsonb DEFAULT '{}',
  notes text DEFAULT '',
  deal_value numeric DEFAULT 0,
  last_activity_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_contacts_client ON crm_contacts(client_id);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_status ON crm_contacts(status);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_assigned ON crm_contacts(assigned_to);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_email ON crm_contacts(email);
ALTER TABLE crm_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on crm_contacts" ON crm_contacts
  FOR ALL USING (true) WITH CHECK (true);


-- 3c. CRM Activities (interactions like calls, emails, meetings)
CREATE TABLE IF NOT EXISTS crm_activities (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES crm_contacts(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'note' CHECK (type IN ('note', 'call', 'email', 'meeting', 'task', 'whatsapp', 'custom')),
  custom_type text DEFAULT '',
  title text DEFAULT '',
  description text DEFAULT '',
  outcome text DEFAULT '',
  duration_minutes integer DEFAULT 0,
  performed_by text DEFAULT '',
  performed_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_activities_client ON crm_activities(client_id);
CREATE INDEX IF NOT EXISTS idx_crm_activities_contact ON crm_activities(contact_id);
CREATE INDEX IF NOT EXISTS idx_crm_activities_type ON crm_activities(type);
ALTER TABLE crm_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on crm_activities" ON crm_activities
  FOR ALL USING (true) WITH CHECK (true);


-- 3d. CRM Smart Views (saved filters/views)
CREATE TABLE IF NOT EXISTS crm_smart_views (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  filters jsonb NOT NULL DEFAULT '{}',
  columns jsonb DEFAULT '[]',
  sort_by text DEFAULT 'created_at',
  sort_dir text DEFAULT 'desc',
  color text DEFAULT '#6366F1',
  icon text DEFAULT '',
  position integer DEFAULT 0,
  created_by text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_smart_views_client ON crm_smart_views(client_id);
ALTER TABLE crm_smart_views ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on crm_smart_views" ON crm_smart_views
  FOR ALL USING (true) WITH CHECK (true);


-- 3e. CRM Pipelines (for Kanban customization)
CREATE TABLE IF NOT EXISTS crm_pipelines (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Default Pipeline',
  stages jsonb NOT NULL DEFAULT '[
    {"key": "lead", "label": "Lead", "color": "#6366F1"},
    {"key": "contacted", "label": "Contactado", "color": "#F59E0B"},
    {"key": "qualified", "label": "Cualificado", "color": "#3B82F6"},
    {"key": "proposal", "label": "Propuesta", "color": "#8B5CF6"},
    {"key": "negotiation", "label": "Negociación", "color": "#EC4899"},
    {"key": "won", "label": "Ganado", "color": "#10B981"},
    {"key": "lost", "label": "Perdido", "color": "#EF4444"}
  ]',
  is_default boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_pipelines_client ON crm_pipelines(client_id);
ALTER TABLE crm_pipelines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on crm_pipelines" ON crm_pipelines
  FOR ALL USING (true) WITH CHECK (true);
