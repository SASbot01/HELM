-- HELM — el reporte diario, con nombre y apellidos.
--
-- Hasta aquí el Diario pedía contadores: "convirtieron: 3". Números sueltos,
-- sin nombres, y por eso el reporte no podía mover nada en el CRM — no sabía
-- DE QUIÉN hablaba.
--
-- `sales` guarda a quién se le vendió, con el id del contacto y el importe:
--   [{"contact_id":"uuid","name":"Ana Ruiz","amount":1200}]
--
-- El id es lo importante. Guardar solo el nombre volvería a dejarnos igual:
-- con tres Anas en el CRM, casar por texto mueve la ficha equivocada. Por eso
-- en el panel se eligen de la lista de contactos y no se teclean.
--
-- Ojo con lo que esto NO hace: no crea ninguna venta en `sales`/Ventas. El
-- dinero sigue entrando por Stripe o Woo, que es lo que no se equivoca de
-- importe. El reporte solo mueve la etapa del contacto y anota el importe
-- esperado, para que no se cuente la misma venta dos veces (ver la decisión
-- pendiente sobre Stripe/Woo).
alter table reports
  add column if not exists sales jsonb not null default '[]'::jsonb;

comment on column reports.sales is
  'Leads cerrados en este reporte: [{contact_id, name, amount}]. Al guardarlos, '
  'el panel pasa cada contacto a la etapa ganada de su pipeline y le pone el '
  'importe en deal_value. No crea filas de venta: eso lo hace Stripe/Woo.';
