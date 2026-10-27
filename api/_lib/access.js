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
  olvidarVisibles()
}

// Los perfiles de cada agencia, unos segundos: la pasarela los pide en CADA
// petición a /api/db de un administrador. Se olvidan al escribir en `clients`.
const perfilesDeAgencia = new Map() // agenciaId -> { ids, exp }
export function olvidarVisibles() {
  perfilesDeAgencia.clear()
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
    const visto = perfilesDeAgencia.get(auth.agenciaId)
    if (visto && visto.exp > Date.now()) return visto.ids
    const { data, error } = await supabase.from('clients').select('id').eq('agencia_id', auth.agenciaId)
    if (error) throw error
    const ids = (data || []).map(c => c.id)
    perfilesDeAgencia.set(auth.agenciaId, { ids, exp: Date.now() + 15_000 })
    return ids
  }
  return auth.clientId ? [auth.clientId] : []
}

// ── Créditos: quién ve el saldo y quién puede gastarlo ─────────────────────

/**
 * ¿Puede esta sesión ver el saldo de la agencia de ese perfil? Solo quien la
 * administra (su superadmin) y la plataforma. El saldo es de la AGENCIA y
 * cubre a todos sus perfiles: un acceso de cliente o alguien del equipo del
 * perfil (closer, editor…) entra al perfil, pero el saldo no es cosa suya.
 * No mira si entra al perfil: eso es requireProfileAccess, que va antes.
 *
 * Uso (lo usan los agentes que cobran y GET /api/creditos?action=precios):
 *   const auth = await requireProfileAccess(req, clientId)
 *   const verSaldo = await puedeVerSaldo(auth, clientId)
 *   // el 402 con las cifras, solo a quien administra; al resto, el genérico
 *   await exigirImporte(clientId, precio, { detalle: verSaldo })
 *   return res.json({ ...hecho, saldo: verSaldo ? saldo : null })
 */
export async function puedeVerSaldo(auth, clientId) {
  if (!auth || !clientId) return false
  if (auth.plataforma) return true
  return administraAgencia(auth, await agenciaDe(clientId))
}

// Copia de NIVELES_TOTALES y DEFAULT_VISIBLE de src/helm/permisos.js (como
// api/estudio-contenido.js): aquel archivo tira del cliente de Supabase del
// navegador y api/ no lo importa. Si cambian allí, hay que cambiarlos aquí.
const NIVELES_TOTALES = ['admin,ceo,director', 'admin']
const DEFAULT_VISIBLE = {
  closer: ['crm', 'diario', 'tareas'],
  setter: ['crm', 'diario', 'tareas'],
  csm: ['crm', 'diario', 'tareas', 'formularios', 'biblioteca'],
  editor: ['contenido', 'tareas', 'biblioteca', 'equipos-ia', 'metricas'],
  otro: ['tareas'],
}

// La sección del panel donde están los agentes que gastan créditos (Editor de
// reels, Portadas, Trial reels, el Estudio de Instagram…): la entrada
// «Agentes» del menú (src/helm/views/Agentes.jsx), cuya CLAVE sigue siendo
// 'contenido' a propósito (ver NAV en src/helm/HelmApp.jsx). 'equipos-ia' es
// otra cosa: el módulo «Equipos IA», que nace apagado y no abre estos agentes.
export const SECCION_AGENTES = 'contenido'

/**
 * ¿Puede esta sesión USAR en este perfil los agentes que gastan créditos de la
 * agencia (lanzar un vídeo en el Editor, generar una portada o un fondo con IA,
 * crear variantes en Trial reels…)? Los endpoints se pueden llamar a mano, y
 * sin esto un closer o un setter que no ven los agentes en el menú podrían
 * gastar el saldo de toda la agencia.
 *
 * La misma escalera que sigue el panel para enseñar la sección de los agentes
 * (HelmApp → puede(SECCION_AGENTES), con seccionEncendida y puedeVer de
 * src/helm/permisos.js), y la de puedeVerMetricas en api/estudio-contenido.js:
 *   1. si el negocio la ha apagado en Secciones, nadie;
 *   2. la plataforma, el administrador de la agencia y los niveles de acceso
 *      total del perfil, siempre;
 *   3. quien no tiene oficio en el perfil (quien lo montó, o un acceso de antes
 *      de los roles) y el dueño, también;
 *   4. el resto, si su rol la tiene visible: los permisos guardados del perfil
 *      o, si no hay, DEFAULT_VISIBLE (de serie, solo el editor).
 *
 * Uso, justo después de requireProfileAccess (esto no vuelve a mirar si entra
 * al perfil) y ANTES de leer un cuerpo en crudo o de apartar saldo:
 *   const auth = await requireProfileAccess(req, clientId)
 *   if (!(await puedeUsarAgentes(auth, clientId))) {
 *     return res.status(403).json({ error: 'Tu rol no puede usar los agentes de este perfil.' })
 *   }
 * Lanza si falla la base al mirar el oficio: no se deja gastar a ciegas.
 */
export async function puedeUsarAgentes(auth, clientId) {
  if (!auth || !clientId) return false
  // Sin la tabla o sin la columna, como el panel: todo encendido y los
  // permisos de serie.
  const { data, error } = await supabase.from('helm_permissions')
    .select('sections, visible').eq('client_id', clientId).maybeSingle()
  const permisos = error ? {} : (data || {})
  if (permisos.sections?.[SECCION_AGENTES] === false) return false

  if (auth.plataforma || auth.superadmin || auth.role === 'superadmin') return true
  if (NIVELES_TOTALES.includes(auth.nivel)) return true

  // El oficio (closer, editor…) no va en el token: se mira en su ficha de este
  // perfil. Una sesión sin usuario (un acceso suelto) no tiene ficha: sin oficio.
  let rol = null
  if (auth.userId) {
    const { data: persona, error: eRol } = await supabase.from('helm_team')
      .select('role').eq('login_id', auth.userId).eq('client_id', clientId).maybeSingle()
    if (eRol) throw eRol
    rol = persona?.role || null
  }
  if (!rol || rol === 'dueno') return true
  // Como loadPermisos: si el perfil guardó permisos, mandan los suyos; el rol
  // que no aparezca en ellos se queda con los de serie.
  const guardados = permisos.visible && typeof permisos.visible === 'object' && Object.keys(permisos.visible).length
    ? permisos.visible : DEFAULT_VISIBLE
  const lista = guardados[rol] ?? DEFAULT_VISIBLE[rol] ?? []
  return Array.isArray(lista) && lista.includes(SECCION_AGENTES)
}
