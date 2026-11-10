-- 131 — helm_team.payment_link: enlace de pago (Stripe) por comercial.
--
-- Cada comercial tiene su propio Payment Link de Stripe (precio abierto: lo
-- pone el cliente). Ese enlace se imprime en las facturas y presupuestos que
-- genera esa persona, para que el cliente pague ahí. Lo lee Documentos.jsx
-- por la persona de la sesión (helm_team.id = sesión.helmTeamId).
--
-- Solo añade la columna (schema, vale para todos los perfiles). Los valores
-- concretos de WebSeller se ponen por DML aparte. Idempotente.
begin;

alter table helm_team
  add column if not exists payment_link text not null default '';

comment on column helm_team.payment_link is
  'Enlace de pago (Stripe Payment Link) del comercial. Se imprime en sus facturas/presupuestos. Vacío = no se muestra.';

commit;
