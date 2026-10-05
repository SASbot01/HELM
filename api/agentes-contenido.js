// HELM — Equipos IA · equipo de Contenido.
//
// Agente Persona: funde las dos Biblias (empresa + contenido, ya síntesis del
// onboarding) con el framework de Ronda de Stories / Ronda de Reels en un
// documento base por cliente (helm_agente_base). Los demás agentes parten de
// ahí en vez de releer el onboarding entero cada vez.
//
// Agente 1 · Investigación: a partir de esa base, propone el plan del día —
// tres ideas de ronda de historias y tres de reel — y lo deja en
// helm_agente_ideas, una fila por (client_id, fecha).
//
// Acciones:
//   GET  ?action=base        &clientId=                → la base actual (o null)
//   POST ?action=generar-base { clientId }              → genera/regenera la base
//   POST ?action=save-base   { clientId, content }       → guarda una base editada a mano
//   GET  ?action=ideas       &clientId=&fecha=           → ideas de un día (por defecto hoy)
//   GET  ?action=historial   &clientId=&limit=           → últimos días con ideas generadas
//   POST ?action=investigar  { clientId, fecha }         → genera el plan de ese día
import { supabase } from './lib/supabase.js'
import { applyCors, rateLimit, getClientIp } from './_lib/auth.js'
import { requireProfileAccess } from './_lib/access.js'
import { llmChat } from './_lib/llm.js'
import { ESTRATEGIA_CONTENIDO } from './_lib/estrategia-contenido.js'

const MAX_TOKENS_BASE = 3000
const MAX_TOKENS_IDEAS = 2200
const HOY = () => new Date().toISOString().slice(0, 10)

const BASE_SYSTEM = `Eres el Agente Persona del equipo de Contenido: el
estratega que funde la identidad de una cuenta con el método de historias y
reels de la casa, para que los demás agentes trabajen sobre una base sólida
en vez de reinventarla cada vez.

Reglas:
· Español de España, directo, sin relleno de consultora.
· Usa SOLO lo que hay en las dos Biblias. No inventes cifras, logros ni datos.
· Si algo no está en las Biblias, no lo rellenes con una suposición: escribe
  en cursiva "(pendiente: …)" con lo que haría falta.
· El resultado tiene que ser accionable para alguien que hoy mismo va a grabar
  una ronda de historias o un reel — no una redacción de marca genérica.
· Devuelve SOLO markdown, empezando por "# Base de contenido".

Estructura (usa ## para cada sección):
## Quién es esta cuenta — una frase de posicionamiento + el avatar en 2-3 líneas.
## Tono aplicado a cámara — cómo suena esta persona en un frame de 3 segundos:
   energía, vocabulario, qué NO decir nunca.
## Los tres carriles, en esta cuenta — qué significa concretamente Dar,
   Conectar y Vender para ESTE negocio (con 2-3 ejemplos reales del dossier
   por carril, no genéricos).
## Banco de temas — 10-15 temas concretos del nicho de esta cuenta, listos
   para convertirse en mecanismo bautizado (frame 03 / tiempo 04).
## Ofertas y CTA — qué se vende, a qué precio si está en el dossier, y qué
   palabra clave de DM usar como petición.`

const IDEAS_SYSTEM = `Eres el Agente 1 · Investigación del equipo de Contenido.
Tu trabajo es decirle a la cuenta, cada día, exactamente qué grabar: tres
ideas de ronda de historias y tres ideas de reel, listas para producir hoy.

Reglas:
· Cada idea tiene que encajar en una plantilla concreta del framework (A, B,
  C o D) y un carril concreto (dar, conectar, vender).
· El "gancho" es la frase exacta del frame 01 / tiempo 01 — no una
  descripción, la frase tal cual se diría a cámara.
· El "resumen" describe en 1-2 frases cómo se desarrolla el resto de la pieza.
· Varía carriles y plantillas entre las tres ideas de cada bloque: no repitas
  la misma plantilla tres veces seguidas salvo que el día lo pida.
· Basado SIEMPRE en la base de la cuenta: usa sus temas, su tono, su oferta.
  No inventes datos que no estén ahí.
· Responde ÚNICAMENTE con un objeto JSON válido, sin texto antes ni después,
  sin bloque de código markdown. Forma exacta:

{"historias":[{"titulo":"","plantilla":"A","carril":"dar","gancho":"","resumen":"","cta":""},...3 items],
 "reels":[{"titulo":"","plantilla":"A","carril":"dar","gancho":"","resumen":"","cta":""},...3 items]}`

async function getBiblias(clientId) {
  const { data } = await supabase.from('helm_biblia')
    .select('kind, content').eq('client_id', clientId)
  const out = {}
  for (const row of data || []) out[row.kind] = row.content
  return out
}

async function getBase(clientId) {
  const { data } = await supabase.from('helm_agente_base')
    .select('content, status, updated_at').eq('client_id', clientId).maybeSingle()
  return data || null
}

function parseIdeas(raw) {
  const limpio = raw.trim().replace(/^```(json)?/i, '').replace(/```$/, '').trim()
  let json
  try { json = JSON.parse(limpio) } catch {
    const e = new Error('El modelo no devolvió JSON válido. Prueba a regenerar.')
    e.statusCode = 502
    throw e
  }
  const historias = Array.isArray(json.historias) ? json.historias.slice(0, 3) : []
  const reels = Array.isArray(json.reels) ? json.reels.slice(0, 3) : []
  if (historias.length !== 3 || reels.length !== 3) {
    const e = new Error('El modelo no devolvió las seis ideas esperadas. Prueba a regenerar.')
    e.statusCode = 502
    throw e
  }
  return { historias, reels }
}

export default async function handler(req, res) {
  applyCors(req, res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  const action = req.query.action
  const clientId = req.query.clientId || req.body?.clientId || null

  try {
    await requireProfileAccess(req, clientId)
  } catch (err) {
    return res.status(err.statusCode || 401).json({ error: err.message })
  }
  if (!clientId) return res.status(400).json({ error: 'clientId requerido' })

  // GET ?action=base → la base actual del Agente Persona.
  if (req.method === 'GET' && action === 'base') {
    const base = await getBase(clientId)
    return res.status(200).json({ base })
  }

  // POST ?action=save-base → edición manual.
  if (req.method === 'POST' && action === 'save-base') {
    const { content } = req.body || {}
    if (!content?.trim()) return res.status(400).json({ error: 'content requerido' })
    const { data, error } = await supabase.from('helm_agente_base').upsert({
      client_id: clientId, content, status: 'edited', updated_at: new Date().toISOString(),
    }, { onConflict: 'client_id' }).select('content, status, updated_at').single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ base: data })
  }

  // POST ?action=generar-base → funde las Biblias con el framework.
  if (req.method === 'POST' && action === 'generar-base') {
    const gate = rateLimit({ key: `agc-base:${getClientIp(req)}`, max: 10, windowMs: 60_000 })
    if (!gate.ok) {
      res.setHeader('Retry-After', String(gate.retryAfter))
      return res.status(429).json({ error: 'Demasiadas generaciones seguidas.', retryAfter: gate.retryAfter })
    }

    const biblias = await getBiblias(clientId)
    if (!biblias.empresa || !biblias.contenido) {
      return res.status(400).json({ error: 'Faltan las Biblias de este perfil. Completa el onboarding de Empresa y de Contenido antes de generar la base.' })
    }

    const user = `# BIBLIA DE EMPRESA\n\n${biblias.empresa}\n\n---\n\n# BIBLIA DE CONTENIDO\n\n${biblias.contenido}\n\n---\n\n${ESTRATEGIA_CONTENIDO}`
    let content
    try {
      content = await llmChat({
        clientId, system: BASE_SYSTEM, messages: [{ role: 'user', content: user }],
        maxTokens: MAX_TOKENS_BASE, temperature: 0.6,
      })
    } catch (err) {
      return res.status(err.statusCode || 502).json({ error: err.message || 'Error generando la base' })
    }

    const { data, error } = await supabase.from('helm_agente_base').upsert({
      client_id: clientId, content, status: 'generated', updated_at: new Date().toISOString(),
    }, { onConflict: 'client_id' }).select('content, status, updated_at').single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ base: data })
  }

  // GET ?action=ideas → el plan de un día (por defecto hoy).
  if (req.method === 'GET' && action === 'ideas') {
    const fecha = req.query.fecha || HOY()
    const { data } = await supabase.from('helm_agente_ideas')
      .select('fecha, historias, reels, updated_at')
      .eq('client_id', clientId).eq('fecha', fecha).maybeSingle()
    return res.status(200).json({ ideas: data || null })
  }

  // GET ?action=historial → últimos días con plan generado.
  if (req.method === 'GET' && action === 'historial') {
    const limit = Math.min(Number(req.query.limit) || 14, 60)
    const { data } = await supabase.from('helm_agente_ideas')
      .select('fecha, updated_at').eq('client_id', clientId)
      .order('fecha', { ascending: false }).limit(limit)
    return res.status(200).json({ historial: data || [] })
  }

  // POST ?action=investigar → genera (o regenera) el plan de un día.
  if (req.method === 'POST' && action === 'investigar') {
    const gate = rateLimit({ key: `agc-ideas:${getClientIp(req)}`, max: 10, windowMs: 60_000 })
    if (!gate.ok) {
      res.setHeader('Retry-After', String(gate.retryAfter))
      return res.status(429).json({ error: 'Demasiadas generaciones seguidas.', retryAfter: gate.retryAfter })
    }

    const fecha = req.body?.fecha || HOY()
    const base = await getBase(clientId)
    let contexto
    if (base?.content) {
      contexto = `# BASE DE CONTENIDO DE ESTA CUENTA\n\n${base.content}\n\n---\n\n${ESTRATEGIA_CONTENIDO}`
    } else {
      // Sin base todavía: cae en las Biblias directamente para no bloquear al
      // usuario, pero avisando de que conviene generar la base primero.
      const biblias = await getBiblias(clientId)
      if (!biblias.empresa && !biblias.contenido) {
        return res.status(400).json({ error: 'Este perfil no tiene ni base ni Biblias todavía. Completa el onboarding primero.' })
      }
      contexto = `# BIBLIA DE EMPRESA\n\n${biblias.empresa || '(pendiente)'}\n\n---\n\n# BIBLIA DE CONTENIDO\n\n${biblias.contenido || '(pendiente)'}\n\n---\n\n${ESTRATEGIA_CONTENIDO}`
    }

    const user = `${contexto}\n\n---\n\nFecha del plan: ${fecha}. Propón el plan de hoy.`
    let raw
    try {
      raw = await llmChat({
        clientId, system: IDEAS_SYSTEM, messages: [{ role: 'user', content: user }],
        maxTokens: MAX_TOKENS_IDEAS, temperature: 0.75,
      })
    } catch (err) {
      return res.status(err.statusCode || 502).json({ error: err.message || 'Error generando el plan' })
    }

    let ideas
    try { ideas = parseIdeas(raw) } catch (err) {
      return res.status(err.statusCode || 502).json({ error: err.message })
    }

    const { data, error } = await supabase.from('helm_agente_ideas').upsert({
      client_id: clientId, fecha, historias: ideas.historias, reels: ideas.reels,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'client_id,fecha' }).select('fecha, historias, reels, updated_at').single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ideas: data })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
