-- HELM — Las reservas del lanzamiento del 1 de octubre de Detrás de Cámara
-- entran al CRM del cliente.
--
-- detrasdecamara.org/pre-lanzamiento es la página del directo del 1 de octubre
-- (19:00, hora de España). Manda el lead al mismo endpoint que /valor y
-- /pagina2 — POST a /api/formularios — y ese endpoint solo acepta lo que ya
-- existe: un perfil activo y un formulario activo de ese perfil. Sin esta
-- migración, cada reserva se responde con un 404 y se pierde.
--
-- Las cinco preguntas son las mismas de /valor (q1, q3, q9, q11, q14) con los
-- mismos códigos: así la ficha del CRM se lee igual venga el lead del lead
-- magnet o del lanzamiento, y la puntuación sale de la misma tabla de pesos.
--
-- Idempotente: se puede aplicar más de una vez sin duplicar nada.

do $$
declare
  v_client   uuid;
  v_pipeline uuid;
  v_form     uuid;
  v_stages   jsonb := $stages$[
    {"key": "registrado",        "label": "Reservó plaza",     "color": "#F37C34"},
    {"key": "confirmado",        "label": "Confirmado",        "color": "#F59E0B"},
    {"key": "asistio",           "label": "Asistió al directo","color": "#3B82F6"},
    {"key": "no_asistio",        "label": "No asistió",        "color": "#94A3B8"},
    {"key": "llamada_agendada",  "label": "Llamada agendada",  "color": "#8B5CF6"},
    {"key": "cliente",           "label": "Cliente",           "color": "#10B981"},
    {"key": "perdido",           "label": "Perdido",           "color": "#EF4444"}
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
    raise notice '[HELM] No encuentro el perfil de Detrás de Cámara. El embudo y el formulario de /pre-lanzamiento NO se han creado; crea el perfil y vuelve a aplicar esta migración.';
    return;
  end if;

  -- ── Embudo propio del lanzamiento ────────────────────────────────────────
  -- Aparte del de /pagina2 a propósito: quien reserva un directo no está en el
  -- mismo punto que quien pide una llamada de ventas, y mezclarlos deja el
  -- embudo comercial lleno de gente que todavía no ha visto nada.
  select id into v_pipeline
    from crm_pipelines
   where client_id = v_client and name = 'Lanzamiento 1 de octubre'
   limit 1;

  if v_pipeline is null then
    insert into crm_pipelines (client_id, name, stages, is_default)
    values (v_client, 'Lanzamiento 1 de octubre', v_stages, false)
    returning id into v_pipeline;
  else
    -- Se refrescan las etapas, pero NO se toca is_default: si alguien lo marcó
    -- como embudo por defecto del perfil, esta migración no decide por él.
    update crm_pipelines set stages = v_stages where id = v_pipeline;
  end if;

  -- ── Formulario ───────────────────────────────────────────────────────────
  -- Los datos de contacto (nombre, email, teléfono, Instagram) NO van aquí:
  -- esos son columnas de la ficha del contacto, no respuestas del formulario.
  insert into helm_forms (client_id, slug, title, description, fields, active, pipeline_id, stage_key, booked_stage_key)
  values (
    v_client,
    'prelanzamiento',
    'Lanzamiento 1 de octubre — reserva de plaza',
    'Reservas del directo de lanzamiento (1 de octubre, 19:00 hora de España) desde detrasdecamara.org/pre-lanzamiento. Cinco preguntas de cualificación, las mismas que /valor.',
    $json$[
      {"key":"q1_dedicacion","label":"¿Qué es hoy el filmmaking para ti?","type":"select","required":true,
       "options":["Un hobby — grabo por afición","Un extra — tengo otro trabajo y grabo aparte","Mi trabajo — soy freelance a tiempo completo","Tengo productora, estudio o equipo"]},
      {"key":"q3_facturacion","label":"¿Qué facturaste el mes pasado solo con el filmmaking?","type":"select","required":true,
       "options":["0 €","Menos de 500 €","500 – 1.500 €","1.500 – 3.000 €","3.000 – 6.000 €","Más de 6.000 €"]},
      {"key":"q9_problema","label":"¿Cuál es tu mayor problema hoy?","type":"select","required":true,
       "options":["No consigo clientes suficientes","Cobro muy poco para lo que hago","No sé presupuestar ni defender el precio","Un mes bien y tres mal, no hay estabilidad","Estoy saturado de curro pero no me sale rentable","No sé cómo posicionarme ni a quién dirigirme"]},
      {"key":"q11_objetivo","label":"¿Cuánto quieres estar facturando dentro de 12 meses?","type":"select","required":true,
       "options":["Menos de 2.000 €/mes","2.000 – 3.000 €/mes","3.000 – 5.000 €/mes","5.000 – 10.000 €/mes","Más de 10.000 €/mes"]},
      {"key":"q14_capacidad","label":"Si vieras claro que es lo que necesitas, ¿podrías invertir en formarte estos meses?","type":"select","required":true,
       "options":["Sí, sin problema","Sí, haciendo un esfuerzo","Solo si hubiera facilidades de pago","Ahora mismo no, vengo solo por el directo"]}
    ]$json$::jsonb,
    true,
    v_pipeline,
    -- Todos entran igual: han reservado plaza. Quién asiste de verdad se marca
    -- después del directo, y eso no lo sabe el formulario.
    'registrado',
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

  raise notice '[HELM] /pre-lanzamiento listo para Detrás de Cámara (pipeline=%, form=%)', v_pipeline, v_form;
end $$;
