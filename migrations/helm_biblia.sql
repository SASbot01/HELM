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
