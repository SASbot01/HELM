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
