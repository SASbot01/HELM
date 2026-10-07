// HELM — traduce las respuestas del onboarding a un "dossier": el material
// bruto y ordenado que la IA sintetiza en las Biblias (empresa y contenido).
//
// No es lo que ve el chat ni lo que ve el cliente: es la materia prima que se
// manda al modelo en api/onboarding.js para que redacte los documentos.

import { isAnswered } from './schema'

// Formatea el valor de un campo a texto plano según su tipo.
function formatValue(field, value) {
  switch (field.type) {
    case 'scale':
      return `${value}/10`
    case 'multi':
      return (value || []).join(' · ')
    case 'table': {
      const rows = (value || []).filter(row => Object.values(row || {}).some(v => String(v || '').trim()))
      return '\n' + rows
        .map(row =>
          '    · ' + field.columns
            .map(c => (String(row[c.key] || '').trim() ? `${c.label}: ${String(row[c.key]).trim()}` : null))
            .filter(Boolean)
            .join(' · '),
        )
        .join('\n')
    }
    default:
      return String(value).trim()
  }
}

// La etiqueta de la pregunta, sin el prefijo de numeración ("1.1 · ", "A3 · ").
function cleanLabel(label) {
  return String(label).replace(/^[A-E]?\d*(?:\.\d+)?\s*·\s*/, '').trim()
}

// answers → markdown legible con todas las respuestas, agrupadas por sección.
export function buildDossier(schema, answers) {
  const parts = []
  for (const section of schema.sections) {
    const lines = []
    for (const field of section.fields) {
      const value = answers[field.key]
      if (!isAnswered(field, value)) continue
      lines.push(`- ${cleanLabel(field.label)}: ${formatValue(field, value)}`)
    }
    if (lines.length) parts.push(`## ${section.title}\n${lines.join('\n')}`)
  }
  return parts.join('\n\n')
}
