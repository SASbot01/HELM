-- Agent OS — Ingesta de Drive: el calendario de guiones y la carpeta
-- "HELM Contenido" de cada perfil (api/_lib/drive-helm.js, cuenta helm-drive).
--
-- El calendario es el de siempre (helm_content_calendar, el de la antigua
-- sección Guiones). Se le añade el tipo de reel, que decide su carpeta, y la
-- carpeta de la pieza en Drive, que dice en qué fase está: Sin editar,
-- Editados o Publicados.

BEGIN;

ALTER TABLE public.helm_content_calendar
  ADD COLUMN IF NOT EXISTS tipo text
    CHECK (tipo IS NULL OR tipo IN ('viralidad', 'conversion', 'autoridad', 'venta')),
  ADD COLUMN IF NOT EXISTS drive_carpeta_id text;

-- Qué carpeta de "HELM Contenido" es de cada perfil. Dentro, la estructura fija:
-- Instagram / 0 · Entrada, 1 · Sin editar / <tipo>, 2 · Editados / <tipo>,
-- 3 · Publicados, Recursos.
CREATE TABLE IF NOT EXISTS public.agent_drive_perfiles (
  client_id      uuid PRIMARY KEY REFERENCES public.clients(id) ON DELETE CASCADE,
  carpeta_id     text NOT NULL,
  carpeta_nombre text NOT NULL DEFAULT '',
  activa         boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Cada vídeo que ha entrado por "0 · Entrada" y qué se hizo con él. Es lo que
-- evita procesarlo dos veces y lo que enseña el agente en pantalla.
CREATE TABLE IF NOT EXISTS public.agent_drive_videos (
  drive_id       text PRIMARY KEY,
  client_id      uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  nombre         text NOT NULL DEFAULT '',
  -- pendiente → transcrito → ordenado | sin_guion | error
  estado         text NOT NULL DEFAULT 'pendiente',
  transcripcion  text NOT NULL DEFAULT '',
  calendario_id  uuid REFERENCES public.helm_content_calendar(id) ON DELETE SET NULL,
  destino        text NOT NULL DEFAULT '',
  error          text NOT NULL DEFAULT '',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_drive_videos_client_idx ON public.agent_drive_videos (client_id, created_at DESC);

-- Como el resto del Agent OS (078): sin policy para anon, solo el servidor.
ALTER TABLE public.agent_drive_perfiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_drive_videos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agent_drive_perfiles_srv ON public.agent_drive_perfiles;
CREATE POLICY agent_drive_perfiles_srv ON public.agent_drive_perfiles TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS agent_drive_videos_srv ON public.agent_drive_videos;
CREATE POLICY agent_drive_videos_srv ON public.agent_drive_videos TO service_role USING (true) WITH CHECK (true);

COMMIT;
