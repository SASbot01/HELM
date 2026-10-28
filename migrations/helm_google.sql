-- HELM — Google (Calendar + Drive) y el calendario de Llamadas.
--
-- La conexión con Google es POR PERFIL y vive en `user_integrations`
-- (service='google'), igual que Stripe y WooCommerce: el refresh token nunca
-- llega al navegador porque esa tabla tiene RLS que niega al rol anónimo.
--
-- Esta migración solo crea la tabla de llamadas: lo que HELM guarda de cada
-- evento de Google Calendar que parece una llamada, más lo que se añade encima
-- (estado, contacto del CRM, notas del resultado). Los eventos se refrescan;
-- lo que escribe el usuario, no se pisa nunca.

create extension if not exists "pgcrypto";

create table if not exists helm_calls (
  id                 uuid primary key default gen_random_uuid(),
  client_id          uuid not null references clients(id) on delete cascade,

  -- Origen en Google. null cuando la llamada se ha creado a mano en HELM.
  google_event_id    text,
  google_calendar_id text,
  html_link          text,               -- abrir el evento en Google Calendar

  title              text not null,
  starts_at          timestamptz not null,
  ends_at            timestamptz,
  all_day            boolean not null default false,

  attendees          jsonb not null default '[]'::jsonb,  -- [{email,name,status}]
  organizer_email    text,
  location           text,
  meet_url           text,               -- Meet, Zoom… el enlace de la videollamada
  description        text,

  -- Lo que pone el usuario encima del evento. La sincronización NO lo toca.
  status             text not null default 'agendada',    -- agendada | hecha | no_show | cancelada
  outcome            text,               -- qué pasó en la llamada
  contact_id         uuid references crm_contacts(id) on delete set null,
  assignee_id        uuid,               -- helm_team.id (sin FK: la tabla llega en otra migración)

  source             text not null default 'google',      -- google | manual
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists helm_calls_client_idx on helm_calls (client_id, starts_at);
create index if not exists helm_calls_contact_idx on helm_calls (contact_id);

-- Un evento de Google entra una sola vez por perfil: es la clave con la que la
-- sincronización decide entre insertar y actualizar. Parcial porque las
-- llamadas manuales no tienen google_event_id y varias no pueden chocar.
create unique index if not exists helm_calls_google_uq
  on helm_calls (client_id, google_event_id)
  where google_event_id is not null;

alter table helm_calls enable row level security;
drop policy if exists helm_calls_all on helm_calls;
create policy helm_calls_all on helm_calls for all using (true) with check (true);
