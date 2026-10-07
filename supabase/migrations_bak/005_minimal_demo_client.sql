-- Create the "minimal" demo client with all features enabled (dark theme)
INSERT INTO clients (slug, name, client_type, primary_color, secondary_color, bg_color, bg_card_color, bg_sidebar_color, border_color, text_color, text_secondary_color, enabled_features)
VALUES (
  'minimal',
  'minimal.',
  'growth',
  '#ffffff',
  '#737373',
  '#000000',
  '#0a0a0a',
  '#000000',
  '#1a1a1a',
  '#ffffff',
  '#737373',
  '{"ventas": true, "reportes": true, "crm": true, "cuentas": true, "email_marketing": true, "marketing": true, "operations": true, "tiendas": true, "info_productos": true, "mentorias": true, "formacion": true, "task_management": true, "manufacturing": true, "ai_agents": true, "proyecciones": true, "comisiones": true, "contabilidad": true, "productos": true, "metodos_pago": true}'::jsonb
);

-- Add a demo user for the minimal client
INSERT INTO team (client_id, name, email, role, active)
SELECT id, 'Demo User', 'demo@minimal.app', 'ceo,manager,closer,setter', true
FROM clients WHERE slug = 'minimal';
