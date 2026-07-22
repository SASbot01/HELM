-- ─────────────────────────────────────────────────────────────────────────────
-- Legal documents — contratos, facturas, NDAs, tax, propuestas.
-- Disponible para todos los tenants. Un archivo queda scoped por client_id.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS legal_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  title text NOT NULL,
  category text NOT NULL DEFAULT 'other'
    CHECK (category IN ('contract','invoice','nda','proposal','tax','other')),
  description text DEFAULT '',
  file_url text,                -- URL firmada / pública de Supabase Storage
  file_path text,               -- Path interno en el bucket
  file_name text,
  file_size bigint,
  file_type text,
  related_party text DEFAULT '',
  issue_date date,
  expiry_date date,
  amount numeric,
  currency text DEFAULT 'EUR',
  uploaded_by text,
  tags jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_legal_documents_client ON legal_documents (client_id);
CREATE INDEX IF NOT EXISTS idx_legal_documents_category ON legal_documents (client_id, category);
CREATE INDEX IF NOT EXISTS idx_legal_documents_created ON legal_documents (client_id, created_at DESC);

ALTER TABLE legal_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for anon" ON legal_documents;
CREATE POLICY "Allow all for anon" ON legal_documents FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS legal_documents_updated_at ON legal_documents;
CREATE TRIGGER legal_documents_updated_at
  BEFORE UPDATE ON legal_documents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Storage bucket para los archivos (correr en Supabase Dashboard si este DDL falla)
INSERT INTO storage.buckets (id, name, public)
VALUES ('legal-documents', 'legal-documents', true)
ON CONFLICT (id) DO NOTHING;

-- Políticas del bucket (permite lectura pública y upload con anon key)
DROP POLICY IF EXISTS "legal-documents upload" ON storage.objects;
CREATE POLICY "legal-documents upload" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'legal-documents');

DROP POLICY IF EXISTS "legal-documents read" ON storage.objects;
CREATE POLICY "legal-documents read" ON storage.objects
  FOR SELECT USING (bucket_id = 'legal-documents');

DROP POLICY IF EXISTS "legal-documents delete" ON storage.objects;
CREATE POLICY "legal-documents delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'legal-documents');
