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
//   · broll     → las imágenes y clips que subió el usuario: cuándo entra cada
//                 uno (en tiempo del editado), donde se dice su palabra o
//                 repartidos por los huecos; a pantalla completa o arriba
//                 (`brollModo`, el recursosModo del estilo)
//   · logo      → dónde va y a qué tamaño, o null
//   · musica    → a qué volumen y en qué tramos baja porque se habla, o null
//   · salida    → 1080×1920, 30 fps, H.264 High + AAC 48 kHz, +faststart, sin
//                 metadatos
//
// El plan entero se guarda en la fila (helm_ediciones.plan): con él se puede
// volver a montar el mismo vídeo sin transcribir otra vez. Lleva los ids de
// los recursos, nunca sus rutas: las saca trabajo.js del id de la edición.
import { normalizaEstilo, LIENZO, FPS } from '../../../src/agents/editor/estilo.js'
import { tomasDe, sinCortes, normaliza } from './tomas.js'
import { bloquesDe } from './subtitulos.js'
import { giroCambiaLados } from './recursos.js'

export const VERSION_PLAN = 2
// El salto de zoom busca un corte a menos de esto para ir con él.
const IMAN_CORTE = 1
// Ningún salto pegado al final ni a un corte (saldría un tramo diminuto).
const MIN_AL_FINAL = 1
const MIN_TRAMO_ZOOM = 0.25
// Dos instantes a menos de esto son el mismo (redondeos a milésimas).
const TOLERANCIA = 0.002

const r3 = (n) => Math.round(n * 1000) / 1000
const par = (n) => Math.max(2, Math.round(n / 2) * 2)

// ── Recursos ────────────────────────────────────────────────────────────────
// Nada encima de la persona en el primer segundo y medio: es el gancho.
export const INICIO_LIBRE = 1.5
// Entre dos recursos, al menos esto de la persona (si no, parecen uno).
export const SEPARACION_RECURSOS = 0.4
// Un recurso más corto que esto no se llega a ver.
export const MIN_RECURSO = 1
// Si no caben todos con su duración, se acortan para que entre todos no tapen
// más de esta parte del vídeo (desde INICIO_LIBRE): la persona tiene que verse.
export const OCUPACION_MAX = 0.6
// La música: baja ~10 dB mientras se habla, con rampas de 0,2 s para que no
// salte; cada tramo de voz empieza a bajar un poco antes de la primera palabra.
export const BAJADA_MUSICA_DB = -10
export const RAMPA_MUSICA = 0.2
// La música, antes de musicaVolumen, se lleva a la sonoridad de la voz más
// esto (gananciaMusica): con musicaVolumen al máximo (0,5 = -6 dB), en las
// pausas suena tan fuerte como la voz; con el 0,12 de por defecto, 12 dB por
// debajo (y 10 más mientras se habla). Es lo que ya sonaba con una pista
// comercial típica (-10 LUFS): ahora suena igual con cualquiera.
export const MUSICA_SOBRE_VOZ_DB = 6
// Lo que se sube o se baja una pista como mucho: una casi muda no se infla
// hasta ser solo ruido.
const GANANCIA_MUSICA = Object.freeze({ min: -30, max: 24 })
const HABLA_ANTES = 0.1
const HABLA_DESPUES = 0.2
// El logo: un 14 % del ancho (y no más alto que esto), dentro de los márgenes
// seguros de Instagram: arriba el nombre de «Reels»; abajo el pie (nombre,
// texto y audio); a la derecha, de media altura para abajo, los botones.
export const LOGO = Object.freeze({ anchoRel: 0.14, altoMax: 240, arriba: 220, abajo: 480, lado: 64, botones: 150 })

/**
 * Todas las veces que se dice `frase` (una palabra o unas pocas seguidas): el
 * instante en que empieza cada una, en orden. Sin acentos ni mayúsculas ni
 * signos. Si no aparece tal cual, vale el principio de la palabra (cliente →
 * «clientes») para palabras de 4 letras o más.
 */
export function buscaPalabra(palabras, frase) {
  const buscadas = String(frase || '').split(/\s+/).map(normaliza).filter(Boolean)
  const dichas = (palabras || []).map(p => ({ w: normaliza(p.w), a: Number(p.a) })).filter(p => p.w && Number.isFinite(p.a))
  if (!buscadas.length || !dichas.length) return []
  const busca = (igual) => {
    const veces = []
    for (let i = 0; i + buscadas.length <= dichas.length; i++) {
      if (buscadas.every((b, k) => igual(dichas[i + k].w, b))) veces.push(dichas[i].a)
    }
    return veces
  }
  const exactas = busca((w, b) => w === b)
  return exactas.length ? exactas : busca((w, b) => w === b || (b.length >= 4 && w.startsWith(b)))
}

/**
 * Los huecos libres de [desde, total] quitando lo ya puesto (y su separación).
 * PURA. [[a, b], …] en orden.
 */
function huecosLibres(puestos, desde, total) {
  let huecos = [[desde, total]]
  for (const p of puestos) {
    const a = p.a - SEPARACION_RECURSOS
    const b = p.b + SEPARACION_RECURSOS
    huecos = huecos.flatMap(([x, y]) => (b <= x || a >= y ? [[x, y]] : [[x, a], [b, y]]))
      .filter(([x, y]) => y - x > TOLERANCIA)
  }
  return huecos
}

/**
 * Cuándo entra cada imagen o clip de apoyo, en tiempo del vídeo editado. PURA.
 *   recursos → los de la fila ([{ id, tipo: 'broll', clase: 'imagen'|'video',
 *              duracion, ancho, alto, giro, palabra }]); los demás tipos no cuentan
 *   palabras → las del editado (tomasDe(...).palabras)
 * Cada uno dura `recursoDuracion` (o lo que dure el clip, si es menos; o menos
 * si no caben todos), y entre todos no tapan más de OCUPACION_MAX del vídeo:
 * los que ya no caben se quedan fuera. Los que tienen palabra entran donde se
 * dice (la primera vez que haya sitio); el resto se reparte por los huecos, lo
 * más espaciado posible. Nunca en los primeros INICIO_LIBRE segundos ni encima
 * de otro.
 * Devuelve { broll: [{ recurso, clase, a, b, desde, ancho, alto, giro,
 * palabra, origen: 'palabra'|'hueco' }], fuera } (fuera: los que no cupieron).
 */
export function brollDe({ recursos = [], palabras = [], duracion = 0, estilo = {} }) {
  const e = normalizaEstilo(estilo)
  const total = Number(duracion) || 0
  const lista = (Array.isArray(recursos) ? recursos : [])
    .filter(r => r && r.tipo === 'broll' && (r.clase === 'imagen' || r.clase === 'video') && r.id)
  if (!lista.length) return { broll: [], fuera: 0 }
  const libre = total - INICIO_LIBRE
  if (libre < MIN_RECURSO) return { broll: [], fuera: lista.length }

  const maxOcupado = libre * OCUPACION_MAX + TOLERANCIA
  const reparto = maxOcupado / lista.length
  const dur = Math.max(MIN_RECURSO, Math.min(e.recursoDuracion, reparto))
  const durDe = (r) => (r.clase === 'video' && Number(r.duracion) > 0 ? Math.min(dur, Number(r.duracion)) : dur)
  const puestos = []
  let ocupado = 0
  const pon = (r, a, d, origen) => {
    ocupado += d
    puestos.push({
      recurso: r.id, clase: r.clase, a: r3(a), b: r3(a + d), desde: 0,
      ancho: Number(r.ancho) || null, alto: Number(r.alto) || null, giro: Number(r.giro) || 1,
      palabra: r.palabra || null, origen,
    })
    puestos.sort((x, y) => x.a - y.a)
  }
  const cabe = (a, b) => a >= INICIO_LIBRE - TOLERANCIA && b <= total + TOLERANCIA &&
    puestos.every(p => b + SEPARACION_RECURSOS <= p.a + TOLERANCIA || a >= p.b + SEPARACION_RECURSOS - TOLERANCIA)

  // 1. Los que tienen palabra, donde se dice.
  const sinPoner = []
  for (const r of lista) {
    if (!r.palabra) { sinPoner.push(r); continue }
    const d = durDe(r)
    if (ocupado + d > maxOcupado) { sinPoner.push(r); continue }
    const a = buscaPalabra(palabras, r.palabra)
      .map(t => Math.max(INICIO_LIBRE, t))
      .find(t => Math.min(total, t + d) - t >= Math.min(d, MIN_RECURSO) && cabe(t, Math.min(total, t + d)))
    if (a != null) pon(r, a, Math.min(d, total - a), 'palabra')
    else sinPoner.push(r)
  }

  // 2. El resto, repartido: cada uno apunta a su sitio en un reparto parejo
  // del vídeo y va al hueco libre que le quede más cerca.
  let fuera = 0
  sinPoner.forEach((r, k) => {
    const d = durDe(r)
    // Ya tapan bastante: la persona tiene que verse.
    if (ocupado + MIN_RECURSO > maxOcupado) { fuera++; return }
    const objetivo = INICIO_LIBRE + ((k + 0.5) * libre) / sinPoner.length
    const huecos = huecosLibres(puestos, INICIO_LIBRE, total)
    const enteros = huecos.filter(([x, y]) => y - x >= d - TOLERANCIA).map(h => [h, d])
    const candidatos = enteros.length ? enteros
      : huecos.filter(([x, y]) => y - x >= MIN_RECURSO).map(([x, y]) => [[x, y], Math.min(d, y - x)])
    let mejor = null
    for (const [[x, y], todo] of candidatos) {
      const dd = Math.min(todo, maxOcupado - ocupado)
      const a = Math.min(Math.max(objetivo - dd / 2, x), y - dd)
      const lejos = Math.abs(a + dd / 2 - objetivo)
      if (!mejor || lejos < mejor.lejos) mejor = { a, d: dd, lejos }
    }
    if (mejor) pon(r, mejor.a, mejor.d, 'hueco')
    else fuera++
  })
  return { broll: puestos, fuera }
}

/**
 * Los tramos en que se habla, en tiempo del editado: donde la música baja.
 * PURA. Cada palabra con un poco de margen; dos tramos que casi se tocan (no
 * le daría tiempo a la música a subir y bajar) van juntos.
 */
export function hablaDe(palabras, total) {
  const T = Number(total) || 0
  const tramos = (palabras || [])
    .map(p => [Math.max(0, Number(p.a) - HABLA_ANTES), Math.min(T, Number(p.b) + HABLA_DESPUES)])
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b > a)
    .sort((x, y) => x[0] - y[0])
  const juntos = []
  for (const [a, b] of tramos) {
    const ultimo = juntos.at(-1)
    if (ultimo && a - ultimo[1] < 2 * RAMPA_MUSICA + 0.1) ultimo[1] = Math.max(ultimo[1], b)
    else juntos.push([a, b])
  }
  return juntos.map(([a, b]) => ({ a: r3(a), b: r3(b) }))
}

/**
 * Dónde va el logo y a qué tamaño (en píxeles del lienzo), o null si no hay
 * logo o la posición es 'ninguna'. PURA. `recurso` lleva su ancho y alto.
 */
export function logoDe(recurso, posicion) {
  if (!recurso || !posicion || posicion === 'ninguna') return null
  const { ancho: W, alto: H } = LIENZO
  const an = Number(recurso.ancho) || 1
  const al = Number(recurso.alto) || 1
  let w = par(W * LOGO.anchoRel)
  let h = par((w * al) / an)
  if (h > LOGO.altoMax) { h = LOGO.altoMax; w = par((h * an) / al) }
  const [vertical, lado] = String(posicion).split('-')
  const x = lado === 'izq' ? LOGO.lado : vertical === 'abajo' ? W - LOGO.botones - w : W - LOGO.lado - w
  const y = vertical === 'abajo' ? H - LOGO.abajo - h : LOGO.arriba
  return { recurso: recurso.id, x, y, w, h }
}

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
 *   estilo   → el de la edición (se normaliza aquí)
 *   recursos → los que subió el usuario (helm_ediciones.recursos), o []
 */
export function planDeEdicion({ info, palabras = [], estilo = {}, bytes = null, recursos = [] }) {
  const e = normalizaEstilo(estilo)
  const duracion = Number(info?.duracion) || 0
  const audio = Boolean(info?.audio)
  const t = audio && palabras?.length ? tomasDe(palabras, { ...e, fps: FPS }, duracion) : sinCortes(duracion, [], FPS)
  const { tramos, zooms } = tramosDe(t.segmentos, e)
  const bloques = e.subtitulos ? bloquesDe(t.palabras, e, t.duracion) : []
  const quitado = t.frases.filter(f => f.estado !== 'va').map(f => ({ a: f.a, b: f.b, texto: f.texto.slice(0, 200), motivo: f.estado }))

  const lista = Array.isArray(recursos) ? recursos : []
  const { broll, fuera } = brollDe({ recursos: lista, palabras: t.palabras, duracion: t.duracion, estilo: e })
  const conLados = (r) => (r && giroCambiaLados(r.giro) ? { ...r, ancho: r.alto, alto: r.ancho } : r)
  const logo = logoDe(conLados(lista.find(r => r?.tipo === 'logo')), e.logoPosicion)
  const pista = lista.find(r => r?.tipo === 'musica')
  const musica = pista && e.musicaVolumen > 0 && t.duracion > 0
    ? {
      recurso: pista.id,
      volumen: e.musicaVolumen,
      // Sin voz, la música es el sonido del vídeo: va a `volumen` LUFS, sin bajar.
      sola: !audio,
      bajadaDb: BAJADA_MUSICA_DB,
      rampa: RAMPA_MUSICA,
      habla: audio ? hablaDe(t.palabras, t.duracion) : [],
      fundidoEntrada: r3(Math.min(0.3, t.duracion / 4)),
      fundidoSalida: r3(Math.min(1.5, t.duracion / 4)),
      loudnorm: audio ? null : { I: e.volumen, TP: -1.5, LRA: 11 },
      // Con voz: la ganancia fija (dB) hasta su sonoridad de referencia; la
      // pone trabajo.js cuando la ha medido (gananciaMusica). null = tal cual.
      ganancia: null,
    }
    : null
  // Lo que se ve encima: las imágenes giradas ya con su ancho y alto visibles.
  const brollVisto = broll.map(b => (giroCambiaLados(b.giro) ? { ...b, ancho: b.alto, alto: b.ancho } : b))

  return {
    version: VERSION_PLAN,
    entrada: { ancho: info?.ancho || null, alto: info?.alto || null, duracion: r3(duracion), audio, bytes },
    segmentos: t.segmentos,
    tramos,
    zooms,
    bloques,
    quitado,
    audio: audio ? { loudnorm: { I: e.volumen, TP: -1.5, LRA: 11 } } : null,
    broll: brollVisto,
    brollModo: e.recursosModo,
    logo,
    musica,
    salida: { ancho: LIENZO.ancho, alto: LIENZO.alto, fps: FPS, video: 'h264-high', audio: audio || musica ? 'aac-48k' : null },
    duracionFinal: r3(t.duracion),
    resumen: {
      ...t.resumen,
      duracionOriginal: r3(duracion),
      duracionFinal: r3(t.duracion),
      bloques: bloques.length,
      zooms: zooms.filter(z => z.factor !== 1).length,
      sinVoz: !t.palabras.length,
      recursos: broll.length,
      recursosEnPalabra: broll.filter(b => b.origen === 'palabra').length,
      recursosFuera: fuera,
      logo: Boolean(logo),
      musica: Boolean(musica),
    },
  }
}

/**
 * La ganancia fija (dB) que lleva la música a la sonoridad de la voz más
 * MUSICA_SOBRE_VOZ_DB, a partir de lo que mide (LUFS integrados del trozo que
 * va a sonar; mideMusica en render.js). PURA. null si no se sabe o la pista es
 * casi silencio: entonces va tal cual.
 */
export function gananciaMusica(lufs, vozLufs = -16) {
  const medida = Number(lufs)
  const voz = Number.isFinite(Number(vozLufs)) && vozLufs != null ? Number(vozLufs) : -16
  if (lufs == null || !Number.isFinite(medida) || medida < -60) return null
  const g = voz + MUSICA_SOBRE_VOZ_DB - medida
  return Math.round(Math.max(GANANCIA_MUSICA.min, Math.min(GANANCIA_MUSICA.max, g)) * 10) / 10
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
    recursos: (plan.broll || []).map(b => ({ recurso: b.recurso, a: b.a, b: b.b, palabra: b.palabra || null, origen: b.origen })),
  }
}
