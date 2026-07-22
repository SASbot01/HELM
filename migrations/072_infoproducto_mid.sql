-- ============================================================
-- Migration 072: Infoproducto / "MID" — community + course platform
-- ============================================================
-- Crea las tablas para el módulo Infoproducto público (/mid/<slug>).
-- Reemplaza la combinación Training+Marketplace+Comunidad para clientes growth
-- con una plataforma pública (anuncios, grupos, fotos) + área privada de
-- formación tras login. Las cuentas son SEPARADAS del CRM (team_members
-- sigue siendo del staff interno; los usuarios de /mid son alumnos públicos).
--
-- Convenciones:
--  - tenant_slug = slug textual del cliente en clients.slug. Se desnormaliza
--    aquí para evitar joins en lectura pública alta-frecuencia.
--  - public_read = filas que pueden leerse sin auth (anuncios + grupos
--    públicos + fotos). Resto exige sesión válida.
-- ============================================================

-- ─── 1. USERS (alumnos / miembros de comunidad) ──────────────────────────
CREATE TABLE IF NOT EXISTS infoproducto_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_slug text NOT NULL,
  email text NOT NULL,
  password_hash text NOT NULL,           -- formato scrypt:<salt>:<hash>
  name text,
  avatar_url text,
  bio text,
  role text NOT NULL DEFAULT 'member',   -- 'member' | 'admin' (admin del tenant)
  active boolean NOT NULL DEFAULT true,
  email_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- NOTA: la unicidad case-insensitive (tenant + lower(email)) se aplica via
  -- CREATE UNIQUE INDEX más abajo. Postgres no acepta funciones en UNIQUE inline.
  UNIQUE (tenant_slug, email)
);
CREATE INDEX IF NOT EXISTS idx_ip_users_tenant ON infoproducto_users (tenant_slug);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ip_users_tenant_email_lower
  ON infoproducto_users (tenant_slug, lower(email));

-- ─── 2. SESIONES ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS infoproducto_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES infoproducto_users(id) ON DELETE CASCADE,
  tenant_slug text NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  revoked_at timestamptz,
  ip inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ip_sessions_token ON infoproducto_sessions (token) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ip_sessions_user ON infoproducto_sessions (user_id);

-- ─── 3. ANUNCIOS (públicos) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS infoproducto_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_slug text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  category text,                         -- 'evento' | 'webinar' | 'oferta' | 'aviso' | null
  cover_url text,
  cta_label text,
  cta_url text,
  pinned boolean NOT NULL DEFAULT false,
  published boolean NOT NULL DEFAULT true,
  author_user_id uuid REFERENCES infoproducto_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ip_anns_tenant ON infoproducto_announcements (tenant_slug, published, pinned DESC, created_at DESC);

-- ─── 4. GRUPOS ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS infoproducto_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_slug text NOT NULL,
  name text NOT NULL,
  description text,
  cover_url text,
  is_public boolean NOT NULL DEFAULT true,   -- listable y previewable sin login
  member_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ip_groups_tenant ON infoproducto_groups (tenant_slug, is_public);

CREATE TABLE IF NOT EXISTS infoproducto_group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES infoproducto_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES infoproducto_users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member',       -- 'member' | 'mod'
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS infoproducto_group_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES infoproducto_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES infoproducto_users(id) ON DELETE SET NULL,
  body text NOT NULL,
  image_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ip_posts_group ON infoproducto_group_posts (group_id, created_at DESC);

-- ─── 5. FOTOS (galería pública) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS infoproducto_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_slug text NOT NULL,
  user_id uuid REFERENCES infoproducto_users(id) ON DELETE SET NULL,
  url text NOT NULL,
  caption text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ip_photos_tenant ON infoproducto_photos (tenant_slug, created_at DESC);

-- ─── 6. CURSOS / FORMACIÓN — wrapper sobre training_* existente ─────────
-- No duplicamos el schema de training_*. Solo añadimos un mapeo opcional
-- de "qué training_route es el principal para este tenant" para que /mid
-- pueda mostrar la formación sin requerir conocimiento del schema interno.
CREATE TABLE IF NOT EXISTS infoproducto_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_slug text NOT NULL UNIQUE,
  primary_training_route_id uuid,        -- nullable; si null, se listan todas las rutas del cliente
  hero_title text,                       -- override del título de portada
  hero_subtitle text,
  hero_cta_label text,
  hero_cta_url text,
  show_marketplace boolean NOT NULL DEFAULT false,  -- por defecto OCULTO
  show_groups boolean NOT NULL DEFAULT true,
  show_photos boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ─── 7. SEED para asesorias-suiza y detras-de-camara ────────────────────
-- Solo si el row no existe ya (idempotente).
INSERT INTO infoproducto_config (tenant_slug, hero_title, hero_subtitle, show_marketplace)
VALUES
  ('asesorias-suiza',
   'Comunidad Asesoría Suiza',
   'Recursos, eventos y formación para construir tu camino profesional en Suiza.',
   false),
  ('detras-de-camara',
   'Comunidad Detrás de Cámara',
   'Espacio de creadores: comparte trabajo, descubre formación y conecta con la comunidad.',
   false)
ON CONFLICT (tenant_slug) DO NOTHING;

-- Anuncio inicial placeholder (el cliente luego edita o borra desde admin)
INSERT INTO infoproducto_announcements (tenant_slug, title, body, category, pinned)
SELECT 'asesorias-suiza',
       'Bienvenido a la comunidad',
       'Aquí publicaremos novedades, sesiones en vivo, recursos y oportunidades. Suscríbete para no perderte nada.',
       'aviso',
       true
WHERE NOT EXISTS (
  SELECT 1 FROM infoproducto_announcements WHERE tenant_slug = 'asesorias-suiza'
);

INSERT INTO infoproducto_announcements (tenant_slug, title, body, category, pinned)
SELECT 'detras-de-camara',
       'Bienvenido a la comunidad',
       'Aquí publicaremos novedades, sesiones en vivo, recursos y oportunidades. Suscríbete para no perderte nada.',
       'aviso',
       true
WHERE NOT EXISTS (
  SELECT 1 FROM infoproducto_announcements WHERE tenant_slug = 'detras-de-camara'
);

-- ─── 7b. Admin seed — credenciales iniciales para Alejandro ─────────────
-- email: alejandro.cto@blackwolfsec.io  ·  password: Infoproducto2026!
-- Hash scrypt generado a partir de password_hash de api/_lib/passwords.js.
-- ON CONFLICT (tenant_slug, lower(email)) — re-correr no duplica.
-- Cambiar la password tras primer login (no hay UI todavía: SQL UPDATE manual
-- o llamar API /api/mid/auth?action=register con role=admin desde otro admin).
INSERT INTO infoproducto_users (tenant_slug, email, password_hash, name, role, active)
VALUES
  ('asesorias-suiza',
   'alejandro.cto@blackwolfsec.io',
   'scrypt:5d796b65d2a4915cbee43a1cda77989d:3207a66491d29cc7b51989d2d8e44b42e05d37328e27cc562aad8c02eba226ad3df89199d3fcb80c869a6a7461b3c0fee71c8ef559c2a02d3581f70e1dae7aa8',
   'Alejandro (admin)',
   'admin',
   true),
  ('detras-de-camara',
   'alejandro.cto@blackwolfsec.io',
   'scrypt:5d796b65d2a4915cbee43a1cda77989d:3207a66491d29cc7b51989d2d8e44b42e05d37328e27cc562aad8c02eba226ad3df89199d3fcb80c869a6a7461b3c0fee71c8ef559c2a02d3581f70e1dae7aa8',
   'Alejandro (admin)',
   'admin',
   true)
ON CONFLICT (tenant_slug, (lower(email))) DO NOTHING;

-- Grupo público inicial
INSERT INTO infoproducto_groups (tenant_slug, name, description, is_public)
SELECT 'asesorias-suiza', 'General', 'Punto de encuentro abierto de la comunidad.', true
WHERE NOT EXISTS (SELECT 1 FROM infoproducto_groups WHERE tenant_slug = 'asesorias-suiza');

INSERT INTO infoproducto_groups (tenant_slug, name, description, is_public)
SELECT 'detras-de-camara', 'General', 'Punto de encuentro abierto de la comunidad.', true
WHERE NOT EXISTS (SELECT 1 FROM infoproducto_groups WHERE tenant_slug = 'detras-de-camara');

-- ─── 8. RLS — el frontend usa anon key. Lecturas públicas explícitas. ────
-- (Bloque opcional: el repo trabaja con RLS permisiva por ahora — coherente
--  con el patrón existente. Los writes irán por API server-side con service key).
ALTER TABLE infoproducto_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE infoproducto_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE infoproducto_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE infoproducto_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE infoproducto_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE infoproducto_group_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE infoproducto_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE infoproducto_config ENABLE ROW LEVEL SECURITY;

-- Lectura pública (anon role) en superficies que deben ser visibles sin login.
CREATE POLICY ip_ann_public_read ON infoproducto_announcements
  FOR SELECT USING (published = true);
CREATE POLICY ip_groups_public_read ON infoproducto_groups
  FOR SELECT USING (is_public = true);
CREATE POLICY ip_photos_public_read ON infoproducto_photos
  FOR SELECT USING (true);
CREATE POLICY ip_config_public_read ON infoproducto_config
  FOR SELECT USING (true);

-- Service-role bypass implícito en Supabase, así que los endpoints API
-- (que usan SUPABASE_SERVICE_KEY) ignoran estas policies.
-- El cliente con anon key SOLO puede SELECT en las tablas de arriba.
-- Para escrituras (registro, crear post) hay que pasar por /api/mid/*.
