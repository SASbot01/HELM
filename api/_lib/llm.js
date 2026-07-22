// HELM — capa de IA. Modelo LOCAL vía Ollama, en este mismo servidor.
//
// Nada sale a internet y no se gasta un token de nadie: Ollama escucha en
// 127.0.0.1:11434 y el modelo corre en la GPU de la máquina.
//
// Config por entorno (todas opcionales, los defaults funcionan tal cual):
//   OLLAMA_URL   → http://127.0.0.1:11434
//   HELM_LLM_MODEL → qwen2.5:14b-instruct
//   HELM_LLM_CTX   → 16384   (ventana de contexto en tokens)
//
// Para cambiar de modelo: `ollama pull <modelo>` y ajustar HELM_LLM_MODEL.

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434'
const MODEL = process.env.HELM_LLM_MODEL || 'qwen2.5:14b-instruct'
const NUM_CTX = Number(process.env.HELM_LLM_CTX || 16384)

// Un 14B en GPU tarda del orden de 20-60s en una respuesta larga; el timeout
// va holgado para que no corte a mitad de un guion.
const TIMEOUT_MS = Number(process.env.HELM_LLM_TIMEOUT_MS || 180_000)

export const llmInfo = { url: OLLAMA_URL, model: MODEL, ctx: NUM_CTX }

/**
 * ¿Está Ollama vivo y tiene el modelo cargado?
 * @returns {Promise<{ok: boolean, model: string, models?: string[], error?: string}>}
 */
export async function llmHealth() {
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
 * Completa un chat contra el modelo local.
 * @param {object}   opts
 * @param {string}   opts.system      system prompt
 * @param {Array<{role:'user'|'assistant', content:string}>} opts.messages
 * @param {number}   [opts.temperature] 0-1. Copy creativo pide algo alto.
 * @param {number}   [opts.maxTokens]   tope de tokens generados
 * @returns {Promise<string>} texto de la respuesta
 */
export async function llmChat({ system, messages, temperature = 0.75, maxTokens = 2048 }) {
  let res
  try {
    res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify({
        model: MODEL,
        stream: false,
        messages: [{ role: 'system', content: system }, ...messages],
        options: {
          temperature,
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

  const data = await res.json()
  const text = (data?.message?.content || '').trim()
  if (!text) {
    const e = new Error('El modelo local ha devuelto una respuesta vacía.')
    e.statusCode = 502
    throw e
  }
  return text
}
