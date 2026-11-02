// HELM — Email marketing: lo que avisa Resend de cada correo (su webhook).
//
// Resend firma sus webhooks con Svix: cabeceras svix-id, svix-timestamp y
// svix-signature («v1,<base64> v1,<base64>…»), y la firma es
// HMAC-SHA256(«<id>.<timestamp>.<cuerpo tal cual>») con el secreto «whsec_…»
// decodificado de base64. Cada perfil tiene el suyo (se pega en Ajustes y vive
// con la clave, en user_integrations).
//
// Qué se hace con cada aviso (solo de correos que mandó una campaña: se buscan
// por el id de Resend, y lo que no se encuentra se ignora):
//   · email.delivered  → el envío pasa a «entregado»
//   · email.bounced    → «rebotado»; si el rebote es definitivo, baja (motivo rebote)
//   · email.complained → «queja» y baja (lo marcó como spam: no se le escribe más)
import { createHmac, timingSafeEqual } from 'node:crypto'
import { supabase } from '../../lib/supabase.js'
import { registrarBaja } from './bajas.js'

const TOLERANCIA_S = 5 * 60

/** ¿La firma Svix de este cuerpo es buena? `ahora` en ms (para los tests). */
export function firmaSvixValida({ secreto, id, timestamp, firma, cuerpo, ahora = Date.now() }) {
  if (!secreto || !id || !timestamp || !firma || cuerpo == null) return false
  const ts = Number(timestamp)
  if (!Number.isFinite(ts) || Math.abs(ahora / 1000 - ts) > TOLERANCIA_S) return false
  const base = String(secreto).startsWith('whsec_') ? String(secreto).slice(6) : String(secreto)
  let clave
  try { clave = Buffer.from(base, 'base64') } catch { return false }
  if (!clave.length) return false
  const crudo = Buffer.isBuffer(cuerpo) ? cuerpo : Buffer.from(String(cuerpo), 'utf8')
  const esperada = createHmac('sha256', clave).update(`${id}.${timestamp}.`).update(crudo).digest()
  return String(firma).split(' ').some((parte) => {
    const [version, valor] = parte.split(',')
    if (version !== 'v1' || !valor) return false
    const dada = Buffer.from(valor, 'base64')
    return dada.length === esperada.length && timingSafeEqual(dada, esperada)
  })
}

/** Firma un cuerpo como lo haría Resend (para los tests y para probarlo a mano). */
export function firmaSvix({ secreto, id, timestamp, cuerpo }) {
  const clave = Buffer.from(String(secreto).replace(/^whsec_/, ''), 'base64')
  return `v1,${createHmac('sha256', clave).update(`${id}.${timestamp}.${cuerpo}`).digest('base64')}`
}

/** Aplica un aviso de Resend a los envíos y las bajas de ese perfil. */
export async function procesaEvento(clientId, evento, db = supabase) {
  const tipo = String(evento?.type || '')
  const resendId = String(evento?.data?.email_id || '')
  if (!['email.delivered', 'email.bounced', 'email.complained'].includes(tipo) || !resendId) return { ignorado: true }
  const { data: envio, error } = await db.from('helm_email_envios').select('id, campana_id, email, estado')
    .eq('client_id', clientId).eq('resend_id', resendId).maybeSingle()
  if (error) throw error
  if (!envio) return { ignorado: true }
  const cuando = new Date().toISOString()

  if (tipo === 'email.delivered') {
    // Solo sube de «enviado»: un rebote o una queja que llegaron antes mandan.
    const { error: e } = await db.from('helm_email_envios').update({ estado: 'entregado', actualizado_en: cuando })
      .eq('id', envio.id).eq('estado', 'enviado')
    if (e) throw e
    return { estado: 'entregado' }
  }

  if (tipo === 'email.bounced') {
    const rebote = evento.data?.bounce || {}
    const motivo = String(rebote.message || rebote.subType || 'Rebotado').slice(0, 900)
    const { error: e } = await db.from('helm_email_envios').update({ estado: 'rebotado', error: motivo, actualizado_en: cuando })
      .eq('id', envio.id).neq('estado', 'queja')
    if (e) throw e
    // Un rebote temporal (buzón lleno, servidor caído) no es una dirección mala.
    if (String(rebote.type || '').toLowerCase() !== 'transient') {
      await registrarBaja({ clientId, email: envio.email, motivo: 'rebote', origen: 'webhook', campanaId: envio.campana_id, detalle: motivo }, db)
    }
    return { estado: 'rebotado' }
  }

  const { error: e } = await db.from('helm_email_envios').update({ estado: 'queja', actualizado_en: cuando }).eq('id', envio.id)
  if (e) throw e
  await registrarBaja({ clientId, email: envio.email, motivo: 'queja', origen: 'webhook', campanaId: envio.campana_id, detalle: 'Marcado como spam' }, db)
  return { estado: 'queja' }
}
