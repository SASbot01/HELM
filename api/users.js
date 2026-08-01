// HELM — panel de usuarios (/usersadmin) y marca de guía vista.
//
//   POST ?action=guide-done   → cualquier usuario logueado marca SU guía vista
//   GET  ?action=list         → (superadmin) todos: superadmins + accesos team
//   POST ?action=set-active   → (superadmin) activa/desactiva; aprobar un acceso
//                               de cliente activa también su negocio
import { supabase } from './lib/supabase.js'
import { applyCors, validateAuth, requireSuperAdmin } from './_lib/auth.js'

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

  // El resto es solo para superadmins.
  try { await requireSuperAdmin(req) }
  catch (err) { return res.status(err.statusCode || 403).json({ error: err.message }) }

  if (req.method === 'GET' && action === 'list') {
    const [{ data: team }, { data: sas }, { data: clients }] = await Promise.all([
      supabase.from('team').select('id, client_id, name, email, role, active, guide_seen, created_at').order('created_at', { ascending: false }),
      supabase.from('superadmins').select('id, email, name, active, created_at').order('created_at', { ascending: false }),
      supabase.from('clients').select('id, name, slug, active'),
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
