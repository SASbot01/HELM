-- HELM — Los leads de la clase de lanzamiento de Detrás de Cámara entran al
-- CRM del cliente.
--
-- detrasdecamara.org/lanzamiento es una VSL cerrada: el vídeo de la clase no
-- se ve hasta que el lead responde el formulario. Quien responde desbloquea el
-- vídeo, y quien lo ve entero pasa al grupo de WhatsApp del directo del 1 de
-- octubre (19:00, hora de España). El formulario manda el lead al mismo
-- endpoint que /valor y /pagina2 — POST a /api/formularios — y ese endpoint
-- solo acepta lo que ya existe: un perfil activo y un
-- formulario activo de ese perfil. Sin esta migración, cada envío se responde
-- con un 404, el vídeo no se desbloquea y el lead se pierde.
--
-- Esta landing sustituye a /pre-lanzamiento, que ahora redirige aquí. El
-- formulario 'prelanzamiento' y su embudo se quedan donde están: siguen
-- colgando de ellos los leads que ya entraron por la página vieja.
--
-- Las cinco primeras preguntas son las mismas de /valor y de aquel formulario
-- (q1, q3, q9, q11, q14) con los mismos códigos: así la ficha del CRM se lee
-- igual venga el lead de donde venga, y la puntuación sale de la misma tabla
-- de pesos. La sexta (q16) es propia de esta landing: si va a estar en el
-- directo, que es lo que decide a quién hay que perseguir para el grupo de
-- WhatsApp y a quién mandarle la grabación.
--
-- Idempotente: se puede aplicar más de una vez sin duplicar nada.

do $$
declare
  v_client   uuid;
  v_pipeline uuid;
  v_form     uuid;
  v_stages   jsonb := $stages$[
    {"key": "registrado",        "label": "Registrado",        "color": "#F37C34"},
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
  -- búsqueda que en helm_formulario_prelanzamiento_dcc.sql.
  select id into v_client
    from clients
   where lower(slug) in ('detras-de-camra', 'detrasdecamara', 'detrasdecamaras', 'detras-de-camara', 'dcc')
      or name ilike '%detr%s de c%mara%'
   order by (lower(slug) = 'detras-de-camra') desc
   limit 1;

  if v_client is null then
    raise notice '[HELM] No encuentro el perfil de Detrás de Cámara. El embudo y el formulario de /lanzamiento NO se han creado; crea el perfil y vuelve a aplicar esta migración.';
    return;
  end if;

  -- ── Embudo propio de la VSL ──────────────────────────────────────────────
  -- Aparte del embudo viejo ('Lanzamiento 1 de octubre') a propósito, aunque el
  -- recorrido del lead sea el mismo: allí el lead reservaba plaza en frío, aquí
  -- pide ver la clase, y mezclarlos borraría el corte entre las dos versiones
  -- de la página. Aquel embudo queda como está, con sus leads dentro: esta
  -- migración no lo toca.
  select id into v_pipeline
    from crm_pipelines
   where client_id = v_client and name = 'Formulario Lanzamiento'
   limit 1;

  if v_pipeline is null then
    insert into crm_pipelines (client_id, name, stages, is_default)
    values (v_client, 'Formulario Lanzamiento', v_stages, false)
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
    'lanzamiento',
    'Lanzamiento 1 de octubre — clase (VSL)',
    'Leads de detrasdecamara.org/lanzamiento: la clase en vídeo está cerrada tras el formulario. Quien responde desbloquea el vídeo, y quien lo ve entero pasa al grupo de WhatsApp del directo del 1 de octubre (19:00 hora de España). Las cinco preguntas de /valor más una sexta sobre si va a estar en el directo.',
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
       "options":["Sí, sin problema","Sí, haciendo un esfuerzo","Solo si hubiera facilidades de pago","Ahora mismo no, vengo solo por el directo"]},
      {"key":"q16_evento","label":"¿Vas a estar en el directo del 1 de octubre a las 19:00?","type":"select","required":true,
       "options":["Sí, ahí estaré en directo","Voy a intentarlo, puede que llegue tarde","No puedo en directo, quiero la grabación"]}
    ]$json$::jsonb,
    true,
    v_pipeline,
    -- Todos entran igual: han pedido ver la clase. Quién ve el vídeo entero,
    -- quién entra al grupo y quién asiste de verdad se marca después, y nada
    -- de eso lo sabe el formulario en el momento del envío.
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

  raise notice '[HELM] /lanzamiento listo para Detrás de Cámara (pipeline=%, form=%)', v_pipeline, v_form;
end $$;
