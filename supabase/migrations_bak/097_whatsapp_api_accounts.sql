-- 097_whatsapp_api_accounts.sql
-- Integración NUEVA y PARALELA: WhatsApp API oficial (Meta Cloud API), modelo
-- BYOC (bring-your-own-credentials) multi-tenant. Cada cliente pega SUS propias
-- credenciales de su cuenta de Meta y desde ahí envía/recibe desde su número.
--
-- NO sustituye ni toca la integración por QR (whatsapp-web.js / Setter /
-- whatsapp_config). Coexiste con ella.
--
-- Una fila por número conectado (phone_number_id) por tenant.

create table if not exists public.whatsapp_api_accounts (
  id                    uuid primary key default gen_random_uuid(),
  client_id             uuid not null references public.clients(id) on delete cascade,
  phone_number_id       text not null,
  waba_id               text,
  display_phone_number  text,
  verified_name         text,
  -- access_token: token del cliente (system user / long-lived) que usamos para
  -- enviar mensajes via Graph API. Se guarda como las otras integraciones del
  -- repo (token en texto, protegido por service-role + RLS; el patrón actual
  -- de user_integrations guarda los secrets así). Si en el futuro se añade una
  -- capa de cifrado at-rest, aplicarla aquí y en user_integrations a la vez.
  access_token          text not null,
  business_id           text,
  status                text not null default 'pending'
                          check (status in ('pending','connected','error')),
  webhook_verified      boolean not null default false,
  last_verified_at      timestamptz,
  last_error            text,
  created_by            uuid,           -- team.id del operador que conectó (best-effort)
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  -- Un mismo phone_number_id no debe estar conectado dos veces en el mismo tenant.
  unique (client_id, phone_number_id)
);

-- Lookup inverso por phone_number_id en el webhook de recepción (fase 2):
-- Meta envía metadata.phone_number_id y necesitamos resolver el tenant rápido.
create index if not exists idx_wa_api_accounts_phone_number_id
  on public.whatsapp_api_accounts (phone_number_id);

create index if not exists idx_wa_api_accounts_client
  on public.whatsapp_api_accounts (client_id);

-- updated_at trigger (mismo patrón que el resto del schema)
create or replace function public.set_updated_at_whatsapp_api_accounts()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_wa_api_accounts_updated_at on public.whatsapp_api_accounts;
create trigger trg_wa_api_accounts_updated_at
  before update on public.whatsapp_api_accounts
  for each row execute function public.set_updated_at_whatsapp_api_accounts();

-- ── RLS ───────────────────────────────────────────────────────────────────
-- El frontend usa anon key + auth custom (tabla team); los endpoints /api/*
-- usan SUPABASE_SERVICE_KEY (service_role, bypassa RLS). Habilitamos RLS y
-- dejamos las policies como el resto de tablas sensibles del repo: el acceso
-- real se gatea en los endpoints via validateIdentity (clientSlug + memberId).
-- service_role siempre puede; anon NO puede leer tokens directamente.
alter table public.whatsapp_api_accounts enable row level security;

-- service_role: acceso total (los endpoints server-side operan con él).
drop policy if exists wa_api_accounts_service_all on public.whatsapp_api_accounts;
create policy wa_api_accounts_service_all
  on public.whatsapp_api_accounts
  for all
  to service_role
  using (true)
  with check (true);

-- anon/authenticated: SIN acceso directo (los tokens nunca se exponen al
-- browser; el frontend pasa siempre por /api/integrations/whatsapp-api/*).
-- No creamos policy permisiva para anon a propósito.
