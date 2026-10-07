-- 096 — Radar: el rastreo de la red para ver tecnología e ideas nuevas.
--
-- Un agente lee lo que se mueve en la red (Hacker News, arXiv, Reddit, Product
-- Hunt y medios de IA), elige lo que de verdad es NUEVO o emergente y lo
-- convierte en ideas concretas para investigar/probar. Es una sección privada:
-- solo el perfil silvestre la ve (lo gatea el panel por slug).
--
-- Solo la clave de servicio. Se lee por api/radar.js.

BEGIN;

CREATE TABLE IF NOT EXISTS public.helm_radar (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  fecha         date NOT NULL,
  tema          text NOT NULL DEFAULT 'tendencia',
  titulo        text NOT NULL,
  que_es        text NOT NULL DEFAULT '',
  por_que       text NOT NULL DEFAULT '',        -- por qué importa / qué cambia
  idea          text NOT NULL DEFAULT '',         -- qué investigar, probar o contar
  url           text NOT NULL,
  fuente        text NOT NULL DEFAULT '',
  senal         text NOT NULL DEFAULT '',         -- la señal social (puntos, comentarios)
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS helm_radar_idx ON public.helm_radar (client_id, created_at DESC);

ALTER TABLE public.helm_radar ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS helm_radar_srv ON public.helm_radar;
CREATE POLICY helm_radar_srv ON public.helm_radar TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON public.helm_radar FROM anon, authenticated;

COMMIT;
