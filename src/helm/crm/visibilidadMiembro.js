// HELM — CRM · qué pipelines ve cada miembro del equipo.
//
// En WebSeller cada «call caller» tiene un pipeline con su nombre («Ortega»,
// «aron», «Alex Abellaneda»). Un miembro solo debe ver EL SUYO; el dueño, un
// administrador y el propietario siguen viéndolo todo —si no, quien lleva el
// negocio se queda ciego—. La asociación es el NOMBRE, no un id aparte: quien
// administra el equipo pone al pipeline el nombre que ya ve en Equipo, sin un
// campo nuevo que mantener.
//
// Esto es el recorte del navegador. El control de acceso real de HELM lo hace
// la app (entra con la anon key), igual que la matriz de permisos de
// permisos.js. Nota para Alex: existe una rama (cursor/crm-pipeline-visibilidad)
// que además lo fuerza en la pasarela del servidor; conviene reconciliarlas.

// Nombre reducido a lo que identifica a la persona: sin acentos, sin mayúsculas
// y sin adornos. «~Ortega» y «Ortega» son el mismo; «Alex» NO es «Alex
// Abellaneda» (no es un «contiene», es igualdad del núcleo). Misma idea que
// helm_norm_nombre() en la migración 130, para que base y navegador coincidan.
export function nucleoNombre(valor) {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/ñ/g, 'n')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/ +/g, ' ')
}

export function nombresCoinciden(a, b) {
  const na = nucleoNombre(a)
  const nb = nucleoNombre(b)
  return na.length > 0 && na === nb
}

/**
 * ¿Esta sesión ve TODOS los pipelines del perfil?
 *
 * Sí para el superadmin, para quien manda en todo (propietario/admin, o una
 * sesión antigua sin rol) y para el oficio de dueño. Sin ficha de equipo
 * tampoco se recorta: esconderle el CRM a quien no sabemos quién es sería
 * dejar fuera al propio dueño.
 *
 *   sesion  → lo que devuelve sesionHelm() en permisos.js
 *   persona → su fila de helm_team en este perfil (o null)
 */
export function veTodos(sesion, persona) {
  if (!sesion) return true
  if (sesion.esSuperadmin || sesion.mandaEnTodo) return true
  // Sin ficha de equipo no se recorta: acceso suelto o sesión antigua sin rol.
  if (!sesion.helmTeamId) return true
  // Con ficha de equipo, solo ve todo el oficio de dueño. Mientras la ficha aún
  // no ha cargado (persona null) se recorta por defecto: más vale una pantalla
  // vacía un instante que enseñarle los pipelines de otros al entrar.
  if (persona && (!persona.role || persona.role === 'dueno')) return true
  return false
}

/**
 * Los pipelines que esta sesión puede ver.
 *
 *   pipelines → lista de loadPipelines() (con {id, name, isDefault})
 *   sesion    → sesionHelm()
 *   persona   → fila de helm_team de la sesión (para su nombre y rol)
 *
 * Si ve todos, devuelve la lista entera. Si es un miembro, devuelve solo los
 * pipelines cuyo nombre es el suyo. Puede quedar vacía: un miembro sin pipeline
 * propio no ve tratos de otros, que es justo lo que se pide.
 */
export function pipelinesVisibles(pipelines, sesion, persona) {
  const lista = Array.isArray(pipelines) ? pipelines : []
  if (veTodos(sesion, persona)) return lista
  const nombre = persona?.name || sesion?.nombre || ''
  return lista.filter(p => nombresCoinciden(nombre, p.name))
}
