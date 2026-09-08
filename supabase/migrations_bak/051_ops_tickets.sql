-- 051_ops_tickets.sql
-- Sistema OPERATIVO de tickets (separado del support_tickets existente).
--
-- Pipeline 100% configurable: estados, tipos, prioridades y SLAs viven en
-- ops_ticket_pipeline (singleton JSONB). Los CHECKs duros se evitan a
-- propósito para que el equipo Black Wolf pueda añadir/renombrar stages
-- sin tocar SQL. Las semánticas críticas (qué key significa "done",
-- "closed", etc.) se guardan en columnas dedicadas del pipeline.
--
-- Convivencia: NO toca support_tickets. Todo lleva prefijo ops_*.

-- ============================================================================
-- Tabla ops_ticket_pipeline (singleton de configuración)
-- ============================================================================
create table if not exists ops_ticket_pipeline (
  id            uuid primary key default gen_random_uuid(),
  workspace     text not null default 'global' unique,

  -- Catálogos editables (arrays de objetos)
  -- stages: [{ key, name, color, order, kind: 'open'|'progress'|'terminal'|'cancelled' }]
  stages        jsonb not null default '[
    {"key":"open","name":"Open","color":"#3B82F6","order":1,"kind":"open"},
    {"key":"in_review","name":"In Review","color":"#A855F7","order":2,"kind":"progress"},
    {"key":"in_progress","name":"In Progress","color":"#F59E0B","order":3,"kind":"progress"},
    {"key":"blocked","name":"Blocked","color":"#EF4444","order":4,"kind":"progress"},
    {"key":"done","name":"Done","color":"#22C55E","order":5,"kind":"progress"},
    {"key":"done_confirmed","name":"Done Confirmed","color":"#10B981","order":6,"kind":"progress"},
    {"key":"closed","name":"Closed","color":"#6B7280","order":7,"kind":"terminal"},
    {"key":"cancelled","name":"Cancelled","color":"#6B7280","order":8,"kind":"cancelled"}
  ]'::jsonb,

  -- types: [{ key, name, color, icon }]
  types         jsonb not null default '[
    {"key":"bug","name":"Bug","color":"#EF4444","icon":"AlertTriangle"},
    {"key":"feature_request","name":"Feature Request","color":"#A855F7","icon":"Sparkles"},
    {"key":"operation","name":"Operation","color":"#F59E0B","icon":"Cog"},
    {"key":"support_question","name":"Support / Question","color":"#3B82F6","icon":"HelpCircle"}
  ]'::jsonb,

  -- priorities: [{ key, name, color, sla_hours, order }]
  priorities    jsonb not null default '[
    {"key":"urgent","name":"Urgent","color":"#EF4444","sla_hours":6,"order":1},
    {"key":"high","name":"High","color":"#F59E0B","sla_hours":12,"order":2},
    {"key":"mid","name":"Mid","color":"#3B82F6","sla_hours":24,"order":3},
    {"key":"low","name":"Low","color":"#6B7280","sla_hours":72,"order":4}
  ]'::jsonb,

  -- Mapeos semánticos: qué key tiene cada significado de flujo
  initial_stage_key         text not null default 'open',
  done_stage_key            text not null default 'done',
  done_confirmed_stage_key  text not null default 'done_confirmed',
  closed_stage_key          text not null default 'closed',
  cancelled_stage_key       text not null default 'cancelled',

  -- Configuración del flujo de cierre automático
  auto_close_hours          integer not null default 72,
  auto_close_enabled        boolean not null default true,

  -- Mensaje system enviado al cliente cuando staff marca "done"
  done_prompt_message       text not null default 'Soporte ha marcado este ticket como Done. ¿Quieres confirmar que está correcto? Si no respondes en 72 horas, se cerrará automáticamente.',

  updated_at    timestamptz not null default now(),
  updated_by    text
);

comment on table ops_ticket_pipeline is
  'Configuración editable del pipeline de ops_tickets: stages, types, priorities, SLAs, mapeos semánticos. Singleton por workspace.';

-- Seed singleton (no-op si ya existe)
insert into ops_ticket_pipeline(workspace)
values ('global')
on conflict (workspace) do nothing;

-- ============================================================================
-- Tabla ops_tickets — sin CHECKs duros para permitir stages dinámicos
-- ============================================================================
create table if not exists ops_tickets (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references clients(id) on delete cascade,

  opened_by_email   text not null,
  opened_by_user_id uuid,
  opened_by_name    text,

  subject       text not null,
  description   text,

  -- Configurables — los valores válidos vienen de ops_ticket_pipeline
  type          text not null default 'operation',
  status        text not null default 'open',
  priority      text not null default 'mid',

  sla_due_at    timestamptz,
  sla_breached_at timestamptz,

  assigned_to_email text,
  assigned_to_name  text,

  done_marked_at    timestamptz,
  done_confirmed_at timestamptz,
  closed_at         timestamptz,
  last_message_at   timestamptz,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table ops_tickets is
  'Sistema operativo de tickets cliente -> Black Wolf. Pipeline editable vía ops_ticket_pipeline.';

create index if not exists idx_ops_tickets_client_id     on ops_tickets(client_id);
create index if not exists idx_ops_tickets_status        on ops_tickets(status);
create index if not exists idx_ops_tickets_priority      on ops_tickets(priority);
create index if not exists idx_ops_tickets_type          on ops_tickets(type);
create index if not exists idx_ops_tickets_assigned      on ops_tickets(assigned_to_email)
  where assigned_to_email is not null;
create index if not exists idx_ops_tickets_sla_due       on ops_tickets(sla_due_at);
create index if not exists idx_ops_tickets_done_marked   on ops_tickets(done_marked_at)
  where done_marked_at is not null;
create index if not exists idx_ops_tickets_last_message  on ops_tickets(last_message_at desc nulls last);
create index if not exists idx_ops_tickets_opened_by     on ops_tickets(opened_by_email);

-- ============================================================================
-- Tabla ops_ticket_messages
-- ============================================================================
create table if not exists ops_ticket_messages (
  id            uuid primary key default gen_random_uuid(),
  ticket_id     uuid not null references ops_tickets(id) on delete cascade,

  author_email  text not null,
  author_role   text not null
                check (author_role in ('client_user','blackwolf_staff','system')),
  author_name   text,

  body          text not null,
  attachments_json jsonb not null default '[]'::jsonb,

  read_by_recipient boolean not null default false,

  created_at    timestamptz not null default now()
);

create index if not exists idx_ops_ticket_messages_ticket
  on ops_ticket_messages(ticket_id, created_at desc);
create index if not exists idx_ops_ticket_messages_unread
  on ops_ticket_messages(ticket_id)
  where read_by_recipient = false;

-- ============================================================================
-- Tabla ops_ticket_events (audit log)
-- ============================================================================
create table if not exists ops_ticket_events (
  id            uuid primary key default gen_random_uuid(),
  ticket_id     uuid not null references ops_tickets(id) on delete cascade,
  actor_email   text,
  actor_role    text,
  event_type    text not null,
  from_value    text,
  to_value      text,
  metadata_json jsonb default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists idx_ops_ticket_events_ticket on ops_ticket_events(ticket_id, created_at desc);
create index if not exists idx_ops_ticket_events_type   on ops_ticket_events(event_type, created_at desc);

-- ============================================================================
-- Helper: lee config del pipeline (singleton)
-- ============================================================================
create or replace function ops_pipeline_get()
returns ops_ticket_pipeline
language sql
stable
as $$
  select * from ops_ticket_pipeline where workspace = 'global' limit 1;
$$;

create or replace function ops_pipeline_sla_hours(p_priority text)
returns integer
language plpgsql
stable
as $$
declare
  cfg ops_ticket_pipeline;
  hours int;
begin
  cfg := ops_pipeline_get();
  if cfg is null then return 24; end if;
  select (p->>'sla_hours')::int into hours
  from jsonb_array_elements(cfg.priorities) p
  where p->>'key' = p_priority
  limit 1;
  return coalesce(hours, 24);
end
$$;

-- ============================================================================
-- Trigger: calcular sla_due_at basado en config (insert + cambio de prioridad)
-- ============================================================================
create or replace function ops_tickets_compute_sla()
returns trigger
language plpgsql
as $$
declare
  hours int;
begin
  if tg_op = 'INSERT' then
    hours := ops_pipeline_sla_hours(new.priority);
    new.sla_due_at := new.created_at + (hours || ' hours')::interval;
  elsif tg_op = 'UPDATE' and new.priority is distinct from old.priority then
    hours := ops_pipeline_sla_hours(new.priority);
    new.sla_due_at := now() + (hours || ' hours')::interval;
  end if;
  return new;
end
$$;

drop trigger if exists trg_ops_tickets_sla on ops_tickets;
create trigger trg_ops_tickets_sla
  before insert or update on ops_tickets
  for each row execute function ops_tickets_compute_sla();

-- ============================================================================
-- Trigger: updated_at
-- ============================================================================
create or replace function ops_tickets_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

drop trigger if exists trg_ops_tickets_touch on ops_tickets;
create trigger trg_ops_tickets_touch
  before update on ops_tickets
  for each row execute function ops_tickets_touch_updated_at();

-- ============================================================================
-- Trigger: timestamps semánticos por transición de estado (lee mapeos del pipeline)
-- ============================================================================
create or replace function ops_tickets_status_timestamps()
returns trigger
language plpgsql
as $$
declare
  cfg ops_ticket_pipeline;
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    cfg := ops_pipeline_get();
    if cfg is not null then
      if new.status = cfg.done_stage_key and new.done_marked_at is null then
        new.done_marked_at := now();
      end if;
      if new.status = cfg.done_confirmed_stage_key and new.done_confirmed_at is null then
        new.done_confirmed_at := now();
      end if;
      if new.status = cfg.closed_stage_key and new.closed_at is null then
        new.closed_at := now();
      end if;
    end if;
  end if;
  return new;
end
$$;

drop trigger if exists trg_ops_tickets_status_ts on ops_tickets;
create trigger trg_ops_tickets_status_ts
  before update on ops_tickets
  for each row execute function ops_tickets_status_timestamps();

-- ============================================================================
-- Trigger: bump last_message_at del ticket al insertar mensaje
-- ============================================================================
create or replace function ops_ticket_messages_touch_ticket()
returns trigger
language plpgsql
as $$
begin
  update ops_tickets
    set last_message_at = new.created_at,
        updated_at      = now()
  where id = new.ticket_id;
  return new;
end
$$;

drop trigger if exists trg_ops_ticket_messages_touch on ops_ticket_messages;
create trigger trg_ops_ticket_messages_touch
  after insert on ops_ticket_messages
  for each row execute function ops_ticket_messages_touch_ticket();

-- ============================================================================
-- Trigger: audit log automático
-- ============================================================================
create or replace function ops_tickets_audit()
returns trigger
language plpgsql
as $$
declare
  cfg ops_ticket_pipeline;
begin
  if tg_op = 'INSERT' then
    insert into ops_ticket_events(ticket_id, actor_email, actor_role, event_type, to_value)
      values (new.id, new.opened_by_email, 'client_user', 'created', new.status);
    return new;
  end if;

  if tg_op = 'UPDATE' then
    cfg := ops_pipeline_get();

    if new.status is distinct from old.status then
      insert into ops_ticket_events(ticket_id, event_type, from_value, to_value)
        values (new.id, 'status_changed', old.status, new.status);

      if cfg is not null and new.status = cfg.done_stage_key then
        insert into ops_ticket_events(ticket_id, event_type, to_value)
          values (new.id, 'done_marked', new.assigned_to_email);
      elsif cfg is not null and new.status = cfg.done_confirmed_stage_key then
        insert into ops_ticket_events(ticket_id, event_type)
          values (new.id, 'done_confirmed');
      end if;
    end if;

    if new.priority is distinct from old.priority then
      insert into ops_ticket_events(ticket_id, event_type, from_value, to_value)
        values (new.id, 'priority_changed', old.priority, new.priority);
    end if;

    if new.assigned_to_email is distinct from old.assigned_to_email then
      if new.assigned_to_email is null then
        insert into ops_ticket_events(ticket_id, event_type, from_value)
          values (new.id, 'unassigned', old.assigned_to_email);
      else
        insert into ops_ticket_events(ticket_id, event_type, from_value, to_value)
          values (new.id, 'assigned', old.assigned_to_email, new.assigned_to_email);
      end if;
    end if;

    if new.sla_breached_at is distinct from old.sla_breached_at and new.sla_breached_at is not null then
      insert into ops_ticket_events(ticket_id, event_type, to_value)
        values (new.id, 'sla_breached', new.priority);
    end if;
  end if;

  return new;
end
$$;

drop trigger if exists trg_ops_tickets_audit on ops_tickets;
create trigger trg_ops_tickets_audit
  after insert or update on ops_tickets
  for each row execute function ops_tickets_audit();

-- ============================================================================
-- Trigger: insertar mensaje system al marcar como "done" (usa pipeline)
-- ============================================================================
create or replace function ops_tickets_done_system_message()
returns trigger
language plpgsql
as $$
declare
  cfg ops_ticket_pipeline;
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    cfg := ops_pipeline_get();
    if cfg is not null and new.status = cfg.done_stage_key then
      insert into ops_ticket_messages(ticket_id, author_email, author_role, body)
        values (new.id, 'system@blackwolf', 'system', cfg.done_prompt_message);
    end if;
  end if;
  return new;
end
$$;

drop trigger if exists trg_ops_tickets_done_msg on ops_tickets;
create trigger trg_ops_tickets_done_msg
  after update on ops_tickets
  for each row execute function ops_tickets_done_system_message();

-- ============================================================================
-- Vista de bandeja con is_overdue calculado on-the-fly
-- ============================================================================
create or replace view ops_tickets_inbox as
select
  t.id,
  t.client_id,
  c.slug          as client_slug,
  c.name          as client_name,
  t.subject,
  t.description,
  t.type,
  t.status,
  t.priority,
  t.opened_by_email,
  t.opened_by_name,
  t.assigned_to_email,
  t.assigned_to_name,
  t.sla_due_at,
  t.sla_breached_at,
  t.done_marked_at,
  t.done_confirmed_at,
  t.closed_at,
  t.last_message_at,
  t.created_at,
  t.updated_at,
  case
    when (select cfg.stages from ops_ticket_pipeline cfg where cfg.workspace='global') is null then false
    when t.status in (
      coalesce((select cfg.done_stage_key from ops_ticket_pipeline cfg where cfg.workspace='global'),'done'),
      coalesce((select cfg.done_confirmed_stage_key from ops_ticket_pipeline cfg where cfg.workspace='global'),'done_confirmed'),
      coalesce((select cfg.closed_stage_key from ops_ticket_pipeline cfg where cfg.workspace='global'),'closed'),
      coalesce((select cfg.cancelled_stage_key from ops_ticket_pipeline cfg where cfg.workspace='global'),'cancelled')
    ) then false
    when t.sla_due_at is null then false
    when t.sla_due_at < now() then true
    else false
  end as is_overdue,
  case
    when t.sla_due_at is null then null
    else extract(epoch from (t.sla_due_at - now()))::bigint
  end as sla_seconds_remaining,
  (
    select count(*) from ops_ticket_messages m
    where m.ticket_id = t.id and m.read_by_recipient = false and m.author_role = 'client_user'
  )::int as unread_for_staff,
  (
    select count(*) from ops_ticket_messages m
    where m.ticket_id = t.id and m.read_by_recipient = false and m.author_role in ('blackwolf_staff','system')
  )::int as unread_for_client,
  (
    select count(*) from ops_ticket_messages m where m.ticket_id = t.id
  )::int as message_count
from ops_tickets t
join clients c on c.id = t.client_id;

comment on view ops_tickets_inbox is
  'Vista agregada de ops_tickets. is_overdue calculado on-the-fly excluyendo stages terminales según el pipeline configurado.';

-- ============================================================================
-- RLS — service-role full access
-- ============================================================================
alter table ops_ticket_pipeline enable row level security;
alter table ops_tickets         enable row level security;
alter table ops_ticket_messages enable row level security;
alter table ops_ticket_events   enable row level security;

create policy "Service role full access on ops_ticket_pipeline"
  on ops_ticket_pipeline for all to service_role using (true) with check (true);
create policy "Service role full access on ops_tickets"
  on ops_tickets for all to service_role using (true) with check (true);
create policy "Service role full access on ops_ticket_messages"
  on ops_ticket_messages for all to service_role using (true) with check (true);
create policy "Service role full access on ops_ticket_events"
  on ops_ticket_events for all to service_role using (true) with check (true);
