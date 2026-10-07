// HELM — Fuente Lista: lo que ya tienes, pegado en una caja de texto.
//
// La fuente menos vistosa y la que más se va a usar. Todo el mundo llega con
// leads en sitios que no son una API: el CSV que exportó de otra herramienta, la
// lista de asistentes a una feria, los cuarenta perfiles que guardó en una nota,
// el listado que le pasó un socio. Hoy eso acaba en un Excel que nadie vuelve a
// abrir, o en un copiar-pegar de media tarde al CRM.
//
// Aquí entra por el mismo sitio que el resto: se pega, se normaliza, se
// deduplica contra lo que ya hay y pasa por la misma bandeja de revisión. Y en
// cuanto hay una web, el enriquecimiento la lee y saca email, teléfonos, redes y
// el titular del aviso legal — con lo que una lista de dominios pelados acaba
// siendo una lista de contactos.
//
// No toca la red. Es la única fuente que funciona sin internet de terceros, sin
// clave y sin cuota: si todo lo demás falla, esto sigue entrando.

export const MAX_LINEAS = 500

const limpio = (s, max = 200) => String(s == null ? '' : s).trim().slice(0, max)

// Un email es lo más fácil de reconocer y lo más valioso, así que se busca
// primero y se saca de la línea antes de mirar nada más.
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]{2,}/
const URL = /(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+(?:\.[a-z0-9-]+)+)(\/[^\s,;|]*)?/i
// Teléfono español o internacional, tal y como lo escribe la gente: con
// prefijo, con espacios, con guiones o pegado.
const TEL = /(?:\+?\d{1,3}[\s.-]?)?(?:\d[\s.-]?){8,13}\d/

// Dominios que no son un negocio: son la plataforma donde está el negocio. Si
// alguien pega una lista de perfiles de Instagram, el "dominio" sería
// instagram.com para todos y se fundirían en uno solo al deduplicar.
const PLATAFORMAS = new Set([
  'instagram.com', 'facebook.com', 'linkedin.com', 'twitter.com', 'x.com',
  'tiktok.com', 'youtube.com', 'wa.me', 'api.whatsapp.com', 't.me',
])

const dominioDe = (url) => String(url || '')
  .replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/[/?#].*$/, '')
  .toLowerCase()

/**
 * Una línea suelta → un negocio.
 *
 * No se pide un formato porque nadie lo respetaría. Se lee lo que hay: si la
 * línea trae separadores (CSV pegado desde una hoja de cálculo) se parte por
 * ellos, y de cada trozo se reconoce QUÉ es por su forma, no por su posición.
 * Así funcionan igual "Bar Pepe;963112233;barpepe.es" y "barpepe.es, Bar Pepe".
 */
function deLinea(linea) {
  const original = limpio(linea, 400)
  if (!original || original.startsWith('#')) return null

  const trozos = original.split(/[\t;|,]+/).map(t => t.trim()).filter(Boolean)
  const resto = []

  let email = '', url = '', telefono = ''
  for (const t of trozos) {
    const mEmail = !email && EMAIL.exec(t)
    if (mEmail) { email = mEmail[0].toLowerCase(); continue }

    const mUrl = !url && URL.exec(t)
    // Ojo: "Bar Pepe S.L." casa con la forma de un dominio (.L). Se exige que
    // la extensión sea de letras y de al menos dos, y que no lleve espacios.
    if (mUrl && !/\s/.test(t) && /\.[a-z]{2,}$/i.test(mUrl[1])) { url = mUrl[0]; continue }

    const mTel = !telefono && TEL.exec(t)
    // Un teléfono es la línea entera o casi: si el trozo tiene letras, es un
    // nombre con números dentro ("Gimnasio 24h"), no un teléfono.
    if (mTel && !/[a-z]/i.test(t) && mTel[0].replace(/\D/g, '').length >= 9) {
      telefono = mTel[0].trim(); continue
    }

    resto.push(t)
  }

  const dominio = dominioDe(url)
  // Un perfil de red social se llama por su handle, no por la plataforma: una
  // lista de veinte perfiles de Instagram se vería como veinte "instagram.com".
  const handle = PLATAFORMAS.has(dominio)
    // TikTok ya trae la arroba en la ruta (/@coach.ana) y Instagram no: se
    // quita antes de ponerla para no acabar con "@@coach.ana".
    ? '@' + String((URL.exec(url)?.[2] || '').split('/').filter(Boolean)[0] || '').replace(/^@/, '')
    : ''
  const nombre = limpio(resto.join(' ')) || (handle.length > 1 ? handle : '') || dominio || email || telefono
  if (!nombre) return null

  // El identificador, por orden de lo que mejor distingue a un negocio: su
  // dominio propio, si no su email, si no su teléfono. Un perfil de Instagram
  // se identifica por la URL entera, no por "instagram.com".
  const clave = dominio && !PLATAFORMAS.has(dominio)
    ? `web:${dominio}`
    : url ? `url:${dominioDe(url)}${(URL.exec(url)?.[2] || '').replace(/\/$/, '')}`
      : email ? `mail:${email}`
        : `tel:${telefono.replace(/\D/g, '').slice(-9)}`

  return {
    place_id: clave,
    nombre,
    direccion: '',
    telefono,
    web: url ? (/^https?:\/\//i.test(url) ? url : `https://${url}`) : '',
    categoria: '',
    rating: null,
    resenas: null,
    maps_url: '',
    lat: null,
    lng: null,
    email,
    extra: { linea: original },
  }
}

/**
 * Convierte el texto pegado en negocios.
 *
 * Se deduplica dentro del propio pegado además de contra la base: una lista
 * exportada de otra herramienta trae la misma empresa dos veces más veces de las
 * que nadie querría admitir.
 */
export async function buscarLista({ texto = '' } = {}) {
  const lineas = String(texto || '').split(/\r?\n/).slice(0, MAX_LINEAS)
  const vistos = new Set()
  const negocios = []

  for (const linea of lineas) {
    const fila = deLinea(linea)
    if (!fila || vistos.has(fila.place_id)) continue
    vistos.add(fila.place_id)
    negocios.push(fila)
  }

  if (!negocios.length) {
    throw Object.assign(
      new Error('No he sacado nada de ese texto. Pega una línea por negocio, con su web, su email o su teléfono.'),
      { statusCode: 400 },
    )
  }

  return { consulta: `Lista pegada · ${negocios.length} de ${lineas.filter(l => l.trim()).length} líneas`, negocios }
}
