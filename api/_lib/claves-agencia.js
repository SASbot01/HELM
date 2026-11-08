// HELM — trae-tu-clave: la IA la pone cada agencia (desde el 2026-11-08).
//
// HELM ya no paga la IA de las agencias ni les cobra por ella. Cada agencia
// guarda en «Licencia y claves» su PROPIA clave de Claude (y su token de
// Replicate, para las imágenes de Portadas): tabla agencia_claves
// (migrations/125_licencias.sql), solo por el servidor.
//
// Qué clave usa cada llamada:
//   · La clave propia del PERFIL (Ajustes → IA, user_integrations), si tiene.
//   · Si no, la de su AGENCIA. En los dos casos, con la licencia vigente.
//   · La agencia de la casa (sin_cobro) y un perfil sin agencia: lo de siempre
//     (el modelo local en llm.js; la clave de HELM donde se usaba).
//   · Si no hay ninguna: no se llama. Error 409 con `codigo: 'sin_clave_ia'` y
//     un mensaje que se enseña tal cual.
//
// La pieza que lo hace cumplir es claveParaLlamada, en cada llamada a Claude
// (./anthropic.js): donde antes se cobraban créditos (una llamada con la clave
// de HELM para una agencia que no es la de la casa), ahora se cambia por la
// clave de esa agencia. Así los agentes que llaman con la clave de HELM (Mi
// día, el avatar, el equipo, el bot de Telegram, el estudio de contenido, el
// worker…) pasan solos a la de la agencia, sin tocar cada uno.
import { supabase } from '../lib/supabase.js'
import { contexto } from './contexto.js'
import { agenciaDe } from './access.js'
import { licenciaDe, errorSinLicencia } from './licencia.js'

export const SIN_CLAVE_IA = 'sin_clave_ia'

/** La clave de Claude de HELM: solo para la agencia de la casa y lo que no es de ninguna. */
export const claveHelm = () => process.env.AGENTS_ANTHROPIC_KEY || process.env.ANTHROPIC_API_KEY || ''

// Las claves se leen en cada llamada a la IA: se recuerdan un minuto. Al
// guardarlas, olvidarClavesAgencia() para que valgan ya.
const vistas = new Map() // agenciaId -> { valor, exp }
const CACHE_MS = 60_000

export function olvidarClavesAgencia(agenciaId) {
  if (agenciaId) vistas.delete(agenciaId)
  else vistas.clear()
}

/**
 * Las claves guardadas de una agencia: { anthropicKey, anthropicModel,
 * replicateToken } (null lo que no tenga). Lanza si falla la base.
 */
export async function clavesDeAgencia(agenciaId) {
  const vacio = { anthropicKey: null, anthropicModel: null, replicateToken: null }
  if (!agenciaId) return vacio
  const vista = vistas.get(agenciaId)
  if (vista && vista.exp > Date.now()) return vista.valor
  const { data, error } = await supabase.from('agencia_claves')
    .select('anthropic_key, anthropic_model, replicate_token').eq('agencia_id', agenciaId).maybeSingle()
  if (error) throw error
  const valor = {
    anthropicKey: data?.anthropic_key || null,
    anthropicModel: data?.anthropic_model || null,
    replicateToken: data?.replicate_token || null,
  }
  vistas.set(agenciaId, { valor, exp: Date.now() + CACHE_MS })
  return valor
}

/** Lo que se puede enseñar de las claves: si están y sus 4 últimas cifras. Nunca la clave. */
export async function estadoClaves(agenciaId) {
  const c = await clavesDeAgencia(agenciaId)
  const fin = (k) => (k ? String(k).slice(-4) : null)
  return {
    anthropic: { configurada: Boolean(c.anthropicKey), last4: fin(c.anthropicKey), modelo: c.anthropicModel },
    replicate: { configurada: Boolean(c.replicateToken), last4: fin(c.replicateToken) },
  }
}

/**
 * Guarda (o borra, con null) las claves de una agencia. Solo los campos que
 * vengan (undefined = no se toca). Comprobar que la clave vale es de quien
 * llama (verificarClave, en api/creditos.js), antes de guardar.
 */
export async function guardarClavesAgencia(agenciaId, { anthropicKey, anthropicModel, replicateToken } = {}, por = '') {
  const fila = { agencia_id: agenciaId, updated_by: String(por || '').slice(0, 200), updated_at: new Date().toISOString() }
  if (anthropicKey !== undefined) fila.anthropic_key = anthropicKey || null
  if (anthropicModel !== undefined) fila.anthropic_model = anthropicModel || null
  if (replicateToken !== undefined) fila.replicate_token = replicateToken || null
  const { error } = await supabase.from('agencia_claves').upsert(fila, { onConflict: 'agencia_id' })
  if (error) throw error
  olvidarClavesAgencia(agenciaId)
}

/** El error de «tu agencia no ha puesto su clave»: 409, se enseña tal cual. */
export function errorSinClave(que = 'Claude') {
  const e = new Error(que === 'Replicate'
    ? 'Tu agencia aún no ha puesto su token de Replicate para generar imágenes con IA. Quien la administra puede añadirlo en Perfiles → Licencia y claves.'
    : 'Tu agencia aún no ha puesto su clave de Claude, y sin ella la IA no trabaja. Quien la administra puede añadirla en Perfiles → Licencia y claves.')
  e.statusCode = 409
  e.codigo = SIN_CLAVE_IA
  return e
}

/**
 * La clave propia de un perfil (Ajustes → IA), o null. Se lee aquí y no con
 * getIaConfig de ./anthropic.js, que importa este archivo.
 */
async function clavePropiaDelPerfil(clientId) {
  const { data, error } = await supabase.from('user_integrations')
    .select('config, enabled').eq('client_id', clientId).eq('service', 'anthropic').is('member_id', null).maybeSingle()
  if (error) throw error
  return data?.enabled && data?.config?.apiKey ? data.config.apiKey : null
}

/**
 * ¿Quién pone la IA? { casa: true } si es la agencia de la casa (o no hay
 * agencia): lo de siempre. Si no, con la licencia vigente, la clave propia del
 * perfil (si se pasa `clientId` y la tiene) o la de la agencia. Lanza: 402 sin
 * licencia, 409 sin clave, y si falla la base (no se llama a ciegas con la
 * clave de HELM).
 * @returns {Promise<{ casa: true } | { casa: false, apiKey: string, model: string|null, origen: 'perfil'|'agencia' }>}
 */
async function iaDe({ agenciaId = null, clientId = null } = {}) {
  if (!agenciaId) return { casa: true }
  const l = await licenciaDe(agenciaId)
  if (l.exenta) return { casa: true }
  if (!l.vigente) throw errorSinLicencia(l.venceAt)
  if (clientId) {
    const propia = await clavePropiaDelPerfil(clientId)
    if (propia) return { casa: false, apiKey: propia, model: null, origen: 'perfil' }
  }
  const c = await clavesDeAgencia(agenciaId)
  if (!c.anthropicKey) throw errorSinClave('Claude')
  return { casa: false, apiKey: c.anthropicKey, model: c.anthropicModel, origen: 'agencia' }
}

/** La IA de una agencia entera (sin perfil): la suya, o la casa. Ver iaDe. */
export const iaDeAgencia = (agenciaId) => iaDe({ agenciaId })

/** La IA de un perfil: su clave propia o la de su agencia, o la casa. Ver iaDe. */
export async function iaDelPerfil(clientId) {
  return iaDe({ agenciaId: clientId ? await agenciaDe(clientId) : null, clientId })
}

/**
 * La clave con la que se hace de verdad una llamada a Claude. Si `apiKey` no
 * es la de HELM (la propia de un perfil o la de una agencia), esa. Si es la de
 * HELM (o no hay), se mira de quién es la petición en curso (./contexto.js):
 * de la casa o de nadie, la de HELM; de otra agencia, la propia del perfil si
 * tiene y, si no, la de la AGENCIA (o 402 sin licencia / 409 sin clave). Es
 * donde antes se exigía saldo y se cobraba.
 */
export async function claveParaLlamada(apiKey) {
  if (apiKey && apiKey !== claveHelm()) return apiKey
  const c = contexto()
  if (!c) return apiKey
  const agenciaId = c.clientId ? (await agenciaDe(c.clientId)) || c.agenciaId : c.agenciaId
  const ia = await iaDe({ agenciaId: agenciaId || null, clientId: c.clientId || null })
  return ia.casa ? apiKey : ia.apiKey
}

/**
 * El token de Replicate con el que generar las imágenes de un perfil: el de
 * su agencia; el de HELM (REPLICATE_API_TOKEN) solo para la casa y para un
 * perfil sin agencia. null si no hay (o la licencia no está vigente). Lanza si
 * falla la base.
 */
export async function tokenImagenDe(clientId) {
  const agenciaId = clientId ? await agenciaDe(clientId) : null
  if (!agenciaId) return process.env.REPLICATE_API_TOKEN || null
  const l = await licenciaDe(agenciaId)
  if (l.exenta) return process.env.REPLICATE_API_TOKEN || null
  if (!l.vigente) return null
  return (await clavesDeAgencia(agenciaId)).replicateToken || null
}
