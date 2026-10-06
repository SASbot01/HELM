-- 094 — Tres ediciones al día en el diario (mañana, mediodía y tarde).
--
-- Hasta ahora la columna `edicion` solo admitía 'manana' y 'tarde'. Se añade
-- 'mediodia' para la tercera pieza del día (la redacción corre a las 8:00,
-- 14:00 y 20:00 de Madrid; ver api/_lib/redaccion.js).

ALTER TABLE public.aip_articulos DROP CONSTRAINT IF EXISTS aip_articulos_edicion_check;
ALTER TABLE public.aip_articulos
  ADD CONSTRAINT aip_articulos_edicion_check CHECK (edicion IN ('manana', 'mediodia', 'tarde'));
