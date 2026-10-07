// HELM — Avatar: el estudio de los clientes de un perfil.
//
//   GET  ?action=lista  &clientId=   → el estudio, las fichas por contacto y si
//                                      hay una pasada en marcha
//   POST ?action=ahora  &clientId=   → lanza el estudio ahora
//
// Lo genera el worker (api/_lib/avatar.js). Aquí solo se lee y se pide.
import { supabase } from './lib/supabase.js'
import { applyCors, rateLimit } from './_lib/auth.js'
import { requireProfileAccess } from './_lib/access.js'
import { encolaAvatar } from './_lib/avatar.js'

async function enMarcha(clientId) {
  const { data } = await supabase.from('agent_jobs').select('estado, error')
    .eq('tipo', 'avatar').eq('payload->>clientId', clientId)
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
      const [estudio, fichas, estado] = await Promise.all([
        supabase.from('helm_avatar').select('resumen, n_contactos, n_analizados, generado_en').eq('client_id', clientId).maybeSingle(),
        supabase.from('helm_avatar_contactos').select('nombre, genero, genero_conf, edad_rango, ubicacion, facturacion, perfil, interes')
          .eq('client_id', clientId).order('analizado_en', { ascending: false }).limit(400),
        enMarcha(clientId),
      ])
      if (estudio.error) throw estudio.error
      return res.status(200).json({ estudio: estudio.data || null, fichas: fichas.data || [], ...estado })
    }

    if (accion === 'ahora' && req.method === 'POST') {
      const gate = rateLimit({ key: `avatar:${clientId}`, max: 6, windowMs: 60 * 60_000 })
      if (!gate.ok) throw Object.assign(new Error('Ya lo has pedido varias veces esta hora. Espera un poco.'), { statusCode: 429 })
      if ((await enMarcha(clientId)).corriendo) return res.status(200).json({ ok: true })
      await encolaAvatar(clientId, { origen: 'manual' })
      return res.status(200).json({ ok: true })
    }

    return res.status(400).json({ error: `Acción desconocida: ${accion}` })
  } catch (e) {
    const code = e.statusCode || (/unauthori/i.test(e.message) ? 401 : 500)
    return res.status(code).json({ error: e.message })
  }
}
