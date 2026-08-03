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
import { supabase } from '../../utils/supabase'
import { Q, etiquetaDe, textoDe, valorDe, ramaCorta, visibles } from './preguntas'

// El perfil al que van los leads de esta página.
export const PERFIL_SLUG = 'silvestre'

export async function getClientId(slug = PERFIL_SLUG) {
  const { data, error } = await supabase
    .from('clients').select('id, name').eq('slug', slug).maybeSingle()
  if (error || !data) {
    console.warn('[silvestreai] perfil no encontrado', slug, error?.message)
    return null
  }
  return data.id
}

/**
 * Crea (o recupera) el contacto al pasar el bloque 1. Si ese email ya existe en
 * el perfil se reutiliza en vez de duplicar: quien repite el formulario es la
 * misma persona, no un lead nuevo.
 */
export async function crearLead(clientId, { nombre, empresa, email, telefono, web, pais, origen }) {
  const correo = email.trim().toLowerCase()
  // La P5 pide "Instagram o web" en un solo campo, pero el CRM tiene columna
  // para cada cosa: adivinar cuál es evita que el comercial tenga que abrir la
  // nota para saber si ese texto es un perfil o un dominio.
  const dato = (web || '').trim()
  const esInstagram = dato.startsWith('@') || /instagram\.com/i.test(dato)
  const base = {
    name: nombre.trim(),
    company: empresa.trim(),
    phone: telefono.trim(),
    whatsapp: telefono.trim(),
    country: pais || null,
    website: esInstagram ? '' : dato,
    instagram: esInstagram ? dato : '',
    // El CRM tiene columnas propias para las UTM y la vista de Ventas filtra
    // por ellas: dejarlas solo dentro del jsonb las escondería.
    utm_source: origen?.utm_source || null,
    utm_medium: origen?.utm_medium || null,
    utm_campaign: origen?.utm_campaign || null,
    utm_content: origen?.utm_content || null,
    updated_at: new Date().toISOString(),
  }

  const { data: existente } = await supabase
    .from('crm_contacts').select('id')
    .eq('client_id', clientId).ilike('email', correo).limit(1)

  if (existente?.length) {
    await supabase.from('crm_contacts').update(base).eq('id', existente[0].id)
    return existente[0].id
  }

  const { data, error } = await supabase.from('crm_contacts').insert({
    ...base,
    client_id: clientId,
    email: correo,
    source: 'Formulario de valor · Silvestre IA',
    status: 'lead',
    tags: ['silvestreai-valor'],
    notes: 'Empezó el formulario de valor. Aún sin terminar.',
  }).select('id').single()

  if (error) { console.warn('[silvestreai] crearLead', error.message); throw error }
  return data.id
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

/**
 * La respuesta en el plugin Formularios, que es donde el comercial la lee: la
 * pestaña del formulario en la ficha del contacto, con pregunta y respuesta una
 * debajo de otra, igual que las de Detrás de Cámara.
 *
 * Hay un formulario por rama (migrations/helm_formulario_valor_silvestre.sql).
 * Si la migración no está puesta no se encuentra y no se guarda aquí, pero el
 * lead y sus notas sí: esto no puede tumbar el envío.
 */
async function guardarEnFormularios(clientId, contactId, { A, datos, calif }) {
  const { data: form } = await supabase
    .from('helm_forms').select('id')
    .eq('client_id', clientId).eq('slug', `valor-${A.tipo}`).maybeSingle()
  if (!form) { console.warn('[silvestreai] falta el formulario valor-' + A.tipo); return }

  // Las etiquetas, no los códigos: la ficha se lee sola, sin traducir nada.
  // El orden lo da preguntas.js, que es el mismo de los campos del formulario.
  const answers = {}
  for (const q of visibles(A)) {
    if (!q.rama) continue                 // la P6 la dice ya el título del formulario
    const t = etiquetaDe(A, q.id)
    if (t) answers[q.id] = t
  }

  const { error } = await supabase.from('helm_form_responses').insert({
    client_id: clientId,
    form_id: form.id,
    contact_id: contactId,
    respondent: `${datos.nombre} · ${datos.empresa}`.trim(),
    answers,
    meta: {
      ...(datos.origen || {}),
      lead_tier: calif.tier,
      lead_score: calif.score,
      lead_magnet: Boolean(datos.leadMagnet),
      rama: A.tipo,
    },
  })
  if (error) console.warn('[silvestreai] guardarEnFormularios', error.message)
}

/**
 * Completa el lead al terminar: la respuesta en Formularios, notas legibles,
 * datos estructurados en custom_fields y una actividad en su timeline.
 */
export async function guardarRespuestas(clientId, contactId, { A, datos }) {
  const calif = calificar(A)
  const rama = ramaCorta(A.tipo)

  const { error } = await supabase.from('crm_contacts').update({
    notes: informeTexto(A, datos, calif),
    // El valor del trato es lo que factura al año: es el tamaño real de la
    // oportunidad y hace que el pipeline se ordene solo.
    deal_value: calif.factura ? Math.round(calif.factura * 12) : null,
    status: calif.caliente ? 'contactado' : 'lead',
    tags: ['silvestreai-valor', rama, ...(calif.caliente ? ['caliente'] : [])],
    custom_fields: {
      silvestreai_valor: {
        rama: A.tipo,
        rama_label: rama,
        respuestas: A,
        calificacion: calif,
        lead_magnet: Boolean(datos.leadMagnet),
        completado: new Date().toISOString(),
      },
    },
    updated_at: new Date().toISOString(),
    last_activity_at: new Date().toISOString(),
  }).eq('id', contactId)

  if (error) { console.warn('[silvestreai] guardarRespuestas', error.message); throw error }

  await guardarEnFormularios(clientId, contactId, { A, datos, calif })

  // La actividad es lo que hace que el lead aparezca en el timeline del plugin
  // Actividad y no solo en su ficha. Que falle no puede tirar abajo el guardado.
  const { error: e2 } = await supabase.from('crm_activities').insert({
    client_id: clientId,
    contact_id: contactId,
    type: 'note',
    title: `Formulario de valor completado · ${rama}`,
    description: [
      calif.caliente ? `LEAD CALIENTE: ${calif.motivos.join('; ')}.` : '',
      etiquetaDe(A, `${A.tipo}_dolor`) ? `Dolor: ${etiquetaDe(A, `${A.tipo}_dolor`)}.` : '',
      etiquetaDe(A, `${A.tipo}_objetivo`) ? `Objetivo a 6 meses: ${etiquetaDe(A, `${A.tipo}_objetivo`)}.` : '',
    ].filter(Boolean).join(' '),
    performed_by: 'Formulario de valor · Silvestre IA',
    performed_at: new Date().toISOString(),
  })
  if (e2) console.warn('[silvestreai] actividad', e2.message)
}
