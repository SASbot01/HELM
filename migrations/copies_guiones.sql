-- Copies & Guiones — scripts de contenido y copies para comunidades WhatsApp

CREATE TABLE IF NOT EXISTS copies_guiones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('guion', 'copy')),
  name text NOT NULL,
  content text NOT NULL DEFAULT '',
  guion_type text,
  format text,
  comunidad_asset_id uuid REFERENCES info_producto_assets(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'borrador' CHECK (status IN ('borrador', 'activo', 'enviado', 'archivado')),
  sent_count int DEFAULT 0,
  last_sent_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_copies_guiones_client ON copies_guiones(client_id);
CREATE INDEX IF NOT EXISTS idx_copies_guiones_cat ON copies_guiones(client_id, category);

ALTER TABLE copies_guiones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on copies_guiones" ON copies_guiones
  FOR ALL USING (true) WITH CHECK (true);
