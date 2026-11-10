-- 130 — WebSeller: visibilidad por miembro, estado «interesado», reporte por
--       eventos y campo «Cambios para la web».
--
-- Esta migración trae los cambios de SCHEMA y los de DATOS que valen para
-- TODOS los perfiles. Lo específico de WebSeller (poner a los no-admin como
-- «call caller») se hace por DML aparte, no aquí, para no tocar datos de un
-- perfil desde una migración global.
--
-- Qué hace, y por qué cada pieza es idempotente (se puede aplicar dos veces):
--   1) `reports.events` + `reports.source`  — el reporte diario pasa a
--      acumular EVENTOS (lead movido a contactado / interesado / venta) en vez
--      de rellenarse a mano. Las filas viejas quedan como `source='manual'` y
--      se siguen viendo: no se pierde histórico.
--   2) «interesado» como etapa de TODOS los pipelines, justo detrás de
--      «contactado». No mueve a nadie: solo añade la columna si no estaba.
--   3) Un trigger en `crm_contacts` que, al cambiar la etapa de un lead a
--      contactado / interesado / una etapa de venta, apunta el evento en el
--      reporte del DÍA (hora de Madrid), atribuido a quien es dueño de ese
--      pipeline (el miembro cuyo nombre coincide con el nombre del pipeline).
--      Va en la base y no en el navegador a propósito: así cuenta mueva quien
--      mueva el lead (el panel, un webhook, Stripe/Woo, el scraper…).
--   4) `crm_contacts.custom_fields` garantizado — ahí vive «Cambios para la
--      web» en WebSeller ({ texto, adjuntos: [...] } bajo la clave cambios_web).

begin;

-- ── 1) Reporte por eventos ───────────────────────────────────────────────────
alter table reports
  add column if not exists events jsonb not null default '[]'::jsonb,
  add column if not exists source text  not null default 'manual';

comment on column reports.events is
  'Reporte por eventos: [{at, tipo, stage, contact_id, contact_name, amount}]. '
  'Lo rellena el trigger helm_report_crm_event al mover un lead de etapa.';
comment on column reports.source is
  'manual = reporte tecleado a mano (histórico). evento = acumulado por el trigger del CRM.';

alter table crm_contacts
  add column if not exists custom_fields jsonb not null default '{}'::jsonb;

-- ── 2) «interesado» en TODOS los pipelines, detrás de «contactado» ───────────
-- Recorre crm_pipelines y reescribe `stages` solo si falta «interesado».
-- La posición: justo después de la etapa cuyo key sea 'contactado'
-- (o 'contacted'); si no hay ninguna, detrás de la primera etapa.
do $$
declare
  p            record;
  nuevo        jsonb;
  elem         jsonb;
  i            int;
  pos          int;
  ya_esta      boolean;
  interesado   jsonb := jsonb_build_object('key','interesado','label','Interesado','tone','cyan');
begin
  for p in select id, stages from crm_pipelines loop
    if p.stages is null or jsonb_typeof(p.stages) <> 'array' then
      continue;
    end if;

    -- ¿ya tiene interesado?
    ya_esta := false;
    for elem in select * from jsonb_array_elements(p.stages) loop
      if lower(coalesce(elem->>'key','')) = 'interesado' then ya_esta := true; end if;
    end loop;
    if ya_esta then continue; end if;

    -- posición detrás de contactado (0-based índice del contactado)
    pos := null;
    i := 0;
    for elem in select * from jsonb_array_elements(p.stages) loop
      if lower(coalesce(elem->>'key','')) in ('contactado','contacted') then pos := i; end if;
      i := i + 1;
    end loop;
    if pos is null then pos := 0; end if;   -- sin contactado → detrás de la primera

    -- reconstruye el array insertando interesado tras `pos`
    nuevo := '[]'::jsonb;
    i := 0;
    for elem in select * from jsonb_array_elements(p.stages) loop
      nuevo := nuevo || elem;
      if i = pos then nuevo := nuevo || interesado; end if;
      i := i + 1;
    end loop;

    update crm_pipelines set stages = nuevo where id = p.id;
  end loop;
end $$;

-- ── 3) Trigger: mover un lead apunta el evento en el reporte del día ─────────

-- Nombre reducido a lo que identifica a la persona: sin acentos, sin mayúsculas
-- y sin adornos. Así «~Ortega» y «Ortega» son el mismo, y el pipeline «aron»
-- casa con el miembro «aron». Es la MISMA idea que el emparejamiento del
-- navegador (src/helm/crm/visibilidadMiembro.js).
create or replace function helm_norm_nombre(t text) returns text
  language sql immutable as $$
  select regexp_replace(
    translate(lower(coalesce(t,'')),
      'áàäâãéèëêíìïîóòöôõúùüûñç',
      'aaaaaeeeeiiiiooooouuuunc'),
    '[^a-z0-9]', '', 'g')
$$;

create or replace function helm_report_crm_event() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  k            text;
  tipo         text;
  pipe_name    text;
  owner_row    helm_team%rowtype;
  rep_id       uuid;
  rep_date     date := (now() at time zone 'Europe/Madrid')::date;
  evt          jsonb;
  owner_found  boolean := false;
begin
  -- Solo cuando la etapa de verdad cambia (o al crear el contacto ya en una
  -- etapa reportable). Si se guarda la ficha sin tocar la etapa, no hay evento.
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;

  k := lower(coalesce(new.status,''));
  tipo := case
    when k in ('contactado','contacted') then 'contactado'
    when k = 'interesado'                then 'interesado'
    when k ~ '(ganado|won|cerrado|cliente|venta|vendid|pagad|cobrad|pago)' then 'venta'
    else null
  end;
  if tipo is null then return new; end if;

  -- Dueño del pipeline del lead (por coincidencia de nombre). pipeline_id vacío
  -- cae en el pipeline por defecto del perfil.
  if new.pipeline_id is not null then
    select name into pipe_name from crm_pipelines where id = new.pipeline_id;
  else
    select name into pipe_name from crm_pipelines
      where client_id = new.client_id
      order by is_default desc, created_at asc limit 1;
  end if;

  if pipe_name is not null then
    select * into owner_row from helm_team
      where client_id = new.client_id and active
        and helm_norm_nombre(name) = helm_norm_nombre(pipe_name)
      limit 1;
    owner_found := found;
  end if;

  -- Fila del reporte del día para esa persona (o para el perfil, si el pipeline
  -- no tiene dueño identificado: un operador solo igual tiene su reporte).
  if owner_found then
    select id into rep_id from reports
      where client_id = new.client_id and date = rep_date
        and source = 'evento' and person_id = owner_row.id
      limit 1;
  else
    select id into rep_id from reports
      where client_id = new.client_id and date = rep_date
        and source = 'evento' and person_id is null and name = coalesce(pipe_name,'')
      limit 1;
  end if;

  if rep_id is null then
    insert into reports (client_id, date, source, role, name, person_id, events)
    values (
      new.client_id, rep_date, 'evento',
      case when owner_found then owner_row.role else '' end,
      case when owner_found then owner_row.name else coalesce(pipe_name,'') end,
      case when owner_found then owner_row.id   else null end,
      '[]'::jsonb
    )
    returning id into rep_id;
  end if;

  -- No apuntar dos veces el mismo contacto con el mismo tipo en el mismo día:
  -- arrastrar una tarjeta ida y vuelta no debe inflar las ventas.
  if exists (
    select 1 from reports r
    where r.id = rep_id
      and r.events @> jsonb_build_array(jsonb_build_object('contact_id', new.id::text, 'tipo', tipo))
  ) then
    return new;
  end if;

  evt := jsonb_build_object(
    'at', to_char(now() at time zone 'Europe/Madrid','YYYY-MM-DD"T"HH24:MI:SS'),
    'tipo', tipo,
    'stage', k,
    'contact_id', new.id::text,
    'contact_name', coalesce(new.name,''),
    'amount', coalesce(new.deal_value, 0)
  );

  update reports
    set events = events || evt,
        closes = closes + case when tipo = 'venta' then 1 else 0 end
    where id = rep_id;

  return new;
end $$;

drop trigger if exists helm_report_crm_event_trg on crm_contacts;
create trigger helm_report_crm_event_trg
  after insert or update of status on crm_contacts
  for each row execute function helm_report_crm_event();

commit;
