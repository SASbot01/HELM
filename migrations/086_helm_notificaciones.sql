-- 086 — Notificaciones: lo que HELM tiene que contarle al dueño de un perfil.
--
-- Hasta ahora las cosas pasaban en silencio: un lead reservaba su llamada y el
-- evento aparecía en el calendario sin avisar a nadie; Google dejaba de
-- contestar y el embudo se quedaba sin huecos un mes entero sin que constara
-- en ningún sitio. Aquí cae todo eso, con su nivel:
--
--   info    algo bueno o neutro (una reserva, un lead nuevo, un estudio listo)
--   aviso   algo que conviene mirar (la agenda no tiene huecos libres)
--   error   algo roto que cuesta dinero (el embudo no ofrece huecos, una
--           reserva no llegó al calendario)
--
-- `clave` evita repetir el mismo aviso: un fallo que dura horas genera una
-- sola notificación por ventana, no una por visita a la landing.
--
-- Solo la clave de servicio: se leen y se marcan por api/notificaciones.js,
-- que comprueba el acceso al perfil.

BEGIN;

CREATE TABLE IF NOT EXISTS public.helm_notificaciones (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  tipo        text NOT NULL,
  nivel       text NOT NULL DEFAULT 'info' CHECK (nivel IN ('info', 'aviso', 'error')),
  titulo      text NOT NULL,
  cuerpo      text NOT NULL DEFAULT '',
  -- A dónde lleva al pulsarla: una sección del panel ('llamadas', 'crm'…) o
  -- una URL completa.
  destino     text,
  clave       text,
  meta        jsonb NOT NULL DEFAULT '{}'::jsonb,
  leida_at    timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS helm_notificaciones_perfil_idx
  ON public.helm_notificaciones (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS helm_notificaciones_clave_idx
  ON public.helm_notificaciones (client_id, clave, created_at DESC) WHERE clave IS NOT NULL;

ALTER TABLE public.helm_notificaciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS helm_notificaciones_srv ON public.helm_notificaciones;
CREATE POLICY helm_notificaciones_srv ON public.helm_notificaciones TO service_role USING (true) WITH CHECK (true);

COMMIT;
