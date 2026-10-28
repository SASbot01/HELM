// HELM — Formularios · tipos de pregunta y validación.
//
// Separado de campos.jsx (que solo pinta) porque lo usan tanto el panel como
// el formulario público, y porque mezclar constantes con componentes rompe el
// recargado en caliente de Vite.

// `options` marca los tipos que necesitan una lista de opciones.
export const TIPOS = [
  { key: 'text', label: 'Texto corto' },
  { key: 'long', label: 'Texto largo' },
  { key: 'number', label: 'Número' },
  { key: 'date', label: 'Fecha' },
  { key: 'select', label: 'Elegir una', options: true },
  { key: 'multi', label: 'Elegir varias', options: true },
  { key: 'scale', label: 'Escala 1-10' },
]

export const tipoOf = (k) => TIPOS.find(t => t.key === k) || TIPOS[0]

// Errores de las preguntas obligatorias sin responder.
export function validarRespuestas(fields, answers) {
  const errors = {}
  for (const c of (fields || [])) {
    if (!c.required) continue
    const v = answers[c.key]
    const vacio = v == null || v === '' || (Array.isArray(v) && v.length === 0)
    if (vacio) errors[c.key] = 'Obligatoria'
  }
  return errors
}
