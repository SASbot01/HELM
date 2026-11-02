// HELM — Qué hacer con un 401.
//
// Un 401 no siempre es la sesión de HELM: Instagram, Google, Meta Ads,
// Calendly o Telegram también contestan 401 cuando su permiso caduca, y el
// servidor lo deja pasar tal cual. Si el panel cerrase la sesión con cualquier
// 401, pulsar «Sincronizar» con el Instagram caducado te echaba al login sin
// decirte qué pasaba (y al volver a entrar, lo mismo).
//
// Así que antes de cerrar se pregunta a /api/admin?action=verify, que solo
// mira la sesión (la misma comprobación que el resto de endpoints). Si la
// sesión vale, el 401 era de la conexión y la vista enseña su mensaje. Si no
// se puede preguntar (sin red), tampoco se cierra: mejor un error en pantalla
// que perder lo que estabas haciendo.

export function leeSesion() {
  try { return globalThis.localStorage?.getItem('bw_admin_jwt') || null } catch { return null }
}

export function cierraSesion() {
  try {
    globalThis.localStorage?.removeItem('bw_admin_jwt')
    globalThis.localStorage?.removeItem('bw_superadmin')
    globalThis.localStorage?.removeItem('bw_client')
  } catch { /* sin almacenamiento */ }
  if (typeof window !== 'undefined' && window.location) window.location.href = '/login'
}

/** true solo si el servidor confirma que la sesión ya no vale. */
export async function sesionMuerta(token = leeSesion()) {
  if (!token) return true
  try {
    const r = await fetch('/api/admin?action=verify', { headers: { Authorization: `Bearer ${token}` } })
    return r.status === 401
  } catch {
    return false
  }
}

/**
 * Para los clientes del panel ante un 401: cierra la sesión si de verdad ha
 * caducado y devuelve si lo ha hecho.
 */
export async function tras401(token = leeSesion()) {
  if (!(await sesionMuerta(token))) return false
  cierraSesion()
  return true
}
