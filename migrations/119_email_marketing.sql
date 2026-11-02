-- 119 — Email marketing: campañas de correo al CRM por Resend (2-nov-2026).
--
-- Cada perfil manda con SU cuenta de Resend. La clave (y el secreto de firma
-- del webhook) viven en user_integrations con service='resend', como la de
-- Anthropic o el token de Calendly: el navegador nunca los ve, solo los cuatro
-- últimos caracteres. Aquí, lo demás:
--
--   · helm_email_ajustes        → remitente, responder a, y la empresa y su
--                                 dirección postal para el pie legal (LSSI).
--                                 `dominios`: lo que dijo Resend la última vez.
--   · helm_email_campanas       → cada campaña: audiencia (un pipeline y, si
--                                 se quiere, unas etapas), cuándo empieza y en
--                                 qué horas se manda. Al lanzarla se congela:
--                                 `remitente` es la foto de los ajustes y ya no
--                                 se edita (se duplica como borrador).
--   · helm_email_mensajes       → la secuencia: 1..10 correos, cada uno con su
--                                 espera en días tras el anterior.
--   · helm_email_destinatarios  → la audiencia, tal y como era al lanzar (una
--                                 fila por correo en minúsculas), y por qué
--                                 mensaje va cada uno y cuándo le toca.
--   · helm_email_envios         → UNA fila por (campaña, mensaje, persona): el
--                                 índice único es lo que impide mandar dos
--                                 veces lo mismo aunque el worker se caiga a
--                                 mitad. `lote` es la Idempotency-Key con la que
--                                 se pidió a Resend.
--   · helm_email_bajas          → quién no quiere más correos de este perfil
--                                 (o rebotó, o lo marcó como spam). Nunca se le
--                                 manda nada. Una por perfil y correo.
--   · helm_email_resumen*       → las cuentas para el panel (vistas).
--
-- Los topes de tamaño son los de api/_lib/email/ (TOPES), con margen.
-- Solo el servidor las toca: RLS activado sin políticas, sin permisos para el
-- navegador y en SECRETAS (api/_lib/pasarela.js). Idempotente.

begin;

create table if not exists helm_email_ajustes (
  client_id uuid primary key references clients(id) on delete cascade,
  remitente_nombre text check (char_length(remitente_nombre) <= 120),
  remitente_email text check (remitente_email is null or (char_length(remitente_email) <= 254 and remitente_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),
  responder_a text check (responder_a is null or (char_length(responder_a) <= 254 and responder_a ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),
  empresa text check (char_length(empresa) <= 200),
  direccion text check (char_length(direccion) <= 400),
  -- [{ nombre, estado }] de GET /domains, la última vez que se comprobó.
  dominios jsonb not null default '[]'::jsonb check (jsonb_typeof(dominios) = 'array' and pg_column_size(dominios) <= 32768),
  comprobado_en timestamptz,
  updated_at timestamptz not null default now(),
  updated_por text check (char_length(updated_por) <= 200)
);

create table if not exists helm_email_campanas (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  nombre text not null check (char_length(nombre) between 1 and 120),
  -- borrador → (lanzar) preparando → activa ⇄ pausada → terminada.
  -- 'preparando' = copiando la audiencia; si se corta, se puede volver a lanzar.
  estado text not null default 'borrador' check (estado in ('borrador', 'preparando', 'activa', 'pausada', 'terminada')),
  -- { pipelineId: uuid | null, etapas: [clave] }
  audiencia jsonb not null default '{}'::jsonb check (jsonb_typeof(audiencia) = 'object' and pg_column_size(audiencia) <= 8192),
  -- Programada: no se manda nada antes. Vacío = al lanzar.
  inicio_en timestamptz,
  -- Horas de Madrid en las que se manda, [desde, hasta). Vacío = a cualquier hora.
  ventana_desde smallint check (ventana_desde between 0 and 23),
  ventana_hasta smallint check (ventana_hasta between 1 and 24),
  -- La foto de helm_email_ajustes al lanzar (y al reanudar).
  remitente jsonb check (remitente is null or (jsonb_typeof(remitente) = 'object' and pg_column_size(remitente) <= 8192)),
  total integer not null default 0 check (total between 0 and 5000),
  -- Lo último que salió mal (la clave, el dominio, el cupo de Resend…).
  error text check (char_length(error) <= 1000),
  creada_por text check (char_length(creada_por) <= 200),
  lanzada_por text check (char_length(lanzada_por) <= 200),
  lanzada_en timestamptz,
  pausada_en timestamptz,
  terminada_en timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((ventana_desde is null) = (ventana_hasta is null)),
  check (ventana_desde is null or ventana_desde < ventana_hasta)
);
create index if not exists helm_email_campanas_perfil on helm_email_campanas (client_id, created_at desc);
-- Para el worker, que cada minuto mira las activas de todos los perfiles.
create index if not exists helm_email_campanas_activas on helm_email_campanas (estado) where estado = 'activa';

create table if not exists helm_email_mensajes (
  id uuid primary key default gen_random_uuid(),
  campana_id uuid not null references helm_email_campanas(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  orden smallint not null check (orden between 1 and 10),
  asunto text not null check (char_length(asunto) between 1 and 200),
  cuerpo text not null check (char_length(cuerpo) between 1 and 20000),
  -- Días tras el mensaje anterior (en el primero no cuenta).
  espera_dias smallint not null default 0 check (espera_dias between 0 and 365),
  created_at timestamptz not null default now(),
  unique (campana_id, orden)
);

create table if not exists helm_email_destinatarios (
  id bigint generated by default as identity primary key,
  campana_id uuid not null references helm_email_campanas(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  contact_id uuid references crm_contacts(id) on delete set null,
  email text not null check (char_length(email) between 3 and 254 and email = lower(email)),
  nombre text check (char_length(nombre) <= 200),
  estado text not null default 'activo' check (estado in ('activo', 'terminado', 'baja', 'fallido')),
  siguiente_orden smallint not null default 1 check (siguiente_orden between 1 and 11),
  siguiente_en timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campana_id, email)
);
create index if not exists helm_email_destinatarios_toca on helm_email_destinatarios (campana_id, siguiente_en) where estado = 'activo';
create index if not exists helm_email_destinatarios_correo on helm_email_destinatarios (client_id, email);

create table if not exists helm_email_envios (
  id bigint generated by default as identity primary key,
  campana_id uuid not null references helm_email_campanas(id) on delete cascade,
  mensaje_id uuid not null references helm_email_mensajes(id) on delete cascade,
  destinatario_id bigint not null references helm_email_destinatarios(id) on delete cascade,
  client_id uuid not null,
  contact_id uuid,
  email text not null check (char_length(email) <= 254),
  orden smallint not null,
  lote uuid not null,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'enviado', 'entregado', 'rebotado', 'queja', 'fallido', 'dudoso')),
  resend_id text check (char_length(resend_id) <= 100),
  error text check (char_length(error) <= 1000),
  intentos smallint not null default 0,
  -- Resend rechazó el lote entero (un correo malo tumba los cien): se manda
  -- uno a uno, cada uno con su propia Idempotency-Key, para saber cuál era.
  suelto boolean not null default false,
  creado_en timestamptz not null default now(),
  enviado_en timestamptz,
  actualizado_en timestamptz not null default now(),
  -- Lo que impide el doble envío: una fila por campaña, mensaje y persona.
  unique (campana_id, mensaje_id, destinatario_id)
);
create index if not exists helm_email_envios_lote on helm_email_envios (lote);
create index if not exists helm_email_envios_resend on helm_email_envios (resend_id) where resend_id is not null;
create index if not exists helm_email_envios_estado on helm_email_envios (campana_id, estado);

create table if not exists helm_email_bajas (
  client_id uuid not null references clients(id) on delete cascade,
  email text not null check (char_length(email) between 3 and 254 and email = lower(email)),
  -- baja (se dio de baja) · rebote · queja (lo marcó como spam) · manual (desde el panel)
  motivo text not null check (motivo in ('baja', 'rebote', 'queja', 'manual')),
  origen text not null check (origen in ('enlace', 'un_clic', 'webhook', 'panel')),
  campana_id uuid references helm_email_campanas(id) on delete set null,
  detalle text check (char_length(detalle) <= 500),
  creada_en timestamptz not null default now(),
  primary key (client_id, email)
);
create index if not exists helm_email_bajas_recientes on helm_email_bajas (client_id, creada_en desc);

-- Las cuentas del panel, sin traerse miles de filas: por campaña y mensaje…
create or replace view helm_email_resumen with (security_invoker = true) as
select e.campana_id, e.client_id, e.orden,
  (count(*) filter (where e.estado in ('enviado', 'entregado', 'rebotado', 'queja')))::int as enviados,
  (count(*) filter (where e.estado = 'entregado'))::int as entregados,
  (count(*) filter (where e.estado = 'rebotado'))::int as rebotados,
  (count(*) filter (where e.estado = 'queja'))::int as quejas,
  (count(*) filter (where e.estado = 'fallido'))::int as fallidos,
  (count(*) filter (where e.estado = 'dudoso'))::int as dudosos,
  (count(*) filter (where e.estado = 'pendiente'))::int as pendientes
from helm_email_envios e
group by e.campana_id, e.client_id, e.orden;

-- …y por campaña, la audiencia: cuántos siguen, han terminado o se han ido.
create or replace view helm_email_resumen_destinatarios with (security_invoker = true) as
select d.campana_id, d.client_id,
  (count(*))::int as total,
  (count(*) filter (where d.estado = 'activo'))::int as activos,
  (count(*) filter (where d.estado = 'terminado'))::int as terminados,
  (count(*) filter (where d.estado = 'baja'))::int as bajas,
  (count(*) filter (where d.estado = 'fallido'))::int as fallidos
from helm_email_destinatarios d
group by d.campana_id, d.client_id;

alter table helm_email_ajustes enable row level security;
alter table helm_email_campanas enable row level security;
alter table helm_email_mensajes enable row level security;
alter table helm_email_destinatarios enable row level security;
alter table helm_email_envios enable row level security;
alter table helm_email_bajas enable row level security;
revoke all on helm_email_ajustes from anon, authenticated;
revoke all on helm_email_campanas from anon, authenticated;
revoke all on helm_email_mensajes from anon, authenticated;
revoke all on helm_email_destinatarios from anon, authenticated;
revoke all on helm_email_envios from anon, authenticated;
revoke all on helm_email_bajas from anon, authenticated;
revoke all on helm_email_resumen from anon, authenticated;
revoke all on helm_email_resumen_destinatarios from anon, authenticated;

commit;
