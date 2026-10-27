// HELM — Resincronización de las métricas de Instagram, sola y a menudo.
//
// Desde las 6:00 de Madrid y cada HELM_METRICAS_CADA_H horas (3 por defecto:
// 6, 9, 12, 15, 18 y 21 h), se bajan de Meta las métricas
// de TODAS las cuentas de Instagram conectadas (cada fila de user_integrations
// del servicio 'instagram' con token), para que el «Informe de contenido» y las
// estrategias del roadmap trabajen siempre con datos frescos.
//
// Corre dentro del worker (scripts/agents-worker.mjs) como trabajo de tipo
// 'metricas'. Es idempotente por tramo (la clave lleva la fecha y el tramo) y no depende de
// que el perfil tenga el equipo de agentes encendido: sincroniza toda cuenta
// conectada, la use un agente o no.
import { supabase } from '../lib/supabase.js'
import { sincronizar as sincronizarIg } from '../instagram.js'
import { diaMadrid, horaMadrid } from './equipo.js'

// Las cuentas con Instagram conectado hoy. Se enumeran por la tabla de
// integraciones y NO por el slug del perfil: hay un lío conocido entre
// 'silvestre' y 'alexsilvestre', y así no se queda ninguna fuera.
async function cuentasConectadas() {
  const { data, error } = await supabase
    .from('user_integrations')
    .select('client_id, config, enabled')
    .eq('service', 'instagram')
    .is('member_id', null)
  if (error) throw error
  return (data || [])
    .filter(r => r.enabled !== false && r.config?.token)
    .map(r => r.client_id)
}

const CADA_H = Math.min(24, Math.max(1, Number(process.env.HELM_METRICAS_CADA_H) || 3))

/**
 * Lo que mira el worker cada minuto: a partir de las 6:00 de Madrid encola, una
 * vez por tramo de CADA_H horas, la resincronización de métricas de cada cuenta
 * conectada. La clave lleva la fecha y el tramo, así que revisarlo cada minuto
 * solo encola la primera vez de cada tramo. Nadie tiene que sincronizar a mano.
 */
export async function miraMetricas() {
  const hora = horaMadrid()
  if (hora < 6) return
  const tramo = Math.floor((hora - 6) / CADA_H)
  const clientes = await cuentasConectadas()
  if (!clientes.length) return
  const hoy = diaMadrid()
  const filas = clientes.map((clientId) => ({
    tipo: 'metricas',
    payload: { clientId },
    clave: `metricas:${clientId}:${hoy}:${tramo}`,
    estado: 'pendiente',
    max_intentos: 2, // un reintento: Meta da 429/5xx pasajeros de vez en cuando
    correr_tras: new Date().toISOString(),
  }))
  const { error } = await supabase
    .from('agent_jobs')
    .upsert(filas, { onConflict: 'clave', ignoreDuplicates: true })
  if (error) throw new Error(`No se pudo encolar la sync de métricas: ${error.message}`)
}

/**
 * El trabajo en sí: baja de Instagram las últimas piezas de un perfil y las
 * guarda en helm_ig_media (lo hace `sincronizar`, que arma su propio token y
 * usa el cliente service-role). Devuelve el parte para que quede en el log.
 */
export async function sincronizaMetricas(job) {
  const clientId = job?.payload?.clientId
  if (!clientId) throw new Error('metricas: falta clientId en el trabajo')
  return sincronizarIg(clientId, 90)
}
