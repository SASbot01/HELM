-- HELM — Chat con IA por perfil.
--
-- Dos tablas, ambas scoped por client_id: cada perfil de negocio tiene su
-- propia conversación y su propia memoria. Nada se comparte entre perfiles.
--
--   helm_chat_messages → historial de la conversación (lo que se le manda a la IA)
--   helm_knowledge     → memoria permanente: reels estudiados, análisis de esos
--                        reels y conocimiento suelto que mete el usuario. Esto
--                        se inyecta en el system prompt de cada petición.

create extension if not exists "pgcrypto";

-- ── Historial de conversación ──────────────────────────────────────────────
create table if not exists helm_chat_messages (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete cascade,
  role        text not null check (role in ('user', 'assistant')),
  content     text not null,
  command     text,               -- '/reel-guion', '/conocimiento'… null si es charla normal
  created_at  timestamptz not null default now()
);

create index if not exists helm_chat_messages_client_idx
  on helm_chat_messages (client_id, created_at desc);

-- ── Memoria permanente ─────────────────────────────────────────────────────
-- kind:
--   reel      → guion/reel que el usuario le pasó para que lo estudie (bruto)
--   analisis  → lo que la IA extrajo de ese reel (patrón de hook, estructura…)
--   nota      → conocimiento suelto (/conocimiento): oferta, avatar, tono, precios…
create table if not exists helm_knowledge (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete cascade,
  kind        text not null default 'nota' check (kind in ('reel', 'analisis', 'nota')),
  title       text,
  content     text not null,
  source      text,               -- url o de dónde salió, opcional
  created_at  timestamptz not null default now()
);

create index if not exists helm_knowledge_client_idx
  on helm_knowledge (client_id, created_at desc);

-- ── RLS allow-all (mismo patrón que el resto de tablas de HELM: el acceso
--    real se controla en la app, que entra con la anon key) ────────────────
alter table helm_chat_messages enable row level security;
alter table helm_knowledge     enable row level security;

do $$
declare t text;
begin
  foreach t in array array['helm_chat_messages', 'helm_knowledge'] loop
    execute format('drop policy if exists %1$s_all on %1$s', t);
    execute format(
      'create policy %1$s_all on %1$s for all using (true) with check (true)', t);
  end loop;
end $$;
