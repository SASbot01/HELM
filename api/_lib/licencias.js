// HELM — licencias de agencia.
//
// Modelo (nov-2026): una agencia paga 97 €/año y ESO le da acceso a HELM. No
// hay créditos ni cobro por uso; la IA la pone la propia agencia con su clave
// (ver claveClaudeDeAgencia en ./creditos.js).
//
// Una licencia pertenece a una AGENCIA y tiene `vence_at`. Una agencia tiene
// ACCESO si:
//   · es de la casa (agencias.sin_cobro) — nunca se bloquea; o
//   · tiene una licencia `canjeada` cuyo `vence_at` está en el futuro (o es
//     nulo = sin caducidad, cortesías).
//
// La vía normal es el pago por Stripe (api/creditos.js, action=licencia), que
// llama a activarLicencia(+1 año). Las cortesías son códigos que genera la
// plataforma (api/plataforma.js) y canjea una agencia (canjearCodigo).
//
// FAIL-OPEN a propósito: si la tabla aún no existe (migración sin aplicar) o la
// base falla, se da la agencia por ACTIVA. Nunca se deja a nadie fuera por un
// fallo nuestro — el bloqueo solo puede venir de una licencia vencida de verdad.
import { supabase } from '../lib/supabase.js'

export const PRECIO_LICENCIA_EUR = Number(process.env.HELM_LICENCIA_EUR || 97)
export const MESES_LICENCIA = Math.max(1, Math.floor(Number(process.env.HELM_LICENCIA_MESES || 12)))

function falla(msg, code = 400) {
  const e = new Error(msg)
  e.statusCode = code
  return e
}

// La tabla/columna todavía no existe (migración sin aplicar) u otro fallo de
// esquema: no debe tumbar el acceso.
const sinTabla = (error) =>
  ['42P01', 'PGRST205', '42703', 'PGRST204'].includes(error?.code) ||
  /relation .* does not exist|could not find the table|column .* does not exist/i.test(error?.message || '')

// Estado de la licencia recordado unos segundos: se mira en cada arranque del panel.
const cache = new Map() // agenciaId -> { info, exp }
export function olvidarLicencia(agenciaId) {
  if (agenciaId) cache.delete(agenciaId)
  else cache.clear()
}

/** La licencia canjeada más lejana de la agencia (la que da el acceso), o null. */
async function licenciaVigente(agenciaId) {
  const { data, error } = await supabase.from('licenses')
    .select('id, vence_at, estado, referencia')
    .eq('agencia_id', agenciaId).eq('estado', 'canjeada')
    .order('vence_at', { ascending: false, nullsFirst: false })
    .limit(1).maybeSingle()
  if (error) throw error
  return data || null
}

/**
 * ¿Tiene la agencia acceso? { activa, venceAt, motivo }.
 *   motivo: 'casa' (sin_cobro) | 'licencia' | 'vencida' | 'sin-licencia' |
 *           'sin-tabla' | 'error-fail-open' | 'sin-agencia'
 * Las de la casa (sin_cobro) y los fallos de base dan activa=true.
 */
export async function licenciaActivaDeAgencia(agenciaId) {
  if (!agenciaId) return { activa: false, venceAt: null, motivo: 'sin-agencia' }
  const visto = cache.get(agenciaId)
  if (visto && visto.exp > Date.now()) return visto.info

  let info
  try {
    const { data: ag, error: eAg } = await supabase.from('agencias')
      .select('sin_cobro').eq('id', agenciaId).maybeSingle()
    if (eAg) throw eAg
    if (ag?.sin_cobro) {
      info = { activa: true, venceAt: null, motivo: 'casa' }
    } else {
      const lic = await licenciaVigente(agenciaId)
      const vence = lic?.vence_at ? new Date(lic.vence_at) : null
      const activa = Boolean(lic) && (vence == null || vence.getTime() > Date.now())
      info = { activa, venceAt: lic?.vence_at || null, motivo: activa ? 'licencia' : (lic ? 'vencida' : 'sin-licencia') }
    }
  } catch (err) {
    if (sinTabla(err)) info = { activa: true, venceAt: null, motivo: 'sin-tabla' }
    else {
      console.error('[licencias] no se pudo leer la licencia; se da por activa:', err?.message || err)
      info = { activa: true, venceAt: null, motivo: 'error-fail-open' }
    }
  }
  cache.set(agenciaId, { info, exp: Date.now() + 30_000 })
  return info
}

/**
 * Activa o renueva la licencia de una agencia: suma `meses` a partir de HOY o
 * del vencimiento vigente (lo que sea mayor), de modo que renovar antes de
 * tiempo no pierde días. Idempotente por `referencia` (id de sesión de Stripe):
 * con la misma referencia no se renueva dos veces aunque lleguen la vuelta del
 * navegador y el webhook. Devuelve { venceAt } o la fila ya existente.
 */
export async function activarLicencia(agenciaId, { meses = MESES_LICENCIA, referencia = null, origen = 'stripe', nota = '', redeemedBy = '' } = {}) {
  if (!agenciaId) throw falla('Falta la agencia', 400)

  // Idempotencia: si ya se aplicó esta referencia, no se vuelve a sumar.
  if (referencia) {
    const { data: ya, error } = await supabase.from('licenses')
      .select('id, vence_at').eq('referencia', referencia).maybeSingle()
    if (!error && ya) return { venceAt: ya.vence_at, idempotente: true }
  }

  const actual = await licenciaVigente(agenciaId)
  const ahora = new Date()
  const vigente = actual?.vence_at ? new Date(actual.vence_at) : null
  const base = vigente && vigente > ahora ? vigente : ahora
  const vence = new Date(base)
  vence.setMonth(vence.getMonth() + meses)
  const venceAt = vence.toISOString()

  if (actual?.id) {
    // Se extiende la misma fila y se le ata la referencia de este pago.
    const patch = { vence_at: venceAt, redeemed_at: ahora.toISOString() }
    if (referencia) patch.referencia = referencia
    if (redeemedBy) patch.redeemed_by = redeemedBy
    const { error } = await supabase.from('licenses').update(patch).eq('id', actual.id)
    if (error) throw error
  } else {
    const { error } = await supabase.from('licenses').insert({
      estado: 'canjeada', agencia_id: agenciaId, vence_at: venceAt,
      referencia: referencia || null, redeemed_by: redeemedBy || null,
      redeemed_at: ahora.toISOString(), nota: nota || '', created_by: origen,
    })
    if (error) throw error
  }
  olvidarLicencia(agenciaId)
  return { venceAt }
}

/**
 * Canjea un código de cortesía (HELM-XXXX-…): lo reclama de forma atómica
 * (update … where estado='disponible') y lo ata a la agencia. Si el código no
 * traía `vence_at`, se le da 1 año desde hoy. Devuelve el estado de la licencia.
 */
export async function canjearCodigo(agenciaId, code, { redeemedBy = '' } = {}) {
  if (!agenciaId) throw falla('Falta la agencia', 400)
  const codigo = String(code || '').trim().toUpperCase().slice(0, 64)
  if (!codigo) throw falla('Falta el código', 400)

  const { data: lic, error } = await supabase.from('licenses')
    .update({ estado: 'canjeada', agencia_id: agenciaId, redeemed_by: redeemedBy || null, redeemed_at: new Date().toISOString() })
    .eq('estado', 'disponible').eq('code', codigo)
    .select('id, vence_at').maybeSingle()
  if (error) throw error
  if (!lic) throw falla('Código no válido o ya utilizado', 403)

  if (!lic.vence_at) {
    const vence = new Date()
    vence.setMonth(vence.getMonth() + MESES_LICENCIA)
    await supabase.from('licenses').update({ vence_at: vence.toISOString() }).eq('id', lic.id)
  }
  olvidarLicencia(agenciaId)
  return licenciaActivaDeAgencia(agenciaId)
}
