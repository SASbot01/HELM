-- HELM — Onboarding por perfil.
--
-- Un perfil puede rellenar varios onboardings (de momento: 'contenido'; en el
-- futuro 'migracion' y un tercero). Cada uno guarda sus respuestas como un
-- único documento jsonb que se va autoguardando en borrador y, al completarse,
-- se transforma en bloques de `helm_knowledge` (source = 'onboarding:<form>')
-- para que el chat lo inyecte en su system prompt. Regenerar = borrar los
-- bloques con ese source y volver a insertarlos.
--
-- Scoped por client_id, un documento por (client_id, form).

create extension if not exists "pgcrypto";

create table if not exists helm_onboarding (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references clients(id) on delete cascade,
  form          text not null default 'contenido',   -- 'contenido' | 'migracion' | …
  answers       jsonb not null default '{}'::jsonb,   -- respuestas por field.key
  status        text not null default 'draft' check (status in ('draft', 'completed')),
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (client_id, form)
);

create index if not exists helm_onboarding_client_idx
  on helm_onboarding (client_id);

-- RLS allow-all (mismo patrón que el resto de HELM: el control real de acceso
-- lo hace la app, que entra con la anon key).
alter table helm_onboarding enable row level security;

do $$
begin
  drop policy if exists helm_onboarding_all on helm_onboarding;
  create policy helm_onboarding_all on helm_onboarding for all using (true) with check (true);
end $$;
