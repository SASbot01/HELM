-- HELM — La Fábrica: los procesos internos que la PLATAFORMA lleva sobre cada
-- perfil. No es el CRM del cliente (eso son sus leads): es el tablero de trabajo
-- de Alex sobre cada negocio, invisible para el cliente y su equipo. Por eso una
-- tabla propia y no se reutiliza crm_contacts: separar evita que un proceso
-- interno aparezca en el pipeline del cliente, y que tocar uno rompa el otro.
--
-- Carriles (agente): Estrategia · Marketing y contenido · Comercial y ventas ·
-- Seguridad y legal · Operaciones y entrega.
-- Estados: backlog · curso · revision (comité) · bloqueada · hecho.
--
-- Solo la plataforma (api/fabrica.js con requirePlataforma; el enlace de
-- operador del MCP). Idempotente: se puede volver a aplicar sin romper nada.
create extension if not exists pgcrypto;

create table if not exists public.fabrica_tareas (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references public.clients(id) on delete cascade,
  agente     text not null default 'Estrategia',
  estado     text not null default 'backlog',
  titulo     text not null,
  detalle    text,
  fase       text,
  orden      int  not null default 0,
  -- Historial de notas: [{ fecha: 'YYYY-MM-DD', texto }]. Así cada movimiento
  -- deja rastro y el informe de avance se lee de un vistazo.
  notas      jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fabrica_tareas_client_idx on public.fabrica_tareas(client_id);
create index if not exists fabrica_tareas_estado_idx on public.fabrica_tareas(client_id, estado);

comment on table public.fabrica_tareas is
  'La Fábrica: procesos/tareas internas por perfil, SOLO plataforma. Distinta del CRM del cliente (crm_contacts).';
