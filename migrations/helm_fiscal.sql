-- HELM — el vertical de asesorías: ficha fiscal y control de plazos.
--
-- Es lo que ningún Excel resuelve bien y por lo que un despacho cambia de
-- sistema: con cientos de clientes, saber quién tiene el 303 sin presentar a
-- tres días del 20 no cabe en una hoja de cálculo.
--
-- Dos tablas y un orden que importa:
--
--   helm_fiscal_perfil       qué modelos le tocan a cada cliente
--   helm_fiscal_obligaciones cada vencimiento concreto, con su estado
--
-- La ficha va PRIMERO porque los plazos dependen del régimen: un autónomo en
-- módulos presenta el 131 y uno en estimación directa el 130; uno con IVA
-- mensual presenta doce veces al año y otro cuatro. Sin saber el régimen no se
-- puede generar el calendario de nadie.

create extension if not exists "pgcrypto";

-- ── La ficha fiscal del cliente ────────────────────────────────────────────
-- Cuelga de crm_contacts y no de una tabla de clientes propia: para el despacho,
-- su cliente ES un contacto del CRM, con su pipeline y su histórico. Duplicarlo
-- obligaría a mantener dos fichas de la misma persona.
create table if not exists helm_fiscal_perfil (
  contact_id      uuid primary key references crm_contacts(id) on delete cascade,
  client_id       uuid not null references clients(id) on delete cascade,

  nif             text,
  forma_juridica  text,            -- autonomo | sl | sa | cb | otra
  epigrafe        text,            -- IAE
  -- Qué obligaciones tiene. De aquí sale su calendario y de ningún otro sitio.
  iva             text not null default 'trimestral'
                  check (iva in ('trimestral', 'mensual', 'exento')),
  irpf            text not null default 'no'
                  check (irpf in ('no', 'directa', 'modulos')),   -- 130 / 131
  retenciones     boolean not null default false,                 -- 111
  alquileres      boolean not null default false,                 -- 115
  sociedades      boolean not null default false,                 -- 200 y 202
  intracomunitarias boolean not null default false,               -- 349

  asesor_id       uuid references helm_team(id) on delete set null,
  notas           text not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists helm_fiscal_perfil_client_idx on helm_fiscal_perfil (client_id);
create index if not exists helm_fiscal_perfil_asesor_idx on helm_fiscal_perfil (asesor_id);

-- ── Cada vencimiento ───────────────────────────────────────────────────────
-- Una fila por cliente, modelo y periodo. Se generan desde el panel a partir de
-- las fichas, y a partir de ahí cada una tiene vida propia: su estado, quién la
-- presentó y cuándo.
create table if not exists helm_fiscal_obligaciones (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references clients(id) on delete cascade,
  contact_id    uuid not null references crm_contacts(id) on delete cascade,

  modelo        text not null,                  -- '303', '130', '111'…
  periodo       text not null,                  -- '2026T1', '2026-03', '2026'
  fecha_limite  date not null,

  -- pendiente_docs → el cliente aún no ha mandado lo suyo
  -- en_proceso     → el asesor lo está preparando
  -- presentado     → hecho
  -- fuera_plazo    → pasó la fecha sin presentar
  estado        text not null default 'pendiente_docs'
                check (estado in ('pendiente_docs', 'en_proceso', 'presentado', 'fuera_plazo')),
  presentado_at timestamptz,
  presentado_por text,
  notas         text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- Que no se pueda generar dos veces el mismo vencimiento del mismo cliente:
  -- con cientos de clientes, un duplicado silencioso descuadra el recuento del
  -- director y hace perder la confianza en el panel entero.
  unique (contact_id, modelo, periodo)
);
create index if not exists helm_fiscal_obl_client_idx on helm_fiscal_obligaciones (client_id, fecha_limite);
create index if not exists helm_fiscal_obl_estado_idx on helm_fiscal_obligaciones (client_id, estado);

-- ── RLS ────────────────────────────────────────────────────────────────────
-- Mismo patrón que el resto de HELM: allow-all, el acceso lo controla la app,
-- que entra con la anon key.
alter table helm_fiscal_perfil       enable row level security;
alter table helm_fiscal_obligaciones enable row level security;

do $$
declare t text;
begin
  foreach t in array array['helm_fiscal_perfil', 'helm_fiscal_obligaciones'] loop
    execute format('drop policy if exists %1$s_all on %1$s', t);
    execute format('create policy %1$s_all on %1$s for all using (true) with check (true)', t);
  end loop;
end $$;
