// HELM — Claude (Anthropic) por perfil.
//
// Cada perfil (HELM, consultoría, cualquier cliente) mete SU clave de Anthropic
// desde Ajustes → IA y elige SU modelo. La clave vive en `user_integrations`
// —igual que Stripe o Calendly—, nunca en una columna de `clients` ni al
// alcance del rol anónimo, y no sale del servidor: el navegador solo ve los
// cuatro últimos caracteres.
//
// Sin clave configurada, el perfil sigue con el modelo local (Ollama). Ver
// ./llm.js, que es quien decide cuál de los dos atiende cada petición.
import Anthropic from '@anthropic-ai/sdk'
import { claveParaLlamar } from './licencia.js'

// Modelos que se ofrecen en Ajustes. `esfuerzo` marca los que aceptan
// `output_config.effort`: en Haiku 4.5 ese parámetro da error, así que no se
// manda. Por defecto Opus 5, que es el bueno; quien quiera gastar menos lo
// cambia en el desplegable.
export const MODELOS_CLAUDE = [
  {
    id: 'claude-opus-5',
    label: 'Claude Opus 5',
    desc: 'El más capaz. Para el chat con herramientas y el trabajo largo.',
    esfuerzo: true,
  },
  {
    id: 'claude-sonnet-5',
    label: 'Claude Sonnet 5',
    desc: 'Casi lo mismo por menos. Buen equilibrio para el día a día.',
    esfuerzo: true,
  },
  {
    id: 'claude-haiku-4-5',
    label: 'Claude Haiku 4.5',
    desc: 'El más rápido y barato. Para extraer datos y tareas cortas.',
    esfuerzo: false,
  },
]

export const MODELO_POR_DEFECTO = 'claude-opus-5'

// Precio por millón de tokens, en dólares (tarifas de Anthropic). Solo para
// apuntar lo que ha gastado un trabajo en la cuenta de Claude de quien lo hizo
// (agent_ejecuciones, el estudio de contenido): HELM ya no cobra por uso.
const PRECIOS_USD = {
  'claude-opus-5': { in: 5, out: 25 },
  'claude-sonnet-5': { in: 2, out: 10 },
  'claude-haiku-4-5': { in: 1, out: 5 },
}

/**
 * Lo que cuesta una respuesta, en dólares, a partir de su `usage`. La caché se
 * cobra distinto: leerla vale una décima parte de la entrada y escribirla un
 * 25 % más.
 */
export function costeUsd(modelo, usage = {}) {
  const p = PRECIOS_USD[modelo] || PRECIOS_USD['claude-opus-5']
  const m = 1_000_000
  return (
    (usage.input_tokens || 0) * p.in / m +
    (usage.cache_read_input_tokens || 0) * p.in * 0.1 / m +
    (usage.cache_creation_input_tokens || 0) * p.in * 1.25 / m +
    (usage.output_tokens || 0) * p.out / m
  )
}

export const modeloValido = (id) => MODELOS_CLAUDE.some(m => m.id === id)
const infoModelo = (id) => MODELOS_CLAUDE.find(m => m.id === id) || null

// En Opus 5 y Sonnet 5 el pensamiento va encendido por defecto y `max_tokens`
// es el tope de pensamiento MÁS respuesta. Los sitios que llaman a la IA aquí
// piden 800-3500 tokens porque los calibraron contra un modelo local sin
// pensamiento: con ese tope, Claude se queda a medias. Este suelo le deja aire.
const SUELO_MAX_TOKENS = 8000

// Un timeout más corto que el de Ollama: aquí no hay que cargar el modelo en
// VRAM, y detrás sigue estando el túnel de Cloudflare que corta a los 100 s.
const TIMEOUT_MS = Number(process.env.HELM_CLAUDE_TIMEOUT_MS || 75_000)

const cliente = (apiKey) => new Anthropic({ apiKey, timeout: TIMEOUT_MS, maxRetries: 2 })

/** Errores de la API con el mensaje que se le puede enseñar a una persona. */
function traducirError(err) {
  const status = err?.status || err?.statusCode
  const detalle = err?.error?.error?.message || err?.message || 'error desconocido'
  const msg =
    status === 401 ? 'La clave de Anthropic no es válida o fue revocada.'
    : status === 403 ? 'Esa clave no tiene acceso a este modelo.'
    : status === 404 ? 'Ese modelo no existe para tu cuenta de Anthropic.'
    : status === 429 ? 'Anthropic está limitando las peticiones de tu cuenta. Prueba en un minuto.'
    : status === 400 ? `Anthropic rechazó la petición: ${detalle}`
    : status >= 500 ? 'Anthropic está caído o saturado ahora mismo.'
    : `No se ha podido hablar con Claude: ${detalle}`
  const e = new Error(msg)
  e.statusCode = status === 401 || status === 403 ? status : status === 429 ? 429 : 502
  return e
}

/**
 * ¿Vale la clave y tiene acceso al modelo? Se usa al guardar en Ajustes: si no
 * vale, no se guarda, y así nadie descubre el fallo a mitad de una conversación.
 * @returns {Promise<{model: string, displayName: string}>}
 */
export async function verificarClave(apiKey, model = MODELO_POR_DEFECTO) {
  try {
    const m = await cliente(apiKey).models.retrieve(model)
    return { model: m.id, displayName: m.display_name || m.id }
  } catch (err) {
    throw traducirError(err)
  }
}

// La API de Anthropic es más estricta que Ollama con el historial: el primer
// turno tiene que ser del usuario, los mensajes vacíos se rechazan y todo lo
// que no sea user/assistant sobra. El historial de HELM viene de la base de
// datos y puede empezar por una respuesta del asistente, así que se limpia.
function normalizarMensajes(messages) {
  const limpios = (messages || [])
    .filter(m => (m?.role === 'user' || m?.role === 'assistant') && String(m?.content || '').trim())
    .map(m => ({ role: m.role, content: String(m.content).trim() }))
  while (limpios.length && limpios[0].role === 'assistant') limpios.shift()
  return limpios
}

// HERRAMIENTAS (./acciones.js) está en formato OpenAI/Ollama, que es el que
// entiende el modelo local. Claude las quiere con otro nombre de campos. El
// conector (api/mcp/[token].js) las trae en formato MCP (`inputSchema`), así
// que también se acepta ese.
export const traducirHerramientas = (tools) => (tools || []).map(t => ({
  name: t.function?.name ?? t.name,
  description: t.function?.description ?? t.description ?? '',
  input_schema: t.function?.parameters ?? t.input_schema ?? t.inputSchema ?? { type: 'object', properties: {} },
}))

// De vez en cuando el modelo escribe un parámetro de LISTA como XML dentro de un
// texto («<item>…</item>») y, de paso, mete ahí los parámetros que le siguen
// («</dolores><motivaciones>…»). El panel, que espera listas, se caía entero.
// Se repara contra el esquema de la herramienta antes de devolver los args.
const ITEM_RE = /<item>([\s\S]*?)<\/item>/g
function trozosLista(s) {
  const str = String(s)
  const items = [...str.matchAll(ITEM_RE)].map(m => m[1].trim()).filter(Boolean)
  if (items.length) return items
  const t = str.trim()
  if (t.startsWith('[')) { try { const j = JSON.parse(t); if (Array.isArray(j)) return j } catch { /* no era JSON */ } }
  return t.split(/\n+/).map(x => x.replace(/^\s*(?:[-•*]|\d+[.)])\s*/, '').trim()).filter(Boolean)
}
export function reparaArgs(args, schema) {
  const props = schema?.properties
  if (!props || !args || typeof args !== 'object' || Array.isArray(args)) return args
  const out = { ...args }
  const nombres = Object.keys(props)
  const textos = Object.values(args).filter(v => typeof v === 'string')
  // 1) Parámetros que faltan porque se colaron dentro de otro texto.
  for (const [k, def] of Object.entries(props)) {
    const v = out[k]
    if (v != null && !(def?.type === 'array' && Array.isArray(v) && !v.length)) continue
    for (const s of textos) {
      const m = s.match(new RegExp(`<${k}>([\\s\\S]*?)</${k}>`))
      if (m) { out[k] = def?.type === 'array' ? trozosLista(m[1]) : m[1].trim(); break }
    }
  }
  // 2) Textos con cola colada y listas que llegaron como texto.
  const cola = new RegExp(`<\\/?(?:${nombres.join('|')})>|<\\/?(?:parameter|invoke)\\b`)
  for (const [k, def] of Object.entries(props)) {
    let v = out[k]
    if (typeof v !== 'string') continue
    const tieneItems = /<item>/.test(v)
    const corte = v.search(cola)
    if (corte >= 0) v = v.slice(0, corte)
    if (def?.type === 'array') {
      const deTexto = (def.items?.type ?? 'string') === 'string'
      if (deTexto) out[k] = trozosLista(tieneItems && !/<item>/.test(v) ? out[k] : v)
      else { try { const j = JSON.parse(v); out[k] = Array.isArray(j) ? j : [] } catch { out[k] = [] } }
    } else out[k] = v.trim()
  }
  return out
}

/**
 * Un turno contra Claude. Misma forma de entrada y de salida que
 * `llmChatConHerramientas` en ./llm.js, para que el resto del código no tenga
 * que saber qué modelo hay detrás.
 *
 * `temperature` se ignora a propósito: Opus 5, Sonnet 5 y los Opus 4.7+
 * devuelven 400 si se manda. Lo que aquí sustituye a bajar la temperatura es
 * `esfuerzo: 'low'`, que ya usan los sitios que solo extraen datos.
 *
 * @returns {Promise<{content: string, toolCalls: Array<{name: string, args: object}>}>}
 */
export async function claudeTurno({ apiKey, model, system, messages, maxTokens = 2048, tools, esfuerzo, clientId }) {
  const modelo = modeloValido(model) ? model : MODELO_POR_DEFECTO
  const herramientas = traducirHerramientas(tools)
  const mensajes = normalizarMensajes(messages)
  if (!mensajes.length) {
    const e = new Error('No hay nada que mandarle al modelo.')
    e.statusCode = 400
    throw e
  }

  // Trae tu clave: quien pide «la clave de HELM» llama, en realidad, con la de
  // la agencia del perfil (`clientId`, o el de la petición en curso): 402 sin
  // licencia, 412 sin clave. La clave propia de un perfil va tal cual. Ver
  // ./licencia.js.
  const clave = await claveParaLlamar(apiKey, { clientId })

  let res
  try {
    res = await cliente(clave).messages.create({
      model: modelo,
      max_tokens: Math.max(Number(maxTokens) || 0, SUELO_MAX_TOKENS),
      ...(system ? { system } : {}),
      messages: mensajes,
      ...(herramientas.length ? { tools: herramientas } : {}),
      // Solo donde el modelo lo acepta. Con herramientas se pide poco esfuerzo:
      // elegir la herramienta y rellenar campos no necesita darle vueltas.
      ...(infoModelo(modelo)?.esfuerzo
        ? { output_config: { effort: esfuerzo || (herramientas.length ? 'low' : 'medium') } }
        : {}),
    })
  } catch (err) {
    throw traducirError(err)
  }

  // Los clasificadores de seguridad pueden declinar la petición: llega un 200
  // con `stop_reason: "refusal"` y el contenido vacío. Hay que mirarlo antes de
  // leer los bloques, o el chat contesta con una cadena vacía sin explicar nada.
  if (res.stop_reason === 'refusal') {
    const e = new Error('Claude ha rechazado esta petición por sus filtros de seguridad. Reformúlala.')
    e.statusCode = 422
    throw e
  }

  const texto = res.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('\n')
    .trim()

  const esquemas = Object.fromEntries(herramientas.map(h => [h.name, h.input_schema]))
  const toolCalls = res.content
    .filter(b => b.type === 'tool_use')
    .map(b => ({ name: b.name, args: reparaArgs(b.input || {}, esquemas[b.name]) }))

  // `usage` es para quien lleva la cuenta de lo que gasta (el registro del
  // equipo de agentes); el resto del código lo ignora.
  const usage = {
    in: (res.usage?.input_tokens || 0) + (res.usage?.cache_read_input_tokens || 0) + (res.usage?.cache_creation_input_tokens || 0),
    out: res.usage?.output_tokens || 0,
  }
  return { content: texto, toolCalls, usage }
}

/**
 * Un paso de un bucle agente: devuelve el Message de Anthropic EN CRUDO
 * (content con sus bloques thinking/text/tool_use, stop_reason, usage), para
 * que el que lleva el bucle reenvíe ese content tal cual al historial y pueda
 * encadenar tool_result. A diferencia de `claudeTurno`, los `messages` van tal
 * como llegan (bloques tool_use/tool_result incluidos): no se normalizan ni se
 * aplanan a texto. Con la clave de HELM llama con la de la agencia, igual
 * que `claudeTurno`.
 *
 * `tools` acepta el formato de Claude ({name, description, input_schema}) y el
 * del conector MCP ({name, description, inputSchema}); `traducirHerramientas`
 * normaliza ambos. Va con streaming para no toparse con el timeout cuando la
 * respuesta es larga.
 *
 * Con caché de prompt: cada paso de un bucle reenvía herramientas, system e
 * historial, y sin caché se pagarían enteros cada vez. Hay dos marcas: la del
 * nivel superior, que Anthropic pone en el último bloque y sirve entre pasos
 * del mismo turno, y otra al final del system, para que herramientas + system
 * se aprovechen también entre turnos aunque el historial se rehaga. Para que
 * acierte, el system y las herramientas tienen que llegar idénticos y en el
 * mismo orden.
 */
export async function claudePaso({ apiKey, model, system, messages, tools, maxTokens = 8000, esfuerzo = 'medium', clientId }) {
  if (model && !modeloValido(model)) console.warn('[claude] modelo desconocido:', model, '— uso', MODELO_POR_DEFECTO)
  const modelo = modeloValido(model) ? model : MODELO_POR_DEFECTO
  const herramientas = traducirHerramientas(tools)
  const sistema = typeof system === 'string'
    ? [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }]
    : system

  const clave = await claveParaLlamar(apiKey, { clientId })

  let res
  try {
    res = await cliente(clave).messages.stream({
      model: modelo,
      max_tokens: Math.max(Number(maxTokens) || 0, SUELO_MAX_TOKENS),
      cache_control: { type: 'ephemeral' },
      ...(system ? { system: sistema } : {}),
      messages: messages || [],
      ...(herramientas.length ? { tools: herramientas } : {}),
      ...(infoModelo(modelo)?.esfuerzo ? { output_config: { effort: esfuerzo } } : {}),
    }).finalMessage()
  } catch (err) {
    throw traducirError(err)
  }

  if (res.stop_reason === 'refusal') {
    const e = new Error('Claude ha rechazado esta petición por sus filtros de seguridad. Reformúlala.')
    e.statusCode = 422
    // Ya está gastada: quien llama puede apuntar lo que costó (estudio de contenido).
    e.usage = res.usage
    throw e
  }
  return res
}

// ── Config por perfil ──────────────────────────────────────────────────────
// user_integrations: { client_id, service:'anthropic', enabled, config }
// config = { apiKey, model, displayName, last4 }

export async function getIaConfig(supabase, clientId) {
  const { data } = await supabase
    .from('user_integrations')
    .select('id, config, enabled, updated_at')
    .eq('client_id', clientId).eq('service', 'anthropic')
    .is('member_id', null)
    .maybeSingle()
  return data || null
}

export async function saveIaConfig(supabase, clientId, config, enabled = true) {
  const existing = await getIaConfig(supabase, clientId)
  const row = { client_id: clientId, service: 'anthropic', config, enabled, updated_at: new Date().toISOString() }
  if (existing) {
    const { error } = await supabase.from('user_integrations').update(row).eq('id', existing.id)
    if (error) throw error
  } else {
    const { error } = await supabase.from('user_integrations').insert(row)
    if (error) throw error
  }
}

export async function deleteIaConfig(supabase, clientId) {
  const existing = await getIaConfig(supabase, clientId)
  if (!existing) return false
  const { error } = await supabase.from('user_integrations').delete().eq('id', existing.id)
  if (error) throw error
  return true
}
