// HELM — Participaciones: la parte que se lleva un perfil de lo que cobra otro
// (migrations/111_participaciones.sql).
//
//   GET ?clientId=<quien cobra la parte>
//     → { participaciones: [{ origen: { slug, name }, porcentaje,
//          ventas: [las ventas del origen, con los importes ya multiplicados] }] }
//
// Las ventas salen con sus mismos campos (cliente, fechas, cuotas…) y los
// importes por el porcentaje, para que el Informe las sume como las propias y
// reparta cada cobro en su mes con ventasPorCobro. Solo se leen si los dos
// perfiles son de la misma agencia: una participación mal puesta no puede abrir
// las ventas de otra.
import { supabase } from './lib/supabase.js'
import { applyCors } from './_lib/auth.js'
import { requireProfileAccess, agenciaDe } from './_lib/access.js'
import { todasLasFilas } from './_lib/filas.js'

const CAMPOS = 'id, revenue, cash_collected, date, client_name, product, status, payment_type, notes, ' +
  'installments_total, installments_paid, installment_amount, plan_start, plan_end'
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100

/** Una venta del origen convertida en la parte: importes por el porcentaje. */
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
    participacion: { origen: origen.slug, porcentaje: Number(porcentaje) },
  }
}

export default async function handler(req, res) {
  applyCors(req, res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' })
  try {
    const clientId = String(req.query?.clientId || '')
    if (!clientId) return res.status(400).json({ error: 'Falta el perfil' })
    await requireProfileAccess(req, clientId)

    const { data: filas, error } = await supabase.from('helm_participaciones')
      .select('origen_id, porcentaje').eq('client_id', clientId).eq('activa', true)
    if (error) throw error
    const ids = (filas || []).map(p => p.origen_id)
    const { data: perfiles, error: e2 } = ids.length
      ? await supabase.from('clients').select('id, slug, name').in('id', ids)
      : { data: [], error: null }
    if (e2) throw e2
    const porId = new Map((perfiles || []).map(c => [c.id, c]))

    const mia = await agenciaDe(clientId)
    const participaciones = []
    for (const p of filas || []) {
      const origen = porId.get(p.origen_id)
      if (!origen || !mia || (await agenciaDe(p.origen_id)) !== mia) continue
      const ventas = await todasLasFilas(() => supabase.from('sales').select(CAMPOS).eq('client_id', p.origen_id).order('id'))
      participaciones.push({
        origen: { slug: origen.slug, name: origen.name },
        porcentaje: Number(p.porcentaje),
        ventas: ventas.map(v => parteDe(v, p.porcentaje, origen)),
      })
    }
    return res.status(200).json({ participaciones })
  } catch (e) {
    const status = e.statusCode || 500
    if (status >= 500) console.error('[participaciones]', e)
    return res.status(status).json({ error: status >= 500 ? 'Error interno' : e.message })
  }
}
