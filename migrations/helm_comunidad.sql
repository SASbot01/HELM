-- HELM — Comunidad: el chat común de todos los perfiles.
--
-- Es la única tabla de HELM que NO está scopeada por client_id: ese es el
-- punto. Todo el mundo que tiene un perfil entra al mismo hilo para apoyarse
-- entre negocios. client_id se guarda para saber QUIÉN escribe (y para poder
-- borrar lo tuyo), no para filtrar.

create extension if not exists "pgcrypto";

create table if not exists helm_community_messages (
  id           uuid primary key default gen_random_uuid(),

  -- Autor. client_id puede quedarse null si el perfil se borra: el mensaje
  -- sigue en la conversación (borrarlo dejaría huecos en hilos ajenos).
  client_id    uuid references clients(id) on delete set null,
  author_name  text not null,            -- persona que escribe
  author_email text,
  brand_name   text,                     -- marca con la que se presenta
  brand_logo   text,                     -- url del logo, para el avatar

  body         text not null,
  is_admin     boolean not null default false,  -- mensaje del equipo de HELM

  deleted_at   timestamptz,              -- borrado blando: no rompe el hilo
  created_at   timestamptz not null default now()
);

create index if not exists helm_community_created_idx
  on helm_community_messages (created_at desc);

alter table helm_community_messages enable row level security;
drop policy if exists helm_community_messages_all on helm_community_messages;
create policy helm_community_messages_all on helm_community_messages
  for all using (true) with check (true);
