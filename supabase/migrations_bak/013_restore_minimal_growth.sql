-- Restore the "minimal" client as a Growth tenant so it shows up in the
-- admin Growth section again. Idempotent: upserts the row if it was deleted
-- and resets active / is_demo / client_type if they were changed.

INSERT INTO clients (
  slug,
  name,
  client_type,
  active,
  is_demo,
  primary_color,
  secondary_color,
  bg_color,
  bg_card_color,
  bg_sidebar_color,
  border_color,
  text_color,
  text_secondary_color,
  enabled_features
) VALUES (
  'minimal',
  'minimal.',
  'growth',
  true,
  false,
  '#ffffff',
  '#737373',
  '#000000',
  '#0a0a0a',
  '#000000',
  '#1a1a1a',
  '#ffffff',
  '#737373',
  '{"ventas": true, "reportes": true, "crm": true, "cuentas": true, "email_marketing": true, "marketing": true, "operations": true, "tiendas": true, "info_productos": true, "mentorias": true, "formacion": true, "task_management": true, "manufacturing": true, "ai_agents": true, "proyecciones": true, "comisiones": true, "contabilidad": true, "productos": true, "metodos_pago": true}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  client_type = 'growth',
  active      = true,
  is_demo     = false;
