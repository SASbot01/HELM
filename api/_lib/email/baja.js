// HELM — Email marketing: el enlace para darse de baja.
//
// Cada correo lleva uno (en el pie y en la cabecera List-Unsubscribe). Abre
// /api/email-baja?t=<token> sin sesión: el token dice de qué perfil y de qué
// correo se trata, y va firmado (HMAC-SHA256) para que nadie pueda dar de baja
// a otro cambiando la dirección en la URL, ni inventarse bajas en otro perfil.
//
// No caduca a propósito: la ley pide que darse de baja funcione siempre, también
// desde un correo de hace un año. Es el mismo token para todas las campañas de
// ese perfil y esa persona (la baja es del perfil, no de una campaña), y sale
// igual cada vez: un reintento al mandar tiene que dar el mismo cuerpo.
//
// La clave sale de EMAIL_BAJA_SECRET o, si no está, de JWT_SECRET, derivada con
// una etiqueta propia para que una firma de baja no valga para nada más. Sin
// ninguna de las dos no se firma nada, y sin enlace de baja no se manda nada.
import { createHmac, timingSafeEqual } from 'node:crypto'

const ETIQUETA = 'helm-email-baja-v1'
const BYTES_FIRMA = 16

function clave() {
  const secreto = process.env.EMAIL_BAJA_SECRET || process.env.JWT_SECRET
  if (!secreto) {
    throw Object.assign(new Error('Falta EMAIL_BAJA_SECRET (o JWT_SECRET) en el servidor: sin él no hay enlace de baja, y sin enlace de baja no se manda ningún correo.'), { statusCode: 500 })
  }
  return createHmac('sha256', secreto).update(ETIQUETA).digest()
}

const firma = (cuerpo) => createHmac('sha256', clave()).update(cuerpo).digest().subarray(0, BYTES_FIRMA)

/** El token de baja de un correo en un perfil. */
export function tokenBaja(clientId, email) {
  const cuerpo = Buffer.from(`${clientId}\n${String(email).trim().toLowerCase()}`, 'utf8').toString('base64url')
  return `${cuerpo}.${firma(cuerpo).toString('base64url')}`
}

/** El token → { clientId, email }, o null si no es nuestro o lo han tocado. */
export function leeTokenBaja(token) {
  const t = String(token ?? '')
  if (t.length > 800) return null
  const [cuerpo, sello, ...resto] = t.split('.')
  if (!cuerpo || !sello || resto.length || !/^[A-Za-z0-9_-]+$/.test(cuerpo) || !/^[A-Za-z0-9_-]+$/.test(sello)) return null
  const dada = Buffer.from(sello, 'base64url')
  const buena = firma(cuerpo)
  if (dada.length !== buena.length || !timingSafeEqual(dada, buena)) return null
  const [clientId, email, ...mas] = Buffer.from(cuerpo, 'base64url').toString('utf8').split('\n')
  if (mas.length || !clientId || !email) return null
  return { clientId, email }
}

/** Dónde vive el panel (lo mismo que usan Stripe, Woo y las altas). */
export const urlPublica = () => (process.env.HELM_PUBLIC_URL || 'https://helm.s4sf.net').trim().replace(/\/+$/, '')

/** El enlace de baja completo, para el pie y la cabecera List-Unsubscribe. */
export const enlaceBaja = (clientId, email, base = urlPublica()) => `${base}/api/email-baja?t=${tokenBaja(clientId, email)}`
