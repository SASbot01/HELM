// HELM — capa de IA. Dos proveedores, uno por perfil.
//
//   · Sin configurar → modelo LOCAL vía Ollama, en este mismo servidor. Nada
//     sale a internet y no se gasta un token de nadie: Ollama escucha en
//     127.0.0.1:11434 y el modelo corre en la GPU de la máquina.
//   · Con clave de Anthropic en Ajustes → Claude, con la clave y el modelo de
//     ESE perfil. HELM y consultoría no comparten clave, ni modelo, ni factura.
//
// Quien llama no elige proveedor: pasa `clientId` y aquí se resuelve. Sin
// `clientId` (health general, scripts) se usa el local.
//
// Config por entorno (todas opcionales, los defaults funcionan tal cual):
//   OLLAMA_URL   → http://127.0.0.1:11434
//   HELM_LLM_MODEL → qwen2.5:14b-instruct
//   HELM_LLM_CTX   → 16384   (ventana de contexto en tokens)
//
// Para cambiar de modelo local: `ollama pull <modelo>` y ajustar HELM_LLM_MODEL.
import { supabase } from '../lib/supabase.js'
import { claudeTurno, getIaConfig, verificarClave, MODELO_POR_DEFECTO, MODELOS_CLAUDE } from './anthropic.js'

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434'
const MODEL = process.env.HELM_LLM_MODEL || 'qwen2.5:14b-instruct'
const NUM_CTX = Number(process.env.HELM_LLM_CTX || 16384)

// Un 14B en GPU tarda del orden de 20-60s en una respuesta larga. El tope son
// 85 s y no más porque HELM se sirve detrás de un túnel de Cloudflare, que
// corta a los 100 s con un 524 — una pantalla de error ajena que no explica
// nada. Antes de llegar ahí preferimos cortar nosotros y decir qué ha pasado.
const TIMEOUT_MS = Number(process.env.HELM_LLM_TIMEOUT_MS || 85_000)

// Cuánto se queda el modelo cargado en la VRAM entre peticiones. Por defecto
// Ollama lo descarga a los 5 minutos y la siguiente petición paga la recarga.
const KEEP_ALIVE = process.env.HELM_LLM_KEEP_ALIVE || '30m'

export const llmInfo = { url: OLLAMA_URL, model: MODEL, ctx: NUM_CTX }

// ── Qué proveedor atiende a este perfil ────────────────────────────────────
// La config vive en `user_integrations` y se consulta en cada llamada al
// modelo, así que se cachea un minuto: sin esto, una conversación con
// herramientas hace tres o cuatro viajes a Supabase para leer lo mismo.
const CACHE_MS = 60_000
const cache = new Map()

/** Olvida la config cacheada de un perfil. La llama Ajustes al guardar o borrar. */
export function olvidarProveedor(clientId) {
  if (clientId) cache.delete(clientId)
  else cache.clear()
}

/**
 * @returns {Promise<{tipo: 'claude'|'local', apiKey?: string, model: string}>}
 */
export async function proveedorDe(clientId) {
  const local = { tipo: 'local', model: MODEL }
  if (!clientId) return local

  const cacheado = cache.get(clientId)
  if (cacheado && cacheado.exp > Date.now()) return cacheado.valor

  let valor = local
  try {
    const row = await getIaConfig(supabase, clientId)
    const cfg = row?.config || {}
    if (row?.enabled && cfg.apiKey) {
      valor = { tipo: 'claude', apiKey: cfg.apiKey, model: cfg.model || MODELO_POR_DEFECTO }
    }
  } catch {
    // Si Supabase no contesta, el perfil no se queda sin IA: sigue el local.
    valor = local
  }

  cache.set(clientId, { valor, exp: Date.now() + CACHE_MS })
  return valor
}

/**
 * ¿Está viva la IA de este perfil? Con Claude, comprueba que la clave sigue
 * valiendo; sin clave, que Ollama está arriba y tiene el modelo descargado.
 * @returns {Promise<{ok: boolean, proveedor: string, model: string, models?: string[], error?: string}>}
 */
export async function llmHealth(clientId) {
  const prov = await proveedorDe(clientId)
  if (prov.tipo === 'claude') {
    const etiqueta = MODELOS_CLAUDE.find(m => m.id === prov.model)?.label || prov.model
    // Se comprueba contra el catálogo de modelos, no generando texto: valida
    // clave y acceso al modelo —lo que de verdad se rompe— sin gastar tokens
    // ni arriesgarse al tope de tiempo de la función al abrir Ajustes.
    try {
      await verificarClave(prov.apiKey, prov.model)
      return { ok: true, proveedor: 'claude', model: prov.model, label: etiqueta }
    } catch (err) {
      return { ok: false, proveedor: 'claude', model: prov.model, label: etiqueta, error: err.message }
    }
  }
  return { ...(await ollamaHealth()), proveedor: 'local', url: OLLAMA_URL, ctx: NUM_CTX }
}

/**
 * ¿Está Ollama vivo y tiene el modelo cargado?
 * @returns {Promise<{ok: boolean, model: string, models?: string[], error?: string}>}
 */
async function ollamaHealth() {
  try {
    const r = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(5000) })
    if (!r.ok) return { ok: false, model: MODEL, error: `Ollama respondió ${r.status}` }
    const data = await r.json()
    const models = (data.models || []).map(m => m.name)
    return {
      ok: models.includes(MODEL),
      model: MODEL,
      models,
      error: models.includes(MODEL)
        ? undefined
        : `El modelo "${MODEL}" no está descargado. Disponibles: ${models.join(', ') || 'ninguno'}`,
    }
  } catch (err) {
    return { ok: false, model: MODEL, error: `No se puede hablar con Ollama en ${OLLAMA_URL}: ${err.message}` }
  }
}

/**
 * Completa un chat contra el modelo de este perfil.
 * @param {object}   opts
 * @param {string}   [opts.clientId]  perfil; decide si contesta Claude o el local
 * @param {string}   opts.system      system prompt
 * @param {Array<{role:'user'|'assistant', content:string}>} opts.messages
 * @param {number}   [opts.temperature] 0-1. Copy creativo pide algo alto. Solo local.
 * @param {number}   [opts.maxTokens]   tope de tokens generados
 * @returns {Promise<string>} texto de la respuesta
 */
export async function llmChat(opts) {
  const prov = await proveedorDe(opts.clientId)
  if (prov.tipo === 'claude') {
    const { content } = await claudeTurno({ ...opts, apiKey: prov.apiKey, model: prov.model })
    if (!content) {
      const e = new Error('Claude ha devuelto una respuesta vacía.')
      e.statusCode = 502
      throw e
    }
    return content
  }

  const msg = await ollamaChat(opts)
  const text = (msg?.content || '').trim()
  if (!text) {
    const e = new Error('El modelo local ha devuelto una respuesta vacía.')
    e.statusCode = 502
    throw e
  }
  return text
}

/**
 * Igual que llmChat pero con herramientas: el modelo puede pedir que se
 * ejecuten en vez de contestar texto.
 *
 * Devuelve el mensaje crudo porque un turno con herramientas tiene dos salidas
 * posibles —texto o llamadas— y quien decide qué hacer con ellas es el chat.
 *
 * @param {object} opts       lo mismo que llmChat, más:
 * @param {Array}  opts.tools definiciones en formato OpenAI/Ollama
 * @returns {Promise<{content: string, toolCalls: Array<{name: string, args: object}>}>}
 */
export async function llmChatConHerramientas(opts) {
  const prov = await proveedorDe(opts.clientId)
  if (prov.tipo === 'claude') {
    return claudeTurno({ ...opts, apiKey: prov.apiKey, model: prov.model })
  }

  const msg = await ollamaChat(opts)
  const toolCalls = (msg?.tool_calls || []).map(c => ({
    name: c?.function?.name,
    // Ollama devuelve los argumentos ya parseados, pero algunos modelos los
    // mandan como cadena JSON: se admiten las dos formas.
    args: typeof c?.function?.arguments === 'string'
      ? (() => { try { return JSON.parse(c.function.arguments) } catch { return {} } })()
      : (c?.function?.arguments || {}),
  })).filter(c => c.name)
  return { content: (msg?.content || '').trim(), toolCalls }
}

async function ollamaChat({ system, messages, temperature = 0.75, maxTokens = 2048, tools }) {
  let res
  try {
    res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify({
        model: MODEL,
        // En streaming aunque aquí no se use trozo a trozo: sin él, Ollama no
        // manda ni un byte hasta acabar, y el fetch de Node se rinde a los 5
        // minutos sin cabeceras ("fetch failed") por mucho TIMEOUT_MS que
        // haya. El worker del Agent OS, en CPU, pasa de ahí con reels largos.
        stream: true,
        keep_alive: KEEP_ALIVE,
        messages: [{ role: 'system', content: system }, ...messages],
        ...(tools?.length ? { tools } : {}),
        options: {
          // Decidir qué herramienta usar y con qué argumentos no es escribir
          // copy: ahí la creatividad estorba. Con herramientas se baja la
          // temperatura para que no adorne los datos.
          temperature: tools?.length ? Math.min(temperature, 0.2) : temperature,
          num_ctx: NUM_CTX,
          num_predict: maxTokens,
          // Penaliza repetir el mismo arranque de frase, que es el vicio
          // típico de los modelos pequeños escribiendo listas de hooks.
          repeat_penalty: 1.12,
          top_p: 0.9,
        },
      }),
    })
  } catch (err) {
    const e = new Error(
      err.name === 'TimeoutError'
        ? 'El modelo local ha tardado demasiado. Prueba a pedir algo más corto.'
        : `No se puede hablar con el modelo local (${OLLAMA_URL}): ${err.message}`,
    )
    e.statusCode = 503
    throw e
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    const e = new Error(`El modelo local ha fallado (${res.status}). ${detail.slice(0, 200)}`)
    e.statusCode = 502
    throw e
  }

  // Una línea JSON por trozo. Se junta en un mensaje igual al de sin
  // streaming: el texto seguido y las tool_calls de donde vengan.
  const msg = { role: 'assistant', content: '' }
  const toolCalls = []
  const lineas = (await res.text()).split('\n').filter(Boolean)
  for (const l of lineas) {
    const d = JSON.parse(l)
    if (d.error) {
      const e = new Error(`El modelo local ha fallado. ${String(d.error).slice(0, 200)}`)
      e.statusCode = 502
      throw e
    }
    msg.content += d.message?.content || ''
    if (d.message?.tool_calls) toolCalls.push(...d.message.tool_calls)
  }
  if (toolCalls.length) msg.tool_calls = toolCalls
  // Se devuelve el mensaje entero: en un turno con herramientas `content` viene
  // vacío y lo que importa está en `tool_calls`.
  return msg
}
