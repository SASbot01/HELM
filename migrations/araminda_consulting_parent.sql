-- Araminda Consulting actua como tenant "portfolio" que agrupa FBA Academy y
-- YC Logistics. El director de operaciones loguea aqui y elige a cual entrar.
-- Los hijos siguen existiendo como tenants reales pero NO se listan en el panel.

-- 1) Columna parent_slug (nullable). Nada se rompe si no se setea.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS parent_slug text;

-- 2) Crear (o re-asegurar) Araminda Consulting como consultoria.
INSERT INTO clients (
  slug, name, client_type, active,
  primary_color, secondary_color,
  bg_color, bg_card_color, bg_sidebar_color, border_color,
  text_color, text_secondary_color, config
) VALUES (
  'araminda-consulting',
  'Araminda Consulting',
  'consultoria',
  true,
  '#FFFFFF', '#A0A0A0',
  '#0A0A0A', '#111111', '#0D0D0D', '#1F1F1F',
  '#FFFFFF', '#A0A0A0',
  jsonb_build_object(
    'language', 'es',
    'features', '{}'::jsonb,
    'branding', jsonb_build_object(
      'display_name', 'Araminda Consulting',
      'primary_color', '#FFFFFF'
    )
  )
)
ON CONFLICT (slug) DO UPDATE SET
  name        = EXCLUDED.name,
  client_type = EXCLUDED.client_type,
  active      = true;

-- 3) Vincular FBA Academy y YC Logistics como hijos de Araminda.
UPDATE clients SET parent_slug = 'araminda-consulting' WHERE slug IN ('fba-academy', 'yc-logistics');
