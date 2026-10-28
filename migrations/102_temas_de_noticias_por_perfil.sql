-- 102 — Los temas de las noticias y del diario, por perfil.
--
-- Hasta ahora la base limitaba el tema: helm_noticias solo aceptaba 'ia' y
-- 'ciberseguridad' (091) y aip_articulos solo 'ia', 'tecnologia' y
-- 'ciberseguridad' (093). Con las noticias y el diario por perfil
-- (api/_lib/noticias-perfiles.js), cada perfil tiene sus temas —Detrás de
-- Cámara: sony, equipo, filmmaking, postproduccion— y los valida el código,
-- con la lista de cada uno. Aquí solo queda un control de forma: una clave
-- corta en minúsculas.
--
-- Se busca la restricción por la columna y no por su nombre (el nombre lo puso
-- Postgres solo). Idempotente: si se vuelve a pasar, quita la de forma y la
-- vuelve a poner.
--
-- No toca datos: todos los temas que hay cumplen la forma nueva.

BEGIN;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conrelid::regclass AS tabla, c.conname
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.contype = 'c'
      AND a.attname = 'tema'
      AND c.conrelid IN ('public.helm_noticias'::regclass, 'public.aip_articulos'::regclass)
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tabla, r.conname);
    RAISE NOTICE 'Quitada la restricción % de %', r.conname, r.tabla;
  END LOOP;
END $$;

ALTER TABLE public.helm_noticias
  ADD CONSTRAINT helm_noticias_tema_forma CHECK (tema ~ '^[a-z0-9_-]{1,40}$');
ALTER TABLE public.aip_articulos
  ADD CONSTRAINT aip_articulos_tema_forma CHECK (tema ~ '^[a-z0-9_-]{1,40}$');

COMMIT;
