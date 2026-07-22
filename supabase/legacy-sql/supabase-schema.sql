-- ============================================
-- BlackWolf Multi-Tenant Dashboard - Supabase Schema
-- ============================================
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)


-- =============================================
-- 0. CLIENTS (tenants)
-- =============================================
CREATE TABLE IF NOT EXISTS clients (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  logo_url text DEFAULT '',
  primary_color text DEFAULT '#FF6B00',
  secondary_color text DEFAULT '#FFB800',
  bg_color text DEFAULT '#0A0A0A',
  bg_card_color text DEFAULT '#111111',
  bg_sidebar_color text DEFAULT '#0D0D0D',
  border_color text DEFAULT '#1F1F1F',
  text_color text DEFAULT '#FFFFFF',
  text_secondary_color text DEFAULT '#A0A0A0',
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clients_slug ON clients(slug);
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on clients" ON clients
  FOR ALL USING (true) WITH CHECK (true);


-- =============================================
-- 0b. SUPERADMINS
-- =============================================
CREATE TABLE IF NOT EXISTS superadmins (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL DEFAULT '',
  email text NOT NULL UNIQUE,
  password text NOT NULL DEFAULT '',
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_superadmins_email ON superadmins(email);
ALTER TABLE superadmins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on superadmins" ON superadmins
  FOR ALL USING (true) WITH CHECK (true);


-- =============================================
-- 0c. SUPERADMIN_COMMISSIONS (per client)
-- =============================================
CREATE TABLE IF NOT EXISTS superadmin_commissions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  commission_rate numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(client_id)
);

ALTER TABLE superadmin_commissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on superadmin_commissions" ON superadmin_commissions
  FOR ALL USING (true) WITH CHECK (true);


-- =============================================
-- 1. SALES (ventas)
-- =============================================
CREATE TABLE IF NOT EXISTS sales (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES clients(id),
  date date NOT NULL DEFAULT CURRENT_DATE,
  client_name text DEFAULT '',
  client_email text DEFAULT '',
  client_phone text DEFAULT '',
  instagram text DEFAULT '',
  product text DEFAULT '',
  producto_interes text DEFAULT '',
  payment_type text DEFAULT 'Pago único',
  installment_number text DEFAULT 'Pago único',
  payment_method text DEFAULT 'Transferencia',
  revenue numeric DEFAULT 0,
  cash_collected numeric DEFAULT 0,
  closer text DEFAULT '',
  setter text DEFAULT '',
  triager text DEFAULT '',
  gestor_asignado text DEFAULT '',
  utm_source text DEFAULT '',
  utm_medium text DEFAULT '',
  utm_campaign text DEFAULT '',
  utm_content text DEFAULT '',
  pais text DEFAULT '',
  capital_disponible text DEFAULT '',
  situacion_actual text DEFAULT '',
  exp_amazon text DEFAULT '',
  decisor_confirmado text DEFAULT '',
  fecha_llamada text DEFAULT '',
  status text DEFAULT 'Completada',
  notes text DEFAULT '',
  source text DEFAULT 'manual',
  close_activity_id text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sales_client_id ON sales(client_id);
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(date);
CREATE INDEX IF NOT EXISTS idx_sales_closer ON sales(closer);
CREATE INDEX IF NOT EXISTS idx_sales_setter ON sales(setter);
CREATE INDEX IF NOT EXISTS idx_sales_status ON sales(status);
CREATE INDEX IF NOT EXISTS idx_sales_source ON sales(source);
CREATE INDEX IF NOT EXISTS idx_sales_utm_source ON sales(utm_source);
CREATE INDEX IF NOT EXISTS idx_sales_close_activity_id ON sales(close_activity_id);

ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on sales" ON sales
  FOR ALL USING (true) WITH CHECK (true);


-- =============================================
-- 2. REPORTS (reportes diarios de setters y closers)
-- =============================================
CREATE TABLE IF NOT EXISTS reports (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES clients(id),
  date date NOT NULL DEFAULT CURRENT_DATE,
  role text NOT NULL CHECK (role IN ('setter', 'closer')),
  name text NOT NULL DEFAULT '',
  conversations_opened integer DEFAULT 0,
  follow_ups integer DEFAULT 0,
  offers_launched integer DEFAULT 0,
  appointments_booked integer DEFAULT 0,
  scheduled_calls integer DEFAULT 0,
  calls_made integer DEFAULT 0,
  deposits integer DEFAULT 0,
  closes integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reports_client_id ON reports(client_id);
CREATE INDEX IF NOT EXISTS idx_reports_date ON reports(date);
CREATE INDEX IF NOT EXISTS idx_reports_role ON reports(role);
CREATE INDEX IF NOT EXISTS idx_reports_name ON reports(name);
CREATE INDEX IF NOT EXISTS idx_reports_date_role ON reports(date, role);

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on reports" ON reports
  FOR ALL USING (true) WITH CHECK (true);


-- =============================================
-- 3. TEAM (miembros del equipo + login)
-- =============================================
CREATE TABLE IF NOT EXISTS team (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES clients(id),
  name text NOT NULL DEFAULT '',
  email text NOT NULL,
  password text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'closer',
  active boolean DEFAULT true,
  commission_rate numeric DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(client_id, email)
);

CREATE INDEX IF NOT EXISTS idx_team_client_id ON team(client_id);
CREATE INDEX IF NOT EXISTS idx_team_email ON team(email);
CREATE INDEX IF NOT EXISTS idx_team_role ON team(role);
CREATE INDEX IF NOT EXISTS idx_team_active ON team(active);

ALTER TABLE team ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on team" ON team
  FOR ALL USING (true) WITH CHECK (true);


-- =============================================
-- 4. PROJECTIONS (proyecciones semanales/mensuales)
-- =============================================
CREATE TABLE IF NOT EXISTS projections (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES clients(id),
  period text NOT NULL,
  period_type text NOT NULL DEFAULT 'monthly' CHECK (period_type IN ('weekly', 'monthly')),
  type text NOT NULL DEFAULT 'company' CHECK (type IN ('company', 'closer', 'setter')),
  member_id text,
  name text NOT NULL DEFAULT '',
  cash_target numeric DEFAULT 0,
  revenue_target numeric DEFAULT 0,
  appointment_target integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_projections_client_id ON projections(client_id);
CREATE INDEX IF NOT EXISTS idx_projections_period ON projections(period);
CREATE INDEX IF NOT EXISTS idx_projections_period_type ON projections(period_type);
CREATE INDEX IF NOT EXISTS idx_projections_type ON projections(type);
CREATE INDEX IF NOT EXISTS idx_projections_member_id ON projections(member_id);

ALTER TABLE projections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on projections" ON projections
  FOR ALL USING (true) WITH CHECK (true);


-- =============================================
-- 4b. PRODUCTS (productos por cliente)
-- =============================================
CREATE TABLE IF NOT EXISTS products (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  price numeric DEFAULT 0,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(client_id, name)
);

CREATE INDEX IF NOT EXISTS idx_products_client_id ON products(client_id);
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on products" ON products
  FOR ALL USING (true) WITH CHECK (true);


-- =============================================
-- 5. PAYMENT_FEES (comisiones por método de pago)
-- =============================================
CREATE TABLE IF NOT EXISTS payment_fees (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES clients(id),
  method text NOT NULL,
  fee_rate numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(client_id, method)
);

CREATE INDEX IF NOT EXISTS idx_payment_fees_client_id ON payment_fees(client_id);

ALTER TABLE payment_fees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on payment_fees" ON payment_fees
  FOR ALL USING (true) WITH CHECK (true);


-- =============================================
-- 6. N8N_CONFIG (configuración de integración N8n)
-- =============================================
CREATE TABLE IF NOT EXISTS n8n_config (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES clients(id),
  webhook_url text DEFAULT '',
  api_key text DEFAULT '',
  enabled boolean DEFAULT false,
  last_sync timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_n8n_config_client_id ON n8n_config(client_id);

ALTER TABLE n8n_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on n8n_config" ON n8n_config
  FOR ALL USING (true) WITH CHECK (true);


-- =============================================
-- 7. VIEW: Sales with net cash (computed from payment_fees)
-- =============================================
CREATE OR REPLACE VIEW sales_with_net_cash AS
SELECT
  s.*,
  ROUND(s.cash_collected * (1 - COALESCE(pf.fee_rate, 0)), 2) AS net_cash
FROM sales s
LEFT JOIN payment_fees pf
  ON pf.method = s.payment_method
  AND pf.client_id = s.client_id;


-- =============================================================
--  SEED DATA
-- =============================================================

-- ── Clients ──
INSERT INTO clients (slug, name, logo_url, primary_color, secondary_color, bg_color, bg_card_color, bg_sidebar_color, border_color, text_color, text_secondary_color) VALUES
  ('fba-academy', 'FBA Academy', '/assets/logos/fba-academy.jpeg', '#FF6B00', '#FFB800', '#0A0A0A', '#111111', '#0D0D0D', '#1F1F1F', '#FFFFFF', '#A0A0A0'),
  ('luxury-interiors', 'Luxury Design School', '/assets/logos/luxury-interiors.jpeg', '#C4944A', '#DDD5C8', '#1A0D12', '#231018', '#1A0D12', '#3D1520', '#DDD5C8', '#A08A6E'),
  ('detras-de-camara', 'Detrás de Cámara', NULL, '#22C55E', '#4ADE80', '#0F0F12', '#18181B', '#0F0F12', '#2A2D34', '#F5F6F7', '#6B7280'),
  ('black-wolf', 'Black Wolf', '/assets/logos/blackwolf-logo.png', '#6366F1', '#818CF8', '#09090B', '#111113', '#09090B', '#1E1E24', '#FFFFFF', '#A1A1AA')
ON CONFLICT (slug) DO NOTHING;

-- ── SuperAdmin ──
INSERT INTO superadmins (name, email, password, active) VALUES
  ('Alex', 'alex@blackwolfsec.io', 'BlackWolf88', true)
ON CONFLICT (email) DO NOTHING;

-- ── SuperAdmin Commissions ──
INSERT INTO superadmin_commissions (client_id, commission_rate)
SELECT id, 0.02 FROM clients WHERE slug = 'fba-academy'
ON CONFLICT (client_id) DO NOTHING;

INSERT INTO superadmin_commissions (client_id, commission_rate)
SELECT id, 0.20 FROM clients WHERE slug = 'luxury-interiors'
ON CONFLICT (client_id) DO NOTHING;

INSERT INTO superadmin_commissions (client_id, commission_rate)
SELECT id, 0.10 FROM clients WHERE slug = 'detras-de-camara'
ON CONFLICT (client_id) DO NOTHING;

INSERT INTO superadmin_commissions (client_id, commission_rate)
SELECT id, 0 FROM clients WHERE slug = 'black-wolf'
ON CONFLICT (client_id) DO NOTHING;

-- ── Payment Fees (FBA Academy) ──
INSERT INTO payment_fees (client_id, method, fee_rate)
SELECT id, 'Transferencia', 0 FROM clients WHERE slug = 'fba-academy'
ON CONFLICT (client_id, method) DO NOTHING;
INSERT INTO payment_fees (client_id, method, fee_rate)
SELECT id, 'Stripe', 0.029 FROM clients WHERE slug = 'fba-academy'
ON CONFLICT (client_id, method) DO NOTHING;
INSERT INTO payment_fees (client_id, method, fee_rate)
SELECT id, 'PayPal', 0.035 FROM clients WHERE slug = 'fba-academy'
ON CONFLICT (client_id, method) DO NOTHING;
INSERT INTO payment_fees (client_id, method, fee_rate)
SELECT id, 'Tarjeta', 0.015 FROM clients WHERE slug = 'fba-academy'
ON CONFLICT (client_id, method) DO NOTHING;

-- ── Payment Fees (Luxury Design School) ──
INSERT INTO payment_fees (client_id, method, fee_rate)
SELECT id, 'Transferencia', 0 FROM clients WHERE slug = 'luxury-interiors'
ON CONFLICT (client_id, method) DO NOTHING;
INSERT INTO payment_fees (client_id, method, fee_rate)
SELECT id, 'Stripe', 0.029 FROM clients WHERE slug = 'luxury-interiors'
ON CONFLICT (client_id, method) DO NOTHING;
INSERT INTO payment_fees (client_id, method, fee_rate)
SELECT id, 'PayPal', 0.035 FROM clients WHERE slug = 'luxury-interiors'
ON CONFLICT (client_id, method) DO NOTHING;
INSERT INTO payment_fees (client_id, method, fee_rate)
SELECT id, 'Tarjeta', 0.015 FROM clients WHERE slug = 'luxury-interiors'
ON CONFLICT (client_id, method) DO NOTHING;

-- ── Team Members (FBA Academy) ──
INSERT INTO team (client_id, name, email, password, role, active, commission_rate)
SELECT id, 'Emi', 'emi@fbaacademy.com', 'emi123', 'closer', true, 0.10 FROM clients WHERE slug = 'fba-academy'
ON CONFLICT (client_id, email) DO NOTHING;
INSERT INTO team (client_id, name, email, password, role, active, commission_rate)
SELECT id, 'Alejandro', 'alejandro@fbaacademy.com', 'ale123', 'closer', true, 0.10 FROM clients WHERE slug = 'fba-academy'
ON CONFLICT (client_id, email) DO NOTHING;
INSERT INTO team (client_id, name, email, password, role, active, commission_rate)
SELECT id, 'Víctor', 'victor@fbaacademy.com', 'vic123', 'setter', true, 0.05 FROM clients WHERE slug = 'fba-academy'
ON CONFLICT (client_id, email) DO NOTHING;
INSERT INTO team (client_id, name, email, password, role, active, commission_rate)
SELECT id, 'Marta', 'marta@fbaacademy.com', 'mar123', 'setter', true, 0.05 FROM clients WHERE slug = 'fba-academy'
ON CONFLICT (client_id, email) DO NOTHING;
INSERT INTO team (client_id, name, email, password, role, active, commission_rate)
SELECT id, 'Emi de la Sierra', 'emidelasierra@fbaacademypro.com', 'fba2026', 'director', true, 0.03 FROM clients WHERE slug = 'fba-academy'
ON CONFLICT (client_id, email) DO NOTHING;
INSERT INTO team (client_id, name, email, password, role, active, commission_rate)
SELECT id, 'SuperAdmin', 'alex@blackwolfsec.io', 'BlackWolf88', 'director', true, 0 FROM clients WHERE slug = 'fba-academy'
ON CONFLICT (client_id, email) DO NOTHING;

-- ── Team Members (Luxury Design School - SuperAdmin only initially) ──
INSERT INTO team (client_id, name, email, password, role, active, commission_rate)
SELECT id, 'SuperAdmin', 'alex@blackwolfsec.io', 'BlackWolf88', 'director', true, 0 FROM clients WHERE slug = 'luxury-interiors'
ON CONFLICT (client_id, email) DO NOTHING;

-- ── Team Members (Detrás de Cámara - SuperAdmin only initially) ──
INSERT INTO team (client_id, name, email, password, role, active, commission_rate)
SELECT id, 'SuperAdmin', 'alex@blackwolfsec.io', 'BlackWolf88', 'director', true, 0 FROM clients WHERE slug = 'detras-de-camara'
ON CONFLICT (client_id, email) DO NOTHING;

-- ── Team Members (Black Wolf) ──
INSERT INTO team (client_id, name, email, password, role, active, commission_rate)
SELECT id, 'Alex', 'alex@blackwolfsec.io', 'BlackWolf88', 'ceo,director', true, 0 FROM clients WHERE slug = 'black-wolf'
ON CONFLICT (client_id, email) DO NOTHING;

-- ── Sales (FBA Academy seed data) ──
INSERT INTO sales (client_id, date, client_name, client_email, client_phone, instagram, product, producto_interes, payment_type, installment_number, payment_method, revenue, cash_collected, closer, setter, triager, gestor_asignado, utm_source, utm_medium, utm_campaign, utm_content, pais, capital_disponible, situacion_actual, exp_amazon, decisor_confirmado, fecha_llamada, status, notes, source)
SELECT id, '2026-02-20', 'Carlos Méndez', 'carlos@gmail.com', '+34 612 345 678', '@carlosm_fba', 'FBA Academy Pro', 'FBA Academy Pro', 'Pago único', 'Pago único', 'Transferencia', 2997, 2997, 'Emi', 'Víctor', '', '', 'instagram', 'paid', 'webinar_feb', 'story_ad', 'España', '5000-10000€', 'Empleado buscando alternativa', 'Sin experiencia', 'Sí', '2026-02-19', 'Completada', '', 'manual' FROM clients WHERE slug = 'fba-academy';
INSERT INTO sales (client_id, date, client_name, client_email, client_phone, instagram, product, producto_interes, payment_type, installment_number, payment_method, revenue, cash_collected, closer, setter, triager, gestor_asignado, utm_source, utm_medium, utm_campaign, utm_content, pais, capital_disponible, situacion_actual, exp_amazon, decisor_confirmado, fecha_llamada, status, notes, source)
SELECT id, '2026-02-21', 'María López', 'maria.lopez@hotmail.com', '+34 623 456 789', '@maria.lopez', 'Mentoring 1:1', 'Mentoring 1:1', '2 cuotas', '1/2', 'Stripe', 5000, 2500, 'Emi', 'Marta', '', '', 'google', 'cpc', 'search_brand', '', 'México', '10000-20000€', 'Emprendedora activa', '6 meses', 'Sí', '2026-02-20', 'Pendiente', 'Primera cuota de 2', 'manual' FROM clients WHERE slug = 'fba-academy';
INSERT INTO sales (client_id, date, client_name, client_email, client_phone, instagram, product, producto_interes, payment_type, installment_number, payment_method, revenue, cash_collected, closer, setter, triager, gestor_asignado, utm_source, utm_medium, utm_campaign, utm_content, pais, capital_disponible, situacion_actual, exp_amazon, decisor_confirmado, fecha_llamada, status, notes, source)
SELECT id, '2026-02-22', 'Andrés Ruiz', 'andres.r@gmail.com', '+52 55 1234 5678', '@andresruiz', 'FBA Academy Pro', 'FBA Academy Pro', 'Pago único', 'Pago único', 'Tarjeta', 2997, 2997, 'Alejandro', 'Víctor', '', '', 'facebook', 'paid', 'reel_viral', 'testimonio', 'Colombia', '3000-5000€', 'Estudiante universitario', 'Sin experiencia', 'Sí', '2026-02-21', 'Completada', '', 'manual' FROM clients WHERE slug = 'fba-academy';
INSERT INTO sales (client_id, date, client_name, client_email, client_phone, instagram, product, producto_interes, payment_type, installment_number, payment_method, revenue, cash_collected, closer, setter, triager, gestor_asignado, utm_source, utm_medium, utm_campaign, utm_content, pais, capital_disponible, situacion_actual, exp_amazon, decisor_confirmado, fecha_llamada, status, notes, source)
SELECT id, '2026-02-23', 'Laura Sánchez', 'laura.s@yahoo.com', '+34 634 567 890', '@laura.sanchez', 'China Bootcamp', 'China Bootcamp', '3 cuotas', '1/3', 'PayPal', 10000, 4000, 'Emi', 'Víctor', '', '', 'instagram', 'organic', '', '', 'España', '20000+€', 'Vendedora Amazon activa', '1 año', 'Sí', '2026-02-22', 'Pendiente', 'Primera cuota de 3', 'manual' FROM clients WHERE slug = 'fba-academy';
INSERT INTO sales (client_id, date, client_name, client_email, client_phone, instagram, product, producto_interes, payment_type, installment_number, payment_method, revenue, cash_collected, closer, setter, triager, gestor_asignado, utm_source, utm_medium, utm_campaign, utm_content, pais, capital_disponible, situacion_actual, exp_amazon, decisor_confirmado, fecha_llamada, status, notes, source)
SELECT id, '2026-02-24', 'Diego Fernández', 'diego.f@outlook.com', '+34 645 678 901', '@diegof', 'FBA Academy Pro', 'FBA Academy Pro', 'Pago único', 'Pago único', 'Stripe', 2997, 2997, 'Alejandro', 'Marta', '', '', 'youtube', 'organic', '', '', 'Argentina', '5000-10000€', 'Freelancer', 'Sin experiencia', 'Sí', '2026-02-23', 'Completada', '', 'manual' FROM clients WHERE slug = 'fba-academy';
INSERT INTO sales (client_id, date, client_name, client_email, client_phone, instagram, product, producto_interes, payment_type, installment_number, payment_method, revenue, cash_collected, closer, setter, triager, gestor_asignado, utm_source, utm_medium, utm_campaign, utm_content, pais, capital_disponible, situacion_actual, exp_amazon, decisor_confirmado, fecha_llamada, status, notes, source)
SELECT id, '2026-02-25', 'Paula García', 'paula.g@gmail.com', '+34 656 789 012', '@paulag', 'Mentoring 1:1', 'Mentoring 1:1', 'Pago único', 'Pago único', 'Transferencia', 5000, 5000, 'Emi', 'Marta', '', '', 'referral', 'organic', '', '', 'España', '10000-20000€', 'Emprendedora activa', '3 meses', 'Sí', '2026-02-24', 'Completada', 'Referida por cliente anterior', 'manual' FROM clients WHERE slug = 'fba-academy';
INSERT INTO sales (client_id, date, client_name, client_email, client_phone, instagram, product, producto_interes, payment_type, installment_number, payment_method, revenue, cash_collected, closer, setter, triager, gestor_asignado, utm_source, utm_medium, utm_campaign, utm_content, pais, capital_disponible, situacion_actual, exp_amazon, decisor_confirmado, fecha_llamada, status, notes, source)
SELECT id, '2026-02-25', 'Javier Martín', 'javi.m@gmail.com', '+34 667 890 123', '@javim', 'FBA Academy Pro', 'FBA Academy Pro', '2 cuotas', '1/2', 'Tarjeta', 2997, 1500, 'Alejandro', 'Víctor', '', '', 'instagram', 'paid', 'webinar_feb', 'carousel', 'España', '3000-5000€', 'Empleado buscando alternativa', 'Sin experiencia', 'Sí', '2026-02-24', 'Pendiente', '', 'manual' FROM clients WHERE slug = 'fba-academy';
INSERT INTO sales (client_id, date, client_name, client_email, client_phone, instagram, product, producto_interes, payment_type, installment_number, payment_method, revenue, cash_collected, closer, setter, triager, gestor_asignado, utm_source, utm_medium, utm_campaign, utm_content, pais, capital_disponible, situacion_actual, exp_amazon, decisor_confirmado, fecha_llamada, status, notes, source)
SELECT id, '2026-02-26', 'Sofía Romero', 'sofia.r@gmail.com', '+34 678 901 234', '@sofiarom', 'China Bootcamp', 'China Bootcamp', 'Pago único', 'Pago único', 'Transferencia', 10000, 10000, 'Emi', 'Víctor', '', '', 'tiktok', 'organic', '', '', 'Chile', '20000+€', 'Vendedora Amazon activa', '2 años', 'Sí', '2026-02-25', 'Completada', '', 'manual' FROM clients WHERE slug = 'fba-academy';
INSERT INTO sales (client_id, date, client_name, client_email, client_phone, instagram, product, producto_interes, payment_type, installment_number, payment_method, revenue, cash_collected, closer, setter, triager, gestor_asignado, utm_source, utm_medium, utm_campaign, utm_content, pais, capital_disponible, situacion_actual, exp_amazon, decisor_confirmado, fecha_llamada, status, notes, source)
SELECT id, '2026-02-26', 'María López', 'maria.lopez@hotmail.com', '+34 623 456 789', '@maria.lopez', 'Mentoring 1:1', 'Mentoring 1:1', '2 cuotas', '2/2', 'Stripe', 0, 2500, 'Emi', 'Marta', '', '', 'google', 'cpc', 'search_brand', '', 'México', '10000-20000€', 'Emprendedora activa', '6 meses', 'Sí', '2026-02-20', 'Completada', 'Segunda y última cuota', 'manual' FROM clients WHERE slug = 'fba-academy';

-- ── Reports (FBA Academy seed data) ──
INSERT INTO reports (client_id, date, role, name, conversations_opened, follow_ups, offers_launched, appointments_booked, scheduled_calls, calls_made, deposits, closes)
SELECT id, '2026-02-24', 'setter', 'Víctor', 45, 22, 8, 5, 0, 0, 0, 0 FROM clients WHERE slug = 'fba-academy';
INSERT INTO reports (client_id, date, role, name, conversations_opened, follow_ups, offers_launched, appointments_booked, scheduled_calls, calls_made, deposits, closes)
SELECT id, '2026-02-24', 'setter', 'Marta', 38, 18, 6, 4, 0, 0, 0, 0 FROM clients WHERE slug = 'fba-academy';
INSERT INTO reports (client_id, date, role, name, conversations_opened, follow_ups, offers_launched, appointments_booked, scheduled_calls, calls_made, deposits, closes)
SELECT id, '2026-02-25', 'setter', 'Víctor', 52, 25, 10, 7, 0, 0, 0, 0 FROM clients WHERE slug = 'fba-academy';
INSERT INTO reports (client_id, date, role, name, conversations_opened, follow_ups, offers_launched, appointments_booked, scheduled_calls, calls_made, deposits, closes)
SELECT id, '2026-02-25', 'setter', 'Marta', 41, 20, 7, 3, 0, 0, 0, 0 FROM clients WHERE slug = 'fba-academy';
INSERT INTO reports (client_id, date, role, name, conversations_opened, follow_ups, offers_launched, appointments_booked, scheduled_calls, calls_made, deposits, closes)
SELECT id, '2026-02-26', 'setter', 'Víctor', 48, 30, 12, 6, 0, 0, 0, 0 FROM clients WHERE slug = 'fba-academy';
INSERT INTO reports (client_id, date, role, name, conversations_opened, follow_ups, offers_launched, appointments_booked, scheduled_calls, calls_made, deposits, closes)
SELECT id, '2026-02-26', 'setter', 'Marta', 35, 15, 5, 4, 0, 0, 0, 0 FROM clients WHERE slug = 'fba-academy';
INSERT INTO reports (client_id, date, role, name, conversations_opened, follow_ups, offers_launched, appointments_booked, scheduled_calls, calls_made, deposits, closes)
SELECT id, '2026-02-24', 'closer', 'Emi', 0, 0, 4, 0, 6, 5, 2, 2 FROM clients WHERE slug = 'fba-academy';
INSERT INTO reports (client_id, date, role, name, conversations_opened, follow_ups, offers_launched, appointments_booked, scheduled_calls, calls_made, deposits, closes)
SELECT id, '2026-02-24', 'closer', 'Alejandro', 0, 0, 3, 0, 5, 4, 1, 1 FROM clients WHERE slug = 'fba-academy';
INSERT INTO reports (client_id, date, role, name, conversations_opened, follow_ups, offers_launched, appointments_booked, scheduled_calls, calls_made, deposits, closes)
SELECT id, '2026-02-25', 'closer', 'Emi', 0, 0, 5, 0, 8, 7, 3, 2 FROM clients WHERE slug = 'fba-academy';
INSERT INTO reports (client_id, date, role, name, conversations_opened, follow_ups, offers_launched, appointments_booked, scheduled_calls, calls_made, deposits, closes)
SELECT id, '2026-02-25', 'closer', 'Alejandro', 0, 0, 4, 0, 6, 5, 2, 1 FROM clients WHERE slug = 'fba-academy';
INSERT INTO reports (client_id, date, role, name, conversations_opened, follow_ups, offers_launched, appointments_booked, scheduled_calls, calls_made, deposits, closes)
SELECT id, '2026-02-26', 'closer', 'Emi', 0, 0, 5, 0, 7, 6, 2, 2 FROM clients WHERE slug = 'fba-academy';
INSERT INTO reports (client_id, date, role, name, conversations_opened, follow_ups, offers_launched, appointments_booked, scheduled_calls, calls_made, deposits, closes)
SELECT id, '2026-02-26', 'closer', 'Alejandro', 0, 0, 3, 0, 5, 5, 1, 1 FROM clients WHERE slug = 'fba-academy';

-- ── N8n Config (FBA Academy) ──
INSERT INTO n8n_config (client_id, webhook_url, api_key, enabled, last_sync)
SELECT id, '', '', false, NULL FROM clients WHERE slug = 'fba-academy';

-- ── N8n Config (Luxury Design School) ──
INSERT INTO n8n_config (client_id, webhook_url, api_key, enabled, last_sync)
SELECT id, '', '', false, NULL FROM clients WHERE slug = 'luxury-interiors';

-- ── Payment Fees (Detrás de Cámara) ──
INSERT INTO payment_fees (client_id, method, fee_rate)
SELECT id, 'Transferencia', 0 FROM clients WHERE slug = 'detras-de-camara'
ON CONFLICT (client_id, method) DO NOTHING;
INSERT INTO payment_fees (client_id, method, fee_rate)
SELECT id, 'Stripe', 0.029 FROM clients WHERE slug = 'detras-de-camara'
ON CONFLICT (client_id, method) DO NOTHING;
INSERT INTO payment_fees (client_id, method, fee_rate)
SELECT id, 'PayPal', 0.035 FROM clients WHERE slug = 'detras-de-camara'
ON CONFLICT (client_id, method) DO NOTHING;
INSERT INTO payment_fees (client_id, method, fee_rate)
SELECT id, 'Tarjeta', 0.015 FROM clients WHERE slug = 'detras-de-camara'
ON CONFLICT (client_id, method) DO NOTHING;

-- ── N8n Config (Detrás de Cámara) ──
INSERT INTO n8n_config (client_id, webhook_url, api_key, enabled, last_sync)
SELECT id, '', '', false, NULL FROM clients WHERE slug = 'detras-de-camara';

-- ── Payment Fees (Black Wolf) ──
INSERT INTO payment_fees (client_id, method, fee_rate)
SELECT id, 'Transferencia', 0 FROM clients WHERE slug = 'black-wolf'
ON CONFLICT (client_id, method) DO NOTHING;
INSERT INTO payment_fees (client_id, method, fee_rate)
SELECT id, 'Stripe', 0.029 FROM clients WHERE slug = 'black-wolf'
ON CONFLICT (client_id, method) DO NOTHING;
INSERT INTO payment_fees (client_id, method, fee_rate)
SELECT id, 'PayPal', 0.035 FROM clients WHERE slug = 'black-wolf'
ON CONFLICT (client_id, method) DO NOTHING;
INSERT INTO payment_fees (client_id, method, fee_rate)
SELECT id, 'Tarjeta', 0.015 FROM clients WHERE slug = 'black-wolf'
ON CONFLICT (client_id, method) DO NOTHING;

-- ── N8n Config (Black Wolf) ──
INSERT INTO n8n_config (client_id, webhook_url, api_key, enabled, last_sync)
SELECT id, '', '', false, NULL FROM clients WHERE slug = 'black-wolf';

-- ── Products (FBA Academy only) ──
INSERT INTO products (client_id, name, price, active)
SELECT id, 'FBA Academy Pro', 2997, true FROM clients WHERE slug = 'fba-academy'
ON CONFLICT (client_id, name) DO NOTHING;
INSERT INTO products (client_id, name, price, active)
SELECT id, 'Mentoring 1:1', 5000, true FROM clients WHERE slug = 'fba-academy'
ON CONFLICT (client_id, name) DO NOTHING;
INSERT INTO products (client_id, name, price, active)
SELECT id, 'China Bootcamp', 10000, true FROM clients WHERE slug = 'fba-academy'
ON CONFLICT (client_id, name) DO NOTHING;
