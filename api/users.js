// HELM — panel de usuarios (/usersadmin) y marca de guía vista.
//
//   POST ?action=guide-done   → cualquier usuario logueado marca SU guía vista
//   GET  ?action=list         → (superadmin) los de SU agencia: sus
//                               administradores + los accesos de sus perfiles
//                               (la plataforma ve todos)
//   POST ?action=set-active   → (superadmin) activa/desactiva; aprobar un acceso
//                               de cliente activa también su negocio
import { supabase } from './lib/supabase.js'
import { applyCors, validateAuth, requireSuperAdmin } from './_lib/auth.js'
import { perfilesVisibles } from './_lib/access.js'

export default async function handler(req, res) {
  applyCors(req, res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  const action = req.query.action

  // El usuario marca su propia guía como vista (no requiere superadmin).
  if (req.method === 'POST' && action === 'guide-done') {
    let auth
    try { auth = await validateAuth(req, { required: true }) }
    catch (err) { return res.status(err.statusCode || 401).json({ error: err.message }) }
    if (auth.userId) await supabase.from('team').update({ guide_seen: true }).eq('id', auth.userId)
    return res.status(200).json({ success: true })
  }

  // El resto es solo para superadmins, y cada uno con lo de su agencia: sin
  // esto, el administrador de una agencia vería (y desactivaría) a la gente
  // de las demás.
  let auth
  try { auth = await requireSuperAdmin(req) }
  catch (err) { return res.status(err.statusCode || 403).json({ error: err.message }) }
  let ids
  try { ids = await perfilesVisibles(auth) }
  catch (err) { return res.status(500).json({ error: err.message }) }
  const deLaAgencia = (q, col = 'client_id') => (ids ? q.in(col, ids.length ? ids : ['00000000-0000-0000-0000-000000000000']) : q)
  const admins = (q) => (auth.plataforma ? q : q.eq('agencia_id', auth.agenciaId))

  if (req.method === 'GET' && action === 'list') {
    const [{ data: team }, { data: sas }, { data: clients }] = await Promise.all([
      deLaAgencia(supabase.from('team').select('id, client_id, name, email, role, active, guide_seen, created_at')).order('created_at', { ascending: false }),
      admins(supabase.from('superadmins').select('id, email, name, active, created_at')).order('created_at', { ascending: false }),
      deLaAgencia(supabase.from('clients').select('id, name, slug, active'), 'id'),
    ])
    const cmap = Object.fromEntries((clients || []).map(c => [c.id, c]))
    const users = [
      ...(sas || []).map(s => ({
        type: 'superadmin', id: s.id, name: s.name || s.email, email: s.email,
        active: s.active, role: 'superadmin', business: null, created_at: s.created_at,
      })),
      ...(team || []).map(t => ({
        type: 'team', id: t.id, name: t.name, email: t.email, active: t.active,
        role: t.role, guideSeen: t.guide_seen, clientId: t.client_id,
        business: cmap[t.client_id] ? { name: cmap[t.client_id].name, slug: cmap[t.client_id].slug, active: cmap[t.client_id].active } : null,
        created_at: t.created_at,
      })),
    ]
    return res.status(200).json({ users })
  }

  if (req.method === 'POST' && action === 'set-active') {
    const { type, id, active } = req.body || {}
    if (!['team', 'superadmin'].includes(type) || !id) return res.status(400).json({ error: 'type e id requeridos' })
    const table = type === 'team' ? 'team' : 'superadmins'
    // Solo a gente de su agencia. Y nadie se desactiva a sí mismo: se quedaría
    // fuera sin nadie que le vuelva a abrir.
    if (type === 'superadmin' && id === auth.userId) return res.status(400).json({ error: 'No puedes desactivar tu propia cuenta' })
    const { data: suyo } = type === 'team'
      ? await deLaAgencia(supabase.from('team').select('id').eq('id', id)).maybeSingle()
      : await admins(supabase.from('superadmins').select('id, plataforma').eq('id', id)).maybeSingle()
    if (!suyo) return res.status(404).json({ error: 'Ese usuario no es de tu agencia' })
    // A la cuenta de la plataforma solo la toca la plataforma.
    if (suyo.plataforma && !auth.plataforma) return res.status(403).json({ error: 'Esa cuenta no se puede tocar desde aquí' })
    const { error } = await supabase.from(table).update({ active: !!active }).eq('id', id)
    if (error) return res.status(500).json({ error: error.message })

    // Aprobar un acceso de cliente activa también su negocio (que se creó pendiente).
    if (type === 'team' && active) {
      const { data: row } = await supabase.from('team').select('client_id').eq('id', id).maybeSingle()
      if (row?.client_id) await supabase.from('clients').update({ active: true }).eq('id', row.client_id)
    }
    return res.status(200).json({ success: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
