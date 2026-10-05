// AI para todo — el alta del miembro en el CRM.
//
// Para leer cualquier hilo (skills, noticias, capítulos de la guía o la guía
// en PDF de los no negociables) se piden cuatro datos: nombre, correo,
// profesión e ingresos al mes. Entran en HELM como un contacto del perfil
// silvestre, igual que el resto de páginas públicas:
//
//   · quien entra por la guía en PDF («No negociables») → embudo «Lead magnet»
//   · quien entra por cualquier otro hilo               → embudo «Página de inicio»
//
// La profesión y los ingresos van en custom_fields.aiparatodo y en las notas,
// para que se vean en la ficha sin abrir nada.
import { supabase } from '../../utils/supabase'
import { origen } from '../inicio/socio/origen.js'

export const PERFIL_SLUG = 'silvestre'
export const PIPELINE_COMUNIDAD = 'Página de inicio'
// Lo crea migrations/092_silvestre_lead_magnet_pipeline.sql.
export const PIPELINE_LEAD_MAGNET = 'Lead magnet'
const ETAPA_ENTRADA = 'lead_nuevo'
const SOURCE = 'AI para todo'

export const INGRESOS = {
  menos_1000: 'Menos de 1.000 €/mes',
  mas_1000: 'Más de 1.000 €/mes',
}

const ahora = () => new Date().toISOString()

/**
 * Da de alta (o actualiza) a quien deja sus datos.
 *
 *   · Si el correo ya existe en el perfil, se actualiza en vez de duplicar, y
 *     NUNCA se le cambia de embudo ni de etapa: un contacto sin embudo ya está
 *     en el de ventas por defecto, y leer un hilo no devuelve a nadie a la
 *     casilla de salida.
 *   · Si el embudo todavía no existe, el contacto entra igual, sin embudo.
 */
export async function altaMiembro({ nombre, email, profesion, ingresos, pipeline, nota }) {
  const correo = String(email || '').trim().toLowerCase()
  if (!correo) throw new Error('Falta el correo')
  // La búsqueda va con ilike: `%` y `*` son comodines (y no hay forma de
  // buscarlos literales), y `_` casa con cualquier letra. Sin esto, un correo
  // con comodines encontraría la ficha de otra persona.
  if (/[%*\\]/.test(correo) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) throw new Error('Revisa el correo')
  if (!INGRESOS[ingresos]) throw new Error('Elige tus ingresos')

  const { data: perfil, error: errPerfil } = await supabase
    .from('clients').select('id').eq('slug', PERFIL_SLUG).maybeSingle()
  if (errPerfil || !perfil) throw new Error('No he podido conectar. Prueba en un minuto.')

  const { data: embudo } = await supabase
    .from('crm_pipelines').select('id, stages')
    .eq('client_id', perfil.id).eq('name', pipeline).maybeSingle()
  const etapas = Array.isArray(embudo?.stages) ? embudo.stages : []
  const etapa = etapas.find(s => s.key === ETAPA_ENTRADA)?.key || etapas[0]?.key || ETAPA_ENTRADA

  const o = origen()
  const oficio = String(profesion || '').trim().slice(0, 120)
  const ficha = { profesion: oficio, ingresos, entrada: nota, enviado: ahora() }
  const linea = `AI para todo · ${nota} · profesión: ${oficio || '—'} · ingresos: ${INGRESOS[ingresos]}`

  const fila = {
    client_id: perfil.id,
    name: String(nombre || '').trim().slice(0, 80) || correo.split('@')[0],
    email: correo,
    source: SOURCE,
    notes: linea,
    pipeline_id: embudo?.id || null,
    status: etapa,
    utm_source: o.utm_source || 'aiparatodo',
    utm_medium: o.utm_medium || 'comunidad',
    utm_campaign: o.utm_campaign || null,
    utm_content: o.utm_content || null,
    custom_fields: { aiparatodo: ficha },
    last_activity_at: ahora(),
    updated_at: ahora(),
  }

  const { data: existente } = await supabase
    .from('crm_contacts').select('id, notes, custom_fields')
    .eq('client_id', perfil.id).ilike('email', correo.replace(/_/g, '\\_')).limit(1)

  if (existente?.length) {
    const previo = existente[0]
    const { pipeline_id: _embudo, status: _etapa, source: _source, ...cambios } = fila
    const previas = String(previo.notes || '')
    cambios.notes = previas.includes(linea) ? previas : [previas, linea].filter(Boolean).join('\n')
    cambios.custom_fields = { ...(previo.custom_fields || {}), aiparatodo: ficha }
    const { error } = await supabase.from('crm_contacts').update(cambios).eq('id', previo.id)
    if (error) throw new Error('No he podido guardarte. Prueba en un minuto.')
    return { id: previo.id }
  }

  const { data, error } = await supabase.from('crm_contacts').insert(fila).select('id').single()
  if (error) throw new Error('No he podido guardarte. Prueba en un minuto.')
  return { id: data.id }
}

/**
 * Deja una línea en las notas del contacto (p. ej. «descargó la guía en PDF»).
 * Nunca lanza: la descarga ya está en marcha y una nota no puede pararla.
 */
export async function anota(id, texto) {
  if (!id || !texto) return
  try {
    const { data } = await supabase.from('crm_contacts').select('notes').eq('id', id).maybeSingle()
    const previas = String(data?.notes || '')
    if (previas.includes(texto)) return
    await supabase.from('crm_contacts').update({
      notes: [previas, texto].filter(Boolean).join('\n'),
      last_activity_at: ahora(),
      updated_at: ahora(),
    }).eq('id', id)
  } catch {
    // A propósito en silencio.
  }
}
