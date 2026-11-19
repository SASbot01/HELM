// HELM — Oportunidades comerciales de un lead (ver api/_lib/oportunidades.js).
//
//   GET  ?action=lead      &clientId=&contactId=  → { sector, senales, analisis }
//        Si el sector todavía no tiene análisis, se genera en ese momento
//        (unos segundos) y queda guardado para todos los leads del sector.
//   POST ?action=regenerar &clientId=  { contactId }  → lo mismo, rehaciendo el
//        análisis del sector (solo el administrador de la agencia).
import { supabase } from './lib/supabase.js'
import { applyCors, rateLimit } from './_lib/auth.js'
import { requireProfileAccess, administraAgencia, agenciaDe } from './_lib/access.js'
import { sectorDe, senalesDe, guardado, generar } from './_lib/oportunidades.js'

function falla(msg, code = 400) {
  const e = new Error(msg)
  e.statusCode = code
  return e
}

export default async function handler(req, res) {
  applyCors(req, res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  try {
    const clientId = String(req.query?.clientId || '')
    if (!clientId) return res.status(400).json({ error: 'Falta el perfil' })
    const auth = await requireProfileAccess(req, clientId)
    const accion = String(req.query?.action || '')
    const contactId = String(req.query?.contactId || req.body?.contactId || '')
    if (!contactId) throw falla('Falta el contacto')

    const { data: contacto, error } = await supabase.from('crm_contacts')
      .select('id, name, tags, notes, website, position, custom_fields')
      .eq('id', contactId).eq('client_id', clientId).maybeSingle()
    if (error) throw error
    if (!contacto) throw falla('No encuentro ese contacto', 404)

    const sector = sectorDe(contacto)
    const senales = senalesDe(contacto)
    if (!sector) return res.status(200).json({ sector: null, senales, analisis: null })

    const regenerar = accion === 'regenerar' && req.method === 'POST'
    if (regenerar && !administraAgencia(auth, await agenciaDe(clientId))) {
      throw falla('Solo el administrador puede rehacer el análisis', 403)
    }
    if (accion !== 'lead' && !regenerar) throw falla('Acción desconocida')

    let analisis = regenerar ? null : await guardado(clientId, sector.clave)
    if (!analisis) {
      // Cada sector nuevo es una llamada a la IA: que un bucle no la dispare sin fin.
      const gate = rateLimit({ key: `oportunidades:${clientId}`, max: 30, windowMs: 10 * 60_000 })
      if (!gate.ok) throw falla('Demasiados análisis seguidos. Espera unos minutos.', 429)
      try {
        analisis = await generar(clientId, sector.clave, sector.nombre)
      } catch (e) {
        // Un 401 de Anthropic (clave mala o revocada) no puede salir como 401:
        // el panel lo tomaría por sesión caducada y echaría al cold caller.
        if (e.statusCode === 401 || e.statusCode === 403 || /modelo local|not found|ECONNREFUSED|fetch failed|clave/i.test(e.message)) {
          throw falla('La IA de este perfil no está disponible ahora mismo. Hay que conectar Claude en Ajustes → IA.', 503)
        }
        throw e
      }
    }
    return res.status(200).json({ sector, senales, analisis })
  } catch (err) {
    const code = err.statusCode || 500
    if (code >= 500) console.error('[oportunidades]', err)
    return res.status(code).json({ error: err.message || 'Error' })
  }
}
