-- HELM — Agent OS: el equipo deja de ser solo de contenido.
--
-- Se suman tres agentes (productor, comercial, informe) y cualquiera puede
-- proponer tareas al dueño del perfil. No necesitan tablas propias —corren
-- como los demás y escriben en agent_ejecuciones y agent_memory, que gana dos
-- tipos de nota: 'aviso' e 'informe'— salvo las tareas propuestas:
--
--   agent_tareas   lo que un agente propone hacer. Queda 'pendiente' hasta que
--                  el dueño la acepta (entonces se crea en crm_tasks y se
--                  apunta aquí cuál es) o la descarta. `clave` sale del título:
--                  una tarea ya contestada no se vuelve a proponer.
--
-- Se puede ejecutar varias veces.
begin;

create table if not exists public.agent_tareas (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references public.clients(id) on delete cascade,
  clave      text not null,
  agente     text not null,
  titulo     text not null,
  detalle    text not null default '',
  vence      date,
  prioridad  text not null default 'medium' check (prioridad in ('low', 'medium', 'high')),
  estado     text not null default 'pendiente' check (estado in ('pendiente', 'aceptada', 'descartada')),
  task_id    uuid references public.crm_tasks(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, clave)
);

alter table public.agent_tareas enable row level security;
drop policy if exists agent_tareas_srv on public.agent_tareas;
create policy agent_tareas_srv on public.agent_tareas
  for all to service_role using (true) with check (true);

commit;
