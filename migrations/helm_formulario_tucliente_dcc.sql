-- HELM — La herramienta "Define tu cliente" de Detrás de Cámara entra al CRM.
--
-- detrasdecamara.org/tucliente es un cuestionario ramificado en dos fases: la
-- primera devuelve nicho, cliente ideal, dolores y objeciones; la segunda, un
-- plan de funnel. Entre medias pide nombre, email y teléfono — opcional, la
-- ficha se enseña igual — y eso es lo que llega aquí.
--
-- Manda el lead al mismo endpoint que /valor, /pagina2 y /pre-lanzamiento:
-- POST /api/formularios, que solo acepta lo que ya existe (un perfil activo y
-- un formulario activo de ese perfil). Sin esta migración cada envío se
-- responde con un 404 y se pierde en silencio, porque la página no avisa al
-- usuario a propósito: la herramienta no puede romperse por el CRM.
--
-- Ojo: /pre-detrasdecamara apunta a central.blackwolfsec.io con formId
-- 'pre-dcc', que hoy responde 410 "Form deprecated", y su backup de Supabase
-- ya no resuelve en DNS. Ese camino está muerto; este no.
--
-- `fields` va vacío a propósito. Los formularios de HELM declaran sus campos
-- cuando la propia HELM los pinta en /f/<id>; aquí el cuestionario vive en la
-- web del cliente y son 25 preguntas ramificadas que cambian según lo que se
-- responde. El endpoint guarda `respuestas` tal cual llegan —la pregunta
-- entera como clave y la opción elegida como valor—, así que la ficha del
-- contacto se lee igual sin duplicar aquí un esquema que cambiaría a cada
-- retoque de la landing.
--
-- Idempotente: se puede aplicar más de una vez sin duplicar nada.

do $$
declare
  v_client   uuid;
  v_pipeline uuid;
  v_form     uuid;
  v_stages   jsonb := $stages$[
    {"key": "nuevo",             "label": "Nuevo",             "color": "#F37C34"},
    {"key": "calificado",        "label": "Calificado",        "color": "#F59E0B"},
    {"key": "agendado",          "label": "Agendado",          "color": "#3B82F6"},
    {"key": "propuesta_enviada", "label": "Propuesta enviada", "color": "#8B5CF6"},
    {"key": "cliente",           "label": "Cliente",           "color": "#10B981"},
    {"key": "ahora_no",          "label": "Ahora no",          "color": "#94A3B8"}
  ]$stages$::jsonb;
begin
  -- El slug real es 'detras-de-camra' (helm.s4sf.net/detras-de-camra). Los
  -- demás van por si el perfil se recrea algún día con otra grafía — misma
  -- búsqueda que en helm_formulario_pagina2_dcc.sql.
  select id into v_client
    from clients
   where lower(slug) in ('detras-de-camra', 'detrasdecamara', 'detrasdecamaras', 'detras-de-camara', 'dcc')
      or name ilike '%detr%s de c%mara%'
   order by (lower(slug) = 'detras-de-camra') desc
   limit 1;

  if v_client is null then
    raise notice '[HELM] No encuentro el perfil de Detrás de Cámara. El embudo y el formulario de /tucliente NO se han creado; crea el perfil y vuelve a aplicar esta migración.';
    return;
  end if;

  -- ── Embudo ───────────────────────────────────────────────────────────────
  -- Son exactamente los seis estados que la propia página le dice al usuario
  -- que monte en su CRM. Si aquí pusiéramos otros, la herramienta estaría
  -- enseñando un embudo distinto del que existe.
  select id into v_pipeline
    from crm_pipelines
   where client_id = v_client and name = 'Define tu cliente'
   limit 1;

  if v_pipeline is null then
    insert into crm_pipelines (client_id, name, stages, is_default)
    values (v_client, 'Define tu cliente', v_stages, false)
    returning id into v_pipeline;
  else
    -- Se refrescan las etapas, pero NO se toca is_default: si alguien lo marcó
    -- como embudo por defecto del perfil, esta migración no decide por él.
    update crm_pipelines set stages = v_stages where id = v_pipeline;
  end if;

  -- ── Formulario ───────────────────────────────────────────────────────────
  insert into helm_forms (client_id, slug, title, description, fields, active, pipeline_id, stage_key, booked_stage_key)
  values (
    v_client,
    'tucliente',
    'Define tu cliente — herramienta',
    'Respuestas de la herramienta de detrasdecamara.org/tucliente. Fase 1: nicho, cliente ideal, dolores y objeciones. Fase 2: plan de funnel. El paso de contacto es opcional, así que solo llegan aquí los que dejaron email o teléfono.',
    '[]'::jsonb,
    true,
    v_pipeline,
    -- Todos entran igual, en "Nuevo": han usado una herramienta gratuita, no
    -- han pedido nada. Calificarlos es trabajo del comercial, no del formulario.
    'nuevo',
    null
  )
  on conflict (client_id, slug) do update
     set title            = excluded.title,
         description      = excluded.description,
         fields           = excluded.fields,
         active           = true,
         pipeline_id      = excluded.pipeline_id,
         stage_key        = excluded.stage_key,
         booked_stage_key = excluded.booked_stage_key,
         updated_at       = now()
  returning id into v_form;

  raise notice '[HELM] /tucliente listo para Detrás de Cámara (pipeline=%, form=%)', v_pipeline, v_form;
end $$;
