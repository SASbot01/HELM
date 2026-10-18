-- 110 — Editor de reels: el vídeo en bruto entra y sale editado (api/editor.js).
--
-- El usuario sube un talking-head grabado con el móvil, tal cual. El worker
-- (scripts/agents-worker.mjs, trabajo `editor-render`) lo transcribe palabra
-- a palabra con Whisper, quita las tomas repetidas, las muletillas sueltas y
-- los silencios largos, lo encuadra a 1080×1920 con punch-in, le quema los
-- subtítulos palabra a palabra y normaliza la voz (api/_lib/editor/*).
--
--   · helm_ediciones        → cada vídeo subido. `estado` va de subiendo a
--                             listo (o error); `progreso` (0–100) y `paso` (lo
--                             que está haciendo, en castellano) los enseña el
--                             panel en vivo. `estilo` es el estilo con el que
--                             se editó (copiado al subir) y `plan`, lo que se
--                             cortó y los subtítulos que se usaron. `bytes` es
--                             el peso del MP4 editado. Los archivos viven en
--                             HELM_DATA_DIR/editor/<id>/ y se borran a los 7
--                             días; la fila se queda como historial.
--   · helm_estilos_edicion  → los estilos: uno global (client_id null,
--                             «Estilo HELM») y el de cada perfil que lo haya
--                             cambiado en el panel «Estilo».
--
-- Solo el servidor las toca: RLS activado sin políticas y fuera de la puerta
-- del panel (SECRETAS en api/_lib/pasarela.js).
--
-- Idempotente: se puede volver a pasar sin romper nada.

begin;

create table if not exists helm_ediciones (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  -- El nombre del archivo que subió el usuario (solo para enseñarlo).
  nombre_original text,
  estado text not null default 'subiendo'
    check (estado in ('subiendo', 'en_cola', 'transcribiendo', 'montando', 'listo', 'error')),
  progreso int not null default 0 check (progreso between 0 and 100),
  paso text,
  estilo jsonb not null default '{}'::jsonb,
  plan jsonb,
  -- Segundos del original y del editado.
  duracion_original numeric(10,2),
  duracion_final numeric(10,2),
  bytes bigint,
  error text,
  -- Quién lo subió (el id de su sesión), si se sabe.
  creado_por uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists helm_ediciones_cliente_idx
  on helm_ediciones (client_id, created_at desc);

create table if not exists helm_estilos_edicion (
  id uuid primary key default gen_random_uuid(),
  -- null = global (el de partida de todos los perfiles).
  client_id uuid references clients(id) on delete cascade,
  nombre text not null,
  params jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists helm_estilos_edicion_cliente_idx
  on helm_estilos_edicion (client_id, updated_at desc);

-- El estilo de la casa. Los mismos valores que ESTILO_POR_DEFECTO en
-- src/agents/editor/estilo.js (el código los normaliza igualmente).
insert into helm_estilos_edicion (client_id, nombre, params)
select null, 'Estilo HELM', '{
  "subtitulos": true, "palabrasPorBloque": 3, "mayusculas": true,
  "colorTexto": "#FFFFFF", "colorResalte": "#FFD60A", "colorBorde": "#000000",
  "tamano": 72, "borde": 6, "posicion": 68,
  "zoom": true, "zoomCada": 4, "zoomFactor": 1.08,
  "pausaFrase": 0.6, "silencioMax": 0.4, "silencioDeja": 0.12,
  "quitarTomas": true, "similitudTomas": 0.6, "quitarMuletillas": true,
  "volumen": -16
}'::jsonb
where not exists (select 1 from helm_estilos_edicion where client_id is null and nombre = 'Estilo HELM');

alter table helm_ediciones enable row level security;
alter table helm_estilos_edicion enable row level security;
revoke all on helm_ediciones, helm_estilos_edicion from anon, authenticated;

commit;

notify pgrst, 'reload schema';
