// HELM — Trial reels: el montaje de una variante con ffmpeg.
//
//   · argumentosFfmpeg() — PURA: de los ajustes y lo que dice ffprobe saca la
//     lista de argumentos de ffmpeg (el filter_complex como una sola cadena).
//     Sin shell en ningún sitio: se lanza con spawn y un array.
//   · procesaVariante() — sondea la fuente, lanza ffmpeg con su tope de tiempo
//     y deja el MP4 en su sitio.
//   · encola() — una cola en memoria, de uno en uno para todo el servidor: un
//     ffmpeg a 1080×1920 se come la CPU y el panel tiene que seguir
//     respondiendo. Vive en globalThis por si el módulo se carga dos veces.
//
// Lo que sale siempre: H.264 high, yuv420p, 30 fps, AAC 48 kHz, +faststart y
// sin metadatos de la fuente. La fuente puede tener cualquier tamaño: se escala
// hasta cubrir 1080×1920 y se recorta (con el zoom y el desplazamiento de la
// variante).
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { fetchPublico } from './web.js'
import { normalizaAjustes, tramos, reencuadre, LIENZO, FPS } from '../../src/agents/trialreels/reglas.js'

export { normalizaAjustes, tramos, reencuadre }

const FFMPEG = () => process.env.HELM_FFMPEG || 'ffmpeg'
const FFPROBE = () => process.env.HELM_FFPROBE || 'ffprobe'
export const CARPETA = () => path.join(process.env.HELM_DATA_DIR || '/home/s4sf/helm-data', 'trial-reels')

// Del CDN de Meta y de nada más (el mismo criterio que api/portadas.js).
export const CDN_META = /(^|\.)(cdninstagram\.com|fbcdn\.net)$/i
export const MAX_VIDEO = 200 * 1024 * 1024
// Un reel dura 3 minutos como mucho; con margen, y para que el montaje quepa
// en su tope de tiempo.
export const MAX_DURACION_FUENTE = 300
export const TOPE_FFMPEG_MS = 8 * 60_000
export const DIAS_GUARDADO = 7

const { ancho: W, alto: H } = LIENZO

const err = (message, statusCode = 500) => Object.assign(new Error(message), { statusCode })
const s = (n) => String(Math.round(Number(n) * 1000) / 1000)

// ── Rutas ──────────────────────────────────────────────────────────────────
// Siempre desde el id (uuid) o desde ids validados: la columna `archivo` de la
// tabla es solo informativa y nunca se usa para abrir nada.
const seguro = (t) => String(t || '').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 64)
export const rutaSalida = (id) => path.join(CARPETA(), `${seguro(id)}.mp4`)
export const rutaGancho = (id) => path.join(CARPETA(), `${seguro(id)}.gancho.png`)
export const rutaFuente = (clientId, mediaId) => path.join(CARPETA(), 'fuentes', `${seguro(clientId)}-${seguro(mediaId)}.mp4`)

// ── El color: cuatro preajustes de eq, retoques pequeños ───────────────────
// gamma_r y gamma_b mueven los canales rojo y azul sin tocar la luz: así se
// calienta o se enfría la imagen sin quemar la cara.
export const EQ = {
  neutro: '',
  calido: 'eq=saturation=1.06:gamma_r=1.05:gamma_b=0.95',
  frio: 'eq=saturation=1.02:gamma_r=0.96:gamma_b=1.05',
  contraste: 'eq=contrast=1.08:saturation=1.08:brightness=0.01',
}

/**
 * Lo que interesa de ffprobe (-print_format json -show_streams -show_format):
 * tamaño visible (con la rotación del móvil y el SAR), duración y si hay audio.
 */
export function infoDeSonda(j) {
  const streams = Array.isArray(j?.streams) ? j.streams : []
  const v = streams.find(x => x.codec_type === 'video' && !x.disposition?.attached_pic)
  if (!v) throw err('El archivo no tiene vídeo', 422)
  let ancho = Number(v.width) || 0
  let alto = Number(v.height) || 0
  const rot = Number((v.side_data_list || []).find(d => d.rotation != null)?.rotation ?? v.tags?.rotate ?? 0) || 0
  if (Math.abs(rot) % 180 === 90) [ancho, alto] = [alto, ancho]
  const [sn, sd] = String(v.sample_aspect_ratio || '1:1').split(':').map(Number)
  const sar = sn > 0 && sd > 0 ? sn / sd : 1
  const duracion = Number(j?.format?.duration) || Number(v.duration) || 0
  return {
    ancho: Math.round(ancho * (Math.abs(rot) % 180 === 90 ? 1 : sar)),
    alto: Math.round(alto * (Math.abs(rot) % 180 === 90 ? sar : 1)),
    duracion,
    audio: streams.some(x => x.codec_type === 'audio'),
  }
}

/**
 * Los argumentos de ffmpeg para una variante. PURA.
 *   entrada, salida → rutas · gancho → PNG 1080×1920 transparente o null
 *   ajustes → los de normalizaAjustes · info → los de infoDeSonda
 *
 * Con «avance», la fuente entra dos veces (-ss rápido en cada una): el trozo
 * del avance y el vídeo desde el recorte. Dos entradas y no split+trim: con
 * split, ffmpeg guardaría en memoria cada fotograma hasta llegar al avance.
 */
export function argumentosFfmpeg({ entrada, salida, gancho = null, ajustes, info }) {
  const a = normalizaAjustes(ajustes)
  const t = tramos(a, info.duracion)
  const { ew, eh, x, y } = reencuadre(info, a)
  const audio = Boolean(info.audio)
  const args = ['-hide_banner', '-nostdin', '-y', '-loglevel', 'error']

  let n = 0
  let iAvance = -1
  if (t.avance) {
    args.push('-ss', s(t.avance.desde), '-t', s(t.avance.dur), '-i', entrada)
    iAvance = n++
  }
  if (t.principal.desde > 0) args.push('-ss', s(t.principal.desde))
  args.push('-i', entrada)
  const iPrincipal = n++
  let iGancho = -1
  if (gancho) {
    args.push('-loop', '1', '-framerate', String(FPS), '-t', s(t.ganchoDur), '-i', gancho)
    iGancho = n++
  }

  // Cada trozo se normaliza antes de unirlos: así el concat recibe siempre lo
  // mismo, venga la fuente como venga.
  const imagen = [
    `scale=${ew}:${eh}:flags=lanczos`,
    `crop=${W}:${H}:${x}:${y}`,
    a.espejo ? 'hflip' : '',
    EQ[a.color] || '',
    'setsar=1',
    'format=yuv420p',
  ].filter(Boolean).join(',')
  const sonido = 'aresample=48000,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo'

  const f = []
  if (t.avance) {
    f.push(`[${iAvance}:v]${imagen}[v0]`, `[${iPrincipal}:v]${imagen}[v1]`)
    if (audio) {
      // Un fundido de unos milisegundos en la costura, para que no chasque.
      const fin = Math.max(0, t.avance.dur - 0.06)
      f.push(`[${iAvance}:a]${sonido},afade=t=out:st=${s(fin)}:d=0.06[a0]`, `[${iPrincipal}:a]${sonido},afade=t=in:st=0:d=0.04[a1]`)
      f.push('[v0][a0][v1][a1]concat=n=2:v=1:a=1[vc][ac]')
    } else {
      f.push('[v0][v1]concat=n=2:v=1:a=0[vc]')
    }
  } else {
    f.push(`[${iPrincipal}:v]${imagen}[vc]`)
    if (audio) f.push(`[${iPrincipal}:a]${sonido}[ac]`)
  }

  // Velocidad: setpts para la imagen y atempo para el sonido (sin cambiar el
  // tono), y después los 30 fps constantes.
  const vel = a.velocidad
  f.push(`[vc]${vel !== 1 ? `setpts=PTS/${vel},` : ''}fps=${FPS}[vs]`)
  if (audio) f.push(`[ac]${vel !== 1 ? `atempo=${vel}` : 'anull'}[aout]`)

  if (gancho) {
    const fundido = Math.max(0, t.ganchoDur - 0.4)
    f.push(`[${iGancho}:v]scale=${W}:${H},format=rgba,fade=t=out:st=${s(fundido)}:d=0.4:alpha=1[g]`)
    f.push('[vs][g]overlay=0:0:eof_action=pass:format=auto,format=yuv420p[vout]')
  } else {
    f.push('[vs]format=yuv420p[vout]')
  }

  args.push('-filter_complex', f.join(';'), '-map', '[vout]')
  if (audio) args.push('-map', '[aout]')
  args.push(
    '-c:v', 'libx264', '-profile:v', 'high', '-level:v', '4.1',
    // Los vídeos largos, más deprisa: tienen que caber en el tope de tiempo.
    '-preset', (t.salida || 0) > 90 ? 'faster' : 'medium', '-crf', '20',
    '-pix_fmt', 'yuv420p', '-r', String(FPS), '-g', String(FPS * 2),
  )
  if (audio) args.push('-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2')
  else args.push('-an')
  // Sin metadatos: ni los de la fuente (título, fecha, móvil, GPS) ni la marca
  // del codificador (bitexact y la etiqueta «encoder» vacía, que la borra; el
  // ffmpeg 6.1 del servidor deja «Lavc libx264», sin versión, y no hay manera).
  args.push(
    '-map_metadata', '-1', '-map_chapters', '-1', '-fflags', '+bitexact', '-metadata:s:v:0', 'encoder=',
    '-movflags', '+faststart', '-f', 'mp4', salida,
  )
  return args
}

// ── Lanzar binarios ─────────────────────────────────────────────────────────
const COLA = globalThis.__helmTrialReels || (globalThis.__helmTrialReels = { cola: [], activo: null, hijo: null })

/** Lanza un binario sin shell, con tope de tiempo. Devuelve { stdout, stderr }. */
export function ejecuta(bin, args, { tope = TOPE_FFMPEG_MS, registra = false } = {}) {
  return new Promise((ok, mal) => {
    const hijo = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    if (registra) COLA.hijo = hijo
    // Por debajo del resto del servidor: el panel no se puede quedar sin CPU.
    try { os.setPriority(hijo.pid, 10) } catch { /* sin permiso: da igual */ }
    let stdout = ''
    let stderr = ''
    hijo.stdout.on('data', d => { if (stdout.length < 2_000_000) stdout += d })
    hijo.stderr.on('data', d => { stderr = (stderr + d).slice(-4000) })
    const reloj = setTimeout(() => { hijo.kill('SIGKILL') }, tope)
    hijo.on('error', e => { clearTimeout(reloj); mal(err(`No se pudo lanzar ${path.basename(bin)}: ${e.message}`)) })
    hijo.on('close', (code, senal) => {
      clearTimeout(reloj)
      if (registra && COLA.hijo === hijo) COLA.hijo = null
      if (code === 0) return ok({ stdout, stderr })
      const motivo = senal === 'SIGKILL' ? 'se cortó (tardaba demasiado o se canceló)' : (stderr.trim().split('\n').slice(-3).join(' ') || `código ${code}`)
      mal(err(`ffmpeg: ${motivo}`.slice(0, 400)))
    })
  })
}

export async function sondea(ruta) {
  const { stdout } = await ejecuta(FFPROBE(), ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', ruta], { tope: 60_000 })
  let j
  try { j = JSON.parse(stdout) } catch { throw err('No se pudo leer el vídeo', 422) }
  return infoDeSonda(j)
}

// ── La fuente: del CDN de Meta a un archivo temporal ───────────────────────
export async function descargaFuente(url, destino, { max = MAX_VIDEO } = {}) {
  let host
  try { host = new URL(url).hostname } catch { host = '' }
  if (!CDN_META.test(host)) throw err('Instagram ha devuelto una dirección inesperada', 502)
  const r = await fetchPublico(url, { headers: { Accept: 'video/mp4,video/*' }, signal: AbortSignal.timeout(3 * 60_000) })
  if (!r || !r.ok || !r.body) throw err('Instagram no ha dejado descargar el vídeo', 502)
  const largo = Number(r.headers.get('content-length') || 0)
  if (largo > max) throw err('El vídeo es demasiado grande', 413)
  await fsp.mkdir(path.dirname(destino), { recursive: true })
  const parcial = `${destino}.part`
  let total = 0
  const tope = new Transform({
    transform(trozo, _c, cb) {
      total += trozo.length
      if (total > max) return cb(err('El vídeo es demasiado grande', 413))
      cb(null, trozo)
    },
  })
  try {
    await pipeline(Readable.fromWeb(r.body), tope, fs.createWriteStream(parcial))
    await fsp.rename(parcial, destino)
  } catch (e) {
    await fsp.rm(parcial, { force: true })
    throw e.statusCode ? e : err('No se pudo descargar el vídeo de Instagram', 502)
  }
  return { bytes: total }
}

/** Borra lo que lleve más de 7 días en la carpeta (y en la de fuentes). */
export async function limpiaViejos(dias = DIAS_GUARDADO) {
  const limite = Date.now() - dias * 86_400_000
  for (const dir of [CARPETA(), path.join(CARPETA(), 'fuentes')]) {
    let nombres = []
    try { nombres = await fsp.readdir(dir) } catch { continue }
    for (const n of nombres) {
      const ruta = path.join(dir, n)
      try {
        const st = await fsp.stat(ruta)
        if (st.isFile() && st.mtimeMs < limite) await fsp.rm(ruta, { force: true })
      } catch { /* ya no está */ }
    }
  }
}

/**
 * Monta una variante: sondea la fuente, lanza ffmpeg y comprueba lo que sale.
 * Escribe primero en un .part y lo mueve al final: nunca queda a medias un MP4
 * con el nombre bueno. Devuelve { bytes, duracion, info }.
 */
export async function procesaVariante({ entrada, salida, gancho = null, ajustes, tope = TOPE_FFMPEG_MS }) {
  const info = await sondea(entrada)
  if (!info.duracion) throw err('No se sabe cuánto dura el vídeo', 422)
  if (info.duracion > MAX_DURACION_FUENTE) throw err(`El vídeo dura más de ${MAX_DURACION_FUENTE / 60} minutos`, 422)
  await fsp.mkdir(path.dirname(salida), { recursive: true })
  const parcial = salida.replace(/\.mp4$/i, '') + '.part.mp4'
  try {
    await ejecuta(FFMPEG(), argumentosFfmpeg({ entrada, salida: parcial, gancho, ajustes, info }), { tope, registra: true })
    const fuera = await sondea(parcial)
    await fsp.rename(parcial, salida)
    const { size } = await fsp.stat(salida)
    return { bytes: size, duracion: Math.round(fuera.duracion * 100) / 100, info }
  } catch (e) {
    await fsp.rm(parcial, { force: true })
    throw e
  }
}

// ── La cola: uno a la vez para todo el servidor ────────────────────────────
// Cada trabajo es { id, fuente, ejecuta: async () => {} }. Lo que haga
// `ejecuta` (base de datos, descargas) lo decide quien encola.

/** Mete un trabajo en la cola (si no está ya) y arranca si estaba parada. */
export function encola(trabajo) {
  if (!trabajo?.id || enCola(trabajo.id)) return false
  COLA.cola.push(trabajo)
  setImmediate(sigue)
  return true
}

export const enCola = (id) => COLA.activo?.id === id || COLA.cola.some(t => t.id === id)
export const largoCola = () => COLA.cola.length + (COLA.activo ? 1 : 0)
/** ¿Algún otro trabajo (pendiente o el que corre), aparte de `salvo`, usa esta fuente? */
export const colaUsa = (fuente, salvo = null) =>
  [COLA.activo, ...COLA.cola].some(t => t && t.id !== salvo && t.fuente === fuente)

/** Lo quita de la cola; si es el que está corriendo, mata su ffmpeg. */
export function quitaDeCola(id) {
  COLA.cola = COLA.cola.filter(t => t.id !== id)
  if (COLA.activo?.id === id && COLA.hijo) COLA.hijo.kill('SIGKILL')
}

async function sigue() {
  if (COLA.activo) return
  const t = COLA.cola.shift()
  if (!t) return
  COLA.activo = t
  try {
    await t.ejecuta()
  } catch (e) {
    console.error('[trial-reels] trabajo', t.id, e?.message || e)
  } finally {
    COLA.activo = null
    COLA.hijo = null
    setImmediate(sigue)
  }
}
