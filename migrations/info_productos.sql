-- ============================================================
-- Migration: Info Productos module + move FBA / Creator Founder
-- ============================================================
-- 1) Move FBA Academy -> consultoria (KEEP tiendas + current features)
--    Move Creator Founder -> growth (enable info_productos, disable tiendas)
--    Flip remaining growth clients: tiendas=false, info_productos=true
-- 2) Create tables for info_productos, assets, process templates, steps
-- 3) Seed a default process template (pre-lanzamiento -> lanzamiento -> post)
-- ============================================================

-- ─── 1. CLIENT MOVES ───────────────────────────────────────────

-- FBA Academy: goes to consultoria BUT keeps tiendas and all its growth features.
-- We set client_type = 'consultoria' and write an explicit enabled_features override
-- so that the consultoria default (which disables tiendas) does not strip its store mgmt.
UPDATE clients
SET client_type = 'consultoria',
    enabled_features = COALESCE(enabled_features, '{}'::jsonb) || '{
      "ventas": true,
      "reportes": true,
      "crm": true,
      "cuentas": true,
      "tiendas": true,
      "info_productos": false,
      "mentorias": true,
      "task_management": true,
      "operations": true,
      "formacion": true,
      "manufacturing": false,
      "marketing": true,
      "ai_agents": true,
      "email_marketing": true,
      "contabilidad": true,
      "proyecciones": true,
      "comisiones": true,
      "productos": true,
      "metodos_pago": true
    }'::jsonb
WHERE slug = 'fba-academy';

-- Creator Founder: goes to growth, gets info_productos (and the full growth stack minus tiendas)
UPDATE clients
SET client_type = 'growth',
    enabled_features = COALESCE(enabled_features, '{}'::jsonb) || '{
      "ventas": true,
      "reportes": true,
      "crm": true,
      "cuentas": true,
      "tiendas": false,
      "info_productos": true,
      "mentorias": true,
      "task_management": true,
      "operations": true,
      "formacion": true,
      "manufacturing": false,
      "marketing": true,
      "ai_agents": true,
      "email_marketing": true,
      "contabilidad": true,
      "proyecciones": true,
      "comisiones": true,
      "productos": true,
      "metodos_pago": true
    }'::jsonb
WHERE slug = 'creator-founder';

-- Any OTHER growth client: replace tiendas with info_productos
UPDATE clients
SET enabled_features = COALESCE(enabled_features, '{}'::jsonb)
                       || jsonb_build_object('tiendas', false, 'info_productos', true)
WHERE client_type = 'growth'
  AND slug NOT IN ('fba-academy', 'creator-founder');

-- ─── 2. INFO PRODUCTOS SCHEMA ─────────────────────────────────

CREATE TABLE IF NOT EXISTS info_productos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'pre_lanzamiento',
  current_phase text DEFAULT 'pre_lanzamiento',
  template_id uuid,
  config jsonb DEFAULT '{}'::jsonb,
  launch_date date,
  owner_member_id uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_info_productos_client ON info_productos(client_id);

-- Assets: webs, comunidades, funnels (and extensible)
CREATE TABLE IF NOT EXISTS info_producto_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  info_producto_id uuid NOT NULL REFERENCES info_productos(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('web', 'comunidad', 'funnel', 'otro')),
  name text NOT NULL,
  url text,
  status text DEFAULT 'activo',
  config jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_info_producto_assets_ip ON info_producto_assets(info_producto_id);
CREATE INDEX IF NOT EXISTS idx_info_producto_assets_type ON info_producto_assets(type);

-- Configurable process templates (per client)
CREATE TABLE IF NOT EXISTS info_producto_process_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  -- phases: [{ key, label, order, steps: [{ key, label, description, order }] }]
  phases jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_default boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ip_templates_client ON info_producto_process_templates(client_id);

-- Per-info-producto step tracking (copied from template on creation, then freely editable)
CREATE TABLE IF NOT EXISTS info_producto_process_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  info_producto_id uuid NOT NULL REFERENCES info_productos(id) ON DELETE CASCADE,
  phase_key text NOT NULL,
  phase_label text,
  step_key text NOT NULL,
  step_label text NOT NULL,
  description text,
  order_index int DEFAULT 0,
  completed boolean DEFAULT false,
  completed_at timestamptz,
  completed_by uuid,
  notes text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ip_steps_ip ON info_producto_process_steps(info_producto_id);
CREATE INDEX IF NOT EXISTS idx_ip_steps_phase ON info_producto_process_steps(info_producto_id, phase_key);

-- ─── 3. DEFAULT PROCESS TEMPLATE (global, client_id = NULL) ───
-- Can be cloned per client; fully editable.
INSERT INTO info_producto_process_templates (client_id, name, description, is_default, phases)
SELECT NULL,
       'Lanzamiento Info Producto - Estándar',
       'Plantilla por defecto: pre-lanzamiento, lanzamiento y post-lanzamiento',
       true,
       '[
         {
           "key": "pre_lanzamiento",
           "label": "Pre-Lanzamiento",
           "order": 1,
           "steps": [
             { "key": "idea_validada", "label": "Idea validada con audiencia", "order": 1 },
             { "key": "avatar_cliente", "label": "Avatar de cliente definido", "order": 2 },
             { "key": "promesa_oferta", "label": "Promesa y oferta principal", "order": 3 },
             { "key": "roadmap_contenido", "label": "Roadmap de contenidos de calentamiento", "order": 4 },
             { "key": "assets_web", "label": "Landing / web de captación lista", "order": 5 },
             { "key": "assets_comunidad", "label": "Comunidad (Telegram/Skool/Discord) creada", "order": 6 },
             { "key": "assets_funnel", "label": "Funnel de email / webinar configurado", "order": 7 }
           ]
         },
         {
           "key": "lanzamiento",
           "label": "Lanzamiento",
           "order": 2,
           "steps": [
             { "key": "carrito_abierto", "label": "Carrito abierto", "order": 1 },
             { "key": "secuencia_emails", "label": "Secuencia de emails activa", "order": 2 },
             { "key": "directos_webinars", "label": "Directos / webinars ejecutados", "order": 3 },
             { "key": "cierre_carrito", "label": "Cierre de carrito", "order": 4 }
           ]
         },
         {
           "key": "post_lanzamiento",
           "label": "Post-Lanzamiento",
           "order": 3,
           "steps": [
             { "key": "entrega_producto", "label": "Entrega del info producto / acceso", "order": 1 },
             { "key": "onboarding_alumnos", "label": "Onboarding de alumnos", "order": 2 },
             { "key": "soporte_comunidad", "label": "Soporte en comunidad", "order": 3 },
             { "key": "feedback_retencion", "label": "Feedback y retención", "order": 4 },
             { "key": "post_mortem", "label": "Post-mortem del lanzamiento", "order": 5 }
           ]
         }
       ]'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM info_producto_process_templates
  WHERE is_default = true AND client_id IS NULL
);
