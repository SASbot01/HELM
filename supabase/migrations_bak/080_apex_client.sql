-- 080_apex_client.sql
-- Registro del tenant APEX (client_type='demo').
-- El slug 'apex' se monta en /apex/* usando el shell apex-operations al
-- completo (mismo componente que /creator-founder/*). El UUID está hardcodeado
-- en src/pages/apex-operations/lib/config.js → TENANTS['apex'].id, así que
-- DEBE coincidir con el de esta migración.
--
-- Idempotente: ON CONFLICT (slug) refresca campos seguros.

INSERT INTO clients (
  id,
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
  '4d3a7c8f-9b2e-4f1a-8c5d-1e6f2a4b9d7c',
  'apex',
  'APEX',
  'demo',
  true,
  '/apex-mark.svg',  -- copia de apex-brand/apex-mark-platinum.svg
  '#E5E4E2',  -- Flow Platinum
  '#C4B58F',  -- Apex Gold accent
  '#06070A',  -- --apex-bg-deep
  '#13141B',  -- --apex-surface
  '#0A0B0D',  -- --apex-bg
  '#1F2129',
  '#FAFAFA',
  '#9BA0A8',
  jsonb_build_object(
    'language', 'es',
    'features', '{}'::jsonb,
    'branding', jsonb_build_object(
      'display_name',  'APEX',
      'tagline',       'Flow Platinum on OLED',
      'logo_url',      '/apex-mark.svg',
      'primary_color', '#E5E4E2'
    )
  )
)
ON CONFLICT (slug) DO UPDATE SET
  id                   = EXCLUDED.id,
  name                 = EXCLUDED.name,
  client_type          = EXCLUDED.client_type,
  active               = true,
  logo_url             = EXCLUDED.logo_url,
  primary_color        = EXCLUDED.primary_color,
  secondary_color      = EXCLUDED.secondary_color,
  bg_color             = EXCLUDED.bg_color,
  bg_card_color        = EXCLUDED.bg_card_color,
  bg_sidebar_color     = EXCLUDED.bg_sidebar_color,
  border_color         = EXCLUDED.border_color,
  text_color           = EXCLUDED.text_color,
  text_secondary_color = EXCLUDED.text_secondary_color,
  config               = clients.config || EXCLUDED.config;
