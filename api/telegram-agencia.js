// HELM — el bot de Telegram de la agencia: HELM entero desde el móvil.
//
// Un solo bot para el administrador de cada agencia que lo tenga permitido
// (HELM_TELEGRAM_AGENCIAS) y todos los perfiles activos de su agencia. Se le
// habla normal («¿qué tiene Hugo esta semana?») y contesta Claude con las
// herramientas de api/_lib/bot-herramientas.js: lo que lee va directo; lo que
// escribe o gasta se enseña antes con botones ✅ Aprobar / ❌ Rechazar.
//
// Siempre con alcance de AGENCIA, aunque la cuenta sea de plataforma: solo los
// perfiles activos de la agencia de quien habla.
//
//   POST   ?action=webhook    → lo que llama Telegram (sin sesión; cabecera secreta)
//   GET    ?action=estado     → el bot, su webhook y si tú estás vinculado
//                                (&solo=vinculo: solo lo último, sin llamar a Telegram)
//   POST   ?action=codigo     → código para vincular tu Telegram (15 min)
//   DELETE ?action=vinculo    → desvincula tu Telegram
//   POST   ?action=registrar  → registra el webhook y el menú de comandos (plataforma)
//
// Vincular: el código sale del tablero de Perfiles, con sesión, y se le manda
// al bot con /start CÓDIGO (el enlace t.me/<bot>?start=… lo hace solo) o con
// /vincular CÓDIGO. Se vincula a la PERSONA (from.id) y solo en chats
// privados: en un grupo, cualquiera podría pulsar Aprobar. El código se guarda
// hasheado y sirve una vez.
//
// Aprobar/Rechazar: si Claude pide algo delicado, el turno se para y se guarda
// tal cual (helm_telegram_conversaciones.turno) y cada acción pendiente es una
// fila de helm_telegram_aprobaciones con sus botones. Lo que se aprueba queda
// atado al perfil que enseñó la tarjeta (su slug y su id), no al texto libre
// que escribió Claude. Cuando no queda nada por decidir, el turno sigue donde
// se quedó; si antes llega otro mensaje, Claude recibe en el mismo paso lo que
// se hizo y lo que caducó, y el mensaje nuevo detrás. Va en la base y no en
// memoria: helm-api se reinicia en cada despliegue, y una doble pulsación no
// puede ejecutar nada dos veces.
//
// Webhook: se contesta 200 antes de pensar, como en api/telegram.js. Funciona
// porque la API es un proceso persistente (scripts/api-server.mjs).
//
// Variables de entorno: HELM_TELEGRAM_TOKEN, HELM_TELEGRAM_SECRETO,
// HELM_TELEGRAM_MODELO, HELM_TELEGRAM_AGENCIAS y HELM_PUBLIC_URL.
import crypto from 'node:crypto'
import { supabase } from './lib/supabase.js'
import { applyCors, rateLimit, getClientIp, writeAudit, requireSuperAdmin, requirePlataforma } from './_lib/auth.js'
import { enContexto } from './_lib/contexto.js'
import { claveHelm } from './_lib/creditos.js'
import { alcanceDesdeContexto } from './mcp/[token].js'
import { herramientasBot, sistemaBot, resolverPerfil, perfilesDeAgencia, esAccionVacia, NO_SE_PUEDE } from './_lib/bot-herramientas.js'
import { tapaSecretos } from './_lib/bot/comun.js'
import { turnoAgente, cierraPendientes, RECHAZADA } from './_lib/claude-agente.js'
import { decidir as decidirPropuesta } from './_lib/propuestas.js'
import {
  registrarWebhook, infoWebhook, publicarComandos, accionEscribiendo, enviarMensaje, enviarConBotones,
  responderCallback, editarMensaje, generarCodigo, igual, normalizarCodigo, nombreDelChat,
  tokenAgencia, agenciaPermitida, botAgencia, MINUTOS_VINCULO,
} from './_lib/telegram.js'

const MINUTOS_APROBACION = 30
// Una aprobada que nadie está haciendo en este proceso y lleva más que esto
// sin cerrarse se quedó a medias por un reinicio.
const MINUTOS_EJECUCION = 2
const MENSAJES_HISTORIAL = 12
const MAX_TEXTO_HISTORIAL = 2000
const MAX_RESULTADO = 6000
// Veces seguidas que Claude puede pedir algo que no se puede hacer antes de dejarlo.
const MAX_VUELTAS = 3

const modelo = () => process.env.HELM_TELEGRAM_MODELO || 'claude-sonnet-5'
const secretoAgencia = () => (process.env.HELM_TELEGRAM_SECRETO || '').trim()

// El menú del bot (lo que sale al escribir "/").
const COMANDOS = [
  { cmd: '/ayuda', desc: 'Qué puedo hacer y cómo pedírmelo.' },
  { cmd: '/perfiles', desc: 'Los perfiles de tu agencia con los que trabajo.' },
  { cmd: '/nuevo', desc: 'Empezar de cero: olvido la conversación y lo pendiente.' },
  { cmd: '/estado', desc: 'Tu agencia, el modelo y lo que tengo pendiente.' },
  { cmd: '/desvincular', desc: 'Este Telegram deja de hablar con HELM.' },
]

const PRIVADO = 'Este bot es privado: solo habla con los administradores de agencias de HELM que lo han vinculado.\n\n'
  + 'Si eres tú, entra en HELM → tablero de Perfiles → Telegram, genera un código y pulsa el enlace '
  + `(o escríbeme \`/vincular XXXX-XXXX\`). El código caduca en ${MINUTOS_VINCULO} minutos.`
const CODIGO_MALO = 'Ese código no vale o ha caducado. Genera uno nuevo en HELM → tablero de Perfiles → Telegram.'
const OCUPADO = 'Aún estoy con lo anterior; cuando te conteste, vuelve a escribírmelo.'
const POR_DECIDIR = 'Antes de seguir, dime si apruebas o rechazas lo que tengo pendiente (los botones de arriba). Si prefieres dejarlo, escribe /nuevo.'
const A_MEDIAS = 'Tengo una acción aprobada a medias y aún no sé cómo ha acabado. Vuelve a escribírmelo en un par de minutos (o escribe /nuevo para dejarla).'

// Lo que recibe Claude de una acción que no llegó a hacerse.
const CADUCADA = 'Ha caducado sin que el dueño la aprobara y no se ha hecho.'
const INTERRUMPIDA = 'Se aprobó, pero se interrumpió mientras se hacía (HELM se reinició): no sé si llegó a hacerse. Compruébalo antes de repetirla.'
const DECIDIDAS = ['ejecutada', 'fallida', 'rechazada']

const ayuda = (agencia) => [
  `Soy HELM para *${agencia}*. Háblame normal y dime de qué perfil se trata, por su nombre o como lo llames tú («Hugo», «DCC»…).`,
  '',
  'Lo que solo consulta lo hago directamente. Lo que escribe o gasta te lo enseño antes con dos botones: ✅ Aprobar o ❌ Rechazar.',
  '',
  '/perfiles — los perfiles de tu agencia',
  '/nuevo — empezar de cero',
  '/estado — cómo está esto',
  '/desvincular — dejar de usar el bot aquí',
].join('\n')

const ahora = () => new Date().toISOString()
const sha256 = (t) => crypto.createHash('sha256').update(String(t)).digest('hex')
const hoyMadrid = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date())
const recorta = (t, n) => {
  const s = String(t ?? '')
  return s.length > n ? `${s.slice(0, n - 1)}…` : s
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// El fallo de una herramienta, tal y como llega a Claude y a la tabla: sin secretos.
const textoDeFallo = (err) => recorta(`No se ha podido: ${tapaSecretos(String(err?.message || err || 'error desconocido'))}`, 1500)

// Los tool_result de unas decisiones ([{ tool_use_id, ok, texto }]), con el formato de cierraPendientes.
const bloquesDe = (decididos) => (decididos.length ? cierraPendientes([], [], decididos)[0].content : [])

// Como en api/telegram.js: el menú publica los comandos con `_` y en privado
// a veces llegan con el @ del bot detrás.
function normalizarTexto(texto) {
  const t = String(texto || '').trim()
  const m = t.match(/^\/([a-záéíóúüñ0-9_-]+)(@\w+)?([\s\S]*)$/i)
  if (!m) return t
  return `/${m[1].toLowerCase().replace(/_/g, '-')}${m[3]}`
}

// Updates ya vistos: Telegram reintenta si no le llega el 200 a tiempo.
const vistos = new Map()
function yaVisto(updateId) {
  const clave = String(updateId)
  if (vistos.has(clave)) return true
  vistos.set(clave, Date.now())
  if (vistos.size > 1000) {
    const limite = Date.now() - 10 * 60_000
    for (const [k, t] of vistos) if (t < limite) vistos.delete(k)
  }
  return false
}

// Chats con algo en marcha (un turno de Claude o una acción aprobada): un
// mensaje nuevo no empieza otro turno. Es un contador porque dos botones del
// mismo turno pueden estar haciéndose a la vez.
const ocupados = new Map()
const ocupado = (chatId) => ocupados.has(String(chatId))
const ocupar = (chatId) => ocupados.set(String(chatId), (ocupados.get(String(chatId)) || 0) + 1)
function soltar(chatId) {
  const n = (ocupados.get(String(chatId)) || 0) - 1
  if (n > 0) ocupados.set(String(chatId), n)
  else ocupados.delete(String(chatId))
}

// /nuevo y desvincular cambian la generación del chat: un turno que siguiera
// en marcha ya no contesta, ni guarda, ni saca botones.
const generaciones = new Map()
const generacion = (chatId) => generaciones.get(String(chatId)) || 0
const nuevaGeneracion = (chatId) => generaciones.set(String(chatId), generacion(chatId) + 1)

// Aprobaciones que se están ejecutando en este proceso.
const ejecutando = new Set()

// ── Quién habla ────────────────────────────────────────────────────────────

async function vinculoDe(tgUserId) {
  if (tgUserId == null) return null
  const { data, error } = await supabase.from('helm_telegram_vinculos')
    .select('superadmin_id, agencia_id, tg_user_id, tg_chat_id, tg_nombre, vinculado_at')
    .eq('tg_user_id', tgUserId).maybeSingle()
  if (error) throw error
  return data || null
}

/** ¿Puede seguir usando el bot? Se mira en cada mensaje: { superadmin, agencia } o null. */
async function quienSigue(superadminId) {
  const { data: cuenta, error } = await supabase.from('superadmins')
    .select('id, active, agencia_id, email, name').eq('id', superadminId).maybeSingle()
  if (error) throw error
  if (!cuenta || cuenta.active === false || !cuenta.agencia_id) return null
  const agencia = await agenciaPermitida(supabase, cuenta.agencia_id)
  if (!agencia) return null
  return {
    superadmin: { id: cuenta.id, email: cuenta.email || null, nombre: cuenta.name || cuenta.email || 'el administrador' },
    agencia,
  }
}

const actorDe = (superadmin) => ({ userId: superadmin.id, email: superadmin.email, superadmin: true })

// ── Lo que queda a medias ──────────────────────────────────────────────────

const botones = (id) => [[
  { text: '✅ Aprobar', callback_data: `a:${id}` },
  { text: '❌ Rechazar', callback_data: `r:${id}` },
]]

// Las tarjetas salen sin Markdown: el dueño aprueba lo que ve, y un `_` de un
// email o un [texto](url) en una nota no pueden cambiar lo que se enseña.
const textoAprobacion = (a, pie) => `🟡 ¿Lo hago?\n\n${a.resumen || a.herramienta}\n\n${pie}`
const PLANO = { plano: true }

/** Anula las aprobaciones pendientes que cumplan el filtro y les quita los botones. */
async function anularPendientes(filtro, pie) {
  let q = supabase.from('helm_telegram_aprobaciones').update({ estado: 'caducada', decidida_at: ahora() })
  for (const [col, val] of Object.entries(filtro)) q = Array.isArray(val) ? q.in(col, val) : q.eq(col, val)
  const { data, error } = await q.eq('estado', 'pendiente').select('id, tg_chat_id, tg_message_id, herramienta, resumen')
  if (error) throw error
  const token = tokenAgencia()
  for (const a of data || []) {
    if (token && a.tg_message_id) await editarMensaje(token, a.tg_chat_id, a.tg_message_id, textoAprobacion(a, pie), undefined, PLANO).catch(() => null)
  }
}

/** Olvida la conversación de un chat (historial y turno en pausa). */
async function empezarDeCero(chatId, pie = '⏹ Cancelada: has empezado de cero.') {
  nuevaGeneracion(chatId)
  await anularPendientes({ tg_chat_id: chatId }, pie)
  const { error } = await supabase.from('helm_telegram_conversaciones').delete().eq('tg_chat_id', chatId)
  if (error) throw error
}

/** Quita el vínculo de un superadmin y todo lo suyo que estuviera a medias. */
async function desvincular(superadminId, { motivo, actor = null, req = null } = {}) {
  const { data: v } = await supabase.from('helm_telegram_vinculos').select('tg_chat_id').eq('superadmin_id', superadminId).maybeSingle()
  if (v?.tg_chat_id != null) nuevaGeneracion(v.tg_chat_id)
  await anularPendientes({ superadmin_id: superadminId }, '⏹ Cancelada: este Telegram ya no está vinculado.')
  await supabase.from('helm_telegram_conversaciones').delete().eq('superadmin_id', superadminId)
  const { error } = await supabase.from('helm_telegram_vinculos').delete().eq('superadmin_id', superadminId)
  if (error) throw error
  await writeAudit({ actor: actor || { role: 'system' }, action: 'telegram.agencia_desvinculada', req, metadata: { motivo, superadminId } })
}

async function conversacionDe(chatId) {
  const { data, error } = await supabase.from('helm_telegram_conversaciones')
    .select('tg_chat_id, superadmin_id, historial, turno').eq('tg_chat_id', chatId).maybeSingle()
  if (error) throw error
  return data || null
}

async function guardarConversacion(chatId, superadminId, cambios) {
  const { error } = await supabase.from('helm_telegram_conversaciones')
    .upsert({ tg_chat_id: chatId, superadmin_id: superadminId, ...cambios, actualizado_at: ahora() }, { onConflict: 'tg_chat_id' })
  if (error) throw error
}

/** Añade al historial la pregunta y la respuesta (solo texto, recortado). Devuelve el historial nuevo. */
async function apuntarHistorial(chatId, superadminId, pregunta, respuesta) {
  const conv = await conversacionDe(chatId)
  const historial = [
    ...(Array.isArray(conv?.historial) ? conv.historial : []),
    { role: 'user', content: recorta(pregunta, MAX_TEXTO_HISTORIAL) },
    { role: 'assistant', content: recorta(respuesta, MAX_TEXTO_HISTORIAL) },
  ].slice(-MENSAJES_HISTORIAL)
  await guardarConversacion(chatId, superadminId, { historial, turno: null })
  return historial
}

function historialParaClaude(historial) {
  const limpio = (Array.isArray(historial) ? historial : [])
    .filter(m => (m?.role === 'user' || m?.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-MENSAJES_HISTORIAL)
    .map(m => ({ role: m.role, content: m.content }))
  while (limpio.length && limpio[0].role === 'assistant') limpio.shift()
  return limpio
}

/**
 * Las aprobaciones de un turno en pausa. Una aprobada que nadie está haciendo
 * (HELM se reinició mientras se hacía) se cierra aquí como fallida: si no,
 * bloquearía el chat con unos botones que ya no existen.
 */
async function aprobacionesDe(turno) {
  const ids = Array.isArray(turno?.aprobaciones) ? turno.aprobaciones : []
  if (!ids.length) return []
  const { data, error } = await supabase.from('helm_telegram_aprobaciones')
    .select('id, tool_use_id, herramienta, resumen, estado, caduca, decidida_at, resultado, tg_chat_id, tg_message_id')
    .in('id', ids)
  if (error) throw error
  const limite = Date.now() - MINUTOS_EJECUCION * 60_000
  for (const a of data || []) {
    if (a.estado !== 'aprobada' || ejecutando.has(a.id) || new Date(a.decidida_at || 0).getTime() > limite) continue
    const resultado = { ok: false, texto: INTERRUMPIDA }
    const { data: cerrada, error: e2 } = await supabase.from('helm_telegram_aprobaciones')
      .update({ estado: 'fallida', resultado }).eq('id', a.id).eq('estado', 'aprobada').select('id')
    if (e2) throw e2
    if (!cerrada?.length) continue
    Object.assign(a, { estado: 'fallida', resultado })
    const token = tokenAgencia()
    if (token && a.tg_message_id) {
      await editarMensaje(token, a.tg_chat_id, a.tg_message_id, textoAprobacion(a, '⚠️ Aprobada, pero se interrumpió: no sé si llegó a hacerse.'), undefined, PLANO).catch(() => null)
    }
  }
  return data || []
}

// Aún se puede decidir, o se está haciendo.
const viva = (a) => a.estado === 'aprobada' || (a.estado === 'pendiente' && new Date(a.caduca).getTime() > Date.now())

/** Lo que se le cuenta a Claude de cada acción del turno en pausa: [{ tool_use_id, ok, texto }]. */
function decididosDe(turno, aprobs) {
  const porUso = new Map(aprobs.map(a => [a.tool_use_id, a]))
  return (turno.pendientes || []).map(pd => {
    const a = porUso.get(pd.id)
    if (a?.estado === 'ejecutada') return { tool_use_id: pd.id, ok: true, texto: a.resultado?.texto || 'Hecho.' }
    if (a?.estado === 'fallida') return { tool_use_id: pd.id, ok: false, texto: a.resultado?.texto || 'No se ha podido hacer.' }
    if (a?.estado === 'rechazada') return { tool_use_id: pd.id, ok: false, texto: RECHAZADA }
    return { tool_use_id: pd.id, ok: false, texto: CADUCADA }
  })
}

/** Lo que queda en el historial de un turno en pausa que no sigue. */
function notaDelTurno(turno, aprobs) {
  const porUso = new Map(aprobs.map(a => [a.tool_use_id, a]))
  const QUE = { ejecutada: 'hecha', fallida: 'no se pudo hacer', rechazada: 'la rechazaste' }
  const lineas = (turno.pendientes || []).map(pd => `• ${pd.name}: ${QUE[porUso.get(pd.id)?.estado] || 'caducó sin hacerse'}`)
  return `(Quedó pendiente de tu aprobación:\n${lineas.join('\n')})`
}

/** Se queda con el turno en pausa: si dos cosas intentan seguirlo a la vez, solo una puede. */
async function reclamarTurno(chatId, turno) {
  const { data, error } = await supabase.from('helm_telegram_conversaciones')
    .update({ turno: null, actualizado_at: ahora() })
    .eq('tg_chat_id', chatId).eq('turno->>id', turno.id).select('tg_chat_id')
  if (error) throw error
  return Boolean(data?.length)
}

// ── Claude ─────────────────────────────────────────────────────────────────

/** El perfil al que lleva args.perfil, o null. */
function perfilDeArgs(perfiles, args) {
  if (args?.perfil == null || args.perfil === '') return null
  try {
    return resolverPerfil(perfiles, String(args.perfil))?.perfil || null
  } catch {
    return null
  }
}

/**
 * Antes de enseñar una acción, su perfil se fija: el texto libre de Claude
 * («Hugo», «RastroPro») se cambia por el slug del perfil al que lleva, y si no
 * dice ninguno y la agencia solo tiene uno, ese. Así lo que se ejecuta al
 * aprobar es exactamente lo que enseñó la tarjeta.
 * → { args, perfil } o { error } si no se sabe de qué perfil es.
 */
function fijarPerfil(h, perfiles, input) {
  const args = { ...(input || {}) }
  if (!h?.input_schema?.properties?.perfil) return { args, perfil: null }
  if (args.perfil == null || args.perfil === '') {
    return perfiles.length === 1 ? { args: { ...args, perfil: perfiles[0].slug }, perfil: perfiles[0] } : { args, perfil: null }
  }
  let r
  try {
    r = resolverPerfil(perfiles, String(args.perfil))
  } catch {
    r = null
  }
  if (!r?.perfil) {
    const opciones = r?.opciones?.length ? ` Opciones: ${r.opciones.join(', ')}.` : ''
    return { error: `${r?.error || `No sé de qué perfil es «${args.perfil}».`}${opciones}` }
  }
  return { args: { ...args, perfil: r.perfil.slug }, perfil: r.perfil }
}

/** Alcance, herramientas y las dos funciones que necesita turnoAgente. Se rehace en cada mensaje y en cada pulsación. */
async function preparar({ superadmin, agencia }) {
  const alcance = await alcanceDesdeContexto({ agenciaId: agencia.id }, { origen: 'telegram', quien: `Telegram de ${superadmin.nombre}` })
  if (!alcance) throw new Error('No encuentro la agencia de esta cuenta.')
  // La misma lista (con la marca) con la que reconocen el perfil las herramientas.
  const perfiles = await perfilesDeAgencia(alcance)
  const ctx = { alcance, agenciaId: agencia.id, superadmin }
  const herramientas = await herramientasBot(ctx)
  const porNombre = new Map(herramientas.map(h => [h.name, h]))
  const tools = herramientas.map(({ name, description, input_schema }) => ({ name, description, input_schema }))
  // Cada herramienta corre en su propio contexto: lo que anote (el perfil que
  // toca) no se queda para los pasos siguientes de Claude, que paga la agencia.
  const aislado = (fn) => enContexto({ agenciaId: agencia.id, origen: 'telegram' }, fn)
  const ejecutar = async (name, input, opciones) => {
    const h = porNombre.get(name)
    if (!h) return { ok: false, texto: `No tengo ninguna herramienta llamada «${name}».` }
    try {
      const r = await aislado(() => (opciones ? h.ejecutar(input || {}, opciones) : h.ejecutar(input || {})))
      return { ok: Boolean(r?.ok), texto: recorta(r?.texto ?? '', MAX_RESULTADO) }
    } catch (err) {
      console.warn('[telegram-agencia] herramienta', name, err?.message || err)
      return { ok: false, texto: textoDeFallo(err) }
    }
  }
  const esDelicada = (name, input) => {
    const h = porNombre.get(name)
    if (!h) return false
    try {
      return typeof h.delicada === 'function' ? Boolean(h.delicada(input || {})) : Boolean(h.delicada)
    } catch {
      return true
    }
  }
  return { alcance, perfiles, ctx, porNombre, tools, ejecutar, esDelicada, aislado }
}

/** Mientras Claude piensa, «escribiendo…» renovado cada 4 s (Telegram lo apaga a los 5). */
async function conEscribiendo(token, chatId, fn) {
  await accionEscribiendo(token, chatId)
  const latido = setInterval(() => accionEscribiendo(token, chatId), 4000)
  try {
    return await fn()
  } finally {
    clearInterval(latido)
  }
}

/** Lo que se le cuenta a la persona cuando algo falla: claro y sin tripas. */
function mensajeDeError(err) {
  const codigo = err?.statusCode || err?.status
  const texto = String(err?.message || '')
  if (codigo === 402) return '⚠️ Tu agencia se ha quedado sin créditos de HELM. Recarga en el tablero de Perfiles → Créditos y vuelve a escribirme.'
  if (/credit balance|credits? (is|are) too low|insufficient.*credit/i.test(texto)) {
    return '⚠️ La cuenta de Claude de HELM se ha quedado sin saldo. Avisa a quien lleva la plataforma; en cuanto se recargue, sigo.'
  }
  if (codigo === 422) return '⚠️ Claude ha preferido no seguir con eso. Prueba a planteármelo de otra forma.'
  if (codigo === 429) return '⚠️ Claude está limitando las peticiones ahora mismo. Prueba en un minuto.'
  return '⚠️ No he podido terminar por un fallo por mi lado. Prueba otra vez en un momento.'
}

function resumenGenerico(nombre, input) {
  const lineas = Object.entries(input || {})
    .filter(([k]) => k !== 'prueba')
    .map(([k, v]) => `• ${k}: ${recorta(typeof v === 'string' ? v : JSON.stringify(v), 300)}`)
  return [`Quiero usar ${nombre}${lineas.length ? ' con:' : '.'}`, ...lineas].join('\n')
}

/** Un turno de Claude sobre unos messages ya montados, y lo que venga después. */
async function darPaso(c, messages) {
  const { token, chatId, system, model, p } = c
  const r = await conEscribiendo(token, chatId, () => turnoAgente({
    apiKey: claveHelm(), model, system, messages, tools: p.tools, ejecutar: p.ejecutar, esDelicada: p.esDelicada,
  }))
  await despues(r, c)
}

/**
 * Lo que sigue a un turno de Claude: contestar, o pararse a pedir permiso.
 * c = { token, chatId, system, model, pregunta, quien, p, gen, vueltas }
 */
async function despues(r, c) {
  // /nuevo o desvincular mientras Claude pensaba: lo de antes ya no se cuenta.
  if (generacion(c.chatId) !== c.gen) return
  if (r.tipo === 'pendiente') return pausar(r, c)
  const texto = r.tipo === 'tope'
    ? `${r.texto ? `${r.texto}\n\n` : ''}⚠️ He encadenado demasiados pasos seguidos y lo he dejado aquí. Dime si sigo.`
    : r.texto || 'No tengo nada que añadir. ¿Qué más necesitas?'
  await enviarMensaje(c.token, c.chatId, texto)
  await apuntarHistorial(c.chatId, c.quien.superadmin.id, c.pregunta, texto)
}

/** El turno se para: se guarda tal cual y cada acción delicada sale con sus botones. */
async function pausar(r, c) {
  const { token, chatId, system, model, pregunta, quien, p } = c
  const { superadmin, agencia } = quien
  const caduca = new Date(Date.now() + MINUTOS_APROBACION * 60_000).toISOString()
  const filas = []
  // Lo que no se va a hacer (tal y como está pedido no se puede, o ya estaba
  // hecho) no lleva tarjeta: Claude recibe ese texto como resultado.
  const sinTarjeta = []
  for (const pend of r.pendientes) {
    const h = p.porNombre.get(pend.name)
    const fijado = fijarPerfil(h, p.perfiles, pend.input)
    if (fijado.error) {
      sinTarjeta.push({ tool_use_id: pend.id, ok: false, texto: `${NO_SE_PUEDE}${fijado.error}` })
      continue
    }
    let resumen = ''
    if (h?.describir) {
      try {
        resumen = String(await p.aislado(() => h.describir(fijado.args)) || '')
      } catch (err) {
        // Sin poder enseñar qué se haría, no se pide permiso para hacerlo.
        console.warn('[telegram-agencia] describir', pend.name, err?.message || err)
        sinTarjeta.push({ tool_use_id: pend.id, ok: false, texto: `${NO_SE_PUEDE}${textoDeFallo(err)}` })
        continue
      }
    }
    if (esAccionVacia(resumen)) {
      sinTarjeta.push({ tool_use_id: pend.id, ok: !resumen.startsWith(NO_SE_PUEDE), texto: recorta(resumen, MAX_RESULTADO) })
      continue
    }
    filas.push({
      tg_chat_id: chatId, superadmin_id: superadmin.id, agencia_id: agencia.id,
      client_id: fijado.perfil?.id || null,
      herramienta: pend.name, args: fijado.args, tool_use_id: pend.id,
      resumen: recorta(resumen || resumenGenerico(pend.name, fijado.args), 3500),
      estado: 'pendiente', caduca,
    })
  }
  if (generacion(chatId) !== c.gen) return

  // Nada que enseñar: Claude se entera de por qué y sigue en este mismo mensaje.
  if (!filas.length) {
    const vueltas = (c.vueltas || 0) + 1
    if (vueltas > MAX_VUELTAS) {
      const motivo = String(sinTarjeta[0]?.texto || '').replace(NO_SE_PUEDE, '') || 'no sé por qué.'
      const texto = `⚠️ No he podido preparar lo que me pides: ${motivo}`
      await enviarMensaje(token, chatId, texto)
      await apuntarHistorial(chatId, superadmin.id, pregunta, texto)
      return
    }
    return darPaso({ ...c, vueltas }, cierraPendientes(r.messages, r.resultados || [], sinTarjeta))
  }

  const { data: creadas, error } = await supabase.from('helm_telegram_aprobaciones')
    .insert(filas).select('id, tool_use_id, herramienta, resumen')
  if (error) throw error
  const porUso = new Map((creadas || []).map(a => [a.tool_use_id, a]))
  const pendientes = r.pendientes.filter(pd => porUso.has(pd.id))
  const aprobaciones = pendientes.map(pd => porUso.get(pd.id))
  const ids = aprobaciones.map(a => a.id)
  if (generacion(chatId) !== c.gen) {
    await anularPendientes({ id: ids }, '⏹ Cancelada: has empezado de cero.')
    return
  }

  // Primero se guarda el turno y luego salen los botones: una pulsación
  // rápida tiene que encontrarlo. Con el modelo y el system exactos: los
  // bloques de pensamiento van firmados por ese modelo.
  const turno = {
    id: crypto.randomUUID(), hoy: hoyMadrid(), model, system, messages: r.messages,
    resultados: [...(r.resultados || []), ...bloquesDe(sinTarjeta)],
    pendientes, aprobaciones: ids, pregunta,
  }
  await guardarConversacion(chatId, superadmin.id, { turno })
  // Lo que Claude explicó en ese paso (p. ej. la lista de guiones que propone)
  // va antes de las tarjetas; si no sale, las tarjetas se entienden igual.
  if (String(r.texto || '').trim()) await enviarMensaje(token, chatId, r.texto).catch(() => null)
  try {
    for (const a of aprobaciones) {
      const m = await enviarConBotones(token, chatId, textoAprobacion(a, `Caduca en ${MINUTOS_APROBACION} minutos.`), botones(a.id), PLANO)
      if (m?.message_id) await supabase.from('helm_telegram_aprobaciones').update({ tg_message_id: m.message_id }).eq('id', a.id)
    }
  } catch (err) {
    // Sin los botones a la vista no hay forma de decidir: el turno no sigue,
    // pero queda en el historial qué se pidió.
    await anularPendientes({ id: ids }, '⌛ Cancelada: no se ha hecho.').catch(() => null)
    if (await reclamarTurno(chatId, turno).catch(() => false)) {
      await apuntarHistorial(chatId, superadmin.id, pregunta, '(No pude enseñarte los botones para aprobarlo y no se ha hecho.)').catch(() => null)
    }
    throw err
  }
}

/** Un mensaje normal: un turno nuevo de Claude con lo último de la conversación. */
async function conversar({ token, chatId, texto, quien, gen }) {
  const conv = await conversacionDe(chatId)
  let historial = conv?.historial
  const turno = conv?.turno
  if (turno) {
    const aprobs = await aprobacionesDe(turno)
    const vivas = aprobs.filter(viva)
    if (vivas.length) {
      const aviso = vivas.some(a => a.estado === 'pendiente') ? POR_DECIDIR : vivas.every(a => ejecutando.has(a.id)) ? OCUPADO : A_MEDIAS
      await enviarMensaje(token, chatId, aviso)
      return
    }
    if (!(await reclamarTurno(chatId, turno))) {
      await enviarMensaje(token, chatId, OCUPADO)
      return
    }
    if (turno.aprobaciones?.length) await anularPendientes({ id: turno.aprobaciones }, '⌛ Caducada: no se ha hecho.')
    // Si algo se llegó a hacer (o a rechazar), Claude tiene que saberlo: el
    // turno se cierra con lo que pasó y el mensaje nuevo va detrás, en el
    // mismo mensaje user. Si es de otro día, su system tiene la fecha vieja:
    // queda en el historial y se empieza de nuevo.
    if (aprobs.some(a => DECIDIDAS.includes(a.estado)) && turno.hoy === hoyMadrid()) {
      const p = await preparar(quien)
      const messages = cierraPendientes(turno.messages, turno.resultados || [], decididosDe(turno, aprobs))
      const ultimo = messages.at(-1)
      messages[messages.length - 1] = { ...ultimo, content: [...ultimo.content, { type: 'text', text: texto }] }
      const pregunta = [turno.pregunta, texto].filter(Boolean).join('\n\n')
      return darPaso({ token, chatId, system: turno.system, model: turno.model || modelo(), pregunta, quien, p, gen }, messages)
    }
    historial = await apuntarHistorial(chatId, quien.superadmin.id, turno.pregunta || '', notaDelTurno(turno, aprobs))
  }
  const p = await preparar(quien)
  const system = sistemaBot({
    usuario: quien.superadmin,
    agencia: { id: quien.agencia.id, nombre: p.alcance.nombre || quien.agencia.nombre, slug: quien.agencia.slug },
    perfiles: p.perfiles,
    hoy: hoyMadrid(),
  })
  const messages = [...historialParaClaude(historial), { role: 'user', content: texto }]
  await darPaso({ token, chatId, system, model: modelo(), pregunta: texto, quien, p, gen }, messages)
}

/** Cuando ya no queda nada por decidir en el turno en pausa, sigue donde se quedó. */
async function seguirSiDecidido({ token, chatId, quien, aprobacionId, gen }) {
  const conv = await conversacionDe(chatId)
  const turno = conv?.turno
  if (!turno?.aprobaciones?.includes(aprobacionId)) return
  const aprobs = await aprobacionesDe(turno)
  if (aprobs.some(viva)) return
  if (!(await reclamarTurno(chatId, turno))) return
  await anularPendientes({ id: turno.aprobaciones }, '⌛ Caducada: no se ha hecho.')
  const messages = cierraPendientes(turno.messages, turno.resultados || [], decididosDe(turno, aprobs))
  const p = await preparar(quien)
  await darPaso({ token, chatId, system: turno.system, model: turno.model || modelo(), pregunta: turno.pregunta || '', quien, p, gen }, messages)
}

/**
 * Ejecuta una acción aprobada. El perfil tiene que seguir siendo de la
 * agencia, y args.perfil (el slug que se fijó al enseñarla) tiene que llevar
 * al mismo perfil que enseñó la tarjeta.
 */
async function ejecutarAprobada(aprob, quien) {
  const p = await preparar(quien)
  if (aprob.client_id && !p.perfiles.some(x => x.id === aprob.client_id)) {
    return { ok: false, texto: 'Ese perfil ya no es de tu agencia o no está activo. No lo he hecho.' }
  }
  const args = aprob.args || {}
  if (args.perfil != null && args.perfil !== '' && perfilDeArgs(p.perfiles, args)?.id !== aprob.client_id) {
    return { ok: false, texto: `«${args.perfil}» ya no lleva al perfil que enseñaba la tarjeta. No lo he hecho: pídemelo otra vez.` }
  }
  const h = p.porNombre.get(aprob.herramienta)
  if (!h) return { ok: false, texto: 'Esa acción ya no está disponible. No la he hecho.' }
  // Con la tarjeta que vio el dueño: si al prepararla otra vez sale otra cosa, la herramienta no la hace.
  return p.ejecutar(aprob.herramienta, args, h.describir ? { resumenAprobado: aprob.resumen || '' } : undefined)
}

/** Apunta cómo acabó una aprobada. Si la base no contesta, otro intento: si no, se quedaría «aprobada» para siempre. */
async function cerrarAprobada(id, r) {
  const cambios = { estado: r.ok ? 'ejecutada' : 'fallida', resultado: { ok: r.ok, texto: recorta(r.texto, MAX_RESULTADO) } }
  for (let intento = 1; intento <= 2; intento++) {
    const { error } = await supabase.from('helm_telegram_aprobaciones').update(cambios).eq('id', id)
    if (!error) return true
    console.error('[telegram-agencia] cerrar aprobación', id, `intento ${intento}`, error?.message || error)
  }
  return false
}

// ── Lo que pasa con cada update ────────────────────────────────────────────

async function vincular(token, msg, codigoEscrito) {
  const chatId = msg.chat.id
  const codigo = normalizarCodigo(codigoEscrito)
  if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(codigo)) return enviarMensaje(token, chatId, CODIGO_MALO)
  const hash = sha256(codigo)
  const { data: fila, error } = await supabase.from('helm_telegram_vinculos')
    .select('superadmin_id, codigo_caduca, tg_chat_id').eq('codigo_hash', hash).gt('codigo_caduca', ahora()).maybeSingle()
  if (error) throw error
  if (!fila) return enviarMensaje(token, chatId, CODIGO_MALO)

  const quien = await quienSigue(fila.superadmin_id)
  if (!quien) {
    await supabase.from('helm_telegram_vinculos').update({ codigo_hash: null, codigo_caduca: null }).eq('superadmin_id', fila.superadmin_id)
    return enviarMensaje(token, chatId, 'Tu cuenta de HELM no puede usar este bot: está desactivada o tu agencia no lo tiene.')
  }

  // El código se gasta en la misma escritura que vincula: dos intentos a la
  // vez con el mismo código no pueden ganar los dos.
  const { data: hecho, error: e2 } = await supabase.from('helm_telegram_vinculos').update({
    agencia_id: quien.agencia.id, tg_user_id: msg.from.id, tg_chat_id: chatId, tg_nombre: nombreDelChat(msg),
    vinculado_at: ahora(), codigo_hash: null, codigo_caduca: null,
  }).eq('superadmin_id', fila.superadmin_id).eq('codigo_hash', hash).select('superadmin_id')
  if (e2) throw e2
  if (!hecho?.length) return enviarMensaje(token, chatId, CODIGO_MALO)

  // Lo que hubiera de un vínculo anterior (otro móvil, otra cuenta) no sigue:
  // ni sus tarjetas con botones, ni su conversación, ni un turno en marcha.
  const anterior = fila.tg_chat_id != null && String(fila.tg_chat_id) !== String(chatId) ? fila.tg_chat_id : null
  if (anterior != null) nuevaGeneracion(anterior)
  await anularPendientes({ superadmin_id: fila.superadmin_id }, '⏹ Cancelada: tu cuenta se ha vinculado a otro Telegram.')
  await supabase.from('helm_telegram_conversaciones').delete().eq('superadmin_id', fila.superadmin_id)
  await supabase.from('helm_telegram_conversaciones').delete().eq('tg_chat_id', chatId)
  await writeAudit({
    actor: actorDe(quien.superadmin), action: 'telegram.agencia_vinculada',
    metadata: { tgUserId: msg.from.id, agenciaId: quien.agencia.id },
  })
  if (anterior != null) {
    await enviarMensaje(token, anterior, 'Tu cuenta de HELM se ha vinculado a otro Telegram: este ya no habla con HELM.').catch(() => null)
  }
  return enviarMensaje(token, chatId, `Vinculado, ${quien.superadmin.nombre}.\n\n${ayuda(quien.agencia.nombre)}`)
}

async function atenderVinculado({ token, msg, vinculo, quien }) {
  const chatId = msg.chat.id
  if (!msg.text) return enviarMensaje(token, chatId, 'Por ahora solo entiendo texto. Escríbeme lo que necesitas.')
  const texto = normalizarTexto(msg.text)

  if (/^\/(vincular|start\s+\S)/.test(texto)) {
    const cuenta = quien.superadmin.email ? ` (${quien.superadmin.email})` : ''
    return enviarMensaje(token, chatId, `Este Telegram ya está vinculado a tu cuenta de HELM${cuenta}. Escríbeme directamente.\n\nSi ese código era de otra cuenta, escribe /desvincular y vuelve a mandármelo.`)
  }
  if (/^\/(start|ayuda|help)\b/.test(texto)) return enviarMensaje(token, chatId, ayuda(quien.agencia.nombre))

  if (/^\/perfiles\b/.test(texto)) {
    const alcance = await alcanceDesdeContexto({ agenciaId: quien.agencia.id }, { origen: 'telegram', quien: `Telegram de ${quien.superadmin.nombre}` })
    const perfiles = alcance?.perfiles || []
    return enviarMensaje(token, chatId, perfiles.length
      ? `Los perfiles activos de *${alcance.nombre || quien.agencia.nombre}*:\n${perfiles.map(x => `• ${x.name} (${x.slug})`).join('\n')}`
      : 'Tu agencia todavía no tiene perfiles activos.')
  }

  // /nuevo y /desvincular valen aunque Claude esté pensando: cambian la
  // generación del chat y lo que estaba en marcha ya no contesta ni guarda.
  if (/^\/nuevo\b/.test(texto)) {
    await empezarDeCero(chatId)
    return enviarMensaje(token, chatId, 'Hecho: empezamos de cero. ¿Qué necesitas?')
  }

  if (/^\/estado\b/.test(texto)) {
    const [conv, { data: pendientes }] = await Promise.all([
      conversacionDe(chatId),
      supabase.from('helm_telegram_aprobaciones').select('id').eq('tg_chat_id', chatId).eq('estado', 'pendiente').gt('caduca', ahora()),
    ])
    const alcance = await alcanceDesdeContexto({ agenciaId: quien.agencia.id }, { origen: 'telegram' })
    const desde = vinculo.vinculado_at
      ? new Date(vinculo.vinculado_at).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', dateStyle: 'medium', timeStyle: 'short' })
      : '—'
    const n = pendientes?.length || 0
    return enviarMensaje(token, chatId, [
      `*Agencia:* ${quien.agencia.nombre}`,
      `*Perfiles activos:* ${alcance?.perfiles?.length ?? 0}`,
      `*Modelo:* ${modelo()}`,
      `*Vinculado desde:* ${desde}`,
      `*Pendiente de aprobar:* ${n ? `${n} ${n === 1 ? 'acción' : 'acciones'}` : 'nada'}`,
      `*Conversación:* ${Array.isArray(conv?.historial) ? conv.historial.length : 0} mensajes recordados`,
    ].join('\n'))
  }

  if (/^\/desvincular\b/.test(texto)) {
    await desvincular(quien.superadmin.id, { motivo: 'desde Telegram', actor: actorDe(quien.superadmin) })
    return enviarMensaje(token, chatId, 'Hecho. Este Telegram ya no habla con HELM. Para volver, genera otro código en el tablero de Perfiles.')
  }

  // El mensaje no se guarda para luego: se le dice que lo repita.
  if (ocupado(chatId)) return enviarMensaje(token, chatId, OCUPADO)
  const gen = generacion(chatId)
  ocupar(chatId)
  try {
    await conversar({ token, chatId, texto: msg.text.trim(), quien, gen })
  } catch (err) {
    console.warn('[telegram-agencia] turno', err?.statusCode || '', err?.message || err)
    await enviarMensaje(token, chatId, mensajeDeError(err)).catch(() => null)
  } finally {
    soltar(chatId)
  }
}

async function atenderMensaje(token, msg) {
  if (!msg?.chat?.id || msg.from?.id == null) return
  if (msg.chat.type !== 'private') return
  const chatId = msg.chat.id

  // Como mucho 20 por minuto y persona; 5 si no está vinculada, que lo único
  // que puede hacer un desconocido es probar códigos.
  if (!rateLimit({ key: `tga:${msg.from.id}`, max: 20, windowMs: 60_000 }).ok) return
  const vinculo = await vinculoDe(msg.from.id)

  if (!vinculo) {
    if (!rateLimit({ key: `tga-desconocido:${msg.from.id}`, max: 5, windowMs: 60_000 }).ok) return
    const m = normalizarTexto(msg.text).match(/^\/(start|vincular)\s+(.+)$/s)
    if (m) return vincular(token, msg, m[2])
    return enviarMensaje(token, chatId, PRIVADO)
  }

  const quien = await quienSigue(vinculo.superadmin_id)
  if (!quien) {
    await desvincular(vinculo.superadmin_id, { motivo: 'cuenta desactivada o agencia sin permiso' })
    return enviarMensaje(token, chatId, 'Tu cuenta de HELM ya no puede usar este bot (está desactivada o tu agencia no lo tiene), así que te he desvinculado.')
  }
  if (vinculo.agencia_id !== quien.agencia.id) {
    const { error } = await supabase.from('helm_telegram_vinculos').update({ agencia_id: quien.agencia.id }).eq('superadmin_id', quien.superadmin.id)
    if (error) throw error
    // Lo que hubiera a medias era de la otra agencia: no se mezcla.
    await empezarDeCero(chatId, '⏹ Cancelada: tu cuenta ha cambiado de agencia.')
  }
  return enContexto({ agenciaId: quien.agencia.id, origen: 'telegram' }, () => atenderVinculado({ token, msg, vinculo, quien }))
}

/** Aprobar o rechazar, una vez ganada la pulsación. */
async function decidir({ token, cq, chatId, aprob, aprobar, quien }) {
  const id = aprob.id
  const mensajeId = aprob.tg_message_id || cq.message.message_id
  if (!aprobar) {
    await editarMensaje(token, chatId, mensajeId, textoAprobacion(aprob, '❌ Rechazada. No se ha hecho.'), undefined, PLANO).catch(() => null)
    await writeAudit({
      clientId: aprob.client_id, actor: actorDe(quien.superadmin), action: 'telegram.accion_rechazada',
      resourceType: 'helm_telegram_aprobaciones', resourceId: id, metadata: { herramienta: aprob.herramienta },
    })
    return
  }
  await editarMensaje(token, chatId, mensajeId, textoAprobacion(aprob, '✅ Aprobada. Haciéndolo…'), undefined, PLANO).catch(() => null)
  let r
  try {
    r = await conEscribiendo(token, chatId, () => ejecutarAprobada(aprob, quien))
  } catch (err) {
    console.warn('[telegram-agencia] aprobada', aprob.herramienta, err?.message || err)
    r = { ok: false, texto: textoDeFallo(err) }
  }
  await cerrarAprobada(id, r)
  ejecutando.delete(id)
  await editarMensaje(token, chatId, mensajeId, textoAprobacion(aprob, r.ok ? '✅ Aprobada y hecha.' : '⚠️ Aprobada, pero no se ha podido hacer.'), undefined, PLANO).catch(() => null)
  await writeAudit({
    clientId: aprob.client_id, actor: actorDe(quien.superadmin), action: 'telegram.accion_aprobada',
    resourceType: 'helm_telegram_aprobaciones', resourceId: id, metadata: { herramienta: aprob.herramienta, ok: r.ok },
  })
}

async function atenderBoton(token, cq) {
  if (!cq?.id) return
  let contestado = false
  const contestar = async (texto) => {
    contestado = true
    await responderCallback(token, cq.id, texto).catch(() => null)
  }
  const chatId = cq.message?.chat?.id
  try {
    // Las propuestas de los agentes de departamento (api/_lib/propuestas.js):
    // «pa:<id>» aprueba y «pr:<id>» rechaza. Solo quien está vinculado (en su
    // chat privado) y administra AHORA la agencia de la propuesta: decidir lo
    // comprueba contra la agencia de la cuenta, no contra el chat.
    const mp = /^p([ar]):(.+)$/.exec(String(cq.data || ''))
    if (mp) {
      if (!UUID.test(mp[2]) || !chatId || cq.message.chat.type !== 'private' || cq.from?.id == null) return await contestar()
      if (!rateLimit({ key: `tga:${cq.from.id}`, max: 20, windowMs: 60_000 }).ok) return await contestar('Demasiado seguido. Espera un momento.')
      const vinculo = await vinculoDe(cq.from.id)
      if (!vinculo || String(vinculo.tg_chat_id) !== String(chatId)) return await contestar('Esta propuesta no es tuya.')
      const quien = await quienSigue(vinculo.superadmin_id)
      if (!quien) {
        await desvincular(vinculo.superadmin_id, { motivo: 'cuenta desactivada o agencia sin permiso' })
        return await contestar('Tu cuenta ya no puede usar este bot.')
      }
      const r = await enContexto({ agenciaId: quien.agencia.id, origen: 'telegram' }, () => decidirPropuesta({
        id: mp[2].toLowerCase(), aprobar: mp[1] === 'a', agenciaId: quien.agencia.id, quien: quien.superadmin, origen: 'Telegram',
      }))
      return await contestar(String(r?.texto || '').slice(0, 190))
    }
    const m = /^([ar]):(.+)$/.exec(String(cq.data || ''))
    if (!m || !UUID.test(m[2]) || !chatId || cq.message.chat.type !== 'private' || cq.from?.id == null) return await contestar()
    if (!rateLimit({ key: `tga:${cq.from.id}`, max: 20, windowMs: 60_000 }).ok) return await contestar('Demasiado seguido. Espera un momento.')
    const aprobar = m[1] === 'a'
    const id = m[2].toLowerCase()

    const vinculo = await vinculoDe(cq.from.id)
    const { data: aprob, error } = await supabase.from('helm_telegram_aprobaciones').select('*').eq('id', id).maybeSingle()
    if (error) throw error
    if (!vinculo || !aprob || aprob.superadmin_id !== vinculo.superadmin_id || String(aprob.tg_chat_id) !== String(chatId)) {
      return await contestar('Esta acción no es tuya.')
    }
    const quien = await quienSigue(vinculo.superadmin_id)
    if (!quien) {
      await desvincular(vinculo.superadmin_id, { motivo: 'cuenta desactivada o agencia sin permiso' })
      return await contestar('Tu cuenta ya no puede usar este bot.')
    }
    // Se pidió para otra agencia (la cuenta ha cambiado de agencia desde entonces): no vale.
    if (aprob.agencia_id !== quien.agencia.id) {
      await anularPendientes({ id }, '⏹ Cancelada: tu cuenta ha cambiado de agencia.')
      return await contestar('Era de otra agencia: ya no vale.')
    }

    await enContexto({ agenciaId: quien.agencia.id, origen: 'telegram' }, async () => {
      // Solo una pulsación pasa de pendiente a decidida: la segunda no cambia nada.
      const { data: cambiadas, error: e2 } = await supabase.from('helm_telegram_aprobaciones')
        .update({ estado: aprobar ? 'aprobada' : 'rechazada', decidida_at: ahora() })
        .eq('id', id).eq('superadmin_id', quien.superadmin.id).eq('agencia_id', quien.agencia.id)
        .eq('estado', 'pendiente').gt('caduca', ahora())
        .select('id')
      if (e2) throw e2
      if (!cambiadas?.length) {
        const caducada = aprob.estado === 'caducada' || new Date(aprob.caduca).getTime() <= Date.now()
        return contestar(caducada ? 'Ha caducado: pídemelo otra vez.' : 'Ya estaba decidida.')
      }
      // Desde aquí el chat está ocupado: un mensaje que llegue mientras se
      // hace no puede llevarse el turno en pausa por delante.
      const gen = generacion(chatId)
      ocupar(chatId)
      if (aprobar) ejecutando.add(id)
      try {
        await contestar(aprobar ? 'Aprobada' : 'Rechazada')
        await decidir({ token, cq, chatId, aprob, aprobar, quien })
        try {
          await seguirSiDecidido({ token, chatId, quien, aprobacionId: id, gen })
        } catch (err) {
          console.warn('[telegram-agencia] reanudar', err?.statusCode || '', err?.message || err)
          await enviarMensaje(token, chatId, mensajeDeError(err)).catch(() => null)
        }
      } finally {
        ejecutando.delete(id)
        soltar(chatId)
      }
    })
  } catch (err) {
    console.warn('[telegram-agencia] botón', err?.message || err)
    if (!contestado) await contestar('No he podido, prueba otra vez.')
    else if (chatId) await enviarMensaje(token, chatId, mensajeDeError(err)).catch(() => null)
  }
}

/** Un update de Telegram. Nunca lanza. */
async function procesarUpdate(update) {
  const token = tokenAgencia()
  if (!token || !update || typeof update !== 'object') return
  if (update.update_id != null && yaVisto(update.update_id)) return
  try {
    if (update.callback_query) return await atenderBoton(token, update.callback_query)
    if (update.message) return await atenderMensaje(token, update.message)
  } catch (err) {
    console.error('[telegram-agencia] update', err?.message || err)
    const chatId = update.message?.chat?.type === 'private' ? update.message.chat.id : null
    if (chatId) await enviarMensaje(token, chatId, mensajeDeError(err)).catch(() => null)
  }
}

// La URL del webhook, sin nada en la query salvo `action`: si alguien hubiera
// enlazado este bot como bot de un perfil, la suya llevaría el secreto.
function sinSecretos(url) {
  if (!url) return ''
  try {
    const u = new URL(url)
    for (const k of [...u.searchParams.keys()]) if (k !== 'action') u.searchParams.delete(k)
    return u.toString()
  } catch {
    return ''
  }
}

/**
 * ¿Telegram le entrega los mensajes del bot a ESTE HELM, botones incluidos?
 * Sin HELM_PUBLIC_URL no se sabe la URL exacta y basta con la ruta.
 */
function webhookPropio(w) {
  if (!w?.url) return false
  const base = (process.env.HELM_PUBLIC_URL || '').trim().replace(/\/$/, '')
  const nuestra = base ? w.url === `${base}/api/telegram-agencia?action=webhook` : String(w.url).includes('/api/telegram-agencia')
  return nuestra && (!w.tipos || w.tipos.includes('callback_query'))
}

// ── Handler ────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  const action = req.query?.action

  // ── POST ?action=webhook — lo llama Telegram, no el navegador ──────────
  // La identidad la da el secreto, que Telegram manda en cabecera en cada
  // update. No va en la URL: acabaría en los logs del túnel.
  if (action === 'webhook') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
    const secreto = secretoAgencia()
    if (!tokenAgencia() || !secreto || !igual(req.headers?.['x-telegram-bot-api-secret-token'], secreto)) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
    res.status(200).json({ ok: true })
    await procesarUpdate(req.body || {})
    return
  }

  applyCors(req, res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  const gate = rateLimit({ key: `telegram-agencia:${getClientIp(req)}`, max: 40, windowMs: 60_000 })
  if (!gate.ok) {
    res.setHeader('Retry-After', String(gate.retryAfter))
    return res.status(429).json({ error: 'Demasiadas peticiones', retryAfter: gate.retryAfter })
  }

  try {
    // ── GET ?action=estado ───────────────────────────────────────────────
    // Con &solo=vinculo, solo si estás vinculado (lo que pregunta el panel
    // cada pocos segundos mientras hay un código vivo): sin llamar a Telegram.
    // A una agencia sin el bot no se le cuenta nada del bot.
    if (req.method === 'GET' && action === 'estado') {
      const auth = await requireSuperAdmin(req)
      const [{ data: v, error }, agencia] = await Promise.all([
        supabase.from('helm_telegram_vinculos').select('tg_user_id, tg_nombre, vinculado_at').eq('superadmin_id', auth.userId).maybeSingle(),
        agenciaPermitida(supabase, auth.agenciaId),
      ])
      if (error) throw error
      const vinculo = {
        vinculado: v?.tg_user_id ? { tg_nombre: v.tg_nombre, vinculado_at: v.vinculado_at } : null,
        permitido: Boolean(agencia),
        plataforma: Boolean(auth.plataforma),
      }
      if (req.query?.solo === 'vinculo') return res.status(200).json(vinculo)

      const token = tokenAgencia()
      const conBot = Boolean(token) && (vinculo.permitido || vinculo.plataforma)
      let bot = null
      let webhook = null
      if (conBot) {
        try {
          const b = await botAgencia()
          bot = { username: b.username, nombre: b.firstName }
        } catch (err) {
          console.warn('[telegram-agencia] getMe', err?.message || err)
        }
        try {
          const w = await infoWebhook(token)
          webhook = {
            url: sinSecretos(w.url), pendientes: w.pendientes, ultimoError: w.ultimoError,
            ultimoErrorFecha: w.ultimoErrorFecha || null, propio: webhookPropio(w),
          }
        } catch (err) {
          console.warn('[telegram-agencia] getWebhookInfo', err?.message || err)
        }
      }
      return res.status(200).json({
        bot, webhook, ...vinculo,
        configurado: vinculo.permitido || vinculo.plataforma ? Boolean(token) : undefined,
        ahora: ahora(),
      })
    }

    // ── POST ?action=codigo ──────────────────────────────────────────────
    // Un código nuevo pisa al anterior; si ya estaba vinculado, el vínculo
    // sigue hasta que se use el código (desde otro móvil, por ejemplo).
    if (req.method === 'POST' && action === 'codigo') {
      const auth = await requireSuperAdmin(req)
      const agencia = await agenciaPermitida(supabase, auth.agenciaId)
      if (!agencia) return res.status(403).json({ error: 'Tu agencia no tiene el bot de Telegram de HELM.' })
      let bot = null
      try { bot = await botAgencia() } catch (err) { console.warn('[telegram-agencia] getMe', err?.message || err) }
      if (!bot?.username) return res.status(503).json({ error: 'El bot de Telegram de HELM no está configurado ahora mismo.' })
      const codigo = generarCodigo()
      const caduca = new Date(Date.now() + MINUTOS_VINCULO * 60_000).toISOString()
      const { error } = await supabase.from('helm_telegram_vinculos').upsert({
        superadmin_id: auth.userId, agencia_id: agencia.id, codigo_hash: sha256(codigo), codigo_caduca: caduca,
      }, { onConflict: 'superadmin_id' })
      if (error) throw error
      return res.status(200).json({ codigo, enlace: `https://t.me/${bot.username}?start=${codigo}`, caduca, ahora: ahora(), segundos: MINUTOS_VINCULO * 60 })
    }

    // ── DELETE ?action=vinculo ───────────────────────────────────────────
    if (req.method === 'DELETE' && action === 'vinculo') {
      const auth = await requireSuperAdmin(req)
      const { data: v, error } = await supabase.from('helm_telegram_vinculos')
        .select('tg_chat_id').eq('superadmin_id', auth.userId).maybeSingle()
      if (error) throw error
      if (v) {
        await desvincular(auth.userId, { motivo: 'desde el panel', actor: auth, req })
        const token = tokenAgencia()
        if (token && v.tg_chat_id) {
          await enviarMensaje(token, v.tg_chat_id, 'Te has desvinculado desde el panel de HELM: este Telegram ya no habla con HELM.').catch(() => null)
        }
      }
      return res.status(200).json({ ok: true })
    }

    // ── POST ?action=registrar ───────────────────────────────────────────
    if (req.method === 'POST' && action === 'registrar') {
      const auth = await requirePlataforma(req)
      const token = tokenAgencia()
      const secreto = secretoAgencia()
      const base = (process.env.HELM_PUBLIC_URL || '').trim().replace(/\/$/, '')
      if (!token || !secreto) return res.status(400).json({ error: 'Faltan HELM_TELEGRAM_TOKEN o HELM_TELEGRAM_SECRETO en el entorno del servidor.' })
      // Telegram solo acepta esto como secret_token.
      if (!/^[A-Za-z0-9_-]{1,256}$/.test(secreto)) {
        return res.status(400).json({ error: 'HELM_TELEGRAM_SECRETO solo puede llevar letras, números, _ y - (hasta 256).' })
      }
      if (!base) return res.status(400).json({ error: 'El servidor no tiene HELM_PUBLIC_URL definida: sin ella no hay webhook.' })
      const url = `${base}/api/telegram-agencia?action=webhook`
      try {
        await registrarWebhook(token, url, secreto, ['message', 'callback_query'])
      } catch (err) {
        return res.status(502).json({ error: `Telegram no aceptó el webhook: ${err.message}` })
      }
      await publicarComandos(token, COMANDOS)
      await writeAudit({ actor: auth, action: 'telegram.agencia_webhook', req, metadata: { url } })
      return res.status(200).json({ ok: true, url })
    }
  } catch (err) {
    const codigo = err?.statusCode || 500
    if (codigo >= 500) console.error('[telegram-agencia]', action, err?.message || err)
    return res.status(codigo).json({ error: codigo >= 500 ? 'Error interno' : err.message })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
