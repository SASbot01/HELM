-- HELM — Instagram: las métricas de cada publicación, guardadas en casa.
--
-- POR QUÉ UNA TABLA Y NO PEDIRLE LOS DATOS A META CADA VEZ:
--
--   1) Cuota. La API de Instagram limita las llamadas por hora, y las métricas
--      van de una en una: una cuenta con cien piezas son cien llamadas cada vez
--      que alguien abre la sección. Con dos personas mirando, la cuota se acaba
--      antes de comer.
--   2) Histórico. Instagram enseña las métricas de los últimos meses; lo de
--      antes desaparece de su panel. Aquí no: lo que se sincronizó una vez se
--      queda, y por eso se puede comparar el reel de marzo con el de ahora.
--   3) Velocidad. La pantalla se pinta con una consulta a Supabase, no con
--      sesenta viajes a Meta.
--
-- El token NO vive aquí: vive en `user_integrations` (service='instagram'), que
-- tiene RLS negando al rol anónimo. Esta tabla solo tiene números y textos que
-- ya son públicos en el perfil de Instagram.
--
-- Idempotente.

create table if not exists helm_ig_media (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references clients(id) on delete cascade,
  -- El id de la publicación en Instagram. Es lo que evita que el mismo reel
  -- entre dos veces por sincronizar dos veces.
  media_id      text not null,
  tipo          text not null default '',       -- IMAGE, VIDEO, CAROUSEL_ALBUM
  producto      text not null default '',       -- FEED, REELS, STORY
  caption       text not null default '',
  permalink     text not null default '',
  thumb_url     text not null default '',
  publicado_en  timestamptz,

  -- Las métricas. `visitas` es la que manda en la pantalla: es lo que
  -- Instagram llama "views" desde 2024 y lo que la gente entiende por "cuánta
  -- gente ha visto esto". Cuando Meta no la da (piezas antiguas de algunas
  -- cuentas) se guarda el alcance, que es lo más parecido que existe.
  visitas       integer not null default 0,
  alcance       integer not null default 0,
  likes         integer not null default 0,
  comentarios   integer not null default 0,
  guardados     integer not null default 0,
  compartidos   integer not null default 0,
  interacciones integer not null default 0,

  -- Solo reels. En segundos: la API los da en milisegundos y así no hay que
  -- acordarse de dividir en cada sitio donde se pinte.
  retencion_media numeric(10,2),
  tiempo_total    numeric(14,2),

  -- Solo fotos y carruseles, y solo si la cuenta tiene el permiso: cuánta
  -- gente entró al perfil desde la pieza y cuántos se quedaron.
  visitas_perfil     integer not null default 0,
  seguidores_ganados integer not null default 0,

  actualizado_en timestamptz not null default now(),
  created_at     timestamptz not null default now()
);

create unique index if not exists helm_ig_media_unico
  on helm_ig_media (client_id, media_id);

-- La pantalla ordena por visitas (los ganadores) y por fecha (lo último). Los
-- dos índices son los dos únicos órdenes que se piden.
create index if not exists helm_ig_media_visitas_idx
  on helm_ig_media (client_id, visitas desc);
create index if not exists helm_ig_media_fecha_idx
  on helm_ig_media (client_id, publicado_en desc);

comment on column helm_ig_media.visitas is
  'Reproducciones ("views" de Instagram). Si Meta no la devuelve para esa pieza, '
  'se guarda el alcance: un cero haría parecer que no la vio nadie.';

-- RLS como el resto de tablas de HELM: la app entra con la clave anónima y el
-- filtro por perfil lo hace la propia consulta (ver helm_operativa.sql).
alter table helm_ig_media enable row level security;
drop policy if exists helm_ig_media_all on helm_ig_media;
create policy helm_ig_media_all on helm_ig_media for all using (true) with check (true);
