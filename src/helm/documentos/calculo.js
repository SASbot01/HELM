// HELM — presupuestos y facturas: números y cálculo de líneas.
//
// AVISO que hay que repetir aquí porque es el sitio donde alguien podría
// olvidarlo: esto genera un correlativo normal, NO el hash encadenado de
// VeriFactu. Un despacho que necesite facturación electrónica conforme
// necesita la tarea aparte — esto sirve para presupuestar y facturar mientras
// tanto, no lo sustituye.
export const PREFIJO = { presupuesto: 'PRE', factura: 'FAC' }

export const IVA_DEFECTO = 21

// El siguiente número de la serie de ESTE año. Se recalcula contra los que ya
// existen en vez de guardar un contador aparte: así dos personas creando a la
// vez no pueden coincidir en el mismo número si una de las dos falla y hay que
// reintentar, y no hace falta una tabla de secuencias que mantener.
export function siguienteNumero(documentos, tipo, año = new Date().getFullYear()) {
  const prefijo = `${PREFIJO[tipo]}-${año}-`
  const usados = documentos
    .filter(d => d.tipo === tipo && d.numero?.startsWith(prefijo))
    .map(d => parseInt(d.numero.slice(prefijo.length), 10))
    .filter(n => Number.isFinite(n))
  const siguiente = (usados.length ? Math.max(...usados) : 0) + 1
  return `${prefijo}${String(siguiente).padStart(4, '0')}`
}

// Una línea vacía para el editor.
export const lineaVacia = () => ({ concepto: '', cantidad: 1, precio: 0, descuento_pct: 0 })

// Importe de una línea, con su descuento aplicado.
export function importeLinea(l) {
  const base = (Number(l.cantidad) || 0) * (Number(l.precio) || 0)
  const dto = (Number(l.descuento_pct) || 0) / 100
  return base * (1 - dto)
}

export function calcularTotales(lineas, ivaPct = IVA_DEFECTO) {
  const subtotal = lineas.reduce((a, l) => a + importeLinea(l), 0)
  const iva = subtotal * (Number(ivaPct) / 100)
  return { subtotal, iva, total: subtotal + iva }
}

export const ESTADOS = {
  presupuesto: [
    { key: 'borrador', label: 'Borrador', tono: '' },
    { key: 'enviado', label: 'Enviado', tono: 'cyan' },
    { key: 'pagado', label: 'Aceptado', tono: 'green' },
    { key: 'anulado', label: 'Rechazado', tono: 'red' },
  ],
  factura: [
    { key: 'borrador', label: 'Borrador', tono: '' },
    { key: 'enviado', label: 'Enviada', tono: 'cyan' },
    { key: 'pagado', label: 'Cobrada', tono: 'green' },
    { key: 'vencido', label: 'Vencida', tono: 'red' },
    { key: 'anulado', label: 'Anulada', tono: 'red' },
  ],
}
export const estadoLabel = (tipo, key) =>
  ESTADOS[tipo]?.find(e => e.key === key)?.label || key
