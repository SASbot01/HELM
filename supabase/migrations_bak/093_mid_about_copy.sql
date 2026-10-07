-- 093_mid_about_copy.sql
-- Hace editables los textos fijos de /mid/<slug>/about que hasta ahora
-- estaban hardcoded en MidAbout.jsx:
--   • Encabezado: h1 "About" + subtítulo
--   • CTA visitantes (sin sesión): título, subtítulo y label del botón
--
-- Todos opcionales: si están NULL el frontend cae al texto por defecto.

ALTER TABLE infoproducto_config
  ADD COLUMN IF NOT EXISTS about_page_title     TEXT,
  ADD COLUMN IF NOT EXISTS about_page_subtitle  TEXT,
  ADD COLUMN IF NOT EXISTS about_cta_title      TEXT,
  ADD COLUMN IF NOT EXISTS about_cta_subtitle   TEXT,
  ADD COLUMN IF NOT EXISTS about_cta_button     TEXT;

COMMENT ON COLUMN infoproducto_config.about_page_title IS
  'H1 de /mid/<slug>/about. NULL = "About" por defecto.';
COMMENT ON COLUMN infoproducto_config.about_cta_button IS
  'Label del botón del banner de registro al final de /about. NULL = "Crear cuenta gratis".';
