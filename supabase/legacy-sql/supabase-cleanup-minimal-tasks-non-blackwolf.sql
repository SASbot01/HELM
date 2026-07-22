-- CLEANUP: borra el roadmap "MINIMAL Launch" y todas sus tareas/objetivos
-- de cualquier cliente que NO sea black-wolf.
-- Ejecutar en Supabase SQL Editor.

DO $$
DECLARE
  v_bw_client uuid;
  v_deleted_tasks int := 0;
  v_deleted_objs int := 0;
  v_deleted_roadmaps int := 0;
BEGIN
  SELECT id INTO v_bw_client FROM clients WHERE slug = 'black-wolf' LIMIT 1;
  IF v_bw_client IS NULL THEN
    RAISE EXCEPTION 'Black Wolf client not found (slug=black-wolf)';
  END IF;

  -- 1) Borrar tareas del roadmap MINIMAL Launch en clientes != black-wolf
  WITH bad_roadmaps AS (
    SELECT id FROM roadmaps
    WHERE title = 'MINIMAL Launch — Marketing Strategy Implementation'
      AND client_id <> v_bw_client
  )
  DELETE FROM crm_tasks
  WHERE roadmap_id IN (SELECT id FROM bad_roadmaps);
  GET DIAGNOSTICS v_deleted_tasks = ROW_COUNT;

  -- 2) Por si hay crm_tasks sueltas (sin roadmap) con títulos de nuestro checklist
  --    en clientes que no son black-wolf. Matcheamos por prefijo "N.N — " del doc 11.
  DELETE FROM crm_tasks
  WHERE client_id <> v_bw_client
    AND (
      title LIKE '1.%— %' OR
      title LIKE '2.%— %' OR
      title LIKE '3.%— %' OR
      title LIKE '4.%— %' OR
      title LIKE '5.%— %' OR
      title LIKE '6.%— %' OR
      title LIKE '7.%— %' OR
      title LIKE '8.%— %' OR
      title LIKE '9.%— %'
    )
    AND description LIKE '%doc%';
  GET DIAGNOSTICS v_deleted_tasks = v_deleted_tasks + ROW_COUNT;

  -- 3) Borrar objetivos del roadmap en clientes != black-wolf
  DELETE FROM roadmap_objectives
  WHERE roadmap_id IN (
    SELECT id FROM roadmaps
    WHERE title = 'MINIMAL Launch — Marketing Strategy Implementation'
      AND client_id <> v_bw_client
  );
  GET DIAGNOSTICS v_deleted_objs = ROW_COUNT;

  -- 4) Borrar los roadmaps huérfanos
  DELETE FROM roadmaps
  WHERE title = 'MINIMAL Launch — Marketing Strategy Implementation'
    AND client_id <> v_bw_client;
  GET DIAGNOSTICS v_deleted_roadmaps = ROW_COUNT;

  RAISE NOTICE 'Cleanup: % tareas, % objetivos, % roadmaps eliminados de clientes != black-wolf',
    v_deleted_tasks, v_deleted_objs, v_deleted_roadmaps;
END $$;

-- Verificación: debería devolver solo el roadmap de black-wolf
SELECT r.id, r.client_id, c.slug, r.title, r.month,
       (SELECT count(*) FROM crm_tasks t WHERE t.roadmap_id = r.id) AS tasks
FROM roadmaps r
JOIN clients c ON c.id = r.client_id
WHERE r.title = 'MINIMAL Launch — Marketing Strategy Implementation';
