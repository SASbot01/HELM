// HELM — Avatar de ventas: el estudio de los clientes de un perfil.
//
// Una IA repasa los contactos del CRM uno a uno y, SOLO con lo que hay en su
// ficha, saca un perfil (género probable, rango de edad, dónde vive, qué
// factura, quién es). Con todos, arma el avatar del cliente tipo del negocio y
// dice qué datos faltan para afinarlo.
//
// Corre en el worker (scripts/agents-worker.mjs) como trabajo 'avatar', a
// petición (botón en Informe → Avatar de ventas). No inventa: lo que no se
// deduce de la ficha queda 'desconocido'.
import { supabase } from '../lib/supabase.js'
import { claudeTurno } from './anthropic.js'
import { notificar } from './notificar.js'

const CLAVE = () => process.env.AGENTS_ANTHROPIC_KEY || process.env.ANTHROPIC_API_KEY || ''
// Extraer ficha por ficha es clasificar: Haiku va sobrado y es barato. La
// síntesis del avatar sí pide más cabeza: Sonnet.
const MODELO_FICHA = process.env.AVATAR_MODELO_FICHA || 'claude-haiku-4-5'
const MODELO_AVATAR = process.env.AVATAR_MODELO || 'claude-sonnet-5'
const LOTE = 10
const TOPE_CONTACTOS = 400   // cota de coste; si hay más, los más recientes

// Campos de la ficha que de verdad dicen algo del cliente.
const CAMPOS = 'id, name, email, phone, whatsapp, company, position, instagram, country, address, ' +
  'source, status, notes, tags, custom_fields, deal_value, producto_interes, product, ' +
  'capital_disponible, situacion_actual, payment_type, utm_source, utm_campaign, created_at'

const limpio = (v) => (v == null ? '' : String(v)).replace(/\s+/g, ' ').trim().slice(0, 400)

// Prefijos internacionales de uno y dos dígitos. El plan de numeración (E.164)
// está hecho para que ningún prefijo empiece por otro, así que cortar por aquí
// es seguro; lo que no vale es dar por bueno cualquier 2xx/3xx/… de tres cifras,
// porque muchos no existen (ver PREFIJO_3).
const PREFIJO_1 = new Set(['1', '7'])
const PREFIJO_2 = new Set([
  '20', '27', '30', '31', '32', '33', '34', '36', '39', '40', '41', '43', '44', '45', '46', '47', '48', '49',
  '51', '52', '53', '54', '55', '56', '57', '58', '60', '61', '62', '63', '64', '65', '66',
  '81', '82', '84', '86', '90', '91', '92', '93', '94', '95', '98',
])

// Los prefijos de tres cifras SÍ asignados. Hace falta la lista porque, al revés
// que los de uno y dos, no todo el rango existe: 210, 214, 215, 217 o 219 no son
// ningún país. Sin este filtro, un móvil de Brasil con su código de zona (DDD 21
// → «219…») saldría como el inexistente +219. Solo los geográficos: los de redes
// y satélite (800, 870, 882…) no son de dónde es un contacto.
const PREFIJO_3 = new Set([
  // África y resto de 2xx
  '211', '212', '213', '216', '218', '220', '221', '222', '223', '224', '225',
  '226', '227', '228', '229', '230', '231', '232', '233', '234', '235', '236',
  '237', '238', '239', '240', '241', '242', '243', '244', '245', '246', '247',
  '248', '249', '250', '251', '252', '253', '254', '255', '256', '257', '258',
  '260', '261', '262', '263', '264', '265', '266', '267', '268', '269', '290',
  '291', '297', '298', '299',
  // Europa (3xx, 4xx)
  '350', '351', '352', '353', '354', '355', '356', '357', '358', '359', '370',
  '371', '372', '373', '374', '375', '376', '377', '378', '379', '380', '381',
  '382', '383', '385', '386', '387', '389', '420', '421', '423',
  // América (5xx)
  '500', '501', '502', '503', '504', '505', '506', '507', '508', '509', '590',
  '591', '592', '593', '594', '595', '596', '597', '598', '599',
  // Oceanía y Asia (6xx)
  '670', '672', '673', '674', '675', '676', '677', '678', '679', '680', '681',
  '682', '683', '685', '686', '687', '688', '689', '690', '691', '692',
  // Asia (8xx geográficos)
  '850', '852', '853', '855', '856', '880', '886',
  // Oriente Medio y Asia central (9xx)
  '960', '961', '962', '963', '964', '965', '966', '967', '968', '970', '971',
  '972', '973', '974', '975', '976', '977', '992', '993', '994', '995', '996',
  '998',
])

// Un campo de teléfono trae a menudo más de un número («968 12 34 56 - 600 11
// 22 33», «600123456 / 611223344») o una extensión («712 345 678 ext 12»).
// Sin partirlo, las cifras de todos se juntaban en una tira larga que pasaba
// por internacional: +968, +60, +7. El guion, solo con espacios a los lados:
// «600-12-34-56» es un número.
const SEPARA_NUMEROS = /[/,;|]|\s[-–]\s|(?<![a-z])ext(?:ensi[oó]n)?\.?/i

// Un enlace de WhatsApp (wa.me/34600…, api.whatsapp.com/send?phone=34600…)
// lleva siempre el número entero, con el país delante. Se saca antes de partir,
// porque la «/» de la URL se tomaría por separador.
const ENLACE_WHATSAPP = /(?:wa\.me\/|[?&]phone=)(?:\+|%2B)?(\d+)/i

/**
 * Del teléfono, solo el prefijo del país («+34»). Para saber de dónde es un
 * contacto no hace falta su número, y el número entero no tiene por qué salir
 * del CRM hacia Anthropic.
 *
 * Se mira solo el primer número del campo, al que antes se le quitan las marcas
 * invisibles de dirección y lo que haya delante del primer dígito o «+».
 * Internacional es lo que empieza por «+» o «00». Sin nada delante, una tira de
 * 12 o 13 cifras también lo es, si el campo trae ese número y ninguno más o si
 * viene de WhatsApp (`{ whatsapp: true }` o un enlace wa.me), que siempre guarda
 * el país. La de 11 cifras es ambigua (34+9 de España o DDD+9 de Brasil): solo
 * se acepta desde WhatsApp. Un número nacional (600 12 34 56) no dice el país:
 * se queda fuera, sin adivinar.
 */
export function prefijoTelefono(tel, { whatsapp = false } = {}) {
  // Las marcas invisibles de dirección (LRM/RLM, los aislantes LRE…PDI, el BOM)
  // que mete iOS/WhatsApp al copiar un número cuentan como «no dígito» y
  // descolocan la lectura: se quitan antes de nada.
  const campo = String(tel || '').replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, '').trim()
  const enlace = campo.match(ENLACE_WHATSAPP)
  const deWhatsapp = whatsapp || !!enlace
  const trozos = enlace ? [enlace[1]] : campo.split(SEPARA_NUMEROS).map(x => x.trim()).filter(Boolean)
  // Del primer número se tira lo que haya delante del primer dígito o «+»:
  // «(+34) 600…» y «Tel: +34 600…» empiezan de verdad en el «+».
  const t = (trozos[0] || '').replace(/^[^\d+]+/, '')
  const todas = t.replace(/\D/g, '')
  const porTira = !t.startsWith('+') && !todas.startsWith('00')
  const cifras = t.startsWith('+') ? todas
    : todas.startsWith('00') ? todas.slice(2)
      : (trozos.length === 1 || deWhatsapp) && esTira(todas, deWhatsapp) ? todas
        : ''
  // Con menos de siete cifras no es un teléfono, es basura en el campo.
  if (cifras.length < 7) return ''
  const n = PREFIJO_1.has(cifras[0]) ? 1 : PREFIJO_2.has(cifras.slice(0, 2)) ? 2 : 3
  const prefijo = cifras.slice(0, n)
  // Un prefijo de tres cifras sin asignar no es ningún país: fuera. Así «219…»
  // (un móvil de Brasil con su DDD, no +219) no se manda como país inexistente.
  if (n === 3 && !PREFIJO_3.has(prefijo)) return ''
  // Una tira escrita a mano, con espacios o paréntesis, solo lleva el país si
  // el primer grupo es justo el prefijo: «34 600 12 34 56» sí; «(21) 98765-4321»
  // es un móvil de Río con su código de zona, no +219.
  if (porTira && !/^\d+$/.test(t) && t.match(/^\d+/)?.[0] !== prefijo) return ''
  return `+${prefijo}`
}

// ¿Esta tira sin «+» lleva el país delante? De 11 a 13 cifras y sin un 0 al
// principio. Las de 11 son ambiguas (34+9 de España o DDD+9 de un móvil nacional
// de Brasil): solo se fían si vienen de WhatsApp, que siempre guarda el país;
// desde `phone` no se adivina. Y un 1 delante solo es Norteamérica con diez
// cifras detrás y el código de área empezando por 2-9: «11912345678» es un móvil
// de São Paulo guardado sin espacios, no un número de Estados Unidos.
function esTira(cifras, deWhatsapp) {
  if (cifras.length < 11 || cifras.length > 13 || cifras.startsWith('0')) return false
  if (cifras.length === 11 && !deWhatsapp) return false
  return cifras[0] !== '1' || /^1[2-9]\d{9}$/.test(cifras)
}

// Lo que se le enseña al modelo de cada contacto: solo lo que tiene valor, sin
// vaciarle encima campos vacíos.
function fichaTexto(c, i) {
  const pares = [
    ['nombre', c.name], ['empresa', c.company], ['cargo', c.position],
    ['país', c.country], ['dirección', c.address], ['instagram', c.instagram],
    // Primero el teléfono; si no dice el país (nacional, vacío), el WhatsApp.
    ['prefijo del teléfono', prefijoTelefono(c.phone) || prefijoTelefono(c.whatsapp, { whatsapp: true })], ['origen', c.source], ['campaña', c.utm_campaign || c.utm_source],
    ['etapa', c.status], ['producto de interés', c.producto_interes || c.product],
    ['valor del trato (€)', c.deal_value ? Number(c.deal_value) : ''],
    ['capital disponible', c.capital_disponible], ['situación', c.situacion_actual],
    ['forma de pago', c.payment_type], ['etiquetas', Array.isArray(c.tags) ? c.tags.join(', ') : ''],
    ['notas', c.notes],
    ['campos extra', c.custom_fields && Object.keys(c.custom_fields).length ? JSON.stringify(c.custom_fields).slice(0, 500) : ''],
  ].filter(([, v]) => v !== '' && v != null && v !== 0 && String(v).trim())
  return `[${i}] ` + pares.map(([k, v]) => `${k}: ${limpio(v)}`).join(' · ')
}

// ── Extraer la ficha de un lote de contactos ────────────────────────────────

const HERRAMIENTA_FICHAS = {
  name: 'entregar_fichas',
  description: 'Entrega la ficha de cada contacto del lote. Una entrada por cada número.',
  input_schema: {
    type: 'object',
    properties: {
      fichas: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            n: { type: 'integer', description: 'El número del contacto en el lote.' },
            genero: { type: 'string', enum: ['hombre', 'mujer', 'desconocido'] },
            genero_conf: { type: 'string', enum: ['alta', 'media', 'baja'], description: 'Cuánta confianza da el nombre u otra señal.' },
            edad_rango: { type: 'string', description: 'Un rango como "25-34" solo si hay una señal real; si no, "desconocido".' },
            ubicacion: { type: 'string', description: 'Ciudad o país si lo deduces de país, dirección, prefijo del teléfono…; si no, "desconocido".' },
            facturacion: { type: 'string', description: 'Lo que factura o su nivel de gasto si hay señal (valor del trato, capital, situación); si no, "desconocido".' },
            perfil: { type: 'string', description: 'En una frase, quién es (a qué se dedica, en qué momento está).' },
            interes: { type: 'string', description: 'En una frase, qué busca o qué le duele, según su ficha.' },
            senales: { type: 'string', description: 'En qué te has basado, breve (p. ej. "nombre, país y producto").' },
          },
          required: ['n', 'genero', 'genero_conf', 'edad_rango', 'ubicacion', 'facturacion', 'perfil', 'interes', 'senales'],
        },
      },
    },
    required: ['fichas'],
  },
}

const SISTEMA_FICHAS = `Eres un analista de clientes. Recibes las fichas del CRM de un negocio y, por cada contacto, sacas un perfil SOLO con lo que pone la ficha. Reglas:
· No inventes. Lo que no se pueda deducir de la ficha, ponlo como "desconocido".
· Género: dedúcelo del nombre de pila (en español/el idioma que sea) con confianza alta, media o baja. Si el nombre es ambiguo o no hay, "desconocido" con confianza baja.
· Edad: casi nunca está; solo da un rango si hay una señal clara (lo dice una nota, un dato…). Si no, "desconocido".
· Ubicación: del país, la dirección o el prefijo del teléfono (+34 España, +52 México, +54 Argentina, +57 Colombia…). Ciudad si se puede, si no el país. Si no hay nada, "desconocido".
· Facturación/gasto: del valor del trato, el capital disponible, la situación o el producto. Dilo como un nivel o una cifra ("factura poco/medio/alto", "~2.000 €", "aún no factura"). Si no hay señal, "desconocido".
· Perfil e interés: una frase cada uno, concretos, con lo que diga la ficha.
Entrega llamando a entregar_fichas, una sola vez, con una entrada por cada número de contacto que te den. Español de España.`

async function fichaLote(contactos, inicio) {
  const user = 'Fichas del CRM:\n' + contactos.map((c, k) => fichaTexto(c, inicio + k + 1)).join('\n')
  const r = await claudeTurno({
    apiKey: CLAVE(), model: MODELO_FICHA, system: SISTEMA_FICHAS,
    messages: [{ role: 'user', content: user }], tools: [HERRAMIENTA_FICHAS], maxTokens: 8000, esfuerzo: 'low',
  })
  const llamada = r.toolCalls.find(c => c.name === HERRAMIENTA_FICHAS.name)
  const fichas = Array.isArray(llamada?.args?.fichas) ? llamada.args.fichas : []
  const porN = new Map(fichas.map(f => [Number(f.n), f]))
  const filas = contactos.map((c, k) => {
    const f = porN.get(inicio + k + 1) || {}
    const gen = ['hombre', 'mujer'].includes(f.genero) ? f.genero : 'desconocido'
    return {
      contact_id: c.id, nombre: limpio(c.name),
      genero: gen, genero_conf: ['alta', 'media', 'baja'].includes(f.genero_conf) ? f.genero_conf : 'baja',
      edad_rango: limpio(f.edad_rango) || 'desconocido',
      ubicacion: limpio(f.ubicacion) || 'desconocido',
      facturacion: limpio(f.facturacion) || 'desconocido',
      perfil: limpio(f.perfil), interes: limpio(f.interes),
      senales: { base: limpio(f.senales) },
    }
  })
  return { filas, tokens: (r.usage?.in || 0) + (r.usage?.out || 0) }
}

// ── El avatar agregado ──────────────────────────────────────────────────────

const cuenta = (arr) => {
  const m = new Map()
  for (const x of arr) { const k = (x || 'desconocido').trim() || 'desconocido'; m.set(k, (m.get(k) || 0) + 1) }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([nombre, n]) => ({ nombre, n }))
}

const HERRAMIENTA_AVATAR = {
  name: 'entregar_avatar',
  description: 'Entrega el avatar del cliente tipo del negocio.',
  input_schema: {
    type: 'object',
    properties: {
      descripcion: { type: 'string', description: 'Un párrafo que retrata al cliente tipo: quién es, cómo es, en qué momento está. Solo con lo que dicen los datos.' },
      genero_dominante: { type: 'string' },
      edad_tipica: { type: 'string' },
      ubicacion_tipica: { type: 'string' },
      facturacion_tipica: { type: 'string' },
      dolores: { type: 'array', items: { type: 'string' }, description: '3-5 dolores o necesidades que se repiten.' },
      motivaciones: { type: 'array', items: { type: 'string' }, description: '3-5 motivaciones o deseos.' },
      donde_encontrarlos: { type: 'array', items: { type: 'string' }, description: '3-5 ideas de dónde y cómo llegar a más gente así, según de dónde vienen.' },
      huecos: { type: 'array', items: { type: 'string' }, description: 'Qué datos faltan en el CRM para afinar el avatar (p. ej. edad, ciudad), y cómo pedirlos.' },
    },
    required: ['descripcion', 'genero_dominante', 'edad_tipica', 'ubicacion_tipica', 'facturacion_tipica', 'dolores', 'motivaciones', 'donde_encontrarlos', 'huecos'],
  },
}

const SISTEMA_AVATAR = `Eres un estratega de marketing. Recibes el perfil de todos los clientes de un negocio (uno por contacto) y los repartos ya contados. Escribes el AVATAR del cliente tipo: el retrato de a quién le vende de verdad este negocio, para que pueda enfocar su contenido y sus anuncios.
· Solo con lo que dicen los datos. No inventes cifras ni rasgos que no estén.
· Si muchos campos son "desconocido", dilo y mételo en los huecos (qué falta y cómo pedirlo), sin rellenarlo a ojo.
· Dolores y motivaciones: sácalos de los intereses y perfiles que se repiten, no de tópicos.
· "Dónde encontrarlos": a partir de los orígenes/campañas y la ubicación.
Entrega llamando a entregar_avatar, una sola vez. Español de España, directo.`

async function sintetiza(perfil, filas, reparto) {
  const muestra = filas.slice(0, 120).map(f =>
    `· ${f.genero}/${f.edad_rango}/${f.ubicacion}/${f.facturacion} — ${f.perfil}${f.interes ? ` | quiere: ${f.interes}` : ''}`).join('\n')
  const user = [
    `Negocio: ${perfil.name}. Clientes analizados: ${filas.length}.`,
    `Reparto por género: ${JSON.stringify(reparto.genero)}`,
    `Ubicaciones (top): ${reparto.ubicaciones.slice(0, 8).map(x => `${x.nombre} (${x.n})`).join(', ')}`,
    `Orígenes (top): ${reparto.origenes.slice(0, 8).map(x => `${x.nombre} (${x.n})`).join(', ')}`,
    `Facturación (top): ${reparto.facturacion.slice(0, 8).map(x => `${x.nombre} (${x.n})`).join(', ')}`,
    `\nPerfil de cada cliente:\n${muestra}`,
  ].join('\n')
  const r = await claudeTurno({
    apiKey: CLAVE(), model: MODELO_AVATAR, system: SISTEMA_AVATAR,
    messages: [{ role: 'user', content: user }], tools: [HERRAMIENTA_AVATAR], maxTokens: 4000, esfuerzo: 'medium',
  })
  const a = r.toolCalls.find(c => c.name === HERRAMIENTA_AVATAR.name)?.args || {}
  return { avatar: a, tokens: (r.usage?.in || 0) + (r.usage?.out || 0) }
}

// ── El trabajo ──────────────────────────────────────────────────────────────

/** Trabajo 'avatar' del worker: payload { clientId }. */
export async function generaAvatar(job) {
  const { clientId } = job.payload || {}
  if (!CLAVE()) throw new Error('Falta la clave de Claude (AGENTS_ANTHROPIC_KEY)')
  const { data: perfil } = await supabase.from('clients').select('id, slug, name').eq('id', clientId).maybeSingle()
  if (!perfil) throw new Error('Ese perfil ya no existe')

  const { data: contactos, error } = await supabase.from('crm_contacts')
    .select(CAMPOS).eq('client_id', clientId)
    .order('last_activity_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false }).limit(TOPE_CONTACTOS)
  if (error) throw error
  if (!contactos?.length) throw new Error('Este perfil no tiene contactos en el CRM todavía.')

  // 1) Ficha por contacto, en lotes. Un lote que falle no tumba el estudio.
  let tokens = 0
  const filas = []
  for (let i = 0; i < contactos.length; i += LOTE) {
    const lote = contactos.slice(i, i + LOTE)
    try {
      const r = await fichaLote(lote, i)
      filas.push(...r.filas)
      tokens += r.tokens
    } catch (e) {
      console.log(`[avatar] ${perfil.slug}: lote ${i} falló (${e.message}); se omite`)
    }
  }
  if (!filas.length) throw new Error('No se ha podido analizar ningún contacto. Prueba otra vez en un momento.')

  // Guardar las fichas (reemplaza las anteriores de este perfil).
  await supabase.from('helm_avatar_contactos').delete().eq('client_id', clientId)
  for (let i = 0; i < filas.length; i += 200) {
    const trozo = filas.slice(i, i + 200).map(f => ({ client_id: clientId, ...f }))
    const { error: eIns } = await supabase.from('helm_avatar_contactos').insert(trozo)
    if (eIns) throw eIns
  }

  // 2) Repartos (contados en código, no a ojo del modelo).
  const reparto = {
    genero: {
      hombre: filas.filter(f => f.genero === 'hombre').length,
      mujer: filas.filter(f => f.genero === 'mujer').length,
      desconocido: filas.filter(f => f.genero === 'desconocido').length,
    },
    ubicaciones: cuenta(filas.map(f => f.ubicacion)).filter(x => x.nombre !== 'desconocido'),
    origenes: cuenta(contactos.map(c => limpio(c.source) || 'desconocido')).filter(x => x.nombre !== 'desconocido'),
    facturacion: cuenta(filas.map(f => f.facturacion)).filter(x => x.nombre !== 'desconocido'),
  }

  // 3) El avatar.
  const { avatar, tokens: tAvatar } = await sintetiza(perfil, filas, reparto)
  tokens += tAvatar

  const resumen = { avatar, reparto, n_contactos: contactos.length, n_analizados: filas.length, tope: contactos.length >= TOPE_CONTACTOS }
  const { error: eUp } = await supabase.from('helm_avatar').upsert({
    client_id: clientId, resumen, n_contactos: contactos.length, n_analizados: filas.length,
    tokens, generado_en: new Date().toISOString(),
  }, { onConflict: 'client_id' })
  if (eUp) throw eUp
  console.log(`[avatar] ${perfil.slug}: ${filas.length}/${contactos.length} contactos, ${tokens} tokens`)

  await notificar(supabase, clientId, {
    tipo: 'avatar', titulo: 'Tu avatar de ventas está listo',
    // La campana la ven todos los roles, también quien no tiene el avatar: el
    // cuerpo no lleva el resumen del estudio (retrata a los clientes del
    // negocio), solo adónde ir a verlo.
    cuerpo: 'Ábrelo en Informe → Avatar de ventas',
    // Ya no hay sección Avatar: vive en una pestaña del Informe. Los avisos
    // viejos con destino 'avatar' los traduce la campana (Notificaciones.jsx).
    destino: 'informe', clave: `avatar:${clientId}`, cadaHoras: 1,
  })
}

export async function encolaAvatar(clientId, { origen = 'manual' } = {}) {
  const { error } = await supabase.from('agent_jobs').upsert({
    tipo: 'avatar', payload: { clientId, origen }, clave: `avatar:${clientId}:${Date.now()}`,
    estado: 'pendiente', max_intentos: 1, correr_tras: new Date().toISOString(),
  }, { onConflict: 'clave', ignoreDuplicates: true })
  if (error) throw new Error(`No se pudo encolar el estudio: ${error.message}`)
}
