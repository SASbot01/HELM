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
import { mkdir, stat, unlink } from 'node:fs/promises'
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
  const { data, error } = await db.from('agent_jobs')
    .select('*')
    .eq('estado', 'pendiente')
    .lte('correr_tras', ahora())
    .order('created_at', { ascending: true })
    .limit(1)
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

  if (agotado && job.payload?.reelId) {
    await db.from('agent_reels')
      .update({ estado: 'error', error: msg, updated_at: ahora() })
      .eq('id', job.payload.reelId)
  }
  log(`✗ ${job.tipo} (intento ${job.intentos}/${job.max_intentos}):`, msg)
}

async function encola(tipo, payload, clave) {
  await db.from('agent_jobs').upsert(
    { tipo, payload, clave, estado: 'pendiente', correr_tras: ahora() },
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

  let meta = {}
  try {
    const { stdout } = await ejecuta(YTDLP, [
      '--no-playlist', '--no-warnings', '--print-json', '--skip-download', reel.url,
    ], { timeout: 120_000, maxBuffer: 20 * 1024 * 1024 })
    meta = JSON.parse(stdout.trim().split('\n').pop() || '{}')
  } catch (e) {
    // Que no haya metadatos no es fatal: lo que hace falta es el audio.
    log('sin metadatos para', reel.url, '—', String(e.message).slice(0, 120))
  }

  await ejecuta(YTDLP, [
    '--no-playlist', '--no-warnings',
    '-x', '--audio-format', 'mp3', '--audio-quality', '5',
    '-o', salida, reel.url,
  ], { timeout: 600_000, maxBuffer: 20 * 1024 * 1024 })

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

  await encola('transcribir', { reelId: reel.id }, `transcribir:${reel.url_hash}`)
  log(`✓ descargado ${reel.id} (${(info.size / 1024 / 1024).toFixed(1)} MB)`)
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
  if (!texto) throw new Error('Whisper no ha sacado nada de ese audio (¿vídeo mudo?)')

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

  await encola('etiquetar', { reelId: reel.id }, `etiquetar:${reel.url_hash}`)
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
  "frases": [{"i": 0, "rol": "gancho"}]
}

Sobre "frases": te llega la transcripción numerada. Devuelves el papel de CADA
línea, con su mismo número en "i". Los papeles son:
  gancho        — abre y frena el scroll. Casi siempre las primeras líneas.
  planteamiento — desarrolla, explica, da contexto o ejemplos.
  remate        — la conclusión o el giro.
  venta         — pide algo: comentar una palabra, seguir, entrar en un enlace.

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
  const numeradas = frases.length
    ? frases.map((f, i) => `${i}. ${f.texto}`).join('\n')
    : reel.transcripcion.split(/(?<=[.!?])\s+/).map((t, i) => `${i}. ${t}`).join('\n')

  // Tres intentos: si el JSON no vale —por forma o porque una etiqueta no está
  // en su lista— se le dice EXACTAMENTE qué falló y se repite. Decirle el
  // motivo es lo que hace que el segundo intento acierte; repetir la misma
  // petición a secas suele devolver el mismo error.
  let out = null
  let ultimoFallo = ''
  for (let intento = 1; intento <= 3; intento++) {
    const aviso = ultimoFallo ? `\n\nEl intento anterior falló: ${ultimoFallo}. Devuelve SOLO el JSON.` : ''
    const txt = await llmChat({
      system: SISTEMA + contexto,
      messages: [{ role: 'user', content: `Transcripción numerada:\n\n${numeradas}${aviso}` }],
      temperature: 0.2,
      maxTokens: 1200,
    })
    try {
      const j = sacaJson(txt)
      if (!j || typeof j !== 'object') throw new Error('no es un objeto')
      if (!Array.isArray(j.frases)) throw new Error('falta la lista "frases"')
      const g = normaliza(j.tipo_gancho)
      if (!GANCHOS_VALIDOS.includes(g)) {
        throw new Error(`tipo_gancho "${j.tipo_gancho}" no está en la lista (${GANCHOS_VALIDOS.join(', ')})`)
      }
      const e = normaliza(j.estructura)
      if (!ESTRUCTURAS_VALIDAS.includes(e)) {
        throw new Error(`estructura "${j.estructura}" no está en la lista (${ESTRUCTURAS_VALIDAS.join(', ')})`)
      }
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

  log(`✓ etiquetado ${reel.id} — ${out.tema} / ${out.tipo_gancho}`)
}

// ── Bucle ───────────────────────────────────────────────────────────────────

const PASOS = { descargar, transcribir, etiquetar }

let parando = false
for (const s of ['SIGINT', 'SIGTERM']) {
  process.on(s, () => { log('parando al acabar el trabajo en curso…'); parando = true })
}

const duerme = (ms) => new Promise(r => setTimeout(r, ms))

async function bucle() {
  log(`arrancado. audio en ${DIR_AUDIO}, whisper "${MODELO_WHISPER}"`)
  while (!parando) {
    let job = null
    try {
      job = await coge()
      if (!job) { await duerme(ESPERA_VACIO_MS); continue }

      const paso = PASOS[job.tipo]
      if (!paso) throw new Error(`Tipo de trabajo desconocido: ${job.tipo}`)
      await paso(job)
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
