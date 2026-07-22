-- 045_yc_logistics_client.sql
-- Registro del cliente YC Logistics en su propia cohorte 'logistica'.
-- Idempotente: ON CONFLICT (slug) actualiza campos seguros.

INSERT INTO clients (
  slug,
  name,
  client_type,
  active,
  logo_url,
  primary_color,
  secondary_color,
  bg_color,
  bg_card_color,
  bg_sidebar_color,
  border_color,
  text_color,
  text_secondary_color,
  config
) VALUES (
  'yc-logistics',
  'YC Logistics',
  'logistica',
  true,
  '/yc-logistics-logo.jpg',
  '#FFFFFF',
  '#A0A0A0',
  '#0A0A0A',
  '#111111',
  '#0D0D0D',
  '#1F1F1F',
  '#FFFFFF',
  '#A0A0A0',
  jsonb_build_object(
    'language', 'es',
    'features', '{}'::jsonb,
    'branding', jsonb_build_object(
      'display_name', 'YC Logistics',
      'logo_url', '/yc-logistics-logo.jpg',
      'primary_color', '#FFFFFF'
    )
  )
)
ON CONFLICT (slug) DO UPDATE SET
  name        = EXCLUDED.name,
  client_type = EXCLUDED.client_type,
  logo_url    = EXCLUDED.logo_url,
  active      = true;
