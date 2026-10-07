-- 098_orbe_messages.sql
-- Memoria del chat del Orbe (copiloto ejecutivo de Apex).
--
-- Persiste el hilo de conversación por tenant (client_id) + operador
-- (member_key = id del miembro, o su email como fallback). Así la memoria
-- sobrevive recargas y cambios de dispositivo. El acceso es exclusivamente
-- vía backend (/api/agent acciones orbe_history / orbe_save / orbe_clear),
-- que usa la service key — por eso no se definen políticas RLS para el rol
-- anon (queda denegado por defecto, que es lo deseado).

create table if not exists public.orbe_messages (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null,
  member_key  text not null default 'anon',
  role        text not null check (role in ('user', 'assistant')),
  content     text not null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_orbe_messages_thread
  on public.orbe_messages (client_id, member_key, created_at);
