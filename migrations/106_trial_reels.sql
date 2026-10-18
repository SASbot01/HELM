-- 106 — Trial reels: variantes editadas de un reel propio (api/trial-reels.js).
--
-- El agente «Trial reels» coge un reel que el perfil YA ha publicado (de
-- helm_ig_media, bajado de su propia cuenta de Instagram) y monta 2–3
-- variantes en MP4 1080×1920 con ffmpeg en el servidor (api/_lib/variantes.js)
-- para volver a probar la idea como «Reel de prueba» en la app. Cada fila es
-- una variante:
--
--   · ajustes  → lo que cambia (arranque, gancho, encuadre, color, velocidad,
--                espejo), ya recortado por normalizaAjustes
--                (src/agents/trialreels/reglas.js)
--   · estado   → en_cola · procesando · listo · error
--   · archivo  → solo informativo (trial-reels/<id>.mp4 dentro de
--                HELM_DATA_DIR). El servidor nunca abre lo que diga esta
--                columna: la ruta sale siempre del id.
--
-- Los MP4 se borran a los 7 días; la fila se queda como historial hasta que
-- se borre desde el panel. HELM no publica nada en Instagram.
--
-- Solo el servidor la toca: RLS activado sin políticas y fuera de la puerta
-- del panel (SECRETAS en api/_lib/pasarela.js).
--
-- Idempotente: se puede volver a pasar sin romper nada.

begin;

create table if not exists helm_trial_reels (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  -- El id de la publicación en Instagram (helm_ig_media.media_id).
  media_id text not null,
  -- 1, 2 o 3: el número de la variante dentro de su tanda.
  variante int not null default 1,
  ajustes jsonb not null default '{}'::jsonb,
  estado text not null default 'en_cola'
    check (estado in ('en_cola', 'procesando', 'listo', 'error')),
  archivo text,
  bytes bigint,
  -- Segundos del MP4 que sale.
  duracion numeric(10,2),
  error text,
  -- Quién la pidió (el id de su sesión), si se sabe.
  creado_por uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists helm_trial_reels_cliente_idx
  on helm_trial_reels (client_id, created_at desc);

alter table helm_trial_reels enable row level security;
revoke all on helm_trial_reels from anon, authenticated;

commit;

notify pgrst, 'reload schema';
