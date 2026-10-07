-- 047_support_tickets.sql
-- Sistema de soporte y tickets entre tenants y Black Wolf (PROP-001).
--
-- Contexto: cada tenant abre tickets desde Settings → Soporte. Los tickets
-- aterrizan en Black Wolf (tenant admin), donde el equipo los gestiona en
-- una bandeja única con filtros, cambia el estado, responde y puede agendar
-- una llamada con el usuario reusando el módulo de bookings.
--
-- Patrón de RLS: igual que el resto del proyecto, "service role full access".
-- Toda la lógica de autorización se hace a nivel de aplicación (la app valida
-- quién es Black Wolf staff vs. tenant_user antes de leer/escribir).

-- ============================================================================
-- Tabla support_tickets
-- ============================================================================
create table if not exists support_tickets (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references clients(id) on delete cascade,

  -- Quién lo abrió (usuario del tenant)
  opened_by_email   text not null,
  opened_by_user_id uuid,                       -- opcional, si el flujo de auth lo expone

  -- Contenido y clasificación
  subject       text not null,
  status        text not null default 'open'
                check (status in ('open','in_progress','resolved','reopened')),
  priority      text not null default 'medium'
                check (priority in ('low','medium','high','urgent')),

  -- Asignación al equipo de Black Wolf
  assigned_to_email text,                       -- email del staff que lo lleva (nullable)

  -- Marcas temporales útiles para la bandeja
  last_message_at timestamptz,
  resolved_at     timestamptz,
  closed_at       timestamptz,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table support_tickets is
  'Tickets de soporte abiertos por usuarios de un tenant. PROP-001.';
comment on column support_tickets.client_id is
  'Tenant al que pertenece el ticket. Black Wolf ve todos.';
comment on column support_tickets.assigned_to_email is
  'Staff de Black Wolf asignado al ticket. NULL = sin asignar (en cola).';

create index if not exists idx_support_tickets_client_id
  on support_tickets(client_id);
create index if not exists idx_support_tickets_status
  on support_tickets(status);
create index if not exists idx_support_tickets_priority
  on support_tickets(priority);
create index if not exists idx_support_tickets_assigned
  on support_tickets(assigned_to_email)
  where assigned_to_email is not null;
create index if not exists idx_support_tickets_last_message
  on support_tickets(last_message_at desc nulls last);

-- ============================================================================
-- Tabla support_messages
-- ============================================================================
create table if not exists support_messages (
  id            uuid primary key default gen_random_uuid(),
  ticket_id     uuid not null references support_tickets(id) on delete cascade,

  -- Quién escribe
  author_email  text not null,
  author_role   text not null
                check (author_role in ('tenant_user','blackwolf_staff','system')),

  body          text not null,
  attachments_json jsonb not null default '[]'::jsonb,

  -- Estado de lectura para el destinatario (badge de no leídos)
  read_by_recipient boolean not null default false,

  created_at    timestamptz not null default now()
);

comment on table support_messages is
  'Mensajes individuales dentro de un ticket de soporte. PROP-001.';
comment on column support_messages.author_role is
  'tenant_user = usuario que abrió o participa desde el tenant. blackwolf_staff = equipo Black Wolf. system = mensaje automático (estado, asignación).';
comment on column support_messages.read_by_recipient is
  'Si la última parte que tenía que leer este mensaje ya lo leyó. Útil para badges de no leídos.';

create index if not exists idx_support_messages_ticket_id
  on support_messages(ticket_id, created_at desc);
create index if not exists idx_support_messages_unread
  on support_messages(ticket_id)
  where read_by_recipient = false;

-- ============================================================================
-- Trigger: mantener updated_at y last_message_at automáticamente
-- ============================================================================
create or replace function support_tickets_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end
$$;

drop trigger if exists trg_support_tickets_touch on support_tickets;
create trigger trg_support_tickets_touch
  before update on support_tickets
  for each row execute function support_tickets_touch_updated_at();

create or replace function support_messages_touch_ticket()
returns trigger
language plpgsql
as $$
begin
  update support_tickets
    set last_message_at = new.created_at,
        updated_at      = now()
  where id = new.ticket_id;
  return new;
end
$$;

drop trigger if exists trg_support_messages_touch on support_messages;
create trigger trg_support_messages_touch
  after insert on support_messages
  for each row execute function support_messages_touch_ticket();

-- ============================================================================
-- Vista de conveniencia para la bandeja de Black Wolf
-- ============================================================================
create or replace view support_tickets_inbox as
select
  t.id,
  t.client_id,
  c.slug          as client_slug,
  c.name          as client_name,
  t.subject,
  t.status,
  t.priority,
  t.opened_by_email,
  t.assigned_to_email,
  t.last_message_at,
  t.created_at,
  t.updated_at,
  (
    select count(*)
    from support_messages m
    where m.ticket_id = t.id
      and m.read_by_recipient = false
      and m.author_role = 'tenant_user'   -- mensajes del cliente sin leer por staff
  )::int as unread_for_staff,
  (
    select count(*)
    from support_messages m
    where m.ticket_id = t.id
  )::int as message_count
from support_tickets t
join clients c on c.id = t.client_id;

comment on view support_tickets_inbox is
  'Vista agregada para la bandeja de soporte de Black Wolf: incluye slug y nombre del tenant, contador de no leídos y total de mensajes.';

-- ============================================================================
-- RLS — service role full access (patrón del proyecto)
-- La autorización fina (tenant_user solo ve los suyos, staff Black Wolf ve
-- todos) la hace la aplicación al construir las queries con el service key.
-- ============================================================================
alter table support_tickets  enable row level security;
alter table support_messages enable row level security;

create policy "Service role full access on support_tickets"
  on support_tickets for all to service_role using (true) with check (true);

create policy "Service role full access on support_messages"
  on support_messages for all to service_role using (true) with check (true);
