-- HELM — Formularios alojados fuera de HELM que entran al CRM.
--
-- Hasta ahora una respuesta solo podía llegar desde /f/<id> (la página pública
-- de HELM). Detrás de Cámara tiene su propia web (detrasdecamara.org) y el
-- formulario vive allí: entra por POST /api/formularios y aquí se le prepara
-- el sitio.
--
-- Dos cosas:
--   1) `meta` en las respuestas — de dónde vino el lead (UTMs, referrer) y la
--      puntuación que calcula la propia landing. Sin esto no hay forma de saber
--      si un lead llegó por un anuncio o por el link de la bio.
--   2) El formulario "Formulario 1" y los enlaces del perfil de Detrás de Cámara.
--
-- Idempotente: se puede aplicar más de una vez sin duplicar nada.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) META EN LAS RESPUESTAS
-- ═══════════════════════════════════════════════════════════════════════════
alter table helm_form_responses
  add column if not exists meta jsonb not null default '{}'::jsonb;

comment on column helm_form_responses.meta is
  'Contexto del envío: origen (utm_*, referrer), puntuación del lead y las '
  'respuestas en crudo cuando la landing manda códigos además de etiquetas.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) PERFIL DE DETRÁS DE CÁMARA — formulario + enlaces
-- ═══════════════════════════════════════════════════════════════════════════
-- El perfil se busca por slug y, si no, por nombre: el slug real depende de
-- cómo se dio de alta y no queremos que la migración falle por eso. Si no
-- aparece, avisa y no toca nada — el resto de la migración ya se ha aplicado.
do $$
declare
  v_client uuid;
  v_form   uuid;
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
    raise notice '[HELM] No encuentro el perfil de Detrás de Cámara. El formulario y los enlaces NO se han creado; crea el perfil y vuelve a aplicar esta migración.';
    return;
  end if;

  -- ── Formulario 1 ─────────────────────────────────────────────────────────
  -- Las 15 preguntas de detrasdecamara.org/valor. Las opciones van con el
  -- texto que ve el lead, no con códigos: así la ficha del CRM se lee sola.
  insert into helm_forms (client_id, slug, title, description, fields, active)
  values (
    v_client,
    'valor',
    'Formulario 1',
    'Acceso a la comunidad (clase de 1h30 + guía de presupuestos). detrasdecamara.org/valor',
    $json$[
      {"key":"q1_dedicacion","label":"¿Qué es hoy el filmmaking para ti?","type":"select","required":true,
       "options":["Un hobby — grabo por afición","Un extra — tengo otro trabajo y grabo aparte","Mi trabajo — soy freelance a tiempo completo","Tengo productora, estudio o equipo"]},
      {"key":"q2_experiencia","label":"¿Cuánto llevas grabando y editando?","type":"select","required":true,
       "options":["Menos de 6 meses","6 – 12 meses","1 – 3 años","3 – 5 años","Más de 5 años"]},
      {"key":"q3_facturacion","label":"¿Qué facturaste el mes pasado solo con el filmmaking?","type":"select","required":true,
       "options":["0 €","Menos de 500 €","500 – 1.500 €","1.500 – 3.000 €","3.000 – 6.000 €","Más de 6.000 €"]},
      {"key":"q4_tarifa","label":"¿Cuál es tu tarifa media por proyecto?","type":"select","required":true,
       "options":["Todavía no cobro","Menos de 300 €","300 – 800 €","800 – 2.000 €","2.000 – 5.000 €","Más de 5.000 €"]},
      {"key":"q5_recurrentes","label":"¿Tienes clientes fijos con pago recurrente cada mes?","type":"select","required":true,
       "options":["Ninguno","Uno","Dos o tres","Más de tres"]},
      {"key":"q6_captacion","label":"¿De dónde te salen los clientes ahora mismo?","type":"select","required":true,
       "options":["No me salen — ese es justo el problema","Boca a boca y conocidos","Instagram / redes","Prospección en frío (escribo yo)","Me llegan solos, tengo demanda"]},
      {"key":"q7_nicho","label":"¿Qué tipo de trabajo haces más?","type":"select","required":true,
       "options":["Bodas y eventos","Marcas, publicidad y branded content","Contenido para redes / marca personal","Producto, inmobiliaria o corporativo","Videoclips, cine o ficción","De todo un poco, sin nicho claro"]},
      {"key":"q8_presupuestos","label":"Cuando mandas un presupuesto, ¿qué pasa normalmente?","type":"select","required":true,
       "options":["Casi nunca mando presupuestos","Se quedan en silencio y no vuelven","Me regatean el precio casi siempre","Cierro, pero bajando mucho la tarifa","Cierro bien y sin bajar precio"]},
      {"key":"q9_problema","label":"¿Cuál es tu mayor problema hoy?","type":"select","required":true,
       "options":["No consigo clientes suficientes","Cobro muy poco para lo que hago","No sé presupuestar ni defender el precio","Un mes bien y tres mal, no hay estabilidad","Estoy saturado de curro pero no me sale rentable","No sé cómo posicionarme ni a quién dirigirme"]},
      {"key":"q10_atasco","label":"¿Cuánto tiempo llevas atascado en ese problema?","type":"select","required":true,
       "options":["Menos de 6 meses","6 – 12 meses","1 – 2 años","Más de 2 años"]},
      {"key":"q11_objetivo","label":"¿Cuánto quieres estar facturando dentro de 12 meses?","type":"select","required":true,
       "options":["Menos de 2.000 €/mes","2.000 – 3.000 €/mes","3.000 – 5.000 €/mes","5.000 – 10.000 €/mes","Más de 10.000 €/mes"]},
      {"key":"q12_horas","label":"¿Cuántas horas a la semana puedes dedicarle a arreglar esto?","type":"select","required":true,
       "options":["Menos de 5 h","5 – 10 h","10 – 20 h","Más de 20 h"]},
      {"key":"q13_inversion_previa","label":"¿Has invertido antes en formación o mentoría para tu negocio audiovisual?","type":"select","required":true,
       "options":["Nunca, solo contenido gratis","Sí, menos de 500 €","Sí, entre 500 y 2.000 €","Sí, más de 2.000 €"]},
      {"key":"q14_capacidad","label":"Si vieras claro que es lo que necesitas, ¿podrías invertir en formarte estos meses?","type":"select","required":true,
       "options":["Sí, sin problema","Sí, haciendo un esfuerzo","Solo si hubiera facilidades de pago","Ahora mismo no, vengo solo por lo gratis"]},
      {"key":"q15_cambio","label":"¿Qué te gustaría que cambiara en tu negocio de aquí a 6 meses?","type":"long","required":true}
    ]$json$::jsonb,
    true
  )
  on conflict (client_id, slug) do update
     set title       = excluded.title,
         description = excluded.description,
         fields      = excluded.fields,
         active      = true,
         updated_at  = now()
  returning id into v_form;

  raise notice '[HELM] Formulario 1 listo para Detrás de Cámara (form_id=%)', v_form;

  -- ── Enlaces del perfil ───────────────────────────────────────────────────
  -- Se insertan solo los que falten: si alguien los edita desde el panel, una
  -- segunda pasada de la migración no se los pisa.
  insert into helm_links (client_id, title, url, category, notes)
  select v_client, x.title, x.url, x.category, x.notes
    from (values
      ('Web — Detrás de Cámara',
       'https://detrasdecamara.org/',
       'Marketing',
       'La home pública'),
      ('VSL — carta de ventas',
       'https://detrasdecamara.org/pagina2',
       'Ventas',
       'VSL · lleva a reservar llamada'),
      ('Formulario 1 — acceso a la comunidad',
       'https://detrasdecamara.org/valor',
       'Ventas',
       'Conversión estática · las 15 respuestas entran al CRM')
    ) as x(title, url, category, notes)
   where not exists (
     select 1 from helm_links l where l.client_id = v_client and l.url = x.url
   );
end $$;
