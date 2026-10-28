-- HELM — gastos y facturas de compra del despacho (Sage Active módulo 2:
-- "Captura inteligente de facturas de compras").
--
-- El archivo original SIEMPRE se guarda junto al dato extraído: el texto OCR
-- y los campos que sugirió la IA son un borrador para revisar, no la verdad.
-- Un despacho no puede permitirse que un 14B se invente un IVA.
create extension if not exists "pgcrypto";

create table if not exists helm_gastos (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null references clients(id) on delete cascade,

  proveedor_nombre  text not null default '',
  proveedor_nif     text not null default '',
  fecha             date not null default current_date,
  concepto          text not null default '',
  categoria         text not null default 'otros',

  base              numeric not null default 0,
  iva_pct           numeric not null default 21,
  iva               numeric not null default 0,
  total             numeric not null default 0,

  -- El justificante, siempre. Sin archivo no hay gasto deducible que valga.
  archivo_url       text not null default '',
  archivo_ruta      text not null default '',

  -- Lo que leyó el OCR, tal cual, para poder volver a mirarlo si el campo
  -- extraído no cuadra. Vacío cuando el gasto se dio de alta a mano.
  texto_ocr         text not null default '',
  origen            text not null default 'manual' check (origen in ('manual', 'ocr')),
  -- 'pendiente' = recién extraído por IA, nadie lo ha mirado todavía.
  estado            text not null default 'pendiente' check (estado in ('pendiente', 'revisado')),

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists helm_gastos_client_idx on helm_gastos (client_id, fecha desc);
create index if not exists helm_gastos_estado_idx on helm_gastos (client_id, estado);

alter table helm_gastos enable row level security;
drop policy if exists helm_gastos_all on helm_gastos;
create policy helm_gastos_all on helm_gastos for all using (true) with check (true);
