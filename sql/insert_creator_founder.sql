-- Insert Creator Founder consultoria client
-- Clean dark theme for consulting brand
INSERT INTO clients (name, slug, logo_url, primary_color, secondary_color, bg_color, bg_card_color, bg_sidebar_color, border_color, text_color, text_secondary_color, client_type)
VALUES (
  'Creator Founder',
  'creator-founder',
  '/assets/logos/creator-founder.png',
  '#FFFFFF',   -- primary: white (matches logo)
  '#A1A1AA',   -- secondary: zinc-400
  '#09090B',   -- bg: zinc-950
  '#18181B',   -- bg_card: zinc-900
  '#0F0F12',   -- bg_sidebar: near-black
  '#27272A',   -- border: zinc-800
  '#FAFAFA',   -- text: zinc-50
  '#71717A',   -- text_secondary: zinc-500
  'consultoria'
)
ON CONFLICT (slug) DO NOTHING;

-- Demo team member
INSERT INTO team (client_id, name, email, password, role, active)
SELECT id, 'Admin', 'admin@creatorfounder.com', 'demo123', 'ceo', true
FROM clients WHERE slug = 'creator-founder';
