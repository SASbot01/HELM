-- Insert MebelArt manufacturing client
-- Blue corporate theme for manufacturing demo
INSERT INTO clients (name, slug, logo_url, primary_color, secondary_color, bg_color, bg_card_color, bg_sidebar_color, border_color, text_color, text_secondary_color, client_type)
VALUES (
  'MebelArt',
  'mebelart',
  '',
  '#1E88E5',   -- primary: strong blue
  '#42A5F5',   -- secondary: lighter blue
  '#0A0E1A',   -- bg: very dark navy
  '#111827',   -- bg_card: dark card
  '#0D1224',   -- bg_sidebar: dark navy sidebar
  '#1E293B',   -- border: subtle slate border
  '#E8EAF0',   -- text: light
  '#7B8BA3',   -- text_secondary: muted blue-gray
  'manufacturing'
);

-- Insert a team member for demo login
INSERT INTO team (client_id, name, email, password, role, active)
SELECT id, 'Dimitar Kolev', 'dimitar@mebelart.bg', 'demo123', 'ceo', true
FROM clients WHERE slug = 'mebelart';

INSERT INTO team (client_id, name, email, password, role, active)
SELECT id, 'Anna Petrova', 'anna@mebelart.bg', 'demo123', 'closer', true
FROM clients WHERE slug = 'mebelart';

INSERT INTO team (client_id, name, email, password, role, active)
SELECT id, 'Kiril Stoyanov', 'kiril@mebelart.bg', 'demo123', 'closer', true
FROM clients WHERE slug = 'mebelart';
