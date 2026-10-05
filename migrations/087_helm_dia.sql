-- 087 — Mi día: los rituales diarios con la IA.
--
-- Cada vez que alguien usa uno (priorizar la mañana, preparar una reunión,
-- resumir un correo, poner a prueba una idea, el repaso de mediodía, el cierre
-- de la noche, la revisión semanal) se guarda lo que contó y lo que la IA le
-- devolvió. No es un historial de adorno: el repaso de mediodía lee el plan de
-- la mañana, el cierre lee el día entero y la revisión semanal relee la semana
-- para decir en qué se está repitiendo la persona.
--
-- Solo la clave de servicio: se lee y se escribe por api/dia.js.

BEGIN;

CREATE TABLE IF NOT EXISTS public.helm_dia (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  tipo        text NOT NULL CHECK (tipo IN ('manana', 'reunion', 'correo', 'idea', 'mediodia', 'noche', 'semana')),
  fecha       date NOT NULL,
  -- Quién lo hizo (email de la sesión): cada persona ve y repasa lo suyo.
  autor       text NOT NULL DEFAULT '',
  entrada     text NOT NULL DEFAULT '',
  salida      text NOT NULL DEFAULT '',
  meta        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS helm_dia_idx ON public.helm_dia (client_id, autor, fecha DESC, created_at DESC);

ALTER TABLE public.helm_dia ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS helm_dia_srv ON public.helm_dia;
CREATE POLICY helm_dia_srv ON public.helm_dia TO service_role USING (true) WITH CHECK (true);

COMMIT;
