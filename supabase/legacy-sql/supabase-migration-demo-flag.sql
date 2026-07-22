-- Marca a los tenants de demo (p.ej. 'minimal') para excluirlos de los
-- agregados del admin (revenue total, clientes activos, etc.).
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

UPDATE clients SET is_demo = true WHERE slug = 'minimal';
