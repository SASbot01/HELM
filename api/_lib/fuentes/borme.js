// HELM — Fuente BORME: el Registro Mercantil, por la puerta de datos abiertos.
//
// Qué es: el Boletín Oficial del Registro Mercantil publica cada día laborable
// los actos inscritos de todas las sociedades españolas — constituciones,
// nombramientos y ceses de administradores, ampliaciones de capital, concursos.
// El BOE lo sirve en datos abiertos: un sumario en JSON por día y un XML por
// provincia. Sin clave, sin cuota y sin raspar una sola página.
//
// Por qué importa más que cualquier directorio: es la única fuente de esta casa
// que da el NOMBRE DE UNA PERSONA. Google Maps no tiene dueño, el aviso legal de
// una web da como mucho la razón social; el BORME dice "Adm. Unico: GARCIA
// LOPEZ JUAN" porque un registro público está obligado a decirlo. Y lo dice el
// mismo día en que se constituye la sociedad, que es el momento exacto en el que
// ese negocio va a contratar gestoría, seguros, web y todo lo demás.
//
// Ojo con lo que NO trae: teléfono, email ni web. No es un fallo del código —
// esos datos no están en el registro. Lo que sale de aquí es un nombre de
// sociedad, un domicilio, su objeto social y quién la administra; el teléfono
// se busca después (el enriquecimiento y los enlaces de la ficha).
//
// Antes de esto la pantalla dejaba un enlace al buscador del BORME "para mirar a
// mano", con una nota diciendo que no había endpoint. Sí lo hay: es este.
const SUMARIO = 'https://www.boe.es/datosabiertos/api/borme/sumario/'

// Las 52, tal y como el BORME titula cada sección provincial. Se comparan
// normalizadas (sin acentos, en mayúsculas), así que "valencia" encuentra
// "VALENCIA/VALÈNCIA" y "coruña" encuentra "A CORUÑA".
export const PROVINCIAS = [
  'ARABA/ÁLAVA', 'ALBACETE', 'ALICANTE/ALACANT', 'ALMERÍA', 'ASTURIAS', 'ÁVILA',
  'BADAJOZ', 'BARCELONA', 'BURGOS', 'CÁCERES', 'CÁDIZ', 'CANTABRIA',
  'CASTELLÓN/CASTELLÓ', 'CEUTA', 'CIUDAD REAL', 'CÓRDOBA', 'A CORUÑA', 'CUENCA',
  'GIRONA', 'GRANADA', 'GUADALAJARA', 'GIPUZKOA', 'HUELVA', 'HUESCA',
  'ILLES BALEARS', 'JAÉN', 'LEÓN', 'LLEIDA', 'LUGO', 'MADRID', 'MÁLAGA',
  'MELILLA', 'MURCIA', 'NAVARRA', 'OURENSE', 'PALENCIA', 'LAS PALMAS',
  'PONTEVEDRA', 'LA RIOJA', 'SALAMANCA', 'S.C. TENERIFE', 'SEGOVIA', 'SEVILLA',
  'SORIA', 'TARRAGONA', 'TERUEL', 'TOLEDO', 'VALENCIA/VALÈNCIA', 'VALLADOLID',
  'BIZKAIA', 'ZAMORA', 'ZARAGOZA',
]

// Qué actos se pueden pedir. La clave es lo que llega del navegador; `test` es
// lo que se busca en el texto del acto, tal y como lo escribe el registro.
export const ACTOS = {
  constitucion:  { label: 'Sociedades nuevas',      test: (t) => /^Constituci[óo]n/i.test(t) },
  nombramientos: { label: 'Nombramientos',          test: (t) => /Nombramientos/i.test(t) },
  ampliacion:    { label: 'Ampliaciones de capital', test: (t) => /Ampliaci[óo]n de capital/i.test(t) },
  todos:         { label: 'Todo lo inscrito',       test: () => true },
}

export const MAX_DIAS = 15
export const MAX_RESULTADOS = 300

const UA = 'HELM/1.0 (panel de gestión; contacto vía s4sf.net)'

// Sin acentos y en mayúsculas: es la única forma de que "malaga" case con
// "MÁLAGA" sin mantener una tabla de sinónimos a mano.
const plano = (s) => String(s || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toUpperCase().trim()

const entidades = (s) => String(s || '')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ').trim()

const yyyymmdd = (d) => [
  d.getUTCFullYear(),
  String(d.getUTCMonth() + 1).padStart(2, '0'),
  String(d.getUTCDate()).padStart(2, '0'),
].join('')

async function json(url) {
  const r = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': UA } })
  // 404 = ese día no hubo boletín (fin de semana, festivo). No es un error:
  // es la respuesta correcta a "¿qué se publicó el domingo?".
  if (r.status === 404) return null
  if (!r.ok) throw Object.assign(new Error(`El BOE respondió ${r.status}`), { statusCode: 502 })
  const data = await r.json().catch(() => null)
  return data?.status?.code === '200' ? data.data : null
}

/** El BOE devuelve `item` suelto cuando la sección trae uno solo. */
const lista = (v) => (Array.isArray(v) ? v : v ? [v] : [])

// ── El acto, en trozos ─────────────────────────────────────────────────────
// El texto del registro es telegráfico y siempre igual:
//
//   "Constitución. Comienzo de operaciones: 9.04.26. Objeto social: los
//    servicios de limpieza… Domicilio: AVDA DOLORES 17 (ELCHE). Capital:
//    3.000,00 Euros. Datos registrales. S 8, H A 9766, I/A 43 (30.07.26)."
//
// Se parte por etiquetas conocidas en vez de con un parser general porque el
// formato lo fija el registro, no cada registrador: lleva décadas idéntico.
const campo = (texto, etiqueta) => {
  const m = new RegExp(`${etiqueta}\\s*:\\s*([^.]*(?:\\.[^\\s][^.]*)*)`, 'i').exec(texto)
  return m ? entidades(m[1]).replace(/\s*$/, '') : ''
}

// El registro abrevia los cargos y lo hace de MUCHAS formas: "Adm. Unico",
// "Apo.Manc.", "Cons.Del.Sol", "Aud.C.Con.", "Socio Miembr"… Enumerarlas todas
// era la primera versión de esto y se dejaba fuera la mitad de los
// nombramientos reales, en silencio. Así que no se enumeran: se leen todas las
// parejas "ETIQUETA: VALOR" del tramo de nombramientos y se filtra por lo que
// se ve, que es mucho más fiable.
//
// Aquí solo están las que se traducen a algo legible. Lo que no esté se enseña
// tal cual lo escribe el registro — que es raro, pero es verdad.
const EXPANDE = {
  'adm. unico': 'Administrador único',
  'adm. solid.': 'Administrador solidario',
  'adm. mancom.': 'Administrador mancomunado',
  'adm.unico': 'Administrador único',
  'consejero': 'Consejero',
  'cons.del.sol': 'Consejero delegado solidario',
  'consej.deleg': 'Consejero delegado',
  'presidente': 'Presidente',
  'secretario': 'Secretario',
  'apoderado': 'Apoderado',
  'apo.manc.': 'Apoderado mancomunado',
  'apo.sol.': 'Apoderado solidario',
  'apo.man.soli': 'Apoderado mancomunado solidario',
  'liquidador': 'Liquidador',
  'soc.prof.': 'Socio profesional',
  'socio miembr': 'Socio miembro',
  'auditor': 'Auditor',
  'aud.c.con.': 'Auditor de cuentas consolidadas',
}

// Etiquetas que aparecen en el mismo sitio y NO son un cargo: son prosa del
// registrador explicando algo.
// "Otros conceptos" es el cajón de sastre del registrador y va en MAYÚSCULAS
// como los nombres ("DECLARACION DE SOCIEDAD UNIPERSONAL, SIENDO SOCIO UNICO
// X"), así que el filtro de mayúsculas no lo pilla: hay que nombrarlo.
const NO_ES_CARGO = /fe de erratas|datos registrales|otros conceptos|inscripci[óo]n|declaraci[óo]n|nota|observaciones/i

/**
 * Quién queda al mando según el acto.
 *
 * Solo se leen los NOMBRAMIENTOS. Los ceses y las revocaciones vienen en el
 * mismo párrafo y sería trivial sacarlos, pero un administrador que acaba de
 * cesar no es un contacto: es alguien que ya no manda en ese negocio. Por eso
 * el tramo se corta en cuanto empieza otra cosa.
 *
 * El filtro que hace el trabajo es el de las MAYÚSCULAS: el registro escribe los
 * nombres en caja alta ("MUÑOZ RODRIGUEZ NURIA") y la prosa en minúsculas ("Se
 * omitió por error…"). Con eso se separa un nombramiento de una explicación sin
 * tener que entender la frase.
 */
function personasDe(texto) {
  const tramo = /Nombramientos\.?\s*([\s\S]*?)(?:Ceses\/Dimisiones|Revocaciones|Datos registrales|$)/i.exec(texto)
  if (!tramo) return []
  const seg = tramo[1].trim()

  // Dónde empieza cada "ETIQUETA:" del tramo.
  //
  // La etiqueta tiene que abrir frase (principio del tramo o después de un
  // punto), y ese detalle es todo el parser: sin él, en "…NUÑEZ TREBOL IRIS. Fe
  // de erratas:" la etiqueta detectada empezaba en IRIS y el último nombramiento
  // se quedaba sin nombre de pila. Los cargos llevan puntos dentro
  // ("Adm. Unico", "Apo.Man.Soli"), así que no se puede cortar por el punto sin
  // más: se ancla en el que va SEGUIDO de espacio, que es el fin de frase.
  const etiquetas = []
  const re = /(?:^|\.\s+)([A-ZÁÉÍÓÚÑ][^:;]{1,26}?)\s*:\s*/g
  let m
  while ((m = re.exec(seg)) !== null) {
    etiquetas.push({ cargo: m[1].trim(), inicio: m.index, desde: m.index + m[0].length })
  }

  const salida = []
  for (let i = 0; i < etiquetas.length && salida.length < 12; i++) {
    const { cargo, desde } = etiquetas[i]
    // El valor llega hasta donde empieza la siguiente etiqueta, no hasta donde
    // se encuentre su texto: es la misma posición que ya calculó el escáner.
    const hasta = i + 1 < etiquetas.length ? etiquetas[i + 1].inicio : seg.length
    const valor = entidades(seg.slice(desde, hasta)).replace(/[.\s]+$/, '')

    if (NO_ES_CARGO.test(cargo)) continue
    // Con minúsculas dentro no es un nombre, es una frase.
    if (!valor || /[a-záéíóúñ]/.test(valor)) continue

    const nombre = EXPANDE[cargo.toLowerCase()] || cargo
    for (const persona of valor.split(';')) {
      const limpio = persona.replace(/[.\s]+$/, '').trim()
      if (limpio.length > 3 && salida.length < 12) {
        salida.push({ nombre: limpio, cargo: nombre, fuente: 'BORME' })
      }
    }
  }
  return salida
}

function actosDelXml(xml, item, fecha) {
  const salida = []
  // Cada acto son dos <p> seguidos: el titular con su número de asiento y el
  // párrafo con el contenido.
  const re = /<p class="articulo">([\s\S]*?)<\/p>\s*<p class="parrafo">([\s\S]*?)<\/p>/g
  let m
  while ((m = re.exec(xml)) !== null) {
    const cabecera = entidades(m[1])
    const texto = entidades(m[2])
    const corte = /^(\d+)\s*-\s*(.+?)\.?$/.exec(cabecera)
    if (!corte) continue

    salida.push({
      asiento: corte[1],
      nombre: corte[2].trim(),
      texto,
      provincia: entidades(item.titulo),
      fecha,
      url: item.url_html || item.url_pdf?.texto || '',
      boletin: item.identificador,
    })
  }
  return salida
}

/** Un acto del boletín, con la forma que espera la bandeja de prospectos. */
function normaliza(a) {
  const domicilio = campo(a.texto, 'Domicilio')
  const objeto = campo(a.texto, 'Objeto social')
  const capital = campo(a.texto, 'Capital')
  const personas = personasDe(a.texto)
  // El acto en una palabra, que es lo que se lee en la lista.
  const acto = /^Constituci[óo]n/i.test(a.texto) ? 'Constitución'
    : /Ampliaci[óo]n de capital/i.test(a.texto) ? 'Ampliación de capital'
      : /Nombramientos/i.test(a.texto) ? 'Nombramientos'
        : a.texto.split('.')[0].slice(0, 60)

  return {
    // Boletín + asiento. Único de verdad: el mismo asiento no se publica dos
    // veces, y así la misma sociedad puede volver a salir con otro acto sin
    // pisar al anterior.
    place_id: `borme:${a.boletin}:${a.asiento}`,
    nombre: a.nombre,
    direccion: domicilio ? `${domicilio}${domicilio.includes(a.provincia) ? '' : ` — ${a.provincia}`}` : a.provincia,
    telefono: '',
    web: '',
    // El objeto social dice a qué se dedica mejor que cualquier categoría de
    // directorio: lo ha escrito la propia sociedad ante notario.
    categoria: objeto ? objeto.slice(0, 180) : acto,
    rating: null,
    resenas: null,
    maps_url: a.url,
    lat: null,
    lng: null,
    email: '',
    extra: {
      acto,
      objeto,
      capital,
      boletin: a.boletin,
      fecha: a.fecha,
      provincia: a.provincia,
      personas,
    },
  }
}

/**
 * Busca actos inscritos.
 *
 * @param {object} p
 * @param {string} p.provincia  Nombre de provincia, o vacío para todas.
 * @param {number} p.dias       Cuántos días hacia atrás (máx. MAX_DIAS).
 * @param {string} p.acto       Clave de ACTOS.
 * @param {number} p.limite     Tope de resultados.
 *
 * Va día a día y de forma secuencial. Podría lanzarse todo a la vez y tardar un
 * tercio, pero son servidores públicos y gratuitos: se piden como los pediría
 * una persona, uno detrás de otro y con un tope de tiempo.
 */
export async function buscarBorme({ provincia = '', dias = 3, acto = 'constitucion', limite = 60 } = {}) {
  const filtro = ACTOS[acto] || ACTOS.todos
  const tope = Math.min(Math.max(Number(limite) || 60, 1), MAX_RESULTADOS)
  const atras = Math.min(Math.max(Number(dias) || 3, 1), MAX_DIAS)
  const buscada = plano(provincia)

  // Tope de reloj, no de peticiones: lo que mata a una función serverless es
  // el tiempo total, y un día del BOE con las 52 provincias son 52 XML.
  const limiteTiempo = Date.now() + 20_000

  const negocios = []
  const dentro = new Set()
  let diasMirados = 0
  let cursor = new Date()

  while (diasMirados < atras && negocios.length < tope && Date.now() < limiteTiempo) {
    const fecha = yyyymmdd(cursor)
    cursor = new Date(cursor.getTime() - 86_400_000)

    let sumario
    try { sumario = await json(SUMARIO + fecha) } catch { sumario = null }
    if (!sumario) continue          // no hubo boletín ese día
    diasMirados++

    const items = lista(sumario.sumario?.diario)
      .flatMap(d => lista(d.seccion))
      .filter(s => s.codigo === 'A')          // Sección I: empresarios, actos inscritos
      .flatMap(s => lista(s.item))
      // El índice alfabético no es una provincia: es el listado de sociedades
      // del día, sin actos. Si se cuela, se leen 300 nombres sin contenido.
      .filter(i => !/ÍNDICE|INDICE/i.test(i.titulo || ''))
      .filter(i => !buscada || plano(i.titulo).includes(buscada) || buscada.includes(plano(i.titulo)))

    for (const item of items) {
      if (negocios.length >= tope || Date.now() > limiteTiempo) break
      if (!item.url_xml) continue
      let xml
      try {
        const r = await fetch(item.url_xml, { headers: { 'User-Agent': UA } })
        if (!r.ok) continue
        xml = await r.text()
      } catch { continue }

      for (const a of actosDelXml(xml, item, fecha)) {
        if (negocios.length >= tope) break
        if (!filtro.test(a.texto)) continue
        const fila = normaliza(a)
        if (dentro.has(fila.place_id)) continue
        dentro.add(fila.place_id)
        negocios.push(fila)
      }
    }
  }

  const consulta = [
    filtro.label,
    provincia ? `en ${provincia}` : 'en toda España',
    `· últimos ${atras} día${atras === 1 ? '' : 's'}`,
  ].join(' ')

  return { consulta, negocios }
}
