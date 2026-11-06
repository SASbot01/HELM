-- 125 — Licencias para crear una agencia.
--
-- Hasta ahora /api/register creaba la agencia y su cuenta sin más (se paga por
-- uso). Ahora hace falta una LICENCIA que genera la plataforma: un código que
-- se canjea UNA sola vez al crear la agencia. Generar licencias es solo de la
-- plataforma (superadmins.plataforma, vía /api/plataforma?action=generar-
-- licencias); canjearla, cualquiera que se registre con un código disponible.
--
-- El canje es atómico en api/register.js (update … where estado='disponible'):
-- dos altas a la vez con el mismo código, solo una se la queda.
--
-- Idempotente: se puede aplicar más de una vez sin riesgo.

create extension if not exists "pgcrypto";

create table if not exists licenses (
  id           uuid primary key default gen_random_uuid(),
  code         text not null,
  estado       text not null default 'disponible' check (estado in ('disponible', 'canjeada', 'anulada')),
  nota         text not null default '',
  created_by   text not null default '',
  created_at   timestamptz not null default now(),
  redeemed_by  text,
  agencia_id   uuid references agencias(id) on delete set null,
  redeemed_at  timestamptz
);

-- Único sin distinguir mayúsculas: los códigos se generan en mayúsculas, pero
-- quien se registra puede teclearlos como sea.
create unique index if not exists licenses_code_uidx on licenses (upper(code));
create index if not exists licenses_estado_idx on licenses (estado);
create index if not exists licenses_agencia_idx on licenses (agencia_id);

alter table licenses enable row level security;
do $$
begin
  drop policy if exists licenses_all on licenses;
  create policy licenses_all on licenses for all using (true) with check (true);
end $$;
