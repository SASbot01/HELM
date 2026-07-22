-- 060_apex_state.sql
-- Generic per-tenant key/value store for the apex-operations shell.
--
-- The shell renders ~30 admin-surface collections (fulfillment projects,
-- AI agents, workflows, documents, UTM links, web library, finance
-- commission overrides, …). Building a normalized schema for every one
-- of those — with the read paths, foreign keys, triggers and RLS that
-- entails — would balloon the migration count to no real benefit; the
-- collections are admin-only, read by one user at a time, mutate
-- infrequently and never feed external queries.
--
-- One JSONB blob per (tenant, namespace) gives us:
--   • cheap hydration: 1 row per surface, server-side filter by client_id
--   • cheap persistence: upsert on the composite PK
--   • zero schema migrations as the in-app shape evolves
--
-- Trade-offs we accept here: no row-level audit, no server-side filtering
-- inside a payload, every save rewrites the full payload (fine for the
-- few-hundred-item ceilings these surfaces hit).
--
-- Sales / installment_plans / reports / opex / team / crm_tasks / bookings
-- / projections continue to live in their dedicated tables — they have
-- external readers (Donna, dashboard-ops, supabase functions). Only the
-- shell-private state lands here.

create table if not exists apex_state (
  client_id  uuid        not null,
  namespace  text        not null,
  payload    jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (client_id, namespace)
);

create index if not exists apex_state_client_idx on apex_state (client_id);

-- Touch updated_at on every change so callers can detect staleness.
create or replace function apex_state_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists apex_state_touch_trg on apex_state;
create trigger apex_state_touch_trg
  before update on apex_state
  for each row execute function apex_state_touch();

-- RLS: the shell's only writer today is the Creator Founder tenant; we
-- enable RLS but leave the policies permissive for service_role + anon
-- (the shell hits this with the anon key from the browser, scoped by
-- the explicit `eq('client_id', ...)` filter in `lib/apexState.js`).
alter table apex_state enable row level security;

drop policy if exists apex_state_select on apex_state;
create policy apex_state_select on apex_state
  for select using (true);

drop policy if exists apex_state_insert on apex_state;
create policy apex_state_insert on apex_state
  for insert with check (true);

drop policy if exists apex_state_update on apex_state;
create policy apex_state_update on apex_state
  for update using (true) with check (true);

drop policy if exists apex_state_delete on apex_state;
create policy apex_state_delete on apex_state
  for delete using (true);

comment on table apex_state is
  'apex-operations shell: per-tenant JSONB store for admin-surface state '
  '(fulfillment / tools / marketing / finance-config). One row per '
  '(client_id, namespace). See src/pages/apex-operations/lib/apexState.js.';
