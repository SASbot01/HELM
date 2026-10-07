// HELM — sacar los datos de contacto de la web de un negocio.
//
// Google Maps da el teléfono y poco más. El resto —email, redes, quién está
// detrás— está en la web del negocio, que Maps sí devuelve. Esto la lee.
//
// POR QUÉ ES LEGAL Y DÓNDE ESTÁ EL LÍMITE:
//   · Son páginas públicas de una empresa, servidas a cualquiera que entre. Se
//     lee lo mismo que vería una persona abriendo el navegador.
//   · Se respeta robots.txt. Si el sitio dice que no, no se entra: es la señal
//     estándar con la que un sitio expresa su voluntad, e ignorarla es lo que
//     convierte "leer una web" en "raspar una web".
//   · Se va identificado con un User-Agent propio y un enlace, no disfrazado de
//     navegador. Quien mire sus logs sabe quién ha entrado y a quién escribir.
//   · Una petición cada vez y pocas páginas por sitio. Esto no puede parecerse
//     a un ataque desde el lado del que lo recibe.
//   · Solo el dominio del propio negocio. Nada de seguir enlaces afuera.
//
// LO QUE ESTO NO HACE: no saca "el CEO". Ese dato no está en Maps ni suele
// estar en una web. Lo que sí está, en España, es el TITULAR del aviso legal
// (LSSI art. 10, de publicación obligatoria) y su CIF. Se guarda como
// `titular`, que es lo que es.
//
// PROTECCIÓN DE DATOS: lo que sale de aquí son datos de contacto profesionales
// publicados por la propia empresa. Para prospección B2B eso se ampara en el
// interés legítimo (RGPD art. 6.1.f), pero eso NO exime de identificarse en el
// primer contacto y de atender de inmediato a quien pida no ser contactado.
// Un autónomo es persona física: sus datos son datos personales.

import { fetchPublico } from './web.js'

const UA = 'HELM-Prospeccion/1.0 (+https://helm.s4sf.net; contacto: el perfil que hace la búsqueda)'

// Una web de empresa no ocupa esto. El tope está para no tragarse un PDF de
// 40 MB colgado en la home ni una página que devuelve datos sin fin.
const MAX_BYTES = 1_500_000
const TIMEOUT_MS = 7000

// Las páginas donde está lo que se busca, ordenadas por lo que aportan y no
// por lo habituales que son: si el tope corta la lista, tiene que haber cortado
// por las que menos importan.
//
//   /            → el pie: teléfono, email y redes
//   /aviso-legal → titular y CIF, que es lo único que dice quién está detrás
//   /equipo      → nombres con cargo
//
// Las variantes en inglés y los sinónimos van al final: son el plan B de cada
// una de las tres.
const RUTAS = [
  '/', '/aviso-legal', '/contacto', '/equipo', '/quienes-somos',
  '/legal', '/nosotros', '/sobre-nosotros', '/politica-de-privacidad', '/privacidad',
  '/contact', '/about', '/team',
]
// Cuántas páginas se llegan a pedir por sitio. Solo cuentan las que responden:
// un 404 no gasta cupo. Se corta antes en cuanto no queda nada que buscar.
const MAX_PAGINAS = 6

const RE_EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi
// Teléfonos españoles, con o sin prefijo y con los separadores que use cada uno.
const RE_TEL = /(?:\+34[\s.-]?|0034[\s.-]?)?(?:[6789]\d{2})[\s.-]?\d{2}[\s.-]?\d{2}[\s.-]?\d{2}/g
const RE_CIF = /\b([A-HJNP-SUVW]\d{7}[0-9A-J]|\d{8}[A-HJ-NP-TV-Z])\b/g

// Emails que no son de nadie: los que meten las plantillas, los de los
// plugins y las imágenes con @ en el nombre.
const EMAIL_BASURA = /(sentry|wixpress|example|domain|tudominio|email|sentry\.io|\.png|\.jpg|\.gif|@2x|@3x)/i

const limpio = (s, max = 200) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, max)

/** Quita etiquetas y scripts: lo que queda es lo que leería una persona. */
function aTexto(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
}

const normalizaTel = (t) => {
  const d = String(t).replace(/\D/g, '')
  const nueve = d.slice(-9)
  return /^[6789]\d{8}$/.test(nueve) ? `+34${nueve}` : null
}

async function traer(url) {
  const ctrl = new AbortController()
  const corta = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    // La web de un prospecto la escribe cualquiera (una lista pegada, una
    // fuente pública): sin el filtro, el servidor visitaría su propia red.
    const r = await fetchPublico(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': UA, Accept: 'text/html,text/plain;q=0.9' },
    })
    if (!r?.ok) return null
    // Solo HTML. Un PDF o un ZIP no se descargan ni para mirarlos.
    const tipo = r.headers.get('content-type') || ''
    if (!/text\/html|text\/plain/i.test(tipo)) return null
    const largo = Number(r.headers.get('content-length') || 0)
    if (largo > MAX_BYTES) return null

    const texto = await r.text()
    return texto.length > MAX_BYTES ? texto.slice(0, MAX_BYTES) : texto
  } catch {
    return null   // caído, lento, certificado malo: se pasa al siguiente
  } finally {
    clearTimeout(corta)
  }
}

/**
 * Lee robots.txt y devuelve qué rutas están prohibidas para nosotros.
 *
 * Implementación deliberadamente estricta: ante la duda, no se entra. Un
 * parser laxo que "interpreta" el robots.txt a su favor es exactamente lo que
 * no queremos que haga esto.
 */
async function reglasRobots(origen) {
  const txt = await traer(`${origen}/robots.txt`)
  // Sin robots.txt no hay prohibición: es el caso normal en una web pequeña.
  if (!txt) return { prohibidas: [], todoFuera: false }

  const prohibidas = []
  let aplica = false
  for (const linea of txt.split('\n')) {
    const l = linea.split('#')[0].trim()
    if (!l) continue
    const [campoRaw, ...resto] = l.split(':')
    const campo = campoRaw.trim().toLowerCase()
    const valor = resto.join(':').trim()

    if (campo === 'user-agent') {
      // Solo nos damos por aludidos con '*' o con nuestro nombre. Las reglas
      // para Googlebot no son para nosotros.
      aplica = valor === '*' || /helm/i.test(valor)
    } else if (campo === 'disallow' && aplica && valor) {
      if (valor === '/') return { prohibidas: [], todoFuera: true }
      prohibidas.push(valor)
    }
  }
  return { prohibidas, todoFuera: false }
}

const permitida = (ruta, reglas) =>
  !reglas.todoFuera && !reglas.prohibidas.some(p => ruta.startsWith(p))

// ── Extracción ─────────────────────────────────────────────────────────────

function emailsDe(html, texto, dominio) {
  const vistos = new Set()
  // Los mailto: primero: son los que el negocio ha puesto a propósito para que
  // le escriban, no una dirección que se ha colado en el texto.
  for (const m of html.matchAll(/mailto:([^"'?>\s]+)/gi)) vistos.add(m[1])
  for (const m of texto.matchAll(RE_EMAIL)) vistos.add(m[0])

  const buenos = [...vistos]
    .map(e => e.toLowerCase().trim())
    .filter(e => RE_EMAIL.test(e) && !EMAIL_BASURA.test(e))
  RE_EMAIL.lastIndex = 0

  // El del propio dominio manda: "hola@peluqueria.com" es de la peluquería;
  // un gmail suelto en el pie puede ser del que le hizo la web.
  const propio = buenos.find(e => dominio && e.endsWith('@' + dominio))
  return { email: propio || buenos[0] || '', todos: buenos.slice(0, 5) }
}

function redesDe(html) {
  const busca = (re) => {
    const m = html.match(re)
    return m ? limpio(m[0].replace(/["'<>]/g, ''), 200) : ''
  }
  return {
    // El negativo descarta las páginas de la propia red (sharer, /p/ de un
    // post): lo que se busca es el perfil, no un enlace de compartir.
    instagram: busca(/https?:\/\/(?:www\.)?instagram\.com\/(?!p\/|reel\/|explore)[A-Za-z0-9_.]+/i),
    facebook: busca(/https?:\/\/(?:www\.)?facebook\.com\/(?!sharer|share\.php|tr\?)[A-Za-z0-9_.\-/]+/i),
    linkedin: busca(/https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/(?:company|in)\/[A-Za-z0-9_%\-.]+/i),
  }
}

/**
 * El titular del aviso legal.
 *
 * La LSSI obliga a publicar "denominación social" o nombre del responsable, y
 * casi todo el mundo lo escribe con las mismas palabras. Se buscan esas
 * fórmulas y se coge lo que va detrás, hasta el primer corte razonable.
 *
 * Si no encaja ningún patrón se devuelve vacío. Preferimos un hueco a un dato
 * inventado: un nombre mal sacado acaba en el saludo de un email en frío.
 */
function titularDe(texto) {
  // El punto NO puede ser un separador: las formas jurídicas llevan puntos
  // ("PELUQUERIA LUNA S.L.") y cortando ahí se guardaba "PELUQUERIA LUNA S".
  // Se captura ancho y se recorta después, que es donde se puede distinguir un
  // punto de abreviatura del punto que acaba la frase.
  const patrones = [
    /(?:denominaci[oó]n social|raz[oó]n social)\s*[:\-–]?\s*([^;|\n]{3,90})/i,
    /(?:titular(?:\s+de\s+(?:este\s+)?(?:sitio|la\s+web|el\s+dominio))?)\s*[:\-–]\s*([^;|\n]{3,90})/i,
    /(?:responsable(?:\s+del?\s+(?:tratamiento|sitio\s+web|fichero))?)\s*[:\-–]\s*([^;|\n]{3,90})/i,
    /(?:titular\s+de\s+(?:este\s+)?(?:sitio\s+web|la\s+web)\s+es)\s+([^;|\n]{3,90})/i,
  ]
  for (const re of patrones) {
    const m = texto.match(re)
    if (!m) continue
    const v = limpio(m[1], 90)
      // La frase suele seguir con el CIF o el domicilio; se corta ahí.
      .replace(/\s*(?:con\s+)?(?:cif|nif|n\.i\.f|c\.i\.f|domicilio|direcci[oó]n|inscrita|tel[eé]fono|email)\b.*$/i, '')
      // Fin de frase: un punto seguido de una palabra normal. Un punto seguido
      // de UNA letra es una abreviatura (S.L., S.A., S.L.U.) y se conserva.
      .replace(/\.\s+(?=[A-ZÁÉÍÓÚÑ][a-záéíóúñ])/, '\u0000').split('\u0000')[0]
    const recortado = recortaFormaJuridica(v)
    if (recortado.length >= 3) return recortado
  }
  return ''
}

// "TALLERES GARCIA, S.A." es un nombre entero; "Juan Pérez, que vive en…" no.
// La coma solo separa cuando lo que viene detrás NO es una forma jurídica.
const FORMA_JURIDICA = /^(s\.?\s?l\.?\s?u?\.?|s\.?\s?a\.?\s?u?\.?|s\.?\s?c\.?\s?p?\.?|c\.?\s?b\.?|s\.?\s?coop\.?|s\.?\s?l\.?\s?n\.?\s?e\.?)$/i

function recortaFormaJuridica(valor) {
  let v = valor
  const coma = v.indexOf(',')
  if (coma > 0) {
    const cola = v.slice(coma + 1).trim().replace(/[.\s]+$/, m => m.includes('.') ? '.' : '')
    if (!FORMA_JURIDICA.test(cola)) v = v.slice(0, coma)
  }
  return v
    // Los avisos legales encadenan aclaraciones: "Juan Pablo Martínez González
    // (en adelante «el titular»)". El nombre acaba donde empieza el paréntesis
    // o la comilla; lo de después es la coletilla del abogado.
    .replace(/\s*[(\[«"“'].*$/, '')
    .replace(/[\s,;:\-–]+$/, '')
    // El punto final sobra salvo que cierre una abreviatura: en "S.L." va
    // pegado a una sola letra, en "Juan Pérez Gómez." cierra la frase.
    .replace(/(?<![A-ZÁÉÍÓÚÑ])\.$/, '')
    .trim()
}

function cifDe(texto) {
  const m = texto.match(RE_CIF)
  RE_CIF.lastIndex = 0
  return m ? m[0].toUpperCase() : ''
}

// ── Quién está detrás ──────────────────────────────────────────────────────
// Lo más cerca que se puede llegar del "dueño" sin inventarse nada. Dos vías,
// las dos con datos que la empresa publica sobre sí misma:
//
//   1. JSON-LD (schema.org). Muchas webs lo llevan sin saberlo, puesto por el
//      tema de WordPress o por el plugin de SEO, y trae founder/employee con
//      nombre y cargo ya etiquetados. Es la fuente buena: viene estructurada,
//      no hay que adivinar nada.
//   2. La página de equipo. Ahí el cargo y el nombre están pegados en el texto
//      ("María López · CEO y fundadora"), y eso sí hay que sacarlo a mano.
//
// Nunca se devuelve un nombre sin un cargo que lo justifique: "aparece un
// nombre propio en la web" no es "esta persona manda".

const CARGOS = 'ceo|c\\.e\\.o|fundador[ae]?s?|cofundador[ae]?s?|founder|co-?founder|propietari[oa]|due[ñn][oa]|gerente|director[ae]?\\s+general|administrador[ae]?\\s+[úu]nic[oa]|administrador[ae]?|socio[a]?\\s+director[ae]?|managing\\s+director|owner'
const RE_CARGO = new RegExp(`\\b(${CARGOS})\\b`, 'i')

// Un nombre español: dos o tres palabras que empiezan por mayúscula. Se exige
// la tilde/ñ en el rango para que "María" o "Muñoz" no queden fuera.
const RE_NOMBRE = /\b([A-ZÁÉÍÓÚÑ][a-záéíóúñ']{2,}(?:\s+(?:de|del|la|las|los|y)\s+)?(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ']{2,}){1,2})\b/

const RUIDO_NOMBRE = /(pol[ií]tica|aviso|cookies|reservados|derechos|contacto|inicio|servicios|empresa|whatsapp|instagram|facebook|linkedin|google|espa[ñn]a|madrid|barcelona|valencia)/i

/** Personas declaradas en el JSON-LD de la página. */
function personasDeJsonLd(html) {
  const salida = []
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let datos
    try { datos = JSON.parse(m[1].trim()) } catch { continue }

    // El JSON-LD puede venir suelto, en array o dentro de @graph.
    const nodos = []
    const mete = (x) => {
      if (!x || typeof x !== 'object') return
      if (Array.isArray(x)) { x.forEach(mete); return }
      nodos.push(x)
      if (Array.isArray(x['@graph'])) x['@graph'].forEach(mete)
    }
    mete(datos)

    for (const n of nodos) {
      for (const [campo, cargoPorDefecto] of [['founder', 'Fundador/a'], ['founders', 'Fundador/a'], ['employee', ''], ['employees', ''], ['author', '']]) {
        const v = n[campo]
        if (!v) continue
        for (const p of (Array.isArray(v) ? v : [v])) {
          const nombre = limpio(typeof p === 'string' ? p : p?.name, 80)
          if (!nombre || nombre.length < 5) continue
          const cargo = limpio(typeof p === 'object' ? (p.jobTitle || p.description || '') : '', 60) || cargoPorDefecto
          // Sin cargo no entra: un `author` de un blog no es el dueño.
          if (!cargo) continue
          salida.push({ nombre, cargo, fuente: 'schema.org' })
        }
      }
    }
  }
  return salida
}

/** Nombre + cargo sacados del texto de una página de equipo. */
function personasDelTexto(texto) {
  const salida = []
  // Se recorre por trozos cortos: en un texto largo, un cargo del principio y
  // un nombre del final no tienen nada que ver entre sí.
  for (const trozo of texto.split(/(?<=[.·|—\n])/)) {
    const t = trozo.trim()
    if (t.length < 6 || t.length > 140) continue
    const cargo = t.match(RE_CARGO)
    if (!cargo) continue
    const nombre = t.match(RE_NOMBRE)
    if (!nombre) continue
    const n = limpio(nombre[1], 80)
    if (RUIDO_NOMBRE.test(n)) continue
    salida.push({ nombre: n, cargo: limpio(cargo[1], 60), fuente: 'web' })
  }
  return salida
}

// Misma persona escrita dos veces (aparece en la home y en /equipo). El
// JSON-LD gana porque trae el cargo tal cual lo puso la empresa.
function unicas(personas) {
  const mapa = new Map()
  for (const p of personas) {
    const clave = p.nombre.toLowerCase().replace(/\s+/g, ' ')
    const antes = mapa.get(clave)
    if (!antes || (antes.fuente === 'web' && p.fuente === 'schema.org')) mapa.set(clave, p)
  }
  return [...mapa.values()].slice(0, 6)
}

function telefonosDe(texto) {
  const vistos = new Set()
  for (const m of texto.matchAll(RE_TEL)) {
    const t = normalizaTel(m[0])
    if (t) vistos.add(t)
  }
  return [...vistos].slice(0, 4)
}

/**
 * Todo lo que se pueda sacar de la web de un negocio.
 *
 * Nunca lanza: un sitio caído, con robots.txt cerrado o sin nada útil devuelve
 * un resultado vacío con el motivo. Enriquecer 20 negocios no puede fallar
 * entero porque uno de ellos tenga la web rota.
 */
export async function enriquecerDesdeWeb(web) {
  const vacio = {
    email: '', telefonos: [], instagram: '', facebook: '', linkedin: '',
    cif: '', titular: '', personas: [], paginas: 0,
  }
  if (!web) return { ...vacio, motivo: 'sin web' }

  let base
  try {
    base = new URL(/^https?:\/\//i.test(web) ? web : `https://${web}`)
  } catch {
    return { ...vacio, motivo: 'web no válida' }
  }
  const origen = base.origin
  const dominio = base.hostname.replace(/^www\./i, '')

  const reglas = await reglasRobots(origen)
  if (reglas.todoFuera) return { ...vacio, motivo: 'su robots.txt no permite entrar' }

  // La ruta de la propia web va primero: si la ficha de Maps apunta a
  // /es/inicio, ahí es donde está el pie con los datos, no en la raíz.
  const rutas = [...new Set([base.pathname !== '/' ? base.pathname : null, ...RUTAS].filter(Boolean))]

  const out = { ...vacio }
  const emails = new Set()
  const tels = new Set()
  const gente = []

  for (const ruta of rutas) {
    if (out.paginas >= MAX_PAGINAS) break
    if (!permitida(ruta, reglas)) continue

    // De una en una y no en paralelo: son las páginas de UN negocio pequeño, y
    // cinco peticiones a la vez a un hosting compartido se nota.
    const html = await traer(origen + ruta)
    if (!html) continue
    out.paginas++

    const texto = aTexto(html)

    const e = emailsDe(html, texto, dominio)
    for (const x of e.todos) emails.add(x)
    if (!out.email && e.email) out.email = e.email

    for (const t of telefonosDe(texto)) tels.add(t)

    const r = redesDe(html)
    out.instagram = out.instagram || r.instagram
    out.facebook = out.facebook || r.facebook
    out.linkedin = out.linkedin || r.linkedin

    // El titular y el CIF solo se buscan donde tiene sentido que estén. En la
    // home, "responsable:" suele ser el pie de un formulario de privacidad y
    // sale cualquier cosa.
    if (/legal|privacidad|aviso|condiciones/i.test(ruta)) {
      out.titular = out.titular || titularDe(texto)
      out.cif = out.cif || cifDe(texto)
    }

    // El JSON-LD se mira en todas las páginas (suele estar en la home); los
    // nombres del texto, solo donde se presenta el equipo — en cualquier otra
    // página, "director" y un nombre cerca son casualidad.
    gente.push(...personasDeJsonLd(html))
    if (/equipo|nosotros|about|team|quienes/i.test(ruta)) gente.push(...personasDelTexto(texto))

    // Se para cuando ya está todo lo que se venía a buscar. Antes bastaba con
    // el email y salía de la home sin haber mirado el aviso legal, que es
    // justo donde está el titular — se iba sin lo más valioso.
    if (out.email && out.titular && gente.length) break
  }

  out.telefonos = [...tels].slice(0, 4)
  out.personas = unicas(gente)
  if (!out.email && emails.size) out.email = [...emails][0]
  if (!out.paginas) out.motivo = 'no se pudo abrir la web'

  return out
}
