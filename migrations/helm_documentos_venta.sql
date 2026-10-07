-- HELM — presupuestos y facturas del despacho a sus clientes.
--
-- Lo que pidió Alejandro copiando el primer módulo de Sage Active
-- ("Gestiona tus presupuestos y facturas"): crear un presupuesto, convertirlo
-- en factura, con líneas, descuentos, documento con el logo del despacho y
-- envío por email.
--
-- AVISO importante, para que quede escrito y nadie lo dé por hecho: esto NO es
-- facturación VeriFactu. VeriFactu exige hash encadenado entre facturas, firma
-- electrónica y QR — eso es la tarea aparte (migrations pendiente,
-- helm_verifactu.sql). Esta tabla numera correlativo normal, sin el
-- encadenado. Presentarla como conforme sería mentir al despacho.
create extension if not exists "pgcrypto";

create table if not exists helm_documentos_venta (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references clients(id) on delete cascade,
  -- Al cliente del CRM si existe, pero no depende de él: un presupuesto se
  -- puede hacer a alguien que todavía no está dado de alta.
  contact_id   uuid references crm_contacts(id) on delete set null,

  tipo         text not null check (tipo in ('presupuesto', 'factura')),
  -- Correlativo por tipo y año: PRE-2026-0001, FAC-2026-0001. Empieza en 1
  -- cada año porque es como se lee un número de factura en España.
  numero       text not null,

  -- Snapshot del cliente en el momento del documento. Si el contacto cambia de
  -- nombre o se borra despues, la factura ya emitida no debe cambiar con él.
  cliente_nombre    text not null,
  cliente_nif       text not null default '',
  cliente_direccion text not null default '',
  cliente_email     text not null default '',

  fecha        date not null default current_date,
  -- A qué presupuesto pertenece esta factura, si nació de una conversión.
  presupuesto_origen_id uuid references helm_documentos_venta(id) on delete set null,

  -- [{concepto, cantidad, precio, descuento_pct}]. El subtotal/iva/total se
  -- recalculan en el cliente y se guardan ya resueltos: una factura emitida no
  -- debe recalcularse sola si cambia el % de IVA general el año que viene.
  lineas       jsonb not null default '[]'::jsonb,
  subtotal     numeric not null default 0,
  iva_pct      numeric not null default 21,
  iva          numeric not null default 0,
  total        numeric not null default 0,

  estado       text not null default 'borrador'
               check (estado in ('borrador', 'enviado', 'pagado', 'vencido', 'anulado')),
  notas        text not null default '',
  enviado_at   timestamptz,
  pagado_at    timestamptz,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  unique (client_id, tipo, numero)
);
create index if not exists helm_docventa_client_idx on helm_documentos_venta (client_id, fecha desc);
create index if not exists helm_docventa_contact_idx on helm_documentos_venta (contact_id);
create index if not exists helm_docventa_estado_idx on helm_documentos_venta (client_id, tipo, estado);

alter table helm_documentos_venta enable row level security;
drop policy if exists helm_documentos_venta_all on helm_documentos_venta;
create policy helm_documentos_venta_all on helm_documentos_venta for all using (true) with check (true);
