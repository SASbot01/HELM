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
export async function crearLead(clientId, { nombre, email, telefono }) {
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
 * Completa el lead con el diagnóstico: notas legibles, datos estructurados en
 * custom_fields y una actividad en su timeline.
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
