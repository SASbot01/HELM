-- HELM — la capa operativa: contenido, biblioteca, formularios, tareas,
-- actividad con autoría y permisos por rol.
--
-- Va después de `helm_columna_vertebral.sql` (necesita helm_team).
-- Aplicar en Supabase → SQL Editor. Se puede ejecutar varias veces.

begin;

create extension if not exists "pgcrypto";

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) ALMACÉN DE ARCHIVOS
-- ═══════════════════════════════════════════════════════════════════════════
-- Un único bucket para todo lo que se suba desde HELM: adjuntos de piezas de
-- contenido, documentos de la biblioteca y contratos del equipo. Las rutas van
-- namespaced por perfil (<client_id>/<seccion>/<archivo>), así borrar un
-- perfil es borrar un prefijo.
insert into storage.buckets (id, name, public)
values ('helm', 'helm', true)
on conflict (id) do nothing;

do $$
begin
  drop policy if exists helm_bucket_read   on storage.objects;
  drop policy if exists helm_bucket_write  on storage.objects;
  drop policy if exists helm_bucket_delete on storage.objects;

  create policy helm_bucket_read on storage.objects
    for select using (bucket_id = 'helm');
  create policy helm_bucket_write on storage.objects
    for insert with check (bucket_id = 'helm');
  create policy helm_bucket_delete on storage.objects
    for delete using (bucket_id = 'helm');
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) CONTENIDO — estado de producción y adjuntos
-- ═══════════════════════════════════════════════════════════════════════════
-- El estado pasa de dos valores (planificado/publicado) a los tres que pedía
-- el informe: sin hacer → en proceso → hecho. Es lo que permite ver de un
-- vistazo en el calendario qué piezas están listas para las fechas elegidas, y
-- dar acceso al editor sabiendo qué le toca.
alter table helm_content_calendar
  add column if not exists attachments jsonb not null default '[]'::jsonb,  -- [{name,url,type,size}]
  add column if not exists assignee_id uuid references helm_team(id) on delete set null;

-- El CHECK viejo solo admitía 'planned' y 'published': hay que quitarlo antes
-- de reescribir los valores, o el propio UPDATE falla.
alter table helm_content_calendar drop constraint if exists helm_content_calendar_status_check;

update helm_content_calendar set status = 'todo' where status = 'planned';
update helm_content_calendar set status = 'done' where status = 'published';

alter table helm_content_calendar
  alter column status set default 'todo',
  add constraint helm_content_calendar_status_check
    check (status in ('todo', 'doing', 'done'));

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) BIBLIOTECA — el contexto extra de la IA
-- ═══════════════════════════════════════════════════════════════════════════
-- Documentos de empresa y transcripciones de llamadas. Lo que se marca como
-- `in_context` se inyecta en el system prompt del chat junto a la Biblia; el
-- resto se guarda pero no gasta ventana de contexto.
--
-- `contact_id` permite colgar una transcripción de un cliente concreto y luego
-- preguntarle a la IA "¿qué pasó con este cliente?".
create table if not exists helm_library (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete cascade,
  contact_id  uuid references crm_contacts(id) on delete set null,
  kind        text not null default 'documento',  -- documento | transcripcion | nota
  title       text not null,
  content     text not null default '',           -- el texto que ve la IA
  file_url    text not null default '',           -- original subido, si lo hay
  file_name   text not null default '',
  tags        jsonb not null default '[]'::jsonb,
  in_context  boolean not null default true,
  occurred_on date,                                -- fecha de la llamada/documento
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists helm_library_client_idx  on helm_library (client_id);
create index if not exists helm_library_contact_idx on helm_library (contact_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- 4) FORMULARIOS — constructor y respuestas pegadas al cliente
-- ═══════════════════════════════════════════════════════════════════════════
-- Un formulario es una plantilla (onboarding, satisfacción mes 1, cierre de
-- servicio…). Cada respuesta queda adjunta permanentemente a la ficha del
-- contacto, que es el punto del informe: la ficha acumula el histórico.
create table if not exists helm_forms (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete cascade,
  slug        text not null,                       -- parte pública de la URL
  title       text not null,
  description text not null default '',
  fields      jsonb not null default '[]'::jsonb,  -- [{key,label,type,required,options}]
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (client_id, slug)
);
create index if not exists helm_forms_client_idx on helm_forms (client_id);

create table if not exists helm_form_responses (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references clients(id) on delete cascade,
  form_id      uuid not null references helm_forms(id) on delete cascade,
  contact_id   uuid references crm_contacts(id) on delete set null,
  respondent   text not null default '',           -- nombre o email de quien responde
  answers      jsonb not null default '{}'::jsonb,
  submitted_at timestamptz not null default now()
);
create index if not exists helm_form_responses_form_idx    on helm_form_responses (form_id);
create index if not exists helm_form_responses_contact_idx on helm_form_responses (contact_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- 5) TAREAS — cliente adjunto y responsable del directorio de equipo
-- ═══════════════════════════════════════════════════════════════════════════
-- `assignee_id` ya existía pero apuntaba a `team` (la tabla de LOGIN), así que
-- solo se podía asignar a quien tuviera acceso al panel. `assignee_helm_id`
-- apunta al directorio de personas, que incluye a quien no entra al sistema.
alter table crm_tasks
  add column if not exists assignee_helm_id uuid references helm_team(id) on delete set null,
  add column if not exists contact_id       uuid references crm_contacts(id) on delete set null,
  add column if not exists service_id       uuid references helm_services(id) on delete set null,
  -- Cola de avisos: qué hay que notificar y si ya se envió. El envío en sí
  -- necesita un proveedor (email o WhatsApp) todavía sin decidir; la cola se
  -- llena igualmente para no perder los avisos mientras tanto.
  add column if not exists notify_channels  jsonb not null default '[]'::jsonb,  -- ['email','whatsapp']
  add column if not exists notified_at      timestamptz;

create index if not exists crm_tasks_contact_idx  on crm_tasks (contact_id);
create index if not exists crm_tasks_assignee_helm_idx on crm_tasks (assignee_helm_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- 6) PERMISOS POR ROL
-- ═══════════════════════════════════════════════════════════════════════════
-- Ver el panel entero no es problema; lo que se restringe es EDITAR. Una fila
-- por perfil, con un mapa { rol: [secciones editables] }. Vive en su propia
-- tabla y no en `clients` para no tocar la tabla que usa todo lo demás.
create table if not exists helm_permissions (
  client_id  uuid primary key references clients(id) on delete cascade,
  matrix     jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ═══════════════════════════════════════════════════════════════════════════
-- RLS — allow-all, como el resto de HELM.
-- ═══════════════════════════════════════════════════════════════════════════
alter table helm_library        enable row level security;
alter table helm_forms          enable row level security;
alter table helm_form_responses enable row level security;
alter table helm_permissions    enable row level security;

do $$
begin
  drop policy if exists helm_library_all on helm_library;
  create policy helm_library_all on helm_library for all using (true) with check (true);

  drop policy if exists helm_forms_all on helm_forms;
  create policy helm_forms_all on helm_forms for all using (true) with check (true);

  drop policy if exists helm_form_responses_all on helm_form_responses;
  create policy helm_form_responses_all on helm_form_responses for all using (true) with check (true);

  drop policy if exists helm_permissions_all on helm_permissions;
  create policy helm_permissions_all on helm_permissions for all using (true) with check (true);
end $$;

commit;
