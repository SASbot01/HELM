-- Crea el tercer hijo del portfolio Araminda Consulting: Agente de Compras.
-- Comparte el flujo del director de operaciones (selecciona desde el command
-- center) y aparece junto a FBA Academy y YC Logistics.
INSERT INTO clients (
  slug, name, client_type, active,
  parent_slug,
  primary_color, secondary_color,
  bg_color, bg_card_color, bg_sidebar_color, border_color,
  text_color, text_secondary_color,
  config
) VALUES (
  'agente-compras',
  'Agente de Compras',
  'consultoria',
  true,
  'araminda-consulting',
  '#A855F7', '#D8B4FE',
  '#0A0A0A', '#111111', '#0D0D0D', '#1F1F1F',
  '#FFFFFF', '#A0A0A0',
  jsonb_build_object(
    'language', 'es',
    'features', '{}'::jsonb,
    'branding', jsonb_build_object(
      'display_name', 'Agente de Compras',
      'primary_color', '#A855F7'
    )
  )
)
ON CONFLICT (slug) DO UPDATE SET
  name        = EXCLUDED.name,
  client_type = EXCLUDED.client_type,
  parent_slug = EXCLUDED.parent_slug,
  primary_color = EXCLUDED.primary_color,
  active      = true;
