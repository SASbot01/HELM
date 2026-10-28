-- ============================================================================
-- HELM — las tres migraciones de esta tanda, en orden.
--
-- Pegar entero en Supabase → SQL Editor y ejecutar. Se puede repetir sin
-- daño: todo va con `if not exists`.
--
--   1. helm_content_calendar.grabado    → la casilla de «grabado» en Contenido
--   2. helm_estrategia_overrides        → lo que cada perfil edita del playbook
--   3. helm_chat_messages.source        → de dónde llegó cada mensaje (web/telegram)
--
-- Hasta que se ejecute: el calendario y la lista se ven, pero la casilla de
-- grabado no guarda, la edición de guiones no persiste y el bot de Telegram
-- no puede escribir en el historial.
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────
-- migrations/helm_contenido_grabado.sql
-- ─────────────────────────────────────────────────────────────────────────
-- HELM — Contenido: la casilla de «grabado».
--
-- El calendario ya sabe en qué punto está cada pieza (`status`: sin hacer, en
-- proceso, hecho). Lo que no sabía es si el material EXISTE: si el vídeo ya se
-- grabó, aunque esté sin montar. Son dos preguntas distintas y en el día a día
-- se hacen por separado: el que graba marca «ya está grabado» y sigue con la
-- siguiente; el que edita mira el estado. Una pieza puede estar grabada y en
-- «sin hacer» (grabada de un tirón, sin montar) o en «hecho» sin grabar (un
-- email, una nota: no hay nada que grabar).
--
-- Por eso es una columna aparte y no un estado más: meter «grabado» en la
-- escalera de estados obligaría a elegir entre «grabado» y «en proceso» cuando
-- lo normal es que sean las dos cosas a la vez.
--
-- `grabado_at` guarda cuándo se marcó, para poder decir «grabada el 3 de
-- septiembre» en la ficha y, más adelante, medir el ritmo de grabación.
alter table helm_content_calendar
  add column if not exists grabado boolean not null default false,
  add column if not exists grabado_at timestamptz;

comment on column helm_content_calendar.grabado is
  'Si el material de la pieza ya existe (está grabado). Independiente de `status`: '
  'status dice en qué punto está la producción; grabado dice si hay material. '
  'Una pieza puede estar grabada y sin montar.';

comment on column helm_content_calendar.grabado_at is
  'Cuándo se marcó como grabada. Null si no lo está (se vacía al desmarcar).';

-- ─────────────────────────────────────────────────────────────────────────
-- migrations/helm_estrategia_overrides.sql
-- ─────────────────────────────────────────────────────────────────────────
-- HELM — Estrategia / Lanzamientos: lo que cada perfil cambia sobre el playbook.
--
-- Los playbooks de lanzamiento (Detrás de Cámara, En Forma con Hugo) viven como
-- datos estáticos en src/helm/views/estrategia/lanzamientoData.js: son la BASE.
-- Esta tabla guarda solo lo que el perfil ha tocado encima — un título
-- reescrito, otra fecha, otro gancho elegido, una tabla de tiempos ajustada.
-- Al cargar la vista se hace `{...base, ...patch}`, así el playbook puede
-- mejorar en código sin pisar lo que el cliente ya había cambiado, y "Volver
-- al original" es simplemente borrar la fila.
--
-- `item_id` es el guion ('A1'…'L10') o, si algún día se edita una sección
-- entera, su clave ('reglas', 'numeros'). Una fila por (perfil, playbook, item).
--
-- Aplicar en Supabase → SQL Editor. Se puede ejecutar varias veces.

begin;

create extension if not exists "pgcrypto";

create table if not exists helm_estrategia_overrides (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references clients(id) on delete cascade,
  playbook   text not null,                        -- 'dcc' | 'hugo' | …
  item_id    text not null,                        -- 'A1', 'L4', o una sección: 'reglas', 'numeros'
  patch      jsonb not null default '{}'::jsonb,   -- solo los campos que cambian sobre la base
  updated_at timestamptz not null default now(),
  unique (client_id, playbook, item_id)
);

create index if not exists helm_estrategia_overrides_client_playbook_idx
  on helm_estrategia_overrides (client_id, playbook);

-- RLS — allow-all, como el resto de HELM (ver helm_operativa.sql).
alter table helm_estrategia_overrides enable row level security;

do $$
begin
  drop policy if exists helm_estrategia_overrides_all on helm_estrategia_overrides;
  create policy helm_estrategia_overrides_all on helm_estrategia_overrides
    for all using (true) with check (true);
end $$;

commit;

-- ─────────────────────────────────────────────────────────────────────────
-- migrations/helm_telegram.sql
-- ─────────────────────────────────────────────────────────────────────────
-- HELM — Telegram: la misma conversación desde el móvil.
--
-- El bot de Telegram de un perfil (api/telegram.js) habla con el mismo motor
-- que el chat web y guarda los turnos en `helm_chat_messages`, así que el
-- hilo es UNO: lo que se pide por Telegram aparece en el panel y al revés.
-- Lo único que faltaba era saber desde dónde llegó cada mensaje, para poder
-- enseñarlo (y filtrarlo) sin adivinar.
--
-- La config del bot (token, secreto del webhook, chats autorizados) NO va
-- aquí: vive en `user_integrations` con service = 'telegram', como Calendly o
-- la clave de Claude, fuera del alcance del rol anónimo.
--
-- Aplicar en Supabase → SQL Editor. Se puede ejecutar varias veces.

-- ── Origen del mensaje ─────────────────────────────────────────────────────
-- 'web' es el chat del panel (lo de siempre, por eso es el valor por defecto
-- y lo que reciben las filas que ya existían); 'telegram', el bot.
alter table helm_chat_messages
  add column if not exists source text not null default 'web';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'helm_chat_messages'::regclass
       and conname = 'helm_chat_messages_source_check'
  ) then
    alter table helm_chat_messages
      add constraint helm_chat_messages_source_check
      check (source in ('web', 'telegram'));
  end if;
end $$;

comment on column helm_chat_messages.source is
  'Desde dónde llegó el mensaje: web (chat del panel) o telegram (bot del perfil).';

-- RLS: la tabla ya tiene la política allow-all de migrations/helm_chat.sql
-- (el acceso real se controla en la app, que entra con la anon key). Una
-- columna nueva no cambia nada de eso; se deja constancia para que nadie la
-- busque aquí.
