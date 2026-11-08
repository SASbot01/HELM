-- 125 — HELM pasa de CRÉDITOS a LICENCIA anual + trae-tu-clave.
--
-- Hasta ahora la agencia compraba créditos y HELM le descontaba lo que gastaba
-- su IA (agencias.saldo, agencia_movimientos, mover_saldo: 097). Desde aquí:
--
--   · La agencia paga una LICENCIA: 97 € al año (IVA incluido), por Stripe
--     Checkout desde api/creditos.js (la misma cuenta y el mismo webhook que
--     los créditos). Sin licencia vigente, la agencia no entra (api/_lib/
--     auth.js + api/_lib/licencia.js). La de la casa (sin_cobro) no la
--     necesita.
--   · La IA la pone cada agencia: su PROPIA clave de Claude (y su token de
--     Replicate para las imágenes de Portadas), en agencia_claves. HELM no
--     cobra por uso.
--
-- `licenses` es el libro de licencias: una fila por cada periodo pagado (o
-- concedido a mano, o de cortesía). La agencia tiene licencia vigente si
-- alguna de sus filas vence después de ahora. Un pago se apunta UNA vez: la
-- `referencia` (el id de la sesión de Stripe) es única, y el webhook y la
-- vuelta del navegador pueden llegar los dos sin sumar dos años.
--
-- Renovar antes de que venza NO pierde días: el periodo nuevo empieza cuando
-- acaba el vigente (extender_licencia), no el día del pago.
--
-- Nota sobre la versión anterior de este archivo (PR #14, códigos HELM-XXXX
-- que se canjeaban al registrarse): ese modelo se retira. Si esa tabla llegó
-- a crearse en alguna base, se renombra a licenses_codigos_antiguos (no se
-- borra nada) y se crea la nueva.
--
-- Al pasar esta migración, las agencias que YA existen (menos la de la casa)
-- reciben un año de licencia de cortesía (origen 'migracion').
--
-- OJO al desplegar: pásala ANTES de subir el código. El código nuevo lee
-- `licenses` y `agencia_claves` en cada petición del panel; sin ellas, el
-- panel deja pasar a todo el mundo (falla abierto, con el error en el log)
-- pero el pago de la licencia y los ajustes de claves dan 500.
--
-- Idempotente: se puede volver a pasar sin romper nada.

begin;

create extension if not exists "pgcrypto";

-- La versión de códigos (PR #14), si existiera: se aparta sin borrar.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'licenses' and column_name = 'code'
  ) then
    alter table licenses rename to licenses_codigos_antiguos;
  end if;
end $$;

create table if not exists licenses (
  id          uuid primary key default gen_random_uuid(),
  agencia_id  uuid not null references agencias(id) on delete cascade,
  -- El periodo que cubre esta fila. Vigente si vence_at > now().
  inicio_at   timestamptz not null default now(),
  vence_at    timestamptz not null,
  -- stripe (pagada) | manual (la concede la plataforma) | migracion (cortesía al pasar de créditos)
  origen      text not null check (origen in ('stripe', 'manual', 'migracion')),
  -- stripe: el id de la sesión de Checkout. Único: el mismo pago no suma dos veces.
  referencia  text unique,
  -- Lo cobrado, IVA incluido (null si no se cobró).
  euros       numeric(10,2),
  nota        text not null default '',
  created_by  text not null default '',
  created_at  timestamptz not null default now()
);
create index if not exists licenses_agencia_vence_idx on licenses (agencia_id, vence_at desc);

-- Las claves de IA de cada agencia (trae-tu-clave). En tabla aparte y no en
-- `agencias`: así ninguna consulta de agencias se las lleva por descuido.
create table if not exists agencia_claves (
  agencia_id       uuid primary key references agencias(id) on delete cascade,
  anthropic_key    text,
  anthropic_model  text,
  replicate_token  text,
  updated_by       text not null default '',
  updated_at       timestamptz not null default now()
);

-- Alarga la licencia de una agencia `p_meses` desde que acabe la vigente (o
-- desde ahora, si no tiene). Devuelve el nuevo vencimiento, o null si esa
-- `p_referencia` ya estaba apuntada (un webhook repetido). La fila de la
-- agencia se bloquea mientras tanto: dos pagos a la vez no empiezan los dos en
-- el mismo día.
create or replace function extender_licencia(
  p_agencia uuid, p_meses integer, p_origen text, p_referencia text default null,
  p_euros numeric default null, p_nota text default '', p_por text default ''
) returns timestamptz language plpgsql as $$
declare
  v_inicio timestamptz;
  v_vence  timestamptz;
begin
  if p_meses is null or p_meses < 1 or p_meses > 60 then
    raise exception 'meses fuera de rango: %', p_meses;
  end if;
  perform 1 from agencias where id = p_agencia for update;
  if not found then
    raise exception 'la agencia % no existe', p_agencia;
  end if;
  if p_referencia is not null and exists (select 1 from licenses where referencia = p_referencia) then
    return null;
  end if;
  select greatest(now(), coalesce(max(vence_at), now())) into v_inicio
    from licenses where agencia_id = p_agencia;
  v_vence := v_inicio + make_interval(months => p_meses);
  insert into licenses (agencia_id, inicio_at, vence_at, origen, referencia, euros, nota, created_by)
  values (p_agencia, v_inicio, v_vence, p_origen, p_referencia, p_euros, coalesce(p_nota, ''), coalesce(p_por, ''))
  on conflict (referencia) do nothing;
  if not found then return null; end if;
  return v_vence;
end $$;

-- Cortesía: un año a cada agencia que ya existe (menos la de la casa). Con la
-- referencia fija, volver a pasar la migración no regala otro año.
insert into licenses (agencia_id, inicio_at, vence_at, origen, referencia, nota, created_by)
select a.id, now(), now() + interval '1 year', 'migracion', 'migracion-licencias:' || a.id,
       'Cortesía al pasar de créditos a licencia anual', 'migracion 125'
from agencias a
where not a.sin_cobro
on conflict (referencia) do nothing;

-- Solo el servidor (service_role). Ni la clave pública ni sesiones de Supabase.
alter table licenses enable row level security;
alter table agencia_claves enable row level security;
revoke all on licenses, agencia_claves from anon, authenticated;
revoke execute on function extender_licencia from public, anon, authenticated;

commit;

notify pgrst, 'reload schema';
