-- HELM — la columna vertebral: servicio → cliente → venta → finanzas → equipo.
--
-- Hasta ahora cada sección vivía aislada: el CRM no sabía qué servicio tiene
-- contratado un lead, una venta no se podía enlazar ni con el servicio ni con
-- el contacto del pipeline, y una comisión en Finanzas era una línea de texto
-- sin decir a quién se le pagó ni por qué clientes.
--
-- Esta migración crea las dos piezas que faltaban (catálogo de SERVICIOS y
-- directorio de EQUIPO) y añade a las tablas existentes las claves que las
-- enlazan. Todo con IF NOT EXISTS: se puede ejecutar dos veces sin romper nada.
--
-- Aplicar en Supabase → SQL Editor.

begin;

create extension if not exists "pgcrypto";

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) SERVICIOS — el catálogo de la consultoría
-- ═══════════════════════════════════════════════════════════════════════════
-- Es el requisito previo de todo lo demás: sin catálogo no se puede filtrar el
-- pipeline por servicio ni autocompletar el precio al registrar una venta.
--
-- `responsables` y `recursos` van en jsonb en vez de en tablas aparte porque
-- son listas cortas que solo se leen junto al servicio; una tabla puente aquí
-- solo añadiría joins sin aportar nada.
create table if not exists helm_services (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references clients(id) on delete cascade,
  name          text not null,
  format        text not null default '',        -- 1a1, grupal, mentoría, done-for-you…
  description   text not null default '',
  price         numeric(12,2) not null default 0,
  currency      text not null default 'EUR',
  billing       text not null default 'unico',   -- unico | mensual | trimestral | anual
  duration_days integer,                          -- temporalidad del servicio (null = indefinido)
  responsables  jsonb not null default '[]'::jsonb,  -- [{ id, name, role }]
  recursos      jsonb not null default '[]'::jsonb,  -- [{ label, url }]
  color         text not null default '',
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists helm_services_client_idx on helm_services (client_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) EQUIPO Y PERFILES — las personas del negocio
-- ═══════════════════════════════════════════════════════════════════════════
-- Tabla nueva y NO una ampliación de `team`: `team` es la tabla de LOGIN
-- (email + contraseña + permisos). Aquí van personas que pueden no tener
-- acceso al panel (un closer externo, un editor freelance) y datos que no
-- pintan en una tabla de autenticación: cómo se le paga y su contrato.
--
-- `login_id` enlaza opcionalmente con team para quien sí entra al sistema.
create table if not exists helm_team (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references clients(id) on delete cascade,
  login_id       uuid references team(id) on delete set null,
  name           text not null,
  role           text not null default 'closer',  -- ver ROLES en src/helm/equipo/roles.js
  email          text not null default '',
  phone          text not null default '',
  whatsapp       text not null default '',
  country        text not null default '',
  -- Información de pago: a dónde y cómo pagarle.
  pay_method     text not null default '',        -- transferencia, PayPal, Wise, cripto…
  pay_account    text not null default '',        -- IBAN, correo de PayPal, wallet…
  pay_terms      text not null default '',        -- "mensual día 1", "por venta cerrada"…
  commission_pct numeric(6,3) not null default 0, -- % de comisión sobre lo que cierra
  fixed_fee      numeric(12,2) not null default 0,-- fijo mensual, si lo hay
  -- Contrato de colaboración adjunto al perfil.
  contract_url   text not null default '',
  contract_note  text not null default '',
  started_on     date,
  notes          text not null default '',
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists helm_team_client_idx on helm_team (client_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) VENTAS — enlace con servicio, contacto y equipo + pago fraccionado
-- ═══════════════════════════════════════════════════════════════════════════
-- El informe tiene que poder decir en qué punto está el cobro cuando no es
-- pago único: cuántas cuotas hay, cuántas se han cobrado y entre qué fechas
-- corre el plan. Antes solo existía `installment_number` como texto libre.
alter table sales
  add column if not exists service_id          uuid references helm_services(id) on delete set null,
  add column if not exists contact_id          uuid references crm_contacts(id) on delete set null,
  add column if not exists csm                 text default '',
  add column if not exists service_start       date,
  add column if not exists service_end         date,
  add column if not exists installments_total  integer,   -- nº total de cuotas (null = pago único)
  add column if not exists installments_paid   integer not null default 0,
  add column if not exists installment_amount  numeric(12,2),
  add column if not exists plan_start          date,      -- inicio del plan de pago
  add column if not exists plan_end            date;      -- fin previsto del plan

create index if not exists sales_service_idx on sales (service_id);
create index if not exists sales_contact_idx on sales (contact_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- 4) CRM — servicio contratado y subetapas
-- ═══════════════════════════════════════════════════════════════════════════
-- Subetapa = el "¿para cuándo es este seguimiento?" dentro de una columna del
-- pipeline. Es multivalor (jsonb) porque un lead puede estar en más de una:
-- "1 mes" y "esperando presupuesto" a la vez.
alter table crm_contacts
  add column if not exists service_id  uuid references helm_services(id) on delete set null,
  add column if not exists substages   jsonb not null default '[]'::jsonb;

create index if not exists crm_contacts_service_idx on crm_contacts (service_id);

-- Etapas del pipeline editables por perfil. `crm_pipelines` ya existe y guarda
-- `stages` como jsonb; solo le falta poder colgar subetapas de cada etapa.
alter table crm_pipelines
  add column if not exists substages jsonb not null default '{}'::jsonb;  -- { stageKey: [{key,label}] }

-- ═══════════════════════════════════════════════════════════════════════════
-- 5) FINANZAS — rol, persona y clientes de cada movimiento
-- ═══════════════════════════════════════════════════════════════════════════
-- "Comisión → closer Juan → por Pepito, Fulano y Mengano" tiene que ser
-- consultable y filtrable, no texto suelto en la descripción.
alter table ceo_finance_entries
  add column if not exists person_id   uuid references helm_team(id) on delete set null,
  add column if not exists person_name text not null default '',  -- copia, para que sobreviva a la baja de la persona
  add column if not exists person_role  text not null default '',
  add column if not exists contact_ids jsonb not null default '[]'::jsonb,  -- clientes que generan el movimiento
  add column if not exists service_id  uuid references helm_services(id) on delete set null;

create index if not exists finance_person_idx on ceo_finance_entries (person_id);

-- La tabla venía de la plataforma antigua con las categorías cerradas
-- ('operativo','equipo','marketing',…), pero HELM guarda 'Ingreso',
-- 'Gasto fijo', 'Gasto puntual' y 'Comisión'. Con el CHECK viejo puesto, todo
-- alta de movimiento falla. Se retira: la clasificación la valida la app.
alter table ceo_finance_entries
  drop constraint if exists ceo_finance_entries_category_check;

-- `description` era NOT NULL sin default y la app permite dejarla vacía.
alter table ceo_finance_entries
  alter column description set default '';

-- ═══════════════════════════════════════════════════════════════════════════
-- 6) ACTIVIDAD — quién hizo cada cosa, con su rol
-- ═══════════════════════════════════════════════════════════════════════════
-- `performed_by` ya existía como texto. Falta el rol para poder escribir
-- "El closer Juan añadió una nota".
alter table crm_activities
  add column if not exists performed_by_role text not null default '',
  add column if not exists performed_by_id   uuid references helm_team(id) on delete set null;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7) DIARIO — métricas por rol
-- ═══════════════════════════════════════════════════════════════════════════
-- El diario deja de pedir lo mismo a todo el mundo: cada rol reporta su propio
-- embudo. Faltaban cuatro métricas y sobraba el CHECK del rol, que solo
-- admitía setter/closer/cold_caller y bloqueaba dar de alta a un CSM o al
-- propio dueño.
alter table reports
  add column if not exists qualified                integer not null default 0,
  add column if not exists lost                     integer not null default 0,
  add column if not exists effective_conversations  integer not null default 0,
  add column if not exists doubts_solved            integer not null default 0,
  add column if not exists person_id                uuid references helm_team(id) on delete set null;

alter table reports drop constraint if exists reports_role_check;

-- ═══════════════════════════════════════════════════════════════════════════
-- RLS — mismo patrón que el resto de HELM: allow-all, el control de acceso
-- real lo hace la app, que entra con la anon key.
-- ═══════════════════════════════════════════════════════════════════════════
alter table helm_services enable row level security;
alter table helm_team     enable row level security;

do $$
begin
  drop policy if exists helm_services_all on helm_services;
  create policy helm_services_all on helm_services for all using (true) with check (true);

  drop policy if exists helm_team_all on helm_team;
  create policy helm_team_all on helm_team for all using (true) with check (true);
end $$;

commit;
