-- HELM — Anuncios: el gasto REAL de cada anuncio.
--
-- helm_ads ya tenía `presupuesto` (lo que piensas invertir). Para que el agente
-- de anuncios calcule el coste por lead y por venta cobrada hace falta lo que de
-- verdad se gastó durante el test, que es otra cosa: el presupuesto es un plan y
-- el gasto es el hecho. Se apunta desde el panel (api/ads.js, src/helm/views/Ads.jsx).
-- Opcional: sin él, el agente estima con el presupuesto y avisa.
--
-- Idempotente: se puede volver a aplicar sin romper nada.
alter table public.helm_ads
  add column if not exists gasto numeric;

comment on column public.helm_ads.gasto is
  '€ realmente gastados en el anuncio (para coste por lead y por venta). Distinto de `presupuesto`, que es lo planificado.';
