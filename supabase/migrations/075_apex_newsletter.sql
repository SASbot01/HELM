-- 075_apex_newsletter.sql
--
-- Newsletter pública APEX + audit log de la API admin para uso de IA.
--
-- 4 tablas:
--   apex_newsletter_posts        — publicaciones (drafts + published) que alimentan /notes
--   apex_newsletter_subscribers  — emails suscritos (double opt-in con Resend)
--   apex_newsletter_sends        — audit de qué post se envió a cuántos subs (anti-doble-envío)
--   apex_admin_api_audit         — log de cada call a /api/admin/* via X-Admin-Key
--
-- Diseño:
--   - Slug único reutilizado como permalink (/notes/<slug>).
--   - body_md = Markdown — el frontend lo renderiza con react-markdown (added).
--   - hero_url opcional + hero_svg_seed opcional para fallback al SVG generativo
--     que el theme APEX ya usa cuando no hay imagen.
--   - status='draft' por defecto: nada se publica accidentalmente.
--   - published_at separado de created_at para programar publicación futura.
--
-- Subscribers:
--   - status='pending' al suscribirse → email de confirmación con confirm_token →
--     status='active' al hacer click → recibe envíos.
--   - unsubscribe_token permanente para que cada email lleve su link de baja.
--
-- Audit API admin:
--   - Para cada call con X-Admin-Key. Útil para que Alejandro vea qué hace la IA.
--   - api_key_hash = sha256 del key usado (no guardamos el key plano).
--   - request_body con redacción de campos sensibles (password, token).

-- ─── Posts ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS apex_newsletter_posts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            text UNIQUE NOT NULL,
  title           text NOT NULL,
  excerpt         text,
  body_md         text NOT NULL,
  hero_url        text,
  hero_svg_seed   text,                                  -- fallback determinístico al SVG generativo
  category        text DEFAULT 'Field Notes',
  read_minutes    int  DEFAULT 5,
  author_name     text DEFAULT 'BlackWolf Team',
  author_role     text,
  language        text DEFAULT 'en',                     -- 'en' | 'es'
  tags            text[] DEFAULT ARRAY[]::text[],
  status          text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','published','archived')),
  published_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_apex_posts_status_published
  ON apex_newsletter_posts (status, published_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_apex_posts_language
  ON apex_newsletter_posts (language);

-- updated_at automático
CREATE OR REPLACE FUNCTION apex_newsletter_posts_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS apex_newsletter_posts_updated_at ON apex_newsletter_posts;
CREATE TRIGGER apex_newsletter_posts_updated_at
  BEFORE UPDATE ON apex_newsletter_posts
  FOR EACH ROW EXECUTE FUNCTION apex_newsletter_posts_set_updated_at();

-- ─── Subscribers ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS apex_newsletter_subscribers (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email              text UNIQUE NOT NULL,
  name               text,
  status             text NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending','active','unsubscribed','bounced','complained')),
  language           text DEFAULT 'en',
  confirm_token      text,                       -- nullable cuando ya está confirmado
  unsubscribe_token  text NOT NULL,              -- permanente
  source             text,                       -- 'web', 'admin', 'import', etc
  utm                jsonb DEFAULT '{}'::jsonb,
  subscribed_at      timestamptz NOT NULL DEFAULT now(),
  confirmed_at       timestamptz,
  unsubscribed_at    timestamptz
);
CREATE INDEX IF NOT EXISTS idx_apex_subs_status ON apex_newsletter_subscribers (status);
CREATE INDEX IF NOT EXISTS idx_apex_subs_email_lower ON apex_newsletter_subscribers (lower(email));

-- ─── Sends (audit de envíos) ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS apex_newsletter_sends (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id           uuid NOT NULL REFERENCES apex_newsletter_posts(id) ON DELETE CASCADE,
  subscriber_count  int NOT NULL,
  resend_batch_id   text,                        -- si se hace batch via Resend
  triggered_by      text,                        -- 'admin_api' | 'manual_ui' | 'auto_publish'
  meta              jsonb DEFAULT '{}'::jsonb,
  sent_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_apex_sends_post ON apex_newsletter_sends (post_id, sent_at DESC);

-- ─── Audit log de la API admin ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS apex_admin_api_audit (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint        text NOT NULL,                 -- 'newsletter.create', 'tenants.list', etc
  method          text NOT NULL,                 -- 'GET','POST','PATCH','DELETE'
  api_key_hash    text,                          -- sha256 del key usado (nunca el plano)
  ip              inet,
  user_agent      text,
  request_body    jsonb,                         -- redactada (sin password/token)
  response_status int,
  duration_ms     int,
  error           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_apex_admin_audit_created_at
  ON apex_admin_api_audit (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_apex_admin_audit_endpoint
  ON apex_admin_api_audit (endpoint, created_at DESC);

-- ─── Seed (1 post de bienvenida para que /notes no quede vacío al deploy) ──
INSERT INTO apex_newsletter_posts (slug, title, excerpt, body_md, category, read_minutes, status, published_at)
VALUES (
  'welcome-apex-newsletter',
  'Welcome to APEX Notes',
  'Field reports and operating theory from running operations across multiple businesses simultaneously. New posts will land here as we publish them.',
  '# Welcome to APEX Notes

This is the start of our public field log.

We will be writing here about:

- **Operations as a discipline**: not marketing, not strategy — the boring middle layer that decides whether a business compounds or stalls.
- **AI agents in production**: what works, what does not, and the line between automation and theatre.
- **Multi-tenant SaaS**: the architectural choices we make to run dozens of clients on one platform without their problems leaking into each other.

Subscribe to receive new entries directly to your inbox. We will not write often — only when there is something concrete to share.

— BlackWolf Team',
  'Field Notes',
  3,
  'published',
  now()
)
ON CONFLICT (slug) DO NOTHING;
