-- HELM — Los mensajes de contacto de herrerafilm.com entran al CRM de Aitor.
--
-- La web (herrerafilm.com, alojada en Hostinger) no tenía formulario: la
-- sección de contacto era el email, el teléfono y el Instagram escritos a
-- pelo. Todo lead llegaba a la bandeja de gmail y ahí se quedaba. Esta
-- migración crea lo que el formulario nuevo de la web necesita del lado de
-- HELM, porque api/formularios.js solo acepta lo que ya existe: un perfil
-- activo y un formulario activo de ese perfil. Sin esto, cada envío se
-- responde con un 404 y la pareja se pierde.
--
-- El formulario vive FUERA de HELM, como los de detrasdecamara.org: la landing
-- manda un POST a https://helm.s4sf.net/api/formularios con
-- {slug:'aitor-lopez', form:'contacto'} y el endpoint busca o crea el contacto,
-- guarda las respuestas pegadas a su ficha y lo anota en la actividad.
--
-- Las preguntas son las que pidió Aitor, en su orden: primero el proyecto
-- (qué buscan, cuántos son, si ya tienen fotógrafo, qué les importa, en qué
-- inversión se mueven y cómo de decididos están) y al final los datos y la
-- fecha. Ese orden no es casual: quien contesta siete preguntas sobre su boda
-- antes de dejar el teléfono llega mucho más cualificado que quien solo suelta
-- un email.
--
-- Lo que NO va aquí: el nombre, el email y el teléfono. Son columnas de la
-- ficha del contacto y los rellena el endpoint, no son respuestas.
--
-- La fecha de la boda va como texto y no como tipo 'date' a propósito: la web
-- ofrece un calendario y, al lado, la casilla "Aún no tenemos fecha cerrada",
-- que es la respuesta de media agenda. Un campo de fecha no puede guardar eso.
--
-- Idempotente: se puede aplicar más de una vez sin duplicar nada.

do $$
declare
  v_client   uuid;
  v_pipeline uuid;
  v_form     uuid;
  v_stages   jsonb := $stages$[
    {"key": "consulta",     "label": "Nueva consulta",     "color": "#C8A96A"},
    {"key": "contactado",   "label": "Contactado",         "color": "#F59E0B"},
    {"key": "presupuesto",  "label": "Presupuesto enviado","color": "#3B82F6"},
    {"key": "videollamada", "label": "Videollamada",       "color": "#8B5CF6"},
    {"key": "reservada",    "label": "Fecha reservada",    "color": "#10B981"},
    {"key": "cliente",      "label": "Boda entregada",     "color": "#059669"},
    {"key": "perdido",      "label": "Perdido",            "color": "#EF4444"}
  ]$stages$::jsonb;
begin
  select id into v_client
    from clients
   where lower(slug) in ('aitor-lopez', 'aitorlopez', 'herrerafilm', 'herrera-film')
      or name ilike '%aitor%l%pez%'
   order by (lower(slug) = 'aitor-lopez') desc
   limit 1;

  if v_client is null then
    raise notice '[HELM] No encuentro el perfil de Aitor López. El embudo y el formulario de herrerafilm.com NO se han creado; crea el perfil y vuelve a aplicar esta migración.';
    return;
  end if;

  -- ── Embudo de bodas ──────────────────────────────────────────────────────
  -- Propio, no el 'Pipeline' por defecto del perfil: una consulta de boda se
  -- trabaja por fecha reservada, no por las etapas genéricas de lead. Se deja
  -- is_default sin tocar — si alguien lo marca como embudo por defecto del
  -- perfil, esta migración no decide por él.
  select id into v_pipeline
    from crm_pipelines
   where client_id = v_client and name = 'Bodas'
   limit 1;

  if v_pipeline is null then
    insert into crm_pipelines (client_id, name, stages, is_default)
    values (v_client, 'Bodas', v_stages, false)
    returning id into v_pipeline;
  else
    update crm_pipelines set stages = v_stages where id = v_pipeline;
  end if;

  -- ── Formulario ───────────────────────────────────────────────────────────
  insert into helm_forms (client_id, slug, title, description, fields, active, pipeline_id, stage_key, booked_stage_key)
  values (
    v_client,
    'contacto',
    'Contacto — herrerafilm.com',
    'Consultas de boda desde la sección "Hablemos de vuestra historia" de herrerafilm.com, donde el formulario sustituyó a la tarjeta de email, teléfono e Instagram. Siete preguntas sobre la boda y, al final, los datos, la fecha y el sitio. Entra en el embudo de Bodas como consulta nueva.',
    $json$[
      {"key":"buscais","label":"¿Qué estáis buscando?","type":"multi","required":true,
       "options":["Película completa del día","Trailer emocional, un resumen corto","Sesión de pareja antes de la boda","Fotografía también","Vídeo con dron","Aún no lo tenemos claro"]},
      {"key":"invitados","label":"¿Cuántos invitados vais a ser aproximadamente?","type":"select","required":true,
       "options":["Menos de 50","Entre 50 y 100","Entre 100 y 150","Más de 150"]},
      {"key":"fotografo","label":"¿Ya tenéis fotógrafo?","type":"select","required":true,
       "options":["Sí","No","Estamos mirando los dos a la vez"]},
      {"key":"como_nos_conociste","label":"¿Cómo nos habéis conocido?","type":"select","required":true,
       "options":["Instagram","Google","Nos recomendó una pareja","Nos recomendó otro proveedor (fotógrafo, wedding planner...)","Otro"]},
      {"key":"importa","label":"¿Qué es lo que más os importa del vídeo?","type":"multi","required":true,
       "options":["Que se note la emoción real, no algo forzado","Que tenga un acabado cinematográfico","Poder revivirlo con la familia dentro de muchos años","Tener algo bonito que compartir","Que quede completo, sin que falte nada del día importante"]},
      {"key":"inversion","label":"¿En qué inversión os movéis?","type":"select","required":true,
       "options":["Hasta 1.000 €","Entre 1.000 y 2.000 €","Entre 2.000 y 3.000 €","Más de 3.000 €","Todavía no lo tenemos claro"]},
      {"key":"momento","label":"¿En qué momento estáis?","type":"select","required":true,
       "options":["Ya queremos cerrarlo, estamos decidiendo ya","Estamos comparando opciones","Solo estamos mirando por ahora"]},
      {"key":"mensaje","label":"¿Algo más que queráis contarnos?","type":"long","required":false},
      {"key":"fecha_boda","label":"Fecha de la boda","type":"text","required":true},
      {"key":"lugar","label":"¿Dónde vais a casaros? Ciudad o localización","type":"text","required":true}
    ]$json$::jsonb,
    true,
    v_pipeline,
    -- Todas las consultas entran igual. Que la fecha esté libre, que haya
    -- presupuesto o que se reserve se marca después, y nada de eso lo sabe el
    -- formulario en el momento del envío.
    'consulta',
    -- Esta web no reserva hora: no hay huecos de agenda que elegir.
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

  raise notice '[HELM] Formulario de contacto listo para Aitor López (pipeline=%, form=%)', v_pipeline, v_form;
end $$;
