// HELM — el alta pública sin enlace (helm.s4sf.net/alta): lo que no es pintar.
//
// Quien llega a /alta todavía no tiene perfil ni enlace de su agencia. Primero
// deja sus datos (nombre, email y WhatsApp); el servidor le abre un alta y le
// devuelve una llave, un JWT de 30 días (api/onboarding.js,
// action=alta-publica-nueva), que se guarda en este navegador para poder
// volver. Con ella, las 40 preguntas van igual que con el enlace /alta/<token>.
//
// Aquí: dónde se guarda esa llave (siempre en try/catch: en una ventana
// privada o con los datos del sitio bloqueados, localStorage no está o lanza,
// y la página tiene que funcionar igual), la comprobación de los datos antes de
// mandarlos (la misma que hace el servidor) y de dónde vino la visita.
// Módulo puro, sin React: se comprueba sin navegador.

export const LLAVE = 'helm-alta-publica'

const almacen = () => {
  try { return globalThis.localStorage || null } catch { return null }
}

// El slug de la agencia de ?a=. Los slugs son minúsculas, cifras y guiones
// (api/register.js); uno con otra pinta no se manda y el alta cae en la
// agencia de la casa, que es lo mismo que haría el servidor con uno que no existe.
export function agenciaDeLaUrl(search) {
  const a = String(new URLSearchParams(search || '').get('a') || '').trim().toLowerCase()
  return /^[a-z0-9][a-z0-9-]{0,59}$/.test(a) ? a : null
}

// La llave guardada, si la hay y sirve: { t, caduca, agencia }. Si ha caducado
// se olvida. Si la visita trae otra agencia (?a=) que la del alta guardada, es
// otra alta y se empieza de cero (la guardada no se borra hasta que haya una
// nueva). Sin ?a= se retoma la que haya: es quien vuelve escribiendo /alta a mano.
export function leerAlta(agencia = null, ls = almacen()) {
  try {
    const crudo = ls?.getItem(LLAVE)
    if (!crudo) return null
    let g
    try { g = JSON.parse(crudo) } catch { g = { t: crudo } }
    if (typeof g === 'string') g = { t: g }
    if (!g || typeof g.t !== 'string' || !g.t || g.t.length > 2048) return null
    const caduca = Date.parse(g.caduca)
    if (Number.isFinite(caduca) && caduca <= Date.now()) {
      ls.removeItem(LLAVE)
      return null
    }
    if (agencia && (g.agencia || null) !== agencia) return null
    return { t: g.t, caduca: g.caduca || null, agencia: g.agencia || null }
  } catch {
    return null
  }
}

// Guarda la llave. Devuelve si se ha podido: sin almacén, la página sigue,
// pero quien cierre la pestaña ya no podrá volver a su alta.
export function recordarAlta({ t, caduca = null, agencia = null }, ls = almacen()) {
  try {
    if (!ls) return false
    ls.setItem(LLAVE, JSON.stringify({ t, caduca, agencia }))
    return true
  } catch {
    return false
  }
}

export function olvidarAlta(ls = almacen()) {
  try { ls?.removeItem(LLAVE) } catch { /* sin almacén no hay nada que olvidar */ }
}

// ── Los datos de contacto ───────────────────────────────────────────────────
// Los mismos topes que el servidor (action=alta-publica-nueva): mejor avisar
// aquí, junto al campo, que esperar a su 400.
export const DATOS_VACIOS = { nombre: '', email: '', telefono: '', acepta: false, website: '' }
export const CAMPOS_DATOS = ['nombre', 'email', 'telefono', 'acepta']
const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/
// Un teléfono: cifras, espacios, guiones, puntos, paréntesis y el + del
// prefijo, y nada más (el servidor usa esta misma). Con letras o barras
// cabría un enlace, que acabaría pulsable en el aviso de Telegram.
export const TELEFONO_RE = /^[+\d\s().-]{6,40}$/

/**
 * Comprueba y limpia los datos del primer paso.
 * @returns {{ limpio: { nombre, email, telefono } } | { errores: Object<string, string> }}
 */
export function validarDatos(d = {}) {
  const nombre = String(d.nombre || '').trim().replace(/\s+/g, ' ')
  const email = String(d.email || '').trim()
  const telefono = String(d.telefono || '').trim()
  const cifras = telefono.replace(/\D/g, '').length
  const errores = {}
  if (nombre.length < 2) errores.nombre = 'Escribe tu nombre y apellidos.'
  else if (nombre.length > 120) errores.nombre = `Como mucho 120 caracteres (llevas ${nombre.length}).`
  if (!email) errores.email = 'Escribe tu email.'
  else if (email.length > 200 || !EMAIL.test(email)) errores.email = 'Revisa el email: parece que le falta algo.'
  if (!telefono) errores.telefono = 'Escribe tu WhatsApp.'
  else if (cifras < 6 || cifras > 20) errores.telefono = 'Revisa el número: tiene que tener entre 6 y 20 cifras.'
  else if (!TELEFONO_RE.test(telefono)) errores.telefono = 'Revisa el número: solo cifras, espacios, guiones y el + del prefijo.'
  if (d.acepta !== true) errores.acepta = 'Para seguir, marca la casilla.'
  return Object.keys(errores).length ? { errores } : { limpio: { nombre, email, telefono } }
}

// ── El consentimiento ──────────────────────────────────────────────────────
// La casilla del primer paso nombra a quien recibe los datos: la agencia a la
// que va a ir el alta, que la página pregunta antes de pedir nada
// (action=alta-publica-agencia). Si el texto cambia, cambia la versión: el
// servidor guarda con cada alta cuál se aceptó (acepta_privacidad_version).
export const PRIVACIDAD_VERSION = '2026-10-15'

export function textoPrivacidad(agencia) {
  const quien = String(agencia || '').trim() || 'la agencia'
  return `Acepto que ${quien} reciba estos datos y mis respuestas a través de HELM, solo para conocer `
    + 'mi negocio, preparar mi alta y contactarme por email o WhatsApp. No se ceden a nadie más. '
    + 'Puedo borrarlos cuando quiera: desde esta misma página mientras aún no tenga perfil, o '
    + `pidiéndoselo a ${quien}.`
}

// De dónde vino la visita: las utm_* de la URL y la página de antes. Solo lo
// que trae algo, y recortado (el servidor recorta también).
const UTM = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']
export function origenDeLaVisita(search, referrer) {
  const p = new URLSearchParams(search || '')
  const o = {}
  for (const k of UTM) {
    const v = String(p.get(k) || '').trim()
    if (v) o[k] = v.slice(0, 120)
  }
  const r = String(referrer || '').trim()
  if (r) o.referrer = r.slice(0, 300)
  return o
}

// Si el alta ya está enviada, diga lo que diga cada modo: el del enlace
// contesta 'enviado'/'borrador'; el público, 'completed'/'draft' (y su POST,
// el estado de la tabla, 'enviada'). En los dos manda enviado_at, que solo
// existe si se envió.
export const estaEnviada = (d) => Boolean(d?.enviado_at) || ['enviado', 'enviada', 'completed'].includes(d?.estado)
