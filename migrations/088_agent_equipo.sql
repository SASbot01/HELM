-- HELM — Agent OS: el equipo de agentes de un perfil.
--
-- Cuatro agentes por perfil (director, investigador, analista, guionista) que
-- comparten una memoria. Corren en el worker (scripts/agents-worker.mjs) como
-- trabajos de tipo 'equipo'; la lógica está en api/_lib/equipo.js.
--
--   agent_perfiles       el interruptor de cada perfil y sus topes
--   agent_ejecuciones    el registro: una fila por vez que corre un agente
--   agent_memory         gana memoria POR PERFIL (client_id), con autor y tipo
--   helm_content_calendar.revision   borrador | aprobado
--
-- Se puede ejecutar varias veces.
begin;

-- ── Memoria por perfil ──────────────────────────────────────────────────────
-- Hasta ahora una nota era global o de un creador. Las del equipo son de un
-- perfil, dicen qué agente las escribió y de qué tipo son:
--   aprendido  una conclusión        hecho      lo último que hizo ese agente
--   para       recado a otro agente  plan       el plan del día del director
--   propuesta  cambio de estrategia que espera a que el dueño lo acepte
--   regla      escrita por el dueño; los agentes la obedecen
-- `clave` identifica la nota dentro del perfil: si una conclusión ya existe,
-- se actualiza esa fila en vez de escribir otra (de ahí el índice único).
alter table public.agent_memory
  add column if not exists client_id   uuid references public.clients(id) on delete cascade,
  add column if not exists agente      text not null default '',
  add column if not exists tipo        text not null default '',
  add column if not exists para_agente text not null default '',
  add column if not exists estado      text not null default '';   -- propuestas: pendiente | aceptada | descartada

create unique index if not exists agent_memory_perfil_clave_idx
  on public.agent_memory (client_id, clave) where client_id is not null;

-- ── Borradores en el calendario ─────────────────────────────────────────────
-- Lo que ya había (escrito a mano o por el conector de Claude) queda aprobado.
-- Los agentes solo insertan 'borrador' y no tocan filas que no lo sean.
alter table public.helm_content_calendar
  add column if not exists revision text not null default 'aprobado';

do $$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.helm_content_calendar'::regclass
                    and conname = 'helm_content_calendar_revision_check') then
    alter table public.helm_content_calendar
      add constraint helm_content_calendar_revision_check check (revision in ('borrador', 'aprobado'));
  end if;
end $$;

-- ── El interruptor ──────────────────────────────────────────────────────────
create table if not exists public.agent_perfiles (
  client_id       uuid primary key references public.clients(id) on delete cascade,
  activo          boolean not null default false,
  guiones_dia     int not null default 2,
  tope_tokens_dia int not null default 400000,   -- entrada + salida, por día de Madrid
  updated_at      timestamptz not null default now()
);

-- ── El registro ─────────────────────────────────────────────────────────────
create table if not exists public.agent_ejecuciones (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients(id) on delete cascade,
  agente      text not null,                      -- director | investigador | analista | guionista
  origen      text not null default 'manual',     -- horario | director | manual
  estado      text not null default 'corriendo',  -- corriendo | hecho | error | saltado
  encargo     text not null default '',           -- lo que le pidió el director
  resumen     text not null default '',           -- qué hizo, en una frase
  pasos       jsonb not null default '[]'::jsonb, -- [{t, texto}] lo que fue haciendo
  modelo      text not null default '',
  tokens_in   int not null default 0,
  tokens_out  int not null default 0,
  error       text not null default '',
  empezado_en timestamptz not null default now(),
  acabado_en  timestamptz
);
create index if not exists agent_ejecuciones_perfil_idx
  on public.agent_ejecuciones (client_id, empezado_en desc);

alter table public.agent_perfiles    enable row level security;
alter table public.agent_ejecuciones enable row level security;
drop policy if exists agent_perfiles_srv on public.agent_perfiles;
create policy agent_perfiles_srv on public.agent_perfiles
  for all to service_role using (true) with check (true);
drop policy if exists agent_ejecuciones_srv on public.agent_ejecuciones;
create policy agent_ejecuciones_srv on public.agent_ejecuciones
  for all to service_role using (true) with check (true);

-- Se empieza solo con alexsilvestre.
insert into public.agent_perfiles (client_id, activo)
  select id, true from public.clients where slug = 'alexsilvestre'
  on conflict (client_id) do nothing;

commit;
