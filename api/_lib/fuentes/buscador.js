// HELM — Fuente Buscador: prospección por huella (footprint).
//
// La técnica es vieja y sigue siendo la mejor cuando el negocio que buscas no
// está en un mapa ni en un registro: se le pregunta al buscador con operadores.
//
//   site:instagram.com "entrenador personal" Valencia
//   "clínica dental" Valencia "pide tu cita" -site:doctoralia.es
//   inurl:blog "agencia de marketing" Alicante
//
// Eso encuentra a quien no tiene ficha de Maps (el infoproductor, el coach, la
// agencia que solo existe en su web) y permite filtrar por SEÑALES: quien tiene
// blog, quien usa cierta plataforma de reservas, quien anuncia que abre plaza.
//
// POR QUÉ POR API Y NO RASPANDO GOOGLE: raspar resultados de Google va contra
// sus términos, te bloquea por captcha a la tercera página y se rompe cada vez
// que cambian el HTML. Brave vende su índice como API precisamente para esto:
// clave propia, plan gratuito de 2.000 consultas al mes y permiso explícito.
//
// Lo que devuelve son dominios y descripciones, no fichas de negocio. El valor
// real llega en el paso siguiente: el enriquecimiento entra en cada web y saca
// email, teléfonos, redes y el titular del aviso legal.
const API = 'https://api.search.brave.com/res/v1/web/search'

// Brave sirve 20 por página y pagina por `offset` (0-9). Cinco páginas es un
// barrido decente de un nicho; más allá, los resultados dejan de tener que ver.
const POR_PAGINA = 20
export const MAX_RESULTADOS = 100

export const SERVICIO = 'brave_search'

// Ruido: agregadores, redes y enciclopedias. No son el negocio que buscas, son
// el sitio donde alguien habla de él. Instagram y LinkedIn NO están aquí a
// propósito — cuando buscas con `site:instagram.com`, el perfil ES el lead.
const RUIDO = new Set([
  'wikipedia.org', 'es.wikipedia.org', 'boe.es', 'youtube.com', 'amazon.es',
  'idealista.com', 'milanuncios.com', 'infojobs.net', 'indeed.com',
  'tripadvisor.es', 'yelp.es', 'einforma.com', 'axesor.es', 'empresia.es',
])

const dominioDe = (url) => String(url || '')
  .replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/[/?#].*$/, '')
  .toLowerCase()

const raiz = (d) => d.split('.').slice(-2).join('.')

function errorDeBrave(status, data) {
  const msg = data?.error?.detail || data?.message || `Brave respondió ${status}`
  const e = new Error(
    status === 401 || status === 403
      ? 'Esa clave de Brave Search no vale o no tiene el plan activo.'
      : status === 422
        ? 'Brave no ha entendido la consulta. Revisa las comillas y los operadores.'
        : status === 429
          ? 'Te has quedado sin consultas del plan de Brave por ahora (el gratuito es 1 por segundo y 2.000 al mes).'
          : msg,
  )
  e.statusCode = [401, 403, 422, 429].includes(status) ? status : 502
  throw e
}

async function pedir(clave, params) {
  const r = await fetch(`${API}?${new URLSearchParams(params)}`, {
    headers: {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip',
      'X-Subscription-Token': clave,
    },
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) errorDeBrave(r.status, data)
  return data
}

/**
 * El resultado de un buscador con la forma de un prospecto.
 *
 * `nombre` sale del título de la página, recortado por el separador que usa
 * medio internet ("Clínica Dental Ruiz | Ortodoncia en Valencia" → "Clínica
 * Dental Ruiz"). No es perfecto y no puede serlo: es un título, no una razón
 * social. Se queda el dominio al lado para que se vea de dónde salió.
 */
function normaliza(res, consulta) {
  const dominio = dominioDe(res.url)
  const titulo = String(res.title || '').replace(/<[^>]+>/g, '').trim()
  const nombre = titulo.split(/\s[|\-–—·»]\s/)[0].trim().slice(0, 120) || dominio

  return {
    place_id: `buscador:${dominio}`,
    nombre,
    direccion: '',
    telefono: '',
    web: res.url,
    // Sin categoría de verdad: nadie la ha clasificado. Se deja el dominio, que
    // es lo que de verdad identifica la ficha en la lista.
    categoria: dominio,
    rating: null,
    resenas: null,
    maps_url: res.url,
    lat: null,
    lng: null,
    email: '',
    extra: {
      titulo,
      resumen: String(res.description || '').replace(/<[^>]+>/g, '').slice(0, 400),
      consulta,
    },
  }
}

/**
 * Busca por huella.
 *
 * Se deduplica por dominio: veinte resultados de la misma web (inicio, blog,
 * contacto) son un solo negocio, y meterlos veinte veces en la bandeja es
 * exactamente el ruido que esta pantalla existe para evitar.
 */
export async function buscarBuscador(clave, { consulta = '', limite = 20, pais = 'ES' } = {}) {
  const q = String(consulta || '').trim()
  if (!q) throw Object.assign(new Error('Escribe la consulta, con sus operadores si quieres afinar'), { statusCode: 400 })

  const tope = Math.min(Math.max(Number(limite) || 20, 1), MAX_RESULTADOS)
  const negocios = []
  const dominios = new Set()

  for (let pagina = 0; negocios.length < tope && pagina < 5; pagina++) {
    const data = await pedir(clave, {
      q,
      count: String(Math.min(POR_PAGINA, tope - negocios.length + 5)),
      offset: String(pagina),
      country: pais,
      search_lang: 'es',
      // Sin ampliar la consulta por su cuenta: en prospección, los "resultados
      // parecidos" son justo los que no has pedido.
      extra_snippets: 'false',
    })

    const lote = data?.web?.results || []
    for (const res of lote) {
      const dominio = dominioDe(res.url)
      if (!dominio || RUIDO.has(dominio) || RUIDO.has(raiz(dominio))) continue
      if (dominios.has(dominio)) continue
      dominios.add(dominio)
      negocios.push(normaliza(res, q))
      if (negocios.length >= tope) break
    }
    if (lote.length < POR_PAGINA) break        // no hay más páginas que pedir
  }

  return { consulta: q, negocios }
}

/** ¿Sirve esta clave? Una consulta mínima: Brave no tiene endpoint de validación. */
export async function verificarClaveBuscador(clave) {
  await pedir(clave, { q: 'cafetería valencia', count: '1', country: 'ES' })
  return true
}
