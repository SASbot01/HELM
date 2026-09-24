// El enlace de Socio IA con el CRM de HELM. Mismo perfil (`silvestre`) y mismo
// embudo ("Página de inicio") que la masterclass (ver ../crm.js); aquí solo va
// lo que añade el formulario de cualificación.
import { supabase } from '../../../utils/supabase'
import { PERFIL_SLUG, PIPELINE, ETAPA_ENTRADA } from '../crm.js'
import { origen } from './origen.js'

const db = async () => supabase

// Las UTM del Reel, guardadas desde la primera página que pisó (origen.js).
function origenDeLaUrl() {
  const o = origen()
  return {
    utm_source: o.utm_source || 'pagina-inicio',
    utm_medium: o.utm_medium || 'bio',
    utm_campaign: o.utm_campaign || null,
    utm_content: o.utm_content || null,
  }
}

// ── Socio IA ────────────────────────────────────────────────────────────────
// El formulario de cualificación de la página principal. Guarda TODOS los
// envíos, encajen o no: el que no encaja hoy es el que factura el año que viene,
// y sin su ficha no hay a quién volver a escribir.
export const SOCIO_SOURCE = 'Socio IA · formulario'

// Etapas del embudo "Página de inicio" (sql/pipeline_pagina_inicio.sql):
//   encaja    → cualificado      (el formulario ya hizo de filtro)
//   no encaja → nurturing        (se le manda a la clase gratis)
//   reserva   → llamada_agendada (lo marca marcaLlamada al volver de Cal.com)
const ETAPA_ENCAJA = 'cualificado'
const ETAPA_NO_ENCAJA = 'nurturing'
const ETAPA_LLAMADA = 'llamada_agendada'
// Las que un envío que encaja SÍ puede adelantar. Quien ya está en "Llamada
// agendada" o es "Cliente" no retrocede por rellenar otra vez el formulario.
const ADELANTABLES = new Set(['lead_nuevo', 'lead', 'recurso_entregado', 'nurturing', 'descartado', null, ''])

/**
 * Da de alta (o actualiza) a quien rellena el formulario de Socio IA.
 * `respuestas` = { que_vende, precio, facturacion, resultados, nombre, email, instagram }
 */
export async function altaSocio({ respuestas, encaja, titular }) {
  const correo = String(respuestas.email || '').trim().toLowerCase()
  if (!correo) throw new Error('Falta el email')

  const supabase = await db()
  const { data: perfil, error: errPerfil } = await supabase
    .from('clients').select('id').eq('slug', PERFIL_SLUG).maybeSingle()
  if (errPerfil || !perfil) throw new Error('No he podido conectar. Prueba en un minuto.')

  const { data: pipeline } = await supabase
    .from('crm_pipelines').select('id, stages')
    .eq('client_id', perfil.id).eq('name', PIPELINE).maybeSingle()
  const claves = new Set((Array.isArray(pipeline?.stages) ? pipeline.stages : []).map(s => s.key))
  const quiero = encaja ? ETAPA_ENCAJA : ETAPA_NO_ENCAJA
  const etapa = claves.size === 0 || claves.has(quiero) ? quiero : ETAPA_ENTRADA

  const o = origen()
  const utm = origenDeLaUrl()
  const ahora = new Date().toISOString()
  const socio = {
    que_vende: respuestas.que_vende,
    precio: respuestas.precio,
    facturacion: respuestas.facturacion,
    resultados: respuestas.resultados,
    encaja,
    // Qué porcentaje le tocaría: 35 % si empieza de cero, 15 % si ya factura.
    modalidad: respuestas.facturacion === '0' ? '35% (desde cero)' : '15% (ya factura)',
    palabra_clave: o.k || null,
    utm_term: o.utm_term || null,
    titular,
    enviado: ahora,
  }
  const nota = `Socio IA: ${encaja ? 'ENCAJA' : 'no encaja'} · vende "${respuestas.que_vende}" · precio ${respuestas.precio} · factura ${respuestas.facturacion}/mes · resultados: ${respuestas.resultados}${o.k ? ` · palabra: ${o.k}` : ''}`

  const fila = {
    client_id: perfil.id,
    name: String(respuestas.nombre || '').trim() || correo.split('@')[0],
    email: correo,
    instagram: String(respuestas.instagram || '').trim().replace(/^@/, '') || null,
    source: SOCIO_SOURCE,
    producto_interes: 'Socio IA',
    notes: nota,
    pipeline_id: pipeline?.id || null,
    status: etapa,
    ...utm,
    custom_fields: { socio_ia: socio },
    last_activity_at: ahora,
    updated_at: ahora,
  }

  const { data: existente } = await supabase
    .from('crm_contacts').select('id, notes, status, custom_fields, source')
    .eq('client_id', perfil.id).ilike('email', correo).limit(1)

  if (existente?.length) {
    const previo = existente[0]
    const { pipeline_id: _p, status: _s, source: _src, ...cambios } = fila
    cambios.notes = [previo.notes, nota].filter(Boolean).join('\n')
    cambios.custom_fields = { ...(previo.custom_fields || {}), socio_ia: socio }
    // Solo se adelanta de etapa si encaja y venía de una etapa "fría".
    if (encaja && ADELANTABLES.has(previo.status ?? null)) {
      cambios.status = etapa
      if (pipeline?.id) cambios.pipeline_id = pipeline.id
    }
    const { error } = await supabase.from('crm_contacts').update(cambios).eq('id', previo.id)
    if (error) throw new Error('No he podido guardarte. Prueba en un minuto.')
    return { id: previo.id }
  }

  const { data, error } = await supabase.from('crm_contacts').insert(fila).select('id').single()
  if (error) throw new Error('No he podido guardarte. Prueba en un minuto.')
  return { id: data.id }
}

/**
 * Marca que ha reservado la llamada. Nunca lanza: la reserva ya está hecha en
 * el calendario, y que falle la anotación no puede dejarle sin su /gracias.
 */
export async function marcaLlamada(id) {
  if (!id) return
  try {
    const supabase = await db()
    const { data } = await supabase.from('crm_contacts').select('notes').eq('id', id).maybeSingle()
    const ahora = new Date().toISOString()
    await supabase.from('crm_contacts').update({
      status: ETAPA_LLAMADA,
      notes: [data?.notes, 'Socio IA: reservó la auditoría en el calendario'].filter(Boolean).join('\n'),
      last_activity_at: ahora,
      updated_at: ahora,
    }).eq('id', id)
  } catch {
    // En silencio a propósito.
  }
}
