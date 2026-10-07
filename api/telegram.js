// HELM — Telegram por perfil: hablar con la IA de tu perfil desde el móvil.
//
// El dueño crea un bot en @BotFather, pega el token en Ajustes → Integraciones
// y HELM registra el webhook. Desde ahí, cada mensaje de un chat autorizado va
// al MISMO motor que el chat web (`responderMensaje` de api/chat.js): mismos
// comandos, mismo system prompt, misma memoria y mismo historial. Lo que se
// escribe por Telegram aparece en el chat del panel, y al revés.
//
//   GET    ?action=status  &clientId=                → bot, chats autorizados, código vivo
//   POST   ?action=link    { clientId, token }       → valida el token, registra el webhook
//   DELETE ?action=unlink  &clientId=                → borra el webhook y la config
//   POST   ?action=codigo  { clientId }              → genera un código de /vincular (15 min)
//   DELETE ?action=chat    &clientId=&chatId=        → quita un chat autorizado
//   POST   ?action=webhook &clientId=&secret=        → lo que llama Telegram (sin sesión)
//
// Quién puede hablar: el bot no contesta a cualquiera. Se ha elegido el
// mecanismo de `/vincular <código>` en vez de la lista de chats pendientes
// porque queda más limpio en las dos puntas:
//   · La prueba de identidad es fuerte y de un solo paso: el código solo se ve
//     dentro de HELM con sesión, y hay que escribirlo desde el chat que se
//     quiere autorizar. Quien tiene las dos cosas es el dueño (o alguien a
//     quien el dueño le ha dictado el código a propósito).
//   · No se guarda ningún chat_id desconocido: la config solo contiene chats
//     ya aprobados, no hay lista de pendientes que un desconocido pueda llenar
//     escribiendo al bot, ni nada que caduque y haya que limpiar salvo el
//     propio código (15 min).
//   · A un chat no autorizado el bot no le contesta nada de la IA: como mucho,
//     a /start o /vincular, un texto fijo diciendo que es privado.
//
// Webhook: se contesta 200 ANTES de pensar. Telegram reintenta si no recibe
// 200 rápido y acabaría duplicando mensajes; la respuesta de la IA (hasta 85 s
// con el modelo local) sale después por `sendMessage`. Esto funciona porque la
// API corre como proceso persistente (scripts/api-server.mjs): el trabajo
// sigue tras cerrar la respuesta.
//
// Variables de entorno: HELM_PUBLIC_URL (ver api/_lib/telegram.js).
import crypto from 'node:crypto'
import { supabase } from './lib/supabase.js'
import { applyCors, rateLimit, getClientIp, writeAudit } from './_lib/auth.js'
import { requireProfileAccess } from './_lib/access.js'
import { responderMensaje, COMMANDS } from './chat.js'
import { proveedorDe } from './_lib/llm.js'
import {
  verificarToken, registrarWebhook, borrarWebhook, infoWebhook, publicarComandos,
  accionEscribiendo, enviarMensaje, generarCodigo, igual, normalizarCodigo, nombreDelChat,
  getTelegramConfig, saveTelegramConfig, deleteTelegramConfig, configPublica, MINUTOS_VINCULO,
} from './_lib/telegram.js'

function urlPublica() {
  const base = (process.env.HELM_PUBLIC_URL || '').trim().replace(/\/$/, '')
  return base || null
}

function urlWebhook(clientId, secret) {
  const base = urlPublica()
  if (!base) return null
  return `${base}/api/telegram?action=webhook&clientId=${encodeURIComponent(clientId)}&secret=${encodeURIComponent(secret)}`
}

// Los comandos que el bot atiende por su cuenta, sin pasar por el motor.
const COMANDOS_BOT = [
  { cmd: '/estado', desc: 'Qué perfil y qué modelo están atendiendo este chat.' },
  { cmd: '/vincular', desc: 'Autoriza este chat con el código que te da HELM → Ajustes → Telegram.' },
  { cmd: '/desvincular', desc: 'Este chat deja de hablar con la IA.' },
]

// Telegram no admite guiones en los nombres de comando del menú, así que el
// menú los publica con `_` y aquí se vuelven al canónico. También se quita el
// sufijo @bot que añade Telegram en grupos.
function normalizarTexto(texto) {
  const t = String(texto || '').trim()
  const m = t.match(/^\/([a-záéíóúüñ0-9_-]+)(@\w+)?([\s\S]*)$/i)
  if (!m) return t
  return `/${m[1].toLowerCase().replace(/_/g, '-')}${m[3]}`
}

// Updates ya vistos: Telegram reintenta si no le llega el 200 a tiempo (un
// corte del túnel, por ejemplo) y no queremos contestar dos veces.
const vistos = new Map()
function yaVisto(clave) {
  if (vistos.has(clave)) return true
  vistos.set(clave, Date.now())
  if (vistos.size > 1000) {
    const limite = Date.now() - 10 * 60_000
    for (const [k, t] of vistos) if (t < limite) vistos.delete(k)
  }
  return false
}

// ── Lo que pasa con cada update ────────────────────────────────────────────
// Nunca lanza: todo lo que salga mal acaba en un mensaje al chat o en el log.
async function procesarUpdate({ clientId, row, update }) {
  const cfg = row.config
  const token = cfg.token
  const msg = update?.message
  if (!msg?.chat?.id) return
  if (yaVisto(`${clientId}:${update.update_id}`)) return

  const chatId = msg.chat.id
  const texto = normalizarTexto(msg.text)
  const chats = Array.isArray(cfg.chats) ? cfg.chats : []
  const autorizado = chats.find(c => String(c.id) === String(chatId))

  // Rate limit por chat. Más estricto para desconocidos: es lo único que un
  // desconocido puede hacer contra el bot, probar códigos.
  const gate = rateLimit({ key: `tg:${clientId}:${chatId}`, max: autorizado ? 20 : 5, windowMs: 60_000 })
  if (!gate.ok) {
    console.warn(`[telegram] rate limit chat ${chatId} del perfil ${clientId}`)
    return
  }

  try {
    // ── Chat desconocido: solo /start y /vincular, y sin IA de por medio ──
    if (!autorizado) {
      if (/^\/vincular\b/.test(texto)) {
        const codigo = normalizarCodigo(texto.replace(/^\/vincular\s*/, ''))
        const vivo = cfg.vinculo && new Date(cfg.vinculo.caduca).getTime() > Date.now()
        if (!codigo || !vivo || !igual(codigo, cfg.vinculo.codigo)) {
          await enviarMensaje(token, chatId, 'Ese código no vale o ha caducado. Genera uno nuevo en HELM → Ajustes → Integraciones → Telegram y escríbelo aquí como `/vincular XXXX-XXXX`.')
          return
        }
        const nuevo = { id: chatId, nombre: nombreDelChat(msg), desde: new Date().toISOString() }
        await saveTelegramConfig(supabase, clientId, { ...cfg, chats: [...chats, nuevo], vinculo: null })
        await writeAudit({ clientId, action: 'telegram.chat_linked', metadata: { chatId, nombre: nuevo.nombre } })
        const { data: client } = await supabase.from('clients').select('name').eq('id', clientId).maybeSingle()
        await enviarMensaje(token, chatId,
          `Vinculado. Este chat ya habla con la IA de *${client?.name || 'tu perfil'}*.\n\n`
          + 'Pídeme un guion, un email, estrategia… o escribe /help para ver los comandos. /estado te dice qué modelo está atendiendo.')
        return
      }
      if (/^\/start\b/.test(texto)) {
        await enviarMensaje(token, chatId,
          'Este bot es privado: solo contesta a los chats que su dueño ha autorizado.\n\n'
          + `Si eres tú, genera un código en HELM → Ajustes → Integraciones → Telegram y escríbelo aquí como \`/vincular XXXX-XXXX\` (caduca en ${MINUTOS_VINCULO} minutos).`)
      }
      // Cualquier otra cosa de un desconocido: silencio.
      return
    }

    // ── Chat autorizado ──────────────────────────────────────────────────
    if (!msg.text) {
      await enviarMensaje(token, chatId, 'Por ahora solo entiendo texto. Escríbeme lo que necesitas.')
      return
    }

    if (/^\/estado\b/.test(texto)) {
      const [{ data: client }, prov] = await Promise.all([
        supabase.from('clients').select('name').eq('id', clientId).maybeSingle(),
        proveedorDe(clientId),
      ])
      await enviarMensaje(token, chatId, [
        `*Perfil:* ${client?.name || clientId}`,
        `*Modelo:* ${prov.tipo === 'claude' ? `Claude (${prov.model}), con la clave del perfil` : `local (${prov.model}), en el servidor de HELM`}`,
        `*Bot:* @${cfg.username || '?'}`,
        `*Chats autorizados:* ${chats.length}`,
      ].join('\n'))
      return
    }

    if (/^\/desvincular\b/.test(texto)) {
      await saveTelegramConfig(supabase, clientId, { ...cfg, chats: chats.filter(c => String(c.id) !== String(chatId)) })
      await writeAudit({ clientId, action: 'telegram.chat_unlinked', metadata: { chatId } })
      await enviarMensaje(token, chatId, 'Hecho. Este chat ya no habla con la IA. Para volver, genera otro código en HELM.')
      return
    }

    if (/^\/vincular\b/.test(texto)) {
      await enviarMensaje(token, chatId, 'Este chat ya está vinculado. Escríbeme directamente.')
      return
    }

    // Todo lo demás va al motor del chat, comandos incluidos. Mientras piensa,
    // el "escribiendo…" se renueva cada 4 s (Telegram lo apaga a los 5).
    await accionEscribiendo(token, chatId)
    const latido = setInterval(() => accionEscribiendo(token, chatId), 4000)
    let respuesta
    try {
      const r = await responderMensaje({ clientId, message: texto, origen: 'telegram' })
      respuesta = r.message?.content || ''
    } catch (err) {
      console.warn('[telegram] responderMensaje', err.message)
      respuesta = `⚠️ No he podido contestar: ${err.message || 'error del modelo'}. Prueba otra vez en un momento.`
    } finally {
      clearInterval(latido)
    }
    await enviarMensaje(token, chatId, respuesta || 'Me he quedado sin palabras. Repítemelo de otra forma.')
  } catch (err) {
    console.error('[telegram] procesarUpdate', err)
    try { await enviarMensaje(token, chatId, `⚠️ Algo ha fallado por mi lado: ${err.message}`) } catch { /* ya no hay nada que hacer */ }
  }
}

// ── Handler ────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  const action = req.query.action

  // ── POST ?action=webhook — lo llama Telegram, no el navegador ──────────
  // Sin CORS ni sesión: la identidad la da el secreto, que Telegram manda en
  // cabecera en cada update y que solo conoce quien registró el webhook.
  if (action === 'webhook') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
    const clientId = req.query.clientId
    const cabecera = req.headers?.['x-telegram-bot-api-secret-token']
    const row = clientId ? await getTelegramConfig(supabase, clientId) : null
    const secret = row?.config?.secret
    if (!row?.enabled || !secret || !igual(cabecera, secret) || !igual(req.query.secret, secret)) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    // 200 ya. Lo que tarde la IA se manda después por sendMessage.
    res.status(200).json({ ok: true })
    await procesarUpdate({ clientId, row, update: req.body || {} })
    return
  }

  applyCors(req, res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  const ip = getClientIp(req)
  const gate = rateLimit({ key: `telegram:${ip}`, max: 40, windowMs: 60_000 })
  if (!gate.ok) {
    res.setHeader('Retry-After', String(gate.retryAfter))
    return res.status(429).json({ error: 'Demasiadas peticiones', retryAfter: gate.retryAfter })
  }

  const clientId = req.query.clientId || req.body?.clientId
  if (!clientId) return res.status(400).json({ error: 'clientId requerido' })

  try {
    await requireProfileAccess(req, clientId)
  } catch (err) {
    return res.status(err.statusCode || 401).json({ error: err.message })
  }

  // ── GET ?action=status ───────────────────────────────────────────────────
  if (req.method === 'GET' && action === 'status') {
    const row = await getTelegramConfig(supabase, clientId)
    const pub = configPublica(row)
    let webhook = null
    if (pub.linked) {
      try { webhook = await infoWebhook(row.config.token) } catch (err) { webhook = { ultimoError: err.message } }
    }
    return res.status(200).json({ ...pub, webhook, publicUrl: Boolean(urlPublica()) })
  }

  // ── POST ?action=link ────────────────────────────────────────────────────
  // Se valida contra Telegram antes de guardar y se registra el webhook en el
  // mismo paso: un token que no vale, o un webhook que Telegram rechaza, no
  // dejan nada a medias en la base de datos.
  if (req.method === 'POST' && action === 'link') {
    const token = String(req.body?.token || '').trim()
    if (!token) return res.status(400).json({ error: 'Falta el token del bot' })
    if (!urlPublica()) {
      return res.status(400).json({ error: 'El servidor no tiene HELM_PUBLIC_URL definida: sin ella no se puede registrar el webhook.' })
    }

    let bot
    try {
      bot = await verificarToken(token)
    } catch (err) {
      return res.status(400).json({ error: `Telegram rechazó el token: ${err.message}` })
    }

    // Si ya había config (re-enlazar con el mismo bot), se conservan los chats
    // autorizados: cambiar de token no debería obligar a vincular el móvil otra vez.
    const previa = await getTelegramConfig(supabase, clientId)
    const chats = previa?.config?.botId === bot.botId && Array.isArray(previa.config.chats) ? previa.config.chats : []
    const secret = crypto.randomUUID()

    try {
      await registrarWebhook(token, urlWebhook(clientId, secret), secret)
    } catch (err) {
      return res.status(502).json({ error: `Telegram no aceptó el webhook: ${err.message}` })
    }
    await publicarComandos(token, [...COMMANDS, ...COMANDOS_BOT])

    await saveTelegramConfig(supabase, clientId, {
      token, botId: bot.botId, username: bot.username, firstName: bot.firstName,
      secret, chats, vinculo: null,
    })
    await writeAudit({ clientId, action: 'telegram.linked', req, metadata: { username: bot.username } })

    return res.status(200).json({ ...configPublica({ enabled: true, config: { token, username: bot.username, firstName: bot.firstName, chats } }), publicUrl: true })
  }

  // ── DELETE ?action=unlink ────────────────────────────────────────────────
  if (req.method === 'DELETE' && action === 'unlink') {
    const row = await getTelegramConfig(supabase, clientId)
    if (row?.config?.token) await borrarWebhook(row.config.token)
    try {
      await deleteTelegramConfig(supabase, clientId)
    } catch (err) {
      return res.status(500).json({ error: err.message })
    }
    await writeAudit({ clientId, action: 'telegram.unlinked', req })
    return res.status(200).json({ linked: false })
  }

  // ── POST ?action=codigo ──────────────────────────────────────────────────
  // Un código nuevo pisa al anterior: solo hay uno vivo por perfil.
  if (req.method === 'POST' && action === 'codigo') {
    const row = await getTelegramConfig(supabase, clientId)
    if (!row?.enabled || !row.config?.token) return res.status(400).json({ error: 'Primero enlaza el bot' })
    const vinculo = {
      codigo: generarCodigo(),
      caduca: new Date(Date.now() + MINUTOS_VINCULO * 60_000).toISOString(),
    }
    await saveTelegramConfig(supabase, clientId, { ...row.config, vinculo })
    return res.status(200).json({ vinculo, username: row.config.username || null })
  }

  // ── DELETE ?action=chat ──────────────────────────────────────────────────
  if (req.method === 'DELETE' && action === 'chat') {
    const chatId = String(req.query.chatId || req.body?.chatId || '')
    if (!chatId) return res.status(400).json({ error: 'chatId requerido' })
    const row = await getTelegramConfig(supabase, clientId)
    if (!row) return res.status(404).json({ error: 'Telegram no está enlazado' })
    const chats = (row.config.chats || []).filter(c => String(c.id) !== chatId)
    await saveTelegramConfig(supabase, clientId, { ...row.config, chats })
    await writeAudit({ clientId, action: 'telegram.chat_revoked', req, metadata: { chatId } })
    return res.status(200).json({ chats })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
