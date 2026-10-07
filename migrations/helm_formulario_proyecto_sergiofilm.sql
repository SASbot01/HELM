-- HELM — Los leads del cuestionario de Sergio Amorós entran a su CRM.
--
-- La web (repo SASbot01/sergiofilm, pendiente de subir a Vercel y de dominio
-- propio) tiene un cuestionario de cualificación de 10 preguntas que termina
-- en un resumen y, si el lead encaja, en el Calendly de Sergio. Hasta ahora no
-- enviaba nada a ninguna parte: su configuración llevaba un
-- '[ENDPOINT DE HELM]' sin rellenar y cada envío se quedaba en el
-- localStorage del navegador de quien lo rellenaba. Es decir: se perdía.
--
-- El formulario vive FUERA de HELM, como los de detrasdecamara.org y
-- herrerafilm.com: la web manda un POST a
-- https://helm.s4sf.net/api/formularios con {slug:'sergio-amoros-molina',
-- form:'proyecto'} y el endpoint busca o crea el contacto, guarda las
-- respuestas pegadas a su ficha y lo anota en su actividad. Sin esta
-- migración, cada envío se responde con un 404.
--
-- Las claves de las preguntas son las mismas que el cuestionario ya usa por
-- dentro (para, fecha, personas…): así lo que se ve en la ficha del CRM es
-- exactamente lo que la persona eligió, y renombrar una en la web sin tocarla
-- aquí la haría desaparecer — el endpoint descarta toda clave que el
-- formulario no declare.
--
-- Nota sobre el nombre y el negocio: NO van aquí. El nombre y el negocio son
-- columnas de la ficha del contacto (name, company), y el contacto es un solo
-- campo de la web ("WhatsApp o email") que la propia página parte en email o
-- teléfono antes de enviarlo.
--
-- Idempotente: se puede aplicar más de una vez sin duplicar nada.

do $$
declare
  v_client   uuid;
  v_pipeline uuid;
  v_form     uuid;
  v_stages   jsonb := $stages$[
    {"key": "nueva",      "label": "Nueva solicitud",   "color": "#D9723C"},
    {"key": "llamada",    "label": "Llamada agendada",  "color": "#8B5CF6"},
    {"key": "propuesta",  "label": "Propuesta enviada", "color": "#3B82F6"},
    {"key": "produccion", "label": "En producción",     "color": "#F59E0B"},
    {"key": "cliente",    "label": "Entregado",         "color": "#10B981"},
    {"key": "ahora_no",   "label": "Ahora no",          "color": "#94A3B8"},
    {"key": "perdido",    "label": "Perdido",           "color": "#EF4444"}
  ]$stages$::jsonb;
begin
  select id into v_client
    from clients
   where lower(slug) in ('sergio-amoros-molina', 'sergioamoros', 'sergiofilm', 'sergioamfilms')
      or name ilike '%sergio%amor%s%'
   order by (lower(slug) = 'sergio-amoros-molina') desc
   limit 1;

  if v_client is null then
    raise notice '[HELM] No encuentro el perfil de Sergio Amorós. El embudo y el formulario NO se han creado; crea el perfil y vuelve a aplicar esta migración.';
    return;
  end if;

  -- ── Embudo de proyectos ──────────────────────────────────────────────────
  -- Propio, no el 'Pipeline' por defecto del perfil. Lleva su etapa "Ahora no"
  -- porque el cuestionario ya separa a quien encaja de quien no (menos de
  -- 1.000 € y sin fecha), y a ese segundo grupo la web le dice expresamente
  -- que se le escribirá más adelante: es un lead para recuperar, no un
  -- perdido, y mezclarlos borraría esa diferencia.
  select id into v_pipeline
    from crm_pipelines
   where client_id = v_client and name = 'Proyectos'
   limit 1;

  if v_pipeline is null then
    insert into crm_pipelines (client_id, name, stages, is_default)
    values (v_client, 'Proyectos', v_stages, false)
    returning id into v_pipeline;
  else
    update crm_pipelines set stages = v_stages where id = v_pipeline;
  end if;

  -- ── Formulario ───────────────────────────────────────────────────────────
  insert into helm_forms (client_id, slug, title, description, fields, active, pipeline_id, stage_key, booked_stage_key)
  values (
    v_client,
    'proyecto',
    'Cuéntame tu proyecto',
    'Cuestionario de cualificación de la web de Sergio Amorós: 10 preguntas sobre el proyecto y los datos de contacto. Quien encaja ve el Calendly al terminar; a quien no, la web le dice que se le escribirá cuando tenga fecha o presupuesto. El campo "encaja" recoge en cuál de los dos grupos cayó.',
    $json$[
      {"key":"para","label":"¿Para qué quieres el vídeo?","type":"select","required":true,
       "options":["Vender un producto o servicio","Que me conozcan y me escriban","Presentar mi empresa o mi equipo","Guardar un momento (boda, celebración, evento)","Enseñar algo (curso, formación interna)","No lo tengo claro, por eso pregunto"]},
      {"key":"fecha","label":"¿Para cuándo lo necesitas?","type":"select","required":true,
       "options":["En menos de dos semanas","Dentro de un mes","En uno a tres meses","Sin fecha, estoy mirando"]},
      {"key":"personas","label":"¿Cuánta gente va a salir en la grabación?","type":"select","required":true,
       "options":["Nadie, solo el espacio o el producto","Una persona","Entre 2 y 5","Un grupo o equipo","Mucha gente (evento, invitados, público)"]},
      {"key":"tiempo","label":"¿Cuánto tiempo de grabación calculas?","type":"select","required":true,
       "options":["Unas horas","Medio día","Un día completo","Dos o tres días","Varias jornadas repartidas","Algo fijo cada mes"]},
      {"key":"lugar","label":"¿Dónde se graba?","type":"select","required":true,
       "options":["En un solo sitio","En varios sitios el mismo día","En distintas ciudades","Aún no lo sé"]},
      {"key":"tienes","label":"¿Qué tienes ya preparado?","type":"multi","required":true,
       "options":["La idea clara de lo que quiero contar","Un guion o texto escrito","El lugar reservado","Las personas que van a salir","Vídeos de referencia que me gustan","Nada todavía"]},
      {"key":"uso","label":"¿Dónde se va a usar?","type":"multi","required":true,
       "options":["Redes sociales","Web o página de venta","Anuncios pagados","Pantalla en un evento o local","Televisión o cine","Uso privado o interno"]},
      {"key":"presu","label":"¿Qué presupuesto tienes pensado?","type":"select","required":true,
       "options":["Menos de 1.000 €","1.000 – 3.000 €","3.000 – 6.000 €","6.000 – 15.000 €","Más de 15.000 €","Aún no lo sé"]},
      {"key":"antes","label":"¿Has trabajado antes con alguien que grabe vídeo?","type":"select","required":true,
       "options":["Nunca, es la primera vez","Sí, y quedé contento","Sí, y no quedé contento","Tengo a alguien ahora y busco cambiar"]},
      {"key":"decide","label":"¿Quién decide si esto sale adelante?","type":"select","required":true,
       "options":["Yo","Yo y mi pareja / socio","El equipo de marketing","Dirección o gerencia","Soy una agencia, decide mi cliente"]},
      {"key":"encaja","label":"¿Le ofreció la web reservar llamada?","type":"select","required":false,
       "options":["Sí, se le mostró el Calendly","No, presupuesto mínimo y sin fecha"]}
    ]$json$::jsonb,
    true,
    v_pipeline,
    -- Todos entran en "Nueva solicitud", encajen o no. Mover a "Ahora no" al
    -- que la web descartó lo decide Sergio: el corte automático es una regla
    -- de dos respuestas, y un lead que pone "aún no lo sé" en presupuesto
    -- puede valer más que uno que marca 3.000 €. Lo que sí queda visible sin
    -- abrir la ficha es en qué grupo cayó — va en la actividad del contacto.
    'nueva',
    -- Esta web no reserva hora dentro de HELM: la llamada se coge por el
    -- Calendly de Sergio, que HELM no ve.
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

  raise notice '[HELM] Formulario "Cuéntame tu proyecto" listo para Sergio Amorós (pipeline=%, form=%)', v_pipeline, v_form;
end $$;
