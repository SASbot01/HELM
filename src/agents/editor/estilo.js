// HELM — Editor de reels: el estilo de edición, en datos. Módulo puro (sin
// React, sin navegador y sin Node): lo usan la pantalla (EditorReel.jsx, el
// panel «Estilo») y el servidor (api/editor.js y api/_lib/editor/*), para que
// los dos sitios recorten igual.
//
// Un estilo es lo que decide cómo sale el reel editado: cómo son los
// subtítulos (palabras por bloque, mayúsculas, colores, tamaño y altura), si
// hay «punch-in» (el zoom que salta cada pocos segundos) y cómo de agresivo es
// el corte (qué cuenta como silencio y como toma repetida). Cada valor tiene
// su tope: fuera de él, el reel deja de verse bien en Instagram.
//
// Y cómo entran los recursos que sube el usuario junto al vídeo: las
// imágenes y clips de apoyo (a pantalla completa o en la mitad de arriba con la
// persona abajo, y cuánto dura cada uno), la música (a qué volumen bajo la voz)
// y el logo (en qué esquina, o ninguna).
//
// Uso:
//   import { normalizaEstilo, ESTILO_POR_DEFECTO, MODOS_RECURSOS, POSICIONES_LOGO } from './editor/estilo'
//   const estilo = normalizaEstilo({ recursosModo: 'arriba', musicaVolumen: 0.2 })  // siempre válido
//   Object.entries(MODOS_RECURSOS)  // [['corte', 'Pantalla completa'], …] para un selector

export const LIENZO = { ancho: 1080, alto: 1920 }
export const FPS = 30

// Los subtítulos van en el tercio bajo, pero por encima del pie de Instagram
// (nombre, texto y audio: los últimos ~420 px) y a la izquierda de la columna
// de botones (x > 940 de media altura para abajo). `posicion` es el centro
// del bloque, en % de la altura.
export const ZONA_SUBTITULOS = { x0: 100, x1: 930 }

export const RANGOS_ESTILO = {
  palabrasPorBloque: { min: 1, max: 5, paso: 1 },
  tamano: { min: 48, max: 120, paso: 2 },
  borde: { min: 0, max: 12, paso: 1 },
  posicion: { min: 50, max: 78, paso: 1 },
  zoomCada: { min: 2, max: 10, paso: 0.5 },
  zoomFactor: { min: 1.03, max: 1.15, paso: 0.01 },
  pausaFrase: { min: 0.3, max: 1.5, paso: 0.05 },
  silencioMax: { min: 0.2, max: 1.5, paso: 0.05 },
  silencioDeja: { min: 0.05, max: 0.4, paso: 0.01 },
  similitudTomas: { min: 0.5, max: 0.95, paso: 0.05 },
  volumen: { min: -20, max: -12, paso: 0.5 },
  recursoDuracion: { min: 1.5, max: 5, paso: 0.5 },
  musicaVolumen: { min: 0, max: 0.5, paso: 0.01 },
}

// Cómo entran las imágenes y clips de apoyo (broll). Las claves son lo que se
// guarda; el texto, lo que se enseña.
export const MODOS_RECURSOS = Object.freeze({
  // Tapan el vídeo entero (1080×1920, recortado al centro) mientras duran.
  corte: 'Pantalla completa',
  // En la mitad de arriba, con la persona en la de abajo (estilo Kallaway).
  arriba: 'Arriba, con la persona abajo',
})

// Dónde va el logo, encima de todo el vídeo (dentro de los márgenes seguros
// de Instagram).
export const POSICIONES_LOGO = Object.freeze({
  'arriba-izq': 'Arriba a la izquierda',
  'arriba-der': 'Arriba a la derecha',
  'abajo-izq': 'Abajo a la izquierda',
  'abajo-der': 'Abajo a la derecha',
  ninguna: 'Sin logo',
})

export const ESTILO_POR_DEFECTO = Object.freeze({
  // Subtítulos (quemados en el vídeo, palabra a palabra)
  subtitulos: true,
  palabrasPorBloque: 3,
  mayusculas: true,
  colorTexto: '#FFFFFF',
  colorResalte: '#FFD60A',
  colorBorde: '#000000',
  tamano: 72,
  borde: 6,
  posicion: 68,
  // Punch-in: 1,00 → 1,08 → 1,00… cada `zoomCada` segundos (y si cae cerca
  // de un corte, en el corte: así el salto se disimula).
  zoom: true,
  zoomCada: 4,
  zoomFactor: 1.08,
  // El corte: una frase acaba con una pausa de `pausaFrase` s o con un punto;
  // los silencios de más de `silencioMax` se quedan en `silencioDeja`.
  pausaFrase: 0.6,
  silencioMax: 0.4,
  silencioDeja: 0.12,
  // Dos frases que empiezan igual (≥ `similitudTomas` en sus primeras
  // palabras, con una cambiada como mucho) son dos tomas: va la última.
  quitarTomas: true,
  similitudTomas: 0.6,
  quitarMuletillas: true,
  // Volumen de la voz al final (LUFS integrados; Instagram anda por -14/-16).
  volumen: -16,
  // Recursos que sube el usuario: cada imagen o clip de apoyo dura
  // `recursoDuracion` s y entra según `recursosModo`.
  recursosModo: 'corte',
  recursoDuracion: 2.5,
  // La música va en bucle debajo de la voz a este volumen (0 = muda, 0,5 =
  // la mitad), y baja más mientras se habla.
  musicaVolumen: 0.12,
  logoPosicion: 'arriba-der',
})

const COLOR = /^#[0-9a-f]{6}$/i
const redondea = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d
const acota = (n, { min, max }) => Math.min(max, Math.max(min, n))
const numero = (v, rango, defecto, d = 2) => {
  const n = typeof v === 'number' ? v : (typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN)
  const bueno = Number.isFinite(n) ? n : defecto
  // Al paso del rango: lo que se ve en el deslizador es lo que se guarda.
  const enPaso = rango.paso ? Math.round((bueno - rango.min) / rango.paso) * rango.paso + rango.min : bueno
  return redondea(acota(enPaso, rango), d)
}
const color = (v, defecto) => (typeof v === 'string' && COLOR.test(v.trim()) ? v.trim().toUpperCase() : defecto)
const si = (v, defecto) => (typeof v === 'boolean' ? v : defecto)
const opcion = (v, opciones, defecto) => (typeof v === 'string' && Object.hasOwn(opciones, v.trim()) ? v.trim() : defecto)

/**
 * El estilo saneado: cada valor dentro de su tope, los colores en #RRGGBB y lo
 * que falte, el de HELM. `base` es el estilo del que se parte (el global, o el
 * del perfil): lo que no venga en `entrada` se queda como en `base`.
 */
export function normalizaEstilo(entrada = {}, base = ESTILO_POR_DEFECTO) {
  const e = entrada && typeof entrada === 'object' && !Array.isArray(entrada) ? entrada : {}
  const b = base === ESTILO_POR_DEFECTO ? base : normalizaEstilo(base)
  const R = RANGOS_ESTILO
  const silencioMax = numero(e.silencioMax, R.silencioMax, b.silencioMax)
  return {
    subtitulos: si(e.subtitulos, b.subtitulos),
    palabrasPorBloque: numero(e.palabrasPorBloque, R.palabrasPorBloque, b.palabrasPorBloque, 0),
    mayusculas: si(e.mayusculas, b.mayusculas),
    colorTexto: color(e.colorTexto, b.colorTexto),
    colorResalte: color(e.colorResalte, b.colorResalte),
    colorBorde: color(e.colorBorde, b.colorBorde),
    tamano: numero(e.tamano, R.tamano, b.tamano, 0),
    borde: numero(e.borde, R.borde, b.borde, 0),
    posicion: numero(e.posicion, R.posicion, b.posicion, 0),
    zoom: si(e.zoom, b.zoom),
    zoomCada: numero(e.zoomCada, R.zoomCada, b.zoomCada, 1),
    zoomFactor: numero(e.zoomFactor, R.zoomFactor, b.zoomFactor),
    pausaFrase: numero(e.pausaFrase, R.pausaFrase, b.pausaFrase),
    silencioMax,
    // Lo que se deja de un silencio nunca es más que lo que cuenta como silencio.
    silencioDeja: Math.min(numero(e.silencioDeja, R.silencioDeja, b.silencioDeja), silencioMax),
    quitarTomas: si(e.quitarTomas, b.quitarTomas),
    similitudTomas: numero(e.similitudTomas, R.similitudTomas, b.similitudTomas),
    quitarMuletillas: si(e.quitarMuletillas, b.quitarMuletillas),
    volumen: numero(e.volumen, R.volumen, b.volumen, 1),
    recursosModo: opcion(e.recursosModo, MODOS_RECURSOS, b.recursosModo),
    recursoDuracion: numero(e.recursoDuracion, R.recursoDuracion, b.recursoDuracion, 1),
    musicaVolumen: numero(e.musicaVolumen, R.musicaVolumen, b.musicaVolumen),
    logoPosicion: opcion(e.logoPosicion, POSICIONES_LOGO, b.logoPosicion),
  }
}

// Los estados de una edición, en el orden en que pasan, y cómo se dicen.
export const ESTADOS_EDICION = {
  subiendo: 'Subiendo',
  en_cola: 'En cola',
  transcribiendo: 'Transcribiendo',
  montando: 'Montando',
  listo: 'Listo',
  error: 'Error',
}
export const EN_MARCHA = ['subiendo', 'en_cola', 'transcribiendo', 'montando']

// Lo que se puede subir (el servidor lo vuelve a comprobar).
export const MAX_MB_SUBIDA = 800
export const DIAS_GUARDADO = 7
