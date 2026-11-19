// HELM — Oportunidades comerciales por sector (CRM de WebSeller / Ocean Digital Services).
//
// El cold caller abre un lead y, sin escribir nada, ve qué problemas suele
// tener ese tipo de negocio, qué le podemos vender, qué preguntar y cómo
// enfocar la llamada. El análisis depende del SECTOR, no del lead: se genera
// una vez por sector con la IA del perfil y se guarda en agent_memory
// (ámbito 'oportunidades', clave 'oportunidades:<sector>'). El primer lead de
// un sector tarda unos segundos; los demás salen al momento.
//
// Lo propio de cada lead (sin web, solo Instagram, reseñas…) no pasa por la IA:
// se saca de sus campos y se pinta encima del análisis del sector.
import { supabase } from '../lib/supabase.js'
import { llmChat, proveedorDe } from './llm.js'
import { claudeTurno } from './anthropic.js'

export const AMBITO = 'oportunidades'
// Si cambia el prompt, subir la versión: los análisis guardados con otra
// versión se regeneran solos la próxima vez que alguien abra un lead.
export const VERSION = 1

const CLAVE_SERVIDOR = process.env.AGENTS_ANTHROPIC_KEY || process.env.ANTHROPIC_API_KEY || ''
const MODELO_SERVIDOR = process.env.HELM_OPORTUNIDADES_MODEL || 'claude-sonnet-5'

// ── Sector de un contacto ──────────────────────────────────────────────────
// Las mismas familias con las que se reparten y mezclan los leads de WebSeller
// (~/helm-logs/webseller-*.mjs): la etiqueta de sector o la categoría de Google.
const sinAcentos = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
const NO_SECTOR = new Set(['espana', 'lorca', 'lorca calle', 'captada en la calle'])
const GRUPOS = [
  ['talleres', 'Taller mecánico', /taller|chapa|neumatic|motos|coches/],
  ['barberias', 'Barbería', /barber/],
  ['peluqueria canina', 'Peluquería canina', /canina/],
  ['peluquerias', 'Peluquería', /peluquer/],
  ['estetica', 'Centro de estética', /estetic|belleza|unas/],
  ['carnicerias', 'Carnicería', /carnicer|charcuter/],
  ['fruterias', 'Frutería', /fruter/],
  ['panaderias', 'Panadería y pastelería', /panader|confiter|pasteler|horno/],
  ['pescaderias', 'Pescadería', /pescader/],
  ['bares', 'Bar o cafetería', /^bar|cafeter/],
  ['restaurantes', 'Restaurante', /restaur/],
  ['fisioterapia', 'Clínica de fisioterapia', /fisio|osteopat/],
  ['clinicas', 'Clínica (dental, podología, veterinaria…)', /clinic|dent|podolog|nutricion|veterinar/],
  ['abogados', 'Despacho de abogados', /abogad|despacho/],
  ['asesorias', 'Asesoría o gestoría', /asesor|gestor/],
  ['fontaneros', 'Fontanería', /fontaner/],
  ['electricistas', 'Electricista', /electric/],
  ['albaniles', 'Albañilería y reformas', /albanil|reforma|construc/],
  ['oficios', 'Oficios (cerrajería, climatización, carpintería…)', /cerraj|climatiz|carpinter|instalacion|tapicer/],
  ['autoescuelas', 'Autoescuela', /autoescuel/],
  ['joyerias', 'Joyería y relojería', /joyer|relojer/],
  ['inmobiliarias', 'Inmobiliaria', /inmobiliar/],
  ['gimnasios', 'Gimnasio o centro deportivo', /gimnas|crossfit|pilates|yoga/],
  ['floristerias', 'Floristería', /florist/],
]

/** { clave, nombre } del sector de un contacto del CRM, o null si no se sabe. */
export function sectorDe(contacto) {
  const tags = Array.isArray(contacto?.tags) ? contacto.tags : []
  const tag = tags.find(t => !NO_SECTOR.has(sinAcentos(t)))
  // `position` no: es el cargo de la persona («dueño»), no el negocio.
  const candidatos = [tag, contacto?.custom_fields?.categoria].map(sinAcentos).filter(Boolean)
  for (const bruto of candidatos) {
    for (const [clave, nombre, re] of GRUPOS) if (re.test(bruto)) return { clave, nombre }
  }
  // Un sector que no está en la lista: se usa tal cual (corto y limpio).
  const libre = candidatos[0]
  if (!libre) return null
  const clave = libre.replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40)
  return clave ? { clave, nombre: clave.charAt(0).toUpperCase() + clave.slice(1) } : null
}

/** Lo propio de este lead que cambia el enfoque: se pinta encima del análisis. */
export function senalesDe(contacto) {
  const cf = contacto?.custom_fields || {}
  const notas = String(contacto?.notes || '')
  const s = []
  const web = String(contacto?.website || '').trim()
  if (/solo Instagram/i.test(notas)) s.push('Solo tiene Instagram, sin web propia')
  else if (/solo Facebook/i.test(notas)) s.push('Solo tiene Facebook, sin web propia')
  else if (/solo página de reservas/i.test(notas)) s.push('Usa una página de reservas de terceros, sin web propia')
  else if (/solo WhatsApp/i.test(notas)) s.push('Solo WhatsApp, sin web propia')
  else if (!web && /sin web/i.test(notas)) s.push('No tiene página web')
  const rating = Number(cf.rating) || Number((notas.match(/([\d.,]+)★/) || [])[1]?.replace(',', '.')) || 0
  const resenas = Number(cf.resenas) || Number((notas.match(/(\d+)\s*rese/) || [])[1]) || 0
  if (rating && resenas) s.push(`${String(rating).replace('.', ',')}★ con ${resenas} reseñas en Google${resenas >= 80 ? ': mucha clientela, hay volumen que organizar' : ''}`)
  if (cf.ciudad) s.push(`${cf.ciudad}${cf.provincia && cf.provincia !== cf.ciudad ? ` (${cf.provincia})` : ''}`)
  return s
}

// ── Catálogo de soluciones ─────────────────────────────────────────────────
// Lo que Ocean Digital Services puede vender. A–F es el catálogo del documento
// de Laurent; G–L se añadieron el 19-nov para completar casos frecuentes en
// pequeño comercio. Cada uno lleva su marca: [estándar] se monta sin
// desarrollo nuevo; [a validar] necesita integración o visto bueno técnico.
export const CATALOGO = `
A. Páginas web y presencia digital
- Web corporativa o de servicios con formulario de contacto y botón de WhatsApp. [estándar]
- Web orientada a captar clientes (landing con oferta, llamada a la acción y medición). [estándar]
- Catálogo digital y tienda online sencilla. [estándar]
- Sistema de solicitud de presupuestos o pedidos desde la web (llegan por WhatsApp o correo). [estándar]

B. Chatbots e inteligencia artificial
- Chatbot de atención en la web o en WhatsApp que responde preguntas frecuentes (horarios, precios, disponibilidad). [a validar si es en WhatsApp]
- Asistente que recoge los datos de un cliente potencial y lo clasifica antes de pasarlo al negocio. [estándar en web]
- Respuestas automáticas a consultas repetitivas fuera de horario. [estándar]

C. Automatizaciones
- Avisos y recordatorios automáticos (citas, recogidas, presupuestos pendientes). [estándar]
- Automatización de tareas administrativas repetitivas (copiar datos, generar documentos, mandar correos). [a validar según herramientas]
- Conexión entre herramientas que ya usa el negocio (formularios, hojas de cálculo, correo, calendario). [a validar]

D. CRM y gestión comercial
- Seguimiento de clientes potenciales, presupuestos y oportunidades. [estándar]
- Recordatorios de seguimiento y comunicaciones a clientes. [estándar]

E. ERP y sistemas de gestión
- Inventario, pedidos, clientes y proveedores en un mismo sitio. [a validar]
- Control de procesos internos y de la información del negocio. [a validar]

F. Software a medida
- Paneles privados, herramientas internas y sistemas específicos para procesos que las herramientas normales no resuelven. [a validar: siempre]

G. Catálogo digital con QR y panel de gestión
- Carta, tarifa o catálogo con fotos, precios, categorías y ofertas, al que se entra con un QR que no cambia. [estándar]
- El dueño lo actualiza desde un panel privado: precios, productos, ofertas del día, agotados. Evita reimprimir cartas y tarifas. [estándar]

H. Reservas, citas y agenda online
- Reserva o cita desde la web o un enlace, con el hueco real del negocio. [estándar]
- Recordatorio automático antes de la cita para reducir ausencias. [estándar]
- Lista de espera y reprogramación sin llamadas. [a validar]

I. Pedidos anticipados y encargos
- Pedido o encargo desde casa (con hora de recogida) que llega ordenado por WhatsApp o a un panel. [estándar]
- Encargos especiales con fecha (tartas, bandejas, cestas, piezas por encargo). [estándar]

J. Reputación y presencia en Google
- Optimización de la ficha de Google (fotos, horarios, servicios, publicaciones). [estándar]
- Pedir reseñas a clientes satisfechos de forma automática después de la visita o la compra (QR o mensaje). [estándar]
- Responder reseñas con ayuda de IA. [estándar]

K. Fidelización y comunicación con clientes
- Tarjeta de puntos o sello digital (sin papel), con QR. [a validar]
- Lista de clientes para avisar de ofertas, novedades o huecos libres por WhatsApp o correo, con consentimiento. [estándar]
- Encuesta de satisfacción corta tras el servicio. [estándar]

L. Presupuestos, facturas y cobros
- Presupuestos con plantilla, enviados al momento y con seguimiento de si se aceptan. [estándar]
- Enlace de pago o señal por adelantado para reservas y encargos. [estándar]
- Facturación ordenada y conectada con la gestoría. [a validar: no improvisar nada fiscal]
`.trim()

// ── Instrucciones ──────────────────────────────────────────────────────────
// Adaptación del «Asistente de oportunidades comerciales» de Ocean Digital
// Services al CRM: aquí no hay comercial escribiendo, el sector lo da el lead,
// y la respuesta es JSON para pintarla en la ficha.
export const SISTEMA = `Eres el asistente de oportunidades comerciales de Ocean Digital Services, una empresa que vende soluciones de digitalización, automatización y desarrollo a pequeños negocios en España.

Te dan un tipo de negocio. Tu trabajo: que el comercial que va a llamarle sepa, en un minuto, qué problemas puede tener ese negocio, qué podemos venderle, qué preguntar para confirmarlo y cómo enfocar la llamada.

Cómo piensas:
- Entiende cómo funciona de verdad ese tipo de negocio en España (horarios, picos de trabajo, cómo le llegan los clientes, qué gestiona a mano) antes de proponer nada.
- No recomiendes una web a todo el mundo. Elige solo las soluciones del catálogo que resuelven un problema real de ese sector.
- Los problemas son hipótesis que el comercial tiene que confirmar en la llamada, no certezas.
- Vende resultados (tiempo, clientes, pedidos, orden), no tecnología.
- No inventes datos, estadísticas, pérdidas en euros ni casos de éxito. No prometas resultados.
- Si una solución está marcada [a validar], dilo en el campo "validacion".
- No pongas precios cerrados. Referencias internas para desarrollo a medida: sencillo desde 500 €, intermedio 700–1.000 €, avanzado 1.000–1.500 €, complejo se consulta con el responsable de desarrollo. Úsalas solo en "rango_precio" como orientación.
- Presta atención al catálogo digital con QR y panel (G): encaja en comercios con productos o precios que cambian (alimentación, restauración, tiendas, distribuidores), pero no en todos.
- Español de España, frases cortas y naturales, sin tecnicismos. Las preguntas se tienen que poder decir por teléfono tal cual.

Proceso comercial (el análisis tiene que servirle):
- Primera llamada: saludo, gancho del sector, detectar el problema, profundizar en las consecuencias, presentar UNA solución y su beneficio, explicar la demo gratuita acotada, hablar del precio cuando el alcance está claro y dejar cerrada una segunda llamada.
- Segunda llamada: enseñar la demo centrada en el problema detectado y cerrar.
- En la primera llamada no se vende todo: se elige lo que más encaja.

Catálogo de soluciones de Ocean Digital Services:
${CATALOGO}

Responde SOLO con un objeto JSON válido (sin texto antes ni después, sin \`\`\`), con esta forma exacta:
{
  "perfil": {
    "sector": "Servicios | Producto",
    "subsector": "…",
    "funcionamiento": "2-3 frases: cómo suele trabajar este negocio",
    "procesos": ["procesos importantes del día a día"],
    "areas_mejora": ["dónde suele haber margen de mejora"]
  },
  "oportunidades": [
    {
      "problema": "problema habitual, en una frase",
      "como_se_nota": "situación concreta que vive el dueño o el equipo",
      "consecuencia": "qué pierde: tiempo, clientes, ventas, control…",
      "solucion": "qué le ofrecemos, en palabras sencillas",
      "servicio": "letra y nombre del catálogo, p. ej. «I. Pedidos anticipados»",
      "beneficio": "resultado para el cliente",
      "pregunta": "pregunta natural para detectar si le pasa",
      "enfoque": "frase breve para introducir la solución sin sonar a venta"
    }
  ],
  "preguntas": [
    { "area": "Captación y ventas | Atención al cliente | Gestión diaria | Pedidos, reservas o citas | Inventario y organización | Seguimiento y fidelización", "preguntas": ["…"] }
  ],
  "soluciones": {
    "alta": [ { "nombre": "…", "que_es": "…", "resuelve": "…", "beneficio": "…", "servicio": "…", "validacion": "vacío si es estándar; si no, qué hay que validar", "rango_precio": "orientativo o vacío" } ],
    "media": [ ],
    "adicionales": [ ]
  },
  "llamada": {
    "gancho": "frase de apertura del sector que despierte interés",
    "ejemplo": "situación habitual con la que el dueño se identifique",
    "pregunta_principal": "la mejor pregunta para descubrir la necesidad",
    "conexion": "cómo introducir la ayuda sin explicación técnica",
    "demo": "qué enseñarle en una demo personalizada y acotada"
  },
  "top3": [ { "titulo": "…", "porque": "1-2 frases: impacto, frecuencia, facilidad de detectar y de enseñar en demo" } ]
}

Entre 4 y 8 oportunidades, ordenadas de más a menos impacto. De 2 a 4 áreas de preguntas, con 2-4 preguntas cada una. top3 con exactamente 3.`

// ── Generar y guardar ──────────────────────────────────────────────────────
async function pregunta(clientId, opts) {
  const prov = await proveedorDe(clientId)
  if (prov.tipo !== 'claude' && CLAVE_SERVIDOR) {
    const r = await claudeTurno({ ...opts, apiKey: CLAVE_SERVIDOR, model: MODELO_SERVIDOR })
    if (r.content) return r.content
  }
  return llmChat({ clientId, ...opts })
}

function leerJson(texto) {
  const t = String(texto || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
  const a = t.indexOf('{'), b = t.lastIndexOf('}')
  if (a < 0 || b <= a) throw new Error('La IA no ha devuelto un análisis válido.')
  const o = JSON.parse(t.slice(a, b + 1))
  if (!Array.isArray(o.oportunidades) || !o.oportunidades.length) throw new Error('El análisis no trae oportunidades.')
  return o
}

const claveDe = (sector) => `oportunidades:${sector}`

/** El análisis guardado de un sector, o null si no hay (o es de otra versión). */
export async function guardado(clientId, sector) {
  const { data, error } = await supabase.from('agent_memory')
    .select('contenido, updated_at').eq('client_id', clientId).eq('clave', claveDe(sector)).maybeSingle()
  if (error) throw error
  if (!data) return null
  try {
    const o = JSON.parse(data.contenido)
    if (o?.version !== VERSION) return null
    return { ...o, generado: data.updated_at }
  } catch { return null }
}

// Dos cold callers que abren a la vez el primer lead de un sector no tienen
// que pagar dos análisis: la segunda petición espera a la primera.
const enCurso = new Map()

/** Genera (y guarda) el análisis de un sector. */
export function generar(clientId, sector, nombre) {
  const k = `${clientId}|${sector}`
  if (enCurso.has(k)) return enCurso.get(k)
  const p = (async () => {
    let analisis = null, ultimoError = null
    for (let intento = 0; intento < 2 && !analisis; intento++) {
      try {
        const texto = await pregunta(clientId, {
          system: SISTEMA,
          messages: [{ role: 'user', content: `Tipo de negocio: ${nombre}` }],
          temperature: 0.4, maxTokens: 5000,
        })
        analisis = leerJson(texto)
      } catch (e) { ultimoError = e }
    }
    if (!analisis) throw ultimoError
    const fila = { version: VERSION, sector, nombre, analisis }
    // El índice único (client_id, clave) es parcial, así que upsert no lo
    // reconoce: se busca la fila y se actualiza o se crea.
    const datos = {
      client_id: clientId, ambito: AMBITO, agente: AMBITO, tipo: 'analisis-sector',
      clave: claveDe(sector), contenido: JSON.stringify(fila), etiquetas: [sector],
      updated_at: new Date().toISOString(),
    }
    const { data: hay } = await supabase.from('agent_memory').select('id')
      .eq('client_id', clientId).eq('clave', claveDe(sector)).maybeSingle()
    const { error } = hay
      ? await supabase.from('agent_memory').update(datos).eq('id', hay.id)
      : await supabase.from('agent_memory').insert(datos)
    if (error) throw error
    return { ...fila, generado: new Date().toISOString() }
  })()
  enCurso.set(k, p)
  p.finally(() => enCurso.delete(k)).catch(() => {})
  return p
}
