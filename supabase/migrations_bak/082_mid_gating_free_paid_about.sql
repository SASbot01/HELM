-- 082_mid_gating_free_paid_about.sql
-- Capa de gating del Infoproducto /mid/:
--   1. training_routes con access_type (free|paid) + precio + payment_url
--      → permite candado en cards y desbloqueo manual del admin tras pago externo.
--   2. infoproducto_about: bloques editables tipo Skool para /mid/<slug>/about
--      (heading | text | image | video | quote | bullet).
--
-- Sin RLS efectiva aún — el gating se aplica en api/_lib (auth session
-- check) y en los handlers de api/mid/*. Same pattern as el resto del módulo.

-- ── training_routes: free/paid + precio ────────────────────────────────────
ALTER TABLE training_routes
  ADD COLUMN IF NOT EXISTS access_type TEXT NOT NULL DEFAULT 'free';

-- Constraint nombrada para poder dropearla si en el futuro añadimos más
-- tipos (subscription, bundle, etc.).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'training_routes_access_type_chk'
  ) THEN
    ALTER TABLE training_routes
      ADD CONSTRAINT training_routes_access_type_chk
      CHECK (access_type IN ('free','paid'));
  END IF;
END $$;

ALTER TABLE training_routes
  ADD COLUMN IF NOT EXISTS price_cents INTEGER;

ALTER TABLE training_routes
  ADD COLUMN IF NOT EXISTS price_currency TEXT DEFAULT 'EUR';

ALTER TABLE training_routes
  ADD COLUMN IF NOT EXISTS payment_url TEXT;

COMMENT ON COLUMN training_routes.access_type IS
  'free = cualquier usuario registrado puede inscribirse. paid = requiere desbloqueo manual del admin (o webhook futuro) tras pago externo via payment_url.';

COMMENT ON COLUMN training_routes.payment_url IS
  'URL externa de pago (Stripe Checkout link, Hotmart, etc.). El user clica desde la card bloqueada; tras confirmar pago el admin le marca subscription manual.';

-- ── infoproducto_about: bloques editables tipo Skool ──────────────────────
CREATE TABLE IF NOT EXISTS infoproducto_about (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_slug  TEXT NOT NULL,
  -- kind define cómo se renderiza el bloque:
  --   heading | text | image | video | quote | bullet
  kind         TEXT NOT NULL,
  -- Contenido textual del bloque (caption para image/video, texto para
  -- text/heading/quote, label para bullet).
  content      TEXT,
  -- URL de imagen (Supabase Storage bucket mid-uploads) o vídeo
  -- (YouTube/Vimeo/MP4).
  media_url    TEXT,
  position     INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'infoproducto_about_kind_chk'
  ) THEN
    ALTER TABLE infoproducto_about
      ADD CONSTRAINT infoproducto_about_kind_chk
      CHECK (kind IN ('heading','text','image','video','quote','bullet'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS infoproducto_about_tenant_idx
  ON infoproducto_about (tenant_slug, position);

COMMENT ON TABLE infoproducto_about IS
  'Bloques editables que componen la página /mid/<slug>/about (estilo Skool). Pública: cualquiera puede leer sin login. Editable solo por admin del tenant.';
