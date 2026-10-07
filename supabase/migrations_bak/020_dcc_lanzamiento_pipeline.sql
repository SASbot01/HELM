-- 020_dcc_lanzamiento_pipeline.sql
-- Pipeline "Lanzamiento" para Detrás de Cámaras + campos custom del form
-- en los leads de pre-detrasdecamara.
--
-- Cliente: slug = 'detras-de-camara' (id 02c92489-e226-410b-bb6c-66a2ec3d41c0).
--
-- Stages del pipeline (flujo de lanzamiento típico):
--   leads       → entrada desde el form de detrasdecamara.org (base de datos)
--   contactado  → primer contacto (WhatsApp / email)
--   agendado    → llamada agendada
--   asistido    → asistió a la llamada
--   propuesta   → propuesta enviada
--   ganado      → cerrado
--   perdido     → no convierte
--   nurturing   → seguimiento largo plazo

-- ============================================================================
-- Crear / actualizar pipeline Lanzamiento para detras-de-camara
-- ============================================================================
do $$
declare
  v_client_id uuid;
begin
  select id into v_client_id from clients where slug = 'detras-de-camara' limit 1;
  if v_client_id is null then
    raise notice 'Cliente detras-de-camara no existe — saltando pipeline creation';
    return;
  end if;

  -- Upsert pipeline "Lanzamiento"
  if exists (select 1 from crm_pipelines where client_id = v_client_id and name = 'Lanzamiento') then
    update crm_pipelines
    set stages = '[
      {"key": "leads",      "label": "Leads",          "color": "#6366F1"},
      {"key": "contactado", "label": "Contactado",     "color": "#F59E0B"},
      {"key": "agendado",   "label": "Llamada Agendada","color": "#3B82F6"},
      {"key": "asistido",   "label": "Asistió",        "color": "#8B5CF6"},
      {"key": "propuesta",  "label": "Propuesta",      "color": "#EC4899"},
      {"key": "ganado",     "label": "Ganado",         "color": "#10B981"},
      {"key": "perdido",    "label": "Perdido",        "color": "#EF4444"},
      {"key": "nurturing",  "label": "Nurturing",      "color": "#94A3B8"}
    ]'::jsonb
    where client_id = v_client_id and name = 'Lanzamiento';
    raise notice 'Pipeline Lanzamiento actualizado';
  else
    insert into crm_pipelines (client_id, name, stages, is_default)
    values (
      v_client_id,
      'Lanzamiento',
      '[
        {"key": "leads",      "label": "Leads",          "color": "#6366F1"},
        {"key": "contactado", "label": "Contactado",     "color": "#F59E0B"},
        {"key": "agendado",   "label": "Llamada Agendada","color": "#3B82F6"},
        {"key": "asistido",   "label": "Asistió",        "color": "#8B5CF6"},
        {"key": "propuesta",  "label": "Propuesta",      "color": "#EC4899"},
        {"key": "ganado",     "label": "Ganado",         "color": "#10B981"},
        {"key": "perdido",    "label": "Perdido",        "color": "#EF4444"},
        {"key": "nurturing",  "label": "Nurturing",      "color": "#94A3B8"}
      ]'::jsonb,
      true
    );
    raise notice 'Pipeline Lanzamiento creado';
  end if;
end $$;

-- ============================================================================
-- Backfill: reasignar leads existentes de "Landing Pre-DCC" al pipeline Lanzamiento / stage=leads
-- ============================================================================
do $$
declare
  v_client_id uuid;
  v_pipeline_id uuid;
  v_count int;
begin
  select id into v_client_id from clients where slug = 'detras-de-camara' limit 1;
  if v_client_id is null then return; end if;
  select id into v_pipeline_id from crm_pipelines where client_id = v_client_id and name = 'Lanzamiento' limit 1;
  if v_pipeline_id is null then return; end if;

  update crm_contacts
  set pipeline_id = v_pipeline_id,
      stage_key = coalesce(stage_key, 'leads'),
      updated_at = now()
  where client_id = v_client_id
    and source in ('Landing Pre-DCC', 'detrasdecamara', 'pre-detrasdecamara')
    and pipeline_id is null;

  get diagnostics v_count = row_count;
  raise notice 'Leads migrados al pipeline Lanzamiento: %', v_count;
end $$;

-- ============================================================================
-- Comentarios de schema para documentar los campos custom del form
-- ============================================================================
-- crm_contacts.custom_fields (jsonb) para leads de pre-detrasdecamara contendrá:
--   {
--     "punto_actual":        "Estoy aprendiendo / empezando" | "Hago algunos trabajos puntuales" | ...,
--     "genera_ingresos":     "No, todavia no" | "Si, de forma puntual" | ...,
--     "objetivo_filmmaking": "Empezar desde cero" | "Conseguir mis primeros clientes" | ...,
--     "bloqueo":             "No se como empezar bien" | "No consigo clientes de forma constante" | ...,
--     "form":                "pre-detrasdecamara",
--     "landing_url":         "https://detrasdecamara.org/",
--     "submitted_at":        "2026-04-20T..."
--   }
