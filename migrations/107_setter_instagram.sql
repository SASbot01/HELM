-- 107 — El setter de Instagram: un agente por perfil que contesta los DM de
-- Instagram, cualifica al lead y lo lleva a la llamada (api/ig-webhook.js,
-- api/setter-ig.js, api/_lib/setter-ig.js).
--
--   · helm_setter_ig         → la configuración del setter de cada perfil.
--   · helm_ig_conversaciones → un hilo por persona que escribe a la cuenta,
--                               con su ficha del CRM y quién lleva el hilo
--                               (la IA o una persona).
--   · helm_ig_mensajes       → cada mensaje: los que llegan, los que manda el
--                               setter, sus borradores y los que escribe el
--                               equipo desde la app de Instagram.
--
-- Son mensajes privados de terceros: solo el servidor las toca. RLS activado
-- sin políticas y fuera de la puerta del panel (SECRETAS en api/_lib/pasarela.js).
--
-- Idempotente: se puede volver a pasar sin romper nada.

begin;

create table if not exists helm_setter_ig (
  client_id uuid primary key references clients(id) on delete cascade,
  -- Apagado hasta que alguien lo encienda: no contesta nada por su cuenta.
  activo boolean not null default false,
  -- 'borrador': escribe la respuesta y espera a que una persona la apruebe.
  -- 'auto': la manda sola. Se empieza en borrador.
  modo text not null default 'borrador' check (modo in ('borrador', 'auto')),
  -- A dónde lleva la conversación: a reservar llamada con un formulario de
  -- HELM, a un enlace propio o solo a cualificar y pasar a una persona.
  objetivo text not null default 'agendar' check (objetivo in ('agendar', 'enlace', 'cualificar')),
  form_id uuid references helm_forms(id) on delete set null,
  enlace text,
  -- Lo que el setter tiene que saber y no está en la Biblia: oferta, precios
  -- que se pueden decir, qué no prometer, preguntas para cualificar.
  instrucciones text,
  preguntas text,
  -- La primera respuesta dice que es un asistente (Ley de IA, art. 50).
  aviso_ia text,
  -- Segundos de espera antes de contestar: agrupa los mensajes que llegan en
  -- ráfaga y no responde a los dos segundos como un robot.
  retraso_s int not null default 25 check (retraso_s between 5 and 600),
  updated_at timestamptz not null default now(),
  updated_by text
);

create table if not exists helm_ig_conversaciones (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  -- La cuenta profesional que recibe (entry.id del webhook) y quien escribe
  -- (su IGSID, el id con el que Meta deja contestarle).
  ig_cuenta_id text not null,
  ig_usuario_id text not null,
  usuario text,
  nombre text,
  contact_id uuid references crm_contacts(id) on delete set null,
  -- Quién lleva el hilo. 'humano': el setter no vuelve a escribir hasta que
  -- alguien se lo devuelva desde el panel.
  estado text not null default 'ia' check (estado in ('ia', 'humano', 'cerrada')),
  motivo_humano text,
  -- Lo que el setter sabe del lead y en qué punto está.
  fase text,
  datos jsonb not null default '{}'::jsonb,
  resumen text,
  aviso_dado boolean not null default false,
  -- Instagram solo deja contestar hasta 24 h después del último mensaje del lead.
  ultimo_entrante_at timestamptz,
  ultimo_mensaje_at timestamptz,
  -- Desde cuándo hay mensajes del lead sin contestar (null: ninguno).
  pendiente_desde timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, ig_usuario_id)
);
create index if not exists helm_ig_conversaciones_perfil on helm_ig_conversaciones (client_id, ultimo_mensaje_at desc);
create index if not exists helm_ig_conversaciones_pendientes on helm_ig_conversaciones (pendiente_desde) where pendiente_desde is not null;

create table if not exists helm_ig_mensajes (
  id uuid primary key default gen_random_uuid(),
  conversacion_id uuid not null references helm_ig_conversaciones(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  -- El id de Meta: el mismo mensaje puede llegar dos veces por el webhook.
  mid text,
  direccion text not null check (direccion in ('entrante', 'saliente')),
  -- 'instagram': lo escribió alguien del equipo desde la app, no HELM.
  autor text not null check (autor in ('lead', 'ia', 'humano', 'instagram')),
  texto text,
  adjuntos jsonb,
  estado text not null default 'enviado' check (estado in ('recibido', 'borrador', 'enviado', 'descartado', 'error')),
  error text,
  created_at timestamptz not null default now()
);
create unique index if not exists helm_ig_mensajes_mid on helm_ig_mensajes (client_id, mid) where mid is not null;
create index if not exists helm_ig_mensajes_hilo on helm_ig_mensajes (conversacion_id, created_at);

alter table helm_setter_ig enable row level security;
alter table helm_ig_conversaciones enable row level security;
alter table helm_ig_mensajes enable row level security;

commit;
