-- HELM — Enlaces por perfil.
--
-- El cajón de enlaces del negocio: landing, checkout, panel de Stripe, Drive,
-- calendario, grupo de WhatsApp… Lo que cada perfil necesita tener a mano.

create table if not exists helm_links (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete cascade,
  title       text not null,
  url         text not null,
  category    text not null default 'General',
  notes       text,
  created_at  timestamptz not null default now()
);

create index if not exists helm_links_client_idx on helm_links (client_id, category, created_at desc);

alter table helm_links enable row level security;
drop policy if exists helm_links_all on helm_links;
create policy helm_links_all on helm_links for all using (true) with check (true);
