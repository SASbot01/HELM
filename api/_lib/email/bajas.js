// HELM — Email marketing: quién no quiere más correos de un perfil.
//
// Una baja es del PERFIL, no de una campaña: quien se da de baja de una no
// recibe ninguna más de ese negocio. Entra por cuatro sitios: el enlace del pie
// (/api/email-baja), la baja de un clic que piden Gmail y Yahoo
// (List-Unsubscribe-Post, al mismo endpoint), el webhook de Resend (rebotes y
// quejas: /api/email-webhook) y el panel (Email marketing → Bajas).
//
// Registrar una baja es idempotente (la primera manda: su motivo y su fecha) y,
// además, corta en seco la secuencia de esa persona en las campañas en marcha.
import { supabase } from '../../lib/supabase.js'
import { todasLasFilas } from '../filas.js'

const MOTIVOS = { baja: 'Se ha dado de baja', rebote: 'Su correo rebota', queja: 'Ha marcado un correo como spam', manual: 'Baja apuntada a mano' }

/** Las bajas de un perfil (todas: pueden ser más de 1000), en un Set de correos en minúsculas. */
export async function bajasDe(clientId, db = supabase) {
  const filas = await todasLasFilas(() => db.from('helm_email_bajas').select('email').eq('client_id', clientId).order('email'))
  return new Set(filas.map(f => String(f.email).toLowerCase()))
}

/**
 * Apunta una baja. Nunca duplica ni pisa la primera.
 * @returns {{ nueva: boolean }}
 */
export async function registrarBaja({ clientId, email, motivo, origen, campanaId = null, detalle = null }, db = supabase) {
  const correo = String(email || '').trim().toLowerCase()
  if (!clientId || !correo) throw Object.assign(new Error('Falta el correo'), { statusCode: 400 })
  const { data, error } = await db.from('helm_email_bajas').upsert({
    client_id: clientId, email: correo, motivo, origen, campana_id: campanaId,
    detalle: detalle ? String(detalle).slice(0, 500) : null, creada_en: new Date().toISOString(),
  }, { onConflict: 'client_id,email', ignoreDuplicates: true }).select('email')
  if (error) throw error
  const nueva = Array.isArray(data) && data.length > 0

  // Que no le llegue el siguiente de ninguna secuencia.
  const { error: e2 } = await db.from('helm_email_destinatarios')
    .update({ estado: 'baja', updated_at: new Date().toISOString() })
    .eq('client_id', clientId).eq('email', correo).eq('estado', 'activo')
  if (e2) throw e2

  // Y que se vea en la ficha del contacto (lo que no sale, no hace caer la baja).
  if (nueva) {
    try {
      const { data: suyas } = await db.from('helm_email_destinatarios').select('contact_id')
        .eq('client_id', clientId).eq('email', correo).limit(20)
      const contactos = [...new Set((suyas || []).map(f => f.contact_id).filter(Boolean))].slice(0, 5)
      if (contactos.length) {
        await db.from('crm_activities').insert(contactos.map(contact_id => ({
          client_id: clientId, contact_id, type: 'note', title: 'Email marketing: baja',
          description: `${MOTIVOS[motivo] || 'Baja'} (${correo}). No recibirá más correos de las campañas.`,
          performed_by: 'Email marketing', performed_at: new Date().toISOString(),
        })))
      }
    } catch (err) {
      console.warn('[email] no se pudo apuntar la baja en el CRM:', err?.message)
    }
  }
  return { nueva }
}

/** ¿Está de baja ese correo en ese perfil? */
export async function estaDeBaja(clientId, email, db = supabase) {
  const { data, error } = await db.from('helm_email_bajas').select('email')
    .eq('client_id', clientId).eq('email', String(email || '').trim().toLowerCase()).maybeSingle()
  if (error) throw error
  return Boolean(data)
}
