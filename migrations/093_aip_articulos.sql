-- 093 — El diario de AI para todo: dos artículos al día, investigados.
--
-- Los escribe la redacción automática (api/_lib/redaccion.js) en dos
-- ediciones, mañana y tarde: elige la historia del día en IA, tecnología o
-- ciberseguridad, la investiga leyendo las fuentes, la redacta y la pasa por
-- un verificador. Lo que no pasa la verificación se guarda como 'retenido' y
-- no se publica.
--
-- Se lee en público por api/aiparatodo.js (solo lo publicado y solo los campos
-- que se enseñan). La tabla, como helm_noticias, es solo de la clave de
-- servicio.

BEGIN;

CREATE TABLE IF NOT EXISTS public.aip_articulos (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  fecha            date NOT NULL,                      -- el día de Madrid
  edicion          text NOT NULL CHECK (edicion IN ('manana', 'tarde')),
  slug             text NOT NULL UNIQUE,
  tema             text NOT NULL CHECK (tema IN ('ia', 'tecnologia', 'ciberseguridad')),
  titular          text NOT NULL,
  subtitulo        text NOT NULL DEFAULT '',
  cuerpo           jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{tipo, texto, autor, items}]
  claves           jsonb NOT NULL DEFAULT '[]'::jsonb,
  que_significa    text NOT NULL DEFAULT '',
  fuentes          jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{nombre, url, titulo}]
  imagen_url       text,                                -- la de la noticia original (og:image)
  imagen_alt       text NOT NULL DEFAULT '',
  imagen_credito   text NOT NULL DEFAULT '',
  imagen_origen    text,                                -- la página de donde sale la imagen
  lectura_min      smallint NOT NULL DEFAULT 4,
  estado           text NOT NULL DEFAULT 'publicado' CHECK (estado IN ('publicado', 'retenido')),
  verificacion     jsonb NOT NULL DEFAULT '{}'::jsonb,  -- lo que dijo el verificador
  modelo           text NOT NULL DEFAULT '',
  tokens           integer NOT NULL DEFAULT 0,
  publicado_en     timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, fecha, edicion)
);
CREATE INDEX IF NOT EXISTS aip_articulos_idx ON public.aip_articulos (client_id, estado, publicado_en DESC);

ALTER TABLE public.aip_articulos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aip_articulos_srv ON public.aip_articulos;
CREATE POLICY aip_articulos_srv ON public.aip_articulos TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON public.aip_articulos FROM anon, authenticated;

COMMIT;
