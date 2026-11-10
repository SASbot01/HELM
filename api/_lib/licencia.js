// HELM — la licencia de cada agencia (desde el 2026-11-08).
//
// Una agencia paga 97 € al año (IVA incluido) y ya está: HELM no cobra por el
// uso de la IA, que la pone cada agencia con su propia clave (./claves-
// agencia.js). Sin licencia vigente, la agencia no entra: validateAuth
// (./auth.js) contesta 402 con `codigo: 'sin_licencia'` a todo menos a lo que
// hace falta para pagarla (api/creditos.js, con `sinLicencia: true`).
//
// La agencia de la casa (`sin_cobro`) no necesita licencia, y la plataforma
// entra siempre. Un perfil sin agencia (solo lo ve la plataforma) tampoco.
//
// El libro está en `licenses` (migrations/125_licencias.sql): una fila por
// periodo, vigente si vence después de ahora. Se alarga con la función
// extender_licencia, que no apunta dos veces la misma referencia (el id de la
// sesión de Stripe) y empieza el periodo nuevo cuando acaba el vigente.
//
// Uso:
//   import { licenciaDe, exigirLicencia, extenderLicencia, SIN_LICENCIA } from './_lib/licencia.js'
//   const l = await licenciaDe(agenciaId)   // { exenta, vigente, venceAt }
//   await exigirLicencia(agenciaId)          // 402 si no tiene
import { supabase } from '../lib/supabase.js'

export const SIN_LICENCIA = 'sin_licencia'
// Lo que cuesta un año, en euros con IVA. Se puede cambiar sin tocar código.
export const precioLicencia = () => {
  const n = Number(process.env.HELM_LICENCIA_EUR || 97)
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 97
}
export const MESES_LICENCIA = 12

// Se recuerda un minuto por agencia: se mira en cada petición del panel.
// Al pagar o conceder, olvidarLicencia() para que surta efecto ya.
const vistas = new Map() // agenciaId -> { valor, exp }
const CACHE_MS = 60_000

/** Para que un pago o una concesión surtan efecto sin esperar al minuto. */
export function olvidarLicencia(agenciaId) {
  if (agenciaId) vistas.delete(agenciaId)
  else vistas.clear()
}

/**
 * La licencia de una agencia: { exenta, vigente, venceAt }. `exenta`: la de la
 * casa (sin_cobro), que no la necesita. `venceAt`: el último vencimiento (ISO),
 * pasado o futuro, o null si nunca tuvo. Lanza si falla la base.
 */
export async function licenciaDe(agenciaId, { fresca = false } = {}) {
  if (!agenciaId) return { exenta: true, vigente: true, venceAt: null }
  const vista = vistas.get(agenciaId)
  if (!fresca && vista && vista.exp > Date.now()) return vista.valor
  const [{ data: agencia, error: e1 }, { data: ultima, error: e2 }] = await Promise.all([
    supabase.from('agencias').select('id, sin_cobro').eq('id', agenciaId).maybeSingle(),
    supabase.from('licenses').select('vence_at').eq('agencia_id', agenciaId)
      .order('vence_at', { ascending: false }).limit(1).maybeSingle(),
  ])
  if (e1) throw e1
  if (e2) throw e2
  const venceAt = ultima?.vence_at || null
  const valor = {
    exenta: Boolean(agencia?.sin_cobro),
    vigente: Boolean(agencia?.sin_cobro) || (venceAt != null && new Date(venceAt).getTime() > Date.now()),
    venceAt,
  }
  vistas.set(agenciaId, { valor, exp: Date.now() + CACHE_MS })
  return valor
}

/** ¿Puede usar HELM? true si exenta o vigente. */
export async function tieneLicencia(agenciaId) {
  const l = await licenciaDe(agenciaId)
  return l.exenta || l.vigente
}

/** El error que se enseña tal cual: 402 con `codigo: 'sin_licencia'`. */
export function errorSinLicencia(venceAt = null) {
  const e = new Error(venceAt
    ? 'La licencia de HELM de tu agencia ha caducado. Renuévala (97 €/año) para seguir entrando.'
    : 'Tu agencia aún no tiene licencia de HELM. Actívala (97 €/año) para empezar.')
  e.statusCode = 402
  e.codigo = SIN_LICENCIA
  return e
}

/**
 * Lanza el 402 de errorSinLicencia si la agencia no tiene licencia. Sin
 * agencia, no hace nada. Si la base no contesta, deja pasar (no se echa a
 * nadie por un fallo nuestro; queda en el log), como validateAuth con las
 * cuentas.
 */
export async function exigirLicencia(agenciaId) {
  if (!agenciaId) return
  let l
  try { l = await licenciaDe(agenciaId) } catch (err) {
    console.error('[licencia] no se pudo mirar la licencia; se deja pasar:', err?.message || err)
    return
  }
  if (!l.exenta && !l.vigente) throw errorSinLicencia(l.venceAt)
}

// La agencia de un perfil, recordada un minuto. Copia mínima de agenciaDe
// (./access.js): ese módulo importa ./auth.js, que importa este, y no se
// puede importar de vuelta.
const agenciasDePerfil = new Map() // clientId -> { id, exp }
export async function agenciaDelPerfil(clientId) {
  if (!clientId) return null
  const vista = agenciasDePerfil.get(clientId)
  if (vista && vista.exp > Date.now()) return vista.id
  const { data, error } = await supabase.from('clients').select('agencia_id').eq('id', clientId).maybeSingle()
  if (error) throw error
  const id = data?.agencia_id || null
  agenciasDePerfil.set(clientId, { id, exp: Date.now() + CACHE_MS })
  return id
}

/**
 * Alarga la licencia `meses` (por defecto un año) desde que acabe la vigente.
 * Devuelve el nuevo vencimiento (ISO), o null si `referencia` ya estaba
 * apuntada (no se suma dos veces). Lanza si falla la base.
 */
export async function extenderLicencia(agenciaId, { meses = MESES_LICENCIA, origen, referencia = null, euros = null, nota = '', por = '' } = {}) {
  const { data, error } = await supabase.rpc('extender_licencia', {
    p_agencia: agenciaId, p_meses: meses, p_origen: origen, p_referencia: referencia,
    p_euros: euros, p_nota: String(nota || '').slice(0, 200), p_por: String(por || '').slice(0, 200),
  })
  if (error) throw error
  olvidarLicencia(agenciaId)
  return data || null
}
