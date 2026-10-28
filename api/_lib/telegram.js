// HELM — Telegram por perfil: el bot con el que el dueño habla con la IA de
// SU perfil desde el móvil.
//
// El usuario crea un bot en @BotFather y pega aquí el token. Vive en
// `user_integrations` ({ client_id, service:'telegram', enabled, config }),
// igual que Calendly o la clave de Claude — nunca en `clients` ni al alcance
// del rol anónimo, y nunca vuelve al navegador entero.
//
// config = {
//   token, botId, username, firstName, last4,
//   secret,            → lo que Telegram manda en X-Telegram-Bot-Api-Secret-Token
//   chats: [{ id, nombre, desde }],            → los únicos chats a los que contesta la IA
//   vinculo: { codigo, caduca } | null,        → código de /vincular vivo (15 min)
// }
//
// Variables de entorno:
//   HELM_PUBLIC_URL → URL pública de HELM (https://helm.s4sf.net). Es a donde
//                     Telegram manda los mensajes; sin ella no hay webhook que
//                     registrar y la tarjeta de Ajustes lo dice en vez de fallar.
import crypto from 'node:crypto'

const API = 'https://api.telegram.org'

// Telegram corta los mensajes a 4.096 caracteres. Se trocea antes, con margen.
export const MAX_MENSAJE = 4000
export const MINUTOS_VINCULO = 15

/** Llamada cruda a la Bot API. Lanza con `statusCode` si Telegram dice que no. */
export async function tg(token, method, body) {
  let r
  try {
    r = await fetch(`${API}/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
      signal: AbortSignal.timeout(15_000),
    })
  } catch (err) {
    const e = new Error(`No se puede hablar con Telegram: ${err.message}`)
    e.statusCode = 502
    throw e
  }
  const data = await r.json().catch(() => ({}))
  if (!r.ok || !data.ok) {
    const desc = data?.description || `Telegram respondió ${r.status}`
    const e = new Error(r.status === 401 || r.status === 404 ? 'Token del bot no válido.' : desc)
    e.statusCode = r.status === 401 || r.status === 404 ? 401 : 502
    e.telegramCode = data?.error_code || r.status
    throw e
  }
  return data.result
}

/** Verifica el token contra Telegram y devuelve los datos del bot. */
export async function verificarToken(token) {
  if (!/^\d{6,}:[A-Za-z0-9_-]{30,}$/.test(token)) {
    const e = new Error('Eso no tiene pinta de token de bot (formato 123456789:AAAA…).')
    e.statusCode = 400
    throw e
  }
  const me = await tg(token, 'getMe')
  return { botId: me.id, username: me.username, firstName: me.first_name }
}

/** Registra (o quita) el webhook. `secret` viaja en cada update como cabecera. */
export function registrarWebhook(token, url, secret) {
  return tg(token, 'setWebhook', {
    url,
    secret_token: secret,
    allowed_updates: ['message'],
    // Lo que se acumuló mientras no había webhook no interesa: podría ser de
    // otro perfil o de otra instalación que usó el mismo bot.
    drop_pending_updates: true,
  })
}

export function borrarWebhook(token) {
  return tg(token, 'deleteWebhook', { drop_pending_updates: true }).catch(() => null)
}

/** Estado del webhook según Telegram (último error, updates pendientes…). */
export async function infoWebhook(token) {
  const i = await tg(token, 'getWebhookInfo')
  return {
    url: i.url || null,
    pendientes: i.pending_update_count || 0,
    ultimoError: i.last_error_message || null,
    ultimoErrorFecha: i.last_error_date ? new Date(i.last_error_date * 1000).toISOString() : null,
  }
}

/** El menú de comandos del bot (el que sale al escribir "/"). Nombres sin guiones: Telegram no los admite. */
export function publicarComandos(token, comandos) {
  return tg(token, 'setMyCommands', {
    commands: comandos
      .map(c => ({ command: c.cmd.replace(/^\//, '').replace(/-/g, '_').replace(/[^a-z0-9_]/g, ''), description: c.desc.slice(0, 256) }))
      .filter(c => c.command)
      .slice(0, 100),
  }).catch(() => null)
}

export function accionEscribiendo(token, chatId) {
  return tg(token, 'sendChatAction', { chat_id: chatId, action: 'typing' }).catch(() => null)
}

// ── Envío de texto ─────────────────────────────────────────────────────────

/** Parte un texto largo en trozos que quepan en un mensaje, cortando por párrafo o línea si puede. */
export function trocear(texto, max = MAX_MENSAJE) {
  const t = String(texto || '')
  if (t.length <= max) return [t]
  const trozos = []
  let resto = t
  while (resto.length > max) {
    let corte = resto.lastIndexOf('\n\n', max)
    if (corte < max * 0.5) corte = resto.lastIndexOf('\n', max)
    if (corte < max * 0.5) corte = resto.lastIndexOf(' ', max)
    if (corte < max * 0.5) corte = max
    trozos.push(resto.slice(0, corte))
    resto = resto.slice(corte).replace(/^\s+/, '')
  }
  if (resto) trozos.push(resto)
  return trozos
}

// El modelo escribe Markdown de documento (**negrita**, ### títulos). Telegram
// entiende su Markdown "legacy" (*negrita*, _cursiva_, `código`), así que se
// traduce lo que se puede. Si aun así Telegram no lo parsea (un `_` suelto en
// una URL con UTMs, por ejemplo), se reenvía en texto plano: antes un mensaje
// sin formato que ningún mensaje.
export function aMarkdownTelegram(md) {
  return String(md || '')
    .replace(/^#{1,6}\s+(.+)$/gm, '*$1*')       // ### Título → *Título*
    .replace(/\*\*(.+?)\*\*/g, '*$1*')           // **negrita** → *negrita*
    .replace(/^\s*[-·•]\s+/gm, '• ')             // viñetas uniformes
}

/** Manda un mensaje (troceado si hace falta) a un chat. Devuelve cuántos trozos salieron. */
export async function enviarMensaje(token, chatId, texto) {
  const trozos = trocear(aMarkdownTelegram(texto))
  for (const trozo of trozos) {
    try {
      await tg(token, 'sendMessage', { chat_id: chatId, text: trozo, parse_mode: 'Markdown', disable_web_page_preview: true })
    } catch (err) {
      // 400 = no ha podido parsear las entidades. Sin formato y adelante.
      if (err.telegramCode !== 400) throw err
      await tg(token, 'sendMessage', { chat_id: chatId, text: trozo, disable_web_page_preview: true })
    }
  }
  return trozos.length
}

// ── Vinculación ────────────────────────────────────────────────────────────

/** Código legible para /vincular: 8 caracteres sin letras que se confundan (0/O, 1/I). */
export function generarCodigo() {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = crypto.randomBytes(8)
  let out = ''
  for (let i = 0; i < 8; i++) out += alfabeto[bytes[i] % alfabeto.length]
  return `${out.slice(0, 4)}-${out.slice(4)}`
}

/** Comparación en tiempo constante: ni el secreto del webhook ni el código de vínculo se comparan con `===`. */
export function igual(a, b) {
  const x = Buffer.from(String(a || ''))
  const y = Buffer.from(String(b || ''))
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y)
}

/** Normaliza lo que escribe alguien para compararlo con el código: mayúsculas, sin espacios, con el guion en su sitio. */
export function normalizarCodigo(txt) {
  const limpio = String(txt || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  return limpio.length === 8 ? `${limpio.slice(0, 4)}-${limpio.slice(4)}` : limpio
}

/** Nombre legible de quien escribe, para la lista de chats de Ajustes. */
export function nombreDelChat(msg) {
  const from = msg?.from || {}
  const chat = msg?.chat || {}
  const persona = [from.first_name, from.last_name].filter(Boolean).join(' ')
  const usuario = from.username ? `@${from.username}` : ''
  if (chat.type && chat.type !== 'private') return chat.title || persona || String(chat.id)
  return [persona, usuario].filter(Boolean).join(' ') || String(chat.id)
}

// ── Config por perfil ──────────────────────────────────────────────────────
// user_integrations: { client_id, service:'telegram', enabled, config }

export async function getTelegramConfig(supabase, clientId) {
  const { data } = await supabase
    .from('user_integrations')
    .select('id, config, enabled, updated_at')
    .eq('client_id', clientId).eq('service', 'telegram')
    .is('member_id', null)
    .maybeSingle()
  return data || null
}

export async function saveTelegramConfig(supabase, clientId, config, enabled = true) {
  const existing = await getTelegramConfig(supabase, clientId)
  const row = { client_id: clientId, service: 'telegram', config, enabled, updated_at: new Date().toISOString() }
  if (existing) {
    const { error } = await supabase.from('user_integrations').update(row).eq('id', existing.id)
    if (error) throw error
  } else {
    const { error } = await supabase.from('user_integrations').insert(row)
    if (error) throw error
  }
}

export async function deleteTelegramConfig(supabase, clientId) {
  const existing = await getTelegramConfig(supabase, clientId)
  if (!existing) return false
  const { error } = await supabase.from('user_integrations').delete().eq('id', existing.id)
  if (error) throw error
  return true
}

/** Lo que puede ver el navegador de esta config: nada del token, nada del secreto. */
export function configPublica(row) {
  const cfg = row?.config || {}
  const ahora = Date.now()
  const vinculo = cfg.vinculo && new Date(cfg.vinculo.caduca).getTime() > ahora ? cfg.vinculo : null
  return {
    linked: Boolean(row?.enabled && cfg.token),
    username: cfg.username || null,
    botName: cfg.firstName || null,
    last4: cfg.token ? cfg.token.slice(-4) : null,
    chats: Array.isArray(cfg.chats) ? cfg.chats : [],
    vinculo,
    updatedAt: row?.updated_at || null,
  }
}
