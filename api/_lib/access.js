// HELM — quién puede tocar qué perfil.
//
// Tres tipos de sesión:
//   · plataforma  → entra a cualquier perfil (quien cuida del sistema)
//   · superadmin  → el administrador de una agencia: entra a los perfiles de
//                   SU agencia (el JWT lleva superadmin:true; la agencia sale
//                   de la tabla, ver validateAuth)
//   · cliente     → solo al suyo (el JWT lleva clientId)
//
// Cualquier endpoint que reciba un clientId debe pasar por aquí, o un cliente
// podría leer los datos de otro cambiando el id en la petición — y desde que
// hay agencias, una agencia los de otra.
import { supabase } from '../lib/supabase.js'
import { validateAuth } from './auth.js'
import { anotar } from './contexto.js'

// La agencia de cada perfil no cambia casi nunca: se recuerda un minuto.
const agenciaDePerfil = new Map() // clientId -> { agenciaId, exp }

/** La agencia a la que pertenece un perfil, o null si no existe o no tiene. */
export async function agenciaDe(clientId) {
  if (!clientId) return null
  const visto = agenciaDePerfil.get(clientId)
  if (visto && visto.exp > Date.now()) return visto.agenciaId
  const { data, error } = await supabase.from('clients').select('agencia_id').eq('id', clientId).maybeSingle()
  if (error) throw error
  const agenciaId = data?.agencia_id || null
  agenciaDePerfil.set(clientId, { agenciaId, exp: Date.now() + 60_000 })
  return agenciaId
}

/** Olvida lo recordado de un perfil (al crearlo o moverlo de agencia). */
export function olvidarPerfil(clientId) {
  agenciaDePerfil.delete(clientId)
}

/** ¿Puede esta sesión entrar a ese perfil? */
export async function puedeVerPerfil(auth, clientId) {
  if (!clientId) return false
  if (auth.plataforma) return true
  if (auth.superadmin || auth.role === 'superadmin') {
    return Boolean(auth.agenciaId) && (await agenciaDe(clientId)) === auth.agenciaId
  }
  return Boolean(auth.clientId) && auth.clientId === clientId
}

/**
 * ¿Administra esta sesión esa agencia? Su administrador (superadmin de esa
 * agencia) o la plataforma. Para lo que es de la agencia y no de un perfil
 * (las altas públicas, por ejemplo). Un acceso de cliente, nunca.
 */
export function administraAgencia(auth, agenciaId) {
  if (!agenciaId) return false
  if (auth.plataforma) return true
  return (auth.superadmin || auth.role === 'superadmin') && Boolean(auth.agenciaId) && auth.agenciaId === agenciaId
}

/**
 * Exige sesión válida con permiso sobre ese perfil.
 * @param {object} req
 * @param {string} clientId perfil al que se quiere acceder
 * @returns {Promise<object>} la sesión (ver validateAuth)
 * @throws error con statusCode 401 (sin sesión) o 403 (perfil ajeno)
 */
export async function requireProfileAccess(req, clientId) {
  const auth = await validateAuth(req, { required: true })
  if (await puedeVerPerfil(auth, clientId)) {
    // Lo que gaste en IA esta petición se cobra a la agencia DEL PERFIL, que
    // con la plataforma no tiene por qué ser la suya.
    anotar({ clientId, agenciaId: await agenciaDe(clientId) })
    return auth
  }

  const e = new Error('No tienes acceso a este perfil')
  e.statusCode = 403
  throw e
}

/**
 * Los perfiles que ve una sesión: `null` = todos (plataforma), o la lista de ids.
 */
export async function perfilesVisibles(auth) {
  if (auth.plataforma) return null
  if (auth.superadmin || auth.role === 'superadmin') {
    if (!auth.agenciaId) return []
    const { data, error } = await supabase.from('clients').select('id').eq('agencia_id', auth.agenciaId)
    if (error) throw error
    return (data || []).map(c => c.id)
  }
  return auth.clientId ? [auth.clientId] : []
}
