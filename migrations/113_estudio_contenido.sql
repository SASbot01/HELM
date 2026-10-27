-- 113 — Estudio de contenido: el estudio de verdad del «Informe de contenido».
--
-- Con las piezas de Instagram del perfil (helm_ig_media), el código calcula
-- los números (medianas, percentiles, tercios, etapa…) y una IA escribe el
-- diagnóstico, los objetivos por etapas, el plan de cuatro semanas, los
-- experimentos y el avatar de contenido (api/_lib/estudio-contenido/). Cada
-- estudio lee el anterior: así aprende de una semana a otra.
--
--   · helm_ig_seguidores    → una foto de los seguidores por día, que guarda
--                             cada sincronización (la del worker, el botón
--                             «Sincronizar» y la conexión de la cuenta, todas
--                             por api/instagram.js) cuando Instagram ha dado el
--                             número. Instagram solo da el de hoy; sin esto no
--                             hay ritmo ni fecha estimada para el siguiente hito.
--   · helm_estudio_contenido → un estudio por fila: los datos que calculó el
--                             código, lo que escribió la IA y lo que costó. La
--                             fila la abre el POST del panel ('en_curso') y el
--                             worker la rellena; el de los lunes la abre el
--                             propio worker. Una sola 'en_curso' por perfil.
--
-- Solo el servidor las toca: RLS activado sin políticas y fuera de la puerta
-- del panel (SECRETAS en api/_lib/pasarela.js). El panel lee por
-- api/estudio-contenido.js. Idempotente.

begin;

create table if not exists helm_ig_seguidores (
  client_id uuid not null references clients(id) on delete cascade,
  -- El día de Madrid de la foto: si se sincroniza varias veces, gana la última.
  dia date not null,
  seguidores integer not null,
  primary key (client_id, dia)
);

create table if not exists helm_estudio_contenido (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  generado_en timestamptz not null default now(),
  -- 'en_curso' mientras el worker lo escribe → 'listo' | 'error'. Una
  -- 'en_curso' que lleva más de 30 min TRABAJÁNDOSE (desde empezado_en) se da
  -- por caída y pasa a 'error'; la espera en la cola no cuenta.
  estado text not null default 'en_curso' check (estado in ('en_curso', 'listo', 'error')),
  -- Cuándo la cogió el worker. null = sigue en la cola: un pedido del panel
  -- puede esperar ahí un rato por la mañana sin que se dé por perdido (solo
  -- a las 6 h sin empezar).
  empezado_en timestamptz,
  -- Lo que calcula el código (datos.js) y lo que escribe la IA (generar.js).
  datos jsonb,
  estudio jsonb,
  modelo text,
  tokens integer,
  coste_usd numeric(10,4),
  -- Lo que se le enseña al usuario si falla (y si se cobró algo). El detalle
  -- técnico va al log del worker, no aquí.
  error text
);
-- Si la tabla ya existía de una versión anterior de esta migración.
alter table helm_estudio_contenido add column if not exists empezado_en timestamptz;
create index if not exists helm_estudio_contenido_perfil on helm_estudio_contenido (client_id, generado_en desc);
-- Un solo estudio en marcha por perfil: con un doble clic, los dos POST pasan
-- las comprobaciones, pero el segundo choca aquí (23505 → 409) y no se encola
-- ni se cobra otro. Si la tabla ya existía de una versión anterior de esta
-- migración, antes se cierran las 'en_curso' que sobren (queda la última de
-- cada perfil), para que el índice se pueda crear.
update helm_estudio_contenido e set estado = 'error',
  error = 'El estudio se quedó a medias y se ha dado por perdido. Vuelve a pedirlo; si llegó a usar la IA, solo se ha cobrado lo que usó.'
where e.estado = 'en_curso' and exists (
  select 1 from helm_estudio_contenido o
  where o.client_id = e.client_id and o.estado = 'en_curso'
    and (o.generado_en, o.id) > (e.generado_en, e.id)
);
create unique index if not exists helm_estudio_contenido_uno_en_curso
  on helm_estudio_contenido (client_id) where estado = 'en_curso';

alter table helm_ig_seguidores enable row level security;
alter table helm_estudio_contenido enable row level security;
revoke all on helm_ig_seguidores from anon, authenticated;
revoke all on helm_estudio_contenido from anon, authenticated;

commit;
