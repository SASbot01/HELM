-- La oficina de cada agente: el hilo de chat entre el perfil y un agente
-- concreto (contenido, editor, setter, web-creator…). Las indicaciones que das
-- por aquí se guardan además en agent_memory (ámbito 'oficina'), que es lo que
-- el agente «recuerda» la próxima vez.
--
-- Server-only: el navegador no lee esta tabla directa (está en la lista negra
-- de la pasarela). Todo pasa por api/agente-oficina.js, que necesita el modelo
-- y la memoria. El adjunto es para lo que el agente devuelve (un guion en PDF,
-- un vídeo editado): de momento queda null.
create table if not exists public.helm_agente_chat (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references public.clients(id) on delete cascade,
  agente     text not null,                               -- la ruta del agente
  rol        text not null check (rol in ('tu', 'agente')),
  texto      text not null,
  adjunto    jsonb,                                       -- { tipo, url, nombre } | null
  created_at timestamptz not null default now()
);

create index if not exists helm_agente_chat_hilo
  on public.helm_agente_chat (client_id, agente, created_at);

alter table public.helm_agente_chat enable row level security;
-- Sin políticas: solo el service role (el servidor) entra. El navegador va por
-- la API, nunca directo.
