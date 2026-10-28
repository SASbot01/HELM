-- HELM — migraciones pendientes (aplicar en Supabase → SQL Editor).
-- Onboarding, Biblia, columnas de Tareas y calendario de Contenido.

-- ═══ 1) helm_onboarding ═══
-- HELM — Onboarding por perfil.
--
-- Un perfil puede rellenar varios onboardings (de momento: 'contenido'; en el
-- futuro 'migracion' y un tercero). Cada uno guarda sus respuestas como un
-- único documento jsonb que se va autoguardando en borrador y, al completarse,
-- se transforma en bloques de `helm_knowledge` (source = 'onboarding:<form>')
-- para que el chat lo inyecte en su system prompt. Regenerar = borrar los
-- bloques con ese source y volver a insertarlos.
--
-- Scoped por client_id, un documento por (client_id, form).

create extension if not exists "pgcrypto";

create table if not exists helm_onboarding (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references clients(id) on delete cascade,
  form          text not null default 'contenido',   -- 'contenido' | 'migracion' | …
  answers       jsonb not null default '{}'::jsonb,   -- respuestas por field.key
  status        text not null default 'draft' check (status in ('draft', 'completed')),
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (client_id, form)
);

create index if not exists helm_onboarding_client_idx
  on helm_onboarding (client_id);

-- RLS allow-all (mismo patrón que el resto de HELM: el control real de acceso
-- lo hace la app, que entra con la anon key).
alter table helm_onboarding enable row level security;

do $$
begin
  drop policy if exists helm_onboarding_all on helm_onboarding;
  create policy helm_onboarding_all on helm_onboarding for all using (true) with check (true);
end $$;

-- ═══ 2) helm_biblia ═══
-- HELM — La Biblia del perfil.
--
-- Al completar el onboarding de contenido, la IA sintetiza las respuestas
-- (que viven en helm_onboarding) en DOS documentos redactados:
--
--   empresa    → identidad, historia, tono/voz, autoridad, posicionamiento,
--                modelo de negocio y avatar.
--   contenido  → pilares, ángulos, banco de hooks, historias y formatos.
--
-- Estos documentos son la fuente de verdad para mostrar/editar y son lo que el
-- chat inyecta en su system prompt (mejor que 200 respuestas crudas). Un
-- documento por (client_id, kind); regenerar = upsert.

create extension if not exists "pgcrypto";

create table if not exists helm_biblia (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete cascade,
  kind        text not null check (kind in ('empresa', 'contenido')),
  title       text,
  content     text not null,       -- markdown
  status      text not null default 'generated' check (status in ('generated', 'edited')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (client_id, kind)
);

create index if not exists helm_biblia_client_idx on helm_biblia (client_id);

alter table helm_biblia enable row level security;

do $$
begin
  drop policy if exists helm_biblia_all on helm_biblia;
  create policy helm_biblia_all on helm_biblia for all using (true) with check (true);
end $$;

-- ═══ 3) crm_tasks: assignee + checklist ═══
-- HELM — Tareas mejoradas: asignación a un miembro del equipo y checklist de
-- subtareas. El resto (status todo/in_progress/review/done, priority, due_date)
-- ya existía en crm_tasks tras task_management_v2.
--
--   assignee_id → miembro de `team` responsable de la tarea (null = sin asignar)
--   checklist   → array jsonb de subtareas: [{ "text": "...", "done": false }]

alter table crm_tasks
  add column if not exists assignee_id uuid references team(id) on delete set null,
  add column if not exists checklist   jsonb not null default '[]'::jsonb;

create index if not exists crm_tasks_assignee_idx on crm_tasks (assignee_id);

-- ═══ 4) helm_content_calendar ═══
-- HELM — Calendario de contenido por perfil.
--
-- Cada fila es una pieza de contenido programada en un día. Se crean desde el
-- chat con /programar-guion (source='chat', body = el guion generado) o a mano
-- desde la vista Contenido (source='manual').

create extension if not exists "pgcrypto";

create table if not exists helm_content_calendar (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete cascade,
  date        date not null,
  title       text not null,
  body        text,                -- el guion completo (markdown)
  format      text default 'reel', -- reel | carousel | email | yt | nota
  status      text not null default 'planned' check (status in ('planned', 'published')),
  source      text default 'manual',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists helm_content_calendar_client_date_idx
  on helm_content_calendar (client_id, date);

alter table helm_content_calendar enable row level security;

do $$
begin
  drop policy if exists helm_content_calendar_all on helm_content_calendar;
  create policy helm_content_calendar_all on helm_content_calendar for all using (true) with check (true);
end $$;
