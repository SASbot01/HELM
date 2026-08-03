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
import { supabase } from '../../utils/supabase'
import { Q, etiquetaDe, textoDe } from './preguntas'
import { eur } from './calculo'

// El perfil al que van los leads de esta página.
export const PERFIL_SLUG = 'silvestre'

export async function getClientId(slug = PERFIL_SLUG) {
  const { data, error } = await supabase
    .from('clients').select('id, name').eq('slug', slug).maybeSingle()
  if (error || !data) {
    console.warn('[primermapa] perfil no encontrado', slug, error?.message)
    return null
  }
  return data.id
}

/**
 * Crea (o recupera) el contacto al pasar la puerta.
 * Si ese email ya existe en el perfil se reutiliza en vez de duplicar: alguien
 * que repite el diagnóstico es la misma persona, no un lead nuevo.
 */
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

export async function crearLead(clientId, { nombre, email, telefono }, origen = {}) {
  const correo = email.trim().toLowerCase()

  const { data: existente } = await supabase
    .from('crm_contacts').select('id')
    .eq('client_id', clientId).ilike('email', correo).limit(1)

  if (existente?.length) {
    await supabase.from('crm_contacts').update({
      name: nombre.trim(), phone: telefono.trim(), updated_at: new Date().toISOString(),
    }).eq('id', existente[0].id)
    return existente[0].id
  }

  const { data, error } = await supabase.from('crm_contacts').insert({
    client_id: clientId,
    name: nombre.trim(),
    email: correo,
    phone: telefono.trim(),
    whatsapp: telefono.trim(),
    source: 'Diagnóstico operativo',
    status: 'lead',
    tags: ['primermapa'],
    notes: 'Empezó el diagnóstico operativo. Aún sin terminar.',
    // El CRM tiene columnas propias para las UTM y la vista de Ventas filtra
    // por ellas: dejarlas solo dentro del jsonb las escondería.
    utm_source: origen.utm_source || null,
    utm_medium: origen.utm_medium || null,
    utm_campaign: origen.utm_campaign || null,
    utm_content: origen.utm_content || null,
  }).select('id').single()

  if (error) { console.warn('[primermapa] crearLead', error.message); throw error }
  return data.id
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

/**
 * La respuesta en el plugin Formularios, que es donde el comercial la lee: la
 * pestaña del formulario en la ficha del contacto, con pregunta y respuesta una
 * debajo de otra. Antes esto solo estaba en las notas, que es un muro de texto.
 *
 * El formulario lo crea migrations/helm_formulario_primermap_silvestre.sql. Si
 * la migración no está puesta no se encuentra y no se guarda aquí, pero el lead
 * y sus notas sí: esto no puede tumbar el envío.
 */
async function guardarEnFormularios(clientId, contactId, { A, R, calif, extra }) {
  const { data: form } = await supabase
    .from('helm_forms').select('id')
    .eq('client_id', clientId).eq('slug', 'primermap').maybeSingle()
  if (!form) { console.warn('[primermapa] falta el formulario primermap'); return }

  // Las etiquetas, no los códigos: la ficha se lee sola, sin traducir nada.
  const answers = {}
  for (const q of Q) {
    const t = etiquetaDe(A, q.id)
    if (t) answers[q.id] = t
  }

  const { error } = await supabase.from('helm_form_responses').insert({
    client_id: clientId,
    form_id: form.id,
    contact_id: contactId,
    respondent: extra?.nombre || '',
    answers,
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
  })
  if (error) console.warn('[primermapa] guardarEnFormularios', error.message)
}

/**
 * Completa el lead con el diagnóstico: la respuesta en Formularios, notas
 * legibles, datos estructurados en custom_fields y una actividad en su timeline.
 */
export async function guardarDiagnostico(clientId, contactId, { A, R, calif, extra }) {
  const informe = informeTexto(A, R, calif)

  const patch = {
    notes: informe,
    // El valor del trato es la fuga anual estimada: es lo que está en juego y
    // hace que el pipeline se ordene solo por oportunidad real.
    deal_value: Math.round(R.total.max * 12),
    status: calif.caliente ? 'contactado' : 'lead',
    tags: ['primermapa', R.perfil.name, ...(calif.caliente ? ['caliente'] : [])],
    website: (extra?.web || '').trim(),
    custom_fields: {
      primermapa: {
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
      },
    },
    updated_at: new Date().toISOString(),
    last_activity_at: new Date().toISOString(),
  }

  const { error } = await supabase.from('crm_contacts').update(patch).eq('id', contactId)
  if (error) { console.warn('[primermapa] guardarDiagnostico', error.message); throw error }

  await guardarEnFormularios(clientId, contactId, { A, R, calif, extra })

  // La actividad es lo que hace que el lead aparezca en el timeline del plugin
  // Actividad y no solo en su ficha.
  await supabase.from('crm_activities').insert({
    client_id: clientId,
    contact_id: contactId,
    type: 'note',
    title: `Diagnóstico completado · ${eur(R.total.max)}/mes de fuga`,
    description: [
      `Índice ${R.idx}/100 (${R.perfil.name}).`,
      calif.caliente ? `LEAD CALIENTE: ${calif.motivo}.` : '',
      extra?.quiereRevision ? 'Ha pedido revisión personal de sus respuestas.' : '',
      R.leaks[0] ? `Fuga principal: ${R.leaks[0].name}.` : '',
    ].filter(Boolean).join(' '),
    performed_by: 'Diagnóstico operativo',
    performed_at: new Date().toISOString(),
  }).then(({ error: e }) => {
    // Que falle la actividad no puede tirar abajo el guardado del lead.
    if (e) console.warn('[primermapa] actividad', e.message)
  })
}
