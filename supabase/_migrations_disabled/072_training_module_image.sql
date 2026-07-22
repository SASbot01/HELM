-- 072: training_modules.image_url
--
-- Banner de portada por módulo. Permite que cada módulo tenga su imagen
-- 16:9 visible en FormationDetail, no solo el título. NULL ⇒ banner se
-- omite (la card cae a un fondo plano).

ALTER TABLE training_modules
  ADD COLUMN IF NOT EXISTS image_url TEXT;

COMMENT ON COLUMN training_modules.image_url IS
  'URL de la imagen de portada del módulo (16:9 recomendado). NULL = sin banner.';
