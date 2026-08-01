-- HELM — Comunidad interna: la comunidad y la formación DE CADA PERFIL.
--
-- Ojo con no confundirla con `helm_community_messages` (migrations/
-- helm_comunidad.sql), que es el hilo común de todos los negocios de HELM.
-- Esto es lo contrario: cada perfil tiene la suya, con sus propios miembros —
-- gente de fuera, sus alumnos o clientes — que entran por un enlace público,
-- se registran, y el dueño del perfil les da acceso o no.
--
-- Cuatro piezas:
--   helm_community          → la config de la comunidad de ese perfil
--   helm_community_members  → quién se ha registrado y en qué estado está
--   helm_community_wall     → el muro (mensajes y respuestas)
--   helm_courses/helm_lessons → la formación que se sube ahí

create extension if not exists "pgcrypto";

-- ── Config ─────────────────────────────────────────────────────────────────
create table if not exists helm_community (
  client_id     uuid primary key references clients(id) on delete cascade,
  enabled       boolean not null default false,   -- si el enlace público funciona
  name          text,                             -- si es null se usa la marca del perfil
  welcome       text,                             -- lo que se lee al entrar
  -- Con auto_approve, quien se registra entra directo. Sin él (por defecto)
  -- queda pendiente hasta que alguien del perfil lo apruebe.
  auto_approve  boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ── Miembros ───────────────────────────────────────────────────────────────
create table if not exists helm_community_members (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references clients(id) on delete cascade,
  name          text not null,
  email         text not null,
  password_hash text not null,
  -- pendiente → se ha registrado y espera; activo → entra; bloqueado → se le
  -- ha quitado el acceso sin borrarle el histórico del muro.
  status        text not null default 'pendiente'
                check (status in ('pendiente', 'activo', 'bloqueado')),
  approved_at   timestamptz,
  last_login_at timestamptz,
  created_at    timestamptz not null default now(),
  unique (client_id, email)
);
create index if not exists helm_community_members_client_idx
  on helm_community_members (client_id, status);

-- ── Muro ───────────────────────────────────────────────────────────────────
create table if not exists helm_community_wall (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete cascade,
  member_id   uuid references helm_community_members(id) on delete set null,
  author_name text not null,
  from_owner  boolean not null default false,     -- lo escribe el dueño del perfil
  body        text not null,
  parent_id   uuid references helm_community_wall(id) on delete cascade,
  deleted_at  timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists helm_community_wall_client_idx
  on helm_community_wall (client_id, created_at desc);
create index if not exists helm_community_wall_parent_idx
  on helm_community_wall (parent_id);

-- ── Formación ──────────────────────────────────────────────────────────────
create table if not exists helm_courses (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete cascade,
  title       text not null,
  description text not null default '',
  cover_url   text not null default '',
  position    integer not null default 0,
  published   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists helm_courses_client_idx on helm_courses (client_id, position);

create table if not exists helm_lessons (
  id          uuid primary key default gen_random_uuid(),
  course_id   uuid not null references helm_courses(id) on delete cascade,
  client_id   uuid not null references clients(id) on delete cascade,
  title       text not null,
  body        text not null default '',           -- el texto de la lección (markdown)
  video_url   text not null default '',           -- YouTube, Vimeo o un mp4 del bucket
  attachments jsonb not null default '[]'::jsonb,
  position    integer not null default 0,
  published   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists helm_lessons_course_idx on helm_lessons (course_id, position);

-- ── RLS ────────────────────────────────────────────────────────────────────
-- Config, muro y formación siguen el patrón del resto de HELM (allow-all: el
-- acceso se controla en la app, que entra con la anon key).
alter table helm_community      enable row level security;
alter table helm_community_wall enable row level security;
alter table helm_courses        enable row level security;
alter table helm_lessons        enable row level security;

do $$
declare t text;
begin
  foreach t in array array['helm_community', 'helm_community_wall', 'helm_courses', 'helm_lessons'] loop
    execute format('drop policy if exists %1$s_all on %1$s', t);
    execute format('create policy %1$s_all on %1$s for all using (true) with check (true)', t);
  end loop;
end $$;

-- Los MIEMBROS son otra cosa: la tabla guarda hashes de contraseña. Aquí se
-- niega al rol anónimo igual que en user_integrations, así que solo la toca el
-- servidor (api/comunidad.js). Si el navegador pudiera leerla, cualquiera con la
-- anon key se llevaría los hashes de los alumnos de todos los perfiles.
alter table helm_community_members enable row level security;
drop policy if exists helm_community_members_anon_deny on helm_community_members;
drop policy if exists helm_community_members_service   on helm_community_members;
create policy helm_community_members_anon_deny on helm_community_members
  for all to anon using (false) with check (false);
create policy helm_community_members_service on helm_community_members
  for all to service_role using (true) with check (true);
