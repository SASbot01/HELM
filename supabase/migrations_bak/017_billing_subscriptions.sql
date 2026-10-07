-- 017_billing_subscriptions.sql
-- Schema de facturación recurrente SaaS. Desbloquea MRR, churn, LTV.
-- Aditiva: solo añade columnas/tablas. No rompe ningún flujo existente.

-- ============================================================================
-- Añadir metadata Stripe a products (nullable para compat)
-- ============================================================================
alter table products
  add column if not exists stripe_price_id text,
  add column if not exists stripe_product_id text,
  add column if not exists currency text default 'EUR',
  add column if not exists billing_interval text check (billing_interval in ('one_time','month','year','week','quarter')),
  add column if not exists trial_days int default 0,
  add column if not exists tax_category text,
  add column if not exists metadata jsonb default '{}'::jsonb;

create index if not exists idx_products_stripe_price on products(stripe_price_id) where stripe_price_id is not null;

-- ============================================================================
-- subscription_plans: catálogo global de planes (Starter, Growth, Scale, Enterprise)
-- Se puede mapear a varios products Stripe (monthly/annual).
-- ============================================================================
create table if not exists subscription_plans (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text,
  price_monthly_cents bigint,
  price_annual_cents bigint,
  currency text default 'EUR',
  stripe_product_id text,
  stripe_price_monthly_id text,
  stripe_price_annual_id text,
  features jsonb default '[]'::jsonb,
  limits jsonb default '{}'::jsonb,
  trial_days int default 14,
  active boolean default true,
  sort_order int default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Seed de planes inicial (alineado con BIBLIA.md: 497-997€/mes + add-ons)
insert into subscription_plans (slug, name, description, price_monthly_cents, price_annual_cents, features, limits, sort_order)
values
  ('starter',   'Starter',   'CRM básico + 1 agente IA',      49700,  497000,  '["CRM","1 agente IA","Hasta 500 contactos","Soporte email"]'::jsonb,   '{"contacts": 500, "agents": 1, "users": 3}'::jsonb, 1),
  ('growth',    'Growth',    'CRM + Marketing + 3 agentes',    79700,  797000,  '["CRM","Email Marketing","3 agentes IA","Hasta 5k contactos","Calendly","Soporte prioritario"]'::jsonb,   '{"contacts": 5000, "agents": 3, "users": 10}'::jsonb, 2),
  ('scale',     'Scale',     'Todo + ERP + integraciones',     99700,  997000,  '["Todo Growth","ERP","Manufacturing","Integraciones custom","White-label","Slack support"]'::jsonb, '{"contacts": 50000, "agents": 10, "users": 50}'::jsonb, 3),
  ('enterprise','Enterprise','SLA + dedicado',                 null,   null,    '["Todo Scale","SLA 99.9%","Account Manager dedicado","Custom agents","On-premise opcional"]'::jsonb, '{"contacts": -1, "agents": -1, "users": -1}'::jsonb, 4)
on conflict (slug) do nothing;

-- ============================================================================
-- subscriptions: una suscripción activa por cliente (puede haber histórico)
-- ============================================================================
create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  plan_id uuid references subscription_plans(id),
  stripe_subscription_id text unique,
  stripe_customer_id text,
  status text not null default 'trialing' check (status in (
    'trialing','active','past_due','paused','canceled','incomplete','incomplete_expired','unpaid'
  )),
  billing_interval text check (billing_interval in ('month','year','week','quarter')),
  mrr_cents bigint default 0,
  arr_cents bigint default 0,
  currency text default 'EUR',
  trial_start timestamptz,
  trial_end timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at timestamptz,
  canceled_at timestamptz,
  ended_at timestamptz,
  cancel_reason text,
  churned_at timestamptz,
  upgrade_from_plan_id uuid references subscription_plans(id),
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_subscriptions_client on subscriptions(client_id);
create index if not exists idx_subscriptions_status on subscriptions(status) where status in ('trialing','active','past_due');
create index if not exists idx_subscriptions_stripe on subscriptions(stripe_subscription_id) where stripe_subscription_id is not null;
create index if not exists idx_subscriptions_churned on subscriptions(churned_at) where churned_at is not null;

-- ============================================================================
-- invoices: facturas emitidas (snapshot de Stripe + faltas de pago)
-- ============================================================================
create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  subscription_id uuid references subscriptions(id) on delete set null,
  stripe_invoice_id text unique,
  stripe_charge_id text,
  stripe_payment_intent_id text,
  invoice_number text,
  status text not null default 'draft' check (status in (
    'draft','open','paid','uncollectible','void','failed'
  )),
  amount_total_cents bigint not null default 0,
  amount_paid_cents bigint default 0,
  amount_refunded_cents bigint default 0,
  tax_cents bigint default 0,
  currency text default 'EUR',
  due_at timestamptz,
  paid_at timestamptz,
  pdf_url text,
  hosted_invoice_url text,
  period_start timestamptz,
  period_end timestamptz,
  line_items jsonb default '[]'::jsonb,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_invoices_client on invoices(client_id, created_at desc);
create index if not exists idx_invoices_subscription on invoices(subscription_id);
create index if not exists idx_invoices_status on invoices(status) where status in ('open','failed','uncollectible');
create index if not exists idx_invoices_stripe on invoices(stripe_invoice_id) where stripe_invoice_id is not null;

-- ============================================================================
-- Trigger updated_at (si no existe ya una función genérica)
-- ============================================================================
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_subscriptions_updated on subscriptions;
create trigger trg_subscriptions_updated before update on subscriptions
  for each row execute function set_updated_at();

drop trigger if exists trg_invoices_updated on invoices;
create trigger trg_invoices_updated before update on invoices
  for each row execute function set_updated_at();

drop trigger if exists trg_plans_updated on subscription_plans;
create trigger trg_plans_updated before update on subscription_plans
  for each row execute function set_updated_at();

-- ============================================================================
-- Vista MRR por cliente activo (alimenta dashboard CEO)
-- ============================================================================
create or replace view mrr_by_client as
select
  c.id as client_id,
  c.slug,
  c.name,
  s.plan_id,
  p.name as plan_name,
  s.status,
  s.mrr_cents,
  s.current_period_end,
  s.trial_end,
  s.churned_at
from clients c
left join subscriptions s on s.client_id = c.id and s.status in ('trialing','active','past_due')
left join subscription_plans p on p.id = s.plan_id;

comment on table subscription_plans is 'Catálogo global de planes SaaS (Starter/Growth/Scale/Enterprise). Mapear a Stripe prices antes de activar checkout';
comment on table subscriptions is 'Suscripción activa por cliente. Sincronizar desde webhook Stripe customer.subscription.*';
comment on table invoices is 'Facturas emitidas. Sincronizar desde webhook Stripe invoice.*';
comment on view mrr_by_client is 'MRR por cliente con suscripción activa. Consumible por CEO dashboard';
