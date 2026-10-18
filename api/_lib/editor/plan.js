// HELM — Editor de reels: el plan de montaje. PURO.
//
// Junta lo que dice ffprobe del vídeo, las palabras de Whisper y el estilo, y
// decide TODO lo que hará ffmpeg (api/_lib/editor/render.js), sin lanzar nada:
//
//   · segmentos → los trozos del original que van (tomas.js)
//   · tramos    → los mismos trozos, partidos donde cambia el zoom, cada uno
//                 con su zoom y con fundido de sonido solo en los cortes de
//                 verdad (donde se ha quitado algo)
//   · zooms     → el «punch-in», en tiempo del vídeo editado: 1,00 y 1,08 (o
//                 lo que diga el estilo) alternos cada `zoomCada` segundos; si
//                 un corte cae cerca, el salto va en el corte
//   · bloques   → los subtítulos (subtitulos.js), en tiempo del vídeo editado
//   · audio     → loudnorm a `volumen` LUFS (-16 por defecto), o null sin audio
//   · salida    → 1080×1920, 30 fps, H.264 High + AAC 48 kHz, +faststart, sin
//                 metadatos
//
// El plan entero se guarda en la fila (helm_ediciones.plan): con él se puede
// volver a montar el mismo vídeo sin transcribir otra vez.
import { normalizaEstilo, LIENZO, FPS } from '../../../src/agents/editor/estilo.js'
import { tomasDe, sinCortes } from './tomas.js'
import { bloquesDe } from './subtitulos.js'

export const VERSION_PLAN = 1
// El salto de zoom busca un corte a menos de esto para ir con él.
const IMAN_CORTE = 1
// Ningún salto pegado al final ni a un corte (saldría un tramo diminuto).
const MIN_AL_FINAL = 1
const MIN_TRAMO_ZOOM = 0.25
// Dos instantes a menos de esto son el mismo (redondeos a milésimas).
const TOLERANCIA = 0.002

const r3 = (n) => Math.round(n * 1000) / 1000

/**
 * Dónde salta el zoom, en tiempo del vídeo editado. `cortes` son los instantes
 * (del editado) donde un trozo acaba y empieza otro: si hay uno cerca del
 * salto que toca, el salto va con él (el corte lo disimula).
 */
export function saltosDeZoom(total, cortes, cada) {
  const saltos = []
  let ultimo = 0
  let t = cada
  while (t < total - MIN_AL_FINAL) {
    const cerca = cortes
      .filter(c => c > ultimo + MIN_TRAMO_ZOOM && c < total - MIN_TRAMO_ZOOM)
      .sort((x, y) => Math.abs(x - t) - Math.abs(y - t))[0]
    const salto = cerca != null && Math.abs(cerca - t) <= Math.min(IMAN_CORTE, cada / 3) ? cerca : t
    saltos.push(r3(salto))
    ultimo = salto
    t = salto + cada
  }
  return saltos
}

/**
 * Los tramos que monta ffmpeg: los segmentos (tiempo del original) partidos
 * por los saltos de zoom. Cada uno: { a, b, zoom, fundeEntrada, fundeSalida }.
 * Y los zooms en tiempo del editado: [{ a, b, factor }].
 */
export function tramosDe(segmentos, estilo) {
  const total = segmentos.reduce((s, x) => s + (x.b - x.a), 0)
  const cortes = []
  let t = 0
  for (const s of segmentos.slice(0, -1)) { t += s.b - s.a; cortes.push(r3(t)) }
  const saltos = estilo.zoom ? saltosDeZoom(total, cortes, estilo.zoomCada) : []
  const factor = (n) => (n % 2 ? estilo.zoomFactor : 1)

  const tramos = []
  let o = 0
  let cambios = 0 // saltos ya pasados
  for (const s of segmentos) {
    const dur = s.b - s.a
    // Los saltos que caen DENTRO de este segmento lo parten; los que caen en
    // su principio (un corte) solo cambian el zoom con el que empieza.
    while (cambios < saltos.length && saltos[cambios] <= o + TOLERANCIA) cambios++
    let desde = s.a
    let zoom = factor(cambios)
    const dentro = saltos.filter(x => x > o + TOLERANCIA && x < o + dur - TOLERANCIA)
    for (const x of dentro) {
      const hasta = s.a + (x - o)
      tramos.push({ a: r3(desde), b: r3(hasta), zoom, fundeEntrada: desde === s.a, fundeSalida: false })
      desde = hasta
      cambios++
      zoom = factor(cambios)
    }
    tramos.push({ a: r3(desde), b: r3(s.b), zoom, fundeEntrada: desde === s.a, fundeSalida: true })
    o += dur
  }
  // La primera entrada y la última salida no llevan fundido: ahí no hay costura.
  if (tramos.length) { tramos[0].fundeEntrada = false; tramos[tramos.length - 1].fundeSalida = false }

  const zooms = []
  let inicio = 0
  ;[...saltos, total].forEach((x, i) => {
    zooms.push({ a: r3(inicio), b: r3(x), factor: factor(i) })
    inicio = x
  })
  return { tramos, zooms: estilo.zoom ? zooms.filter(z => z.b > z.a) : [] }
}

/**
 * El plan de una edición.
 *   info     → de sondea() (api/_lib/variantes.js): { ancho, alto, duracion, audio }
 *   palabras → las de Whisper ([{ w, a, b, p }]), o [] si no hay voz
 *   estilo   → el del perfil (se normaliza aquí)
 */
export function planDeEdicion({ info, palabras = [], estilo = {}, bytes = null }) {
  const e = normalizaEstilo(estilo)
  const duracion = Number(info?.duracion) || 0
  const audio = Boolean(info?.audio)
  const t = audio && palabras?.length ? tomasDe(palabras, { ...e, fps: FPS }, duracion) : sinCortes(duracion, [], FPS)
  const { tramos, zooms } = tramosDe(t.segmentos, e)
  const bloques = e.subtitulos ? bloquesDe(t.palabras, e, t.duracion) : []
  const quitado = t.frases.filter(f => f.estado !== 'va').map(f => ({ a: f.a, b: f.b, texto: f.texto.slice(0, 200), motivo: f.estado }))
  return {
    version: VERSION_PLAN,
    entrada: { ancho: info?.ancho || null, alto: info?.alto || null, duracion: r3(duracion), audio, bytes },
    segmentos: t.segmentos,
    tramos,
    zooms,
    bloques,
    quitado,
    audio: audio ? { loudnorm: { I: e.volumen, TP: -1.5, LRA: 11 } } : null,
    salida: { ancho: LIENZO.ancho, alto: LIENZO.alto, fps: FPS, video: 'h264-high', audio: audio ? 'aac-48k' : null },
    duracionFinal: r3(t.duracion),
    resumen: {
      ...t.resumen,
      duracionOriginal: r3(duracion),
      duracionFinal: r3(t.duracion),
      bloques: bloques.length,
      zooms: zooms.filter(z => z.factor !== 1).length,
      sinVoz: !t.palabras.length,
    },
  }
}

/** Lo que enseña el panel de una edición: el resumen y qué se quitó. */
export function resumenDePlan(plan) {
  if (!plan || typeof plan !== 'object') return null
  return {
    resumen: plan.resumen || null,
    cortes: Math.max(0, (plan.segmentos || []).length - 1),
    bloques: (plan.bloques || []).length,
    zooms: (plan.zooms || []).filter(z => z.factor !== 1).length,
    quitado: (plan.quitado || []).slice(0, 40),
    entrada: plan.entrada || null,
  }
}
