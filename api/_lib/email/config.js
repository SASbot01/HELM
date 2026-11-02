// HELM — Email marketing: dónde viven la clave de Resend y los ajustes.
//
// La clave de la API y el secreto de firma del webhook van en
// user_integrations (service='resend'), igual que la clave de Anthropic del
// perfil (api/_lib/anthropic.js) o el token de Calendly: la tabla está en
// SECRETAS de la pasarela y sin permisos para el navegador. Al panel solo le
// llegan los cuatro últimos caracteres.
//
// Lo que no es secreto (remitente, responder a, empresa y dirección del pie
// legal) va en helm_email_ajustes (migración 119).
import { supabase } from '../../lib/supabase.js'

export const SERVICIO = 'resend'

export async function getResendConfig(db, clientId) {
  const { data, error } = await db
    .from('user_integrations')
    .select('id, config, enabled, updated_at')
    .eq('client_id', clientId).eq('service', SERVICIO)
    .is('member_id', null)
    .maybeSingle()
  if (error) throw error
  return data || null
}

export async function saveResendConfig(db, clientId, config, enabled = true) {
  const existente = await getResendConfig(db, clientId)
  const fila = { client_id: clientId, service: SERVICIO, config, enabled, updated_at: new Date().toISOString() }
  if (existente) {
    const { error } = await db.from('user_integrations').update(fila).eq('id', existente.id)
    if (error) throw error
  } else {
    const { error } = await db.from('user_integrations').insert(fila)
    if (error) throw error
  }
}

export async function deleteResendConfig(db, clientId) {
  const existente = await getResendConfig(db, clientId)
  if (!existente) return false
  const { error } = await db.from('user_integrations').delete().eq('id', existente.id)
  if (error) throw error
  return true
}

/** La clave y el secreto del webhook del perfil (solo para el servidor), o null. */
export async function credencialesDe(clientId, db = supabase) {
  const fila = await getResendConfig(db, clientId)
  const cfg = fila?.enabled === false ? {} : fila?.config || {}
  if (!cfg.apiKey && !cfg.webhookSecret) return null
  return { apiKey: cfg.apiKey || null, webhookSecret: cfg.webhookSecret || null }
}

/** Lo que puede ver el panel de la conexión: si hay clave y sus cuatro últimos. */
export function conexionVisible(fila) {
  const cfg = fila?.enabled === false ? {} : fila?.config || {}
  return {
    clave: { conectada: Boolean(cfg.apiKey), last4: cfg.apiKey ? (cfg.last4 || null) : null },
    webhook: { conectado: Boolean(cfg.webhookSecret), last4: cfg.webhookSecret ? (cfg.webhookLast4 || null) : null },
    actualizada: fila?.updated_at || null,
  }
}

export const AJUSTES_VACIOS = {
  remitente_nombre: null, remitente_email: null, responder_a: null,
  empresa: null, direccion: null, dominios: [], comprobado_en: null, updated_at: null,
}

export async function leerAjustes(clientId, db = supabase) {
  const { data, error } = await db.from('helm_email_ajustes').select('*').eq('client_id', clientId).maybeSingle()
  if (error) throw error
  return { ...AJUSTES_VACIOS, ...(data || {}) }
}

/** Los ajustes → el remitente con el que sale una campaña (la foto que se guarda al lanzar). */
export function remitenteDeAjustes(a) {
  return {
    nombre: a?.remitente_nombre || '',
    email: a?.remitente_email || '',
    responderA: a?.responder_a || '',
    empresa: a?.empresa || '',
    direccion: a?.direccion || '',
  }
}

/** Qué falta para poder mandar (vacío = nada). */
export function faltaParaMandar(ajustes, conexion) {
  const faltan = []
  if (!conexion?.clave?.conectada) faltan.push('la clave de Resend')
  if (!ajustes?.remitente_email) faltan.push('el correo del remitente')
  if (!ajustes?.empresa) faltan.push('el nombre de la empresa para el pie legal')
  if (!ajustes?.direccion) faltan.push('la dirección postal para el pie legal')
  return faltan
}
