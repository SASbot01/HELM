-- 083_mid_about_host_info.sql
-- Sidebar de "host info" en /mid/<slug>/about — redesign estilo Skool.
--
-- Hasta ahora la About era un stack vertical de bloques sin firma del autor.
-- Esta migration añade los campos del "presentador" (la persona que imparte
-- la formación) que renderizan en una columna lateral sticky a la derecha:
-- avatar, nombre, rol, bio breve y enlaces sociales (Instagram, YouTube,
-- TikTok, web).
--
-- Todos los campos son opcionales y editables por el admin del tenant desde
-- la misma página /about (botón "Editar info").

ALTER TABLE infoproducto_config
  ADD COLUMN IF NOT EXISTS host_name        TEXT,
  ADD COLUMN IF NOT EXISTS host_role        TEXT,
  ADD COLUMN IF NOT EXISTS host_avatar_url  TEXT,
  ADD COLUMN IF NOT EXISTS host_bio         TEXT,
  ADD COLUMN IF NOT EXISTS host_instagram   TEXT,
  ADD COLUMN IF NOT EXISTS host_youtube     TEXT,
  ADD COLUMN IF NOT EXISTS host_tiktok      TEXT,
  ADD COLUMN IF NOT EXISTS host_website     TEXT;

COMMENT ON COLUMN infoproducto_config.host_name IS
  'Nombre del presentador/host que aparece en la sidebar de /mid/<slug>/about.';
COMMENT ON COLUMN infoproducto_config.host_instagram IS
  'Handle de Instagram sin @ (ej: hugodominguez) o URL completa. El frontend normaliza ambos formatos.';
