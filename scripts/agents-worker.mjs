// HELM — el worker del Agent OS.
//
// Come de la tabla `agent_jobs` y lleva cada reel por su recorrido:
//
//   descargar    yt-dlp saca el audio y los números que el sitio deje ver
//   transcribir  Whisper (local, en CPU) pasa el audio a texto con marcas de tiempo
//   etiquetar    el modelo lee el guion y lo clasifica: tema, gancho,
//                estructura, CTA, y cada frase como gancho / planteamiento /
//                remate / venta
//
// Por qué un proceso aparte y no un endpoint: transcribir un reel de 60 s en
// esta máquina (4 núcleos, sin GPU) tarda entre 20 y 40 segundos. Eso no cabe
// en una petición HTTP, y si se cae a mitad no se puede reintentar solo.
//
// Un solo worker a la vez. El reparto de trabajos no usa bloqueo de fila
// porque no hace falta: si algún día corren dos, hay que cambiar `coge()` por
// un SELECT ... FOR UPDATE SKIP LOCKED en una función de Postgres.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, rm, stat, unlink } from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

// El límite de tiempo del modelo, ANTES de cargar llm.js: ese módulo lo lee al
// importarse. Por eso la importación de abajo es dinámica.
//
// El valor por defecto de HELM es 85 s, que es lo correcto para el chat: nadie
// espera minuto y medio mirando una pantalla. Aquí es al revés — esto corre en
// segundo plano, sin nadie delante, y en CPU sin GPU un modelo de 7B tarda
// varios minutos en escribir el JSON de un guion largo. Con 85 s el etiquetado
// no llegaba a terminar nunca.
process.env.HELM_LLM_TIMEOUT_MS ||= '600000'

const { llmChat } = await import('../api/_lib/llm.js')
const { claudeTurno } = await import('../api/_lib/anthropic.js')
// Cada trabajo corre con su perfil en el contexto: lo que gaste en Claude se
// cobra en créditos a la agencia de ese perfil (ver api/_lib/creditos.js).
const { enContexto } = await import('../api/_lib/contexto.js')
// Jev etiqueta cuando Claude no puede, antes que el 7B local: clasificar es
// justo lo que hace bien y justo lo que al local se le da mal.
const { jevDisponible, etiquetaConJev } = await import('../api/_lib/jev.js')

// ── Quién etiqueta: Claude por la API y, si no puede, el modelo local ──────
// Claude (Haiku: rápido, barato y de sobra para clasificar) etiqueta mucho
// mejor que el 7B local, que pone "pregunta" de gancho a casi todo. Pero la
// cuenta puede quedarse sin crédito o la clave caducar: entonces se sigue con
// el local, sin parar la cola, y se vuelve a probar Claude pasado un rato.
const CLAUDE_KEY = process.env.AGENTS_ANTHROPIC_KEY || process.env.ANTHROPIC_API_KEY || ''
const CLAUDE_MODELO = process.env.AGENTS_CLAUDE_MODEL || 'claude-haiku-4-5'
let claudeEnPausaHasta = 0

const claudeListo = () => Boolean(CLAUDE_KEY) && Date.now() > claudeEnPausaHasta

async function pideAlModelo({ system, user, maxTokens }) {
  if (CLAUDE_KEY && Date.now() > claudeEnPausaHasta) {
    try {
      const r = await claudeTurno({ apiKey: CLAUDE_KEY, model: CLAUDE_MODELO, system, messages: [{ role: 'user', content: user }], maxTokens })
      return { texto: r.content, por: 'claude-api' }
    } catch (err) {
      // Sin créditos es la agencia de ESE perfil, no la cuenta de Anthropic:
      // no se pausa Claude para todos, solo falla este trabajo.
      if (err.statusCode === 402) throw err
      const msg = String(err.message || '')
      // Sin crédito, clave mala o sin acceso: una hora de pausa. Límite de
      // peticiones o Anthropic caído: cinco minutos. Mientras, el local.
      const largo = /credit|saldo|billing|clave|acceso/i.test(msg) || err.statusCode === 401 || err.statusCode === 403
      claudeEnPausaHasta = Date.now() + (largo ? 60 : 5) * 60_000
      log(`Claude no disponible (${msg.slice(0, 120)}); sigo con el modelo local ${largo ? 'una hora' : 'cinco minutos'}`)
    }
  }
  const texto = await llmChat({ system, messages: [{ role: 'user', content: user }], temperature: 0.2, maxTokens })
  return { texto, por: 'local' }
}

const ejecuta = promisify(execFile)

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('[agents] Faltan SUPABASE_URL o SUPABASE_SERVICE_KEY. Se esperaba .env.server.')
  process.exit(1)
}
const db = createClient(SUPABASE_URL, SUPABASE_KEY)

// Dónde viven el audio y el entorno de Python. Fuera del repo a propósito: son
// datos y binarios, no código, y el audio pesa.
const BASE       = process.env.AGENTS_DIR      || '/home/s4sf/helm-agents'
const DIR_AUDIO  = path.join(BASE, 'audio')
const PY         = process.env.AGENTS_PYTHON   || path.join(BASE, 'venv/bin/python')
const YTDLP      = process.env.AGENTS_YTDLP    || path.join(BASE, 'venv/bin/yt-dlp')
const TRANSCRIBE = path.resolve(new URL('.', import.meta.url).pathname, 'agents-transcribe.py')
const MODELO_WHISPER = process.env.AGENTS_WHISPER_MODEL || 'small'

const ESPERA_VACIO_MS = 5000     // cuánto duerme cuando no hay nada que hacer
const ESPERA_REINTENTO_MS = 60_000 // cuánto espera un trabajo que ha fallado

const ahora = () => new Date().toISOString()
const log = (...a) => console.log(`[agents ${new Date().toISOString()}]`, ...a)

// ── Cola ────────────────────────────────────────────────────────────────────

async function coge() {
  // Primero lo de Drive: es un vídeo grabado que alguien espera ver ordenado,
  // mientras que etiquetar el corpus puede esperar. Sin esto, un vídeo nuevo
  // se quedaría detrás de horas de reels por analizar.
  const pendientes = () => db.from('agent_jobs')
    .select('*')
    .eq('estado', 'pendiente')
    .lte('correr_tras', ahora())
    .order('created_at', { ascending: true })
    .limit(1)
  let { data, error } = await pendientes().like('tipo', 'drive-%')
  // Después, las noticias y el equipo de agentes: son pocos trabajos al día y
  // cortos, y lo de la mañana no puede esperar a que se vacíe la cola de reels.
  if (!error && !data?.length) ({ data, error } = await pendientes().in('tipo', ['noticias', 'articulo', 'equipo', 'avatar', 'radar']))
  if (!error && !data?.length) ({ data, error } = await pendientes())
  if (error) { log('error leyendo la cola:', error.message); return null }
  const job = data?.[0]
  if (!job) return null

  const { data: cogido, error: e2 } = await db.from('agent_jobs')
    .update({ estado: 'corriendo', intentos: job.intentos + 1, empezado_en: ahora() })
    .eq('id', job.id).eq('estado', 'pendiente')   // no lo cojas si otro se adelantó
    .select().maybeSingle()
  if (e2) { log('error cogiendo el trabajo:', e2.message); return null }
  return cogido || null
}

async function hecho(job) {
  await db.from('agent_jobs')
    .update({ estado: 'hecho', acabado_en: ahora(), error: '' })
    .eq('id', job.id)
}

async function fallo(job, err) {
  const msg = String(err?.message || err).slice(0, 600)
  const agotado = job.intentos >= job.max_intentos
  await db.from('agent_jobs').update({
    estado: agotado ? 'error' : 'pendiente',
    error: msg,
    acabado_en: agotado ? ahora() : null,
    // Espera creciente entre intentos: si falla por algo pasajero (la red, el
    // sitio que va lento), reintentar de inmediato solo gasta.
    correr_tras: agotado ? ahora()
      : new Date(Date.now() + ESPERA_REINTENTO_MS * job.intentos).toISOString(),
  }).eq('id', job.id)

  // El audio de un reel que ya no se va a reintentar no se queda en el disco.
  if (agotado && job.payload?.reelId) {
    for (const ext of ['mp3', 'video']) await rm(path.join(DIR_AUDIO, `${job.payload.reelId}.${ext}`), { force: true }).catch(() => {})
  }
  if (agotado && job.payload?.reelId) {
    await db.from('agent_reels')
      .update({ estado: 'error', error: msg, updated_at: ahora() })
      .eq('id', job.payload.reelId)
  }
  if (agotado && job.payload?.driveId) {
    await db.from('agent_drive_videos')
      .update({ estado: 'error', error: msg, updated_at: ahora() })
      .eq('drive_id', job.payload.driveId)
  }
  log(`✗ ${job.tipo} (intento ${job.intentos}/${job.max_intentos}):`, msg)
}

// `turno`: el created_at del trabajo que lo encola. El siguiente paso de un
// reel hereda su sitio en la cola: si no, un reel que se pidió primero
// esperaría a transcribirse detrás de todo lo que entró después.
async function encola(tipo, payload, clave, turno = null) {
  await db.from('agent_jobs').upsert(
    { tipo, payload, clave, estado: 'pendiente', correr_tras: ahora(), ...(turno ? { created_at: turno } : {}) },
    { onConflict: 'clave', ignoreDuplicates: true },
  )
}

const estadoReel = (id, estado, extra = {}) =>
  db.from('agent_reels').update({ estado, updated_at: ahora(), ...extra }).eq('id', id)

async function reelDe(id) {
  const { data, error } = await db.from('agent_reels').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  if (!data) throw new Error(`El reel ${id} ya no existe`)
  return data
}

// ── Paso 1: descargar ───────────────────────────────────────────────────────
// yt-dlp saca el audio y, de paso, los metadatos que el sitio exponga. En
// Instagram suele venir la descripción y a veces las vistas; si no vienen, se
// rellenan a mano desde el panel. No se inventa nada.

async function descargar(job) {
  const reel = await reelDe(job.payload.reelId)
  await estadoReel(reel.id, 'descargando', { error: '' })
  await mkdir(DIR_AUDIO, { recursive: true })

  const salida = path.join(DIR_AUDIO, `${reel.id}.%(ext)s`)
  const mp3 = path.join(DIR_AUDIO, `${reel.id}.mp3`)

  // Los vídeos propios de cada perfil vienen de su Drive, no de Instagram: se
  // bajan de ahí y se les saca el audio. Lo demás (transcribir, etiquetar) es
  // igual que con cualquier reel.
  if (reel.fuente === 'drive') {
    const driveId = reel.url.match(/\/file\/d\/([^/?]+)/)?.[1]
    if (!driveId) throw new Error('Enlace de Drive sin id de archivo')
    const meta = await archivoDrive(driveId)
    const video = path.join(DIR_AUDIO, `${reel.id}.video`)
    try {
      await bajaDeDrive(driveId, video)
      await ejecuta('ffmpeg', ['-y', '-loglevel', 'error', '-i', video, '-vn', '-ac', '1', '-ar', '16000', '-b:a', '48k', mp3])
    } finally {
      await unlink(video).catch(() => {})
    }
    const ms = Number(meta.videoMediaMetadata?.durationMillis)
    await db.from('agent_reels').update({
      audio_path: mp3,
      duracion_s: Number.isFinite(ms) ? Math.round(ms / 1000) : null,
      caption: reel.caption || meta.name,
      publicado_en: reel.publicado_en || meta.createdTime || null,
      estado: 'transcribiendo',
      updated_at: ahora(),
    }).eq('id', reel.id)
    await encola('transcribir', { reelId: reel.id }, `transcribir:${reel.url_hash}`, job.created_at)
    log(`✓ bajado de Drive ${reel.id} (${meta.name})`)
    return
  }

  // Lo que no sea una URL http(s) no llega a yt-dlp, y la URL va siempre
  // detrás de `--`: así nunca se puede leer como una opción del programa.
  let esUrl = false
  try { esUrl = ['http:', 'https:'].includes(new URL(reel.url).protocol) } catch { /* no es una URL */ }
  if (!esUrl) throw new Error('El enlace del reel no es una URL http(s)')

  let meta = {}
  try {
    const { stdout } = await ejecuta(YTDLP, [
      '--no-playlist', '--no-warnings', '--print-json', '--skip-download', '--', reel.url,
    ], { timeout: 120_000, maxBuffer: 20 * 1024 * 1024 })
    meta = JSON.parse(stdout.trim().split('\n').pop() || '{}')
  } catch (e) {
    // Que no haya metadatos no es fatal: lo que hace falta es el audio.
    log('sin metadatos para', reel.url, '—', String(e.message).slice(0, 120))
  }

  try {
    await ejecuta(YTDLP, [
      '--no-playlist', '--no-warnings',
      '-x', '--audio-format', 'mp3', '--audio-quality', '5',
      '-o', salida, '--', reel.url,
    ], { timeout: 600_000, maxBuffer: 20 * 1024 * 1024 })
  } catch (err) {
    // El vídeo no trae pista de audio: es de los de frase en pantalla.
    if (/audio codec|no audio/i.test(String(err.message))) {
      return sinVoz(reel, reel.caption || meta.description || meta.title)
    }
    throw err
  }

  const info = await stat(mp3).catch(() => null)
  if (!info || info.size < 1024) throw new Error('yt-dlp no ha dejado audio utilizable')

  // Solo se guardan los números que vengan de verdad. Un 0 inventado
  // contamina la gráfica y parece un dato real.
  const metricas = { ...(reel.metricas || {}) }
  if (Number.isFinite(meta.view_count))    metricas.vistas      = meta.view_count
  if (Number.isFinite(meta.like_count))    metricas.likes       = meta.like_count
  if (Number.isFinite(meta.comment_count)) metricas.comentarios = meta.comment_count

  await db.from('agent_reels').update({
    audio_path: mp3,
    duracion_s: Number.isFinite(meta.duration) ? meta.duration : null,
    caption: reel.caption || String(meta.description || meta.title || ''),
    cuenta: reel.cuenta || String(meta.uploader_id || meta.uploader || meta.channel || ''),
    publicado_en: meta.timestamp ? new Date(meta.timestamp * 1000).toISOString() : reel.publicado_en,
    metricas,
    estado: 'transcribiendo',
    updated_at: ahora(),
  }).eq('id', reel.id)

  await encola('transcribir', { reelId: reel.id }, `transcribir:${reel.url_hash}`, job.created_at)
  log(`✓ descargado ${reel.id} (${(info.size / 1024 / 1024).toFixed(1)} MB)`)
}

// Un reel sin voz (música y una frase en pantalla) no es un fallo: es un
// formato, y casi siempre de alcance. Se etiqueta como Viralidad con su texto
// de pantalla, que suele venir en el caption, en vez de darlo por perdido.
async function sinVoz(reel, caption = reel.caption) {
  const texto = String(caption || '').trim()
  await db.from('agent_reels').update({
    caption: texto,
    transcripcion: texto,
    frases: [],
    etiquetas: {
      tema: texto.split('\n')[0].slice(0, 80),
      tipo_gancho: '', estructura: '', cta: '',
      tipo: 'viralidad', formato: 'b-roll + frase en pantalla', por: 'auto',
    },
    audio_path: '',
    estado: 'etiquetado',
    error: '',
    updated_at: ahora(),
  }).eq('id', reel.id)
  if (reel.audio_path) await unlink(reel.audio_path).catch(() => {})
  log(`✓ sin voz ${reel.id}: frase en pantalla → Viralidad`)
}

// ── Paso 2: transcribir ─────────────────────────────────────────────────────

async function transcribir(job) {
  const reel = await reelDe(job.payload.reelId)
  if (!reel.audio_path) throw new Error('Ese reel no tiene audio descargado')
  await estadoReel(reel.id, 'transcribiendo', { error: '' })

  const { stdout } = await ejecuta(PY, [TRANSCRIBE, reel.audio_path, MODELO_WHISPER], {
    timeout: 1_800_000,              // media hora: en CPU, un vídeo largo tarda
    maxBuffer: 40 * 1024 * 1024,
  })
  const out = JSON.parse(stdout)
  if (out.error) throw new Error(`Whisper: ${out.error}`)

  const texto = String(out.texto || '').trim()
  if (!texto) return sinVoz(reel)

  await db.from('agent_reels').update({
    transcripcion: texto,
    idioma: String(out.idioma || ''),
    // Los segmentos de Whisper entran ya como frases, con su marca de tiempo y
    // sin papel asignado. El etiquetado de después solo pone el rol.
    frases: (out.segmentos || []).map(s => ({
      texto: String(s.texto || '').trim(),
      rol: null,
      inicio_s: Number(s.inicio) || 0,
    })).filter(f => f.texto),
    estado: 'transcrito',
    updated_at: ahora(),
  }).eq('id', reel.id)

  // El audio ya no hace falta: lo que se estudia es el texto, y guardar los
  // mp3 de cientos de reels llena el disco sin aportar nada.
  await unlink(reel.audio_path).catch(() => {})
  await db.from('agent_reels').update({ audio_path: '' }).eq('id', reel.id)

  await encola('etiquetar', { reelId: reel.id }, `etiquetar:${reel.url_hash}`, job.created_at)
  log(`✓ transcrito ${reel.id} (${texto.length} caracteres, ${out.idioma})`)
}

// ── Paso 3: etiquetar ───────────────────────────────────────────────────────

const ROLES = ['gancho', 'planteamiento', 'remate', 'venta']

// Los valores que puede tomar cada etiqueta. Esto NO es documentación: se
// comprueba, y si el modelo devuelve otra cosa se le pide de nuevo.
//
// Hizo falta porque en el primer reel real el modelo puso "planteamiento" en
// `estructura` —que es un papel de frase, no una estructura— y se guardó tal
// cual. Una etiqueta inventada es peor que una vacía: ensucia la gráfica y
// nadie se da cuenta de que ese valor no significa nada.
const GANCHOS_VALIDOS = ['pregunta', 'dato', 'error comun', 'contrarian',
  'historia', 'promesa', 'lista', 'demostracion']
const TIPOS_REEL = ['viralidad', 'conversion', 'autoridad', 'venta']
const ESTRUCTURAS_VALIDAS = ['problema-solucion', 'lista', 'historia',
  'comparacion', 'tutorial', 'opinion']

// Sin acentos y en minúsculas, para comparar: el modelo escribe "Error Común"
// tan a menudo como "error comun".
const normaliza = (v) => String(v || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().trim()

const SISTEMA = `Eres un analista de guiones de vídeo corto. Lees la transcripción de un reel y la clasificas.

Devuelves SOLO un objeto JSON, sin texto alrededor y sin vallas de código, con esta forma exacta:
{
  "tema": "de qué va, en tres o cuatro palabras",
  "tipo_gancho": "uno de: pregunta | dato | error comun | contrarian | historia | promesa | lista | demostracion",
  "estructura": "uno de: problema-solucion | lista | historia | comparacion | tutorial | opinion",
  "cta": "qué pide al final, literal; cadena vacía si no pide nada",
  "tipo": "uno de: viralidad | conversion | autoridad | venta",
  "frases": [{"i": 0, "rol": "gancho"}]
}

Sobre "frases": te llega la transcripción numerada. Devuelves el papel de CADA
línea, con su mismo número en "i". Los papeles son:
  gancho        — abre y frena el scroll. Casi siempre las primeras líneas.
  planteamiento — desarrolla, explica, da contexto o ejemplos.
  remate        — la conclusión o el giro.
  venta         — pide algo: comentar una palabra, seguir, entrar en un enlace.

Sobre "tipo", para qué sirve el reel:
  viralidad  — alcance: gancho fuerte, tema amplio, no pide nada.
  autoridad  — demostrar que sabe: enseña, desmonta mitos, cuenta casos.
  conversion — llevar a la conversación: "comenta X", "escríbeme".
  venta      — la oferta: testimonios, resultados, llamada a comprar.

Reglas: no te inventes líneas que no estén. No dejes ninguna sin papel. Si dudas
entre dos, elige planteamiento.`

// El modelo devuelve texto. Esto saca el JSON aunque venga envuelto en prosa o
// en vallas de código, que es lo que hacen los modelos pequeños.
function sacaJson(txt) {
  const limpio = String(txt).replace(/```(?:json)?/gi, '').trim()
  const i = limpio.indexOf('{')
  const j = limpio.lastIndexOf('}')
  if (i === -1 || j <= i) throw new Error('El modelo no ha devuelto JSON')
  return JSON.parse(limpio.slice(i, j + 1))
}

async function etiquetar(job) {
  const reel = await reelDe(job.payload.reelId)
  if (!reel.transcripcion) throw new Error('Ese reel no tiene transcripción')

  // Claude ya lo etiquetó por el conector (api/mcp): su etiquetado es mejor
  // que el del modelo local y no se pisa. Solo falta darlo por terminado.
  if (reel.etiquetas?.por === 'claude') {
    await db.from('agent_reels').update({ estado: 'etiquetado', error: '', updated_at: ahora() }).eq('id', reel.id)
    log(`= etiquetado ${reel.id} — ya lo había hecho Claude`)
    return
  }

  // El contexto de la identidad, si el reel pertenece a una. Es lo que hace
  // que el análisis se lea con los ojos de ese creador y no en abstracto.
  let contexto = ''
  if (reel.identity_id) {
    const { data: ident } = await db.from('agent_identities')
      .select('nombre, contexto, reglas').eq('id', reel.identity_id).maybeSingle()
    if (ident?.contexto) {
      contexto = `\n\nEste reel es de ${ident.nombre}. Lo que se sabe de cómo trabaja:\n${ident.contexto.slice(0, 4000)}`
    }
  }

  const frases = (reel.frases || []).filter(f => f.texto)
  const lineas = frases.length ? frases.map(f => f.texto) : reel.transcripcion.split(/(?<=[.!?])\s+/)
  const numeradas = lineas.map((t, i) => `${i}. ${t}`).join('\n')

  // Tres intentos: si el JSON no vale —por forma o porque una etiqueta no está
  // en su lista— se le dice EXACTAMENTE qué falló y se repite. Decirle el
  // motivo es lo que hace que el segundo intento acierte; repetir la misma
  // petición a secas suele devolver el mismo error.
  let out = null
  let quien = 'local'
  let ultimoFallo = ''
  // Con Claude en pausa (sin crédito, caído), Jev antes que el local.
  if (!claudeListo() && jevDisponible()) {
    try {
      out = await etiquetaConJev(lineas)
      quien = 'jev'
    } catch (err) {
      log(`Jev no pudo etiquetar (${String(err.message).slice(0, 120)}); sigo con el modelo local`)
    }
  }
  for (let intento = 1; !out && intento <= 3; intento++) {
    const aviso = ultimoFallo ? `\n\nEl intento anterior falló: ${ultimoFallo}. Devuelve SOLO el JSON.` : ''
    const { texto: txt, por } = await pideAlModelo({
      system: SISTEMA + contexto,
      user: `Transcripción numerada:\n\n${numeradas}${aviso}`,
      maxTokens: 1200,
    })
    quien = por
    try {
      const j = sacaJson(txt)
      if (!j || typeof j !== 'object') throw new Error('no es un objeto')
      if (!Array.isArray(j.frases)) throw new Error('falta la lista "frases"')
      const g = normaliza(j.tipo_gancho)
      if (!GANCHOS_VALIDOS.includes(g)) {
        throw new Error(`tipo_gancho "${j.tipo_gancho}" no está en la lista (${GANCHOS_VALIDOS.join(', ')})`)
      }
      // La estructura inventada se queda vacía en vez de repetir: el 7B la
      // confunde una y otra vez con los papeles de frase ("planteamiento"), y
      // tirar por ella el gancho, el tema y las frases salía mucho más caro.
      const e = ESTRUCTURAS_VALIDAS.includes(normaliza(j.estructura)) ? normaliza(j.estructura) : ''
      // El tipo de reel: si viene fuera de lista se queda vacío, como la estructura.
      j.tipo = TIPOS_REEL.includes(normaliza(j.tipo)) ? normaliza(j.tipo) : ''
      // Se guardan ya normalizados: así la gráfica agrupa bien aunque el
      // modelo haya escrito "Error Común" con mayúsculas y tilde.
      j.tipo_gancho = g
      j.estructura = e
      out = j
      break
    } catch (e) {
      ultimoFallo = String(e.message).slice(0, 160)
      if (intento === 3) throw new Error(`El modelo no devolvió un JSON válido: ${ultimoFallo}`)
    }
  }

  // Los papeles vuelven por número de línea. Lo que el modelo no clasifique o
  // clasifique con un valor que no existe se queda en planteamiento.
  const porIndice = new Map()
  for (const f of out.frases) {
    const i = Number(f?.i)
    if (Number.isInteger(i) && ROLES.includes(f?.rol)) porIndice.set(i, f.rol)
  }
  const base = frases.length
    ? frases
    : reel.transcripcion.split(/(?<=[.!?])\s+/).map(t => ({ texto: t.trim(), inicio_s: null }))

  await db.from('agent_reels').update({
    etiquetas: {
      tema: String(out.tema || '').slice(0, 120),
      tipo_gancho: String(out.tipo_gancho || '').slice(0, 40),
      estructura: String(out.estructura || '').slice(0, 40),
      cta: String(out.cta || '').slice(0, 200),
      tipo: out.tipo || '',
      // Quién lo etiquetó: lo del modelo local y lo de Jev es un borrador a revisar.
      por: quien,
      ...(out.confianza != null ? { confianza: Math.round(out.confianza * 100) / 100 } : {}),
    },
    frases: base.map((f, i) => ({
      texto: f.texto,
      rol: porIndice.get(i) || 'planteamiento',
      inicio_s: f.inicio_s ?? null,
    })),
    estado: 'etiquetado',
    error: '',
    updated_at: ahora(),
  }).eq('id', reel.id)

  log(`✓ etiquetado ${reel.id} (${quien}) — ${out.tema} / ${out.tipo_gancho}`)
}

// ── Ingesta de Drive ────────────────────────────────────────────────────────
// Cada perfil con carpeta en "HELM Contenido" tiene su "0 · Entrada". Lo que
// cae ahí se transcribe, se compara con los guiones del calendario y, si se
// sabe de cuál es, va a su pieza en "1 · Sin editar / <tipo>". Si no se sabe,
// se queda en Entrada y se apunta como "sin guion": mejor quieto que mal puesto.
const { enEntrada, calendario, emparejar, ordenar } = await import('../api/_lib/ingesta.js')
const { descargar: bajaDeDrive, archivo: archivoDrive } = await import('../api/_lib/drive-helm.js')

const CADA_CUANTO_MIRAR_MS = 5 * 60_000
let ultimaMirada = 0

async function miraEntradas() {
  ultimaMirada = Date.now()
  const { data: perfiles } = await db.from('agent_drive_perfiles').select('client_id').eq('activa', true)
  for (const { client_id } of perfiles || []) {
    try {
      for (const v of await enEntrada(client_id)) {
        const { data: ya } = await db.from('agent_drive_videos').select('drive_id').eq('drive_id', v.id).maybeSingle()
        if (ya) continue
        await db.from('agent_drive_videos').insert({ drive_id: v.id, client_id, nombre: v.name })
        await encola('drive-ingesta', { clientId: client_id, driveId: v.id }, `drive:${v.id}`)
        log(`↓ nuevo en Entrada: ${v.name}`)
      }
    } catch (err) {
      log(`no pude mirar la Entrada de ${client_id}:`, err.message)
    }
  }
}

const estadoVideo = (id, extra) =>
  db.from('agent_drive_videos').update({ ...extra, updated_at: ahora() }).eq('drive_id', id)

async function driveIngesta(job) {
  const { clientId, driveId } = job.payload
  const meta = await archivoDrive(driveId)
  const desde = meta.parents?.[0]

  // Transcribir solo el principio: para saber de qué guion es sobra, y un
  // vídeo largo en CPU tardaría lo que dura.
  const base = path.join(DIR_AUDIO, `drive-${driveId}`)
  let texto = ''
  try {
    await bajaDeDrive(driveId, `${base}.video`)
    await ejecuta('ffmpeg', ['-y', '-loglevel', 'error', '-i', `${base}.video`, '-t', '240', '-vn', '-ac', '1', '-ar', '16000', '-b:a', '48k', `${base}.mp3`])
    const { stdout } = await ejecuta(PY, [TRANSCRIBE, `${base}.mp3`, MODELO_WHISPER], { maxBuffer: 50 * 1024 * 1024 })
    texto = String(JSON.parse(stdout).texto || '').trim()
  } finally {
    await unlink(`${base}.video`).catch(() => {})
    await unlink(`${base}.mp3`).catch(() => {})
  }
  await estadoVideo(driveId, { estado: 'transcrito', transcripcion: texto })

  // Candidatos: los guiones de un mes atrás a dos adelante. Los ya grabados
  // también, porque una pieza suele tener varias tomas.
  const hoy = new Date()
  const dia = (d) => new Date(hoy.getTime() + d * 86_400_000).toISOString().slice(0, 10)
  const guiones = (await calendario(clientId, { desde: dia(-30), hasta: dia(60) }))
    .filter(g => g.fase === 'por_grabar' || g.fase === 'sin_editar')
  const par = emparejar(texto, guiones)

  if (!par) {
    await estadoVideo(driveId, { estado: 'sin_guion' })
    log(`? ${meta.name}: no sé de qué guion es, se queda en Entrada`)
    return
  }
  const r = await ordenar({ clientId, driveId, desde, guion: par.g })
  await estadoVideo(driveId, { estado: 'ordenado', calendario_id: par.g.id, destino: `${r.destino} / ${par.g.date} · ${par.g.title}` })
  log(`✓ ${meta.name} → ${par.g.date} · ${par.g.title} (${Math.round(par.nota * 100)}%)`)
}

// ── El estudio de contenido ─────────────────────────────────────────────────
// Lo que antes había que pedirle a Claude a mano por el conector («analízame a
// este creador»), lo hace el agente solo: cuando un creador junta reels nuevos
// ya etiquetados, lee su corpus entero y escribe qué le funciona y por qué.
// El estudio se guarda en la memoria del creador (clave 'estudio'), que es de
// donde lo lee Claude al escribir guiones, y se avisa a los perfiles que lo
// tienen de referencia.
//
// Siempre con Claude y nunca con el modelo local: un corpus de cincuenta
// guiones no cabe en un 7B en CPU, y un estudio malo es peor que ninguno
// porque los guiones se escriben a partir de él. Sin Claude, se reintenta.
const { notificar } = await import('../api/_lib/notificar.js')

const MODELO_ESTUDIO = process.env.AGENTS_CLAUDE_MODEL_ESTUDIO || 'claude-sonnet-5'
const CADA_CUANTO_ESTUDIAR_MS = 30 * 60_000
const MIN_REELS_ESTUDIO = 3      // con menos no hay patrón que sacar
const MIN_NUEVOS_ESTUDIO = 3     // reels nuevos para rehacer un estudio que ya existe
const MAX_REELS_ESTUDIO = 60
let ultimoEstudio = 0

const SYSTEM_ESTUDIO = `Eres el analista de contenido del equipo. Estudias el corpus de reels de un creador de referencia y escribes el estudio que usará quien escriba guiones inspirados en él.

Reglas:
· Español de España, directo, sin relleno de consultora.
· Usa SOLO lo que hay en el corpus. No inventes cifras ni reels. Cita ganchos y frases literales, entre comillas.
· Los reels vienen ordenados de más a menos vistas. «Funciona» significa que se repite entre los más vistos y no entre los menos vistos; si un patrón aparece igual arriba y abajo, no explica nada: dilo.
· Las etiquetas marcadas como «modelo local» son un borrador poco fiable: fíate del guion antes que de la etiqueta.
· Si el corpus es demasiado pequeño para afirmar algo, dilo en vez de forzar una conclusión.
· Devuelve SOLO markdown, empezando por "# Estudio de contenido".

Estructura (## para cada sección):
## En una frase — qué hace este creador distinto, y para quién.
## Ganchos que le funcionan — los 3-5 tipos de apertura de sus reels más vistos, cada uno con un ejemplo literal y por qué engancha.
## Cómo monta un reel — la estructura que repite, tiempo a tiempo, y cuánto dura.
## Temas — de qué habla cuando le va bien y de qué cuando no.
## Cómo pide — sus CTA literales y dónde los coloca.
## Lo que no funciona — patrones de sus reels menos vistos.
## Para copiar mañana — 5 plantillas de gancho rellenables, derivadas de lo anterior.`

async function miraEstudios() {
  ultimoEstudio = Date.now()
  if (!CLAUDE_KEY) return
  const { data: ids } = await db.from('agent_identities').select('id, nombre').eq('activa', true)
  for (const ident of ids || []) {
    try {
      const { data: reels } = await db.from('agent_reels').select('estado').eq('identity_id', ident.id)
      const listos = (reels || []).filter(r => r.estado === 'etiquetado').length
      // Con reels todavía en camino se espera: el estudio saldría sin ellos y
      // habría que rehacerlo en media hora.
      const enCamino = (reels || []).some(r => !['etiquetado', 'error'].includes(r.estado))
      if (enCamino || listos < MIN_REELS_ESTUDIO) continue

      const { data: previo } = await db.from('agent_memory').select('etiquetas')
        .eq('identity_id', ident.id).eq('clave', 'estudio').limit(1)
      const estudiados = Number(previo?.[0]?.etiquetas?.reels) || 0
      if (previo?.length && listos - estudiados < MIN_NUEVOS_ESTUDIO) continue

      // La clave lleva el número de reels: el mismo corpus no se estudia dos veces.
      await encola('estudiar', { identityId: ident.id }, `estudio:${ident.id}:${listos}`)
    } catch (err) {
      log(`no pude mirar si toca estudiar a ${ident.nombre}:`, err.message)
    }
  }
}

async function estudiar(job) {
  const { identityId } = job.payload
  if (!CLAUDE_KEY) throw new Error('Sin clave de Claude (AGENTS_ANTHROPIC_KEY) no se hacen estudios')
  const { data: ident } = await db.from('agent_identities').select('*').eq('id', identityId).maybeSingle()
  if (!ident) return
  const { data: todos } = await db.from('agent_reels')
    .select('url, publicado_en, duracion_s, metricas, etiquetas, frases, transcripcion')
    .eq('identity_id', identityId).eq('estado', 'etiquetado')
  const vistas = (x) => Number(x.metricas?.vistas) || 0
  const reels = (todos || []).sort((a, b) => vistas(b) - vistas(a))
  if (reels.length < MIN_REELS_ESTUDIO) return

  // Si hay más de los que caben, los más vistos y los menos vistos: el estudio
  // sale de comparar los dos extremos, y el montón del medio es el que sobra.
  const mitad = MAX_REELS_ESTUDIO / 2
  const muestra = reels.length > MAX_REELS_ESTUDIO ? [...reels.slice(0, mitad), ...reels.slice(-mitad)] : reels

  const corpus = muestra.map((r, i) => {
    const e = r.etiquetas || {}
    const guion = (r.frases || []).length
      ? r.frases.map(f => `[${f.rol}] ${f.texto}`).join('\n')
      : String(r.transcripcion || '')
    return [
      `### Reel ${i + 1} · ${vistas(r) ? `${vistas(r)} vistas` : 'vistas desconocidas'}${r.metricas?.likes ? ` · ${r.metricas.likes} likes` : ''}${r.duracion_s ? ` · ${Math.round(r.duracion_s)} s` : ''}`,
      `Etiquetas (${['claude', 'claude-api'].includes(e.por) ? 'Claude' : 'modelo local'}): tema «${e.tema || '?'}» · gancho ${e.tipo_gancho || '?'} · estructura ${e.estructura || '?'}${e.tipo ? ` · ${e.tipo}` : ''}${e.formato ? ` · ${e.formato}` : ''}${e.cta ? ` · CTA «${e.cta}»` : ''}`,
      guion.slice(0, 1800),
    ].join('\n')
  }).join('\n\n')

  const user = [
    `Creador: ${ident.nombre}${ident.categoria ? ` (${ident.categoria})` : ''}`,
    ident.descripcion ? `Descripción: ${ident.descripcion}` : '',
    ident.contexto ? `Contexto: ${ident.contexto}` : '',
    `Corpus: ${muestra.length} reels${reels.length > muestra.length ? ` (de ${reels.length}: los ${mitad} más vistos y los ${mitad} menos vistos)` : ''}, de más a menos vistas.`,
    '',
    corpus,
  ].filter(Boolean).join('\n')

  const r = await claudeTurno({
    apiKey: CLAUDE_KEY, model: MODELO_ESTUDIO, system: SYSTEM_ESTUDIO,
    messages: [{ role: 'user', content: user }], maxTokens: 3000,
  })
  const texto = String(r.content || '').trim()
  if (!texto.startsWith('#')) throw new Error('El modelo no devolvió un estudio')

  const fila = {
    ambito: 'identidad', identity_id: identityId, clave: 'estudio', contenido: texto,
    etiquetas: { auto: true, reels: reels.length, modelo: MODELO_ESTUDIO }, updated_at: ahora(),
  }
  const { data: previo } = await db.from('agent_memory').select('id')
    .eq('identity_id', identityId).eq('clave', 'estudio').limit(1)
  const { error } = previo?.length
    ? await db.from('agent_memory').update(fila).eq('id', previo[0].id)
    : await db.from('agent_memory').insert(fila)
  if (error) throw error

  // A los perfiles que tienen a este creador de referencia.
  const { data: perfiles } = await db.from('agent_identity_clients').select('client_id').eq('identity_id', identityId)
  for (const { client_id } of perfiles || []) {
    await notificar(db, client_id, {
      tipo: 'estudio',
      titulo: `Estudio de contenido ${previo?.length ? 'actualizado' : 'listo'} · ${ident.nombre}`,
      cuerpo: `El agente ha analizado ${reels.length} reels de ${ident.nombre}: qué ganchos, estructuras y temas le funcionan. Está en Agentes → Memoria, y Claude lo usa al escribir tus guiones.`,
      destino: 'contenido',
    })
  }
  log(`✓ estudio de ${ident.nombre} (${reels.length} reels, ${texto.length} caracteres)`)
}

// ── El equipo de agentes de cada perfil ─────────────────────────────────────
// Director, investigador, analista y guionista (api/_lib/equipo.js). Aquí solo
// se mira la hora: a partir de las 6:00 de Madrid se encola el director de
// cada perfil activo, y él reparte el trabajo de los demás.
const { ejecutaAgente, miraAgenda, miraProgramador, miraVirales, cierraHuerfanas } = await import('../api/_lib/equipo.js')
// Las tres noticias del día (api/_lib/noticias.js): desde las 5:30 de Madrid,
// para los perfiles que tienen encendida la sección Noticias.
const { generaNoticias, miraNoticias } = await import('../api/_lib/noticias.js')
// El diario de AI para todo (api/_lib/redaccion.js): dos artículos al día, a
// las 8:00 y a las 17:00 de Madrid, con la misma sección Noticias encendida.
const { generaArticulo, miraRedaccion } = await import('../api/_lib/redaccion.js')
// El estudio de clientes (api/_lib/avatar.js): a petición, no por horario.
const { generaAvatar } = await import('../api/_lib/avatar.js')
// El radar de tecnología (api/_lib/radar.js): una pasada al día y a petición.
const { generaRadar, miraRadar } = await import('../api/_lib/radar.js')
// Métricas de Instagram (api/_lib/metricas-ig.js): a las 6:00 de Madrid se
// resincronizan todas las cuentas conectadas, tengan equipo de agentes o no.
const { miraMetricas, sincronizaMetricas } = await import('../api/_lib/metricas-ig.js')
// Test de ads (api/_lib/ads.js): al pasar los 5 días de un ad publicado, se
// cuenta su conversión por UTM y se deja el veredicto.
const { estudiaAd } = await import('../api/_lib/ads.js')

const CADA_CUANTO_AGENDA_MS = 60_000
let ultimaAgenda = 0

// ── Bucle ───────────────────────────────────────────────────────────────────

const PASOS = { descargar, transcribir, etiquetar, 'drive-ingesta': driveIngesta, estudiar, equipo: ejecutaAgente, noticias: generaNoticias, articulo: generaArticulo, avatar: generaAvatar, radar: generaRadar, metricas: sincronizaMetricas, 'ad-estudio': estudiaAd }

let parando = false
for (const s of ['SIGINT', 'SIGTERM']) {
  process.on(s, () => { log('parando al acabar el trabajo en curso…'); parando = true })
}

const duerme = (ms) => new Promise(r => setTimeout(r, ms))

async function bucle() {
  log(`arrancado. audio en ${DIR_AUDIO}, whisper "${MODELO_WHISPER}"`)
  // Solo hay un worker: lo que figure "corriendo" al arrancar se quedó a
  // medias porque el anterior murió (systemd lo mata si tarda en parar). Si no
  // se devuelve a la cola, ese trabajo no lo vuelve a coger nadie.
  const { data: huerfanos } = await db.from('agent_jobs')
    .update({ estado: 'pendiente', correr_tras: ahora() }).eq('estado', 'corriendo').select('id')
  if (huerfanos?.length) log(`${huerfanos.length} trabajo(s) a medias devueltos a la cola`)
  await cierraHuerfanas().catch(e => log('no pude cerrar las ejecuciones a medias:', e.message))
  while (!parando) {
    let job = null
    try {
      if (Date.now() - ultimaMirada > CADA_CUANTO_MIRAR_MS) await miraEntradas()
      if (Date.now() - ultimoEstudio > CADA_CUANTO_ESTUDIAR_MS) await miraEstudios()
      if (Date.now() - ultimaAgenda > CADA_CUANTO_AGENDA_MS) {
        ultimaAgenda = Date.now()
        await miraAgenda().catch(e => log('no pude mirar la agenda del equipo:', e.message))
        await miraProgramador().catch(e => log('no pude mirar el programador semanal:', e.message))
        await miraVirales().catch(e => log('no pude mirar el agente de virales:', e.message))
        await miraNoticias().catch(e => log('no pude mirar las noticias del día:', e.message))
        await miraRedaccion().catch(e => log('no pude mirar la redacción del diario:', e.message))
        await miraRadar().catch(e => log('no pude mirar el radar:', e.message))
        await miraMetricas().catch(e => log('no pude mirar las métricas del día:', e.message))
      }
      job = await coge()
      if (!job) { await duerme(ESPERA_VACIO_MS); continue }

      const paso = PASOS[job.tipo]
      if (!paso) throw new Error(`Tipo de trabajo desconocido: ${job.tipo}`)
      await enContexto({ clientId: job.payload?.clientId || null, origen: 'auto' }, () => paso(job))
      await hecho(job)
    } catch (err) {
      if (job) { try { await fallo(job, err) } catch (e) { log('error registrando el fallo:', e.message) } }
      else { log('error en el bucle:', err.message); await duerme(ESPERA_VACIO_MS) }
    }
  }
  log('parado.')
  process.exit(0)
}

bucle()
