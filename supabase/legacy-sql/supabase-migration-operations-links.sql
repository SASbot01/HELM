-- Tabla compartida de links (Looms, landings, calendarios, etc) por cliente.
-- Antes vivía en localStorage → cada navegador tenía su propia copia.
-- Ahora vive en Supabase y se sincroniza entre todos los ordenadores.

CREATE TABLE IF NOT EXISTS operations_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  url text NOT NULL,
  category text DEFAULT 'Other',
  description text DEFAULT '',
  tags jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_operations_links_client ON operations_links (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_operations_links_category ON operations_links (client_id, category);

ALTER TABLE operations_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for anon" ON operations_links;
CREATE POLICY "Allow all for anon" ON operations_links FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS operations_links_updated_at ON operations_links;
CREATE TRIGGER operations_links_updated_at
  BEFORE UPDATE ON operations_links
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
