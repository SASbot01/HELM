-- HELM — Los leads de la landing VSL de Elena Fontecha entran a su CRM.
--
-- La web vive DENTRO de este repo (ruta React /elenafontecha/valor), no en un
-- sitio aparte, pero manda igual un POST a https://helm.s4sf.net/api/formularios
-- con {slug:'elenafontecha', form:'valor', nombre, email, telefono, respuestas,
-- meta}. El endpoint busca el formulario por su slug 'valor' en helm_forms,
-- lee su pipeline_id y mete el contacto en el CRM de Elena, en la etapa de
-- entrada. Sin esta fila, cada envío se responde con un 404.
--
-- Destino: pipeline "Captación (leads)" (is_default) de Elena, etapa de entrada
-- "lead" ("Lead (autodiagnóstico)"). Las dos ya existen en su CRM; esta
-- migración NO las crea ni las toca, solo apunta el formulario a ellas.
--
-- Las claves de las preguntas (revisar, momento, dimension, responsabilidad,
-- motivo) son las mismas que la página declara en src/pages/ElenaValor.jsx
-- (PREGUNTAS). El endpoint descarta toda clave que el formulario no declare
-- aquí: renombrar una en la web sin tocarla aquí la haría desaparecer de la
-- ficha del CRM. Nombre, correo y teléfono NO van aquí: son columnas de la
-- ficha del contacto (name, email, phone).
--
-- Idempotente: se puede aplicar más de una vez sin duplicar nada.

do $$
declare
  v_client   uuid;
  v_pipeline uuid;
  v_form     uuid;
begin
  select id into v_client
    from clients
   where id = '1b17a1dc-e34a-4aaf-b55e-892e970550bc'
      or lower(slug) = 'elenafontecha'
   limit 1;

  if v_client is null then
    raise notice '[HELM] No encuentro el perfil de Elena Fontecha. El formulario NO se ha creado.';
    return;
  end if;

  -- Pipeline de captación (ya existe). Por nombre; si no, el por defecto.
  select id into v_pipeline
    from crm_pipelines
   where client_id = v_client and name = 'Captación (leads)'
   limit 1;
  if v_pipeline is null then
    select id into v_pipeline
      from crm_pipelines
     where client_id = v_client and is_default = true
     limit 1;
  end if;

  insert into helm_forms (client_id, slug, title, description, fields, active, pipeline_id, stage_key, booked_stage_key)
  values (
    v_client,
    'valor',
    'Autodiagnóstico de rumbo',
    'Landing VSL de Elena (ruta /elenafontecha/valor): un vídeo arriba con la pregunta central y debajo un autodiagnóstico de 5 preguntas. Capta el lead, lo mete en "Captación (leads)" en la etapa "Lead (autodiagnóstico)" y le promete el siguiente paso por correo.',
    $json$[
      {"key":"revisar","label":"¿Qué quieres revisar ahora?","type":"select","required":true,
       "options":["Mi vida y mi rumbo","Mi manera de dirigir y de liderar","Las dos cosas, a la vez"]},
      {"key":"momento","label":"¿En qué punto te reconoces?","type":"select","required":true,
       "options":["Quiero mirar con verdad dónde estoy","Sé lo que quiero, pero no cómo darle un lugar real","Tengo una decisión delante y necesito tomarla","Quiero revisar decisiones que ya tomé y ver si siguen teniendo sentido"]},
      {"key":"dimension","label":"¿Qué parte sientes más desatendida?","type":"select","required":true,
       "options":["Lo físico (energía, cuerpo, descanso)","Lo mental (claridad, foco, criterio)","Lo emocional (cómo vivo lo que me pasa)","Lo espiritual (sentido, valores, lo que importa)"]},
      {"key":"responsabilidad","label":"¿Desde dónde ejerces tu liderazgo?","type":"select","required":true,
       "options":["Dirección general o consejo","Dirección de un área o un equipo","Un proyecto o un negocio propio","Otra situación"]},
      {"key":"motivo","label":"En una frase, ¿qué te ha traído hoy aquí?","type":"textarea","required":false}
    ]$json$::jsonb,
    true,
    v_pipeline,
    'lead',
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

  raise notice '[HELM] Formulario "Autodiagnóstico de rumbo" listo para Elena Fontecha (pipeline=%, form=%)', v_pipeline, v_form;
end $$;
