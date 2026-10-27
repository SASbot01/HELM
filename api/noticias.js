// HELM — Noticias: las tres noticias del día de IA y ciberseguridad.
//
// Las elige el worker (api/_lib/noticias.js): cada mañana, salvo en los perfiles
// que van a demanda (brevesADemanda), que solo buscan con «Buscar ahora». Aquí
// solo se leen y se pide una pasada a mano.
//
//   GET  ?action=lista  &clientId=   → las de hoy y las de las dos últimas
//                                      semanas, y si hay una pasada en marcha
//   POST ?action=ahora  &clientId=   → encola una pasada ahora
import { supabase } from './lib/supabase.js'
import { applyCors, rateLimit } from './_lib/auth.js'
import { requireProfileAccess } from './_lib/access.js'
import { diaMadrid, encolaNoticias } from './_lib/noticias.js'

function falla(msg, code = 400) {
  const e = new Error(msg)
  e.statusCode = code
  return e
}

async function enMarcha(clientId) {
  const { data, error } = await supabase.from('agent_jobs').select('id, estado, error')
    .eq('tipo', 'noticias').eq('payload->>clientId', clientId)
    .order('created_at', { ascending: false }).limit(1)
  if (error) throw error
  const j = data?.[0]
  return {
    buscando: j ? ['pendiente', 'corriendo'].includes(j.estado) : false,
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
      const desde = diaMadrid(new Date(Date.now() - 14 * 86_400_000))
      const [noticias, estado] = await Promise.all([
        supabase.from('helm_noticias')
          .select('id, fecha, puesto, tema, titular, resumen, por_que, url, fuente, publicado_en')
          .eq('client_id', clientId).gte('fecha', desde)
          .order('fecha', { ascending: false }).order('puesto'),
        enMarcha(clientId),
      ])
      if (noticias.error) throw noticias.error
      return res.status(200).json({ hoy: diaMadrid(), noticias: noticias.data || [], ...estado })
    }

    if (accion === 'ahora' && req.method === 'POST') {
      // Cada pasada lee quince fuentes y cuesta una llamada al modelo.
      const gate = rateLimit({ key: `noticias:${clientId}`, max: 3, windowMs: 60 * 60_000 })
      if (!gate.ok) throw falla('Ya las has pedido varias veces en la última hora. Espera un poco.', 429)
      if ((await enMarcha(clientId)).buscando) return res.status(200).json({ ok: true })
      await encolaNoticias(clientId, { origen: 'manual', clave: `noticias:${clientId}:manual:${Date.now()}` })
      return res.status(200).json({ ok: true })
    }

    return res.status(400).json({ error: `Acción desconocida: ${accion}` })
  } catch (e) {
    const code = e.statusCode || (/unauthori/i.test(e.message) ? 401 : 500)
    return res.status(code).json({ error: e.message })
  }
}
