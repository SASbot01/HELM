-- 115 — Trial reels: vídeos subidos desde el ordenador o el móvil, y el cobro
-- de cada variante (api/trial-reels.js).
--
-- Hasta ahora el vídeo de partida solo salía del Instagram conectado del
-- perfil (helm_ig_media). Desde el 27-oct también se puede subir un MP4 o MOV
-- propio, por trozos (api/_lib/subida-trozos.js):
--
--   · helm_trial_fuentes → cada vídeo subido. `estado` va de subiendo a lista
--                          (o error) cuando ha llegado entero y ffprobe lo ha
--                          leído. `nombre` es solo para enseñarlo (sin rutas):
--                          el archivo vive en HELM_DATA_DIR/trial-reels/fuentes/
--                          con un nombre que sale del perfil y del id, y se
--                          borra a los 7 días, como las variantes. La fila se
--                          queda como historial.
--   · helm_trial_reels   → una variante sale de un reel (media_id) O de un
--                          vídeo subido (fuente_id): media_id deja de ser
--                          obligatorio. `precio_eur` es lo que cuesta (0,30 €,
--                          PRECIOS_FIJOS['trial-reel']) y `cobrado_eur`, lo que
--                          se cobró al salir bien (0 si la agencia no paga;
--                          null mientras no se ha cobrado). Las que fallan no se
--                          cobran. El cobro va con la referencia `trial:<id>`
--                          (mover_saldo no cobra dos veces la misma).
--
-- Solo el servidor las toca: RLS activado sin políticas, fuera de la lista
-- blanca del panel (PANEL en api/_lib/pasarela.js) y en sus SECRETAS.
--
-- OJO al desplegar: pásala (después de la 114) ANTES de subir el código de
-- api/trial-reels.js. Ese código ya pide fuente_id, precio_eur y cobrado_eur y
-- la tabla nueva: sin ellas, Trial reels entero da 500 (también con Instagram).
--
-- Idempotente: se puede volver a pasar sin romper nada.

begin;

create table if not exists helm_trial_fuentes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  -- El nombre del archivo que subió el usuario (solo para enseñarlo).
  nombre text,
  -- Lo que pesa entero (lo que anunció el navegador al empezar).
  bytes bigint not null check (bytes > 0),
  tipo text,
  -- Segundos: los del navegador al empezar y los de ffprobe al terminar.
  duracion numeric(10,2),
  estado text not null default 'subiendo'
    check (estado in ('subiendo', 'lista', 'error')),
  error text,
  -- Quién lo subió (el id de su sesión), si se sabe.
  creado_por uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists helm_trial_fuentes_cliente_idx
  on helm_trial_fuentes (client_id, created_at desc);

alter table helm_trial_fuentes enable row level security;
revoke all on helm_trial_fuentes from anon, authenticated;

alter table helm_trial_reels alter column media_id drop not null;
alter table helm_trial_reels add column if not exists fuente_id uuid
  references helm_trial_fuentes(id) on delete set null;
alter table helm_trial_reels add column if not exists precio_eur numeric(10,2);
alter table helm_trial_reels add column if not exists cobrado_eur numeric(10,2);
-- Sin un check de «media_id o fuente_id»: al borrar el vídeo subido, sus
-- variantes se quedan como historial con fuente_id a null.

-- Lo que la agencia tiene en marcha y aún sin cobrar (exigirImporte · pendiente).
create index if not exists helm_trial_reels_pendientes_idx
  on helm_trial_reels (client_id) where estado in ('en_cola', 'procesando');

commit;

notify pgrst, 'reload schema';
