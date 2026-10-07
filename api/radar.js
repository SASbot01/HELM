// HELM — Radar: tecnología e ideas nuevas para investigar (solo silvestre).
//
//   GET  ?action=lista  &clientId=   → las ideas de los últimos días y el estado
//   POST ?action=ahora  &clientId=   → lanza una pasada ahora
//
// Lo genera el worker (api/_lib/radar.js). La sección solo la ve silvestre; el
// panel lo gatea por slug, y aquí se exige acceso al perfil igual que el resto.
import { supabase } from './lib/supabase.js'
import { applyCors, rateLimit } from './_lib/auth.js'
import { requireProfileAccess } from './_lib/access.js'
import { encolaRadar } from './_lib/radar.js'

async function enMarcha(clientId) {
  const { data } = await supabase.from('agent_jobs').select('estado, error')
    .eq('tipo', 'radar').eq('payload->>clientId', clientId)
    .order('created_at', { ascending: false }).limit(1)
  const j = data?.[0]
  return {
    corriendo: j ? ['pendiente', 'corriendo'].includes(j.estado) : false,
    fallo: j?.estado === 'error' ? String(j.error || '').slice(0, 300) : '',
  }
}

export default async function handler(req, res) {
  applyCors(req, res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  try {
    const clientId = String(req.query?.clientId || '')
    if (!clientId) return res.status(400).json({ error: 'Falta el perfil' })
    await requireProfileAccess(req, clientId)
    const accion = String(req.query?.action || '')

    if (accion === 'lista') {
      const desde = new Date(Date.now() - 21 * 86_400_000).toISOString()
      const [ideas, estado] = await Promise.all([
        supabase.from('helm_radar').select('id, fecha, tema, titulo, que_es, por_que, idea, url, fuente, senal, created_at')
          .eq('client_id', clientId).gte('created_at', desde).order('created_at', { ascending: false }).limit(120),
        enMarcha(clientId),
      ])
      if (ideas.error) throw ideas.error
      return res.status(200).json({ ideas: ideas.data || [], ...estado })
    }

    if (accion === 'ahora' && req.method === 'POST') {
      const gate = rateLimit({ key: `radar:${clientId}`, max: 6, windowMs: 60 * 60_000 })
      if (!gate.ok) throw Object.assign(new Error('Ya lo has pedido varias veces esta hora. Espera un poco.'), { statusCode: 429 })
      if ((await enMarcha(clientId)).corriendo) return res.status(200).json({ ok: true })
      await encolaRadar(clientId, { origen: 'manual' })
      return res.status(200).json({ ok: true })
    }

    return res.status(400).json({ error: `Acción desconocida: ${accion}` })
  } catch (e) {
    const code = e.statusCode || (/unauthori/i.test(e.message) ? 401 : 500)
    return res.status(code).json({ error: e.message })
  }
}
