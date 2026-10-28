-- HELM — El funnel /pagina2 de Detrás de Cámara entra al CRM del cliente.
--
-- Hasta ahora detrasdecamara.org/pagina2 (la carta de ventas) y su paso 2
-- (/reservar) mandaban el lead a central.blackwolfsec.io, que es OTRA
-- aplicación. En el perfil de Detrás de Cámara dentro de HELM no aparecía
-- nada: Abel veía los leads de /valor y ni uno solo de la carta de ventas,
-- que es justo por donde entra la gente que reserva llamada.
--
-- Esta migración prepara el sitio en HELM para esos leads:
--
--   1) `helm_forms.booked_stage_key` — la etapa a la que salta el contacto
--      cuando REALMENTE reserva hora, distinta de la de entrada. Sin esto,
--      /pagina2 tendría que elegir entre marcar a todos como agendados (falso:
--      la mayoría abandona en el paso 2) o a ninguno (inútil: el embudo no
--      distingue quien dejó el email de quien va a estar en la llamada).
--   2) El embudo "Funnel pagina2" y el formulario del mismo nombre.
--
-- Idempotente: se puede aplicar más de una vez sin duplicar nada.
--
-- NOTA sobre supabase/migrations/095_dcc_funnel_pagina2_pipeline.sql: aquella
-- creaba el mismo embudo buscando el perfil por el slug 'detras-de-camara',
-- que no existe — el real es 'detras-de-camra'. Se quedaba en el RAISE NOTICE
-- sin crear nada. Aquí se busca como en helm_formulario_publico_dcc.sql, y si
-- el embudo ya existiera de antes se reutiliza en vez de duplicarlo.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) LA ETAPA DE "YA HA RESERVADO"
-- ═══════════════════════════════════════════════════════════════════════════
alter table helm_forms
  add column if not exists booked_stage_key text;

comment on column helm_forms.booked_stage_key is
  'Etapa a la que se mueve el contacto cuando completa el formulario reservando '
  'hora (meta.slot_start). Null = no se mueve, el comportamiento de siempre. '
  'Solo se aplica si el contacto sigue en la etapa de entrada: si el comercial '
  'ya lo movió a mano, mandarlo de vuelta borraría su trabajo.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) EMBUDO + FORMULARIO DE /pagina2
-- ═══════════════════════════════════════════════════════════════════════════
do $$
declare
  v_client   uuid;
  v_pipeline uuid;
  v_form     uuid;
  v_stages   jsonb := $stages$[
    {"key": "lead",              "label": "Lead",              "color": "#F37C34"},
    {"key": "contactado",        "label": "Contactado",        "color": "#F59E0B"},
    {"key": "llamada_agendada",  "label": "Llamada agendada",  "color": "#3B82F6"},
    {"key": "llamada_realizada", "label": "Llamada realizada", "color": "#8B5CF6"},
    {"key": "cliente",           "label": "Cliente",           "color": "#10B981"},
    {"key": "no_show",           "label": "No Show",           "color": "#94A3B8"},
    {"key": "perdido",           "label": "Perdido",           "color": "#EF4444"}
  ]$stages$::jsonb;
begin
  -- El slug real es 'detras-de-camra' (helm.s4sf.net/detras-de-camra). Los
  -- demás van por si el perfil se recrea algún día con otra grafía.
  select id into v_client
    from clients
   where lower(slug) in ('detras-de-camra', 'detrasdecamara', 'detrasdecamaras', 'detras-de-camara', 'dcc')
      or name ilike '%detr%s de c%mara%'
   order by (lower(slug) = 'detras-de-camra') desc
   limit 1;

  if v_client is null then
    raise notice '[HELM] No encuentro el perfil de Detrás de Cámara. El embudo y el formulario de /pagina2 NO se han creado; crea el perfil y vuelve a aplicar esta migración.';
    return;
  end if;

  -- ── Embudo ───────────────────────────────────────────────────────────────
  select id into v_pipeline
    from crm_pipelines
   where client_id = v_client and name = 'Funnel pagina2'
   limit 1;

  if v_pipeline is null then
    insert into crm_pipelines (client_id, name, stages, is_default)
    values (v_client, 'Funnel pagina2', v_stages, false)
    returning id into v_pipeline;
  else
    -- Se refrescan las etapas, pero NO se toca is_default: si alguien lo marcó
    -- como embudo por defecto del perfil, esta migración no debe decidir por él.
    update crm_pipelines set stages = v_stages where id = v_pipeline;
  end if;

  -- ── Formulario ───────────────────────────────────────────────────────────
  -- Las preguntas del paso 2 (/reservar). Las opciones llevan el texto que ve
  -- el lead, no los códigos internos: así la ficha del CRM se lee sola.
  --
  -- Los datos de contacto (nombre, email, teléfono, Instagram) NO van aquí:
  -- esos son columnas de la ficha del contacto, no respuestas del formulario.
  insert into helm_forms (client_id, slug, title, description, fields, active, pipeline_id, stage_key, booked_stage_key)
  values (
    v_client,
    'pagina2',
    'Carta de ventas — reserva de llamada',
    'Carta de ventas "Vive del Filmmaking en serio" + reserva de llamada. Paso 1 en detrasdecamara.org/pagina2 (deja el contacto), paso 2 en /reservar (cualifica y elige hora).',
    $json$[
      {"key":"situacion","label":"¿Cuál describe mejor tu situación actual?","type":"select","required":true,
       "options":["Estoy empezando","Freelance, ingresos inconstantes","Vivo de esto, pero estancado","Estructurando un negocio audiovisual"]},
      {"key":"facturacion","label":"¿Cuánto facturas al mes ahora mismo?","type":"select","required":true,
       "options":["0 – 500 €","500 – 1.500 €","1.500 – 3.000 €","3.000 – 5.000 €","5.000 €+"]},
      {"key":"bloqueo","label":"¿Qué es lo que más te está bloqueando?","type":"select","required":true,
       "options":["Conseguir clientes","Subir tarifas","Posicionamiento","Cerrar la venta","Estructura del negocio"]},
      {"key":"objetivo","label":"¿Qué te gustaría conseguir?","type":"long","required":false},
      {"key":"compromiso","label":"¿Te comprometes a asistir a la llamada?","type":"select","required":true,
       "options":["Sí, totalmente","Depende del encaje","Solo busco información"]},
      {"key":"inversion","label":"¿Cuánto estarías dispuesto a invertir en resolverlo?","type":"select","required":true,
       "options":["Menos de 100 €","Entre 500 € y 1.500 €","Entre 1.500 € y 2.200 €","Más de 2.200 €","No estoy dispuesto a invertir nada"]}
    ]$json$::jsonb,
    true,
    v_pipeline,
    -- Entra como 'lead' (paso 1: solo ha dejado el contacto) y salta a
    -- 'llamada_agendada' cuando elige hora en el paso 2.
    'lead',
    'llamada_agendada'
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

  raise notice '[HELM] /pagina2 listo para Detrás de Cámara (pipeline=%, form=%)', v_pipeline, v_form;
end $$;
