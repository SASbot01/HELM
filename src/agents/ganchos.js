// Agent OS — los tipos de gancho y su color.
//
// El orden de esta lista NO es decorativo: la paleta se validó en este orden
// exacto con el validador de contraste y daltonismo, que mide la separación
// entre colores ADYACENTES. Reordenar la lista invalida esa comprobación.
//
// Resultado de la validación (superficie clara #FFFFFF):
//   banda de luminosidad ······ los 8 dentro de L 0.43–0.77
//   croma mínimo ·············· los 8 ≥ 0.1 (ninguno se lee como gris)
//   separación con daltonismo · peor par adyacente ΔE 9.5 (deutan)
//   separación visión normal ·· peor par adyacente ΔE 27.5
//   contraste con el fondo ···· los 8 ≥ 3:1
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
  { key: 'promesa',      label: 'Promesa',       color: '#BE123C' },
  { key: 'demostracion', label: 'Demostración',  color: '#0891B2' },
]

// Gris del sistema para lo que aún no está etiquetado. No es un gancho más:
// por eso no entra en GANCHOS ni cuenta para la validación de la paleta.
export const SIN_ETIQUETAR = { key: '', label: 'Sin etiquetar', color: '#9A9D93' }

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
  { key: 'gancho',        label: 'Gancho',        color: '#1C1D19' },
  { key: 'planteamiento', label: 'Planteamiento', color: '#82857B' },
  { key: 'remate',        label: 'Remate',        color: '#5A6E50' },
  { key: 'venta',         label: 'Venta',         color: '#B4531F' },
]

const ROLPORKEY = new Map(ROLES.map(r => [r.key, r]))
export const rol = (v) => ROLPORKEY.get(String(v || '')) || ROLES[1]
