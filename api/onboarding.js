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
// Y el alta pública (helm.s4sf.net/alta, sin token): la rellena un negocio que
// aún no tiene perfil, la agencia la recibe en «Altas recibidas» y desde ahí
// crea el perfil con las respuestas dentro (helm_altas, migración 105).
//
// Acciones:
//   POST ?action=generate  { clientId, kind, dossier }  → genera y guarda una Biblia
//   GET  ?action=biblia     &clientId=                    → devuelve las dos Biblias
//   POST ?action=save      { clientId, kind, content }   → guarda una Biblia editada
//   POST ?action=enlace    { clientId }                  → enlace público del alta
//   GET  ?action=alta       &t=<token>                    → (público) el alta del enlace
//   POST ?action=alta      { t, answers, enviar? }       → (público) guarda el alta
//   GET  ?action=alta-publica-agencia &a=<slug>           → (público) a qué agencia irá el alta
//   POST ?action=alta-publica-nueva { nombre, email, telefono, acepta, website, agencia?, origen? }
//                                                        → (público) empieza un alta sin perfil
//   GET  ?action=alta-publica &t=<token>                  → (público) esa alta
//   POST ?action=alta-publica { t, answers, enviar? }    → (público) la guarda o la envía
//   POST ?action=alta-publica-borrar { t }               → (público) quien la rellenó la borra
//   GET  ?action=altas                                    → las altas de tus agencias
//   POST ?action=alta-convertir { altaId }               → crea el perfil con sus respuestas
//   POST ?action=alta-descartar { altaId }               → la descarta
import { createHmac, randomBytes, randomUUID } from 'node:crypto'
import { supabase } from './lib/supabase.js'
import { applyCors, rateLimit, getClientIp, signJwt, verifyJwt, validateAuth, writeAudit } from './_lib/auth.js'
import { requireProfileAccess, administraAgencia, agenciaDe } from './_lib/access.js'
import { COPY_KNOWLEDGE } from './_lib/copy-knowledge.js'
import { llmChat } from './_lib/llm.js'
import { notificar, notificarAgencia } from './_lib/notificar.js'
import { crearPerfil, deshacerPerfilNuevo } from './perfiles.js'
import { ONBOARDING_ALTA } from '../src/helm/onboarding/alta.js'
import { PRIVACIDAD_VERSION, TELEFONO_RE } from '../src/pages/altaPublica.js'

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

// ── El alta pública, sin perfil ────────────────────────────────────────────
// helm.s4sf.net/alta, sin token: un negocio que aún no es cliente deja sus
// datos de contacto, rellena las mismas 40 preguntas y la envía. La agencia la
// recibe en «Altas recibidas» (tablero de Perfiles) y desde ahí crea el perfil
// con las respuestas dentro o la descarta. Vive en helm_altas (migración 105).
//
// La llave de quien la rellena es un JWT con kind 'alta-publica' y el id de SU
// alta (nunca uno que mande el navegador). Como la del enlace, validateAuth la
// rechaza como sesión, y solo deja tocar esa alta mientras el equipo no la
// haya recogido.
//
// Sus datos son de quien la rellena, y se tratan como tales: la página nombra
// a la agencia que los va a recibir antes de pedir nada (alta-publica-agencia);
// él puede borrarla mientras no tenga perfil (alta-publica-borrar); al
// descartarla se vacía, al convertirla se vacían las respuestas (ya están en el
// perfil), y los borradores abandonados se borran a los 30 días.
const ALTA_RECOGIDA = 'Esta alta ya la ha recogido el equipo.'
const ALTAS_NUEVAS_POR_HORA = 5
// Por agencia y hora, además del de cada IP: lo que entra en su bandeja y los
// avisos que le llegan. Holgado para un pico de verdad (un reel que funciona)
// y con techo para quien abra altas desde muchas direcciones.
const ALTAS_NUEVAS_POR_AGENCIA = 60
const AVISOS_POR_AGENCIA = 20
const ABIERTAS = ['borrador', 'enviada']
// Los borradores que nadie envía (su llave caduca a los 30 días: ya no se
// pueden retomar) y las descartadas, que ya no tienen datos.
const PURGA_DIAS = ALTA_DIAS
// Como el de api/leads.js, y sin lo que en un aviso de Telegram arma un enlace.
const RE_EMAIL = /^[^\s@<>()[\]\\,;:"%*]+@[^\s@<>()[\]\\,;:"%*]+\.[^\s@<>()[\]\\,;:"%*]+$/
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const RE_SLUG = /^[a-z0-9][a-z0-9-]{0,59}$/
const NINGUNA = '00000000-0000-0000-0000-000000000000'

const agenciaPorDefecto = () => (process.env.HELM_ALTA_AGENCIA || 'silvestreai').trim().toLowerCase()
const caducaEn = () => new Date(Date.now() + ALTA_DIAS * 86_400_000).toISOString()

function falla(msg, code = 400) {
  return Object.assign(new Error(msg), { statusCode: code })
}

function demasiadas(res, gate, error) {
  res.setHeader('Retry-After', String(gate.retryAfter))
  return res.status(429).json({ error, retryAfter: gate.retryAfter })
}

// Lo que escribe alguien en un campo suelto: una línea, sin espacios de más ni
// lo que Postgres no admite.
const linea = (v) => (typeof v === 'string' || typeof v === 'number'
  ? String(v).replaceAll('\u0000', '').replace(SURROGATE_SUELTO, '').replace(/\s+/g, ' ').trim()
  : '')

// Lo de fuera, para un aviso: sin lo que en el Markdown de Telegram abre un
// enlace o cambia el formato del resto del mensaje, y sin lo que Telegram
// convierte solo en enlace aunque no haya Markdown (una URL, un dominio, una
// @mención): el punto, los dos puntos, la barra y la arroba se cambian por
// otros que se ven igual y no enlazan.
const PARECIDOS = { '.': '․', ':': '∶', '/': '∕', '@': '＠' }
const paraAviso = (v) => String(v || '')
  .replace(/[[\]*`_\\]/g, '').replace(/[.:/@]/g, c => PARECIDOS[c])
  .replace(/\s+/g, ' ').trim().slice(0, 120)

/** Los datos de contacto del primer paso, validados. */
function contactoDe(b) {
  const nombre = linea(b.nombre)
  if (nombre.length < 2 || nombre.length > 120) {
    return { error: 'Escribe tu nombre y apellidos (entre 2 y 120 caracteres).', campo: 'nombre' }
  }
  const email = linea(b.email).toLowerCase()
  if (!email || email.length > 200 || !RE_EMAIL.test(email)) {
    return { error: 'Revisa el email: no parece válido.', campo: 'email' }
  }
  const telefono = linea(b.telefono)
  const cifras = telefono.replace(/\D/g, '').length
  if (cifras < 6 || cifras > 20 || !TELEFONO_RE.test(telefono)) {
    return { error: 'Revisa el WhatsApp: entre 6 y 20 cifras, y solo cifras, espacios, guiones y el + del prefijo.', campo: 'telefono' }
  }
  if (b.acepta !== true) {
    return { error: 'Para seguir tienes que aceptar la política de privacidad.', campo: 'acepta' }
  }
  return { contacto: { nombre, email, telefono } }
}

// De dónde vino: las utm_* y el referrer, solo con las claves conocidas y cortas.
function origenDe(o) {
  const e = esObjeto(o) ? o : {}
  const r = {}
  for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) {
    const v = linea(e[k]).slice(0, 200)
    if (v) r[k] = v
  }
  const ref = linea(e.referrer).slice(0, 300)
  if (ref) r.referrer = ref
  return r
}

/**
 * La red de una IP, que es lo que se cuenta y se guarda: una IPv4 tal cual;
 * una IPv6, su /64. Cualquier conexión IPv6 (y cualquier servidor alquilado)
 * tiene un /64 entero para ir cambiando de dirección: contar direcciones
 * sueltas no frenaría a nadie.
 */
export function redDeIp(ip) {
  const v = String(ip || '').trim().toLowerCase()
  if (!v) return ''
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(v)) return v
  // Una IPv4 dentro de IPv6 (::ffff:1.2.3.4) es esa IPv4.
  const mapeada = v.match(/^::(?:ffff:)?(\d{1,3}(?:\.\d{1,3}){3})$/)
  if (mapeada) return mapeada[1]
  const partes = v.split('::')
  if (partes.length > 2) return v
  const grupos = (s) => (s ? s.split(':') : [])
  const izq = grupos(partes[0])
  const der = partes.length === 2 ? grupos(partes[1]) : []
  const huecos = partes.length === 2 ? 8 - izq.length - der.length : 0
  const todos = [...izq, ...Array(Math.max(0, huecos)).fill('0'), ...der]
  // Lo que no es una IPv6 de 8 grupos (otra forma con IPv4 dentro, por
  // ejemplo), tal cual: contará como una sola dirección.
  if (todos.length !== 8 || todos.some(g => !/^[0-9a-f]{1,4}$/.test(g))) return v
  return `${todos.slice(0, 4).map(g => g.replace(/^0+(?=.)/, '')).join(':')}::/64`
}

// La huella de la red, nunca la IP: con el secreto del servidor, para que no
// se pueda sacar probando las cuatro mil millones de IPv4.
const huellaIp = (red) => (red && process.env.JWT_SECRET
  ? createHmac('sha256', process.env.JWT_SECRET).update(String(red)).digest('hex')
  : '')

// Lo que se le da a un bot que ha caído en la trampa: tiene forma de llave,
// pero la firma no es de HELM y no abre nada.
function llaveFalsa() {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const ahora = Math.floor(Date.now() / 1000)
  const cuerpo = { iat: ahora, exp: ahora + ALTA_DIAS * 86_400, kind: 'alta-publica', altaId: randomUUID() }
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(cuerpo)}.${randomBytes(32).toString('base64url')}`
}

const slugPedido = (v) => (typeof v === 'string' && RE_SLUG.test(v.trim().toLowerCase()) ? v.trim().toLowerCase() : null)

// La agencia que recibe el alta: la de ?a=<slug> si existe y, si no, la de
// siempre. La tabla no tiene columna de «activa»: existir es lo que cuenta.
// `pedida` dice si es la que se pidió (para que la página avise si no).
async function agenciaDelAlta(pedidaCruda) {
  const pedida = slugPedido(pedidaCruda)
  for (const slug of new Set([pedida, agenciaPorDefecto()])) {
    if (!slug || !RE_SLUG.test(slug)) continue
    const { data, error } = await supabase.from('agencias').select('id, nombre, slug').eq('slug', slug).maybeSingle()
    if (error) throw error
    if (data) return { ...data, pedida: Boolean(pedida) && data.slug === pedida }
  }
  return null
}

const NO_DISPONIBLE = 'El alta no está disponible ahora mismo. Inténtalo más tarde.'

// GET ?action=alta-publica-agencia&a=<slug>: a quién le va a llegar el alta,
// ANTES de pedir los datos. La casilla de privacidad lo nombra; y si ?a= no es
// de ninguna agencia (un enlace mal copiado), la página lo dice en vez de
// mandar los datos a otra sin avisar.
async function agenciaPublica(req, res) {
  const pedida = slugPedido(req.query.a)
  const agencia = await agenciaDelAlta(pedida)
  if (!agencia) {
    console.warn('[onboarding] alta pública: no existe la agencia por defecto', agenciaPorDefecto())
    return res.status(503).json({ error: NO_DISPONIBLE })
  }
  return res.status(200).json({
    agencia: { nombre: agencia.nombre, slug: agencia.slug },
    pedida,
    encontrada: !pedida || agencia.pedida,
  })
}

// POST ?action=alta-publica-nueva: el primer paso, «Tus datos».
async function altaPublicaNueva(req, res, body) {
  // El campo trampa: oculto en la página para personas y lectores de
  // pantalla, solo lo rellena un bot. Se le contesta como a cualquiera para que
  // no sepa que no ha colado, pero no se crea nada.
  if (body.website != null && String(body.website).trim() !== '') {
    const agencia = await agenciaDelAlta(body.agencia).catch(() => null)
    return res.status(200).json({
      t: llaveFalsa(), caduca: caducaEn(),
      ...(agencia ? { agencia: { nombre: agencia.nombre, slug: agencia.slug } } : {}),
    })
  }
  const r = contactoDe(body)
  if (r.error) return res.status(400).json({ error: r.error, campo: r.campo })

  // Solo cuentan las que se crean: quien se equivoca al escribir el email no
  // gasta sus intentos. Por red (en IPv6, el /64), no por dirección suelta.
  const red = redDeIp(getClientIp(req))
  const gate = rateLimit({ key: `onb-alta-nueva:${red || 'anon'}`, max: ALTAS_NUEVAS_POR_HORA, windowMs: 3_600_000 })
  if (!gate.ok) return demasiadas(res, gate, 'Ya has empezado varias altas en la última hora. Prueba un poco más tarde.')

  const agencia = await agenciaDelAlta(body.agencia)
  if (!agencia) {
    console.warn('[onboarding] alta pública: no existe la agencia por defecto', agenciaPorDefecto())
    return res.status(503).json({ error: NO_DISPONIBLE })
  }
  const gateAgencia = rateLimit({ key: `onb-alta-nueva-ag:${agencia.id}`, max: ALTAS_NUEVAS_POR_AGENCIA, windowMs: 3_600_000 })
  if (!gateAgencia.ok) {
    console.warn('[onboarding] alta pública: tope de altas nuevas por hora en la agencia', agencia.slug)
    return demasiadas(res, gateAgencia, 'Ahora mismo está entrando mucha gente. Espera unos minutos y vuelve a intentarlo.')
  }

  const { data, error } = await supabase.from('helm_altas').insert({
    agencia_id: agencia.id, ...r.contacto, negocio: '', answers: {}, estado: 'borrador',
    origen: origenDe(body.origen), ip_hash: huellaIp(red),
    acepta_privacidad_at: new Date().toISOString(), acepta_privacidad_version: PRIVACIDAD_VERSION,
  }).select('id').single()
  if (error) {
    console.warn('[onboarding] alta pública nueva:', error.message)
    return res.status(500).json({ error: 'No se ha podido guardar. Inténtalo de nuevo en un momento.' })
  }
  const expiresIn = 60 * 60 * 24 * ALTA_DIAS
  const t = await signJwt({ kind: 'alta-publica', altaId: data.id }, { expiresIn })
  return res.status(200).json({
    t, caduca: new Date(Date.now() + expiresIn * 1000).toISOString(),
    agencia: { nombre: agencia.nombre, slug: agencia.slug },
  })
}

// El alta de la llave, o null si la llave no es de un alta pública válida.
async function altaDeLaLlave(t) {
  if (typeof t !== 'string' || !t || t.length > 2048) return null
  let p
  try { p = await verifyJwt(t) } catch { return null }
  if (p.kind !== 'alta-publica' || typeof p.altaId !== 'string' || !RE_UUID.test(p.altaId)) return null
  const { data, error } = await supabase.from('helm_altas')
    .select('id, agencia_id, nombre, email, telefono, negocio, answers, estado, enviado_at')
    .eq('id', p.altaId).maybeSingle()
  if (error) throw error
  return data || null
}

// La agencia se entera una vez por alta: en la campana de su perfil de la casa
// (agencias.perfil_casa_id), que como es un 'lead' sale también por su bot de
// Telegram; sin perfil de la casa, solo por el bot. Nunca en el perfil de un
// cliente.
//
// Sin datos de contacto: la campana del perfil de la casa la ve todo su
// equipo, también quien no administra la agencia (y no puede abrir la
// bandeja). Solo el nombre del negocio, desarmado (paraAviso); lo demás, en
// Perfiles → Altas recibidas. Con un tope por agencia y hora: más allá, el
// alta llega igual a la bandeja, pero sin aviso.
//
// No lanza: el alta ya está enviada cuando esto corre.
async function avisaAltaEnviada(alta) {
  try {
    const { data: agencia, error } = await supabase.from('agencias')
      .select('id, nombre, perfil_casa_id').eq('id', alta.agencia_id).maybeSingle()
    if (error) throw error
    if (!agencia) return
    if (!rateLimit({ key: `onb-alta-aviso:${agencia.id}`, max: AVISOS_POR_AGENCIA, windowMs: 3_600_000 }).ok) {
      console.warn('[onboarding] alta pública: tope de avisos por hora en la agencia', agencia.id)
      return
    }
    const negocio = paraAviso(alta.negocio)
    const titulo = negocio ? `Alta nueva en HELM · ${negocio}` : 'Alta nueva en HELM'
    const cuerpo = 'Un negocio ha enviado el alta desde el formulario público. La tienes en Perfiles → Altas recibidas.'
    const casa = agencia.perfil_casa_id && (await agenciaDe(agencia.perfil_casa_id)) === agencia.id
      ? agencia.perfil_casa_id : null
    if (casa) {
      const base = (process.env.HELM_PUBLIC_URL || 'https://helm.s4sf.net').trim().replace(/\/$/, '')
      await notificar(supabase, casa, {
        tipo: 'lead', nivel: 'info', titulo, cuerpo, destino: `${base}/admin`,
        // La segunda red, por si dos envíos casi a la vez se dan los dos por primeros.
        clave: `alta-publica:${alta.id}`, cadaHoras: 24 * 365, meta: { altaId: alta.id },
      })
    } else {
      await notificarAgencia(supabase, agencia.id, { titulo, cuerpo, etiqueta: agencia.nombre })
    }
  } catch (err) {
    console.warn('[onboarding] aviso del alta pública:', err.message)
  }
}

// GET y POST ?action=alta-publica: lo que usa /alta una vez tiene su llave.
// Igual que el modo con token, pero sobre helm_altas.
async function altaPublicaGuardada(req, res, body) {
  const alta = await altaDeLaLlave(req.method === 'GET' ? req.query.t : (body.t || req.query.t))
  if (!alta) return res.status(401).json({ error: ALTA_NO_VALIDO })

  if (req.method === 'GET') {
    const { data: agencia, error } = await supabase.from('agencias').select('nombre').eq('id', alta.agencia_id).maybeSingle()
    if (error) throw error
    return res.status(200).json({
      agencia: { nombre: agencia?.nombre || 'HELM' },
      contacto: { nombre: alta.nombre, email: alta.email, telefono: alta.telefono },
      answers: alta.answers || {},
      estado: alta.enviado_at ? 'completed' : 'draft',
      enviado_at: alta.enviado_at || null,
      // Convertida o descartada: la página no ofrece seguir escribiendo algo
      // que ya no se va a guardar.
      recogida: !ABIERTAS.includes(alta.estado),
    })
  }

  // Convertida o descartada, ya es del equipo: lo que escriba ahora no lo
  // vería nadie.
  if (!ABIERTAS.includes(alta.estado)) return res.status(409).json({ error: ALTA_RECOGIDA })
  // Las respuestas sustituyen a las guardadas: una petición sin ellas no
  // puede vaciar el alta.
  if (!esObjeto(body.answers)) return res.status(400).json({ error: 'Faltan las respuestas.' })
  const limpio = validarAlta(body.answers)
  if (limpio.error) return res.status(400).json({ error: limpio.error, campo: limpio.campo })
  const enviar = body.enviar === true
  if (enviar && !Object.keys(limpio.answers).length) {
    return res.status(400).json({ error: 'No hay nada que enviar: responde al menos una pregunta.' })
  }

  // Guardar no toca el estado (como en el modo con token: un autoguardado que
  // se cruza con el envío no lo deshace). Y solo mientras siga abierta: si el
  // equipo la recoge entre la lectura de arriba y esto, no se escribe.
  const ahora = new Date().toISOString()
  const cambios = { answers: limpio.answers, updated_at: ahora }
  if (enviar) cambios.negocio = typeof limpio.answers.nombre === 'string' ? linea(limpio.answers.nombre).slice(0, 120) : ''
  const { data: guardada, error } = await supabase.from('helm_altas').update(cambios)
    .eq('id', alta.id).in('estado', ABIERTAS).select('id, enviado_at').maybeSingle()
  if (error) {
    console.warn('[onboarding] alta pública:', error.message)
    return res.status(500).json({ error: 'No se ha podido guardar. Inténtalo de nuevo en un momento.' })
  }
  if (!guardada) return res.status(409).json({ error: ALTA_RECOGIDA })

  let enviadoAt = guardada.enviado_at || null
  if (enviar && !enviadoAt) {
    // El primer envío lo marca una sola petición (la que aún encuentra
    // enviado_at vacío), y solo esa avisa. Si lo reenvía para corregir algo,
    // la agencia ya sabe que está.
    const { data: marcada, error: errEnvio } = await supabase.from('helm_altas')
      .update({ estado: 'enviada', enviado_at: ahora, updated_at: ahora })
      .eq('id', alta.id).eq('estado', 'borrador').is('enviado_at', null)
      .select('id, agencia_id, negocio, enviado_at').maybeSingle()
    if (errEnvio) {
      console.warn('[onboarding] alta pública, envío:', errEnvio.message)
      return res.status(500).json({ error: 'No se ha podido enviar. Inténtalo de nuevo en un momento.' })
    }
    if (marcada) {
      enviadoAt = marcada.enviado_at || ahora
      await avisaAltaEnviada(marcada)
    } else {
      const { data: otra } = await supabase.from('helm_altas').select('enviado_at').eq('id', alta.id).maybeSingle()
      enviadoAt = otra?.enviado_at || null
    }
  }
  return res.status(200).json({ ok: true, estado: enviadoAt ? 'completed' : 'draft', enviado_at: enviadoAt })
}

// POST ?action=alta-publica-borrar { t }: quien la rellenó borra su alta (sus
// datos y sus respuestas) desde /alta. Mientras no tenga perfil: entonces ya
// es un cliente de la agencia, y es a ella a quien se le pide.
async function altaPublicaBorrar(req, res, body) {
  const alta = await altaDeLaLlave(body.t || req.query.t)
  if (!alta) return res.status(401).json({ error: ALTA_NO_VALIDO })
  const { data, error } = await supabase.from('helm_altas').delete()
    .eq('id', alta.id).is('client_id', null).neq('estado', 'convertida').select('id')
  if (error) throw error
  if (!data?.length) {
    const { data: agencia } = await supabase.from('agencias').select('nombre').eq('id', alta.agencia_id).maybeSingle()
    return res.status(409).json({
      error: `Tu alta ya la ha recogido el equipo y tienes perfil: para borrar tus datos, pídeselo a ${agencia?.nombre || 'la agencia'}.`,
    })
  }
  // Sin la IP ni el navegador: es justo lo que se acaba de borrar.
  await writeAudit({
    actor: { role: 'system' }, action: 'alta.borrada', resourceType: 'helm_altas', resourceId: alta.id,
    metadata: { por: 'quien la rellenó', agencia: alta.agencia_id },
  })
  return res.status(200).json({ ok: true })
}

// ── La bandeja: «Altas recibidas» ──────────────────────────────────────────
// Para el administrador de la agencia (o la plataforma, que ve todas). Un
// acceso de cliente no tiene nada que hacer aquí: son negocios que aún no son
// de nadie.

// El alta, si existe y es de una agencia que administra quien llama. La de
// otra agencia, como si no existiera: no se confirma ni que esté.
async function altaDeMiAgencia(auth, altaId) {
  const id = typeof altaId === 'string' ? altaId.trim() : ''
  if (!RE_UUID.test(id)) throw falla('Esa alta no existe.', 404)
  const { data, error } = await supabase.from('helm_altas')
    .select('id, agencia_id, nombre, negocio, answers, estado, enviado_at, client_id').eq('id', id).maybeSingle()
  if (error) throw error
  if (!data || !administraAgencia(auth, data.agencia_id)) throw falla('Esa alta no existe.', 404)
  return data
}

// Las respuestas del alta, al onboarding del perfil: el formulario 'alta', el
// mismo que rellena un cliente por su enlace, ya dado por enviado. Sin pisar:
// si el perfil ya tiene su alta (una conversión repetida, o el equipo ya la ha
// tocado), se queda la que hay.
async function copiaRespuestas(alta, clientId) {
  const { error } = await supabase.from('helm_onboarding').upsert({
    client_id: clientId, form: 'alta', answers: alta.answers || {},
    status: 'completed', completed_at: alta.enviado_at || null, updated_at: new Date().toISOString(),
  }, { onConflict: 'client_id,form', ignoreDuplicates: true })
  if (error) throw error
}

// Ya copiadas al perfil, las respuestas no se guardan dos veces: aquí se
// vacían. Se queda el contacto, que es de quien pidió el alta.
async function vaciaRespuestas(altaId) {
  const { error } = await supabase.from('helm_altas')
    .update({ answers: {}, updated_at: new Date().toISOString() }).eq('id', altaId).eq('estado', 'convertida')
  if (error) console.warn('[onboarding] alta convertida, vaciar respuestas:', error.message)
}

// Lo que ya no sirve: borradores cuya llave ha caducado (nadie puede
// retomarlos) y descartadas (que ya no tienen datos). De las agencias de quien
// mira la bandeja; no lanza.
async function purgaAltas(auth) {
  try {
    const antes = new Date(Date.now() - PURGA_DIAS * 86_400_000).toISOString()
    let q = supabase.from('helm_altas').delete()
      .in('estado', ['borrador', 'descartada']).is('client_id', null).lt('created_at', antes)
    if (!auth.plataforma) q = q.eq('agencia_id', auth.agenciaId || NINGUNA)
    const { error } = await q
    if (error) throw error
  } catch (err) {
    console.warn('[onboarding] purga de altas:', err.message)
  }
}

// GET ?action=altas: las que están en la bandeja, enviadas y a medias, cada
// grupo con su tope (así un montón de borradores no deja fuera una enviada).
// Las convertidas y las descartadas no salen: ya no hay nada que hacer con ellas.
const CAMPOS_LISTA = 'id, agencia_id, nombre, email, telefono, negocio, estado, enviado_at, created_at, client_id, answers'
async function listaAltas(res, auth) {
  await purgaAltas(auth)
  const deEstado = (estado, orden, tope) => {
    let q = supabase.from('helm_altas').select(CAMPOS_LISTA).eq('estado', estado)
      .order(orden, { ascending: false }).limit(tope)
    if (!auth.plataforma) q = q.eq('agencia_id', auth.agenciaId || NINGUNA)
    return q
  }
  const [enviadas, borradores] = await Promise.all([deEstado('enviada', 'enviado_at', 200), deEstado('borrador', 'created_at', 100)])
  if (enviadas.error) throw enviadas.error
  if (borradores.error) throw borradores.error
  const filas = [...(enviadas.data || []), ...(borradores.data || [])]
  const agencias = new Map()
  const ids = [...new Set(filas.map(a => a.agencia_id))]
  if (ids.length) {
    const { data: suyas, error: errAg } = await supabase.from('agencias').select('id, nombre, slug').in('id', ids)
    if (errAg) throw errAg
    for (const a of suyas || []) agencias.set(a.id, { id: a.id, nombre: a.nombre, slug: a.slug })
  }
  const altas = filas.map(({ agencia_id: agenciaId, ...a }) => ({
    ...a, answers: a.answers || {}, agencia: agencias.get(agenciaId) || { id: agenciaId, nombre: '', slug: '' },
  }))
  return res.status(200).json({ altas })
}

// POST ?action=alta-convertir: crea el perfil con el mismo camino que el
// servidor usa para crear perfiles (crearPerfil, api/perfiles.js, que saca la
// fila y el pipeline del mismo módulo que el panel) y le copia las respuestas.
// Idempotente: si ya está convertida, devuelve ese perfil.
async function convierteAlta(req, res, auth, body) {
  const alta = await altaDeMiAgencia(auth, body.altaId)
  const conRespuestas = Object.keys(alta.answers || {}).length > 0
  if (alta.client_id) {
    const { data: suyo, error } = await supabase.from('clients').select('id, slug').eq('id', alta.client_id).maybeSingle()
    if (error) throw error
    if (suyo) {
      // Una conversión que se quedó a medias: lo que faltara, ahora.
      if (conRespuestas) {
        await copiaRespuestas(alta, suyo.id)
        await vaciaRespuestas(alta.id)
      }
      return res.status(200).json({ clientId: suyo.id, slug: suyo.slug })
    }
  }

  const nombre = [alta.answers?.nombre, alta.negocio, alta.nombre]
    .map(v => (typeof v === 'string' ? linea(v) : '')).find(Boolean) || 'Negocio nuevo'
  const perfil = await crearPerfil({ nombre, agenciaId: alta.agencia_id })

  // Se queda con el alta la petición que llega primero (un doble clic en
  // «Crear perfil» son dos): la otra deshace el perfil vacío que acaba de crear
  // y devuelve el bueno.
  // Lo que se copia es lo que había al quedársela: desde ese momento la
  // página ya no puede guardar nada más en ella.
  const { data: ganada, error } = await supabase.from('helm_altas')
    .update({ estado: 'convertida', client_id: perfil.id, updated_at: new Date().toISOString() })
    .eq('id', alta.id).is('client_id', null).select('id, answers, enviado_at').maybeSingle()
  if (error || !ganada) {
    await deshacerPerfilNuevo(perfil.id)
    if (error) throw error
    const { data: otra } = await supabase.from('helm_altas').select('client_id').eq('id', alta.id).maybeSingle()
    const { data: suyo } = otra?.client_id
      ? await supabase.from('clients').select('id, slug').eq('id', otra.client_id).maybeSingle()
      : { data: null }
    if (!suyo) throw falla('Alguien está creando este perfil ahora mismo. Recarga en un momento.', 409)
    return res.status(200).json({ clientId: suyo.id, slug: suyo.slug })
  }

  // Primero se copian y luego se vacían: si copiar falla, el alta las conserva
  // y otro «Crear perfil» (idempotente) termina el trabajo.
  await copiaRespuestas(ganada, perfil.id)
  if (Object.keys(ganada.answers || {}).length) await vaciaRespuestas(alta.id)
  await writeAudit({
    clientId: perfil.id, actor: auth, action: 'alta.convertida', resourceType: 'helm_altas', resourceId: alta.id, req,
    metadata: { slug: perfil.slug, agencia: alta.agencia_id },
  })
  return res.status(200).json({ clientId: perfil.id, slug: perfil.slug })
}

// POST ?action=alta-descartar: no se crea perfil, y no se guarda nada de quien
// la rellenó: se vacían su contacto, sus respuestas, su origen y su huella. Queda
// la fila, para que su página diga que el equipo ya la ha recogido (y se borra
// sola con la purga).
const VACIA = { nombre: '', email: '', telefono: '', negocio: '', answers: {}, origen: {}, ip_hash: '' }
async function descartaAlta(req, res, auth, body) {
  const alta = await altaDeMiAgencia(auth, body.altaId)
  const yaTienePerfil = falla('Esta alta ya tiene perfil: no se puede descartar.', 409)
  if (alta.client_id) throw yaTienePerfil
  if (alta.estado !== 'descartada') {
    const { data, error } = await supabase.from('helm_altas')
      .update({ ...VACIA, estado: 'descartada', updated_at: new Date().toISOString() })
      .eq('id', alta.id).is('client_id', null).select('id').maybeSingle()
    if (error) throw error
    if (!data) throw yaTienePerfil
    await writeAudit({ actor: auth, action: 'alta.descartada', resourceType: 'helm_altas', resourceId: alta.id, req })
  }
  return res.status(200).json({ ok: true, estado: 'descartada' })
}

// Las acciones del alta pública: las de la página, sin sesión; las de la
// bandeja, con sesión de administrador y sin perfil.
const DE_LA_PAGINA = new Set(['alta-publica-agencia', 'alta-publica-nueva', 'alta-publica', 'alta-publica-borrar'])

async function altasSinPerfil(req, res, action) {
  let body = req.body || {}
  if (typeof body === 'string') {
    try { body = JSON.parse(body) } catch { return res.status(400).json({ error: 'Petición mal formada' }) }
  }
  if (!esObjeto(body)) body = {}

  if (DE_LA_PAGINA.has(action)) {
    const gate = rateLimit({ key: `onb-alta-pub-${req.method}:${redDeIp(getClientIp(req)) || 'anon'}`, max: 60, windowMs: 60_000 })
    if (!gate.ok) return demasiadas(res, gate, 'Demasiadas peticiones seguidas. Espera un minuto y vuelve a intentarlo.')
    if (action === 'alta-publica-agencia') {
      if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
      return await agenciaPublica(req, res)
    }
    if (action === 'alta-publica') {
      if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
      return await altaPublicaGuardada(req, res, body)
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
    if (action === 'alta-publica-nueva') return await altaPublicaNueva(req, res, body)
    return await altaPublicaBorrar(req, res, body)
  }

  let auth
  try {
    auth = await validateAuth(req, { required: true })
  } catch (err) {
    return res.status(err.statusCode || 401).json({ error: err.message })
  }
  if (!auth.plataforma && !(auth.superadmin || auth.role === 'superadmin')) {
    return res.status(403).json({ error: 'Las altas solo las gestiona el administrador de la agencia.' })
  }
  if (action === 'altas') {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
    return await listaAltas(res, auth)
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (action === 'alta-convertir') return await convierteAlta(req, res, auth, body)
  return await descartaAlta(req, res, auth, body)
}

const SIN_PERFIL = new Set([...DE_LA_PAGINA, 'altas', 'alta-convertir', 'alta-descartar'])

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

  // Y el alta pública, que no es de ningún perfil.
  if (SIN_PERFIL.has(action)) {
    try {
      return await altasSinPerfil(req, res, action)
    } catch (err) {
      if (err?.statusCode) return res.status(err.statusCode).json({ error: err.message })
      console.error(`[onboarding] ${action}:`, err?.message || err)
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

    const { kind, dossier, form } = req.body || {}
    if (!SPECS[kind]) return res.status(400).json({ error: 'kind inválido (empresa | contenido)' })
    if (!dossier?.trim()) return res.status(400).json({ error: 'El onboarding está vacío: no hay nada que sintetizar.' })

    const { system, messages } = buildPrompt(kind, dossier)
    let content
    try {
      content = await llmChat({ clientId, system, messages, maxTokens: MAX_TOKENS, temperature: 0.6 })
    } catch (err) {
      return res.status(err.statusCode || 502).json({ error: err.message || 'Error generando la Biblia' })
    }

    // Una Biblia retocada a mano no se pierde al volver a generarla: antes de
    // sustituirla se archiva tal cual en Archivos (archivarBiblia solo guarda
    // las generadas, y «save» no archiva).
    const { data: previa } = await supabase.from('helm_biblia')
      .select('content, status').eq('client_id', clientId).eq('kind', kind).maybeSingle()
    if (previa?.status === 'edited' && previa.content) {
      await archivarBiblia(clientId, kind, `${SPECS[kind].title} (editada a mano)`, previa.content)
    }

    const { data, error } = await supabase.from('helm_biblia').upsert({
      client_id: clientId, kind, title: SPECS[kind].title, content, status: 'generated',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'client_id,kind' }).select('kind, title, content, status, updated_at').single()
    if (error) return res.status(500).json({ error: error.message })

    await archivarBiblia(clientId, kind, SPECS[kind].title, content)
    // Solo cuando la Biblia sale del formulario de contenido (o de un panel de
    // antes, que no dice de cuál): el alta se marca sola desde el panel y una
    // regeneración desde la carpeta Biblia no completa nada.
    if ((form || 'contenido') === 'contenido') await markCompleted(clientId)
    return res.status(200).json({ biblia: data })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
