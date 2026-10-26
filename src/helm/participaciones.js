// La parte que se lleva un perfil de las ventas de otro (Silvestre AI: el 35 %
// de Detrás de Cámara y el 50 % de web-seller; ver api/participaciones.js).
//
// El porcentaje se aplica DESPUÉS de repartir cada venta en sus cobros
// (ventasPorCobro), con los importes del origen: así la parte se reparte mes a
// mes exactamente igual que en el perfil de origen, sin que el redondeo del
// porcentaje cambie qué mensualidad se parte y cuál no.
import { ventasPorCobro } from './cobrosPrevistos.js'

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
      description: [`Tu parte (${c.participacion.porcentaje} %) · ${c.participacion.nombre}`, c.producto_origen, c.client_name]
        .filter(Boolean).join(' · '),
      amount: Number(c.cash_collected),
      person_name: '', person_role: '', contact_ids: [],
      participacion: c.participacion,
    }))
}

/** Lo que devuelve api/participaciones.js, listo para el Informe: `ventas`
 *  (enteras, para planes y mensualidades) y `cobros` (repartidos por mes),
 *  las dos ya con el porcentaje y sin las canceladas. */
export function partesDe(participaciones, { esCancelada }) {
  const ventas = []
  const cobros = []
  for (const p of participaciones || []) {
    const vivas = (p.ventas || []).filter(v => !esCancelada(v))
    ventas.push(...vivas.map(v => parteDe(v, p.porcentaje, p.origen)))
    cobros.push(...ventasPorCobro(vivas).map(v => parteDe(v, p.porcentaje, p.origen)))
  }
  return { ventas, cobros }
}
