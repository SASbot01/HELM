// HELM — Fuente OpenStreetMap: los mismos negocios que Maps, sin clave ni factura.
//
// Google cobra por búsqueda y obliga a cada perfil a montarse un proyecto en
// Google Cloud con tarjeta. OpenStreetMap es el mismo mapa hecho por la
// comunidad: se consulta con Overpass, es gratis, no pide credenciales y la
// licencia (ODbL) permite usar los datos citando la fuente.
//
// Lo que se gana: barrer una ciudad entera sin gastar un euro, y encontrar el
// EMAIL del negocio, que Places no devuelve nunca y aquí aparece a menudo
// porque lo pone quien da de alta el sitio.
//
// Lo que se pierde, y hay que decirlo: no hay reseñas ni valoración, y la
// cobertura la marca la comunidad — en el centro de una capital está casi todo,
// en un polígono de un pueblo puede no haber nada. Por eso esta fuente no
// sustituye a Maps: se usa antes, para no gastar cuota, o después, para
// rellenar lo que Maps no dio.
//
// Dos servicios públicos y gratuitos, así que se piden con cabeza: un
// User-Agent que dice quiénes somos (lo exigen los dos), una petición por
// búsqueda y un tope de resultados.
const NOMINATIM = 'https://nominatim.openstreetmap.org/search'

// Dos servidores de Overpass, y no por capricho: el público reparte su capacidad
// en "slots" por IP y devuelve 429 en cuanto lanzas dos búsquedas seguidas —
// que es exactamente lo que hace alguien prospectando. Si el primero dice que
// está ocupado, se prueba el espejo antes de dar el fallo por bueno.
const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
]

const UA = 'HELM/1.0 (panel de gestión; contacto vía s4sf.net)'

export const MAX_RESULTADOS = 200

// Del castellano de la calle a las etiquetas de OSM. No es una tabla de
// sinónimos por gusto: nadie escribe "amenity=dentist" en un buscador de leads,
// escribe "dentista". Lo que no esté aquí cae al buscador por nombre, que es
// peor pero no deja al usuario con las manos vacías.
const TIPOS = {
  'peluqueria': ['shop=hairdresser'],
  'barberia': ['shop=hairdresser'],
  'dentista': ['amenity=dentist', 'healthcare=dentist'],
  'clinica dental': ['amenity=dentist', 'healthcare=dentist'],
  'gimnasio': ['leisure=fitness_centre'],
  'restaurante': ['amenity=restaurant'],
  'bar': ['amenity=bar', 'amenity=pub'],
  'cafeteria': ['amenity=cafe'],
  'panaderia': ['shop=bakery'],
  'carniceria': ['shop=butcher'],
  'supermercado': ['shop=supermarket'],
  'farmacia': ['amenity=pharmacy'],
  'optica': ['shop=optician'],
  'fisioterapia': ['healthcare=physiotherapist'],
  'clinica': ['amenity=clinic', 'healthcare=clinic'],
  'veterinario': ['amenity=veterinary'],
  'abogado': ['office=lawyer'],
  'asesoria': ['office=accountant', 'office=tax_advisor'],
  'gestoria': ['office=accountant', 'office=tax_advisor'],
  'inmobiliaria': ['office=estate_agent'],
  'seguros': ['office=insurance'],
  'taller': ['shop=car_repair'],
  'concesionario': ['shop=car'],
  'autoescuela': ['amenity=driving_school'],
  'hotel': ['tourism=hotel'],
  'tienda de ropa': ['shop=clothes'],
  'zapateria': ['shop=shoes'],
  'joyeria': ['shop=jewelry'],
  'floristeria': ['shop=florist'],
  'ferreteria': ['shop=hardware', 'shop=doityourself'],
  'estetica': ['shop=beauty'],
  'centro de belleza': ['shop=beauty'],
  'tatuajes': ['shop=tattoo'],
  'lavanderia': ['shop=laundry'],
  'guarderia': ['amenity=kindergarten'],
  'academia': ['amenity=language_school', 'office=educational_institution'],
  'fotografo': ['shop=photo', 'craft=photographer'],
  'fontanero': ['craft=plumber'],
  'electricista': ['craft=electrician'],
  'carpinteria': ['craft=carpenter'],
  'imprenta': ['shop=copyshop', 'craft=printer'],
  'agencia de viajes': ['shop=travel_agency'],
  'notaria': ['office=notary'],
  'coworking': ['office=coworking', 'amenity=coworking_space'],
}

const plano = (s) => String(s || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().trim()

/** Escapa lo que se va a meter dentro de una cadena de Overpass QL. */
const esc = (s) => String(s || '').replace(/["\\]/g, '\\$&')

/**
 * Qué se le pregunta a Overpass para un tipo escrito a mano.
 *
 * Tres caminos, en este orden:
 *   1. "shop=hairdresser" tal cual → quien sabe OSM puede afinar.
 *   2. La tabla de arriba, por coincidencia parcial ("clinica dental veterinaria"
 *      cae en clínica dental antes que en veterinario porque se prueba la clave
 *      más larga primero).
 *   3. Nada de lo anterior → se busca por nombre, que es como buscar "iberdrola"
 *      en el mapa: encuentra las sucursales, no la categoría.
 */
function filtrosDe(tipo) {
  const t = plano(tipo)
  if (!t) return { filtros: ['nwr["shop"]', 'nwr["office"]', 'nwr["amenity"~"^(restaurant|cafe|bar|clinic|dentist|pharmacy)$"]'], modo: 'genérico' }

  if (/^[a-z_:]+=[a-z_]+$/i.test(tipo.trim())) {
    const [k, v] = tipo.trim().split('=')
    return { filtros: [`nwr["${esc(k)}"="${esc(v)}"]`], modo: 'etiqueta' }
  }

  const clave = Object.keys(TIPOS)
    .sort((a, b) => b.length - a.length)
    .find(k => t.includes(k) || k.includes(t))

  if (clave) {
    return {
      filtros: TIPOS[clave].map(par => {
        const [k, v] = par.split('=')
        return `nwr["${k}"="${v}"]`
      }),
      modo: 'categoría',
    }
  }

  return { filtros: [`nwr["name"~"${esc(tipo.trim())}",i]`], modo: 'nombre' }
}

/** La zona escrita a mano → el rectángulo que entiende Overpass. */
async function marco(zona) {
  const url = `${NOMINATIM}?q=${encodeURIComponent(zona)}&format=json&limit=1&addressdetails=0`
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
  if (!r.ok) throw Object.assign(new Error('No he podido localizar esa zona en el mapa'), { statusCode: 502 })
  const [sitio] = await r.json().catch(() => [])
  if (!sitio?.boundingbox) {
    throw Object.assign(
      new Error(`No encuentro «${zona}» en el mapa. Prueba con la ciudad y la provincia ("Chamberí, Madrid").`),
      { statusCode: 400 },
    )
  }
  const [sur, norte, oeste, este] = sitio.boundingbox.map(Number)
  return { sur, norte, oeste, este, nombre: sitio.display_name || zona }
}

const primero = (tags, ...claves) => {
  for (const k of claves) if (tags[k]) return String(tags[k]).trim()
  return ''
}

const direccionDe = (tags) => [
  [tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(' '),
  tags['addr:postcode'],
  tags['addr:city'] || tags['addr:town'] || tags['addr:village'],
].filter(Boolean).join(', ')

// De las 30 etiquetas que puede traer un nodo, la categoría es la que dice a qué
// se dedica. Se busca en este orden porque es el de lo más específico a lo menos.
const categoriaDe = (tags) => primero(tags, 'shop', 'office', 'craft', 'healthcare', 'amenity', 'leisure', 'tourism')
  .replace(/_/g, ' ')

function normaliza(el) {
  const tags = el.tags || {}
  const web = primero(tags, 'website', 'contact:website', 'url')
  const ig = primero(tags, 'contact:instagram', 'instagram')

  return {
    place_id: `osm:${el.type}/${el.id}`,
    nombre: tags.name || tags.brand || '',
    direccion: direccionDe(tags),
    telefono: primero(tags, 'phone', 'contact:phone', 'contact:mobile'),
    web: /^https?:\/\//i.test(web) ? web : (web ? `https://${web}` : ''),
    categoria: categoriaDe(tags),
    rating: null,
    resenas: null,
    maps_url: `https://www.openstreetmap.org/${el.type}/${el.id}`,
    lat: el.lat ?? el.center?.lat ?? null,
    lng: el.lon ?? el.center?.lon ?? null,
    // OSM sí trae email cuando el negocio lo publica. Es el dato que Places no
    // da nunca y por el que merece la pena pasar por aquí aunque ya tengas Maps.
    email: primero(tags, 'email', 'contact:email').toLowerCase(),
    extra: {
      instagram: ig && !/^https?:/i.test(ig) ? `https://instagram.com/${ig.replace('@', '')}` : ig,
      horario: tags.opening_hours || '',
      tags,
    },
  }
}

/**
 * Busca negocios por zona y tipo en OpenStreetMap.
 *
 * Sin paginación: Overpass devuelve el rectángulo entero de una vez y el tope se
 * aplica en la propia consulta (`out … N`), que es más barato para su servidor
 * que traer 5.000 y tirar 4.940 aquí.
 */
export async function buscarOsm({ tipo = '', zona = '', limite = 60 } = {}) {
  if (!zona.trim()) {
    throw Object.assign(new Error('Dime la zona: OpenStreetMap busca dentro de un mapa, no en todo el mundo'), { statusCode: 400 })
  }
  const tope = Math.min(Math.max(Number(limite) || 60, 1), MAX_RESULTADOS)
  const caja = await marco(zona)
  const { filtros, modo } = filtrosDe(tipo)

  const bbox = `${caja.sur},${caja.oeste},${caja.norte},${caja.este}`
  const query = `[out:json][timeout:20];(${filtros.map(f => `${f}(${bbox});`).join('')});out center tags ${tope * 2};`

  let data = null
  let ultimo = 0
  for (const servidor of OVERPASS) {
    let r
    try {
      r = await fetch(servidor, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
        body: new URLSearchParams({ data: query }).toString(),
      })
    } catch { ultimo = 503; continue }        // el espejo no responde: al siguiente
    ultimo = r.status
    if (r.status === 429 || r.status === 504 || r.status >= 500) continue
    if (!r.ok) throw Object.assign(new Error(`OpenStreetMap respondió ${r.status}`), { statusCode: 502 })
    data = await r.json().catch(() => ({}))
    break
  }
  if (!data) {
    throw Object.assign(
      new Error(ultimo === 429
        ? 'Overpass está limitando las búsquedas (es gratuito y compartido: una cada pocos segundos). Prueba en un minuto.'
        : 'Los servidores de OpenStreetMap no responden ahora mismo. Prueba en un rato.'),
      { statusCode: ultimo === 429 ? 429 : 502 },
    )
  }
  const negocios = (data.elements || [])
    .map(normaliza)
    // Sin nombre no hay negocio al que llamar: son puntos que alguien marcó en
    // el mapa sin rellenar la ficha.
    .filter(n => n.nombre)
    .slice(0, tope)

  return {
    consulta: `${tipo || 'negocios'} en ${caja.nombre.split(',').slice(0, 2).join(',')} (OSM, por ${modo})`,
    negocios,
  }
}
