// HELM — Editor de reels: del plan (plan.js) al MP4, con ffmpeg.
//
//   · grafoRender() / argumentosRender() — PURAS: el filtro y los argumentos.
//     Sin shell en ningún sitio: se lanza con spawn y un array (ejecuta() de
//     api/_lib/variantes.js).
//   · renderiza() — lanza ffmpeg con su tope de tiempo, escribe en un .part,
//     comprueba lo que sale con ffprobe y solo entonces lo mueve a su sitio.
//
// El montaje, de una sola entrada: el vídeo (y el sonido) se reparten con
// split en tantos tramos como tenga el plan; cada tramo se recorta (trim), se
// escala hasta cubrir 1080×1920 con su zoom y se recorta al centro (el mismo
// reencuadre() que Trial reels, que ya cuenta la rotación del móvil); concat
// los une en orden, con un fundido de 12 ms en cada costura de sonido para
// que no chasque. Encima, los subtítulos (filtro `ass` con la letra del repo)
// y el sonido a -16 LUFS con loudnorm.
//
// Los tramos van en orden y no se pisan, así que split no acumula fotogramas:
// mientras un tramo está sonando, los demás tiran lo que no es suyo.
import fsp from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ejecuta, sondea, argumentosCodificacion, reencuadre, FFMPEG } from '../variantes.js'
import { LIENZO, FPS } from '../../../src/agents/editor/estilo.js'

export const DIR_FUENTES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fuentes')
// Un montaje tiene 15 minutos de tope; el worker no hace otra cosa mientras.
export const TOPE_RENDER_MS = 15 * 60_000
// Linux no deja pasar un argumento de más de 128 KB: un grafo más largo (un
// vídeo de muchos minutos con cientos de cortes) va en un archivo.
export const MAX_GRAFO_EN_LINEA = 100_000
const FUNDIDO = 0.012

const { ancho: W, alto: H } = LIENZO
const s = (n) => String(Math.round(Number(n) * 1000) / 1000)

/**
 * Una ruta como valor de una opción del grafo. ffmpeg la lee dos veces: el
 * grafo (las comillas simples protegen «,», «;» y corchetes) y la opción del
 * filtro (ahí «:» y «\» van escapados). Una comilla simple no tiene arreglo
 * limpio en los dos niveles, y nuestras rutas nunca la llevan: se rechaza.
 */
export function valorFiltro(v) {
  const t = String(v)
  if (/['\n\r]/.test(t)) throw new Error(`Ruta no válida para ffmpeg: ${t.slice(0, 80)}`)
  return `'${t.replace(/\\/g, '\\\\').replace(/:/g, '\\:')}'`
}

/** Cómo se escala: lanczos, salvo si la fuente es enorme (4K): ahí bicubic, que va el doble de rápido. */
const escalado = (info) => (Math.max(Number(info?.ancho) || 0, Number(info?.alto) || 0) > 1.5 * H ? 'bicubic' : 'lanczos')

/** Lo bien que va de deprisa x264 según lo que dure: tiene que caber en el tope. */
export const presetPara = (seg) => (seg > 240 ? 'veryfast' : seg > 90 ? 'faster' : 'medium')

/**
 * El grafo de filtros del montaje. PURA.
 *   plan    → el de planDeEdicion()
 *   ass     → ruta del .ass, o null (sin subtítulos)
 *   fuentes → la carpeta de la letra (fontsdir de libass)
 */
export function grafoRender({ plan, ass = null, fuentes = DIR_FUENTES }) {
  const tramos = plan?.tramos || []
  if (!tramos.length) throw Object.assign(new Error('El plan no tiene ningún tramo'), { statusCode: 422 })
  const n = tramos.length
  const audio = Boolean(plan.audio)
  const info = plan.entrada || {}
  const flags = escalado(info)
  const f = []

  // Primero, la imagen a 30 fps constantes: los cortes del plan van en esa
  // rejilla (1/30 s), así cada trozo de imagen dura lo mismo que su sonido.
  const v = n === 1 ? ['[vf]'] : tramos.map((_, i) => `[s${i}]`)
  const a = n === 1 ? ['[0:a]'] : tramos.map((_, i) => `[t${i}]`)
  f.push(n > 1 ? `[0:v]fps=${FPS},split=${n}${v.join('')}` : `[0:v]fps=${FPS}[vf]`)
  if (audio && n > 1) f.push(`[0:a]asplit=${n}${a.join('')}`)

  tramos.forEach((t, i) => {
    const { ew, eh, x, y } = reencuadre(info, { zoom: t.zoom || 1, desplX: 0, desplY: 0 })
    f.push(`${v[i]}trim=start=${s(t.a)}:end=${s(t.b)},setpts=PTS-STARTPTS,scale=${ew}:${eh}:flags=${flags},crop=${W}:${H}:${x}:${y},setsar=1[v${i}]`)
    if (audio) {
      const dur = Math.max(0, t.b - t.a)
      const fundidos = [
        t.fundeEntrada ? `afade=t=in:st=0:d=${FUNDIDO}` : '',
        t.fundeSalida ? `afade=t=out:st=${s(Math.max(0, dur - FUNDIDO))}:d=${FUNDIDO}` : '',
      ].filter(Boolean)
      f.push(`${a[i]}atrim=start=${s(t.a)}:end=${s(t.b)},asetpts=PTS-STARTPTS${fundidos.length ? ',' + fundidos.join(',') : ''}[a${i}]`)
    }
  })

  const entradas = tramos.map((_, i) => (audio ? `[v${i}][a${i}]` : `[v${i}]`)).join('')
  f.push(`${entradas}concat=n=${n}:v=1:a=${audio ? 1 : 0}[vc]${audio ? '[ac]' : ''}`)

  const subtitulos = ass ? `,ass=filename=${valorFiltro(ass)}:fontsdir=${valorFiltro(fuentes)}` : ''
  f.push(`[vc]fps=${FPS},format=yuv420p${subtitulos}[vout]`)
  if (audio) {
    const { I = -16, TP = -1.5, LRA = 11 } = plan.audio.loudnorm || {}
    // loudnorm trabaja a 192 kHz por dentro: se vuelve a 48 kHz al salir. Y el
    // sonido acaba donde acaba la imagen (concat lo deja un pelo más largo).
    const fin = Number(plan.duracionFinal) > 0 ? `,atrim=end=${s(plan.duracionFinal)}` : ''
    f.push(`[ac]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,loudnorm=I=${I}:TP=${TP}:LRA=${LRA},aresample=48000,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo${fin}[aout]`)
  }
  return f.join(';')
}

/**
 * Los argumentos de ffmpeg. PURA. Con `rutaGrafo`, el grafo se lee de ese
 * archivo (-filter_complex_script) en vez de ir en la línea.
 */
export function argumentosRender({ entrada, salida, plan, ass = null, fuentes = DIR_FUENTES, rutaGrafo = null, progreso = true }) {
  const audio = Boolean(plan?.audio)
  return [
    '-hide_banner', '-nostdin', '-y', '-loglevel', 'error',
    ...(progreso ? ['-progress', 'pipe:1', '-nostats'] : []),
    '-i', entrada,
    ...(rutaGrafo ? ['-filter_complex_script', rutaGrafo] : ['-filter_complex', grafoRender({ plan, ass, fuentes })]),
    '-map', '[vout]', ...(audio ? ['-map', '[aout]'] : []),
    // Con muchos tramos, el sonido y la imagen salen a ritmos distintos del
    // grafo: sin esto ffmpeg 6 se queja de «Too many packets buffered».
    '-max_muxing_queue_size', '4096',
    ...argumentosCodificacion({ audio, preset: presetPara(plan?.duracionFinal || 0) }),
    salida,
  ]
}

/** Lee el -progress de ffmpeg: los segundos ya escritos (o null). */
export function segundosDeProgreso(texto) {
  const m = [...String(texto).matchAll(/out_time_(?:us|ms)=(\d+)/g)].at(-1)
  return m ? Number(m[1]) / 1e6 : null
}

/**
 * Monta el vídeo. Escribe en `${salida}.part` y lo mueve al acabar: nunca
 * queda a medias un MP4 con el nombre bueno.
 *   alProgreso(fraccion 0–1) → mientras ffmpeg escribe
 *   senal                    → AbortSignal para cancelarlo
 * Devuelve { bytes, duracion, info }.
 */
export async function renderiza({ entrada, salida, plan, ass = null, fuentes = DIR_FUENTES, tope = TOPE_RENDER_MS, alProgreso = null, senal = null }) {
  await fsp.mkdir(path.dirname(salida), { recursive: true })
  const parcial = `${salida}.part`
  const grafo = grafoRender({ plan, ass, fuentes })
  const rutaGrafo = grafo.length > MAX_GRAFO_EN_LINEA ? `${salida}.grafo.txt` : null
  if (rutaGrafo) await fsp.writeFile(rutaGrafo, grafo)
  const total = Number(plan.duracionFinal) || 0
  let resto = ''
  const alLeer = alProgreso && total > 0
    ? (trozo) => {
      resto = (resto + trozo).slice(-2000)
      const seg = segundosDeProgreso(resto)
      if (seg != null) alProgreso(Math.max(0, Math.min(1, seg / total)))
    }
    : null
  try {
    await ejecuta(FFMPEG(), argumentosRender({ entrada, salida: parcial, plan, ass, fuentes, rutaGrafo }), { tope, alLeer, senal })
    const fuera = await sondea(parcial)
    await fsp.rename(parcial, salida)
    const { size } = await fsp.stat(salida)
    return { bytes: size, duracion: Math.round(fuera.duracion * 100) / 100, info: fuera }
  } catch (e) {
    await fsp.rm(parcial, { force: true })
    throw e
  } finally {
    if (rutaGrafo) await fsp.rm(rutaGrafo, { force: true })
  }
}
