-- 126 — Licencias de agencia (modelo «licencia anual + trae tu propia clave»).
--
-- Desde nov-2026 HELM deja de cobrar por uso (créditos) y pasa a una LICENCIA:
-- la agencia paga 97 €/año y ESO es todo lo que paga. La IA ya no la pone HELM;
-- cada agencia trae su propia clave de Claude (ver 127_clave_claude_agencia.sql).
--
-- Una licencia pertenece a una AGENCIA y tiene `vence_at`. Una agencia tiene
-- ACCESO si tiene una licencia canjeada cuyo `vence_at` está en el futuro (o es
-- nula = sin caducidad, las de cortesía). La vía normal es el pago de 97 € por
-- Stripe (api/creditos.js, action=licencia), que crea/renueva la licencia +1 año.
--
-- Códigos opcionales (cortesías manuales): la plataforma genera códigos
-- `HELM-XXXX-XXXX-XXXX` (api/plataforma.js, action=generar-licencias) que una
-- agencia canjea desde el panel. Por eso `code` es NULLABLE: las licencias
-- compradas por Stripe no llevan código.
--
-- `referencia` es única (el id de la sesión de Stripe o un canje): sirve para no
-- renovar dos veces con la vuelta del navegador y el webhook de Stripe.
--
-- Idempotente: se puede aplicar más de una vez sin riesgo.

create extension if not exists "pgcrypto";

create table if not exists licenses (
  id           uuid primary key default gen_random_uuid(),
  code         text,                                         -- null en las compradas por Stripe
  estado       text not null default 'disponible' check (estado in ('disponible', 'canjeada', 'anulada')),
  nota         text not null default '',
  created_by   text not null default '',
  created_at   timestamptz not null default now(),
  redeemed_by  text,
  agencia_id   uuid references agencias(id) on delete set null,
  redeemed_at  timestamptz,
  vence_at     timestamptz,                                  -- cuándo caduca el acceso (null = sin caducidad)
  referencia   text                                          -- id de sesión de Stripe o del canje; único
);

-- Por si la tabla ya existía de una versión anterior (PR #14): añadir lo nuevo.
alter table licenses add column if not exists vence_at   timestamptz;
alter table licenses add column if not exists referencia text;
alter table licenses alter column code drop not null;

-- Código único sin distinguir mayúsculas, solo donde hay código (las de Stripe
-- no llevan). Quien canjea puede teclearlo como sea; se generan en mayúsculas.
drop index if exists licenses_code_uidx;
create unique index if not exists licenses_code_uidx on licenses (upper(code)) where code is not null;
create unique index if not exists licenses_referencia_uidx on licenses (referencia) where referencia is not null;
create index if not exists licenses_estado_idx on licenses (estado);
create index if not exists licenses_agencia_idx on licenses (agencia_id);

alter table licenses enable row level security;
do $$
begin
  drop policy if exists licenses_all on licenses;
  create policy licenses_all on licenses for all using (true) with check (true);
end $$;

-- Los códigos activan licencias: no deben quedar a la vista del rol público. El
-- backend los lee con el cliente de SERVICIO (service_role, que se salta RLS y
-- grants), así que revocarlos a anon/authenticated no rompe nada. Defensa en
-- profundidad por si algún grant por defecto expusiera la tabla por PostgREST.
do $$
begin
  revoke all on licenses from anon;
  revoke all on licenses from authenticated;
exception when others then
  null;  -- el rol no existe en este entorno: nada que revocar
end $$;

-- ── Grandfather: que NINGUNA agencia existente se quede fuera ────────────────
-- Cada agencia que ya existe al activar las licencias recibe una licencia
-- canjeada con vencimiento muy lejano, para que sus logins sigan funcionando.
-- Idempotente (NOT EXISTS): aplicarlo otra vez no crea duplicados. Las agencias
-- de la casa (sin_cobro) además están exentas del control en el código, así que
-- Silvestre AI (slug silvestreai) nunca se bloquea: aquí igualmente se le pone
-- una licencia de cortesía.
insert into licenses (code, estado, nota, created_by, agencia_id, vence_at, redeemed_at)
select null, 'canjeada', 'Grandfather: agencia existente al activar el modelo de licencias', 'migracion-126',
       a.id, timestamptz '2099-12-31 00:00:00+00', now()
from agencias a
where not exists (
  select 1 from licenses l
  where l.agencia_id = a.id
    and l.estado = 'canjeada'
    and (l.vence_at is null or l.vence_at > now())
);
