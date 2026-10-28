-- HELM — los eventos de Stripe que ya se han atendido.
--
-- Stripe reintenta un webhook si no le contestamos a tiempo, y a veces lo
-- entrega dos veces aunque sí contestáramos. api/_lib/pagos.js ya no repite
-- una venta que encuentra (sales.source = 'stripe:<id>'), pero lo mira y luego
-- inserta: dos entregas del mismo evento a la vez pasan las dos la mirada y
-- registran la venta dos veces.
--
-- Aquí se apunta el id de cada evento (evt_…) ANTES de procesarlo. La clave
-- primaria hace el resto: la segunda entrega choca, y api/webhook/stripe.js la
-- da por atendida sin tocar nada. Si el proceso falla, el webhook borra su
-- apunte para que el reintento de Stripe sí entre.
--
-- Idempotente: se puede volver a pasar sin romper nada.

create table if not exists helm_stripe_eventos (
  event_id text primary key,
  client_id uuid references clients(id) on delete cascade,
  tipo text,
  created_at timestamptz not null default now()
);
create index if not exists helm_stripe_eventos_client_idx on helm_stripe_eventos (client_id, created_at desc);

-- Solo el servidor (service_role).
alter table helm_stripe_eventos enable row level security;
revoke all on helm_stripe_eventos from anon, authenticated;
