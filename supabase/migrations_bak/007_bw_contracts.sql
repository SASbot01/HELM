-- Contracts & invoices for Growth client management
-- Organized by folders, with AI-generated contract content and email sending.

CREATE TABLE IF NOT EXISTS bw_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES bw_client_projects(id) ON DELETE CASCADE,
  folder TEXT NOT NULL DEFAULT 'General',
  title TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft', -- draft, sent, signed, cancelled
  contract_html TEXT DEFAULT '',
  template_html TEXT DEFAULT '', -- base template used to generate
  client_data JSONB DEFAULT '{}', -- snapshot of client data used in generation
  sent_to_email TEXT DEFAULT '',
  sent_at TIMESTAMPTZ,
  signed_at TIMESTAMPTZ,
  file_url TEXT DEFAULT '', -- uploaded PDF/file URL in Supabase Storage
  notes TEXT DEFAULT '',
  created_by TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bw_contracts_project ON bw_contracts(project_id);
CREATE INDEX IF NOT EXISTS idx_bw_contracts_folder ON bw_contracts(project_id, folder);

ALTER TABLE bw_contracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON bw_contracts FOR ALL USING (true) WITH CHECK (true);
