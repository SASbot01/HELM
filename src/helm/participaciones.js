// La parte que se lleva un perfil de las ventas de otro (Silvestre AI: el 35 %
// de Detrás de Cámara y el 50 % de web-seller; ver api/participaciones.js), o
// una cantidad fija al mes (200 € de En Forma con Hugo desde octubre de 2026).
//
// El porcentaje se aplica DESPUÉS de repartir cada venta en sus cobros
// (ventasPorCobro), con los importes del origen: así la parte se reparte mes a
// mes exactamente igual que en el perfil de origen, sin que el redondeo del
// porcentaje cambie qué mensualidad se parte y cuál no.
import { ventasPorCobro, hoyLocal } from './cobrosPrevistos.js'

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100

/** Una venta (o un cobro) del origen convertida en la parte: importes por el
 *  porcentaje y marcada con su origen. */
export function parteDe(venta, porcentaje, origen) {
  const f = Number(porcentaje) / 100
  const por = (x) => (x == null || x === '' ? x : r2(Number(x) * f))
  return {
    ...venta,
    id: `part:${origen.slug}:${venta.id}`,
    revenue: por(venta.revenue),
    cash_collected: por(venta.cash_collected),
    installment_amount: por(venta.installment_amount),
    product: `${origen.name} · ${Number(porcentaje)} %`,
    producto_origen: venta.product || '',
    participacion: { origen: origen.slug, nombre: origen.name, porcentaje: Number(porcentaje) },
  }
}

/** Los cobros de la parte como movimientos de Finanzas: un ingreso por cada
 *  pago de cada cliente, en su fecha y por lo cobrado. No se guardan: se
 *  recalculan de las ventas reales, así que no se pueden borrar a mano. */
export function movimientosDe(cobros) {
  return (cobros || [])
    .filter(c => Number(c.cash_collected) > 0 && c.date)
    .map(c => ({
      id: c.id,
      date: String(c.date).slice(0, 10),
      category: 'Ingreso',
      description: c.participacion.importe_mensual
        ? `Tu parte fija · ${c.participacion.nombre} · ${c.participacion.importe_mensual} € al mes`
        : [`Tu parte (${c.participacion.porcentaje} %) · ${c.participacion.nombre}`, c.producto_origen, c.client_name]
          .filter(Boolean).join(' · '),
      amount: Number(c.cash_collected),
      person_name: '', person_role: '', contact_ids: [],
      participacion: c.participacion,
    }))
}

/** Una cantidad fija al mes: un cobro el día de «desde» de cada mes, del mes
 *  de «desde» al de hoy (el que aún no ha empezado no cuenta). */
export function cobrosFijos({ origen, importe_mensual: importe, desde }, hoy = hoyLocal()) {
  const [ay, am, dia] = String(desde || '').slice(0, 10).split('-').map(Number)
  const [hy, hm] = String(hoy).slice(0, 7).split('-').map(Number)
  if (!ay || !am || !(Number(importe) > 0)) return []
  const cobros = []
  for (let y = ay, m = am; y < hy || (y === hy && m <= hm); m === 12 ? (y++, m = 1) : m++) {
    const mes = `${y}-${String(m).padStart(2, '0')}`
    cobros.push({
      id: `fijo:${origen.slug}:${mes}`, date: `${mes}-${String(dia || 1).padStart(2, '0')}`,
      client_name: origen.name, product: `${origen.name} · ${Number(importe)} € al mes`, producto_origen: 'Cantidad fija',
      payment_type: 'Fijo mensual', status: 'won', revenue: Number(importe), cash_collected: Number(importe),
      participacion: { origen: origen.slug, nombre: origen.name, importe_mensual: Number(importe) },
    })
    if (cobros.length > 240) break
  }
  return cobros
}

/** Lo que devuelve api/participaciones.js, listo para el Informe: `ventas`
 *  (enteras, para planes y mensualidades), `cobros` (repartidos por mes),
 *  ya con el porcentaje y sin las canceladas, y `fijos` (las cantidades fijas
 *  al mes, que suman en «Mensualidades»). */
export function partesDe(participaciones, { esCancelada, hoy = hoyLocal() }) {
  const ventas = []
  const cobros = []
  const fijos = []
  for (const p of participaciones || []) {
    if (p.importe_mensual != null) {
      const suyos = cobrosFijos(p, hoy)
      cobros.push(...suyos)
      if (suyos.length) fijos.push({ nombre: p.origen.name, importe: Number(p.importe_mensual) })
      continue
    }
    const vivas = (p.ventas || []).filter(v => !esCancelada(v))
    ventas.push(...vivas.map(v => parteDe(v, p.porcentaje, p.origen)))
    cobros.push(...ventasPorCobro(vivas).map(v => parteDe(v, p.porcentaje, p.origen)))
  }
  return { ventas, cobros, fijos }
}
