-- HELM — andamiaje de VeriFactu sobre helm_documentos_venta (tarea #11).
--
-- Lo que SÍ es esto: un hash SHA-256 encadenado entre facturas (cada una lleva
-- el hash de la anterior), calculado en el momento en que la factura se emite
-- y ya no se puede tocar sin que el encadenado lo delate. Es la pieza de
-- integridad que VeriFactu exige.
--
-- Lo que esto NO es, y no se puede fabricar sin lo que un despacho real tiene
-- y este sistema no: la FIRMA ELECTRÓNICA (requiere el certificado digital del
-- despacho, un secreto suyo) y el ENVÍO A LA AEAT (requiere darse de alta como
-- sistema informático de facturación ante la agencia tributaria). Sin esas dos
-- piezas, esto no es "conforme" — es la mitad de la foto. El código y la UI lo
-- dicen explícitamente para que nadie lo venda como lo que no es.
alter table helm_documentos_venta
  add column if not exists hash            text not null default '',
  add column if not exists hash_anterior   text not null default '',
  -- La cadena de texto exacta que se hasheó, para poder auditar/recalcular.
  add column if not exists hash_input      text not null default '',
  -- Lo que codifica el QR de la hoja impresa. No es el QR oficial de la AEAT
  -- (ese exige el envío previo del registro): es un QR de verificación propio.
  add column if not exists qr_datos        text not null default '',
  add column if not exists emitido_at      timestamptz;

create index if not exists helm_docventa_hash_idx on helm_documentos_venta (client_id, tipo, emitido_at);
