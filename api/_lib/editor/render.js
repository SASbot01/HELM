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
//
// Encima del montaje, por este orden (lo último es lo que queda delante):
//   · las imágenes y clips de apoyo (plan.broll), cada uno su propia entrada
//     y su overlay solo en su tramo: a pantalla completa (modo «corte») o en
//     la mitad de arriba con la persona en la de abajo (modo «arriba»: de la
//     persona se enseña la franja de la cara, PERSONA_ARRIBA_Y). Las imágenes
//     crecen un ZOOM_IMAGEN mientras están (un scale que cambia en cada
//     fotograma, a tamaños pares: así no tiembla como zoompan); los clips se
//     recortan a su tramo y su sonido no entra.
//   · el logo (plan.logo), una imagen sola que overlay repite hasta el final.
//   · los subtítulos, siempre lo último: por encima de todo.
// Y la música (plan.musica) en bucle debajo de la voz ya normalizada: primero
// su ganancia fija (la que la lleva a su sonoridad de referencia, medida antes
// con mideMusica), luego musicaVolumen y ~10 dB menos en los tramos en que se
// habla (un volume por fotograma de sonido con rampas, expresionVolumen); sube
// y baja con fundido al principio y al final, y un limitador evita que la suma
// pase de -1 dBFS. Sin voz, la música es el sonido: va normalizada como iría
// la voz.
import fsp from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ejecuta, sondea, argumentosCodificacion, reencuadre, FFMPEG } from '../variantes.js'
import { COMO_MOV, formatoDe } from './formato.js'
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
const par = (n) => Math.max(2, Math.round(n / 2) * 2)

// Lo que crece una imagen de apoyo mientras está en pantalla.
export const ZOOM_IMAGEN = 0.08
// Modo «arriba»: de la persona se enseña la franja de 1080×960 que empieza
// aquí (el 20 % de la altura), que en un vídeo grabado con el móvil es la de
// la cara; va en la mitad de abajo.
export const PERSONA_ARRIBA_Y = 384
// El limitador del final, con música: -1 dBFS.
const LIMITE_MEZCLA = 0.891
const SONIDO_48K = 'aresample=48000,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo'

/** Los filtros que ponen derecha una foto según su orientación EXIF (2–8; 1 = nada). */
export const filtroGiro = (o) => ({ 2: 'hflip', 3: 'hflip,vflip', 4: 'vflip', 5: 'transpose=0', 6: 'transpose=1', 7: 'transpose=3', 8: 'transpose=2' }[Number(o)] || '')

/**
 * Las entradas de ffmpeg que no son el vídeo, en orden: las imágenes y clips
 * de apoyo, el logo y la música. PURA. Cada una con su `indice` (el del -i:
 * el vídeo es el 0) y el `recurso` (su id: la ruta la pone quien llama).
 */
export function entradasDe(plan) {
  const lista = []
  for (const b of plan?.broll || []) lista.push({ recurso: b.recurso, uso: b.clase === 'video' ? 'clip' : 'imagen', tramo: b })
  if (plan?.logo) lista.push({ recurso: plan.logo.recurso, uso: 'logo' })
  if (plan?.musica) lista.push({ recurso: plan.musica.recurso, uso: 'musica' })
  return lista.map((e, i) => ({ ...e, indice: i + 1 }))
}

/**
 * Lo que va delante de la ruta de cada recurso. PURA. Los clips (MP4/MOV por
 * su firma) y la música en M4A se abren con su demuxer (COMO_MOV, formato.js):
 * ffmpeg no adivina el formato de nada que haya subido el usuario como vídeo.
 */
function argumentosEntrada(e, ruta, plan) {
  // Del clip, solo lo que se usa (-ss antes de -i: salta sin decodificar).
  if (e.uso === 'clip') return ['-ss', s(e.tramo.desde || 0), '-t', s(e.tramo.b - e.tramo.a + 0.5), ...COMO_MOV, '-i', ruta]
  // La música, en bucle hasta lo que dura el editado.
  if (e.uso === 'musica') return ['-stream_loop', '-1', '-t', s((Number(plan.duracionFinal) || 0) + 0.5), ...formatoDe(ruta), '-i', ruta]
  // Una imagen o el logo: un solo fotograma (lo repite el filtro loop, o overlay).
  return ['-i', ruta]
}

/** `t - x` en una expresión de ffmpeg, sin dos signos seguidos. */
const tMenos = (x) => (x >= 0 ? `t-${s(x)}` : `t+${s(-x)}`)

/**
 * El volumen de la música en cada instante, como expresión de ffmpeg (para
 * volume=…:eval=frame). PURA. `volumen` fuera de la voz; en cada tramo de
 * `habla`, `bajadaDb` menos, con una rampa de `rampa` segundos antes y
 * después. Los tramos no se pisan (hablaDe los junta), así que la suma de las
 * rampas nunca pasa de 1.
 */
export function expresionVolumen({ volumen, bajadaDb = -10, rampa = 0.2, habla = [] }) {
  const v = s(volumen)
  if (!habla?.length) return v
  const k = s(1 - 10 ** (bajadaDb / 20))
  const R = s(rampa)
  const tramos = habla.map(({ a, b }) => `clip(min((${tMenos(a - rampa)})/${R},(${s(b + rampa)}-t)/${R}),0,1)`)
  return `${v}*(1-${k}*min(1,${tramos.join('+')}))`
}

/** La cadena de una imagen o un clip de apoyo, hasta su etiqueta [r<k>]. PURA. */
function cadenaBroll(e, k, caja) {
  const t = e.tramo
  const d = Math.max(1 / FPS, t.b - t.a)
  const { ancho: bw, alto: bh } = caja
  // Un fotograma de más (y, si el clip se queda corto, su último fotograma
  // repetido): el overlay enseña el recurso hasta el último fotograma de su
  // tramo; sin él, ese último sale el montaje (en modo «arriba», con la
  // persona partida). Lo que sobre después del tramo no se ve (enable).
  if (e.uso === 'clip') {
    return `[${e.indice}:v]trim=duration=${s(d + 1 / FPS)},setpts=PTS-STARTPTS,fps=${FPS},tpad=stop_mode=clone:stop_duration=${s(2 / FPS)},` +
      `scale=${bw}:${bh}:force_original_aspect_ratio=increase:flags=bicubic,crop=${bw}:${bh},setsar=1,format=yuv420p,` +
      `setpts=PTS+${s(t.a)}/TB[r${k}]`
  }
  // La imagen se escala UNA vez al tamaño de su zoom máximo, se repite tantos
  // fotogramas como dura y cada fotograma se reduce a lo que le toca.
  //   · settb antes de setpts: la imagen llega con la base de tiempo de image2
  //     (1/25) y setpts trunca a esa rejilla; sin él, uno de cada seis
  //     fotogramas repite su instante y el zoom va a tirones.
  //   · el crop, con x/y calculados con n: crop no se entera de que scale cambia
  //     de tamaño en cada fotograma (se queda con el in_w del primero) y su
  //     centrado por defecto deja la imagen anclada arriba a la izquierda.
  const n = Math.ceil(d * FPS - 1e-6) + 1
  const zw = par(bw * (1 + ZOOM_IMAGEN))
  const zh = par(bh * (1 + ZOOM_IMAGEN))
  const giro = filtroGiro(t.giro)
  const crece = (lado) => `2*trunc(${lado}*(1+${ZOOM_IMAGEN}*n/${n})/2)`
  return `[${e.indice}:v]${giro ? `${giro},` : ''}scale=${zw}:${zh}:force_original_aspect_ratio=increase:flags=lanczos,crop=${zw}:${zh},setsar=1,format=yuv420p,` +
    `loop=loop=${n - 1}:size=1:start=0,settb=1/${FPS},setpts=(N/${FPS}+${s(t.a)})/TB,` +
    `scale=w='${crece(bw)}':h='${crece(bh)}':eval=frame:flags=bicubic,` +
    `crop=w=${bw}:h=${bh}:x='(${crece(bw)}-${bw})/2':y='(${crece(bh)}-${bh})/2',setsar=1[r${k}]`
}

/** enable='between(t,a,b)+…' para los tramos dados. */
const enTramos = (tramos) => `enable='${tramos.map(t => `between(t,${s(t.a)},${s(t.b)})`).join('+')}'`

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
 * Los recursos (broll, logo, música) son las entradas 1, 2… en el orden de
 * entradasDe(plan).
 */
export function grafoRender({ plan, ass = null, fuentes = DIR_FUENTES }) {
  const tramos = plan?.tramos || []
  if (!tramos.length) throw Object.assign(new Error('El plan no tiene ningún tramo'), { statusCode: 422 })
  const n = tramos.length
  const audio = Boolean(plan.audio)
  const extra = entradasDe(plan)
  const broll = extra.filter(e => e.uso === 'imagen' || e.uso === 'clip')
  const logo = extra.find(e => e.uso === 'logo')
  const musica = extra.find(e => e.uso === 'musica')
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
  if (!broll.length && !logo) {
    f.push(`[vc]fps=${FPS},format=yuv420p${subtitulos}[vout]`)
  } else {
    // Capa a capa: [c0] es el montaje; cada overlay deja la siguiente.
    let c = 0
    f.push(`[vc]fps=${FPS},format=yuv420p[c0]`)
    const arriba = plan.brollModo === 'arriba'
    const caja = arriba ? { ancho: W, alto: H / 2 } : { ancho: W, alto: H }
    if (broll.length && arriba) {
      // Mientras hay un recurso arriba, la persona baja a la mitad de abajo.
      f.push(`[c${c}]split=2[pm][pp]`, `[pp]crop=${W}:${H / 2}:0:${PERSONA_ARRIBA_Y}[pb]`,
        `[pm][pb]overlay=x=0:y=${H / 2}:${enTramos(broll.map(e => e.tramo))}[c${c + 1}]`)
      c++
    }
    broll.forEach((e, k) => {
      f.push(cadenaBroll(e, k, caja))
      f.push(`[c${c}][r${k}]overlay=x=0:y=0:eof_action=pass:${enTramos([e.tramo])}[c${c + 1}]`)
      c++
    })
    if (logo) {
      const { x, y, w, h } = plan.logo
      f.push(`[${logo.indice}:v]scale=${w}:${h}:flags=lanczos,format=rgba[logo]`, `[c${c}][logo]overlay=x=${x}:y=${y}[c${c + 1}]`)
      c++
    }
    f.push(`[c${c}]format=yuv420p${subtitulos}[vout]`)
  }

  const T = Number(plan.duracionFinal) || 0
  const fin = T > 0 ? `,atrim=end=${s(T)}` : ''
  const m = musica ? plan.musica : null
  const fundidos = m ? `,afade=t=in:st=0:d=${s(m.fundidoEntrada || 0.3)},afade=t=out:st=${s(Math.max(0, T - (m.fundidoSalida || 1.5)))}:d=${s(m.fundidoSalida || 1.5)}` : ''
  // La música desde 0 sin huecos entre vuelta y vuelta del bucle (asetpts por
  // muestras), cortada a lo que dura el editado.
  const pista = m ? `[${musica.indice}:a]${SONIDO_48K},asetpts=N/SR/TB${fin}` : ''
  if (audio) {
    const { I = -16, TP = -1.5, LRA = 11 } = plan.audio.loudnorm || {}
    // loudnorm trabaja a 192 kHz por dentro: se vuelve a 48 kHz al salir. Y el
    // sonido acaba donde acaba la imagen (concat lo deja un pelo más largo).
    f.push(`[ac]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,loudnorm=I=${I}:TP=${TP}:LRA=${LRA},${SONIDO_48K}${fin}[${m ? 'voz' : 'aout'}]`)
    if (m) {
      const g = m.ganancia == null ? NaN : Number(m.ganancia)
      const fija = Number.isFinite(g) && g !== 0 ? `,volume=${s(g)}dB` : ''
      f.push(`${pista}${fija},volume='${expresionVolumen(m)}':eval=frame${fundidos}[mus]`)
      f.push(`[voz][mus]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,alimiter=limit=${LIMITE_MEZCLA}:level=0${fin}[aout]`)
    }
  } else if (m) {
    const { I = -16, TP = -1.5, LRA = 11 } = m.loudnorm || {}
    f.push(`${pista},loudnorm=I=${I}:TP=${TP}:LRA=${LRA},${SONIDO_48K}${fundidos}${fin}[aout]`)
  }
  return f.join(';')
}

/**
 * Los argumentos de ffmpeg. PURA. Con `rutaGrafo`, el grafo se lee de ese
 * archivo (-filter_complex_script) en vez de ir en la línea. El original se
 * abre siempre como MP4/MOV (COMO_MOV): es lo único que se admite.
 */
export function argumentosRender({ entrada, salida, plan, ass = null, fuentes = DIR_FUENTES, rutaGrafo = null, progreso = true, rutas = {} }) {
  const audio = Boolean(plan?.audio) || Boolean(plan?.musica)
  const recursos = entradasDe(plan).flatMap((e) => {
    const ruta = rutas?.[e.recurso]
    if (!ruta) throw Object.assign(new Error('Falta el archivo de un recurso (imagen, clip, logo o música)'), { statusCode: 422 })
    return argumentosEntrada(e, ruta, plan)
  })
  return [
    '-hide_banner', '-nostdin', '-y', '-loglevel', 'error',
    ...(progreso ? ['-progress', 'pipe:1', '-nostats'] : []),
    ...COMO_MOV, '-i', entrada,
    ...recursos,
    ...(rutaGrafo ? ['-filter_complex_script', rutaGrafo] : ['-filter_complex', grafoRender({ plan, ass, fuentes })]),
    '-map', '[vout]', ...(audio ? ['-map', '[aout]'] : []),
    // Con muchos tramos, el sonido y la imagen salen a ritmos distintos del
    // grafo: sin esto ffmpeg 6 se queja de «Too many packets buffered».
    '-max_muxing_queue_size', '4096',
    ...argumentosCodificacion({ audio, preset: presetPara(plan?.duracionFinal || 0) }),
    salida,
  ]
}

/**
 * Los argumentos para medir la sonoridad de la música tal y como va a sonar:
 * en bucle hasta `duracion` segundos, con loudnorm solo midiendo (escribe el
 * resumen en JSON al acabar). PURA.
 */
export function argumentosMedida(ruta, duracion) {
  return ['-hide_banner', '-nostdin', '-nostats', '-stream_loop', '-1', '-t', s(Math.max(0.5, Number(duracion) || 0)), ...formatoDe(ruta), '-i', ruta,
    '-vn', '-af', 'loudnorm=print_format=json', '-f', 'null', '-']
}

/** Del resumen de loudnorm=print_format=json: los LUFS integrados de la entrada, o null. PURA. */
export function sonoridadDe(texto) {
  const m = [...String(texto).matchAll(/"input_i"\s*:\s*"([^"]*)"/g)].at(-1)
  const v = m ? Number(m[1]) : NaN
  return Number.isFinite(v) ? v : null
}

/** Mide la música (mira argumentosMedida): sus LUFS integrados, o null. */
export async function mideMusica(ruta, duracion, { senal = null } = {}) {
  const { stderr } = await ejecuta(FFMPEG(), argumentosMedida(ruta, duracion), { tope: 5 * 60_000, senal })
  return sonoridadDe(stderr)
}

/** Lee el -progress de ffmpeg: los segundos ya escritos (o null). */
export function segundosDeProgreso(texto) {
  const m = [...String(texto).matchAll(/out_time_(?:us|ms)=(\d+)/g)].at(-1)
  return m ? Number(m[1]) / 1e6 : null
}

/**
 * Monta el vídeo. Escribe en `${salida}.part` y lo mueve al acabar: nunca
 * queda a medias un MP4 con el nombre bueno.
 *   rutas                    → { [id del recurso]: ruta } de lo que use el plan
 *   alProgreso(fraccion 0–1) → mientras ffmpeg escribe
 *   senal                    → AbortSignal para cancelarlo
 * Devuelve { bytes, duracion, info }.
 */
export async function renderiza({ entrada, salida, plan, ass = null, fuentes = DIR_FUENTES, tope = TOPE_RENDER_MS, alProgreso = null, senal = null, rutas = {} }) {
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
    await ejecuta(FFMPEG(), argumentosRender({ entrada, salida: parcial, plan, ass, fuentes, rutaGrafo, rutas }), { tope, alLeer, senal })
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
