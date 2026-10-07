-- 036 — user_integrations hardening: aislamiento per-user + índices + RLS

-- UNIQUE: un mismo member solo puede tener 1 row por (service, account_index)
-- Esto previene duplicados y asegura que cada integración es única por usuario/account
do $$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname='public' and indexname='user_integrations_member_service_acc_key'
  ) then
    create unique index user_integrations_member_service_acc_key
      on user_integrations (client_id, member_id, service, account_index);
  end if;
end $$;

-- Índice para listado rápido por usuario
create index if not exists user_integrations_member_idx
  on user_integrations (client_id, member_id);

-- Índice para listado por servicio
create index if not exists user_integrations_service_idx
  on user_integrations (client_id, service, enabled);

-- updated_at trigger
drop trigger if exists trg_user_integrations_updated on user_integrations;
create trigger trg_user_integrations_updated before update on user_integrations
  for each row execute function set_updated_at();

-- FKs si no existen (cleanup: member_id → team, client_id → clients)
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where table_name='user_integrations' and constraint_name='user_integrations_client_id_fkey'
  ) then
    alter table user_integrations add constraint user_integrations_client_id_fkey
      foreign key (client_id) references clients(id) on delete cascade;
  end if;
  if not exists (
    select 1 from information_schema.table_constraints
    where table_name='user_integrations' and constraint_name='user_integrations_member_id_fkey'
  ) then
    alter table user_integrations add constraint user_integrations_member_id_fkey
      foreign key (member_id) references team(id) on delete cascade;
  end if;
end $$;

-- RLS: service_role bypass (backend API). anon sin acceso.
-- authenticated: solo sus propias filas (via JWT claim member_id).
-- Esto es FASE C — por ahora ponemos service_role bypass + anon deny,
-- dejamos authenticated policy comentada para cuando haya auth JWT real.
alter table user_integrations enable row level security;

drop policy if exists srv_all on user_integrations;
create policy srv_all on user_integrations for all to service_role
  using (true) with check (true);

drop policy if exists anon_deny on user_integrations;
create policy anon_deny on user_integrations for all to anon
  using (false) with check (false);

-- Vista: integraciones del usuario con metadata del servicio
create or replace view user_integrations_enriched as
select
  ui.id,
  ui.client_id,
  ui.member_id,
  t.name as member_name,
  t.email as member_email,
  t.role as member_role,
  ui.service,
  ui.account_index,
  ui.account_label,
  ui.enabled,
  case when ui.config is null then false else true end as has_config,
  ui.created_at,
  ui.updated_at
from user_integrations ui
join team t on t.id = ui.member_id;

-- Seed: catalog de servicios soportados (si tabla no existe, la creamos)
create table if not exists integration_services (
  key text primary key,
  name text not null,
  category text not null,  -- email, messaging, marketing, calendar, crm, voice, ads
  icon text,               -- emoji o nombre icon lucide
  color text,              -- hex accent color
  auth_type text not null, -- apikey | oauth | qr | webhook
  description text,
  fields jsonb,            -- [{key, label, type, required, placeholder}]
  test_endpoint text,      -- endpoint interno para validar config
  sort_order int default 100,
  active boolean default true
);

insert into integration_services (key, name, category, icon, color, auth_type, description, fields, sort_order) values
  ('resend',         'Resend',            'email',     '✉️', '#000000', 'apikey', 'Envía emails desde tu cuenta personal',
    jsonb_build_array(
      jsonb_build_object('key','apiKey',   'label','API key',         'type','password', 'required', true, 'placeholder','re_...'),
      jsonb_build_object('key','fromEmail','label','Email de envío',  'type','email',    'required', true, 'placeholder','tu@dominio.com'),
      jsonb_build_object('key','fromName', 'label','Nombre remitente','type','text',     'required', false,'placeholder','Tu nombre')
    ), 10),

  ('manychat',       'ManyChat',          'messaging', '💬', '#0084FF', 'apikey', 'WhatsApp / Instagram vía ManyChat',
    jsonb_build_array(
      jsonb_build_object('key','apiKey','label','API key','type','password','required',true,'placeholder','123456:...')
    ), 20),

  ('whatsapp_qr',    'WhatsApp Web (QR)', 'messaging', '📱', '#25D366', 'qr',     'Sesión propia vía web.whatsapp.com',
    jsonb_build_array(
      jsonb_build_object('key','phone','label','Número asociado','type','tel','required',false,'placeholder','+34 600 000 000')
    ), 21),

  ('meta_ads',       'Meta Ads',          'marketing', '📣', '#1877F2', 'apikey', 'Gestiona tus campañas Meta desde tu cuenta',
    jsonb_build_array(
      jsonb_build_object('key','accessToken','label','Access token','type','password','required',true,'placeholder','EAA...'),
      jsonb_build_object('key','adAccountId','label','Ad account ID','type','text','required',true,'placeholder','act_123...')
    ), 30),

  ('calendly',       'Calendly',          'calendar',  '📅', '#006BFF', 'apikey', 'Agenda personal — compartir URL y recibir bookings',
    jsonb_build_array(
      jsonb_build_object('key','apiKey','label','Personal token','type','password','required',false,'placeholder','eyJ...'),
      jsonb_build_object('key','url',   'label','URL pública',   'type','url',     'required',true, 'placeholder','https://calendly.com/tu-nombre')
    ), 40),

  ('google_calendar','Google Calendar',   'calendar',  '📆', '#4285F4', 'oauth',  'Conecta tu Google Calendar (disponibilidad + eventos)',
    jsonb_build_array(), 50),

  ('gmail',          'Gmail',             'email',     '📧', '#EA4335', 'oauth',  'Envía emails desde tu Gmail personal',
    jsonb_build_array(), 60),

  ('elevenlabs',     'ElevenLabs',        'voice',     '🎙️', '#000000', 'apikey', 'Tu voz sintetizada para notas WhatsApp',
    jsonb_build_array(
      jsonb_build_object('key','apiKey', 'label','API key',      'type','password','required',true,'placeholder','sk_...'),
      jsonb_build_object('key','voiceId','label','Voice ID',     'type','text',    'required',false,'placeholder','OEtd...')
    ), 70)
on conflict (key) do update set
  name = excluded.name, category = excluded.category, icon = excluded.icon,
  color = excluded.color, auth_type = excluded.auth_type, description = excluded.description,
  fields = excluded.fields, sort_order = excluded.sort_order;

-- RLS: integration_services es catálogo público
alter table integration_services enable row level security;
drop policy if exists services_read on integration_services;
create policy services_read on integration_services for select to anon, authenticated using (active = true);
drop policy if exists services_srv on integration_services;
create policy services_srv on integration_services for all to service_role using (true) with check (true);

-- Verificación
select service, count(*) from user_integrations group by service order by 1;
select key, name, category, auth_type from integration_services order by sort_order;
