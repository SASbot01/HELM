// HELM — qué perfiles salen en las listas del administrador.
//
// La plataforma recibe los perfiles de TODAS las agencias (perfilesVisibles en
// api/_lib/access.js): los necesita para abrirlos desde /plataforma. Pero en
// sus listas de siempre, el tablero de /admin y el selector de arriba, solo
// salen los de su agencia. Si no, cada agencia que se da de alta (o a la que
// se le desactivan los administradores, que no toca sus perfiles) acaba en su
// desplegable.
//
// Una agencia normal ya recibe solo los suyos del servidor: con ella no se
// filtra nada. Tampoco cuando no se sabe la agencia (un token de antes de las
// agencias): mejor una lista de más que dejar a alguien sin sus perfiles.

/** ¿Sale este perfil en las listas de esta agencia? */
export function esPropio(perfil, agencia) {
  if (!agencia?.plataforma || !agencia.id) return true
  return !perfil?.agencia_id || perfil.agencia_id === agencia.id
}

/** Los perfiles de la lista que son de la agencia (ver esPropio). */
export function perfilesPropios(clients, agencia) {
  return (clients || []).filter(c => esPropio(c, agencia))
}

/**
 * La agencia de la sesión de administrador, leída de su token:
 * { id, plataforma } o null si no hay token o no se entiende.
 * Un JWT no va cifrado, solo firmado: se lee sin verificar, porque solo decide
 * qué se pinta. Lo que cada sesión puede abrir lo decide el servidor.
 */
export function agenciaDeSesion(token = globalThis.localStorage?.getItem('bw_admin_jwt')) {
  try {
    const b64 = String(token || '').split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const bytes = Uint8Array.from(atob(b64), ch => ch.charCodeAt(0))
    const p = JSON.parse(new TextDecoder().decode(bytes))
    return { id: p.agenciaId || null, plataforma: p.plataforma === true }
  } catch {
    return null
  }
}
