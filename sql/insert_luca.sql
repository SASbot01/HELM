-- Insert Lukas growth client
INSERT INTO clients (name, slug, logo_url, primary_color, secondary_color, bg_color, bg_card_color, bg_sidebar_color, border_color, text_color, text_secondary_color, client_type)
VALUES (
  'Lukas',
  'luca',
  '',
  '#FF6B00',   -- primary: orange (default BW theme)
  '#FFB800',   -- secondary: yellow
  '#050510',   -- bg: dark
  '#0a0a14',   -- bg_card
  '#050510',   -- bg_sidebar
  '#1a1a2e',   -- border
  '#E4E4E7',   -- text
  '#71717A',   -- text_secondary
  'growth'
)
ON CONFLICT (slug) DO NOTHING;

-- Lukas team member
INSERT INTO team (client_id, name, email, password, role, active)
SELECT id, 'Lukas', 'admin@luca.com', 'demo123', 'ceo', true
FROM clients WHERE slug = 'luca';
