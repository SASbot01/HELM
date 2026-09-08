-- 050_dcc_opt_in_stage.sql
-- Añade etapa "Opt-in" al pipeline Lanzamiento de detras-de-camara.
-- Caso de uso: en /book/detras-de-camara/<host>, los leads que en el form
-- responden "Lo tengo 100% claro" se BLOQUEAN del booking y deben caer aquí.
-- Los que responden "Tengo dudas" siguen el flujo normal y caen en `agendado`
-- (Llamada Agendada) tras confirmar la reserva.

do $$
declare
  v_client_id   uuid;
  v_pipeline_id uuid;
begin
  select id into v_client_id from clients where slug = 'detras-de-camara' limit 1;
  if v_client_id is null then
    raise notice 'Cliente detras-de-camara no existe — saltando';
    return;
  end if;

  select id into v_pipeline_id
    from crm_pipelines
   where client_id = v_client_id and name = 'Lanzamiento'
   limit 1;
  if v_pipeline_id is null then
    raise notice 'Pipeline Lanzamiento no existe — corre 020_dcc_lanzamiento_pipeline.sql primero';
    return;
  end if;

  -- Insertamos opt_in justo después de leads (idx 1) si no existe ya.
  -- Reescribimos el array entero para mantener el orden estable.
  update crm_pipelines
     set stages = '[
       {"key": "leads",      "label": "Leads",            "color": "#6366F1"},
       {"key": "opt_in",     "label": "Opt-in",           "color": "#06B6D4"},
       {"key": "contactado", "label": "Contactado",       "color": "#F59E0B"},
       {"key": "agendado",   "label": "Llamada Agendada", "color": "#3B82F6"},
       {"key": "asistido",   "label": "Asistió",          "color": "#8B5CF6"},
       {"key": "propuesta",  "label": "Propuesta",        "color": "#EC4899"},
       {"key": "ganado",     "label": "Ganado",           "color": "#10B981"},
       {"key": "perdido",    "label": "Perdido",          "color": "#EF4444"},
       {"key": "nurturing",  "label": "Nurturing",        "color": "#94A3B8"}
     ]'::jsonb
   where id = v_pipeline_id;

  raise notice 'Etapa opt_in añadida a pipeline Lanzamiento (detras-de-camara)';
end $$;

-- Refresca el schema cache de PostgREST por si acaso
notify pgrst, 'reload schema';
