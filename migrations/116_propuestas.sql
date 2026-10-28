-- 116 — La bandeja de los agentes de departamento (28-oct-2026).
--
-- Los agentes de ventas, atención, operaciones, finanzas, webs y anuncios
-- detectan algo (una cuota que toca, un lead que se enfría, un pago duplicado)
-- y, cuando hay que actuar hacia fuera o con dinero, lo PROPONEN: la propuesta
-- llega al Telegram de la agencia y al panel (Agentes → Bandeja) con «Aprobar»
-- y «Rechazar». Ver api/_lib/propuestas.js.
--
--   · helm_propuestas      → cada propuesta. `herramienta` + `input` es la
--                            escritura del bot (api/_lib/bot/escrituras.js) que
--                            se aplica al aprobar; `resumen`, lo que enseñó la
--                            tarjeta (al aprobar se vuelve a preparar y, si sale
--                            otra cosa, no se hace). Sin herramienta, aprobarla
--                            es darla por hecha (p. ej. mandar tú el mensaje).
--                            `mensaje` y `enlace` son el texto ya redactado para
--                            el cliente y su enlace de WhatsApp (wa.me).
--                            `clave` hace que el mismo agente no proponga dos
--                            veces lo mismo (p. ej. «cobrador:<venta>:<cuota>»).
--   · helm_agente_ajustes  → por perfil y agente: si está encendido, su
--                            autonomía y su configuración (topes del Media
--                            buyer, días de seguimiento…).
--
-- Los topes de tamaño son los de api/_lib/propuestas.js (TOPES), con margen:
-- el código ya corta; esto es la red por si algo escribe sin pasar por él.
-- El enlace solo puede ser de WhatsApp (va a un href del panel y a un botón).
--
-- Solo el servidor las toca: RLS activado sin políticas y en SECRETAS
-- (api/_lib/pasarela.js). Idempotente.

begin;

create table if not exists helm_propuestas (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  agencia_id uuid,
  agente text not null check (char_length(agente) between 1 and 40),
  clave text not null check (char_length(clave) between 1 and 300),
  titulo text not null check (char_length(titulo) between 1 and 300),
  porque text check (char_length(porque) <= 2000),
  herramienta text check (char_length(herramienta) <= 60),
  input jsonb check (input is null or (jsonb_typeof(input) = 'object' and pg_column_size(input) <= 65536)),
  resumen text check (char_length(resumen) <= 20000),
  mensaje text check (char_length(mensaje) <= 2000),
  enlace text check (enlace is null or (enlace like 'https://wa.me/%' and char_length(enlace) <= 8000)),
  -- Lo que quiera guardar el agente para enseñarlo (importe, contacto…).
  datos jsonb not null default '{}'::jsonb check (jsonb_typeof(datos) = 'object' and pg_column_size(datos) <= 16384),
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'aprobada', 'aplicada', 'rechazada', 'caducada', 'fallida')),
  resultado text check (char_length(resultado) <= 4000),
  creada_en timestamptz not null default now(),
  caduca timestamptz not null default (now() + interval '3 days'),
  decidida_en timestamptz,
  decidida_por text,
  -- Los mensajes de Telegram con los botones, para quitárselos al decidir.
  tg_mensajes jsonb not null default '[]'::jsonb check (jsonb_typeof(tg_mensajes) = 'array')
);

create unique index if not exists helm_propuestas_clave on helm_propuestas (client_id, clave);
create index if not exists helm_propuestas_bandeja on helm_propuestas (client_id, estado, creada_en desc);
create index if not exists helm_propuestas_agencia on helm_propuestas (agencia_id, estado);
-- Para caducarPropuestas, que mira todas las pendientes de todos los perfiles.
create index if not exists helm_propuestas_caducan on helm_propuestas (caduca) where estado = 'pendiente';

create table if not exists helm_agente_ajustes (
  client_id uuid not null references clients(id) on delete cascade,
  agente text not null,
  activo boolean not null default true,
  autonomia text not null default 'proponer' check (autonomia in ('proponer', 'interno')),
  config jsonb not null default '{}'::jsonb check (jsonb_typeof(config) = 'object'),
  updated_at timestamptz not null default now(),
  primary key (client_id, agente)
);

alter table helm_propuestas enable row level security;
alter table helm_agente_ajustes enable row level security;
revoke all on helm_propuestas from anon, authenticated;
revoke all on helm_agente_ajustes from anon, authenticated;

commit;
