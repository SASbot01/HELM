// HELM — generación de la Biblia del perfil a partir del onboarding.
//
// El onboarding de contenido (respuestas en helm_onboarding) se sintetiza en
// dos documentos con el modelo LOCAL (Ollama), que se guardan en helm_biblia y
// que el chat inyecta luego en su system prompt.
//
// Además, el «Alta en HELM» (src/helm/onboarding/alta.js): las 40 preguntas que
// rellena cada cliente nuevo, desde el panel o desde un enlace público sin
// cuenta que le manda la agencia (/alta/<token>). Lo del enlace no pasa por la
// IA ni gasta créditos: solo valida y guarda.
//
// Acciones:
//   POST ?action=generate  { clientId, kind, dossier }  → genera y guarda una Biblia
//   GET  ?action=biblia     &clientId=                    → devuelve las dos Biblias
//   POST ?action=save      { clientId, kind, content }   → guarda una Biblia editada
//   POST ?action=enlace    { clientId }                  → enlace público del alta
//   GET  ?action=alta       &t=<token>                    → (público) el alta del enlace
//   POST ?action=alta      { t, answers, enviar? }       → (público) guarda el alta
import { supabase } from './lib/supabase.js'
import { applyCors, rateLimit, getClientIp, signJwt, verifyJwt } from './_lib/auth.js'
import { requireProfileAccess } from './_lib/access.js'
import { COPY_KNOWLEDGE } from './_lib/copy-knowledge.js'
import { llmChat } from './_lib/llm.js'
import { notificar } from './_lib/notificar.js'
import { ONBOARDING_ALTA } from '../src/helm/onboarding/alta.js'

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

// ── El alta por enlace ─────────────────────────────────────────────────────
// La agencia pide un enlace (/alta/<token>) y se lo manda al cliente, que lo
// rellena sin cuenta. El token es un JWT con kind 'alta' y el clientId dentro:
// validateAuth rechaza cualquier token con kind, así que no vale como sesión
// del panel; solo abre el alta de SU perfil, y caduca a los 30 días.
const ALTA_DIAS = 30
const ALTA_NO_VALIDO = 'Este enlace ha caducado o no es válido. Pide uno nuevo a quien te lo envió.'
const ALTA_MAX = { text: 300, long: 5000 }
const ALTA_MAX_FILAS = 20

// Las 40 preguntas, por clave. Un Map y no un objeto: así '__proto__' o
// 'constructor' no se cuelan como si fueran preguntas.
const PREGUNTAS_ALTA = new Map(ONBOARDING_ALTA.sections.flatMap(s => s.fields).map(f => [f.key, f]))

const VACIO = { vacio: true }
const esObjeto = (v) => v != null && typeof v === 'object' && !Array.isArray(v)

// Media pareja de un emoji (lo deja un recorte a mitad) y el carácter nulo:
// Postgres no los admite en un jsonb y tumbaría el guardado entero, con lo
// que el cliente perdería todo lo escrito desde el último guardado bueno. No
// se ven: se quitan sin más.
const SURROGATE_SUELTO = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g

function textoAlta(v, max) {
  if (v == null) return VACIO
  if (typeof v !== 'string' && typeof v !== 'number') return { error: 'tiene que ser texto.' }
  const s = String(v).replaceAll('\u0000', '').replace(SURROGATE_SUELTO, '')
  if (!s.trim()) return VACIO
  if (s.length > max) return { error: `como mucho ${max} caracteres (llevas ${s.length}).` }
  return { valor: s }
}

function tablaAlta(field, v) {
  if (!Array.isArray(v)) return { error: 'tiene que ser una lista de filas.' }
  const columnas = new Map((field.columns || []).map(c => [c.key, c]))
  const filas = []
  for (const fila of v) {
    if (fila == null) continue
    if (!esObjeto(fila)) return { error: 'hay una fila que no tiene un formato válido.' }
    const limpia = {}
    for (const [k, celda] of Object.entries(fila)) {
      const col = columnas.get(k)
      if (!col) return { error: `hay una columna que no existe («${k.slice(0, 40)}»).` }
      const r = textoAlta(celda, ALTA_MAX.text)
      if (r.error) return { error: `en la columna «${col.label}», ${r.error}` }
      if (!r.vacio) limpia[k] = r.valor
    }
    // La tabla del panel siempre deja una fila en blanco al final: no cuenta.
    if (Object.keys(limpia).length) filas.push(limpia)
    if (filas.length > ALTA_MAX_FILAS) return { error: `como mucho ${ALTA_MAX_FILAS} filas.` }
  }
  return filas.length ? { valor: filas } : VACIO
}

function valorAlta(field, v) {
  if (v == null || v === '') return VACIO
  const tipo = field.type || 'long'
  switch (tipo) {
    case 'text':
    case 'long':
      return textoAlta(v, ALTA_MAX[tipo])
    case 'axis':
      return typeof v === 'string' && field.options.includes(v) ? { valor: v } : { error: 'elige una de las opciones.' }
    case 'multi': {
      if (!Array.isArray(v)) return { error: 'tiene que ser una lista de opciones.' }
      const elegidas = [...new Set(v)]
      if (elegidas.some(x => typeof x !== 'string' || !field.options.includes(x))) {
        return { error: 'hay una opción que no está en la lista.' }
      }
      const max = field.max || field.options.length
      if (elegidas.length > max) return { error: `elige como mucho ${max}.` }
      return elegidas.length ? { valor: elegidas } : VACIO
    }
    case 'scale': {
      // '7' vale como 7; '0x7' o '1e1', no, aunque Number() los entienda.
      if (typeof v === 'string' && !v.trim()) return VACIO
      const n = typeof v === 'string' ? (/^\s*\d+\s*$/.test(v) ? Number(v) : NaN) : v
      return Number.isInteger(n) && n >= 1 && n <= 10 ? { valor: n } : { error: 'tiene que ser un número entero del 1 al 10.' }
    }
    case 'table':
      return tablaAlta(field, v)
    default:
      return { error: 'esta pregunta no admite respuesta.' }
  }
}

/**
 * Valida y limpia las respuestas del alta contra ONBOARDING_ALTA: solo las
 * preguntas que existen, cada una con un valor de su tipo, y sin lo vacío. Lo
 * que llega por el enlace lo escribe cualquiera que lo tenga; sin esto cabría
 * un jsonb de basura en el onboarding del perfil.
 * @returns {{ answers: object } | { error: string, campo: string|null }}
 */
export function validarAlta(entrada) {
  if (entrada == null) return { answers: {} }
  if (!esObjeto(entrada)) return { error: 'Las respuestas no tienen un formato válido.', campo: null }
  const answers = {}
  for (const [key, v] of Object.entries(entrada)) {
    const field = PREGUNTAS_ALTA.get(key)
    if (!field) return { error: `Hay una respuesta a una pregunta que no existe («${key.slice(0, 60)}»).`, campo: key }
    const r = valorAlta(field, v)
    if (r.error) return { error: `En «${field.label}»: ${r.error}`, campo: key }
    if (!r.vacio) answers[key] = r.valor
  }
  return { answers }
}

// El perfil del enlace, o null si el token no es un enlace de alta válido.
async function perfilDelEnlace(t) {
  if (typeof t !== 'string' || !t || t.length > 2048) return null
  try {
    const p = await verifyJwt(t)
    return p.kind === 'alta' && typeof p.clientId === 'string' && p.clientId ? p.clientId : null
  } catch {
    return null
  }
}

// «Enviado» es que el CLIENTE la envió desde su enlace, y eso lo dice
// completed_at, que en el alta solo pone el envío (abajo). El status no basta:
// el equipo puede darla por completada desde el panel sin que el cliente haya
// enviado nada, y entonces su enlace le diría «Ya lo enviaste» y la agencia no
// recibiría el aviso cuando lo enviara de verdad.
const estadoAlta = (fila) => (fila?.completed_at ? 'enviado' : 'borrador')

// GET y POST ?action=alta: lo que usa la página pública /alta/<token>. No hay
// sesión; la llave es el token, y el perfil es el que va dentro de él (nunca
// uno que mande el navegador).
async function altaPublica(req, res) {
  const gate = rateLimit({ key: `onb-alta-${req.method}:${getClientIp(req) || 'anon'}`, max: 60, windowMs: 60_000 })
  if (!gate.ok) {
    res.setHeader('Retry-After', String(gate.retryAfter))
    return res.status(429).json({ error: 'Demasiadas peticiones seguidas. Espera un minuto y vuelve a intentarlo.', retryAfter: gate.retryAfter })
  }
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  let body = req.body || {}
  if (typeof body === 'string') {
    try { body = JSON.parse(body) } catch { return res.status(400).json({ error: 'Petición mal formada' }) }
  }
  if (!esObjeto(body)) body = {}
  const clientId = await perfilDelEnlace(req.method === 'GET' ? req.query.t : (body.t || req.query.t))
  if (!clientId) return res.status(401).json({ error: ALTA_NO_VALIDO })

  const { data: perfil, error: errPerfil } = await supabase.from('clients')
    .select('name, brand_name, active').eq('id', clientId).maybeSingle()
  if (errPerfil) throw errPerfil
  // Un perfil borrado o desactivado no admite altas: su enlace deja de valer.
  if (!perfil || perfil.active === false) return res.status(401).json({ error: ALTA_NO_VALIDO })
  const nombre = perfil.brand_name || perfil.name || 'Tu negocio'

  const { data: fila, error: errFila } = await supabase.from('helm_onboarding')
    .select('answers, status, completed_at').eq('client_id', clientId).eq('form', 'alta').maybeSingle()
  if (errFila) throw errFila

  if (req.method === 'GET') {
    return res.status(200).json({
      perfil: { nombre },
      answers: fila?.answers || {},
      estado: estadoAlta(fila),
      enviado_at: fila?.completed_at || null,
    })
  }

  // Las respuestas sustituyen a las guardadas: una petición sin ellas (un
  // fallo de la página, un cuerpo que no llegó entero) no puede vaciar el alta.
  if (!esObjeto(body.answers)) return res.status(400).json({ error: 'Faltan las respuestas.' })
  const limpio = validarAlta(body.answers)
  if (limpio.error) return res.status(400).json({ error: limpio.error, campo: limpio.campo })
  const enviar = body.enviar === true
  if (enviar && !Object.keys(limpio.answers).length) {
    return res.status(400).json({ error: 'No hay nada que enviar: responde al menos una pregunta.' })
  }

  // Guardar sin enviar no toca el estado: si ya lo había enviado y vuelve a
  // retocar algo, sigue enviado, y un alta nueva empieza en borrador (lo pone
  // la tabla). No se escribe el estado leído arriba: un autoguardado que lo
  // leyó justo antes de un envío lo devolvería a borrador al llegar después.
  const ahora = new Date().toISOString()
  const cambios = { client_id: clientId, form: 'alta', answers: limpio.answers, updated_at: ahora }
  if (enviar) Object.assign(cambios, { status: 'completed', completed_at: ahora })
  const { data: guardada, error } = await supabase.from('helm_onboarding')
    .upsert(cambios, { onConflict: 'client_id,form' }).select('status, completed_at').single()
  if (error) {
    console.warn('[onboarding] alta:', error.message)
    return res.status(500).json({ error: 'No se ha podido guardar. Inténtalo de nuevo en un momento.' })
  }

  // Se avisa a la agencia la PRIMERA vez que lo envía. Si lo reenvía para
  // corregir algo, no: ya sabe que está. La clave con su ventana de 24 h es la
  // segunda red, por si dos envíos casi a la vez leen los dos que aún no lo estaba.
  if (enviar && !fila?.completed_at) {
    await notificar(supabase, clientId, {
      tipo: 'onboarding', nivel: 'aviso',
      titulo: `${nombre} ha rellenado el alta en HELM`,
      cuerpo: 'Ya puedes ver sus respuestas en Onboarding.',
      destino: 'onboarding',
      clave: `alta-enviada:${clientId}`, cadaHoras: 24,
    })
  }
  return res.status(200).json({ ok: true, estado: estadoAlta(guardada), enviado_at: guardada?.completed_at || null })
}

export default async function handler(req, res) {
  applyCors(req, res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  const action = req.query.action

  // El alta por enlace es pública: va antes de pedir sesión.
  if (action === 'alta') {
    try {
      return await altaPublica(req, res)
    } catch (err) {
      console.error('[onboarding] alta:', err?.message || err)
      return res.status(500).json({ error: 'No se ha podido completar. Inténtalo de nuevo en un momento.' })
    }
  }

  const clientId = req.query.clientId || req.body?.clientId || null
  // Un solo perfil por petición: el que se comprueba es el que se usa. Si
  // vienen los dos (URL y cuerpo) y no coinciden, no se adivina cuál vale.
  if (req.query?.clientId && req.body?.clientId && String(req.query.clientId) !== String(req.body.clientId)) {
    return res.status(400).json({ error: 'El perfil de la URL y el del cuerpo no coinciden' })
  }

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

  // POST ?action=enlace → el enlace público del alta, para mandárselo al
  // cliente. Cada llamada da uno nuevo; los anteriores valen hasta caducar.
  if (req.method === 'POST' && action === 'enlace') {
    const { data: perfil, error } = await supabase.from('clients')
      .select('active').eq('id', clientId).maybeSingle()
    if (error) return res.status(500).json({ error: error.message })
    if (!perfil) return res.status(404).json({ error: 'Perfil no encontrado' })
    // El enlace de un perfil desactivado no abriría nada: mejor decirlo aquí.
    if (perfil.active === false) {
      return res.status(409).json({ error: 'Este perfil está desactivado: actívalo antes de mandar el enlace del alta.' })
    }
    const expiresIn = 60 * 60 * 24 * ALTA_DIAS
    const token = await signJwt({ kind: 'alta', clientId }, { expiresIn })
    const base = (process.env.HELM_PUBLIC_URL || 'https://helm.s4sf.net').trim().replace(/\/$/, '')
    return res.status(200).json({
      url: `${base}/alta/${token}`,
      caduca: new Date(Date.now() + expiresIn * 1000).toISOString(),
    })
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
