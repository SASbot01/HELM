// HELM — El catálogo de fuentes del Scraper.
//
// Una fuente es "de dónde salen los leads". Todas devuelven lo mismo y entran
// por el mismo sitio, así que el resto del sistema (bandeja de revisión,
// descarte, enriquecimiento, deduplicación e importación al CRM) no sabe ni
// tiene que saber de dónde vino cada fila. Añadir la sexta fuente es escribir un
// módulo con una función `buscar` y añadir una entrada aquí.
//
// El contrato, para que no haya que leer los cinco módulos:
//
//   buscar(params, { clave }) → {
//     consulta,               // lo que se pidió, en una línea, para el histórico
//     negocios: [{
//       place_id,             // id ÚNICO EN SU FUENTE, con prefijo (osm:node/1)
//       nombre, direccion, telefono, web, categoria,
//       rating, resenas,      // null si la fuente no valora
//       maps_url,             // la ficha de origen, sea Maps, el BOE o una web
//       lat, lng, email,
//       extra,                // lo que solo tiene sentido en esa fuente
//     }]
//   }
//
// Las claves de API viven donde las demás integraciones (`user_integrations`,
// por perfil, en el servidor). Ni la de Google ni la de Brave bajan al navegador:
// con cualquiera de las dos se hacen búsquedas que se le facturan a su dueño.
import { buscarNegocios, verificarClave as verificarClavePlaces, SERVICIO as SERVICIO_PLACES, MAX_RESULTADOS as MAX_MAPS } from '../places.js'
import { buscarBorme, PROVINCIAS, ACTOS, MAX_DIAS, MAX_RESULTADOS as MAX_BORME } from './borme.js'
import { buscarOsm, MAX_RESULTADOS as MAX_OSM } from './osm.js'
import { buscarLista, MAX_LINEAS } from './lista.js'
import { buscarBuscador, verificarClaveBuscador, SERVICIO as SERVICIO_BRAVE, MAX_RESULTADOS as MAX_BUSCADOR } from './buscador.js'

export const FUENTES = {
  // ── Google Maps ──────────────────────────────────────────────────────────
  // La de siempre. Ficha completa y teléfono casi garantizado, a cambio de una
  // clave con tarjeta y una factura por búsqueda.
  maps: {
    key: 'maps',
    nombre: 'Google Maps',
    servicio: SERVICIO_PLACES,        // dónde vive su clave
    maxResultados: MAX_MAPS,
    buscar: (params, { clave }) => buscarNegocios(clave, params),
    verificar: verificarClavePlaces,
  },

  // ── Registro Mercantil ───────────────────────────────────────────────────
  // La única que da nombre y apellidos de quien manda, porque lo publica un
  // registro oficial. Sin clave y sin cuota.
  borme: {
    key: 'borme',
    nombre: 'Registro Mercantil (BORME)',
    servicio: null,
    maxResultados: MAX_BORME,
    buscar: (params) => buscarBorme(params),
    meta: { provincias: PROVINCIAS, actos: Object.entries(ACTOS).map(([k, v]) => ({ key: k, label: v.label })), maxDias: MAX_DIAS },
  },

  // ── OpenStreetMap ────────────────────────────────────────────────────────
  // Lo mismo que Maps pero gratis, y con el email que Places no da nunca. A
  // cambio, la ficha es la que haya subido la comunidad.
  osm: {
    key: 'osm',
    nombre: 'OpenStreetMap',
    servicio: null,
    maxResultados: MAX_OSM,
    buscar: (params) => buscarOsm(params),
  },

  // ── Buscador (huella) ────────────────────────────────────────────────────
  // Para quien no está en ningún mapa: se busca por operadores y se enriquece
  // lo que salga.
  buscador: {
    key: 'buscador',
    nombre: 'Buscador (huella web)',
    servicio: SERVICIO_BRAVE,
    maxResultados: MAX_BUSCADOR,
    buscar: (params, { clave }) => buscarBuscador(clave, params),
    verificar: verificarClaveBuscador,
  },

  // ── Lista propia ─────────────────────────────────────────────────────────
  // Sin red y sin clave: lo que el usuario pega. La que nunca falla.
  lista: {
    key: 'lista',
    nombre: 'Mi lista (pegar o CSV)',
    servicio: null,
    maxResultados: MAX_LINEAS,
    buscar: (params) => buscarLista(params),
  },
}

export const FUENTE_DEFECTO = 'maps'

/** La fuente pedida, o un 400 con nombre y apellidos si no existe. */
export function fuenteDe(key) {
  const f = FUENTES[key || FUENTE_DEFECTO]
  if (!f) throw Object.assign(new Error(`No conozco la fuente «${key}»`), { statusCode: 400 })
  return f
}

/** Qué servicios de `user_integrations` hacen falta para el catálogo entero. */
export const SERVICIOS = [...new Set(Object.values(FUENTES).map(f => f.servicio).filter(Boolean))]

// ── Las claves, por perfil ─────────────────────────────────────────────────
// Mismo sitio y misma forma que el resto de integraciones: una fila por perfil y
// servicio, con `member_id` a null (la clave es del negocio, no de quien la
// pegó). Se escribe con el rol de servicio, así que nunca sale del servidor.

export async function getClave(supabase, clientId, servicio) {
  if (!servicio) return null
  const { data } = await supabase
    .from('user_integrations')
    .select('id, config, enabled, updated_at')
    .eq('client_id', clientId).eq('service', servicio)
    .is('member_id', null)
    .maybeSingle()
  return data || null
}

export async function guardarClave(supabase, clientId, servicio, apiKey) {
  const existente = await getClave(supabase, clientId, servicio)
  const fila = {
    client_id: clientId,
    service: servicio,
    config: { apiKey },
    enabled: true,
    updated_at: new Date().toISOString(),
  }
  const { error } = existente
    ? await supabase.from('user_integrations').update(fila).eq('id', existente.id)
    : await supabase.from('user_integrations').insert(fila)
  if (error) throw error
}

export async function borrarClaveDe(supabase, clientId, servicio) {
  const existente = await getClave(supabase, clientId, servicio)
  if (!existente) return
  const { error } = await supabase.from('user_integrations').delete().eq('id', existente.id)
  if (error) throw error
}

/**
 * Lanza la búsqueda de una fuente, con su clave si la necesita.
 *
 * Aquí es donde se decide que una fuente sin clave configurada NO se intenta:
 * es mejor un mensaje que diga qué falta que un 403 de un tercero traducido a
 * medias tres capas más abajo.
 */
export async function buscarEnFuente(supabase, clientId, key, params) {
  const fuente = fuenteDe(key)
  let clave = null

  if (fuente.servicio) {
    const fila = await getClave(supabase, clientId, fuente.servicio)
    clave = fila?.enabled ? fila?.config?.apiKey : null
    if (!clave) {
      throw Object.assign(
        new Error(`Falta la clave de ${fuente.nombre}. Ponla antes de buscar.`),
        { statusCode: 400 },
      )
    }
  }

  const { consulta, negocios } = await fuente.buscar(params, { clave })
  return { consulta, negocios, fuente: fuente.key }
}
