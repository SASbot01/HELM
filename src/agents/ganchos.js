// Agent OS — los tipos de gancho y su color.
//
// El orden de esta lista NO es decorativo: la paleta se validó en este orden
// exacto con el validador de contraste y daltonismo, que mide la separación
// entre colores ADYACENTES. Reordenar la lista invalida esa comprobación.
//
// Resultado de la validación (superficie OSCURA, el panel #101820):
//   banda de luminosidad ······ los 8 dentro de L 0.48–0.67
//   croma mínimo ·············· los 8 ≥ 0.1 (ninguno se lee como gris)
//   separación con daltonismo · peor par adyacente ΔE 9.5 (deutan)
//   separación visión normal ·· peor par adyacente ΔE 27.5
//   contraste con el fondo ···· los 8 ≥ 3:1
//
// El carmesí de "Promesa" se aclaró de #BE123C a #D42353 al pasar a fondo
// oscuro: con el anterior el contraste se quedaba en 2.77 y no llegaba al
// mínimo. Los demás valen igual en claro y en oscuro.
//
// Un gancho nuevo NO se añade con un color inventado: se vuelve a pasar el
// validador con los nueve. Y si algún día hay más de ocho, dejan de caber como
// colores y hay que agrupar — un noveno tono no se distingue de los otros.

export const GANCHOS = [
  { key: 'pregunta',     label: 'Pregunta',      color: '#04996A' },
  { key: 'dato',         label: 'Dato',          color: '#C2410C' },
  { key: 'error comun',  label: 'Error común',   color: '#2563EB' },
  { key: 'contrarian',   label: 'A contracorriente', color: '#B45309' },
  { key: 'historia',     label: 'Historia',      color: '#9333EA' },
  { key: 'lista',        label: 'Lista',         color: '#65A30D' },
  { key: 'promesa',      label: 'Promesa',       color: '#D42353' },
  { key: 'demostracion', label: 'Demostración',  color: '#0891B2' },
]

// Gris del sistema para lo que aún no está etiquetado. No es un gancho más:
// por eso no entra en GANCHOS ni cuenta para la validación de la paleta.
export const SIN_ETIQUETAR = { key: '', label: 'Sin etiquetar', color: '#5C7284' }

const PORKEY = new Map(GANCHOS.map(g => [g.key, g]))

// Tolerante con lo que devuelva el modelo: quita acentos y espacios de sobra
// antes de buscar, para que "Error Común" y "error comun" sean el mismo.
export function gancho(valor) {
  const k = String(valor || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim()
  return PORKEY.get(k) || SIN_ETIQUETAR
}

// Los cuatro papeles de una frase dentro del guion. Aquí el color NO codifica
// identidad sino posición en el guion, así que va del acento del sistema a un
// gris: es una escala, no ocho categorías.
export const ROLES = [
  { key: 'gancho',        label: 'Gancho',        color: '#D8E6F0' },
  { key: 'planteamiento', label: 'Planteamiento', color: '#5C7284' },
  { key: 'remate',        label: 'Remate',        color: '#35D0E8' },
  { key: 'venta',         label: 'Venta',         color: '#FFC155' },
]

const ROLPORKEY = new Map(ROLES.map(r => [r.key, r]))
export const rol = (v) => ROLPORKEY.get(String(v || '')) || ROLES[1]

// Formato y estados de un reel, compartidos por el corpus y la ficha de cada creador.
export const nf = new Intl.NumberFormat('es-ES')
export const fecha = (d) => d ? new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }) : '—'

export const ESTADOS = {
  pendiente:      { txt: 'En cola',      tono: 'espera' },
  descargando:    { txt: 'Descargando',  tono: 'espera' },
  transcribiendo: { txt: 'Transcribiendo', tono: 'espera' },
  transcrito:     { txt: 'Transcrito',   tono: 'espera' },
  etiquetado:     { txt: 'Listo',        tono: 'ok' },
  error:          { txt: 'Error',        tono: 'mal' },
}

// 2300000 → "2,3 M"; 399000 → "399 k". Para leer de un vistazo, no para contar.
export function compacto(n) {
  if (n >= 1e6) return `${nf.format(Math.round(n / 1e5) / 10)} M`
  if (n >= 1e3) return `${nf.format(Math.round(n / 1e3))} k`
  return nf.format(n)
}
