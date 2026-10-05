-- 091 — Noticias: las tres noticias del día de IA y ciberseguridad.
--
-- Cada mañana, antes de las 6:00 de Madrid, el worker lee las fuentes
-- (api/_lib/noticias.js), elige las tres que más le importan al perfil y las
-- deja aquí. La sección Noticias del panel las enseña, con las de días
-- anteriores debajo.
--
-- Se activa por perfil encendiendo la sección «Noticias» en Secciones
-- (helm_permissions.sections.noticias = true): sin eso el worker no hace nada
-- para ese perfil.
--
-- Solo la clave de servicio: se lee por api/noticias.js.

BEGIN;

CREATE TABLE IF NOT EXISTS public.helm_noticias (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  fecha        date NOT NULL,                       -- el día de Madrid en que se dejan
  puesto       smallint NOT NULL CHECK (puesto BETWEEN 1 AND 3),
  tema         text NOT NULL CHECK (tema IN ('ia', 'ciberseguridad')),
  titular      text NOT NULL,
  resumen      text NOT NULL DEFAULT '',
  por_que      text NOT NULL DEFAULT '',            -- por qué importa a este perfil
  url          text NOT NULL,
  fuente       text NOT NULL DEFAULT '',
  publicado_en timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, fecha, puesto)
);
CREATE INDEX IF NOT EXISTS helm_noticias_idx ON public.helm_noticias (client_id, fecha DESC, puesto);

ALTER TABLE public.helm_noticias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS helm_noticias_srv ON public.helm_noticias;
CREATE POLICY helm_noticias_srv ON public.helm_noticias TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON public.helm_noticias FROM anon, authenticated;

COMMIT;
