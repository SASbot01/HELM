-- ============================================
-- GESTIÓN DE TIENDAS - Schema & Seed Data
-- ============================================

-- Stores (tiendas)
CREATE TABLE IF NOT EXISTS stores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id),

  -- Owner info (the client/student who bought the service)
  owner_name TEXT NOT NULL,
  owner_email TEXT,
  owner_phone TEXT,
  owner_instagram TEXT,

  -- Store info
  brand_name TEXT,
  amazon_marketplace TEXT DEFAULT 'ES',
  capital_disponible NUMERIC(10,2),

  -- Status: 'onboarding', 'active', 'blocked', 'completed', 'archived'
  status TEXT NOT NULL DEFAULT 'onboarding',

  -- Assigned manager (gestor)
  gestor_id UUID REFERENCES team(id),
  gestor_name TEXT,

  -- Service details
  service_type TEXT DEFAULT 'standard',  -- 'standard', 'mentoring', 'premium'
  followup_days INTEGER DEFAULT 30,
  start_date DATE,
  end_date DATE,

  -- Current step in onboarding
  current_step INTEGER DEFAULT 1,
  total_steps INTEGER DEFAULT 9,

  -- Product assigned by team
  product_name TEXT,
  product_asin TEXT,
  agent_name TEXT,  -- agente de compras

  -- Upsell tracking
  upsell_offered BOOLEAN DEFAULT false,
  upsell_result TEXT,  -- 'accepted', 'rejected', 'pending'

  -- Metadata
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Store onboarding steps
CREATE TABLE IF NOT EXISTS store_steps (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,

  step_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,

  -- Step type: 'video', 'input', 'upload', 'blocked', 'tracking'
  step_type TEXT NOT NULL DEFAULT 'video',

  -- For video steps
  video_url TEXT,
  action_url TEXT,

  -- For input steps: what field to collect
  input_field TEXT,     -- e.g. 'brand_name', 'capital'
  input_value TEXT,     -- value entered by client

  -- Completion
  completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,

  -- Blocking: some steps need team action
  requires_team_action BOOLEAN DEFAULT false,
  team_action_done BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT now()
);

-- Store alerts
CREATE TABLE IF NOT EXISTS store_alerts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id),

  -- Alert type: 'needs_product', 'needs_agent', 'client_issue', 'step_blocked', 'upsell_ready'
  alert_type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,

  -- Priority: 'low', 'medium', 'high', 'urgent'
  priority TEXT DEFAULT 'medium',

  -- Resolution
  resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  resolution_note TEXT,

  created_at TIMESTAMPTZ DEFAULT now()
);

-- Daily tracking (client fills in daily during followup period)
CREATE TABLE IF NOT EXISTS store_daily_tracking (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,

  tracking_date DATE NOT NULL,
  day_number INTEGER,  -- day 1 of 30, etc.

  -- Metrics
  daily_sales NUMERIC(10,2) DEFAULT 0,
  daily_units INTEGER DEFAULT 0,
  ppc_spend NUMERIC(10,2) DEFAULT 0,
  organic_position INTEGER,
  sessions INTEGER DEFAULT 0,
  conversion_rate NUMERIC(5,2),

  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(store_id, tracking_date)
);

-- Store history (post-service tracking for upsell opportunities)
CREATE TABLE IF NOT EXISTS store_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,

  month DATE NOT NULL,  -- first of month
  monthly_revenue NUMERIC(12,2) DEFAULT 0,
  monthly_units INTEGER DEFAULT 0,
  monthly_ppc NUMERIC(10,2) DEFAULT 0,
  profit_margin NUMERIC(5,2),

  health_status TEXT DEFAULT 'stable',  -- 'growing', 'stable', 'declining'
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(store_id, month)
);


-- ============================================
-- SEED DATA (for FBA Academy demo)
-- ============================================

-- Get the FBA Academy client ID
DO $$
DECLARE
  fba_id UUID;
BEGIN
  SELECT id INTO fba_id FROM clients WHERE slug = 'fba-academy';

  IF fba_id IS NULL THEN
    RAISE NOTICE 'FBA Academy client not found, skipping seed';
    RETURN;
  END IF;

  -- === STORES ===

  -- Store 1: Active, doing well
  INSERT INTO stores (id, client_id, owner_name, owner_email, owner_instagram, brand_name, amazon_marketplace, capital_disponible, status, gestor_name, service_type, followup_days, start_date, current_step, total_steps, product_name, product_asin, agent_name, notes)
  VALUES
    ('a1111111-1111-1111-1111-111111111111', fba_id, 'Elena Martínez', 'elena@gmail.com', '@elena_amazon', 'NaturVida', 'ES', 5000, 'active', 'Nacho', 'standard', 30, '2026-03-01', 9, 9, 'Aceite de Argán Orgánico', 'B0EXAMPLE01', 'Proveedor Zhang', 'Muy comprometida, llama siempre a tiempo'),

    ('a2222222-2222-2222-2222-222222222222', fba_id, 'Carlos Ruiz', 'carlos.ruiz@hotmail.com', '@carlos_fba', 'FitGear Pro', 'ES', 8000, 'active', 'Dani', 'standard', 30, '2026-03-05', 7, 9, 'Bandas de Resistencia Premium', 'B0EXAMPLE02', 'Proveedor Li Wei', 'Tiene experiencia previa en ecommerce'),

    ('a3333333-3333-3333-3333-333333333333', fba_id, 'María López', 'maria.lopez@yahoo.es', '@marialopez_es', 'PetHappy', 'ES', 3500, 'onboarding', 'Nacho', 'standard', 30, '2026-03-18', 4, 9, NULL, NULL, NULL, 'Primera vez vendiendo online'),

    ('a4444444-4444-4444-4444-444444444444', fba_id, 'Andrés Gómez', 'andres.gomez@gmail.com', '@andresgomez', 'TechHome', 'DE', 12000, 'blocked', 'Manu', 'premium', 30, '2026-03-10', 5, 9, 'Organizador de Cables LED', 'B0EXAMPLE04', NULL, 'Problema con Brand Registry - marca rechazada'),

    ('a5555555-5555-5555-5555-555555555555', fba_id, 'Laura Sánchez', 'laura.s@gmail.com', '@laura_ecom', 'BeautyLab', 'ES', 6000, 'completed', 'Nacho', 'standard', 30, '2026-02-01', 9, 9, 'Sérum Vitamina C', 'B0EXAMPLE05', 'Proveedor Wang', 'Completó todo el proceso. Facturando bien.'),

    ('a6666666-6666-6666-6666-666666666666', fba_id, 'Pablo Fernández', 'pablo.f@outlook.com', '@pablofba', 'SportMax', 'IT', 7500, 'active', 'Dani', 'mentoring', 30, '2026-03-08', 8, 9, 'Rodillo de Espuma', 'B0EXAMPLE06', 'Proveedor Chen', 'En fase de seguimiento diario'),

    ('a7777777-7777-7777-7777-777777777777', fba_id, 'Sofía Navarro', 'sofia.n@gmail.com', '@sofia_seller', 'EcoKids', 'ES', 4500, 'onboarding', 'Manu', 'standard', 30, '2026-03-20', 2, 9, NULL, NULL, NULL, 'Recién empezando, muy motivada'),

    ('a8888888-8888-8888-8888-888888888888', fba_id, 'Diego Torres', 'diego.t@gmail.com', '@diegotorres', 'CleanPro', 'FR', 9000, 'completed', 'Nacho', 'premium', 30, '2026-01-15', 9, 9, 'Kit Limpieza Ecológica', 'B0EXAMPLE08', 'Proveedor Liu', 'Servicio finalizado. Candidato a mentoría.'),

    ('a9999999-9999-9999-9999-999999999999', fba_id, 'Isabel Moreno', 'isabel.m@gmail.com', '@isabelm_fba', 'YogaFlow', 'ES', 5500, 'active', 'Dani', 'standard', 30, '2026-03-12', 6, 9, 'Esterilla de Yoga Antideslizante', 'B0EXAMPLE09', 'Proveedor Zhao', NULL),

    ('aa000000-0000-0000-0000-000000000000', fba_id, 'Javier Díaz', 'javier.d@gmail.com', '@javierdiaz', 'GamerZone', 'ES', 15000, 'blocked', 'Nacho', 'premium', 30, '2026-03-14', 3, 9, NULL, NULL, NULL, 'Esperando verificación de cuenta Amazon');

  -- === STORE STEPS (for each store, standard 9-step process) ===
  -- Steps template: 1-Crear Cuenta, 2-Brand Registry, 3-Capital, 4-Búsqueda Producto,
  --                 5-Agente Compras, 6-Etiquetas, 7-Envío FBA, 8-Feedback Video, 9-Seguimiento Diario

  -- Elena (active, all 9 done)
  INSERT INTO store_steps (store_id, step_number, title, step_type, completed, requires_team_action, team_action_done, video_url) VALUES
    ('a1111111-1111-1111-1111-111111111111', 1, 'Crear Cuenta Amazon Seller', 'video', true, false, false, 'https://videos.fba/crear-cuenta'),
    ('a1111111-1111-1111-1111-111111111111', 2, 'Brand Registry', 'input', true, false, false, 'https://videos.fba/brand-registry'),
    ('a1111111-1111-1111-1111-111111111111', 3, 'Capital Disponible', 'input', true, false, false, NULL),
    ('a1111111-1111-1111-1111-111111111111', 4, 'Búsqueda de Producto', 'blocked', true, true, true, 'https://videos.fba/busqueda-producto'),
    ('a1111111-1111-1111-1111-111111111111', 5, 'Agente de Compras', 'blocked', true, true, true, 'https://videos.fba/agente-compras'),
    ('a1111111-1111-1111-1111-111111111111', 6, 'Generar Etiquetas', 'video', true, false, false, 'https://videos.fba/etiquetas'),
    ('a1111111-1111-1111-1111-111111111111', 7, 'Envío a FBA', 'video', true, false, false, 'https://videos.fba/envio-fba'),
    ('a1111111-1111-1111-1111-111111111111', 8, 'Vídeo de Feedback', 'upload', true, false, false, NULL),
    ('a1111111-1111-1111-1111-111111111111', 9, 'Seguimiento Diario', 'tracking', true, false, false, NULL);

  -- María (onboarding, step 4 - first 3 done, step 4 blocked waiting for product)
  INSERT INTO store_steps (store_id, step_number, title, step_type, completed, requires_team_action, team_action_done, video_url) VALUES
    ('a3333333-3333-3333-3333-333333333333', 1, 'Crear Cuenta Amazon Seller', 'video', true, false, false, 'https://videos.fba/crear-cuenta'),
    ('a3333333-3333-3333-3333-333333333333', 2, 'Brand Registry', 'input', true, false, false, 'https://videos.fba/brand-registry'),
    ('a3333333-3333-3333-3333-333333333333', 3, 'Capital Disponible', 'input', true, false, false, NULL),
    ('a3333333-3333-3333-3333-333333333333', 4, 'Búsqueda de Producto', 'blocked', false, true, false, 'https://videos.fba/busqueda-producto'),
    ('a3333333-3333-3333-3333-333333333333', 5, 'Agente de Compras', 'blocked', false, true, false, 'https://videos.fba/agente-compras'),
    ('a3333333-3333-3333-3333-333333333333', 6, 'Generar Etiquetas', 'video', false, false, false, 'https://videos.fba/etiquetas'),
    ('a3333333-3333-3333-3333-333333333333', 7, 'Envío a FBA', 'video', false, false, false, 'https://videos.fba/envio-fba'),
    ('a3333333-3333-3333-3333-333333333333', 8, 'Vídeo de Feedback', 'upload', false, false, false, NULL),
    ('a3333333-3333-3333-3333-333333333333', 9, 'Seguimiento Diario', 'tracking', false, false, false, NULL);

  -- Andrés (blocked at step 5, brand registry issue)
  INSERT INTO store_steps (store_id, step_number, title, step_type, completed, requires_team_action, team_action_done, video_url) VALUES
    ('a4444444-4444-4444-4444-444444444444', 1, 'Crear Cuenta Amazon Seller', 'video', true, false, false, 'https://videos.fba/crear-cuenta'),
    ('a4444444-4444-4444-4444-444444444444', 2, 'Brand Registry', 'input', true, false, false, 'https://videos.fba/brand-registry'),
    ('a4444444-4444-4444-4444-444444444444', 3, 'Capital Disponible', 'input', true, false, false, NULL),
    ('a4444444-4444-4444-4444-444444444444', 4, 'Búsqueda de Producto', 'blocked', true, true, true, 'https://videos.fba/busqueda-producto'),
    ('a4444444-4444-4444-4444-444444444444', 5, 'Agente de Compras', 'blocked', false, true, false, 'https://videos.fba/agente-compras'),
    ('a4444444-4444-4444-4444-444444444444', 6, 'Generar Etiquetas', 'video', false, false, false, 'https://videos.fba/etiquetas'),
    ('a4444444-4444-4444-4444-444444444444', 7, 'Envío a FBA', 'video', false, false, false, 'https://videos.fba/envio-fba'),
    ('a4444444-4444-4444-4444-444444444444', 8, 'Vídeo de Feedback', 'upload', false, false, false, NULL),
    ('a4444444-4444-4444-4444-444444444444', 9, 'Seguimiento Diario', 'tracking', false, false, false, NULL);

  -- === ALERTS ===
  INSERT INTO store_alerts (store_id, client_id, alert_type, title, message, priority, resolved) VALUES
    ('a3333333-3333-3333-3333-333333333333', fba_id, 'needs_product', 'María necesita producto asignado', 'Ha completado los 3 primeros pasos. Necesita que le asignemos un producto para continuar.', 'high', false),
    ('a4444444-4444-4444-4444-444444444444', fba_id, 'client_issue', 'Andrés - Brand Registry rechazado', 'Amazon ha rechazado la marca TechHome. Hay que registrar una nueva marca o apelar.', 'urgent', false),
    ('a4444444-4444-4444-4444-444444444444', fba_id, 'needs_agent', 'Andrés necesita agente de compras', 'Una vez resuelto el Brand Registry, asignar agente de compras.', 'medium', false),
    ('aa000000-0000-0000-0000-000000000000', fba_id, 'step_blocked', 'Javier - Verificación cuenta pendiente', 'Amazon no ha verificado la cuenta aún. Lleva 12 días esperando.', 'high', false),
    ('a5555555-5555-5555-5555-555555555555', fba_id, 'upsell_ready', 'Laura - Oportunidad de upsell', 'Ha completado todo el servicio y está facturando bien. Candidata a mentoría 1:1.', 'medium', false),
    ('a8888888-8888-8888-8888-888888888888', fba_id, 'upsell_ready', 'Diego - Oportunidad de mentoría', 'Servicio premium completado. Facturación creciente. Ofrecer mentoría.', 'low', false),
    ('a2222222-2222-2222-2222-222222222222', fba_id, 'client_issue', 'Carlos - Posible problema PPC', 'Gasto PPC alto últimos 3 días sin conversiones. Revisar campaña.', 'high', false);

  -- === DAILY TRACKING (for Elena - store a111, last 15 days) ===
  INSERT INTO store_daily_tracking (store_id, tracking_date, day_number, daily_sales, daily_units, ppc_spend, organic_position, sessions, conversion_rate) VALUES
    ('a1111111-1111-1111-1111-111111111111', '2026-03-12', 12, 89.90, 3, 12.50, 28, 145, 2.1),
    ('a1111111-1111-1111-1111-111111111111', '2026-03-13', 13, 119.70, 4, 15.00, 24, 168, 2.4),
    ('a1111111-1111-1111-1111-111111111111', '2026-03-14', 14, 59.90, 2, 11.00, 22, 132, 1.5),
    ('a1111111-1111-1111-1111-111111111111', '2026-03-15', 15, 149.75, 5, 18.00, 20, 195, 2.6),
    ('a1111111-1111-1111-1111-111111111111', '2026-03-16', 16, 89.90, 3, 14.00, 19, 158, 1.9),
    ('a1111111-1111-1111-1111-111111111111', '2026-03-17', 17, 179.80, 6, 20.00, 17, 210, 2.9),
    ('a1111111-1111-1111-1111-111111111111', '2026-03-18', 18, 209.65, 7, 22.00, 15, 240, 2.9),
    ('a1111111-1111-1111-1111-111111111111', '2026-03-19', 19, 149.75, 5, 16.00, 14, 198, 2.5),
    ('a1111111-1111-1111-1111-111111111111', '2026-03-20', 20, 239.60, 8, 25.00, 12, 280, 2.9),
    ('a1111111-1111-1111-1111-111111111111', '2026-03-21', 21, 179.80, 6, 19.00, 11, 225, 2.7),
    ('a1111111-1111-1111-1111-111111111111', '2026-03-22', 22, 299.50, 10, 28.00, 10, 310, 3.2),
    ('a1111111-1111-1111-1111-111111111111', '2026-03-23', 23, 269.55, 9, 24.00, 9, 295, 3.1),
    ('a1111111-1111-1111-1111-111111111111', '2026-03-24', 24, 329.45, 11, 30.00, 8, 340, 3.2),
    ('a1111111-1111-1111-1111-111111111111', '2026-03-25', 25, 359.40, 12, 32.00, 7, 365, 3.3),
    ('a1111111-1111-1111-1111-111111111111', '2026-03-26', 26, 299.50, 10, 27.00, 7, 320, 3.1);

  -- === STORE HISTORY (for completed stores) ===
  INSERT INTO store_history (store_id, month, monthly_revenue, monthly_units, monthly_ppc, profit_margin, health_status) VALUES
    ('a5555555-5555-5555-5555-555555555555', '2026-03-01', 4250.00, 142, 380.00, 28.5, 'growing'),
    ('a5555555-5555-5555-5555-555555555555', '2026-02-01', 3100.00, 103, 420.00, 22.0, 'stable'),
    ('a8888888-8888-8888-8888-888888888888', '2026-03-01', 7800.00, 195, 650.00, 32.0, 'growing'),
    ('a8888888-8888-8888-8888-888888888888', '2026-02-01', 6200.00, 155, 580.00, 28.0, 'growing'),
    ('a8888888-8888-8888-8888-888888888888', '2026-01-01', 4500.00, 112, 520.00, 24.0, 'stable');

END $$;
