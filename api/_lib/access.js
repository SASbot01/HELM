// HELM — quién puede tocar qué perfil.
//
// Dos tipos de sesión:
//   · superadmin  → entra a cualquier perfil (el JWT lleva superadmin:true)
//   · cliente     → solo al suyo (el JWT lleva clientId)
//
// Cualquier endpoint que reciba un clientId debe pasar por aquí, o un cliente
// podría leer los datos de otro cambiando el id en la petición.
import { validateAuth } from './auth.js'

/**
 * Exige sesión válida con permiso sobre ese perfil.
 * @param {object} req
 * @param {string} clientId perfil al que se quiere acceder
 * @returns {Promise<{superadmin:boolean, clientId:string|null, email:string|null}>}
 * @throws error con statusCode 401 (sin sesión) o 403 (perfil ajeno)
 */
export async function requireProfileAccess(req, clientId) {
  const auth = await validateAuth(req, { required: true })
  if (auth.superadmin || auth.role === 'superadmin') return auth
  if (clientId && auth.clientId && auth.clientId === clientId) return auth

  const e = new Error('No tienes acceso a este perfil')
  e.statusCode = 403
  throw e
}
