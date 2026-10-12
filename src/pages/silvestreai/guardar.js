// Silvestre IA · formulario de valor — dónde acaban los leads.
//
// Igual que el diagnóstico operativo: todo entra en el CRM del perfil como un
// contacto normal, con su pipeline y su responsable. Nada de una tabla aparte
// que luego nadie mira.
//
// Y se guarda en DOS momentos a propósito:
//   1. Al pasar el bloque 1 (nombre, empresa, email, teléfono, web) → el lead
//      existe aunque abandone en la pregunta 4. Es la mitad del valor.
//   2. Al terminar → se completan las respuestas de su rama y la calificación.
//
// Las dos escrituras las hace el servidor (api/leads.js · puerta y completar,
// landing `silvestreai`), que es quien sabe a qué perfil va. Aquí se califica y
// se redacta; el servidor acota y guarda.
import { pideLead } from '../leads.js'
import { Q, etiquetaDe, textoDe, valorDe, ramaCorta, visibles } from './preguntas'

/**
 * Crea (o recupera) el contacto al pasar el bloque 1. Si ese email ya existe en
 * el perfil se reutiliza en vez de duplicar: quien repite el formulario es la
 * misma persona, no un lead nuevo. (La P5, "Instagram o web", la reparte el
 * servidor en su columna.)
 *
 * Devuelve la ficha firmada del lead, para completarlo al terminar.
 */
export async function crearLead({ nombre, empresa, email, telefono, web, pais, origen }) {
  const { id } = await pideLead('puerta', {
    landing: 'silvestreai', nombre, empresa, email, telefono, web, pais, origen,
  })
  return id
}

/**
 * Calificación del lead. No se le enseña al visitante — esto no es un
 * diagnóstico con resultado, es un formulario de captación. Sirve para que el
 * pipeline se ordene solo y quien llame sepa a quién llama primero.
 *
 * Caliente = tiene con qué pagar (factura) y ya ha comprado antes consultoría,
 * o le duele lo bastante como para haber puesto un objetivo de los caros.
 */
export function calificar(A) {
  const rama = A.tipo
  const factura = valorDe(A, `${rama}_factura`)
  const inversion = valorDe(A, `${rama}_inversion`)
  const gastoIA = valorDe(A, `${rama}_gastoia`) + valorDe(A, `${rama}_gastocloud`)

  const motivos = []
  // Los umbrales son distintos por rama: 15.000 €/mes en un despacho es un buen
  // cliente y en una empresa de infraestructura es una startup pequeña.
  const umbral = rama === 'infra' ? 200000 : 15000
  if (factura >= umbral) motivos.push(`factura ${factura >= umbral * 3 ? 'muy ' : ''}por encima de la media de su rama`)
  if (inversion > 0) motivos.push('ya ha invertido antes en consultoría')
  if (gastoIA >= 5000) motivos.push(`quema ${Math.round(gastoIA / 1000)}k€/mes en IA y cloud`)

  // 0–100 en tres tramos, que es lo que pinta la ficha del CRM: puede pagar
  // (facturación), ya ha pagado antes por algo así (inversión) y tiene un
  // gasto que recortar (IA y cloud, solo la rama D).
  const pts = (v, tope, max) => Math.round(Math.min(v / tope, 1) * max)
  const score = Math.min(100,
    pts(factura, umbral * 3, 50) + pts(inversion, 5000, 25) + pts(gastoIA, 10000, 25))
  const tier = score >= 70 ? 'A' : score >= 40 ? 'B' : 'C'

  return { caliente: motivos.length >= 2, motivos, score, tier, factura, inversion, gastoIA }
}

// De dónde llegó, para el bloque "De dónde vino" de la ficha. Se lee de la URL
// en la que se abrió el formulario, así que hay que capturarlo al entrar: si se
// mira al terminar, ya se han perdido los parámetros de navegación.
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

// Informe legible que se guarda en las notas del contacto. Que quien lo abra
// dentro de un mes entienda el caso sin tener que ejecutar nada.
export function informeTexto(A, datos, calif) {
  const L = []
  L.push(`FORMULARIO DE VALOR · SILVESTRE IA · ${new Date().toLocaleDateString('es-ES')}`)
  L.push(`Rama: ${ramaCorta(A.tipo)}`)
  L.push(`Lead ${calif.caliente ? 'CALIENTE' : 'estándar'}${calif.motivos.length ? ` — ${calif.motivos.join('; ')}` : ''}`)
  L.push('')
  L.push('DATOS')
  L.push(`· Empresa: ${datos.empresa}`)
  L.push(`· Instagram o web: ${datos.web || '—'}`)
  L.push(`· Teléfono: ${datos.telefono}`)
  L.push('')
  L.push('RESPUESTAS')
  for (const q of Q) {
    if (q.rama && q.rama !== A.tipo) continue
    const t = etiquetaDe(A, q.id)
    if (t) L.push(`· ${textoDe(q, A)}\n  → ${t}`)
  }
  return L.join('\n')
}

// Las etiquetas, no los códigos: la respuesta del plugin Formularios se lee
// sola, sin traducir nada. El orden lo da preguntas.js, que es el mismo de los
// campos del formulario.
function respuestasLegibles(A) {
  const answers = {}
  for (const q of visibles(A)) {
    if (q.id === 'tipo') continue         // la P6 la dice ya el título del formulario
    const t = etiquetaDe(A, q.id)
    if (t) answers[q.id] = t
  }
  return answers
}

/**
 * Completa el lead al terminar: notas legibles, datos estructurados en
 * custom_fields, la respuesta en el plugin Formularios (la pestaña del
 * formulario en la ficha, igual que las de Detrás de Cámara) y una actividad en
 * su timeline.
 *
 * Hay un formulario por rama (migrations/helm_formulario_valor_silvestre.sql).
 * Si la migración no está puesta no se guarda ahí, pero el lead y sus notas sí:
 * esto no puede tumbar el envío.
 */
export async function guardarRespuestas(contactId, { A, datos }) {
  const calif = calificar(A)
  const rama = ramaCorta(A.tipo)

  await pideLead('completar', {
    landing: 'silvestreai',
    id: contactId,
    contacto: {
      notes: informeTexto(A, datos, calif),
      // El valor del trato es lo que factura al año: es el tamaño real de la
      // oportunidad y hace que el pipeline se ordene solo.
      deal_value: calif.factura ? Math.round(calif.factura * 12) : null,
      status: calif.caliente ? 'contactado' : 'lead',
      tags: ['silvestreai-valor', rama, ...(calif.caliente ? ['caliente'] : [])],
    },
    ficha: {
      rama: A.tipo,
      rama_label: rama,
      respuestas: A,
      calificacion: calif,
      lead_magnet: Boolean(datos.leadMagnet),
      completado: new Date().toISOString(),
    },
    form: `valor-${A.tipo}`,
    respondent: `${datos.nombre} · ${datos.empresa}`.trim(),
    respuestas: respuestasLegibles(A),
    meta: {
      ...(datos.origen || {}),
      lead_tier: calif.tier,
      lead_score: calif.score,
      lead_magnet: Boolean(datos.leadMagnet),
      rama: A.tipo,
    },
    // La actividad es lo que hace que el lead aparezca en el timeline del
    // plugin Actividad y no solo en su ficha.
    actividad: {
      title: `Formulario de valor completado · ${rama}`,
      description: [
        calif.caliente ? `LEAD CALIENTE: ${calif.motivos.join('; ')}.` : '',
        etiquetaDe(A, `${A.tipo}_dolor`) ? `Dolor: ${etiquetaDe(A, `${A.tipo}_dolor`)}.` : '',
        etiquetaDe(A, `${A.tipo}_objetivo`) ? `Objetivo a 6 meses: ${etiquetaDe(A, `${A.tipo}_objetivo`)}.` : '',
      ].filter(Boolean).join(' '),
    },
  })
}
