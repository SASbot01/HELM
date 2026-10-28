// HELM — la campana del panel.
//
//   GET  ?action=lista    &clientId=          → { notificaciones, sinLeer }
//   POST ?action=leer     &clientId=  { ids? } → marca como leídas (todas si no hay ids)
//   GET  ?action=resumen                       → solo superadmin: sin leer por
//                                                perfil, para el tablero de perfiles
//
// Las notificaciones las escribe el servidor (api/_lib/notificar.js). Aquí
// solo se leen y se marcan.
import { supabase } from './lib/supabase.js'
import { applyCors, requireSuperAdmin } from './_lib/auth.js'
import { requireProfileAccess, perfilesVisibles } from './_lib/access.js'

export default async function handler(req, res) {
  applyCors(req, res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  try {
    const accion = String(req.query?.action || '')

    if (accion === 'resumen') {
      const auth = await requireSuperAdmin(req)
      const ids = await perfilesVisibles(auth)
      let q = supabase.from('helm_notificaciones')
        .select('client_id, nivel').is('leida_at', null).limit(5000)
      if (ids) q = q.in('client_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])
      const { data, error } = await q
      if (error) throw error
      const porPerfil = {}
      for (const n of data || []) {
        const p = porPerfil[n.client_id] ||= { sinLeer: 0, errores: 0 }
        p.sinLeer++
        if (n.nivel === 'error') p.errores++
      }
      return res.status(200).json({ porPerfil })
    }

    const clientId = String(req.query?.clientId || '')
    if (!clientId) return res.status(400).json({ error: 'Falta el perfil' })
    await requireProfileAccess(req, clientId)

    if (accion === 'lista') {
      const [lista, sinLeer] = await Promise.all([
        supabase.from('helm_notificaciones')
          .select('id, tipo, nivel, titulo, cuerpo, destino, leida_at, created_at')
          .eq('client_id', clientId).order('created_at', { ascending: false }).limit(40),
        supabase.from('helm_notificaciones').select('id', { count: 'exact', head: true })
          .eq('client_id', clientId).is('leida_at', null),
      ])
      if (lista.error) throw lista.error
      return res.status(200).json({ notificaciones: lista.data || [], sinLeer: sinLeer.count || 0 })
    }

    if (accion === 'leer' && req.method === 'POST') {
      const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter(Boolean).slice(0, 200) : null
      let q = supabase.from('helm_notificaciones').update({ leida_at: new Date().toISOString() })
        .eq('client_id', clientId).is('leida_at', null)
      if (ids?.length) q = q.in('id', ids)
      const { error } = await q
      if (error) throw error
      return res.status(200).json({ ok: true })
    }

    return res.status(400).json({ error: `Acción desconocida: ${accion}` })
  } catch (e) {
    const code = e.statusCode || (/unauthori/i.test(e.message) ? 401 : 500)
    return res.status(code).json({ error: e.message })
  }
}
