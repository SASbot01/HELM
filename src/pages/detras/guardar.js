// Detrás de Cámara · lead magnet "Chuleta de parámetros" (/pdf).
//
// Mismo formulario y misma mecánica que el de valor de Silvestre, pero los leads
// entran en el CRM del perfil detras-de-camra, pipeline "Lead magnet". El
// servidor (api/leads.js · puerta y completar con landing `detrascamara`) es
// quien conoce el perfil y el embudo; aquí solo se califica y se redacta,
// reutilizando el cálculo del formulario de valor.
import { pideLead } from '../leads.js'
import { etiquetaDe, ramaCorta, visibles } from '../silvestreai/preguntas'
import { calificar, informeTexto, origenDeLaUrl } from '../silvestreai/guardar'

export { origenDeLaUrl }

// Crea (o recupera) el contacto al pasar el bloque 1.
export async function crearLead({ nombre, empresa, email, telefono, web, pais, origen }) {
  const { id } = await pideLead('puerta', {
    landing: 'detrascamara', nombre, empresa, email, telefono, web, pais, origen,
  })
  return id
}

function respuestasLegibles(A) {
  const answers = {}
  for (const q of visibles(A)) {
    if (q.id === 'tipo') continue
    const t = etiquetaDe(A, q.id)
    if (t) answers[q.id] = t
  }
  return answers
}

// Completa el lead al terminar. Reutiliza la calificación y el informe del
// formulario de valor; cambia la landing (perfil + embudo) y las etiquetas.
export async function guardarRespuestas(contactId, { A, datos }) {
  const calif = calificar(A)
  const rama = ramaCorta(A.tipo)

  await pideLead('completar', {
    landing: 'detrascamara',
    id: contactId,
    contacto: {
      notes: informeTexto(A, datos, calif),
      deal_value: calif.factura ? Math.round(calif.factura * 12) : null,
      status: calif.caliente ? 'contactado' : 'lead',
      tags: ['chuleta-pdf', rama, ...(calif.caliente ? ['caliente'] : [])],
    },
    ficha: {
      rama: A.tipo,
      rama_label: rama,
      respuestas: A,
      calificacion: calif,
      lead_magnet: true,
      completado: new Date().toISOString(),
    },
    form: `pdf-${A.tipo}`,
    respondent: `${datos.nombre} · ${datos.empresa}`.trim(),
    respuestas: respuestasLegibles(A),
    meta: {
      ...(datos.origen || {}),
      lead_tier: calif.tier,
      lead_score: calif.score,
      lead_magnet: true,
      rama: A.tipo,
    },
    actividad: {
      title: `Chuleta de parámetros descargada · ${rama}`,
      description: [
        calif.caliente ? `LEAD CALIENTE: ${calif.motivos.join('; ')}.` : '',
        etiquetaDe(A, `${A.tipo}_dolor`) ? `Dolor: ${etiquetaDe(A, `${A.tipo}_dolor`)}.` : '',
        etiquetaDe(A, `${A.tipo}_objetivo`) ? `Objetivo a 6 meses: ${etiquetaDe(A, `${A.tipo}_objetivo`)}.` : '',
      ].filter(Boolean).join(' '),
    },
  })
}
