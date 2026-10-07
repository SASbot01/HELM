-- HELM — En Forma con Hugo: el formulario de la VSL entra al CRM.
--
-- Mismo montaje que Detrás de Cámara (ver helm_formulario_publico_dcc.sql):
-- la landing vive fuera de HELM (web.enformaconhugo.com) y manda las respuestas
-- por POST /api/formularios.
--
-- Diferencia importante con el de Detrás de Cámara: ese formulario ADEMÁS
-- reserva hueco en la agenda de Hugo contra otro sistema (central). HELM no
-- sustituye esa reserva — recibe una copia del lead y sus respuestas para que
-- queden en la ficha del CRM. Por eso la hora reservada viaja en `meta`, no
-- como una pregunta más: no la contestó el lead, la eligió.
--
-- Requiere haber aplicado antes helm_formulario_publico_dcc.sql, que es donde
-- se añade la columna `meta` a helm_form_responses.
--
-- Idempotente: se puede aplicar más de una vez sin duplicar nada.

alter table helm_form_responses
  add column if not exists meta jsonb not null default '{}'::jsonb;

do $$
declare
  v_client uuid;
  v_form   uuid;
begin
  -- El slug real es 'enformaconhugo' (helm.s4sf.net/enformaconhugo). Los otros
  -- son por si el perfil se recrea con otra grafía. Nada de buscar por '%hugo%'
  -- a secas: con un nombre así podría engancharse a un perfil que no es.
  select id into v_client
    from clients
   where lower(slug) in ('enformaconhugo', 'en-forma-con-hugo', 'enformaconhugo-vsl')
      or name ilike '%en forma con hugo%'
   order by (lower(slug) = 'enformaconhugo') desc
   limit 1;

  if v_client is null then
    raise notice '[HELM] No encuentro el perfil de En Forma con Hugo. El formulario y los enlaces NO se han creado; crea el perfil y vuelve a aplicar esta migración.';
    return;
  end if;

  -- ── Formulario 1 ─────────────────────────────────────────────────────────
  -- Las tres preguntas de cualificación de web.enformaconhugo.com. Las
  -- opciones van con el texto exacto que ve el lead en el desplegable.
  insert into helm_forms (client_id, slug, title, description, fields, active)
  values (
    v_client,
    'reserva',
    'Formulario 1',
    'Reserva de llamada desde la VSL. web.enformaconhugo.com',
    $json$[
      {"key":"objetivo","label":"Tu objetivo principal","type":"select","required":true,
       "options":["Perder grasa (4–10 kg)","Definir y marcar músculo","Ganar volumen limpio","Recomposición corporal","Recuperar forma física","Otro"]},
      {"key":"momento","label":"¿En qué momento te encuentras?","type":"select","required":true,
       "options":["Llevo años intentándolo sin resultados","Acabo de empezar pero no veo cambios","Estoy estancado/a desde hace meses","Vuelvo después de mucho tiempo parado/a","Nunca antes he hecho un proceso así"]},
      {"key":"motivacion","label":"¿Por qué sientes que ahora es el momento de dar el cambio?","type":"long","required":true}
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

  raise notice '[HELM] Formulario 1 listo para En Forma con Hugo (form_id=%)', v_form;

  -- ── Formulario 2 ─────────────────────────────────────────────────────────
  -- La calculadora de calorías de /calculadora. Se rellena en dos pasos y
  -- llega en dos envíos, pero acaba en una sola respuesta (ver `responseId` en
  -- api/formularios.js): si alguien deja la calculadora a medias, su ficha ya
  -- tiene el contacto y lo que contestó hasta ahí.
  --
  -- Los últimos seis campos no los contesta nadie: los calcula la web con
  -- Mifflin-St Jeor. Van como preguntas igualmente para que se lean en la
  -- ficha sin tener que inventar un apartado aparte; por eso el "(calculado)".
  insert into helm_forms (client_id, slug, title, description, fields, active)
  values (
    v_client,
    'calculadora',
    'Formulario 2',
    'Calculadora de calorías (lead magnet). web.enformaconhugo.com/calculadora',
    $json2$[
      {"key":"inversion","label":"Del 1 al 10, ¿cuánto estás dispuesto a invertir en tu cambio físico?","type":"scale","required":true},
      {"key":"sexo","label":"Sexo","type":"select","options":["Hombre","Mujer"]},
      {"key":"edad","label":"Edad","type":"number"},
      {"key":"peso_kg","label":"Peso (kg)","type":"number"},
      {"key":"altura_cm","label":"Altura (cm)","type":"number"},
      {"key":"actividad","label":"Nivel de actividad","type":"select",
       "options":["Sedentario","Ligero","Moderado","Activo","Muy activo"]},
      {"key":"objetivo","label":"Objetivo","type":"select",
       "options":["Perder grasa rápido","Perder grasa (recomendado)","Mantener peso","Ganar músculo limpio","Ganar volumen"]},
      {"key":"tdee","label":"Gasto diario · TDEE (calculado)","type":"number"},
      {"key":"kcal_objetivo","label":"Calorías objetivo (calculado)","type":"number"},
      {"key":"proteina_g","label":"Proteína g/día (calculado)","type":"number"},
      {"key":"carbos_g","label":"Carbohidratos g/día (calculado)","type":"number"},
      {"key":"grasas_g","label":"Grasas g/día (calculado)","type":"number"}
    ]$json2$::jsonb,
    true
  )
  on conflict (client_id, slug) do update
     set title       = excluded.title,
         description = excluded.description,
         fields      = excluded.fields,
         active      = true,
         updated_at  = now();

  raise notice '[HELM] Formulario 2 (calculadora) listo para En Forma con Hugo';

  -- ── Enlaces del perfil ───────────────────────────────────────────────────
  insert into helm_links (client_id, title, url, category, notes)
  select v_client, x.title, x.url, x.category, x.notes
    from (values
      ('VSL — En Forma con Hugo',
       'https://web.enformaconhugo.com/',
       'Ventas',
       'VSL · el formulario de reserva manda las respuestas al CRM'),
      ('Calculadora — lead magnet',
       'https://web.enformaconhugo.com/calculadora',
       'Marketing',
       'Calculadora de calorías · captación de leads'),
      ('Gracias — post reserva',
       'https://web.enformaconhugo.com/gracias',
       'Ventas',
       'Thank you page tras reservar la llamada')
    ) as x(title, url, category, notes)
   where not exists (
     select 1 from helm_links l where l.client_id = v_client and l.url = x.url
   );
end $$;
