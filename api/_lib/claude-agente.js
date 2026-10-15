// HELM — el bucle de Claude con herramientas, pensado para pausarse.
//
// El dueño le escribe al bot, Claude pide herramientas, se ejecutan y el
// resultado vuelve a Claude hasta que contesta. La vuelta de tuerca es que
// algunas herramientas ESCRIBEN y hay que pedirle permiso por Telegram antes:
// como el "Aprobar" llega en otra petición (minutos después, quizá tras un
// reinicio), el bucle no se puede dejar colgado en memoria. Por eso `turnoAgente`
// hace un paso cada vez y, en cuanto ve una herramienta delicada, se PARA y
// devuelve lo que falta decidir; el estado (los `messages`) se guarda y se
// reanuda con `cierraPendientes` + otra llamada a `turnoAgente`.
//
// Reglas de la API de Anthropic que este módulo respeta y que no se pueden
// romper al reanudar:
// - El `content` del asistente se reenvía TAL CUAL al historial, con sus
//   bloques `thinking` incluidos y sin reordenar: quitarlos o moverlos dentro
//   de una ronda de herramientas da 400.
// - Cada `tool_use` necesita su `tool_result` (mismo `tool_use_id`) en el
//   mensaje `user` siguiente, y todos los de un paso van en UN solo mensaje.
// - No se mandan resultados a medias: si un paso tiene alguna herramienta
//   delicada, se ejecutan las que no lo son pero NO se manda nada hasta tenerlas
//   todas decididas.
import { claudePaso, reparaArgs, traducirHerramientas } from './anthropic.js'

// Lo que se le devuelve a Claude como resultado de una herramienta que el dueño
// ha rechazado: que no se ha hecho y que no insista sin preguntar.
export const RECHAZADA = 'El dueño ha rechazado esta acción y no se ha hecho. No la repitas sin preguntarle.'

// Herramientas que se atienden en un mismo paso. Si Claude pide más en
// paralelo (p. ej. refrescar las métricas de todos los perfiles a la vez), las
// de más vuelven con error para que las pida en otro paso.
export const MAX_POR_PASO = 6

const CORTADA = 'La llamada llegó cortada por longitud y no se ha hecho. Divídela en lotes más pequeños y vuelve a pedirla.'
const DEMASIADAS = `Demasiadas herramientas a la vez: esta no se ha hecho. Pídela en otro paso (como mucho ${MAX_POR_PASO} por paso).`
const AVISO_CORTE = '⚠️ La respuesta se ha cortado por largo.'
const AVISO_LLENO = '⚠️ La conversación se ha hecho demasiado larga y no puedo seguir con ella. Empieza una nueva.'

const textoDe = (res) => (res?.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim()
const conAviso = (texto, aviso) => [texto, aviso].filter(Boolean).join('\n\n')

// Un bloque tool_result. Un texto vacío se cambia por una frase: así Claude
// sabe en qué quedó la llamada.
const resultado = (id, texto, ok) => ({
  type: 'tool_result',
  tool_use_id: id,
  content: String(texto ?? '') || (ok ? 'Hecho.' : 'No se ha podido.'),
  ...(ok ? {} : { is_error: true }),
})

// Si no se sabe decir si una herramienta es delicada, se trata como si lo
// fuera: mejor pedir permiso de más que escribir sin él.
function delicada(esDelicada, name, input) {
  try {
    return Boolean(esDelicada(name, input))
  } catch {
    return true
  }
}

// Una herramienta que lanza no tumba el turno: su fallo vuelve a Claude como
// resultado con error, y cada tool_use se queda con su tool_result.
async function ejecuta(ejecutar, b, input) {
  try {
    const r = await ejecutar(b.name, input)
    return resultado(b.id, r?.texto, Boolean(r?.ok))
  } catch (err) {
    return resultado(b.id, `No se ha podido: ${err?.message || err}`, false)
  }
}

/**
 * Un turno del agente: va dando pasos contra Claude hasta que contesta, se
 * queda sin pasos o topa con una herramienta delicada. No toca el array
 * `messages` que recibe: el historial ampliado viene en el resultado.
 *
 * @param {object}   o
 * @param {string}   o.apiKey
 * @param {string}   o.model
 * @param {string}   o.system     exacto, el mismo al reanudar
 * @param {Array}    o.messages   historial en crudo (bloques)
 * @param {Array}    o.tools      [{ name, description, input_schema }] (o inputSchema, formato MCP)
 * @param {Function} o.ejecutar   (name, input) => Promise<{ ok, texto }>
 * @param {Function} o.esDelicada (name, input) => boolean
 * @param {number}   [o.maxPasos=10]
 * @param {number}   [o.maxTokens=32000]  por paso, pensamiento incluido
 * @param {string}   [o.esfuerzo='medium']
 * @returns {Promise<
 *   | { tipo: 'fin',       texto: string, messages: Array }
 *   | { tipo: 'pendiente', texto: string, messages: Array, resultados: Array, pendientes: Array }
 *   | { tipo: 'tope',      messages: Array, texto: string }
 * >}
 */
export async function turnoAgente({
  apiKey, model, system, messages, tools, ejecutar, esDelicada,
  maxPasos = 10, maxTokens = 32_000, esfuerzo = 'medium',
}) {
  const historial = [...(messages || [])]
  const esquemas = Object.fromEntries(traducirHerramientas(tools).map(t => [t.name, t.input_schema]))
  let texto = ''
  for (let paso = 0; paso < maxPasos; paso++) {
    const res = await claudePaso({ apiKey, model, system, messages: historial, tools, maxTokens, esfuerzo })
    // El content del asistente, verbatim: thinking + text + tool_use.
    historial.push({ role: 'assistant', content: res.content })
    texto = textoDe(res)
    const usos = (res.content || []).filter(b => b.type === 'tool_use')

    // Herramientas de servidor (búsqueda web): Anthropic pide volver a llamar.
    if (res.stop_reason === 'pause_turn') continue

    // Cortada por largo. Un tool_use cortado trae el input a medias: no se
    // ejecuta ninguno del paso, se le dice a Claude por qué y se sigue. Sin
    // herramientas, o con el contexto lleno, el turno acaba con el aviso: nunca
    // un «hecho» vacío por un corte.
    if (res.stop_reason === 'max_tokens' || res.stop_reason === 'model_context_window_exceeded') {
      const lleno = res.stop_reason === 'model_context_window_exceeded'
      if (usos.length) historial.push({ role: 'user', content: usos.map(b => resultado(b.id, CORTADA, false)) })
      if (!usos.length || lleno) return { tipo: 'fin', texto: conAviso(texto, lleno ? AVISO_LLENO : AVISO_CORTE), messages: historial }
      continue
    }

    // Sin herramientas que ejecutar, es la respuesta.
    if (res.stop_reason !== 'tool_use') return { tipo: 'fin', texto, messages: historial }

    const resultados = []
    const pendientes = []
    for (const [i, b] of usos.entries()) {
      if (i >= MAX_POR_PASO) {
        resultados.push(resultado(b.id, DEMASIADAS, false))
        continue
      }
      const input = reparaArgs(b.input || {}, esquemas[b.name])
      if (delicada(esDelicada, b.name, input)) {
        pendientes.push({ id: b.id, name: b.name, input })
        continue
      }
      resultados.push(await ejecuta(ejecutar, b, input))
    }

    // Si algo necesita permiso, se para: se devuelven las ya hechas y lo que
    // falta por decidir, con lo que Claude haya explicado en ese paso. Nada
    // vuelve a Claude todavía.
    if (pendientes.length) return { tipo: 'pendiente', texto, messages: historial, resultados, pendientes }

    // Todas hechas: sus resultados, en un solo mensaje user, y otra vuelta.
    historial.push({ role: 'user', content: resultados })
  }
  return { tipo: 'tope', messages: historial, texto }
}

/**
 * Cierra un turno que estaba en pausa: junta en UN mensaje `user` los
 * `tool_result` de las herramientas que ya se habían ejecutado (`resultados`)
 * y los de las que el dueño acaba de decidir (`decididos`), y lo añade al
 * historial. Después se vuelve a llamar a `turnoAgente` con el MISMO `system`
 * y las MISMAS `tools`.
 *
 * @param {Array} messages
 * @param {Array} resultados  bloques tool_result ya hechos (de `turnoAgente`)
 * @param {Array} decididos   [{ tool_use_id, ok, texto }] — is_error si !ok
 * @returns {Array} una copia del historial con el mensaje user añadido
 */
export function cierraPendientes(messages, resultados, decididos) {
  const bloques = [
    ...(resultados || []),
    ...(decididos || []).map(d => resultado(d.tool_use_id, d.texto, Boolean(d.ok))),
  ]
  return [...messages, { role: 'user', content: bloques }]
}
