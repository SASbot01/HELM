// HELM — la oficina de un agente. El estado vivo y el chat con él.
//
//   GET  ?action=estado    &clientId=&agente=            → qué hace, qué hace ahora, qué falta
//   GET  ?action=historial &clientId=&agente=            → el hilo de chat
//   POST ?action=hablar    { clientId, agente, texto, recordar? } → responde (gasta créditos)
//   POST ?action=instruir  { clientId, agente, texto }   → guarda una indicación permanente
//
// Es lo que hace que ningún agente «se vea vacío»: aunque no tenga trabajo,
// dice qué hace y cómo se le pide, y puedes hablar con él y dejarle
// instrucciones que recordará. No ejecuta encargos que todavía no sabe hacer:
// es honrado con sus límites (ver api/_lib/oficina.js).
import { applyCors, rateLimit, getClientIp } from './_lib/auth.js'
import { requireProfileAccess } from './_lib/access.js'
import { AGENTES_OFICINA, estadoDe, historial, conversa, guardaRegla } from './_lib/oficina.js'

const MAX_TEXTO = 4000

export default async function handler(req, res) {
  applyCors(req, res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  const action = req.query.action
  const gate = rateLimit({ key: `oficina:${getClientIp(req)}`, max: 90, windowMs: 60_000 })
  if (!gate.ok) {
    res.setHeader('Retry-After', String(gate.retryAfter))
    return res.status(429).json({ error: 'Demasiadas peticiones seguidas', retryAfter: gate.retryAfter })
  }

  const clientId = req.query.clientId || req.body?.clientId
  if (req.query?.clientId && req.body?.clientId && String(req.query.clientId) !== String(req.body.clientId)) {
    return res.status(400).json({ error: 'El perfil de la URL y el del cuerpo no coinciden' })
  }
  if (!clientId) return res.status(400).json({ error: 'clientId requerido' })

  const agente = String(req.query.agente || req.body?.agente || '')
  if (!AGENTES_OFICINA.includes(agente)) return res.status(400).json({ error: 'Agente desconocido' })

  let auth
  try {
    auth = await requireProfileAccess(req, clientId)
  } catch (err) {
    return res.status(err.statusCode || 401).json({ error: err.message })
  }

  try {
    if (req.method === 'GET' && action === 'estado') {
      return res.status(200).json({ estado: await estadoDe(clientId, agente) })
    }

    if (req.method === 'GET' && action === 'historial') {
      return res.status(200).json({ mensajes: await historial(clientId, agente, 40) })
    }

    if (req.method === 'POST' && action === 'hablar') {
      const texto = String(req.body?.texto || '').trim()
      if (!texto) return res.status(400).json({ error: 'Escribe algo' })
      if (texto.length > MAX_TEXTO) return res.status(400).json({ error: 'El mensaje es demasiado largo' })
      try {
        const r = await conversa(clientId, agente, texto, { recordar: Boolean(req.body?.recordar) })
        return res.status(200).json(r)
      } catch (err) {
        return res.status(err.statusCode || 502).json({ error: err.message || 'El agente no ha podido responder' })
      }
    }

    if (req.method === 'POST' && action === 'instruir') {
      const texto = String(req.body?.texto || '').trim()
      if (!texto) return res.status(400).json({ error: 'Escribe la indicación' })
      if (texto.length > MAX_TEXTO) return res.status(400).json({ error: 'La indicación es demasiado larga' })
      const reglas = await guardaRegla(clientId, agente, texto)
      return res.status(200).json({ reglas })
    }

    return res.status(400).json({ error: 'Acción no válida' })
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Error interno' })
  }
}
