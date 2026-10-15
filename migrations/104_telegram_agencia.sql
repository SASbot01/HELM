-- 104 — El bot de Telegram de HELM para las agencias (api/telegram-agencia.js).
--
-- Un solo bot para el administrador de cada agencia y todos sus perfiles. Su
-- token y el secreto del webhook van en el entorno (HELM_TELEGRAM_TOKEN,
-- HELM_TELEGRAM_SECRETO); aquí solo vive quién habla con él y lo que tiene a
-- medias:
--
--   · helm_telegram_vinculos        → qué cuenta de Telegram es de qué
--                                      superadmin. El código para vincularse
--                                      se guarda hasheado (sha256) y caduca.
--   · helm_telegram_conversaciones  → los últimos turnos de cada chat (solo
--                                      texto) y el turno en pausa mientras
--                                      espera una aprobación.
--   · helm_telegram_aprobaciones    → cada acción que escribe o gasta, a la
--                                      espera de Aprobar o Rechazar.
--
-- Solo el servidor las toca: RLS activado sin políticas y fuera de la puerta
-- del panel (SECRETAS en api/_lib/pasarela.js).
--
-- Idempotente: se puede volver a pasar sin romper nada.

begin;

create table if not exists helm_telegram_vinculos (
  superadmin_id uuid primary key references superadmins(id) on delete cascade,
  agencia_id uuid references agencias(id) on delete cascade,
  -- El usuario de Telegram (from.id), no el chat: solo chats privados.
  tg_user_id bigint unique,
  tg_chat_id bigint,
  tg_nombre text,
  vinculado_at timestamptz,
  codigo_hash text,
  codigo_caduca timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists helm_telegram_vinculos_codigo_idx
  on helm_telegram_vinculos (codigo_hash) where codigo_hash is not null;
create index if not exists helm_telegram_vinculos_agencia_idx
  on helm_telegram_vinculos (agencia_id) where tg_chat_id is not null;

create table if not exists helm_telegram_conversaciones (
  tg_chat_id bigint primary key,
  superadmin_id uuid references superadmins(id) on delete cascade,
  -- [{ role: 'user'|'assistant', content: texto }], los últimos.
  historial jsonb not null default '[]'::jsonb,
  -- { id, hoy, model, system, messages, resultados, pendientes, aprobaciones, pregunta } o null.
  turno jsonb,
  actualizado_at timestamptz not null default now()
);

create table if not exists helm_telegram_aprobaciones (
  id uuid primary key default gen_random_uuid(),
  tg_chat_id bigint not null,
  superadmin_id uuid references superadmins(id) on delete cascade,
  agencia_id uuid references agencias(id) on delete cascade,
  client_id uuid references clients(id) on delete set null,
  herramienta text not null,
  args jsonb not null default '{}'::jsonb,
  tool_use_id text not null,
  resumen text,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'aprobada', 'rechazada', 'caducada', 'ejecutada', 'fallida')),
  tg_message_id bigint,
  caduca timestamptz not null,
  decidida_at timestamptz,
  resultado jsonb,
  created_at timestamptz not null default now()
);
create index if not exists helm_telegram_aprobaciones_chat_idx
  on helm_telegram_aprobaciones (tg_chat_id, estado);
create index if not exists helm_telegram_aprobaciones_superadmin_idx
  on helm_telegram_aprobaciones (superadmin_id, created_at desc);

alter table helm_telegram_vinculos enable row level security;
alter table helm_telegram_conversaciones enable row level security;
alter table helm_telegram_aprobaciones enable row level security;
revoke all on helm_telegram_vinculos, helm_telegram_conversaciones, helm_telegram_aprobaciones from anon, authenticated;

commit;

notify pgrst, 'reload schema';
