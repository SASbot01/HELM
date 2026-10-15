#!/usr/bin/env node
// HELM — Prospección para quien vende webs: negocios locales con reseñas y sin
// web (o con la web caída o anticuada), directos a un pipeline del CRM.
//
// Es lo mismo que hace el Scraper del panel (Places API oficial → helm_prospects
// → crm_contacts), en lote y con un filtro que el panel aún no tiene: mirar la
// web de cada negocio (api/_lib/web-antigua.js) y quedarse con los que la
// necesitan. Fuera las cadenas y las franquicias.
//
// Dos pasos, para que Google se pague una sola vez y nada se escriba sin verlo:
//
//   1) Preparar: busca, mira las webs, saca el email de las que cargan y deja
//      la lista elegida en un fichero (y un CSV para revisarla). No escribe en
//      la base de datos.
//
//   node --env-file=.env.server scripts/prospectar-sin-web.mjs --preparar \
//     --perfil web-seller --clave-de silvestre \
//     --tipos "joyería" --pipeline "Joyerías" --cuantos 50
//
//   2) Escribir: crea el pipeline (si no existe) y mete los elegidos, leyendo
//      el fichero del paso 1. No vuelve a llamar a Google.
//
//   node --env-file=.env.server scripts/prospectar-sin-web.mjs --escribir \
//     --perfil web-seller --pipeline "Joyerías"
//
// Opciones del paso 1:
//   --tipos           separados por comas; el total se reparte a partes iguales
//   --min-resenas     reseñas mínimas en Google (10)
//   --max-por-ciudad  tope por ciudad y tipo, para repartir por España (3)
//   --ciudades        lista propia separada por comas (por defecto, ~60)
//   --fichero         dónde se guarda (~/helm-logs/prospeccion-<perfil>-<pipeline>.json)
//
// PROTECCIÓN DE DATOS: son datos de contacto profesionales que publica el propio
// negocio, para prospección B2B (interés legítimo, RGPD 6.1.f). En el primer
// contacto hay que identificarse y atender al momento a quien no quiera
// saber nada. El email comercial sin permiso previo choca con la LSSI (art.
// 21): el primer contacto, mejor por teléfono.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { supabase } from '../api/lib/supabase.js'
import { buscarNegocios } from '../api/_lib/places.js'
import { getClave } from '../api/_lib/fuentes/index.js'
import { enriquecerDesdeWeb } from '../api/_lib/enriquecer.js'
import { diagnosticoWeb } from '../api/_lib/web-antigua.js'

// ── Argumentos ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const tiene = (k) => args.includes(k)
const valor = (k, def = '') => {
  const i = args.indexOf(k)
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def
}
const lista = (s) => String(s || '').split(',').map(x => x.trim()).filter(Boolean)

const MODO = tiene('--escribir') ? 'escribir' : tiene('--preparar') ? 'preparar' : null
const PERFIL = valor('--perfil')
const PIPELINE = valor('--pipeline')
if (!MODO || !PERFIL || !PIPELINE) {
  console.error('Uso: --preparar|--escribir --perfil <slug> --pipeline "<nombre>" [--tipos "a,b"] [--clave-de <slug>] [--cuantos 50]')
  process.exit(1)
}
const slugDe = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const FICHERO = valor('--fichero') ||
  path.join(os.homedir(), 'helm-logs', `prospeccion-${slugDe(PERFIL)}-${slugDe(PIPELINE)}.json`)

// ── Por dónde se busca ─────────────────────────────────────────────────────
// Capitales y ciudades medianas primero, repartidas por toda España; Madrid y
// Barcelona al final, que es donde más cadenas salen y menos local queda.
const CIUDADES = [
  'Valencia', 'Sevilla', 'Zaragoza', 'Málaga', 'Murcia', 'Bilbao', 'Alicante', 'Córdoba',
  'Valladolid', 'Vigo', 'Gijón', 'Granada', 'A Coruña', 'Vitoria-Gasteiz', 'Oviedo', 'Santander',
  'Pamplona', 'Salamanca', 'Burgos', 'León', 'Almería', 'Cádiz', 'Jerez de la Frontera', 'Huelva',
  'Badajoz', 'Cáceres', 'Albacete', 'Logroño', 'Castellón de la Plana', 'Tarragona', 'Lleida', 'Girona',
  'Ourense', 'Lugo', 'Toledo', 'Jaén', 'Palma', 'Las Palmas de Gran Canaria', 'Santa Cruz de Tenerife',
  'Cartagena', 'Elche', 'Marbella', 'Algeciras', 'Ciudad Real', 'Guadalajara', 'Pontevedra',
  'Santiago de Compostela', 'Palencia', 'Zamora', 'Segovia', 'Ávila', 'Cuenca', 'Huesca', 'Teruel',
  'Soria', 'Ponferrada', 'Talavera de la Reina', 'Mérida', 'Linares', 'Lorca', 'Gandía', 'Reus',
  'Madrid', 'Barcelona',
]

// Lo que tiene que parecer el negocio para contar como del tipo buscado. Google
// mete en «joyería en Valencia» también relojerías, tiendas de bisutería de
// centro comercial y algún «compro oro»; en «asesoría fiscal», abogados.
const TIPOS = {
  joyeria: {
    re: /joy|jewel|orfebr|plater|reloj|oro\b|gold/i,
    fuera: /bisuter[ií]a|compro oro|compraventa|casa de empe[nñ]o|empe[nñ]o|cash|quickgold|outlet/i,
  },
  'asesoria-fiscal': {
    re: /asesor|gestor|consult|contab|fiscal|tax|economist|despacho|auditor/i,
    fuera: /abogad|bufete|lawyer|seguro|inmobiliari|financiaci|hipotec/i,
  },
  'administrador-de-fincas': {
    re: /administra|fincas|comunidad|propiedad|property|horizontal/i,
    fuera: /inmobiliari|real estate|alquiler vacacional|tur[ií]stic/i,
  },
}
const reglasTipo = (tipo) => TIPOS[slugDe(tipo).replace(/es$/, '').replace(/s$/, '')] || TIPOS[slugDe(tipo)] || { re: /./, fuera: /^$/ }

// Cadenas y franquicias que se conocen por el nombre. El resto se detecta solo
// (misma web en varias ciudades, mismo nombre en varias ciudades, o la propia
// web diciendo «franquicia», «+50 oficinas»…).
const CADENAS = new RegExp([
  // joyería y relojería
  'pandora', '\\btous\\b', 'swarovski', 'joyer[ií]as? su[aá]rez', 'aristocrazy', '\\brabat\\b', 'majorica',
  '\\bagatha\\b', 'parfois', 'carrera y carrera', 'uno ?de ?50', 'unode50', 'thomas sabo', '\\blotus\\b',
  'viceroy', 'cash converters', 'quickgold', 'oro vivo', 'bijou brigitte', "claire'?s", 'singularu',
  'pdpaola', 'luxenter', 'time road', 'swatch', 'cartier', 'bvlgari', 'bulgari', 'tiffany', 'rolex',
  'chopard', 'louis vuitton', 'omega boutique', 'tag heuer', 'marina garc[ií]a', 'ale-?hop', 'mr\\.? ?wonderful',
  'el corte ingl[eé]s', 'hipercor', 'carrefour', 'grassy', 'superefectivo', 'compro ?oro', '\\bgrupo\\b', 'bagu[eé]s', 'yanes',
  // asesorías y fincas: redes, franquicias y grandes firmas
  'deloitte', 'kpmg', '\\bpwc\\b', 'pricewaterhouse', '\\bey\\b', 'ernst ?& ?young', '\\bbdo\\b', 'grant thornton',
  'mazars', 'forvis', 'baker tilly', '\\brsm\\b', '\\bcrowe\\b', '\\betl\\b', 'ayuda ?t ?pymes', '\\bgesem\\b',
  'arrabe', '\\blener\\b', 'garrigues', 'cuatrecasas', 'taxdown', 'declarando', 'infoaut[oó]nomos', 'gestor[ií]a online',
  'asesor[ií]a online', 'holded', 'quipu', 'tu ?asesor ?online', 'eurofincas', 'administradores asociados',
  'grupo ?eurofincas', 'fincas ?24', 'property ?partners', 'alfa inmobiliaria', 'tecnocasa', 'century 21', 'remax', 're\\/max',
].join('|'), 'i')

const UNA_HORA = 3600_000
const ahoraIso = () => new Date().toISOString()
const anioActual = new Date().getFullYear()

// Teléfono → solo dígitos y los 9 últimos, para comparar.
const cola = (t) => String(t || '').replace(/\D/g, '').slice(-9)
const hostDe = (web) => {
  try { return new URL(/^https?:\/\//i.test(web) ? web : `https://${web}`).hostname.replace(/^www\./i, '').toLowerCase() } catch { return '' }
}
// Móvil español (empieza por 6 o 7): el único al que tiene sentido escribir por WhatsApp.
const esMovil = (t) => /^[67]/.test(cola(t))

// Hasta `n` tareas a la vez. Son webs de terceros, cada una de un negocio
// distinto: varias a la vez no cargan a nadie, pero sin tope serían cientos.
async function enTandas(items, n, fn) {
  const out = new Array(items.length)
  let i = 0
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const k = i++
      out[k] = await fn(items[k], k)
    }
  }))
  return out
}

const ESTADO_WEB = {
  sin_web: { etiqueta: 'Sin web', peso: 3 },
  caida: { etiqueta: 'Web caída', peso: 3 },
  antigua: { etiqueta: 'Web anticuada', peso: 2 },
}

async function perfilPorSlug(slug) {
  const { data, error } = await supabase.from('clients').select('id, slug, name').eq('slug', slug).maybeSingle()
  if (error) throw error
  if (!data) throw new Error(`No hay ningún perfil con slug «${slug}»`)
  return data
}

// ═══════════════════════════════════════════════════════════════════════════
// 1) PREPARAR
// ═══════════════════════════════════════════════════════════════════════════
async function preparar() {
  const tipos = lista(valor('--tipos'))
  if (!tipos.length) throw new Error('Faltan --tipos (p. ej. --tipos "joyería")')
  const cuantos = Math.max(1, Number(valor('--cuantos', '50')) || 50)
  const minResenas = Math.max(0, Number(valor('--min-resenas', '10')) || 0)
  const maxPorCiudad = Math.max(1, Number(valor('--max-por-ciudad', '3')) || 3)
  const ciudades = lista(valor('--ciudades')).length ? lista(valor('--ciudades')) : CIUDADES
  const limitePorBusqueda = Math.min(60, Math.max(20, Number(valor('--por-busqueda', '60')) || 60))

  const perfil = await perfilPorSlug(PERFIL)
  const duenoClave = await perfilPorSlug(valor('--clave-de', PERFIL))
  const fila = await getClave(supabase, duenoClave.id, 'google_places')
  const clave = fila?.enabled ? fila?.config?.apiKey : null
  if (!clave) throw new Error(`El perfil «${duenoClave.slug}» no tiene una clave de Google Places activa`)

  // Lo que ya está en el CRM o en el Scraper de este perfil no se vuelve a traer.
  const { data: contactos } = await supabase.from('crm_contacts')
    .select('phone, custom_fields').eq('client_id', perfil.id).limit(20000)
  const { data: prospects } = await supabase.from('helm_prospects')
    .select('place_id').eq('client_id', perfil.id).limit(20000)
  const yaPlace = new Set([
    ...(prospects || []).map(p => p.place_id),
    ...(contactos || []).map(c => c.custom_fields?.place_id).filter(Boolean),
  ])
  const yaTel = new Set((contactos || []).map(c => cola(c.phone)).filter(t => t.length === 9))

  // Lo ya pagado y lo ya mirado, de ejecuciones anteriores: Google tiene un
  // tope diario de búsquedas y mirar una web tarda. Si Google corta a medias,
  // la siguiente ejecución sigue donde se quedó sin volver a pagar nada.
  const rutaCache = path.join(path.dirname(FICHERO), `places-cache-${slugDe(PERFIL)}.json`)
  let cache = { busquedas: {}, webs: {}, emails: {} }
  try { cache = { ...cache, ...JSON.parse(fs.readFileSync(rutaCache, 'utf8')) } } catch { /* primera vez */ }
  const guardaCache = () => {
    fs.mkdirSync(path.dirname(rutaCache), { recursive: true })
    fs.writeFileSync(rutaCache, JSON.stringify(cache))
  }
  const fresco = (iso, dias) => iso && Date.now() - Date.parse(iso) < dias * 24 * UNA_HORA
  let topeGoogle = false

  const porTipo = Math.ceil(cuantos / tipos.length)
  // Para elegir bien hace falta donde elegir: el doble de lo que se va a meter.
  const objetivoPool = porTipo * 2
  const busquedas = []
  const candidatos = []          // todos los que pasan el filtro, de todos los tipos
  let peticiones = 0

  for (const tipo of tipos) {
    const reglas = reglasTipo(tipo)
    let validos = 0
    let conWeb = 0      // anticuadas: las únicas de las que sale un email
    const vistosEnTipo = new Map()   // host → ciudades, nombre base → ciudades

    for (const ciudad of ciudades) {
      if (validos >= objetivoPool && conWeb >= Math.ceil(porTipo * 1.5)) break

      const kb = `${slugDe(tipo)}|${slugDe(ciudad)}|${limitePorBusqueda}`
      let consulta, negocios
      if (fresco(cache.busquedas[kb]?.en, 14)) {
        ({ consulta, negocios } = cache.busquedas[kb])
      } else {
        // Con el tope ya alcanzado solo se aprovecha lo que esté en la caché.
        if (topeGoogle) continue
        try {
          ({ consulta, negocios } = await buscarNegocios(clave, { tipo, zona: ciudad, limite: limitePorBusqueda }))
        } catch (e) {
          // El tope diario (o por minuto) de Google: se para de buscar y se
          // sigue con lo que hay. Lo buscado hasta aquí ya está en la caché.
          if (e.statusCode === 429) {
            topeGoogle = true
            console.warn(`  Google ha llegado a su tope de búsquedas en ${tipo} · ${ciudad}: sigo con lo que hay.`)
            continue
          }
          throw e
        }
        peticiones += Math.ceil(Math.max(negocios.length, 1) / 20)
        cache.busquedas[kb] = { en: ahoraIso(), consulta, negocios }
        guardaCache()
      }
      const busqueda = { tipo, zona: ciudad, consulta, encontrados: negocios.length, nuevos: 0 }
      busquedas.push(busqueda)

      // Primero lo barato: lo que se descarta sin abrir ninguna web.
      const filtrados = negocios.filter(n => {
        if (n.cerrado) return false
        if (!n.telefono) return false
        if ((n.resenas || 0) < minResenas) return false
        if (yaPlace.has(n.place_id) || yaTel.has(cola(n.telefono))) return false
        const texto = `${n.nombre} ${n.categoria}`
        if (!reglas.re.test(texto) || reglas.fuera.test(texto)) return false
        if (CADENAS.test(n.nombre) || CADENAS.test(hostDe(n.web))) return false
        // La web de Maps apuntando a la ficha de una tienda dentro de la web
        // de la marca: /tiendas/valencia-centro es una cadena.
        if (/\/(tiendas|tienda|stores?|oficinas|delegaciones|centros|sucursales|locations?|store-locator|puntos-de-venta)\/|compro-oro/i.test(n.web || '')) return false
        return true
      })
      busqueda.nuevos = filtrados.length

      // La misma web en dos ciudades, o el mismo nombre exacto en tres: es una
      // cadena. Se apunta aquí y se limpia al final (la primera aparición ya
      // puede estar dentro cuando sale la segunda). Por nombre hacen falta tres
      // porque «Joyería López» puede haber una en Valencia y otra en Sevilla
      // sin tener nada que ver.
      for (const n of filtrados) {
        const h = hostDe(n.web)
        const b = slugDe(n.nombre)
        for (const k of [h && `h:${h}`, b && `n:${b}`].filter(Boolean)) {
          const set = vistosEnTipo.get(k) || new Set()
          set.add(ciudad)
          vistosEnTipo.set(k, set)
        }
      }

      const diagnosticos = await enTandas(filtrados, 6, async (n) => {
        const kw = `${n.place_id}|${n.web || ''}`
        if (fresco(cache.webs[kw]?.en, 7)) return cache.webs[kw].d
        const d = await diagnosticoWeb(n.web, { anioActual })
        cache.webs[kw] = { en: ahoraIso(), d }
        return d
      })
      guardaCache()
      filtrados.forEach((n, i) => {
        const d = diagnosticos[i]
        if (!ESTADO_WEB[d.estado]) return
        if (d.cadena) return
        candidatos.push({ ...n, tipo, ciudad, web_diag: d })
        validos++
        if (d.estado === 'antigua') conWeb++
      })
      process.stdout.write(`  ${tipo} · ${ciudad}: ${negocios.length} en Google, ${filtrados.length} pasan el filtro, ${validos} candidatos (${conWeb} con web anticuada)\n`)
    }

    // Limpieza de cadenas por repetición entre ciudades.
    const cadenaPorRepeticion = (n) => {
      const h = hostDe(n.web)
      const b = slugDe(n.nombre)
      return (h && (vistosEnTipo.get(`h:${h}`)?.size || 0) >= 2) ||
        (b && (vistosEnTipo.get(`n:${b}`)?.size || 0) >= 3)
    }
    for (let i = candidatos.length - 1; i >= 0; i--) {
      if (candidatos[i].tipo === tipo && cadenaPorRepeticion(candidatos[i])) candidatos.splice(i, 1)
    }
  }

  // Un mismo negocio no entra dos veces aunque salga en dos tipos o con dos
  // fichas (mismo teléfono).
  const unicos = []
  const vistosTel = new Set()
  const vistosPlace = new Set()
  for (const c of candidatos) {
    const t = cola(c.telefono)
    if (vistosPlace.has(c.place_id) || vistosTel.has(t)) continue
    vistosPlace.add(c.place_id); vistosTel.add(t)
    unicos.push(c)
  }

  const prioridad = (c) =>
    ESTADO_WEB[c.web_diag.estado].peso +
    (c.web_diag.estado === 'antigua' ? Math.min(c.web_diag.puntos, 8) / 4 : 0) +
    Math.log10((c.resenas || 0) + 1) +
    // El email manda: lo pidió así quien encarga la lista. Los que no tienen
    // web casi nunca lo publican, así que entran después, con teléfono.
    (c.email ? 4 : 0)

  // Se elige por tipo, con tope por ciudad, y se lee la web solo de los que
  // tienen posibilidades de entrar (no de todo el pool).
  const elegir = (pool, n) => {
    const porCiudad = new Map()
    const out = []
    for (const c of [...pool].sort((a, b) => prioridad(b) - prioridad(a))) {
      if (out.length >= n) break
      const k = c.ciudad
      if ((porCiudad.get(k) || 0) >= maxPorCiudad) continue
      porCiudad.set(k, (porCiudad.get(k) || 0) + 1)
      out.push(c)
    }
    return out
  }

  const seleccion = []
  for (const tipo of tipos) {
    const pool = unicos.filter(c => c.tipo === tipo)
    // El email solo sale de webs que cargan: se leen todas las anticuadas.
    const aLeer = pool.filter(c => c.web_diag.estado === 'antigua' && c.web)
    await enTandas(aLeer, 4, async (c) => {
      const ke = c.web_diag.url || c.web
      const d = fresco(cache.emails[ke]?.en, 14) ? cache.emails[ke].d : await enriquecerDesdeWeb(ke)
      cache.emails[ke] = { en: cache.emails[ke]?.en && fresco(cache.emails[ke].en, 14) ? cache.emails[ke].en : ahoraIso(), d }
      c.email = d.email || ''
      c.instagram = d.instagram || ''
      c.facebook = d.facebook || ''
      c.telefonos_web = d.telefonos || []
      c.cif = d.cif || ''
      c.titular = d.titular || ''
      c.enriquecido_en = ahoraIso()
    })
    guardaCache()
    seleccion.push(...elegir(pool, porTipo))
  }
  const final = seleccion.slice(0, cuantos)

  const datos = {
    creado: ahoraIso(),
    perfil: { id: perfil.id, slug: perfil.slug },
    pipeline: PIPELINE,
    tipos, minResenas, maxPorCiudad,
    peticionesGoogle: peticiones,
    busquedas,
    pool: unicos,
    elegidos: final.map(c => c.place_id),
  }
  fs.mkdirSync(path.dirname(FICHERO), { recursive: true })
  fs.writeFileSync(FICHERO, JSON.stringify(datos, null, 1))

  // El CSV, para mirarlo antes de escribir nada.
  const csv = [['tipo', 'ciudad', 'nombre', 'telefono', 'email', 'google_maps', 'web', 'estado_web', 'motivos', 'resenas', 'rating']]
  for (const c of final) {
    csv.push([c.tipo, c.ciudad, c.nombre, c.telefono, c.email || '', c.maps_url, c.web_diag.url || c.web || '',
      ESTADO_WEB[c.web_diag.estado].etiqueta, c.web_diag.motivos.join(' · '), c.resenas ?? '', c.rating ?? ''])
  }
  const rutaCsv = FICHERO.replace(/\.json$/, '.csv')
  fs.writeFileSync(rutaCsv, csv.map(f => f.map(x => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\n'))

  const cuenta = (f) => final.filter(f).length
  console.log(`\nPool: ${unicos.length} candidatos · elegidos: ${final.length} (objetivo ${cuantos})`)
  for (const tipo of tipos) console.log(`  ${tipo}: ${cuenta(c => c.tipo === tipo)}`)
  console.log(`  sin web: ${cuenta(c => c.web_diag.estado === 'sin_web')} · web caída: ${cuenta(c => c.web_diag.estado === 'caida')} · anticuada: ${cuenta(c => c.web_diag.estado === 'antigua')}`)
  console.log(`  con email: ${cuenta(c => c.email)} · con teléfono: ${cuenta(c => c.telefono)} · ciudades: ${new Set(final.map(c => c.ciudad)).size}`)
  console.log(`  peticiones a Google: ${peticiones} (se facturan a la clave de «${duenoClave.slug}»)`)
  if (topeGoogle) console.log('  OJO: Google cortó por su tope de búsquedas. Vuelve a lanzar --preparar cuando se renueve: sigue donde lo dejó.')
  console.log(`\nGuardado en ${FICHERO}\nRevisión en ${rutaCsv}`)
}

// ═══════════════════════════════════════════════════════════════════════════
// 2) ESCRIBIR
// ═══════════════════════════════════════════════════════════════════════════
const ETAPAS = [
  { key: 'por_llamar', tone: '', label: 'Por llamar' },
  { key: 'llamado', tone: 'cyan', label: 'Llamado, sin respuesta' },
  { key: 'interesado', tone: 'amber', label: 'Interesado' },
  { key: 'propuesta', tone: 'violet', label: 'Propuesta enviada' },
  { key: 'ganado', tone: 'green', label: 'Ganado' },
  { key: 'perdido', tone: 'red', label: 'No le interesa' },
]

const handleIg = (url) => {
  const m = String(url || '').match(/instagram\.com\/([A-Za-z0-9_.]+)/i)
  return m ? m[1] : ''
}

async function escribir() {
  if (!fs.existsSync(FICHERO)) throw new Error(`No está ${FICHERO}: ejecuta antes --preparar`)
  const datos = JSON.parse(fs.readFileSync(FICHERO, 'utf8'))
  const perfil = await perfilPorSlug(PERFIL)
  if (datos.perfil.id !== perfil.id) throw new Error('Ese fichero se preparó para otro perfil')
  if (Date.now() - Date.parse(datos.creado) > 72 * UNA_HORA) {
    console.warn('Aviso: el fichero tiene más de 3 días; los datos de Google pueden haber cambiado.')
  }

  // ¿Está aplicada la migración de fuentes del Scraper? (columna `fuente`)
  const { error: sinFuente } = await supabase.from('helm_prospects').select('fuente').limit(1)
  const conFuente = !sinFuente

  // El pipeline, por nombre: volver a ejecutar no crea otro.
  let { data: pipeline } = await supabase.from('crm_pipelines')
    .select('id, name, stages').eq('client_id', perfil.id).eq('name', datos.pipeline).maybeSingle()
  if (!pipeline) {
    const { data, error } = await supabase.from('crm_pipelines')
      .insert({ client_id: perfil.id, name: datos.pipeline, stages: ETAPAS, substages: {}, is_default: false })
      .select('id, name, stages').single()
    if (error) throw error
    pipeline = data
    console.log(`Pipeline creado: «${pipeline.name}»`)
  } else {
    console.log(`Pipeline ya existía: «${pipeline.name}»`)
  }
  const etapa = (Array.isArray(pipeline.stages) && pipeline.stages[0]?.key) || 'lead'

  // Lo que ya está (de una ejecución anterior o de otra lista) no se duplica.
  const { data: contactos } = await supabase.from('crm_contacts')
    .select('id, phone, custom_fields').eq('client_id', perfil.id).limit(20000)
  const porPlace = new Map()
  const porTel = new Map()
  for (const c of contactos || []) {
    if (c.custom_fields?.place_id) porPlace.set(c.custom_fields.place_id, c.id)
    const t = cola(c.phone)
    if (t.length === 9) porTel.set(t, c.id)
  }
  const { data: yaProspects } = await supabase.from('helm_prospects')
    .select('id, place_id').eq('client_id', perfil.id).limit(20000)
  const prospectPorPlace = new Map((yaProspects || []).map(p => [p.place_id, p.id]))

  // Ya se escribió este fichero (todo el pool está en el Scraper): no se
  // repite el histórico ni el pool, solo se completa lo que falte del CRM.
  const yaEscrito = datos.pool.every(c => prospectPorPlace.has(c.place_id))

  // 1. El histórico de búsquedas, como si se hubieran hecho desde el Scraper.
  const filasBusqueda = datos.busquedas.map(b => ({
    client_id: perfil.id, zona: b.zona, tipo: b.tipo, consulta: b.consulta,
    encontrados: b.encontrados, nuevos: b.nuevos, lanzada_por: 'script prospectar-sin-web',
    ...(conFuente ? { fuente: 'maps', params: { tipo: b.tipo, zona: b.zona, lote: datos.pipeline } } : {}),
  }))
  const { data: busq, error: eb } = yaEscrito
    ? { data: [], error: null }
    : await supabase.from('helm_prospect_searches').insert(filasBusqueda).select('id, tipo, zona')
  if (eb) throw eb
  const busquedaDe = new Map((busq || []).map(b => [`${b.tipo}|${b.zona}`, b.id]))

  // 2. Todo el pool al Scraper: los elegidos irán al CRM ahora; el resto queda
  //    «nuevo» para importarlo desde el panel si hacen falta más.
  const filasProspect = datos.pool.filter(c => !prospectPorPlace.has(c.place_id)).map(c => ({
    client_id: perfil.id,
    search_id: busquedaDe.get(`${c.tipo}|${c.ciudad}`) || null,
    place_id: c.place_id,
    nombre: c.nombre, direccion: c.direccion, telefono: c.telefono, web: c.web || '',
    categoria: c.categoria, rating: c.rating, resenas: c.resenas,
    maps_url: c.maps_url, lat: c.lat, lng: c.lng,
    email: c.email || '', instagram: c.instagram || '', facebook: c.facebook || '',
    telefonos_web: c.telefonos_web || [], cif: c.cif || '', titular: c.titular || '',
    enriquecido_en: c.enriquecido_en || null,
    extra: { web: c.web_diag, ciudad: c.ciudad, tipo: c.tipo, lote: datos.pipeline },
    estado: 'nuevo',
    ...(conFuente ? { fuente: 'maps' } : {}),
    updated_at: ahoraIso(),
  }))
  for (let i = 0; i < filasProspect.length; i += 200) {
    const { data, error } = await supabase.from('helm_prospects').insert(filasProspect.slice(i, i + 200)).select('id, place_id')
    if (error) throw error
    for (const p of data || []) prospectPorPlace.set(p.place_id, p.id)
  }

  // 3. Los elegidos, al pipeline.
  const elegidos = datos.elegidos.map(id => datos.pool.find(c => c.place_id === id)).filter(Boolean)
  const nuevos = []
  const enlazados = []
  for (const c of elegidos) {
    const ya = porPlace.get(c.place_id) || porTel.get(cola(c.telefono))
    if (ya) { enlazados.push({ c, id: ya }); continue }
    const d = c.web_diag
    const porque = d.estado === 'antigua' ? `Web anticuada: ${d.motivos.join(' · ')}` : `${ESTADO_WEB[d.estado].etiqueta}: ${d.motivos.join(' · ')}`
    nuevos.push({
      c,
      fila: {
        client_id: perfil.id,
        name: c.nombre,
        company: c.nombre,
        phone: c.telefono,
        whatsapp: esMovil(c.telefono) ? c.telefono : '',
        email: c.email || '',
        instagram: handleIg(c.instagram),
        website: d.estado === 'sin_web' ? '' : (d.url || c.web || ''),
        address: c.direccion || '',
        source: 'Google Maps',
        status: etapa,
        pipeline_id: pipeline.id,
        tags: [c.tipo, ESTADO_WEB[d.estado].etiqueta],
        // Lo primero que mira quien va a llamar, en ese orden: por qué se le
        // llama, cuánta gente le conoce, y dónde verlo.
        notes: [
          porque,
          c.rating ? `Google: ${String(c.rating).replace('.', ',')}★ · ${c.resenas || 0} reseñas` : `${c.resenas || 0} reseñas en Google`,
          `Google Maps: ${c.maps_url}`,
          d.estado !== 'sin_web' && (d.url || c.web) ? `Web: ${d.url || c.web}` : '',
          c.direccion,
          c.categoria ? `Categoría: ${c.categoria}` : '',
          c.titular ? `Titular (aviso legal): ${c.titular}` : '',
          c.cif ? `CIF: ${c.cif}` : '',
        ].filter(Boolean).join('\n'),
        custom_fields: {
          fuente: 'maps',
          place_id: c.place_id,
          maps_url: c.maps_url,
          direccion: c.direccion,
          web: c.web || '',
          web_estado: d.estado,
          web_motivos: d.motivos,
          ciudad: c.ciudad,
          tipo: c.tipo,
          categoria: c.categoria,
          rating: c.rating,
          resenas: c.resenas,
          titular: c.titular || null,
          cif: c.cif || null,
          facebook: c.facebook || null,
        },
        last_activity_at: ahoraIso(),
      },
    })
  }

  let creados = []
  if (nuevos.length) {
    const { data, error } = await supabase.from('crm_contacts').insert(nuevos.map(n => n.fila)).select('id, custom_fields')
    if (error) throw error
    creados = data || []
  }
  const contactoDe = new Map(creados.map(c => [c.custom_fields?.place_id, c.id]))

  // 4. Cada prospect elegido apunta a su contacto.
  const marcas = [
    ...nuevos.map(n => ({ place: n.c.place_id, contactId: contactoDe.get(n.c.place_id) || null })),
    ...enlazados.map(e => ({ place: e.c.place_id, contactId: e.id })),
  ]
  for (const m of marcas) {
    const pid = prospectPorPlace.get(m.place)
    if (!pid) continue
    const { error } = await supabase.from('helm_prospects')
      .update({ estado: 'importado', contact_id: m.contactId, updated_at: ahoraIso() })
      .eq('id', pid).eq('client_id', perfil.id)
    if (error) console.warn('No se pudo marcar', m.place, error.message)
  }

  console.log(`Contactos nuevos en «${pipeline.name}»: ${creados.length} · ya estaban en el CRM: ${enlazados.length} · al Scraper (para más tarde): ${filasProspect.length - marcas.length}`)
}

const run = MODO === 'preparar' ? preparar : escribir
run().catch(e => { console.error('Error:', e.message || e); process.exit(1) })
