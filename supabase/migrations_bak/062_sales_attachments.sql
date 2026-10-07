-- 062 · sales.attachments — soporte multi-justificante por venta
--
-- Antes los justificantes se guardaban codificados dentro de sales.notes
-- (JSON con receiptUrl + receiptImagePath, máximo 1 archivo). Cliente FBA
-- pidió 5–8 archivos por venta (factura, transferencia, conversación, etc.).
--
-- Schema: array JSONB de objetos { type, path, name, uploaded_at }.
--   type: 'image' | 'url' | 'file'
--   path: storage path (Supabase Storage) o URL externa
--   name: nombre legible para el user
--   uploaded_at: ISO timestamp
--
-- Idempotente. Re-ejecutar es seguro.
-- ROLLBACK: ALTER TABLE sales DROP COLUMN IF EXISTS attachments;

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Índice GIN para queries por contenido (futuro: buscar ventas con justificante de tipo X)
CREATE INDEX IF NOT EXISTS idx_sales_attachments ON sales USING GIN (attachments);
