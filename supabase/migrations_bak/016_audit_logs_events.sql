-- 016_audit_logs_events.sql
-- Observabilidad y trazabilidad para SaaS multi-tenant.
-- Aditiva: no modifica tablas existentes. Segura de ejecutar en caliente.

-- ============================================================================
-- audit_logs: quién hizo qué, cuándo, con qué datos. Soporte para GDPR, debugging,
-- compliance y trace forense. Escribe desde api/_lib/auth.js writeAudit().
-- ============================================================================
create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete set null,
  actor_id uuid,
  actor_email text,
  actor_type text default 'user' check (actor_type in ('user','superadmin','system','webhook','agent')),
  action text not null,
  resource_type text,
  resource_id text,
  old_values jsonb,
  new_values jsonb,
  ip_address inet,
  user_agent text,
  status_code int,
  error_message text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_client_created on audit_logs(client_id, created_at desc);
create index if not exists idx_audit_logs_actor on audit_logs(actor_id, created_at desc);
create index if not exists idx_audit_logs_resource on audit_logs(resource_type, resource_id);
create index if not exists idx_audit_logs_action on audit_logs(action, created_at desc);

-- ============================================================================
-- events: tracking analítico genérico (pageview, signup, trial_started, checkout,
-- churn, feature_used, etc). Permite calcular CAC, funnel, retention, LTV.
-- ============================================================================
create table if not exists events (
  id bigint generated always as identity primary key,
  client_id uuid references clients(id) on delete cascade,
  user_id uuid,
  session_id text,
  event_name text not null,
  event_category text,
  properties jsonb default '{}'::jsonb,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  referrer text,
  ip_address inet,
  user_agent text,
  country text,
  revenue_cents bigint,
  currency text default 'EUR',
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_events_client_time on events(client_id, occurred_at desc);
create index if not exists idx_events_name_time on events(event_name, occurred_at desc);
create index if not exists idx_events_user on events(user_id, occurred_at desc);
create index if not exists idx_events_session on events(session_id);
create index if not exists idx_events_utm_campaign on events(utm_campaign) where utm_campaign is not null;

-- Partition hint (no particionamos todavía; si events >10M filas, considerar BRIN o partitioning por mes)

-- ============================================================================
-- Vista útil: funnel básico últimos 30 días por client
-- ============================================================================
create or replace view events_funnel_30d as
select
  client_id,
  event_name,
  count(*)::int as total,
  count(distinct user_id)::int as unique_users,
  count(distinct session_id)::int as unique_sessions,
  sum(coalesce(revenue_cents, 0))::bigint as revenue_cents
from events
where occurred_at >= now() - interval '30 days'
group by client_id, event_name;

comment on table audit_logs is 'Trazabilidad de acciones: who/what/when/where. Escribir desde api/_lib/auth.js writeAudit()';
comment on table events is 'Eventos analíticos: signup, pageview, checkout, churn. Input para CAC/LTV/funnel';
comment on view events_funnel_30d is 'Funnel agregado últimos 30 días. Consumible por dashboard analytics';
