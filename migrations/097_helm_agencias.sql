-- HELM — agencias y créditos.
--
-- HELM deja de ser la herramienta con la que UNA agencia (Silvestre AI) opera a
-- sus clientes y pasa a ser la de cualquiera que se registre. Por encima de los
-- perfiles (clients) aparece un nivel más:
--
--   plataforma (Alejandro) → agencia → sus perfiles
--
-- Los "superadmins" de siempre pasan a ser los administradores de UNA agencia:
-- ven y gestionan todos los perfiles de la suya y ninguno de las demás. Quien
-- tiene `plataforma` ve todas (es quien cuida del sistema).
--
-- Se paga por uso, sin suscripción: la agencia compra créditos por adelantado y
-- cada llamada a Claude que hace HELM con su clave se descuenta al doble de lo
-- que nos cuesta. `saldo` va en euros; 1 € = 100 créditos es solo cómo se enseña.
--
-- Idempotente: se puede volver a pasar sin romper nada.

create table if not exists agencias (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  slug text unique,
  saldo numeric(12,4) not null default 0,
  -- La agencia de la casa no paga su propio consumo.
  sin_cobro boolean not null default false,
  created_at timestamptz not null default now()
);

-- Libro de movimientos: cada recarga suma, cada consumo resta. El saldo de
-- `agencias` es la suma de esto, guardada para no recalcularla en cada llamada.
create table if not exists agencia_movimientos (
  id bigserial primary key,
  agencia_id uuid not null references agencias(id) on delete cascade,
  client_id uuid references clients(id) on delete set null,
  tipo text not null check (tipo in ('recarga', 'consumo', 'regalo', 'ajuste')),
  importe numeric(12,4) not null,
  -- panel | mcp | auto | stripe | manual
  origen text,
  modelo text,
  tokens_in integer,
  tokens_out integer,
  coste_usd numeric(12,6),
  -- El id de la sesión de pago de Stripe: el mismo pago nunca se suma dos veces.
  referencia text unique,
  created_at timestamptz not null default now()
);
create index if not exists agencia_movimientos_agencia_idx on agencia_movimientos (agencia_id, created_at desc);

alter table clients add column if not exists agencia_id uuid references agencias(id);
create index if not exists clients_agencia_idx on clients (agencia_id);
alter table superadmins add column if not exists agencia_id uuid references agencias(id);
alter table superadmins add column if not exists plataforma boolean not null default false;

-- El enlace del conector MCP puede ser de un perfil (como hasta ahora) o de la
-- agencia entera.
alter table agent_mcp_tokens add column if not exists agencia_id uuid references agencias(id) on delete cascade;
alter table agent_mcp_tokens alter column client_id drop not null;

-- Mueve saldo y apunta el movimiento en la misma transacción. Devuelve el saldo
-- que queda. Con `referencia` repetida no hace nada y devuelve null: así un
-- webhook de Stripe que llega dos veces no regala créditos.
create or replace function mover_saldo(
  p_agencia uuid, p_importe numeric, p_tipo text, p_origen text default null,
  p_client uuid default null, p_modelo text default null, p_tokens_in integer default null,
  p_tokens_out integer default null, p_coste_usd numeric default null, p_referencia text default null
) returns numeric language plpgsql as $$
declare v_saldo numeric;
begin
  insert into agencia_movimientos (agencia_id, client_id, tipo, importe, origen, modelo, tokens_in, tokens_out, coste_usd, referencia)
  values (p_agencia, p_client, p_tipo, p_importe, p_origen, p_modelo, p_tokens_in, p_tokens_out, p_coste_usd, p_referencia)
  on conflict (referencia) do nothing;
  if not found then return null; end if;
  update agencias set saldo = saldo + p_importe where id = p_agencia returning saldo into v_saldo;
  return v_saldo;
end $$;

-- Solo el servidor (service_role) toca esto. Ni la clave pública ni sesiones
-- de Supabase.
alter table agencias enable row level security;
alter table agencia_movimientos enable row level security;
revoke all on agencias, agencia_movimientos from anon, authenticated;
revoke all on sequence agencia_movimientos_id_seq from anon, authenticated;
revoke execute on function mover_saldo from public, anon, authenticated;

-- ── La agencia de la casa ────────────────────────────────────────────────
-- Todo lo que existe hoy es de Silvestre AI, y Alejandro es la plataforma.
insert into agencias (nombre, slug, sin_cobro)
values ('Silvestre AI', 'silvestreai', true)
on conflict (slug) do nothing;

update clients set agencia_id = (select id from agencias where slug = 'silvestreai')
where agencia_id is null;
update superadmins set agencia_id = (select id from agencias where slug = 'silvestreai')
where agencia_id is null;
update superadmins set plataforma = true where email = 'alejandro.cto@blackwolfsec.io';

-- No se pone NOT NULL a propósito: un perfil sin agencia solo lo ve la
-- plataforma, que es lo seguro si algo lo crea por un camino viejo.
