-- 125 — Licencia anual de la agencia + su propia clave de Claude.
--
-- Desde el 7-nov-2026 HELM no vende créditos ni cobra por el uso de la IA.
-- Cada agencia paga una LICENCIA (97 €/año, IVA incluido) y pone su IA: su
-- propia clave de API de Claude (Ajustes de la agencia) o su cuenta de Claude
-- por el conector MCP.
--
--   · licenses   → una fila por año pagado (o regalado por la plataforma). La
--                  agencia entra mientras tenga una activa sin caducar.
--   · agencia_ia → la clave de Claude de cada agencia (una por agencia).
--
-- La agencia de la casa (agencias.sin_cobro) no necesita licencia: lo decide
-- el código (api/_lib/licencia.js), no esta tabla. Las demás que ya existían
-- reciben un año de cortesía al aplicar esto (abajo).
--
-- La primera versión de esta migración (en esta misma rama, sin desplegar)
-- era de CÓDIGOS que se canjeaban al registrarse. Si llegó a aplicarse, esto
-- la convierte: los códigos se quedan anulados (no daban fecha de caducidad).
--
-- Idempotente: se puede aplicar más de una vez sin riesgo.

create extension if not exists "pgcrypto";

-- ── licenses ────────────────────────────────────────────────────────────────
create table if not exists licenses (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now()
);

alter table licenses add column if not exists agencia_id  uuid references agencias(id) on delete set null;
alter table licenses add column if not exists estado      text not null default 'activa';
-- stripe (pagada con tarjeta) | manual (la da la plataforma, sin cobro)
alter table licenses add column if not exists origen      text not null default 'stripe';
-- El id de la sesión de Stripe (cs_…): con él, un pago activa UNA licencia
-- aunque lleguen la vuelta del navegador y el webhook a la vez.
alter table licenses add column if not exists referencia  text;
alter table licenses add column if not exists importe_eur numeric(10,2) not null default 0;
alter table licenses add column if not exists empieza_at  timestamptz;
alter table licenses add column if not exists vence_at    timestamptz;
alter table licenses add column if not exists pagada_at   timestamptz;
alter table licenses add column if not exists email       text;
alter table licenses add column if not exists nota        text not null default '';
alter table licenses add column if not exists created_by  text not null default '';

-- De la versión de códigos: el código deja de ser obligatorio y lo que no
-- tenga fecha de caducidad no da acceso.
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'licenses' and column_name = 'code') then
    alter table licenses alter column code drop not null;
  end if;
end $$;

alter table licenses alter column estado set default 'activa';
alter table licenses drop constraint if exists licenses_estado_check;
update licenses set estado = 'anulada' where estado not in ('activa', 'anulada') or vence_at is null;
alter table licenses add constraint licenses_estado_check check (estado in ('activa', 'anulada'));
alter table licenses drop constraint if exists licenses_origen_check;
alter table licenses add constraint licenses_origen_check check (origen in ('stripe', 'manual'));

create unique index if not exists licenses_referencia_uidx on licenses (referencia) where referencia is not null;
create index if not exists licenses_agencia_vence_idx on licenses (agencia_id, vence_at desc);

-- Solo el servidor (service_role). La versión de códigos dejaba una regla
-- «todo vale»: fuera.
alter table licenses enable row level security;
drop policy if exists licenses_all on licenses;
revoke all on licenses from anon, authenticated;

-- Activa (o amplía) la licencia de una agencia. Todo en una transacción, con la
-- agencia bloqueada: dos avisos del mismo pago, o dos pagos casi a la vez, no
-- se pisan.
--   · Con `p_referencia` (el id de la sesión de Stripe), si ya hay una licencia
--     con ella se devuelve esa y no se crea otra (nueva = false).
--   · Empieza al pagar o, si aún le queda licencia, cuando acabe la que tiene:
--     renovar antes de tiempo no hace perder días.
-- Devuelve { id, empieza_at, vence_at, nueva }.
create or replace function activar_licencia(
  p_agencia    uuid,
  p_referencia text,
  p_importe    numeric,
  p_pagada     timestamptz,
  p_meses      int,
  p_origen     text,
  p_email      text default null,
  p_nota       text default '',
  p_created_by text default ''
) returns jsonb
language plpgsql
as $$
declare
  v_ya     licenses%rowtype;
  v_inicio timestamptz;
  v_nueva  licenses%rowtype;
begin
  perform 1 from agencias where id = p_agencia for update;
  if not found then
    raise exception 'La agencia % no existe', p_agencia;
  end if;

  if p_referencia is not null then
    select * into v_ya from licenses where referencia = p_referencia;
    if found then
      return jsonb_build_object('id', v_ya.id, 'empieza_at', v_ya.empieza_at, 'vence_at', v_ya.vence_at, 'nueva', false);
    end if;
  end if;

  select greatest(coalesce(max(vence_at), p_pagada), p_pagada) into v_inicio
  from licenses where agencia_id = p_agencia and estado = 'activa';

  insert into licenses (agencia_id, estado, origen, referencia, importe_eur, empieza_at, vence_at, pagada_at, email, nota, created_by)
  values (p_agencia, 'activa', p_origen, p_referencia, coalesce(p_importe, 0), v_inicio,
          v_inicio + make_interval(months => greatest(1, coalesce(p_meses, 12))), p_pagada,
          p_email, coalesce(p_nota, ''), coalesce(p_created_by, ''))
  returning * into v_nueva;

  return jsonb_build_object('id', v_nueva.id, 'empieza_at', v_nueva.empieza_at, 'vence_at', v_nueva.vence_at, 'nueva', true);
end $$;

revoke execute on function activar_licencia from public, anon, authenticated;

-- ── Un año de cortesía para las agencias que ya existían ───────────────────
-- Decisión de Alex (8-nov-2026): las agencias dadas de alta antes de la
-- licencia (todas menos la de la casa, que no la necesita) reciben un año
-- gratis desde que se aplica esta migración, sin cobro (origen 'manual').
-- Solo la PRIMERA vez que se aplica: si ya hay alguna de cortesía, no se da
-- otra (así, volver a aplicar la migración no regala un año a las agencias
-- que se registren después). Cada una lleva su referencia: cortesia-2026:<id>.
do $$
begin
  if not exists (select 1 from licenses where referencia like 'cortesia-2026:%') then
    insert into licenses (agencia_id, estado, origen, referencia, importe_eur, empieza_at, vence_at, nota, created_by)
    select a.id, 'activa', 'manual', 'cortesia-2026:' || a.id, 0, now(), now() + interval '12 months',
           'Año de cortesía: agencia anterior a la licencia', 'migración 125'
    from agencias a
    where not a.sin_cobro;
  end if;
end $$;

-- ── agencia_ia: la clave de Claude de cada agencia ─────────────────────────
-- Como la de cada perfil (user_integrations, service 'anthropic'): nunca sale
-- del servidor; el navegador solo ve los cuatro últimos caracteres.
create table if not exists agencia_ia (
  agencia_id   uuid primary key references agencias(id) on delete cascade,
  api_key      text not null,
  model        text,
  last4        text not null default '',
  updated_by   text not null default '',
  updated_at   timestamptz not null default now()
);

alter table agencia_ia enable row level security;
revoke all on agencia_ia from anon, authenticated;
