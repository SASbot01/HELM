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
