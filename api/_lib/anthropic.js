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
// entiende el modelo local. Claude las quiere con otro nombre de campos.
const traducirHerramientas = (tools) => (tools || []).map(t => ({
  name: t.function?.name ?? t.name,
  description: t.function?.description ?? t.description ?? '',
  input_schema: t.function?.parameters ?? t.input_schema ?? { type: 'object', properties: {} },
}))

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
export async function claudeTurno({ apiKey, model, system, messages, maxTokens = 2048, tools, esfuerzo }) {
  const modelo = modeloValido(model) ? model : MODELO_POR_DEFECTO
  const herramientas = traducirHerramientas(tools)
  const mensajes = normalizarMensajes(messages)
  if (!mensajes.length) {
    const e = new Error('No hay nada que mandarle al modelo.')
    e.statusCode = 400
    throw e
  }

  let res
  try {
    res = await cliente(apiKey).messages.create({
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

  const toolCalls = res.content
    .filter(b => b.type === 'tool_use')
    .map(b => ({ name: b.name, args: b.input || {} }))

  return { content: texto, toolCalls }
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
