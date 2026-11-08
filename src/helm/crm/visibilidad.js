// HELM — qué pipelines de CRM ve cada persona.
//
// En un perfil con un pipeline por cold caller (cada uno se llama como la
// persona: «Ortega», «aron», «Alex Abellaneda»), un miembro del equipo solo
// debe ver el suyo. Propietario, Administrador y el oficio de dueño siguen
// viendo el perfil entero: si no, el que lleva el negocio se queda ciego.
//
// La asociación es el nombre, no un id guardado aparte. Quien administra el
// equipo pone el pipeline con el nombre que ya ve en Equipo; no hay un campo
// nuevo que mantener. El emparejamiento es flexible a propósito: da igual
// mayúsculas, tildes, espacios de más o un adorno delante («~Ortega» y
// «Ortega» son la misma persona). No es un «contiene»: «Alex» no ve el
// pipeline «Alex Abellaneda», ni «Ana» el de «Mariana».

const ID_NINGUNO = '00000000-0000-0000-0000-000000000000'
const ID_SEGURO = /^[0-9a-zA-Z_-]+$/
const TROZO_IN = 80

/** Nivel de acceso que manda sobre el perfil: propietario, administrador, o un
 *  rol de dueño ya guardado como ceo/director. */
export function esAccesoTotal(nivel) {
  return String(nivel || '')
    .split(',')
    .map(s => s.trim())
    .some(s => s === 'admin' || s === 'ceo' || s === 'director')
}

/**
 * ¿Esta sesión ve todos los pipelines?
 *
 * Sin ficha en el equipo no se recorta: es quien montó el negocio o un acceso
 * suelto de antes de los roles, y esconderle el CRM sería dejar fuera al dueño.
 * `personas` son las fichas de helm_team de esta sesión en los perfiles que
 * está mirando.
 */
export function veTodosLosPipelines(auth, personas) {
  if (!auth) return true
  if (auth.plataforma || auth.superadmin || auth.role === 'superadmin') return true
  if (esAccesoTotal(auth.nivel)) return true
  if (!auth.userId) return true
  const lista = Array.isArray(personas) ? personas.filter(Boolean) : []
  if (!lista.length) return true
  if (lista.some(p => !p.role || p.role === 'dueno')) return true
  return false
}

/** El nombre, reducido a lo que identifica a la persona. */
export function nucleoNombre(valor) {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    // La eñe no se descompone: «Muñoz» y «Munoz» son el mismo nombre.
    .replace(/ñ/g, 'n')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/ +/g, ' ')
}

export function nombresCoinciden(persona, pipeline) {
  const a = nucleoNombre(persona)
  const b = nucleoNombre(pipeline)
  return a.length > 0 && a === b
}

export function nombrePermitido(nombre, nombres) {
  return (nombres || []).some(n => nombresCoinciden(n, nombre))
}

/**
 * Pipelines cuyo nombre es el de esta persona.
 * `incluyeSinPipeline`: los contactos antiguos tienen pipeline_id vacío y
 * viven en el pipeline por defecto. Solo se ven si ESE pipeline es el suyo.
 */
export function pipelinesDelMiembro(nombres, pipelines) {
  const ids = []
  let incluyeSinPipeline = false
  const lista = Array.isArray(nombres) ? nombres : [nombres]
  for (const p of pipelines || []) {
    if (!p?.id || !ID_SEGURO.test(String(p.id))) continue
    if (!lista.some(n => nombresCoinciden(n, p.name))) continue
    ids.push(String(p.id))
    if (p.is_default || p.isDefault) incluyeSinPipeline = true
  }
  return { ids, incluyeSinPipeline }
}

/** Un contacto (o el pipeline_id que se le quiere poner) entra en el alcance. */
export function pipelinePermitido(pipelineId, alcance) {
  if (!alcance) return true
  if (pipelineId == null || pipelineId === '') return Boolean(alcance.incluyeSinPipeline)
  return alcance.ids.includes(String(pipelineId))
}

function idsSeguros(ids) {
  const limpios = []
  const vistos = new Set()
  for (const id of ids || []) {
    const s = String(id)
    if (!ID_SEGURO.test(s) || vistos.has(s)) continue
    vistos.add(s)
    limpios.push(s)
  }
  return limpios
}

/** `columna=in.(…)` o, si no cabe en un solo tramo, un `or` de varios. */
function clausulaIn(columna, ids) {
  const lista = idsSeguros(ids)
  const usar = lista.length ? lista : [ID_NINGUNO]
  if (usar.length <= TROZO_IN) {
    return { columna, valor: `in.(${usar.map(encodeURIComponent).join(',')})` }
  }
  const partes = []
  for (let i = 0; i < usar.length; i += TROZO_IN) {
    const trozo = usar.slice(i, i + TROZO_IN).map(encodeURIComponent).join(',')
    partes.push(`${columna}.in.(${trozo})`)
  }
  return { or: `(${partes.join(',')})` }
}

/**
 * Filtros de PostgREST que hay que AÑADIR a la petición (no sustituyen a los
 * que ya traiga: se combinan con AND). Así un `id=eq.…` de otro contacto, o
 * un buscador, sigue sin salirse del pipeline.
 *
 * `contactos` son los ids de crm_contacts que caen en el alcance; hacen falta
 * para la ficha (crm_activities no guarda el pipeline, solo el contacto).
 */
export function clausulasDeAlcance(tabla, alcance, contactos = []) {
  if (!alcance) return []
  if (tabla === 'crm_pipelines') return [clausulaIn('id', alcance.ids)]
  if (tabla === 'crm_contacts') {
    if (!alcance.incluyeSinPipeline) return [clausulaIn('pipeline_id', alcance.ids)]
    // Va dentro de `and`, no como `or` suelto: si el cliente manda su propio
    // `or` (un id ajeno, un «no es null»), PostgREST se queda con un solo
    // valor de esa clave y el recorte desaparecería.
    const ids = idsSeguros(alcance.ids)
    const dentro = ids.length ? ids.map(encodeURIComponent).join(',') : ID_NINGUNO
    return [{ and: `(or(pipeline_id.in.(${dentro}),pipeline_id.is.null))` }]
  }
  if (tabla === 'crm_activities') return [clausulaIn('contact_id', contactos)]
  return []
}

/**
 * Añade una cláusula a la query. `and`/`or` se funden con las que ya vinieran:
 * esas claves no se pueden repetir con seguridad, y el recorte tiene que
 * sobrevivir a un filtro que mande el navegador.
 */
export function anadeClausula(query, clausula) {
  if (clausula.columna) {
    query.append(clausula.columna, clausula.valor)
    return
  }
  const clave = clausula.and ? 'and' : 'or'
  const valor = clausula.and || clausula.or
  const desnuda = (v) => {
    const s = String(v ?? '').trim()
    return s.startsWith('(') && s.endsWith(')') ? s.slice(1, -1) : s
  }
  const partes = [...query.getAll(clave).map(desnuda), desnuda(valor)].filter(Boolean)
  query.delete(clave)
  query.append(clave, `(${partes.join(',')})`)
}

/**
 * En el tablero, un contacto con pipeline_id desconocido cae en el pipeline
 * por defecto para no desaparecer. Eso está bien para quien ve todos; para
 * un miembro metería en su columna los tratos de otro caller si alguna
 * petición se los colara. `soloSuyo` exige que el contacto sea de uno de los
 * pipelines que esta sesión puede ver (los que ya devolvió el servidor).
 */
export function contactoEnTablero(contacto, pipelines, { soloSuyo = false } = {}) {
  if (!soloSuyo) return true
  const lista = pipelines || []
  if (!contacto?.pipeline_id) return lista.some(p => p.isDefault)
  return lista.some(p => p.id === contacto.pipeline_id)
}
