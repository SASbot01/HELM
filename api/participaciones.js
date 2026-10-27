// HELM — Participaciones: la parte que se lleva un perfil de lo que cobra otro
// (migrations/111_participaciones.sql).
//
//   GET ?clientId=<quien cobra la parte>
//     → { participaciones: [{ origen: { slug, name }, porcentaje, ventas: [las del origen, tal cual] }
//                         | { origen, importe_mensual, desde }] }
//
// Una participación es un porcentaje de las ventas del origen (menos las
// `excluidas`, que van enteras al origen) o una cantidad fija al mes desde una
// fecha (migración 112): esa no lee ninguna venta.
//
// El Informe las reparte en cobros y les aplica el porcentaje
// (src/helm/participaciones.js). Solo salen las de un origen de la misma
// agencia y que quien mira puede ver él mismo: un miembro del equipo de
// Silvestre con rol limitado no lee por aquí las ventas de Detrás de Cámara.
// Una participación mal puesta tampoco abre las ventas de otra agencia.
import { supabase } from './lib/supabase.js'
import { applyCors } from './_lib/auth.js'
import { requireProfileAccess, agenciaDe, puedeVerPerfil } from './_lib/access.js'
import { todasLasFilas } from './_lib/filas.js'

const CAMPOS = 'id, revenue, cash_collected, date, client_name, product, status, payment_type, notes, ' +
  'installments_total, installments_paid, installment_amount, plan_start, plan_end'
export default async function handler(req, res) {
  applyCors(req, res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' })
  try {
    const clientId = String(req.query?.clientId || '')
    if (!clientId) return res.status(400).json({ error: 'Falta el perfil' })
    const auth = await requireProfileAccess(req, clientId)

    const { data: filas, error } = await supabase.from('helm_participaciones')
      .select('origen_id, porcentaje, importe_mensual, desde, excluidas').eq('client_id', clientId).eq('activa', true)
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
      if (!(await puedeVerPerfil(auth, p.origen_id))) continue
      const de = { slug: origen.slug, name: origen.name }
      if (p.importe_mensual != null) {
        participaciones.push({ origen: de, importe_mensual: Number(p.importe_mensual), desde: p.desde })
        continue
      }
      const fuera = new Set(p.excluidas || [])
      const ventas = await todasLasFilas(() => supabase.from('sales').select(CAMPOS).eq('client_id', p.origen_id).order('id'))
      participaciones.push({ origen: de, porcentaje: Number(p.porcentaje), ventas: ventas.filter(v => !fuera.has(v.id)) })
    }
    return res.status(200).json({ participaciones })
  } catch (e) {
    const status = e.statusCode || 500
    if (status >= 500) console.error('[participaciones]', e)
    return res.status(status).json({ error: status >= 500 ? 'Error interno' : e.message })
  }
}
