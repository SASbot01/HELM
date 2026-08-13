-- HELM — Prospección: negocios por zona y tipo, de Google Maps al pipeline.
--
-- El trabajo que esto sustituye es real y es horrible: abrir Google Maps,
-- buscar "peluquerías en Valencia", ir abriendo fichas una a una y copiar
-- nombre y teléfono a mano en el CRM. Media mañana para cincuenta contactos, y
-- a la semana siguiente no te acuerdas de a cuáles ya habías escrito.
--
-- POR QUÉ NO SE RASPA GOOGLE MAPS: raspar el HTML va contra los términos de
-- Google y se rompe cada vez que cambian el maquetado, que es a menudo. Esto
-- usa la Places API oficial, que devuelve exactamente lo mismo (nombre,
-- dirección, teléfono, web, valoración) de forma estable. Cada perfil pone su
-- propia clave, porque las búsquedas se facturan a quien las hace.
--
-- Dos tablas y una idea: lo que Google devuelve NO entra directo al CRM. Se
-- queda aquí, se revisa, y solo lo que se elige pasa a ser un contacto. Volcar
-- 200 negocios sin mirar en el pipeline de alguien es la forma más rápida de
-- inutilizarle el CRM.
--
-- Idempotente.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) LAS BÚSQUEDAS
-- ═══════════════════════════════════════════════════════════════════════════
-- Se guardan aunque los resultados ya estén en la otra tabla: son el histórico
-- de por dónde se ha pasado. Sin esto, dentro de un mes nadie sabe si la zona
-- de Alicante ya se trabajó o está por hacer, y se paga dos veces la misma
-- búsqueda.
create table if not exists helm_prospect_searches (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references clients(id) on delete cascade,
  zona          text not null default '',      -- "Valencia", "Chamberí, Madrid"
  tipo          text not null default '',      -- "peluquería", "clínica dental"
  consulta      text not null default '',      -- lo que se le mandó a Google, tal cual
  encontrados   integer not null default 0,
  nuevos        integer not null default 0,    -- de esos, cuántos no se conocían
  lanzada_por   text not null default '',      -- email de quien la lanzó
  created_at    timestamptz not null default now()
);

create index if not exists helm_prospect_searches_client_idx
  on helm_prospect_searches (client_id, created_at desc);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) LOS NEGOCIOS ENCONTRADOS
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists helm_prospects (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references clients(id) on delete cascade,
  search_id     uuid references helm_prospect_searches(id) on delete set null,
  -- El identificador de Google. Es lo que evita que la misma peluquería
  -- aparezca tres veces por salir en tres búsquedas distintas.
  place_id      text not null,
  nombre        text not null default '',
  direccion     text not null default '',
  telefono      text not null default '',
  web           text not null default '',
  categoria     text not null default '',      -- lo que Google llama al negocio
  rating        numeric(2,1),
  resenas       integer,
  maps_url      text not null default '',
  lat           numeric(9,6),
  lng           numeric(9,6),
  -- nuevo → recién traído, sin decidir.
  -- importado → ya es un contacto del CRM (contact_id apunta a él).
  -- descartado → mirado y no interesa; se queda para no volver a ofrecerlo.
  estado        text not null default 'nuevo'
                  check (estado in ('nuevo', 'importado', 'descartado')),
  contact_id    uuid references crm_contacts(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- El mismo negocio, una sola vez por perfil. Va por perfil y no global porque
-- dos negocios distintos pueden estar prospectando la misma zona, y lo que uno
-- descarte no tiene por qué desaparecerle al otro.
create unique index if not exists helm_prospects_place_idx
  on helm_prospects (client_id, place_id);

create index if not exists helm_prospects_estado_idx
  on helm_prospects (client_id, estado, created_at desc);

comment on table helm_prospects is
  'Negocios traídos de la Places API de Google. Zona de espera antes del CRM: '
  'solo pasan a crm_contacts los que alguien elige.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) RLS
-- ═══════════════════════════════════════════════════════════════════════════
alter table helm_prospect_searches enable row level security;
alter table helm_prospects         enable row level security;

do $$
begin
  drop policy if exists helm_prospect_searches_all on helm_prospect_searches;
  create policy helm_prospect_searches_all on helm_prospect_searches for all using (true) with check (true);

  drop policy if exists helm_prospects_all on helm_prospects;
  create policy helm_prospects_all on helm_prospects for all using (true) with check (true);
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4) DE DÓNDE VINO EL CONTACTO
-- ═══════════════════════════════════════════════════════════════════════════
-- El contacto importado guarda su place_id para que, si alguien lo borra del
-- CRM y vuelve a buscar la zona, se sepa que ya pasó por aquí. Va en
-- custom_fields (que ya existe) y no en una columna nueva: es un dato de un
-- solo origen y no merece ensanchar la tabla del CRM.
comment on column crm_contacts.custom_fields is
  'Datos sueltos según de dónde venga el contacto. Prospección de Maps guarda '
  'aquí { place_id, maps_url, rating, resenas, categoria }.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 5) ENRIQUECIMIENTO DESDE LA WEB DEL NEGOCIO
-- ═══════════════════════════════════════════════════════════════════════════
-- Google Maps NO tiene el nombre del dueño. No es que no lo demos: no existe
-- ese campo en la Places API ni en la ficha de Maps. Lo que sí existe es la web
-- del negocio, que Maps sí devuelve, y ahí está casi todo lo demás.
--
-- Y en España está además el aviso legal, que la LSSI (art. 10) obliga a
-- publicar con el titular y el CIF. Es información que el negocio publica a
-- propósito y por ley: leerla es lo mismo que entrar en su web.
--
-- Lo que se saca y de dónde:
--   email      → mailto: y texto de las páginas de contacto
--   telefonos  → los de la web, que suelen ser mejores que el de Maps
--   redes      → enlaces a Instagram / Facebook / LinkedIn
--   cif        → aviso legal
--   titular    → aviso legal ("titular", "responsable", "denominación social")
--
-- `titular` NO se llama `ceo` a propósito: es quien figura como responsable del
-- sitio web, que en un autónomo es el dueño y en una SL es la sociedad. Llamarlo
-- CEO sería vender un dato que no es.
alter table helm_prospects
  add column if not exists email          text not null default '',
  add column if not exists telefonos_web  jsonb not null default '[]'::jsonb,
  add column if not exists instagram      text not null default '',
  add column if not exists facebook       text not null default '',
  add column if not exists linkedin       text not null default '',
  add column if not exists cif            text not null default '',
  add column if not exists titular        text not null default '',
  add column if not exists horario        jsonb not null default '[]'::jsonb,
  -- Lo que devuelva Places de más (tipos, rango de precio, resumen) sin tener
  -- que añadir una columna cada vez que Google amplíe la ficha.
  add column if not exists extra          jsonb not null default '{}'::jsonb,
  -- Null = no se ha intentado. Con fecha = ya se miró, aunque no se encontrara
  -- nada: así no se vuelve a pedir la misma web una y otra vez.
  add column if not exists enriquecido_en timestamptz;

comment on column helm_prospects.titular is
  'Quien figura como responsable en el aviso legal de su web. En un autónomo es '
  'el dueño; en una sociedad, la razón social. No es "el CEO": ese dato no está '
  'ni en Google Maps ni en el aviso legal.';
