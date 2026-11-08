// HELM — la licencia de cada agencia y su IA (trae tu clave).
//
// Desde el 7-nov-2026 una agencia paga una LICENCIA (97 €/año, IVA incluido)
// y ya está: HELM no vende créditos ni cobra por el uso de la IA. La IA la pone
// cada agencia: su propia clave de Claude (Ajustes de la agencia, tabla
// agencia_ia) o su cuenta de Claude por el conector MCP.
//
//   · Sin licencia válida (pagada y sin caducar) la agencia no entra: lo
//     comprueba validateAuth (./auth.js) en cada petición del panel, el
//     conector MCP y el worker antes de cada trabajo. La plataforma y la
//     agencia de la casa (agencias.sin_cobro) no la necesitan.
//   · Los agentes que llaman a Claude con la clave de HELM (claveHelm) llaman,
//     en realidad, con la de la agencia de la petición en curso: lo cambia
//     claveParaLlamar, que usa anthropic.js antes de cada llamada. La agencia
//     de la casa, sin clave propia, sigue con la de HELM.
//
// Uso:
//   import { exigirLicencia, estadoAgencia, licenciaValida, activarLicencia } from './licencia.js'
//   await exigirLicencia(auth)                 // 402 { codigo: 'licencia' } si no vale
//   const e = await estadoAgencia(agenciaId)   // { existe, sinCobro, venceAt, clave }
//   licenciaValida(e)                          // true / false
//   await activarLicencia({ agenciaId, referencia: session.id, importe: 97 })
import { supabase } from '../lib/supabase.js'
import { contexto } from './contexto.js'

/** Lo que cuesta un año de licencia, en euros con el IVA dentro. */
export const precioLicencia = (env = process.env) => {
  const n = Number(env.HELM_LICENCIA_EUR)
  return Number.isFinite(n) && n > 0 ? n : 97
}
export const MESES_LICENCIA = 12

/** La clave de Claude de HELM (del servidor). Solo la usa la agencia de la casa. */
export const claveHelm = () => process.env.AGENTS_ANTHROPIC_KEY || process.env.ANTHROPIC_API_KEY || ''

// Lo de cada agencia se mira en cada petición: se recuerda un minuto. Pagar o
// cambiar la clave lo olvida al momento (olvidarAgencia).
const CACHE_MS = 60_000
const agenciasVistas = new Map() // agenciaId -> { valor, exp }
const perfilesVistos = new Map() // clientId -> { agenciaId, exp }

/** Olvida lo recordado de una agencia (o de todas). */
export function olvidarAgencia(agenciaId) {
  if (agenciaId) agenciasVistas.delete(agenciaId)
  else agenciasVistas.clear()
}

/**
 * La agencia de un perfil, o null. Como agenciaDe de ./access.js, pero aquí
 * aparte: auth.js importa este archivo y access.js importa auth.js.
 */
export async function agenciaDelPerfil(clientId) {
  if (!clientId) return null
  const visto = perfilesVistos.get(clientId)
  if (visto && visto.exp > Date.now()) return visto.agenciaId
  const { data, error } = await supabase.from('clients').select('agencia_id').eq('id', clientId).maybeSingle()
  if (error) throw error
  const agenciaId = data?.agencia_id || null
  perfilesVistos.set(clientId, { agenciaId, exp: Date.now() + CACHE_MS })
  return agenciaId
}

// La tabla o la columna aún no existen (falta la migración 125).
const sinTabla = (error) => ['42P01', 'PGRST205', '42703', 'PGRST204'].includes(error?.code)
  || /relation .* does not exist|could not find the table|column .* does not exist/i.test(error?.message || '')

/**
 * Cómo está una agencia: si existe, si es la de la casa, hasta cuándo tiene
 * licencia y su clave de Claude (o null). Lanza si falla la base.
 * @returns {Promise<{ existe: boolean, sinCobro: boolean, venceAt: string|null,
 *   clave: null | { apiKey: string, model: string|null, last4: string } }>}
 */
export async function estadoAgencia(agenciaId, { fresca = false } = {}) {
  const vacio = { existe: false, sinCobro: false, venceAt: null, clave: null }
  if (!agenciaId) return vacio
  const visto = agenciasVistas.get(agenciaId)
  if (!fresca && visto && visto.exp > Date.now()) return visto.valor

  const [a, lic, ia] = await Promise.all([
    supabase.from('agencias').select('id, sin_cobro').eq('id', agenciaId).maybeSingle(),
    supabase.from('licenses').select('vence_at').eq('agencia_id', agenciaId).eq('estado', 'activa')
      .order('vence_at', { ascending: false, nullsFirst: false }).limit(1),
    supabase.from('agencia_ia').select('api_key, model, last4').eq('agencia_id', agenciaId).maybeSingle(),
  ])
  if (a.error) throw a.error
  if (lic.error) throw lic.error
  // Sin la tabla de la clave, la agencia no tiene clave: no es motivo para fallar.
  if (ia.error && !sinTabla(ia.error)) throw ia.error

  const valor = a.data
    ? {
      existe: true,
      sinCobro: Boolean(a.data.sin_cobro),
      venceAt: lic.data?.[0]?.vence_at || null,
      clave: ia.data?.api_key ? { apiKey: ia.data.api_key, model: ia.data.model || null, last4: ia.data.last4 || '' } : null,
    }
    : vacio
  agenciasVistas.set(agenciaId, { valor, exp: Date.now() + CACHE_MS })
  return valor
}

/** ¿Puede entrar? La de la casa siempre; el resto, con licencia sin caducar. */
export function licenciaValida(estado, ahora = Date.now()) {
  if (!estado?.existe) return false
  if (estado.sinCobro) return true
  return Boolean(estado.venceAt) && Date.parse(estado.venceAt) > ahora
}

/** El 402 de «sin licencia»: el panel lo reconoce y abre la pantalla de pago. */
export function errorLicencia(administra = false) {
  const e = new Error(administra
    ? 'La licencia de tu agencia no está activa. Págala (97 €/año) para seguir usando HELM.'
    : 'La licencia de la agencia no está activa. Avisa a quien la administra para que la renueve.')
  e.statusCode = 402
  e.codigo = 'licencia'
  return e
}

/** Sin clave de Claude: lo que se enseña cuando un agente necesita la IA. */
export function errorSinClave() {
  const e = new Error('Tu agencia no tiene clave de Claude. Ponla en Perfiles → Agencia → Clave de Claude (o trabaja con HELM desde tu Claude con el conector).')
  e.statusCode = 412
  e.codigo = 'sin_clave_claude'
  return e
}

/**
 * Para validateAuth: si la agencia de quien llama no tiene licencia válida,
 * lanza el 402. La plataforma no pasa por aquí; una cuenta sin agencia, tampoco.
 * Si la base no contesta, no se echa a nadie por un fallo nuestro.
 */
export async function exigirLicencia(auth) {
  if (!auth || auth.plataforma) return
  let estado
  try {
    const agenciaId = auth.agenciaId || (auth.clientId ? await agenciaDelPerfil(auth.clientId) : null)
    if (!agenciaId) return
    estado = await estadoAgencia(agenciaId)
  } catch (err) {
    console.error('[licencia] no se pudo mirar la licencia; se deja pasar:', err?.message || err)
    return
  }
  // Una agencia que ya no existe no es cosa de la licencia: que lo diga quien toque.
  if (!estado.existe) return
  if (!licenciaValida(estado)) throw errorLicencia(auth.superadmin === true || auth.role === 'superadmin')
}

/** ¿Tiene licencia válida la agencia de este perfil? Si no se sabe (la base falla), sí. */
export async function perfilConLicencia(clientId) {
  try {
    const agenciaId = await agenciaDelPerfil(clientId)
    if (!agenciaId) return true
    const e = await estadoAgencia(agenciaId)
    return !e.existe || licenciaValida(e)
  } catch (err) {
    console.error('[licencia] no se pudo mirar la licencia del perfil:', err?.message || err)
    return true
  }
}

/**
 * La IA propia de la agencia de un perfil: { apiKey, model } si tiene clave y
 * licencia válida; si no, null. Para ./llm.js (el chat y lo que va por él).
 * Nunca lanza: sin poder mirarlo, null (y el perfil sigue con el modelo local).
 */
export async function iaDeAgencia(clientId) {
  try {
    const agenciaId = await agenciaDelPerfil(clientId)
    if (!agenciaId) return null
    const e = await estadoAgencia(agenciaId)
    if (!e.clave || !licenciaValida(e)) return null
    return { apiKey: e.clave.apiKey, model: e.clave.model }
  } catch {
    return null
  }
}

/**
 * Trae tu clave: los agentes llaman a Claude con claveHelm(); aquí se cambia
 * por la de la agencia del perfil `clientId` o, si no se dice, la de la
 * petición en curso (./contexto.js: la rellenan validateAuth, el worker, el
 * conector MCP y el bot de Telegram).
 *   · Una clave que no es la de HELM (la propia de un perfil) va tal cual.
 *   · Sin contexto (scripts del servidor) o perfil sin agencia (solo lo ve la
 *     plataforma), la de HELM.
 *   · La agencia de la casa: su clave si la tiene; si no, la de HELM.
 *   · Las demás: sin licencia válida, 402; sin clave, 412.
 * Lanza si no se puede saber de quién es la petición (la base falla): mejor
 * no llamar que hacerlo a cuenta de HELM.
 */
export async function claveParaLlamar(apiKey, { clientId = null } = {}) {
  const helm = claveHelm()
  if (!apiKey || !helm || apiKey !== helm) return apiKey
  // El perfil de la llamada, si lo dice; si no, el de la petición en curso.
  const c = clientId ? { clientId } : contexto()
  if (!c) return apiKey
  let estado
  try {
    const agenciaId = c.clientId ? (await agenciaDelPerfil(c.clientId)) || c.agenciaId || null : c.agenciaId || null
    if (!agenciaId) return apiKey
    estado = await estadoAgencia(agenciaId)
  } catch (err) {
    console.error('[licencia] no se pudo mirar la clave de la agencia:', err?.message || err)
    const e = new Error('No se ha podido comprobar la clave de Claude de tu agencia. Prueba en un momento.')
    e.statusCode = 503
    throw e
  }
  if (!estado.existe) return apiKey
  if (!estado.sinCobro && !licenciaValida(estado)) throw errorLicencia(false)
  if (estado.clave?.apiKey) return estado.clave.apiKey
  if (estado.sinCobro) return apiKey
  throw errorSinClave()
}

/**
 * ¿Pueden los agentes de este perfil usar Claude? (la clave de su agencia, o
 * la de HELM si es la casa). Para enseñarlo en el panel; nunca lanza.
 */
export async function hayClaude(clientId) {
  const helm = claveHelm()
  if (!helm) return false
  try { return Boolean(await claveParaLlamar(helm, { clientId })) } catch { return false }
}

/**
 * Antes de encolar un trabajo que necesita Claude (el estudio de contenido):
 * si la agencia de la petición en curso no tiene clave (ni es la de la casa),
 * 412 ahora, en vez de un fallo en el worker luego.
 */
export async function exigirClaveClaude() {
  const helm = claveHelm()
  if (helm) await claveParaLlamar(helm)
}

/**
 * Activa (o amplía) un año de licencia. Idempotente con `referencia` (el id de
 * la sesión de Stripe): el mismo pago no da dos años. Empieza al pagar o, si
 * aún le queda, cuando acabe la que tiene (ver activar_licencia, migración 125).
 * @returns {Promise<{ id: string, empiezaAt: string, venceAt: string, nueva: boolean }>}
 */
export async function activarLicencia({
  agenciaId, referencia = null, importe = 0, pagadaAt = new Date(), meses = MESES_LICENCIA,
  origen = 'stripe', email = null, nota = '', creadoPor = '',
}) {
  const { data, error } = await supabase.rpc('activar_licencia', {
    p_agencia: agenciaId, p_referencia: referencia, p_importe: importe,
    p_pagada: new Date(pagadaAt).toISOString(), p_meses: meses, p_origen: origen,
    p_email: email, p_nota: String(nota || '').slice(0, 200), p_created_by: creadoPor || '',
  })
  if (error) throw error
  olvidarAgencia(agenciaId)
  return { id: data?.id, empiezaAt: data?.empieza_at, venceAt: data?.vence_at, nueva: Boolean(data?.nueva) }
}

/** Las licencias de una agencia, la más nueva primero. */
export async function licenciasDe(agenciaId) {
  const { data, error } = await supabase.from('licenses')
    .select('id, estado, origen, importe_eur, empieza_at, vence_at, pagada_at, nota, created_at')
    .eq('agencia_id', agenciaId).order('vence_at', { ascending: false, nullsFirst: false }).limit(50)
  if (error) throw error
  return (data || []).map(l => ({
    id: l.id, estado: l.estado, origen: l.origen, importe: Number(l.importe_eur) || 0,
    empieza: l.empieza_at, vence: l.vence_at, pagada: l.pagada_at, nota: l.nota || '',
  }))
}

/** Guarda la clave de Claude de la agencia (ya comprobada). */
export async function guardarClaveAgencia(agenciaId, { apiKey, model = null, por = '' }) {
  const { error } = await supabase.from('agencia_ia').upsert({
    agencia_id: agenciaId, api_key: apiKey, model, last4: String(apiKey).slice(-4),
    updated_by: por || '', updated_at: new Date().toISOString(),
  }, { onConflict: 'agencia_id' })
  if (error) throw error
  olvidarAgencia(agenciaId)
}

/** Quita la clave de Claude de la agencia. */
export async function quitarClaveAgencia(agenciaId) {
  const { error } = await supabase.from('agencia_ia').delete().eq('agencia_id', agenciaId)
  if (error) throw error
  olvidarAgencia(agenciaId)
}
