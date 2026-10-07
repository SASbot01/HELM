// HELM — colaboración entre perfiles.
//
// Dos negocios que trabajan juntos (una agencia y su editora, un despacho y la
// gestoría que le lleva las nóminas) se encargaban las cosas por WhatsApp. Aquí
// se encargan tareas de verdad: la tarea entra en el tablero del que tiene que
// hacerla, y el que la encargó la sigue desde el suyo.
//
// Lo que NO se puede hacer es escribirle en el tablero a cualquiera: sería
// dejar que un desconocido te llene la pantalla de trabajo. Por eso hay un
// acuerdo previo — uno lo pide, el otro lo acepta — y hasta entonces no se
// puede encargar nada. Aceptado, vale en los dos sentidos: si tú puedes
// mandarme trabajo, yo puedo mandarte a ti.
import { supabase } from '../lib'

export const TABLA = 'helm_collaborations'

export const PENDIENTE = 'pendiente'
export const ACEPTADA = 'aceptada'
export const RECHAZADA = 'rechazada'

// La tabla llega en una migración aparte (helm_tareas_colaboracion.sql). Si no
// está aplicada, la vista lo dice en vez de quedarse vacía sin explicar nada.
const noExiste = (error) =>
  error?.code === '42P01' || /does not exist|schema cache/i.test(error?.message || '')

/**
 * Todas las colaboraciones que tocan a este perfil, las pida él o se las pidan.
 *
 * Devuelve `{ filas, faltaTabla }` en vez de lanzar: una sección entera no
 * puede caerse porque falte una migración.
 */
export async function listaColaboraciones(clientId) {
  const { data, error } = await supabase
    .from(TABLA).select('*')
    .or(`from_client_id.eq.${clientId},to_client_id.eq.${clientId}`)
    .order('created_at', { ascending: false })
  if (error) {
    console.warn('[helm] colaboraciones', error.message)
    return { filas: [], faltaTabla: noExiste(error) }
  }
  return { filas: data || [], faltaTabla: false }
}

// El otro lado de una colaboración, mirada desde `clientId`.
export const laOtraParte = (fila, clientId) =>
  (fila.from_client_id === clientId ? fila.to_client_id : fila.from_client_id)

// ¿Nos toca contestar a nosotros? Solo al que la recibe, y solo si sigue viva.
export const esperandoRespuesta = (fila, clientId) =>
  fila.status === PENDIENTE && fila.to_client_id === clientId

// Los perfiles con los que ya se puede intercambiar trabajo.
export const idsColaboradores = (filas, clientId) =>
  filas.filter(f => f.status === ACEPTADA).map(f => laOtraParte(f, clientId))

/**
 * Pide colaborar con otro perfil.
 *
 * El índice único de la tabla impide que haya dos acuerdos vivos para la misma
 * pareja, en cualquier dirección: si el otro ya nos la había pedido, la base
 * rechaza el duplicado en vez de dejar dos filas contradictorias. Ese choque se
 * traduce a un mensaje que se entiende, porque el usuario no ha hecho nada mal.
 */
export async function pedirColaboracion({ clientId, otroClientId, mensaje, email }) {
  const { data, error } = await supabase.from(TABLA).insert({
    from_client_id: clientId,
    to_client_id: otroClientId,
    message: (mensaje || '').trim().slice(0, 500),
    requested_by: email || '',
  }).select().single()

  if (error) {
    if (error.code === '23505') {
      throw new Error('Ya hay una colaboración con ese perfil (pendiente o aceptada). Míralas más abajo.')
    }
    throw error
  }
  return data
}

// Aceptar o rechazar. Solo cambia de estado lo que sigue pendiente: si el otro
// lado canceló entre medias, no se resucita nada.
export async function responderColaboracion(id, { aceptar, email }) {
  const { data, error } = await supabase.from(TABLA)
    .update({
      status: aceptar ? ACEPTADA : RECHAZADA,
      responded_by: email || '',
      responded_at: new Date().toISOString(),
    })
    .eq('id', id).eq('status', PENDIENTE)
    .select().maybeSingle()
  if (error) throw error
  if (!data) throw new Error('Esa solicitud ya no está pendiente. Recarga para ver cómo quedó.')
  return data
}

/**
 * Deshacer una colaboración: retirar la solicitud o terminar el acuerdo.
 *
 * Se borra la fila en vez de marcarla: dejar un "rechazada" que nadie pidió
 * ensuciaría el histórico del otro lado, y con la fila fuera los dos pueden
 * volver a pedirla cuando quieran.
 *
 * Las tareas ya encargadas NO se tocan. Están en el tablero del otro y puede
 * que a medio hacer; borrarlas por cerrar el acuerdo sería destruir trabajo
 * ajeno. Lo que se corta es poder encargar más.
 */
export async function deshacerColaboracion(id) {
  const { error } = await supabase.from(TABLA).delete().eq('id', id)
  if (error) throw error
}
