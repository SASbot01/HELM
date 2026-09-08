-- 080_mid_profile_ranking_posts.sql
-- Capa social del Infoproducto: perfil enriquecido, ranking por puntos,
-- posts de comunidad (cualquier user logueado), suscripción a cursos
-- y progreso por lección (separado de training_progress que vive sobre
-- team_members del CRM).
--
-- Reglas:
--   - infoproducto_users.points = ranking total. Lo sube progress.js y
--     posts.js, lo baja un DELETE de progreso. Es un denormalizado:
--     fuente de verdad sigue siendo mid_lesson_progress + mid_posts,
--     pero leer un INT en cada render es más barato que un COUNT.
--   - mid_posts es el feed social del usuario. Distinto de
--     infoproducto_announcements (anuncios del admin del tenant).
--     Comparten layout en el frontend pero son tablas separadas.
--   - mid_lesson_progress está scoped por (tenant_slug,user_id,lesson_id).
--     Tenant_slug redundante con user pero ahorra joins en stats.
--   - mid_route_subscriptions = "estoy inscrito a este curso". El admin
--     no necesita estar suscrito para ver/editar.

-- ── infoproducto_users: ranking + denormalización de subscription count ──
ALTER TABLE infoproducto_users
  ADD COLUMN IF NOT EXISTS points INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS infoproducto_users_points_idx
  ON infoproducto_users (tenant_slug, points DESC);

-- ── mid_posts ──────────────────────────────────────────────────────────
-- Posts de comunidad creados por miembros (no por admin). El admin sigue
-- usando infoproducto_announcements para los broadcasts oficiales.
CREATE TABLE IF NOT EXISTS mid_posts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_slug  TEXT NOT NULL,
  user_id      UUID NOT NULL REFERENCES infoproducto_users(id) ON DELETE CASCADE,
  title        TEXT,
  body         TEXT NOT NULL,
  -- Array de objetos { url, filename, mime }. Reusa el mismo schema que
  -- mid_messages.attachments para que el upload endpoint sea común.
  images       JSONB NOT NULL DEFAULT '[]'::jsonb,
  likes_count  INTEGER NOT NULL DEFAULT 0,
  comments_count INTEGER NOT NULL DEFAULT 0,
  deleted_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS mid_posts_tenant_idx
  ON mid_posts (tenant_slug, deleted_at, created_at DESC);

CREATE INDEX IF NOT EXISTS mid_posts_user_idx
  ON mid_posts (user_id, created_at DESC);

COMMENT ON TABLE mid_posts IS
  'Posts del feed de comunidad del Infoproducto. Creados por cualquier miembro logueado. Soft delete via deleted_at. +5 puntos al user al crear.';

-- ── mid_lesson_progress ────────────────────────────────────────────────
-- Marca lecciones completadas por miembros del Infoproducto. La tabla
-- training_progress preexistente vive sobre team_members (CRM staff) — no
-- la podemos reusar para alumnos. Tabla nueva, dedicada a infoproducto_users.
CREATE TABLE IF NOT EXISTS mid_lesson_progress (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_slug   TEXT NOT NULL,
  user_id       UUID NOT NULL REFERENCES infoproducto_users(id) ON DELETE CASCADE,
  lesson_id     UUID NOT NULL REFERENCES training_lessons(id) ON DELETE CASCADE,
  completed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Reservado por si añadimos auto-progress (último segundo visto). Por
  -- ahora el modelo es binario: completed o no completed.
  watched_seconds INTEGER,
  UNIQUE (user_id, lesson_id)
);

CREATE INDEX IF NOT EXISTS mid_lesson_progress_tenant_user_idx
  ON mid_lesson_progress (tenant_slug, user_id);

CREATE INDEX IF NOT EXISTS mid_lesson_progress_lesson_idx
  ON mid_lesson_progress (lesson_id);

COMMENT ON TABLE mid_lesson_progress IS
  'Progreso de lecciones por miembro del Infoproducto. Binario completed/no. +2 puntos al user al marcar.';

-- ── mid_route_subscriptions ────────────────────────────────────────────
-- Suscripción de un miembro a una "route" de training (= un curso /
-- formación al estilo Skool). El admin no necesita estar suscrito.
CREATE TABLE IF NOT EXISTS mid_route_subscriptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_slug     TEXT NOT NULL,
  user_id         UUID NOT NULL REFERENCES infoproducto_users(id) ON DELETE CASCADE,
  route_id        UUID NOT NULL REFERENCES training_routes(id) ON DELETE CASCADE,
  subscribed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, route_id)
);

CREATE INDEX IF NOT EXISTS mid_route_subs_tenant_user_idx
  ON mid_route_subscriptions (tenant_slug, user_id);

CREATE INDEX IF NOT EXISTS mid_route_subs_route_idx
  ON mid_route_subscriptions (route_id);

COMMENT ON TABLE mid_route_subscriptions IS
  'Inscripciones de miembros a rutas/cursos. Permite filtrar "mis cursos" en /perfil y "Continuar curso" en /formacion.';
