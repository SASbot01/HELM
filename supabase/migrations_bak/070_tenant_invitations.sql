-- 048_tenant_invitations.sql
-- Invitaciones por email para incorporar usuarios a un tenant (PROP-002).
--
-- Contexto: hoy `addMember` (`src/utils/data.js:165`) inserta directo en
-- la tabla `team` con email + password, sin invitación, sin email
-- transaccional. Para que PROP-002 funcione (crear tenants y usuarios
-- desde la UI) hace falta un flujo de invitación: Black Wolf staff (o
-- el admin de un tenant) genera un token, se envía un email vía Resend
-- con un link, el invitado abre el link, define su contraseña y queda
-- creado en `team`.
--
-- Esta migración solo aporta la persistencia. El envío de email y el
-- flujo de aceptación se construyen en pasos posteriores.
--
-- Patrón de RLS: service role full access (consistente con el resto del
-- proyecto). La autorización fina la hace la aplicación.

create table if not exists tenant_invitations (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references clients(id) on delete cascade,

  -- Datos del invitado
  email         text not null,
  role          text not null default 'manager',   -- alineado con roles de `team`
  full_name     text,                              -- opcional, para personalizar el email

  -- Quién lo invita y desde dónde
  invited_by_email text not null,                  -- staff de Black Wolf o admin del tenant

  -- Token del link de invitación (debe ser largo y único)
  token         text not null unique,

  status        text not null default 'pending'
                check (status in ('pending','accepted','expired','revoked')),

  expires_at    timestamptz not null default (now() + interval '7 days'),
  accepted_at   timestamptz,
  revoked_at    timestamptz,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table tenant_invitations is
  'Invitaciones por email para incorporar usuarios a un tenant. PROP-002.';
comment on column tenant_invitations.token is
  'Token único del link de invitación. Debe generarse con suficiente entropía (UUID o random_bytes hex).';
comment on column tenant_invitations.role is
  'Rol con el que se creará la fila en `team` cuando se acepte la invitación. Alineado con los roles existentes (closer, manager, director, gestor, etc.).';

-- Solo puede haber una invitación pendiente activa por (cliente, email).
-- Evita spam y duplicados; cuando el status cambia a accepted/expired/revoked
-- la fila deja de bloquear nuevas invitaciones para el mismo email.
create unique index if not exists idx_tenant_invitations_one_pending_per_email
  on tenant_invitations(client_id, email)
  where status = 'pending';

create index if not exists idx_tenant_invitations_token
  on tenant_invitations(token);
create index if not exists idx_tenant_invitations_client_status
  on tenant_invitations(client_id, status);

-- Trigger: actualizar updated_at en cada UPDATE
create or replace function tenant_invitations_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end
$$;

drop trigger if exists trg_tenant_invitations_touch on tenant_invitations;
create trigger trg_tenant_invitations_touch
  before update on tenant_invitations
  for each row execute function tenant_invitations_touch_updated_at();

-- RLS — service role full access
alter table tenant_invitations enable row level security;

create policy "Service role full access on tenant_invitations"
  on tenant_invitations for all to service_role using (true) with check (true);
