// HELM — Trial reels: las reglas de las variantes, en datos. Módulo puro (sin
// React, sin navegador y sin Node): lo usan la pantalla (TrialReels.jsx), el
// compositor del gancho (gancho.js) y el servidor (api/_lib/variantes.js y
// api/trial-reels.js), para que los tres sitios recorten igual.
//
// Una variante no es «el mismo vídeo con ruido»: cambia lo que decide si un
// reel funciona —cómo arranca, qué dice el gancho y cómo está encuadrado— y,
// de propina, el color y un pelo de velocidad. Cada valor tiene su tope: son
// retoques de edición, no un vídeo distinto.

export const LIENZO = { ancho: 1080, alto: 1920 }
export const FPS = 30
export const MAX_VARIANTES = 3

// Donde va el gancho: el tercio de arriba, por debajo de la cabecera de Reels
// (y 0–220), lejos de la columna de botones de la derecha (x > 940, de media
// altura para abajo) y del pie con el nombre y el texto (los últimos ~420 px).
export const ZONA_GANCHO = { x0: 100, x1: 980, y0: 290, y1: 760 }

export const RANGOS = {
  avanceDur: { min: 1.5, max: 3, paso: 0.1 },
  avanceEn: { min: 0, max: 600, paso: 0.1 },
  recorte: { min: 0, max: 2, paso: 0.1 },
  ganchoDur: { min: 1.5, max: 4, paso: 0.1 },
  zoom: { min: 1.03, max: 1.1, paso: 0.01 },
  desplX: { min: -1, max: 1, paso: 0.05 },
  desplY: { min: -1, max: 1, paso: 0.05 },
  velocidad: { min: 1, max: 1.06, paso: 0.01 },
}

export const ARRANQUES = [
  { id: 'normal', nombre: 'Normal', desc: 'Empieza por el principio (o un poco después, si recortas).' },
  { id: 'avance', nombre: 'Avance', desc: 'Abre con 1,5–3 s de un momento fuerte del vídeo y luego va el vídeo entero.' },
]
export const COLORES = [
  { id: 'neutro', nombre: 'Neutro' },
  { id: 'calido', nombre: 'Cálido' },
  { id: 'frio', nombre: 'Frío' },
  { id: 'contraste', nombre: 'Contraste' },
]
export const ESTILOS_GANCHO = [
  { id: 'caja', nombre: 'Cajas de color' },
  { id: 'sombra', nombre: 'Letra con sombra' },
]
const IDS_ARRANQUE = new Set(ARRANQUES.map(a => a.id))
const IDS_COLOR = new Set(COLORES.map(c => c.id))
const IDS_ESTILO = new Set(ESTILOS_GANCHO.map(e => e.id))

export const PALABRAS_GANCHO = { min: 2, max: 7 }
export const MAX_CARACTERES_GANCHO = 48

// Lo mismo que Portadas: solo reels y vídeos.
export const esReel = (r) => String(r?.producto || '').toUpperCase() === 'REELS' || String(r?.tipo || '').toUpperCase() === 'VIDEO'

const limpia = (s, max) => String(s ?? '').replace(/\p{Cc}/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
const redondea = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d
const acota = (n, { min, max }) => Math.min(max, Math.max(min, n))
const numero = (v, rango, defecto, d = 2) => {
  const n = typeof v === 'number' ? v : (typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN)
  return redondea(acota(Number.isFinite(n) ? n : defecto, rango), d)
}

/**
 * Un aleatorio con semilla (FNV-1a del texto → mulberry32): la misma semilla da
 * siempre los mismos ajustes por defecto, así la variante 2 de un reel no
 * cambia cada vez que se abre el taller.
 */
export function aleatorioDe(semilla) {
  let h = 2166136261
  for (const c of String(semilla ?? '')) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619) }
  let a = h >>> 0
  return () => {
    a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Los ajustes de una variante, saneados: cada valor dentro de su tope y lo que
 * falte, sacado del aleatorio con semilla. Los sorteos van siempre en el mismo
 * orden (se sortea todo y luego manda lo que venga) para que la semilla dé lo
 * mismo pase lo que pase.
 */
export function normalizaAjustes(entrada = {}, semilla = '') {
  const e = entrada && typeof entrada === 'object' ? entrada : {}
  const r = aleatorioDe(semilla)
  const sorteo = {
    zoom: 1.03 + r() * 0.05,
    desplX: (r() * 2 - 1) * 0.6,
    desplY: (r() * 2 - 1) * 0.6,
    velocidad: 1 + r() * 0.04,
    recorte: r() * 0.8,
    avanceDur: 2 + r(),
    color: COLORES[Math.floor(r() * COLORES.length)].id,
  }
  const avanceEn = e.avanceEn == null || e.avanceEn === '' ? null : numero(e.avanceEn, RANGOS.avanceEn, 0, 1)
  return {
    arranque: IDS_ARRANQUE.has(e.arranque) ? e.arranque : 'normal',
    // null = automático: el 45 % del vídeo (ver tramos()).
    avanceEn,
    avanceDur: numero(e.avanceDur, RANGOS.avanceDur, sorteo.avanceDur, 1),
    recorte: numero(e.recorte, RANGOS.recorte, sorteo.recorte, 1),
    ganchoTexto: limpia(e.ganchoTexto, 80),
    ganchoResaltada: limpia(e.ganchoResaltada, 40),
    ganchoEstilo: IDS_ESTILO.has(e.ganchoEstilo) ? e.ganchoEstilo : 'caja',
    ganchoDur: numero(e.ganchoDur, RANGOS.ganchoDur, 2.5, 1),
    conGancho: e.conGancho === true,
    zoom: numero(e.zoom, RANGOS.zoom, sorteo.zoom),
    desplX: numero(e.desplX, RANGOS.desplX, sorteo.desplX),
    desplY: numero(e.desplY, RANGOS.desplY, sorteo.desplY),
    color: IDS_COLOR.has(e.color) ? e.color : sorteo.color,
    velocidad: numero(e.velocidad, RANGOS.velocidad, sorteo.velocidad),
    // El espejo da la vuelta también a los textos quemados: nunca por defecto.
    espejo: e.espejo === true,
  }
}

// Lo que separa de verdad las tres de partida: el arranque y el color. El
// resto (encuadre, velocidad, recorte) lo sortea la semilla.
const PLANES = [
  { arranque: 'normal', color: 'calido' },
  { arranque: 'avance', color: 'neutro' },
  { arranque: 'normal', color: 'contraste', recorte: 1 },
]

/** Los ajustes de partida de la variante `i` (0, 1, 2) de un reel. */
export function ajustesDeVariante(mediaId, i) {
  return normalizaAjustes({ ...PLANES[i % PLANES.length] }, `${mediaId}:${i}`)
}

/**
 * Qué trozos del vídeo van y cuánto dura el resultado, con la duración real de
 * la fuente (s). Lo usan el servidor para armar ffmpeg y la pantalla para
 * enseñar lo que va a salir.
 *   avance    → { desde, dur } o null
 *   principal → { desde, dur }: el vídeo entero menos el recorte
 *   total     → segundos antes de la velocidad; salida → después
 */
export function tramos(ajustes, duracion) {
  const a = ajustes
  const D = Number(duracion)
  const conocida = Number.isFinite(D) && D > 0
  const recorte = conocida ? Math.min(a.recorte, Math.max(0, redondea(D - 1, 2))) : a.recorte
  const principal = { desde: redondea(recorte, 2), dur: conocida ? redondea(D - recorte, 3) : null }
  let avance = null
  if (a.arranque === 'avance' && conocida && D >= a.avanceDur + 1) {
    const dur = a.avanceDur
    const pedido = a.avanceEn == null ? D * 0.45 : a.avanceEn
    avance = { desde: redondea(Math.min(Math.max(0, pedido), D - dur), 2), dur }
  }
  const total = conocida ? redondea((avance?.dur || 0) + principal.dur, 3) : null
  const salida = total == null ? null : redondea(total / a.velocidad, 3)
  const ganchoDur = salida == null ? a.ganchoDur : Math.min(a.ganchoDur, salida)
  return { avance, principal, total, salida, ganchoDur }
}

const par = (n) => (n % 2 ? n + 1 : n)
const parAbajo = (n) => n - (n % 2)

/**
 * Escala para cubrir 1080×1920 con el zoom, y dónde recortar (todo par, que es
 * lo que pide yuv420p). `info` es el tamaño VISIBLE de la fuente ({ ancho,
 * alto }). Lo usan ffmpeg (api/_lib/variantes.js) y la vista previa del
 * navegador, para que lo que se ve sea lo que sale.
 */
export function reencuadre(info, a) {
  const { ancho: W, alto: H } = LIENZO
  const w = Math.max(2, Number(info?.ancho) || W)
  const h = Math.max(2, Number(info?.alto) || H)
  const escala = Math.max(W / w, H / h) * a.zoom
  const ew = Math.max(W, par(Math.ceil(w * escala)))
  const eh = Math.max(H, par(Math.ceil(h * escala)))
  const mx = ew - W
  const my = eh - H
  const x = parAbajo(Math.min(mx, Math.max(0, Math.round((mx / 2) * (1 + a.desplX)))))
  const y = parAbajo(Math.min(my, Math.max(0, Math.round((my / 2) * (1 + a.desplY)))))
  return { ew, eh, x, y }
}

export const palabrasDe = (texto) => String(texto || '').split(/\s+/).filter(Boolean)
export const quitaSignos = (p) => String(p || '').replace(/^[¿¡"'«(]+|[?!"'».,:;)]+$/g, '')

/** Las propuestas de gancho de la IA, saneadas (2–7 palabras, la resaltada dentro). */
export function normalizaGanchos(crudas) {
  const lista = Array.isArray(crudas) ? crudas : []
  const salida = []
  for (const o of lista) {
    if (!o || typeof o !== 'object') continue
    const texto = limpia(o.texto, MAX_CARACTERES_GANCHO + 10)
    const n = palabrasDe(texto).length
    if (!texto || n < PALABRAS_GANCHO.min || n > PALABRAS_GANCHO.max || texto.length > MAX_CARACTERES_GANCHO) continue
    const resaltada = limpia(o.resaltada, 40)
    const esta = resaltada && palabrasDe(texto).some(p => quitaSignos(p).toLowerCase() === quitaSignos(resaltada).toLowerCase())
    salida.push({ texto, resaltada: esta ? resaltada : '', angulo: limpia(o.angulo, 60), porque: limpia(o.porque, 240) })
    if (salida.length === 3) break
  }
  return salida
}
