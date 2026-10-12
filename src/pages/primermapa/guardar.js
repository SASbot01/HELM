// Diagnóstico operativo — dónde acaban los leads.
//
// Todo entra en el CRM del perfil indicado (por slug) como un contacto normal:
// aparece en el pipeline, se le puede asignar responsable y mover de etapa como
// a cualquier otro. Nada de una tabla aparte que luego nadie mira.
//
// Se guarda en DOS momentos a propósito:
//   1. Al pasar la puerta (nombre, email, teléfono) → el lead existe aunque
//      abandone el cuestionario a la tercera pregunta. Es la mitad del valor.
//   2. Al terminar → se completan las respuestas y el diagnóstico.
//
// Las dos escrituras las hace el servidor (api/leads.js · puerta y completar,
// landing `primermapa`), que es quien sabe a qué perfil va. Aquí se calcula y
// se redacta; el servidor acota y guarda.
import { pideLead } from '../leads.js'
import { Q, etiquetaDe, textoDe } from './preguntas'
import { eur } from './calculo'

// De dónde llegó, para el bloque "De dónde vino" de la ficha. Se lee de la URL
// en la que se abrió la página: si se mira al terminar, ya se han podido perder
// los parámetros de navegación.
export function origenDeLaUrl() {
  try {
    const p = new URLSearchParams(window.location.search)
    const o = {}
    for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) {
      const v = p.get(k)
      if (v) o[k] = v.slice(0, 200)
    }
    if (document.referrer) o.referrer = document.referrer.slice(0, 300)
    return o
  } catch { return {} }
}

/**
 * Crea (o recupera) el contacto al pasar la puerta.
 * Si ese email ya existe en el perfil se reutiliza en vez de duplicar: alguien
 * que repite el diagnóstico es la misma persona, no un lead nuevo.
 *
 * Devuelve la ficha firmada del lead, para completarlo al terminar.
 */
export async function crearLead({ nombre, email, telefono }, origen = {}) {
  const { id } = await pideLead('puerta', { landing: 'primermapa', nombre, email, telefono, origen })
  return id
}

// Informe legible que se guarda en las notas del contacto. Que quien lo abra
// dentro de un mes entienda el caso sin tener que ejecutar nada.
export function informeTexto(A, R, calif) {
  const L = []
  L.push(`DIAGNÓSTICO OPERATIVO · ${new Date().toLocaleDateString('es-ES')}`)
  L.push('')
  L.push(`Fuga estimada: ${eur(R.total.min)} – ${eur(R.total.max)} al mes`)
  L.push(`Al año: ${eur(R.total.min * 12)} – ${eur(R.total.max * 12)}`)
  L.push(`Índice de escalabilidad: ${R.idx}/100 · ${R.perfil.name}`)
  L.push(`Lead ${calif.caliente ? 'CALIENTE' : 'estándar'} — ${calif.motivo}`)
  L.push('')

  if (R.leaks.length) {
    L.push('FUGAS DETECTADAS (de mayor a menor)')
    R.leaks.forEach((l, i) => {
      L.push(`${i + 1}. [${l.area}] ${l.name} — ${eur(l.min)} a ${eur(l.max)}/mes`)
      L.push(`   Solución: ${l.fix} (esfuerzo ${l.esf}, ${l.plazo})`)
    })
    L.push('')
  }

  L.push('RESPUESTAS')
  for (const q of Q) {
    const t = etiquetaDe(A, q.id)
    if (t) L.push(`· ${textoDe(q, A)}\n  → ${t}`)
  }
  return L.join('\n')
}

// Las etiquetas, no los códigos: la respuesta del plugin Formularios se lee
// sola, sin traducir nada.
function respuestasLegibles(A) {
  const answers = {}
  for (const q of Q) {
    const t = etiquetaDe(A, q.id)
    if (t) answers[q.id] = t
  }
  return answers
}

/**
 * Completa el lead con el diagnóstico: notas legibles, datos estructurados en
 * custom_fields, la respuesta en el plugin Formularios (que es donde el
 * comercial la lee: la pestaña del formulario en la ficha, con pregunta y
 * respuesta una debajo de otra) y una actividad en su timeline.
 *
 * El formulario lo crea migrations/helm_formulario_primermap_silvestre.sql. Si
 * la migración no está puesta no se guarda ahí, pero el lead y sus notas sí:
 * esto no puede tumbar el envío.
 */
export async function guardarDiagnostico(contactId, { A, R, calif, extra }) {
  await pideLead('completar', {
    landing: 'primermapa',
    id: contactId,
    contacto: {
      notes: informeTexto(A, R, calif),
      // El valor del trato es la fuga anual estimada: es lo que está en juego
      // y hace que el pipeline se ordene solo por oportunidad real.
      deal_value: Math.round(R.total.max * 12),
      status: calif.caliente ? 'contactado' : 'lead',
      tags: ['primermapa', R.perfil.name, ...(calif.caliente ? ['caliente'] : [])],
      website: (extra?.web || '').trim(),
    },
    ficha: {
      respuestas: A,
      indice: R.idx,
      perfil: R.perfil.name,
      dimensiones: R.dims,
      fuga_mes: R.total,
      fuga_anual: { min: R.total.min * 12, max: R.total.max * 12 },
      fugas: R.leaks.map(l => ({ area: l.area, fuga: l.name, min: l.min, max: l.max, solucion: l.fix })),
      calificacion: calif,
      quiere_revision: Boolean(extra?.quiereRevision),
      completado: new Date().toISOString(),
      // La prueba del consentimiento. Sin la casilla marcada el formulario
      // no deja enviar (PrimerMapa.jsx), así que aquí siempre es cierto.
      consentimiento: {
        aceptado: true,
        texto: 'Acepto que tratéis mis datos para enviarme el informe y contactarme sobre él.',
        fecha: new Date().toISOString(),
      },
    },
    form: 'primermap',
    respondent: extra?.nombre || '',
    respuestas: respuestasLegibles(A),
    meta: {
      ...(extra?.origen || {}),
      // El índice de escalabilidad no vale como "calidad del lead": va al revés
      // (cuanto más alto, mejor le va y menos tiene que arreglar). El tramo se
      // saca de lo que de verdad decide a quién se llama antes — si está
      // caliente y cuánto dinero hay sobre la mesa.
      lead_tier: calif.caliente ? 'A' : R.total.max * 12 >= 50000 ? 'B' : 'C',
      indice: R.idx,
      perfil: R.perfil.name,
      fuga_anual_max: Math.round(R.total.max * 12),
      quiere_revision: Boolean(extra?.quiereRevision),
    },
    // La actividad es lo que hace que el lead aparezca en el timeline del
    // plugin Actividad y no solo en su ficha.
    actividad: {
      title: `Diagnóstico completado · ${eur(R.total.max)}/mes de fuga`,
      description: [
        `Índice ${R.idx}/100 (${R.perfil.name}).`,
        calif.caliente ? `LEAD CALIENTE: ${calif.motivo}.` : '',
        extra?.quiereRevision ? 'Ha pedido revisión personal de sus respuestas.' : '',
        R.leaks[0] ? `Fuga principal: ${R.leaks[0].name}.` : '',
      ].filter(Boolean).join(' '),
    },
  })
}
