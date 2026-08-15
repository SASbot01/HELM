// El enlace con el CRM, para la masterclass de la página de inicio.
//
// Un lead que se apunta aquí NO acaba en una tabla propia: entra en el CRM de
// HELM como un contacto normal del perfil `silvestre`, en su pipeline "Página
// de inicio", con su etapa y sus UTM. Misma decisión que las otras páginas
// públicas (el formulario de valor, el diagnóstico) y por el mismo motivo: una
// lista de emails aparte es una lista que nadie vuelve a mirar.
import { supabase } from '../../utils/supabase'

export const PERFIL_SLUG = 'silvestre'
export const PIPELINE = 'Página de inicio'
export const ETAPA_ENTRADA = 'lead_nuevo'

// De dónde vino: lo que traiga la URL, tal cual, para poder medir qué Reel
// trae gente.
export function origenDeLaUrl() {
  const p = new URLSearchParams(window.location.search)
  return {
    utm_source: p.get('utm_source') || 'pagina-inicio',
    utm_medium: p.get('utm_medium') || 'bio',
    utm_campaign: p.get('utm_campaign'),
    utm_content: p.get('utm_content'),
  }
}

/**
 * Da de alta el lead.
 *
 * Dos cosas que parecen detalles y no lo son:
 *
 *   · Si ese email YA existe en el perfil, se actualiza en vez de duplicar.
 *     Quien se apunta dos veces es la misma persona, y un CRM con la misma
 *     persona tres veces es un CRM que el comercial deja de creerse.
 *   · Si el pipeline todavía no está creado, el contacto entra igual sin
 *     embudo. Perder un lead porque falta una fila de configuración sería el
 *     peor intercambio posible.
 */
export async function altaLead({ nombre, email, evento }) {
  const correo = String(email || '').trim().toLowerCase()
  if (!correo) throw new Error('Falta el email')

  const { data: perfil, error: errPerfil } = await supabase
    .from('clients').select('id').eq('slug', PERFIL_SLUG).maybeSingle()
  if (errPerfil || !perfil) throw new Error('No he podido conectar con el CRM. Prueba en un minuto.')

  const { data: pipeline } = await supabase
    .from('crm_pipelines').select('id, stages')
    .eq('client_id', perfil.id).eq('name', PIPELINE).maybeSingle()

  const etapas = Array.isArray(pipeline?.stages) ? pipeline.stages : []
  const etapa = etapas.find(s => s.key === ETAPA_ENTRADA)?.key || etapas[0]?.key || 'lead'
  const origen = origenDeLaUrl()

  const fila = {
    client_id: perfil.id,
    name: String(nombre || '').trim() || correo.split('@')[0],
    email: correo,
    source: 'Página de inicio',
    // A qué sesión se apuntó. Va en las notas y no en `source` porque `source`
    // responde a "de dónde vino" y no debe cambiar cada vez que hay directo
    // nuevo: si lo pisáramos, la atribución de la página se partiría en cinco.
    notes: evento ? `Se apuntó a: ${evento}` : null,
    pipeline_id: pipeline?.id || null,
    status: etapa,
    utm_source: origen.utm_source,
    utm_medium: origen.utm_medium,
    utm_campaign: origen.utm_campaign,
    utm_content: origen.utm_content,
    last_activity_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  const { data: existente } = await supabase
    .from('crm_contacts').select('id, notes')
    .eq('client_id', perfil.id).ilike('email', correo).limit(1)

  if (existente?.length) {
    // Ni la etapa ni el embudo se tocan al volver: si ya está en "Llamada
    // agendada", que se apunte otra vez a la lista no lo devuelve a la casilla
    // de salida.
    const { pipeline_id: _pipelineId, status: _status, ...sinMover } = fila

    // Las notas se SUMAN, no se pisan: quien se apuntó a una sesión anterior y
    // vuelve para esta tiene las dos, que es justo lo que mira quien le va a
    // llamar. Y si repite en la misma, no se duplica la línea.
    const previas = String(existente[0].notes || '')
    sinMover.notes = !fila.notes ? previas || null
      : previas.includes(fila.notes) ? previas
        : [previas, fila.notes].filter(Boolean).join('\n')

    const { error } = await supabase.from('crm_contacts').update(sinMover).eq('id', existente[0].id)
    if (error) throw new Error('No he podido guardarte. Prueba en un minuto.')
    return { id: existente[0].id, repetido: true }
  }

  const { data, error } = await supabase.from('crm_contacts').insert(fila).select('id').single()
  if (error) throw new Error('No he podido guardarte. Prueba en un minuto.')
  return { id: data.id, repetido: false }
}

/**
 * Cuántos hay ya apuntados a esta sesión. Es la única lectura pública de la
 * "sala": un conteo, no la lista de quién es quién — los nombres de otros
 * leads no se enseñan a un desconocido que aún no ha dejado el suyo. El
 * conteo sí es publicable y es lo que de verdad vende la sala ("no eres el
 * único"), sin tocar ningún dato de nadie.
 */
export async function contarApuntados(evento) {
  try {
    const { data: perfil } = await supabase
      .from('clients').select('id').eq('slug', PERFIL_SLUG).maybeSingle()
    if (!perfil) return null
    const { count } = await supabase
      .from('crm_contacts').select('id', { count: 'exact', head: true })
      .eq('client_id', perfil.id).ilike('notes', `%${evento}%`)
    return typeof count === 'number' ? count : null
  } catch {
    return null   // decorativo: si falla, la sala se ve igual de bien sin el número
  }
}

/**
 * Anota que ese lead se ha ido a la comunidad de Discord.
 *
 * Es la diferencia entre "le enseñamos el botón" y "lo pulsó", que es justo lo
 * que quiere saber quien luego le escriba: quien está en el Discord ya no es
 * un email suelto, es alguien que aparece cada semana.
 *
 * Nunca lanza. Se llama mientras el navegador ya está abriendo Discord, y que
 * falle una nota no puede romper —ni retrasar— el único clic que importa.
 */
export async function marcaComunidad(id) {
  if (!id) return
  const NOTA = 'Entró en la comunidad de Discord'
  try {
    const { data } = await supabase.from('crm_contacts').select('notes').eq('id', id).maybeSingle()
    const previas = String(data?.notes || '')
    if (previas.includes(NOTA)) return
    await supabase.from('crm_contacts').update({
      notes: [previas, NOTA].filter(Boolean).join('\n'),
      last_activity_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', id)
  } catch {
    // A propósito en silencio: ver el dato en el CRM es un lujo, entrar en el
    // Discord es el objetivo.
  }
}
