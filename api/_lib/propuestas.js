// HELM — la bandeja de los agentes de departamento (28-oct-2026).
//
// Un agente (cobrador, seguimiento, conciliación…) detecta algo que hay que
// hacer y, si toca a un cliente o al dinero, no lo hace: lo PROPONE. La
// propuesta llega al Telegram de la agencia con «Aprobar / Rechazar» y a
// Agentes → Bandeja del panel. Al aprobarla:
//
//   · con `herramienta` (una escritura del bot: crm_tarea, registrar_cuota,
//     crm_mover_etapa…), se aplica con api/_lib/bot-herramientas.js, que la
//     vuelve a preparar con los datos de ese momento y, si sale otra cosa que
//     lo que enseñó la tarjeta (`resumen`), no la hace. Se aplica SIEMPRE el
//     `input` guardado al proponerla: quien aprueba solo dice sí o no. Queda en
//     el registro de auditoría con quien la aprobó.
//   · sin herramienta (un mensaje que mandas tú desde el móvil con el enlace
//     de WhatsApp), aprobarla es darla por hecha.
//
// `clave` hace que el mismo agente no proponga dos veces lo mismo: la segunda
// vez no se crea ni se avisa. Las pendientes caducan (por defecto a los 3 días)
// y caducadas no se pueden aprobar. Solo decide alguien de la agencia del
// perfil (la de ahora: si el perfil ha cambiado de agencia, no vale).
//
// Los textos (título, porqué, mensaje, resumen, resultado) son DATOS: salen
// sin Markdown en Telegram y como texto en el panel, y no se interpretan.
//
// Uso:
//   import { proponer, decidir, caducarPropuestas, listarPropuestas } from './propuestas.js'
//   await proponer({ clientId, agente: 'cobrador', clave: `cobrador:${venta}:${n}`,
//     titulo: 'Cuota de Ana (197 €) vence hoy', porque: '…',
//     herramienta: 'registrar_cuota', input: { venta: '…', importe: 197 },
//     mensaje: 'Hola Ana, …', telefono: '+34 600…' })
//   // → la fila nueva; null si esa clave ya estaba; { creada: false, motivo }
//   //   si la herramienta dice que no se puede o que no hace falta. Para
//   //   contar las creadas: `if (r?.id) n++`.
//   await decidir({ id, aprobar: true, agenciaId, quien: { id, email, nombre } })
import { supabase } from '../lib/supabase.js'
import { agenciaDe } from './access.js'
import { herramientasBot, esAccionVacia } from './bot-herramientas.js'
import { alcanceDesdeContexto } from '../mcp/[token].js'
import { tg, tokenAgencia, agenciaPermitida, enviarConBotones } from './telegram.js'

export const TABLA = 'helm_propuestas'
export const HORAS_CADUCA = 72
const MAX_HORAS_CADUCA = 30 * 24
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const AGENTE = /^[a-z0-9][a-z0-9-]{0,39}$/

// Topes: lo que se guarda y se enseña tiene un tamaño razonable. Lo que se
// corta lleva «…»; la clave, el input y los datos no se cortan nunca
// (cambiarían lo que son): si se pasan, es un error del agente. Los de datos e
// input, en bytes del JSON. Migración 116 tiene los mismos con margen.
export const TOPES = { clave: 300, titulo: 200, porque: 1500, mensaje: 1500, resumen: 20000, resultado: 1500, datos: 4000, input: 20000 }

// Sin mitades de emoji: una suelta (de un texto roto o de cortar por en medio)
// rompe encodeURIComponent y el JSON de Telegram.
const SUELTA = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g
const bienFormado = (s) => s.replace(SUELTA, '\uFFFD')
const recorta = (t, n) => {
  const s = bienFormado(String(t ?? '').trim())
  if (s.length <= n) return s
  let corte = n - 1
  // No partir un emoji (dos unidades UTF-16) por la mitad.
  if (/[\uD800-\uDBFF]/.test(s[corte - 1])) corte--
  return `${s.slice(0, corte).trimEnd()}…`
}
const largoJson = (v) => {
  try { return Buffer.byteLength(JSON.stringify(v ?? null), 'utf8') } catch { return Infinity }
}

/**
 * El enlace de WhatsApp (wa.me) con el mensaje escrito, o null si el teléfono
 * no vale. Con prefijo (+ o 00), cualquier país; sin prefijo, un número
 * español de 9 cifras (se le pone el 34) o uno que ya lleve su prefijo de
 * país (11 a 15 cifras). Letras u otros signos: null.
 */
export function enlaceWhatsapp(telefono, mensaje = '') {
  const crudo = String(telefono ?? '').trim()
  if (!crudo || crudo.length > 40 || /[^\d\s().+-]/.test(crudo)) return null
  let d = crudo.replace(/[\s().-]/g, '')
  let internacional = false
  if (d.startsWith('+')) { d = d.slice(1); internacional = true } else if (d.startsWith('00')) { d = d.slice(2); internacional = true }
  if (!/^\d+$/.test(d)) return null
  if (!internacional) {
    if (/^[6-9]\d{8}$/.test(d)) d = `34${d}`
    else if (!/^[1-9]\d{10,14}$/.test(d)) return null
  }
  if (!/^[1-9]\d{7,14}$/.test(d)) return null
  // Un número español son 9 cifras detrás del 34.
  if (d.startsWith('34') && !/^34[6-9]\d{8}$/.test(d)) return null
  const texto = bienFormado(String(mensaje ?? '').trim())
  return `https://wa.me/${d}${texto ? `?text=${encodeURIComponent(texto)}` : ''}`
}

/** ¿Es un enlace de WhatsApp de los que hace enlaceWhatsapp? Cualquier otro (javascript:, otra web) no se guarda ni se enseña. */
export const esEnlaceWhatsapp = (url) => typeof url === 'string' && url.length <= 8000
  && /^https:\/\/wa\.me\/[1-9]\d{7,14}(\?text=[A-Za-z0-9\-_.!~*'()%]*)?$/.test(url)

// Las herramientas del bot con el alcance de la agencia. `quien` es quien
// aprueba (va al registro de auditoría); al crear la propuesta, nadie.
async function herramientasDe(agenciaId, quien = null) {
  const alcance = await alcanceDesdeContexto({ agenciaId }, { origen: 'agentes', quien: quien?.nombre || 'Agentes de HELM' })
  if (!alcance) throw new Error('No encuentro la agencia del perfil')
  const lista = await herramientasBot({ alcance, agenciaId, superadmin: quien || {} })
  return new Map(lista.map(h => [h.name, h]))
}

// A quién de la agencia le llega por Telegram: los administradores vinculados
// cuya cuenta está activa y es AHORA de la agencia (lo que diga el vínculo
// puede ser de antes de cambiar de agencia; son pocas filas).
async function chatsDeAgencia(agenciaId) {
  if (!tokenAgencia() || !agenciaId || !(await agenciaPermitida(supabase, agenciaId))) return []
  const { data, error } = await supabase.from('helm_telegram_vinculos')
    .select('tg_chat_id, superadmins(active, agencia_id)')
    .not('tg_chat_id', 'is', null)
  if (error) throw error
  return [...new Set((data || [])
    .filter(v => v.tg_chat_id != null && v.superadmins && v.superadmins.active !== false && v.superadmins.agencia_id === agenciaId)
    .map(v => v.tg_chat_id))]
}

/**
 * Un aviso suelto (el parte del día, un informe) a los administradores de la
 * agencia, en texto plano (lleva datos de clientes: un `_` o un [texto](url)
 * no pueden cambiar lo que se ve). Nunca lanza. → a cuántos chats ha llegado.
 */
export async function avisarAgencia(agenciaId, texto) {
  try {
    const t = String(texto ?? '').trim()
    if (!t) return 0
    const chats = await chatsDeAgencia(agenciaId)
    const r = await Promise.all(chats.map(id => enviarConBotones(tokenAgencia(), id, t, null, { plano: true }).then(() => 1, () => 0)))
    return r.reduce((a, b) => a + b, 0)
  } catch (e) {
    console.warn('[propuestas] no se pudo avisar a la agencia:', e?.message || e)
    return 0
  }
}

// La tarjeta: sin Markdown (lo que se aprueba es lo que se ve, tal cual).
export function textoTarjeta(p, perfil) {
  return [
    `🟡 [${perfil}] ${p.titulo}`,
    p.porque ? `\n${p.porque}` : '',
    p.resumen ? `\nAl aprobar: ${p.resumen}` : '',
    p.mensaje ? `\nMensaje para el cliente:\n«${p.mensaje}»` : '',
    p.enlace ? '\n(El botón de WhatsApp lo abre ya escrito: lo mandas tú.)' : '',
  ].join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

/** Los botones de la tarjeta: Aprobar/Rechazar y, si hay, el de WhatsApp. */
export function botonesTarjeta(fila, { conWhatsapp = true } = {}) {
  const filas = [[
    { text: fila.herramienta ? '✅ Aprobar' : '✅ Hecho', callback_data: `pa:${fila.id}` },
    { text: '❌ Rechazar', callback_data: `pr:${fila.id}` },
  ]]
  if (conWhatsapp && esEnlaceWhatsapp(fila.enlace)) filas.push([{ text: '💬 Abrir WhatsApp', url: fila.enlace }])
  return filas
}

async function mandarTarjeta(fila, perfil) {
  const token = tokenAgencia()
  const chats = await chatsDeAgencia(fila.agencia_id)
  if (!token || !chats.length) return []
  // Telegram no deja más de 4096 caracteres: lo que no cabe, entero en el panel.
  const entero = textoTarjeta(fila, perfil)
  const texto = entero.length > 3900 ? `${recorta(entero, 3780)}\n\n(Entera en HELM → Agentes → Bandeja.)` : entero
  const enviados = []
  for (const chat of chats) {
    const manda = (conWhatsapp) => tg(token, 'sendMessage', {
      chat_id: chat, text: texto, reply_markup: { inline_keyboard: botonesTarjeta(fila, { conWhatsapp }) }, disable_web_page_preview: true,
    })
    try {
      let m
      try {
        m = await manda(true)
      } catch (e) {
        // Un enlace que Telegram no acepta en un botón no deja sin tarjeta: va sin él.
        if (!fila.enlace || e?.telegramCode !== 400) throw e
        m = await manda(false)
      }
      if (m?.message_id) enviados.push({ chat: String(chat), msg: m.message_id })
    } catch (e) {
      console.warn('[propuestas] no se pudo mandar la tarjeta:', e?.message || e)
    }
  }
  return enviados
}

/**
 * Crea una propuesta (si no estaba) y la manda al Telegram de la agencia.
 * Devuelve la fila nueva; null si ya existía esa clave; o { creada: false,
 * motivo } si la herramienta dice que no se puede hacer o que no hace falta.
 * Si Telegram falla, la propuesta queda creada igual (y en el panel).
 */
export async function proponer({
  clientId, agente, clave, titulo, porque = '', herramienta = null, input = null,
  mensaje = null, telefono = null, enlace = null, datos = {}, caducaHoras = HORAS_CADUCA, avisar = true,
} = {}) {
  if (!clientId || !agente || !clave || !titulo) throw new Error('proponer: faltan clientId, agente, clave o titulo')
  if (!AGENTE.test(String(agente))) throw new Error(`proponer: agente no válido (${String(agente).slice(0, 40)})`)
  const laClave = String(clave).trim()
  if (!laClave || laClave.length > TOPES.clave) throw new Error(`proponer: la clave tiene que tener entre 1 y ${TOPES.clave} caracteres`)
  const elTitulo = recorta(titulo, TOPES.titulo)
  if (!elTitulo) throw new Error('proponer: el título está vacío')
  if (herramienta != null && (typeof herramienta !== 'string' || !/^[a-z_]{1,60}$/.test(herramienta))) throw new Error('proponer: herramienta no válida')
  if (input != null && (typeof input !== 'object' || Array.isArray(input))) throw new Error('proponer: el input tiene que ser un objeto')
  if (largoJson(input) > TOPES.input) throw new Error(`proponer: el input pasa de ${TOPES.input} bytes`)
  const losDatos = datos && typeof datos === 'object' && !Array.isArray(datos) ? datos : {}
  if (largoJson(losDatos) > TOPES.datos) throw new Error(`proponer: los datos pasan de ${TOPES.datos} bytes`)

  const { data: perfil, error: eP } = await supabase.from('clients').select('id, slug, name').eq('id', clientId).maybeSingle()
  if (eP) throw eP
  if (!perfil) throw new Error('Ese perfil no existe')
  const { data: ya, error: eY } = await supabase.from(TABLA).select('id').eq('client_id', clientId).eq('clave', laClave).maybeSingle()
  if (eY) throw eY
  if (ya) return null
  const agenciaId = await agenciaDe(clientId)
  if (!agenciaId) throw new Error('El perfil no tiene agencia: no hay quien apruebe sus propuestas')

  let resumen = null
  let entrada = null
  if (herramienta) {
    const h = (await herramientasDe(agenciaId)).get(herramienta)
    if (!h?.describir) throw new Error(`La herramienta ${herramienta} no existe o no escribe`)
    // Siempre de este perfil: las herramientas lo reconocen por su slug.
    entrada = { ...(input || {}), ...(h.input_schema?.properties?.perfil ? { perfil: perfil.slug } : {}) }
    resumen = String(await h.describir(entrada) ?? '')
    if (!resumen.trim() || esAccionVacia(resumen)) return { creada: false, motivo: resumen }
    // Lo que se aprueba se enseña entero: si no cabe, no se propone.
    if (resumen.length > TOPES.resumen) return { creada: false, motivo: 'Lo que haría es demasiado largo para enseñarlo en una tarjeta.' }
  }
  const elMensaje = mensaje ? recorta(mensaje, TOPES.mensaje) || null : null
  let elEnlace = null
  if (enlace != null && enlace !== '') {
    if (!esEnlaceWhatsapp(enlace)) throw new Error('proponer: el enlace solo puede ser de WhatsApp (https://wa.me/…)')
    elEnlace = enlace
  } else if (telefono && elMensaje) {
    elEnlace = enlaceWhatsapp(telefono, elMensaje)
    // Un mensaje con muchos emojis o tildes no cabe codificado: el enlace va
    // sin texto (el mensaje se copia con su botón).
    if (elEnlace && !esEnlaceWhatsapp(elEnlace)) elEnlace = enlaceWhatsapp(telefono)
  }
  const horas = Number.isFinite(Number(caducaHoras)) ? Math.min(MAX_HORAS_CADUCA, Math.max(1, Number(caducaHoras))) : HORAS_CADUCA
  const fila = {
    client_id: clientId, agencia_id: agenciaId, agente, clave: laClave,
    titulo: elTitulo, porque: recorta(porque, TOPES.porque) || null,
    herramienta: herramienta || null, input: entrada, resumen,
    mensaje: elMensaje, enlace: elEnlace,
    datos: losDatos,
    caduca: new Date(Date.now() + horas * 3_600_000).toISOString(),
  }
  const { data: creada, error } = await supabase.from(TABLA)
    .upsert(fila, { onConflict: 'client_id,clave', ignoreDuplicates: true })
    .select('*')
  if (error) throw error
  const nueva = Array.isArray(creada) ? creada[0] : creada
  // Otra pasada la ha creado a la vez: esta no.
  if (!nueva) return null
  if (avisar) {
    try {
      const tg_mensajes = await mandarTarjeta(nueva, perfil.name || perfil.slug)
      if (tg_mensajes.length) {
        const { error: eT } = await supabase.from(TABLA).update({ tg_mensajes }).eq('id', nueva.id)
        if (eT) throw eT
        nueva.tg_mensajes = tg_mensajes
      }
    } catch (e) {
      console.warn('[propuestas] la propuesta queda sin tarjeta de Telegram:', e?.message || e)
    }
  }
  return nueva
}

// Quita los botones de las tarjetas de Telegram y deja dicho cómo acabó. Nunca lanza.
async function cerrarTarjetas(fila, texto) {
  const token = tokenAgencia()
  if (!token || !Array.isArray(fila?.tg_mensajes)) return
  for (const m of fila.tg_mensajes) {
    if (m?.chat == null || m?.msg == null) continue
    await tg(token, 'editMessageReplyMarkup', { chat_id: m.chat, message_id: m.msg, reply_markup: { inline_keyboard: [] } }).catch(() => null)
    await tg(token, 'sendMessage', { chat_id: m.chat, text: recorta(texto, 3900), reply_to_message_id: m.msg }).catch(() => null)
  }
}

const NO_ES_TUYA = 'Esa propuesta no existe o no es de tu agencia.'

/**
 * Aprueba o rechaza una propuesta. Solo una decisión pasa: la segunda no cambia
 * nada. Al aprobar, aplica el input GUARDADO (nada de lo que mande quien
 * decide). `agenciaId` es la de quien decide (obligatoria): una propuesta de
 * otra agencia, o de un perfil que ya no es de esa agencia, no se toca. Con
 * `clientId`, además, tiene que ser de ese perfil.
 * → { ok, decidida, estado, texto }: `decidida` dice si esta llamada ha
 *   decidido; `ok`, si ha quedado hecha (aplicada) o rechazada como se pidió.
 */
export async function decidir({ id, aprobar, agenciaId, clientId = null, quien = {}, origen = 'panel' } = {}) {
  const fuera = { ok: false, decidida: false, estado: null, texto: NO_ES_TUYA }
  if (!UUID.test(String(id || '')) || !agenciaId) return fuera
  // Un «sí» o un «no» de verdad: un 'true' de texto no se toma por nada.
  if (typeof aprobar !== 'boolean') return { ...fuera, texto: 'Falta decir si se aprueba o se rechaza.' }
  const si = aprobar
  const { data: p, error } = await supabase.from(TABLA).select('*').eq('id', id).maybeSingle()
  if (error) throw error
  if (!p || !p.agencia_id || p.agencia_id !== agenciaId || (clientId && p.client_id !== clientId)) return fuera
  if ((await agenciaDe(p.client_id)) !== p.agencia_id) return fuera

  const ahora = new Date().toISOString()
  const quienTexto = recorta(`${quien?.nombre || quien?.email || 'alguien'} (${origen})`, 200)
  const { data: cambiadas, error: e2 } = await supabase.from(TABLA)
    .update({ estado: si ? 'aprobada' : 'rechazada', decidida_en: ahora, decidida_por: quienTexto })
    .eq('id', id).eq('agencia_id', agenciaId).eq('estado', 'pendiente').gt('caduca', ahora)
    .select('id')
  if (e2) throw e2
  if (!cambiadas?.length) {
    const caducada = p.estado === 'caducada' || (p.estado === 'pendiente' && !(new Date(p.caduca).getTime() > Date.parse(ahora)))
    const texto = caducada ? 'Ha caducado: ya no se puede aprobar.' : `Ya estaba ${p.estado}.`
    return { ok: false, decidida: false, estado: p.estado, texto }
  }
  if (!si) {
    await cerrarTarjetas(p, `❌ Rechazada por ${quienTexto}.`)
    return { ok: true, decidida: true, estado: 'rechazada', texto: 'Rechazada: no se hace.' }
  }

  let estado = 'aplicada'
  let texto = p.mensaje ? 'Hecho. Mándale el mensaje con el enlace de WhatsApp.' : 'Hecho.'
  if (p.herramienta) {
    try {
      // Sin lo que enseñó la tarjeta no hay con qué comparar: no se hace a ciegas.
      if (typeof p.resumen !== 'string' || !p.resumen.trim()) throw new Error('la propuesta no guarda lo que se aprobó')
      const quienAprueba = { id: quien?.id || null, email: quien?.email || null, nombre: quien?.nombre || null }
      const h = (await herramientasDe(p.agencia_id, quienAprueba)).get(p.herramienta)
      if (!h?.ejecutar) throw new Error(`la herramienta ${p.herramienta} ya no existe`)
      const r = await h.ejecutar(p.input && typeof p.input === 'object' ? p.input : {}, { resumenAprobado: p.resumen })
      estado = r?.ok ? 'aplicada' : 'fallida'
      texto = recorta(r?.texto || (r?.ok ? 'Hecho.' : 'No se ha podido hacer.'), TOPES.resultado)
    } catch (e) {
      estado = 'fallida'
      texto = recorta(`No se pudo hacer: ${e?.message || e}`, TOPES.resultado)
    }
  }
  const { error: e3 } = await supabase.from(TABLA).update({ estado, resultado: texto }).eq('id', id).eq('estado', 'aprobada')
  if (e3) console.warn('[propuestas] no se pudo guardar cómo acabó', id, e3?.message || e3)
  await cerrarTarjetas(p, `${estado === 'aplicada' ? '✅' : '⚠️'} ${texto}`)
  return { ok: estado === 'aplicada', decidida: true, estado, texto }
}

// Una aprobada que lleva más que esto sin saber cómo acabó se quedó a medias
// (se reinició el proceso mientras se aplicaba).
export const MINUTOS_A_MEDIAS = 15
export const A_MEDIAS = 'Se aprobó, pero se interrumpió mientras se hacía: no sé si llegó a hacerse. Compruébalo antes de repetirla.'

/**
 * Pasa a caducadas las pendientes que se han pasado de fecha (y les quita los
 * botones) y a fallidas las aprobadas que se quedaron a medias. → cuántas caducan.
 */
export async function caducarPropuestas(ahora = new Date()) {
  const t = new Date(ahora)
  const { data, error } = await supabase.from(TABLA)
    .update({ estado: 'caducada' }).eq('estado', 'pendiente').lte('caduca', t.toISOString())
    .select('id, tg_mensajes')
  if (error) throw error
  const { error: eM } = await supabase.from(TABLA)
    .update({ estado: 'fallida', resultado: A_MEDIAS }).eq('estado', 'aprobada')
    .lt('decidida_en', new Date(t.getTime() - MINUTOS_A_MEDIAS * 60_000).toISOString())
  if (eM) console.warn('[propuestas] no se pudieron cerrar las aprobadas a medias:', eM?.message || eM)
  const token = tokenAgencia()
  if (token) {
    for (const p of data || []) {
      for (const m of Array.isArray(p.tg_mensajes) ? p.tg_mensajes : []) {
        if (m?.chat == null || m?.msg == null) continue
        await tg(token, 'editMessageReplyMarkup', { chat_id: m.chat, message_id: m.msg, reply_markup: { inline_keyboard: [] } }).catch(() => null)
      }
    }
  }
  return (data || []).length
}

// Lo que ve el panel: ni el input de la herramienta, ni la clave, ni los mensajes de Telegram.
const CAMPOS_LISTA = 'id, client_id, agente, titulo, porque, herramienta, resumen, mensaje, enlace, datos, estado, resultado, creada_en, caduca, decidida_en, decidida_por'

/** Las pendientes (las vivas) y las últimas decididas de un perfil, para el panel. */
export async function listarPropuestas(clientId, { decididas = 30 } = {}) {
  if (!clientId) return { pendientes: [], decididas: [] }
  const n = Math.min(100, Math.max(1, Math.floor(Number(decididas)) || 30))
  const ahora = new Date().toISOString()
  const [{ data: pend, error: e1 }, { data: hechas, error: e2 }] = await Promise.all([
    supabase.from(TABLA).select(CAMPOS_LISTA).eq('client_id', clientId).eq('estado', 'pendiente').gt('caduca', ahora)
      .order('creada_en', { ascending: false }).limit(100),
    supabase.from(TABLA).select(CAMPOS_LISTA).eq('client_id', clientId).neq('estado', 'pendiente')
      .order('creada_en', { ascending: false }).limit(n),
  ])
  if (e1) throw e1
  if (e2) throw e2
  // Un enlace que no sea de WhatsApp no sale (el panel lo pondría en un href).
  const limpia = (p) => ({ ...p, enlace: esEnlaceWhatsapp(p.enlace) ? p.enlace : null })
  return { pendientes: (pend || []).map(limpia), decididas: (hechas || []).map(limpia) }
}
