-- HELM — Equipos IA · equipo de Contenido.
--
-- Primer equipo de agentes: cada uno hace un trabajo del pipeline de contenido
-- de una cuenta, encadenado.
--
--   Agente Persona   → recopila las dos Biblias (empresa + contenido, ya
--                       síntesis del onboarding) y las funde con el framework
--                       de Ronda de Stories / Ronda de Reels en un único
--                       documento base: `helm_agente_base`. Un documento por
--                       cliente; regenerar = upsert (igual que helm_biblia).
--
--   Agente 1 · Investigación → a partir de esa base, cada día propone tres
--                       ideas de ronda de historias y tres de reel, listas
--                       para grabar. Queda un registro por (client_id, fecha):
--                       `helm_agente_ideas`. Regenerar el mismo día sobrescribe.
--
--   Agente 2 · Creador de historias → siguiente fase (conexión con Canva u
--                       otra herramienta de diseño); no tiene tabla propia
--                       todavía.

create extension if not exists "pgcrypto";

create table if not exists helm_agente_base (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete cascade,
  content     text not null,        -- markdown
  status      text not null default 'generated' check (status in ('generated', 'edited')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (client_id)
);

create index if not exists helm_agente_base_client_idx on helm_agente_base (client_id);

alter table helm_agente_base enable row level security;

do $$
begin
  drop policy if exists helm_agente_base_all on helm_agente_base;
  create policy helm_agente_base_all on helm_agente_base for all using (true) with check (true);
end $$;

create table if not exists helm_agente_ideas (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete cascade,
  fecha       date not null default current_date,
  historias   jsonb not null default '[]'::jsonb,   -- [{titulo, plantilla, carril, gancho, resumen, cta}, ...]
  reels       jsonb not null default '[]'::jsonb,   -- misma forma
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (client_id, fecha)
);

create index if not exists helm_agente_ideas_client_idx on helm_agente_ideas (client_id, fecha desc);

alter table helm_agente_ideas enable row level security;

do $$
begin
  drop policy if exists helm_agente_ideas_all on helm_agente_ideas;
  create policy helm_agente_ideas_all on helm_agente_ideas for all using (true) with check (true);
end $$;
