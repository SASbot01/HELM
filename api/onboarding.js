// HELM — generación de la Biblia del perfil a partir del onboarding.
//
// El onboarding de contenido (respuestas en helm_onboarding) se sintetiza en
// dos documentos con el modelo LOCAL (Ollama), que se guardan en helm_biblia y
// que el chat inyecta luego en su system prompt.
//
// Acciones:
//   POST ?action=generate  { clientId, kind, dossier }  → genera y guarda una Biblia
//   GET  ?action=biblia     &clientId=                    → devuelve las dos Biblias
//   POST ?action=save      { clientId, kind, content }   → guarda una Biblia editada
import { supabase } from './lib/supabase.js'
import { applyCors, rateLimit, getClientIp } from './_lib/auth.js'
import { requireProfileAccess } from './_lib/access.js'
import { COPY_KNOWLEDGE } from './_lib/copy-knowledge.js'
import { llmChat } from './_lib/llm.js'

const MAX_TOKENS = 3500

// Cada Biblia: cómo se presenta el rol y qué estructura debe seguir el modelo.
const SPECS = {
  empresa: {
    title: 'Biblia de la Empresa',
    system: `Eres estratega de marca. A partir del dossier de onboarding de un
negocio, redactas su BIBLIA DE EMPRESA: el documento maestro de identidad y
posicionamiento del que salen todas las decisiones de marca y contenido.

Reglas:
· Español de España, directo, sin florituras ni relleno de consultora.
· Sintetiza y ordena; NO copies las respuestas tal cual, dales forma de doctrina.
· Usa SOLO lo que hay en el dossier. No inventes datos, cifras ni logros.
· Si a una sección le falta información, escribe en cursiva "(pendiente: …)" con
  lo que habría que preguntar. No lo rellenes a base de suposiciones.
· Devuelve SOLO markdown, empezando por "# Biblia de la Empresa".`,
    outline: `Estructura (usa ## para cada sección):
## Identidad y esencia — quién es, en una frase potente + 3-4 rasgos reales.
## Historia — antes / el giro / después, en narrativa breve.
## Tono y voz — energía, humor, vocabulario, ritmo; muletillas propias; y qué
   tono NO usar nunca.
## Autoridad y prueba — por qué se le debe escuchar (resultados, casos, pruebas).
## Posicionamiento y stance — la frase de posicionamiento, la opinión que
   incomoda y las creencias que combate.
## Modelo de negocio — qué vende, la transformación A→B, por qué le eligen,
   método/pasos y objeción nº1.
## Cliente ideal — el avatar: quién es, su dolor, su deseo y sus objeciones.`,
  },
  contenido: {
    title: 'Biblia de Contenido',
    system: `Eres estratega de contenido y copywriter. A partir del dossier de
onboarding y del MÉTODO de guiones (más abajo), redactas la BIBLIA DE CONTENIDO:
el manual accionable del que salen los guiones, reels y emails de esta cuenta.

Reglas:
· Español de España, directo, concreto. Cero relleno.
· Aplica el MÉTODO: hooks que prometen o provocan, 3 capas (dato/emoción/opinión),
  triple autoridad, un solo CTA.
· Usa SOLO lo que hay en el dossier para lo específico de esta cuenta. No inventes.
· Convierte la "mina de contenido" (preguntas, errores, mitos, verdades incómodas,
  historias) en material listo para usar.
· Si a una sección le falta info, escribe en cursiva "(pendiente: …)".
· Devuelve SOLO markdown, empezando por "# Biblia de Contenido".`,
    outline: `Estructura (usa ## para cada sección):
## Pilares de contenido — 3-5 temas núcleo que esta cuenta debe tocar, con una
   línea de por qué cada uno cruza lo que quiere la audiencia y lo que vende.
## Ángulos propios — qué dice esta cuenta que nadie dice (y qué mensajes quemados
   evitar de raíz).
## Banco de hooks — 10-15 hooks concretos ya escritos, sacados de la mina
   (preguntas frecuentes, errores, mitos, verdades incómodas, opiniones polémicas).
## Historias y pruebas — las historias de cliente y anécdotas del dossier,
   listas para convertir en contenido.
## Formatos y CTA — qué formatos priorizar y qué CTA usar según el objetivo.`,
  },
}

function buildPrompt(kind, dossier) {
  const spec = SPECS[kind]
  const system = kind === 'contenido'
    ? `${spec.system}\n\n---\n\n# MÉTODO\n${COPY_KNOWLEDGE}`
    : spec.system
  const user = `${spec.outline}\n\n---\n\nDOSSIER DE ONBOARDING:\n\n${dossier}`
  return { system, messages: [{ role: 'user', content: user }] }
}

async function markCompleted(clientId) {
  const now = new Date().toISOString()
  await supabase.from('helm_onboarding')
    .update({ status: 'completed', completed_at: now, updated_at: now })
    .eq('client_id', clientId).eq('form', 'contenido')
}

// Cada versión de una Biblia se archiva en Archivos. La tabla helm_biblia solo
// guarda la última: si el modelo genera una peor que la anterior, sin esto la
// buena se pierde. Aquí queda una copia fechada de cada una.
//
// Es best-effort a propósito: la Biblia ya está guardada cuando esto corre, así
// que un fallo archivando no puede tumbar la generación.
async function archivarBiblia(clientId, kind, title, content) {
  try {
    const sello = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
    const nombre = `${title} · ${sello}.md`
    const path = `${clientId}/archivos/${Math.random().toString(36).slice(2, 8)}-biblia-${kind}-${sello}.md`

    const { error: errUp } = await supabase.storage.from('helm').upload(
      path, content,
      { cacheControl: '3600', upsert: false, contentType: 'text/markdown; charset=utf-8' },
    )
    if (errUp) throw new Error(errUp.message)

    const { data: pub } = supabase.storage.from('helm').getPublicUrl(path)
    const { error } = await supabase.from('helm_files').insert({
      client_id: clientId,
      name: nombre,
      path,
      url: pub.publicUrl,
      type: 'text/markdown',
      size: Buffer.byteLength(content, 'utf8'),
      folder: 'Onboarding',
      source: 'onboarding',
      note: `Generada desde el onboarding`,
    })
    if (error) throw new Error(error.message)
  } catch (err) {
    console.warn('[onboarding] no se pudo archivar la Biblia:', err.message)
  }
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

  // GET ?action=biblia → las dos Biblias del perfil.
  if (req.method === 'GET' && action === 'biblia') {
    const { data } = await supabase.from('helm_biblia')
      .select('kind, title, content, status, updated_at').eq('client_id', clientId)
    const out = {}
    for (const row of data || []) out[row.kind] = row
    return res.status(200).json({ biblia: out })
  }

  // POST ?action=save → guarda una Biblia editada a mano.
  if (req.method === 'POST' && action === 'save') {
    const { kind, content } = req.body || {}
    if (!SPECS[kind]) return res.status(400).json({ error: 'kind inválido' })
    if (!content?.trim()) return res.status(400).json({ error: 'content requerido' })
    const { data, error } = await supabase.from('helm_biblia').upsert({
      client_id: clientId, kind, title: SPECS[kind].title, content, status: 'edited',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'client_id,kind' }).select('kind, title, content, status, updated_at').single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ biblia: data })
  }

  // POST ?action=generate → sintetiza una Biblia con el modelo local.
  if (req.method === 'POST' && action === 'generate') {
    const gate = rateLimit({ key: `onb:${getClientIp(req)}`, max: 10, windowMs: 60_000 })
    if (!gate.ok) {
      res.setHeader('Retry-After', String(gate.retryAfter))
      return res.status(429).json({ error: 'Demasiadas generaciones seguidas.', retryAfter: gate.retryAfter })
    }

    const { kind, dossier } = req.body || {}
    if (!SPECS[kind]) return res.status(400).json({ error: 'kind inválido (empresa | contenido)' })
    if (!dossier?.trim()) return res.status(400).json({ error: 'El onboarding está vacío: no hay nada que sintetizar.' })

    const { system, messages } = buildPrompt(kind, dossier)
    let content
    try {
      content = await llmChat({ clientId, system, messages, maxTokens: MAX_TOKENS, temperature: 0.6 })
    } catch (err) {
      return res.status(err.statusCode || 502).json({ error: err.message || 'Error generando la Biblia' })
    }

    const { data, error } = await supabase.from('helm_biblia').upsert({
      client_id: clientId, kind, title: SPECS[kind].title, content, status: 'generated',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'client_id,kind' }).select('kind, title, content, status, updated_at').single()
    if (error) return res.status(500).json({ error: error.message })

    await archivarBiblia(clientId, kind, SPECS[kind].title, content)
    await markCompleted(clientId)
    return res.status(200).json({ biblia: data })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
