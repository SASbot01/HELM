// HELM — cadena de integridad tipo VeriFactu sobre las facturas emitidas.
//
// Cada factura, al emitirse (pasar de "Borrador" a un estado que ya se envía
// o se cobra), encadena el hash de la última factura emitida de este cliente.
// Tocar una factura ya emitida sin pasar por aquí rompe la cadena a partir de
// ese punto — es la propiedad de integridad que exige VeriFactu.
//
// AVISO, otra vez, porque es la parte que se olvida al mirar solo la pantalla:
// esto NO firma electrónicamente el registro ni lo envía a la AEAT. Eso exige
// el certificado digital del despacho (un secreto suyo que HELM no tiene ni
// debe fabricar) y darse de alta como sistema informático de facturación. Sin
// esas dos piezas esto es integridad verificable, no conformidad legal — y así
// se lo dice la UI a quien lo usa, en vez de callárselo.
export async function sha256Hex(texto) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto))
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}

export function cadenaInput({ numero, fecha, nif, total, hashAnterior }) {
  return `${numero}|${fecha}|${nif || 'SIN-NIF'}|${Number(total).toFixed(2)}|${hashAnterior || 'GENESIS'}`
}

/** Hash de una factura al emitirla, encadenado al hash de la anterior emitida de este cliente. */
export async function emitirConHash(doc, hashAnterior) {
  const hashInput = cadenaInput({
    numero: doc.numero, fecha: doc.fecha, nif: doc.cliente_nif, total: doc.total, hashAnterior,
  })
  const hash = await sha256Hex(hashInput)
  return { hash, hash_anterior: hashAnterior || '', hash_input: hashInput }
}

// El texto que codifica el QR de la hoja impresa. Deliberadamente NO es una
// URL ni imita el formato oficial de la AEAT: es una cadena de verificación
// propia, para que nadie la confunda con el QR real de VeriFactu.
export function datosQR(doc) {
  return `HELM-VERIFICACION (no oficial AEAT)\n`
    + `Factura: ${doc.numero}\nFecha: ${doc.fecha}\nTotal: ${Number(doc.total).toFixed(2)} EUR\n`
    + `Hash: ${(doc.hash || '').slice(0, 16)}…`
}
