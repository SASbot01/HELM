-- 046 · Seed Portillo + Lukas como operadores de asesorias-suiza
-- Idempotente — re-ejecución sin efectos.

INSERT INTO client_operators (client_id, slug, display_name, email, status, sort_order)
SELECT c.id, 'portillo', 'Portillo', 'portillofischer@gmail.com', 'active', 1
FROM clients c
WHERE c.slug = 'asesorias-suiza'
ON CONFLICT (client_id, slug) DO NOTHING;

INSERT INTO client_operators (client_id, slug, display_name, email, status, sort_order)
SELECT c.id, 'lukas', 'Lukas', NULL, 'active', 2
FROM clients c
WHERE c.slug = 'asesorias-suiza'
ON CONFLICT (client_id, slug) DO NOTHING;
