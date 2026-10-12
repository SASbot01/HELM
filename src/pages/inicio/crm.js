// El enlace con el CRM, para la masterclass de la página de inicio.
//
// Un lead que se apunta aquí NO acaba en una tabla propia: entra en el CRM de
// HELM como un contacto normal del perfil `silvestre`, en su pipeline "Página
// de inicio", con su etapa y sus UTM. Misma decisión que las otras páginas
// públicas (el formulario de valor, el diagnóstico) y por el mismo motivo: una
// lista de emails aparte es una lista que nadie vuelve a mirar.
//
// La escritura la hace el servidor (api/leads.js · masterclass): aquí solo se
// recoge lo que hay en la página.
import { pideLead } from '../leads.js'

// De dónde vino: lo que traiga la URL, tal cual, para poder medir qué Reel
// trae gente.
export function origenDeLaUrl() {
  const p = new URLSearchParams(window.location.search)
  return {
    utm_source: p.get('utm_source') || 'pagina-inicio',
    utm_medium: p.get('utm_medium') || 'bio',
    utm_campaign: p.get('utm_campaign'),
    utm_content: p.get('utm_content'),
  }
}

/**
 * Da de alta el lead.
 *
 * Dos cosas que parecen detalles y no lo son (las cumple el servidor):
 *
 *   · Si ese email YA existe en el perfil, se actualiza en vez de duplicar, sin
 *     moverle de etapa ni de embudo, y las notas se suman sin repetirse.
 *     Quien se apunta dos veces es la misma persona, y un CRM con la misma
 *     persona tres veces es un CRM que el comercial deja de creerse.
 *   · Si el pipeline todavía no está creado, el contacto entra igual sin
 *     embudo. Perder un lead porque falta una fila de configuración sería el
 *     peor intercambio posible.
 */
export async function altaLead({ nombre, email, evento }) {
  if (!String(email || '').trim()) throw new Error('Falta el email')
  return pideLead('masterclass', { nombre, email, evento, origen: origenDeLaUrl() })
}

/**
 * Cuántos hay ya apuntados a esta sesión. Es la única lectura pública de la
 * "sala": un conteo, no la lista de quién es quién — los nombres de otros
 * leads no se enseñan a un desconocido que aún no ha dejado el suyo. El
 * conteo sí es publicable y es lo que de verdad vende la sala ("no eres el
 * único"), sin tocar ningún dato de nadie.
 */
export async function contarApuntados(evento) {
  try {
    const { count } = await pideLead(`apuntados&evento=${encodeURIComponent(evento)}`)
    return typeof count === 'number' ? count : null
  } catch {
    return null   // decorativo: si falla, la sala se ve igual de bien sin el número
  }
}

/**
 * Anota que ese lead se ha ido a la comunidad de Discord.
 *
 * Es la diferencia entre "le enseñamos el botón" y "lo pulsó", que es justo lo
 * que quiere saber quien luego le escriba: quien está en el Discord ya no es
 * un email suelto, es alguien que aparece cada semana.
 *
 * Nunca lanza. Se llama mientras el navegador ya está abriendo Discord, y que
 * falle una nota no puede romper —ni retrasar— el único clic que importa.
 */
export async function marcaComunidad(id) {
  if (!id) return
  try {
    await pideLead('nota', { id, texto: 'Entró en la comunidad de Discord' })
  } catch {
    // A propósito en silencio: ver el dato en el CRM es un lujo, entrar en el
    // Discord es el objetivo.
  }
}
