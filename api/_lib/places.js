// HELM — Places API de Google (la nueva, v1).
//
// Busca negocios por zona y tipo. Es lo que hace la gente a mano en Google
// Maps, pero por la puerta oficial: raspar el HTML de Maps va contra los
// términos de Google y se rompe cada vez que cambian el maquetado.
//
// La clave la pone cada perfil (Ajustes → Prospección) y vive en
// `user_integrations`, nunca en una columna de `clients` ni al alcance del rol
// anónimo: con una clave de Places se pueden hacer búsquedas que se le
// facturan a su dueño.
const API = 'https://places.googleapis.com/v1/places:searchText'

// Solo los campos que se van a enseñar. No es cosmético: la Places API cobra
// por tramos según lo que pidas, y pedir el campo de reseñas o el de horarios
// multiplica el precio de cada búsqueda sin que nadie lo vea en pantalla.
const CAMPOS = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.nationalPhoneNumber',
  'places.internationalPhoneNumber',
  'places.websiteUri',
  'places.rating',
  'places.userRatingCount',
  'places.googleMapsUri',
  'places.primaryTypeDisplayName',
  'places.businessStatus',
  'places.location',
  // Sin esto Google no devuelve el testigo de la página siguiente (la API
  // nueva solo manda lo que está en la máscara) y toda búsqueda se quedaba en
  // los 20 primeros, por mucho que se pidieran 60. No se factura aparte.
  'nextPageToken',
].join(',')

// Google devuelve 20 por página como mucho, y no da más de 3 páginas (60).
const POR_PAGINA = 20
export const MAX_RESULTADOS = 60

function errorDeGoogle(status, data) {
  const msg = data?.error?.message || `Google respondió ${status}`
  const e = new Error(
    status === 400 && /API key not valid/i.test(msg)
      ? 'Esa clave no es válida.'
      : status === 403
        ? 'Google ha rechazado la clave. Comprueba que la Places API (New) está activada en tu proyecto y que la clave no tiene restricciones que dejen fuera a este servidor.'
        : status === 429
          ? 'Google está limitando las peticiones de esta clave. Prueba dentro de un rato.'
          : msg,
  )
  // 401/403 son culpa de la configuración del usuario, no un fallo nuestro:
  // se devuelven tal cual para que la pantalla diga qué hay que arreglar.
  e.statusCode = [400, 401, 403, 429].includes(status) ? status : 502
  throw e
}

async function pedir(apiKey, body) {
  const r = await fetch(API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': CAMPOS,
    },
    body: JSON.stringify(body),
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) errorDeGoogle(r.status, data)
  return data
}

// El teléfono nacional se lee mejor ("962 12 34 56"), pero el internacional es
// el que sirve para escribir por WhatsApp. Se prefiere el segundo.
const telefonoDe = (p) => (p.internationalPhoneNumber || p.nationalPhoneNumber || '').trim()

const normaliza = (p) => ({
  place_id: p.id,
  nombre: p.displayName?.text || '',
  direccion: p.formattedAddress || '',
  telefono: telefonoDe(p),
  web: p.websiteUri || '',
  categoria: p.primaryTypeDisplayName?.text || '',
  rating: typeof p.rating === 'number' ? p.rating : null,
  resenas: typeof p.userRatingCount === 'number' ? p.userRatingCount : null,
  maps_url: p.googleMapsUri || '',
  lat: p.location?.latitude ?? null,
  lng: p.location?.longitude ?? null,
  cerrado: p.businessStatus === 'CLOSED_PERMANENTLY',
})

/**
 * La consulta que se le manda a Google.
 *
 * Text Search entiende el lenguaje de siempre ("clínicas dentales en Chamberí,
 * Madrid"), que es justo como la gente busca en Maps. Montar la búsqueda con
 * coordenadas y radio daría más control, pero obligaría a que el usuario supiera
 * el radio en metros de su zona — y nadie lo sabe.
 */
export const consultaDe = (tipo, zona) =>
  [String(tipo || '').trim(), String(zona || '').trim()].filter(Boolean).join(' en ')

/**
 * Busca negocios. Pagina hasta llegar al límite pedido.
 *
 * Cada página es una petición facturable, así que el límite se respeta a
 * rajatabla: nada de traer 60 "por si acaso" cuando han pedido 20.
 */
export async function buscarNegocios(apiKey, { tipo, zona, limite = 20, idioma = 'es', region = 'ES' }) {
  const textQuery = consultaDe(tipo, zona)
  if (!textQuery) {
    const e = new Error('Hace falta al menos el tipo de negocio o la zona')
    e.statusCode = 400
    throw e
  }

  const tope = Math.min(Math.max(Number(limite) || 20, 1), MAX_RESULTADOS)
  const salida = []
  let pageToken = null

  while (salida.length < tope) {
    const data = await pedir(apiKey, {
      textQuery,
      languageCode: idioma,
      regionCode: region,
      maxResultCount: Math.min(POR_PAGINA, tope - salida.length),
      ...(pageToken ? { pageToken } : {}),
    })

    // Sin resultados en la primera página: la zona o el tipo no dan nada. No es
    // un error, es una búsqueda vacía.
    const lote = (data.places || []).map(normaliza)
    salida.push(...lote)

    pageToken = data.nextPageToken || null
    if (!pageToken || lote.length === 0) break
  }

  return { consulta: textQuery, negocios: salida.slice(0, tope) }
}

/**
 * ¿Sirve esta clave?
 *
 * Se comprueba con una búsqueda real y mínima (un resultado): la Places API no
 * tiene un endpoint de "valida mi clave", y guardar una clave rota para que
 * falle la primera búsqueda de verdad es peor experiencia que esperar un
 * segundo aquí.
 */
export async function verificarClave(apiKey) {
  await pedir(apiKey, {
    textQuery: 'cafetería en Madrid',
    languageCode: 'es',
    regionCode: 'ES',
    maxResultCount: 1,
  })
  return true
}

// ── La clave, por perfil ───────────────────────────────────────────────────
// Vive en `user_integrations` como el resto de integraciones, pero leerla y
// guardarla ya no es cosa de este módulo: lo hace el catálogo de fuentes
// (_lib/fuentes/index.js), que necesita hacer lo mismo con la clave de Brave y
// con las que vengan. Aquí solo queda el nombre del servicio, que es el dato
// que ata esa fila con esta API.
export const SERVICIO = 'google_places'
