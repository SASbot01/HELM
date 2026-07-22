// HELM — chat con IA por perfil.
//
// Cada perfil (client_id) tiene su propia conversación y su propia memoria:
//   · helm_chat_messages → historial que se le manda al modelo
//   · helm_knowledge     → memoria permanente que se inyecta en el system prompt
//
// El método de guiones (universal) vive en api/_lib/copy-knowledge.js.
// Lo específico de cada cuenta se añade con /conocimiento y /reel-estudio.
//
// Acciones:
//   POST ?action=send        { clientId, message }   → responde y persiste
//   GET  ?action=history     &clientId=              → historial
//   GET  ?action=knowledge   &clientId=              → memoria
//   DELETE ?action=knowledge &id=                    → borra un bloque
//   DELETE ?action=history   &clientId=              → vacía la conversación
import { supabase } from './lib/supabase.js'
import { applyCors, rateLimit, getClientIp, validateAuth } from './_lib/auth.js'
import { requireProfileAccess } from './_lib/access.js'
import { COPY_KNOWLEDGE } from './_lib/copy-knowledge.js'
import { llmChat, llmHealth, llmInfo } from './_lib/llm.js'

const MAX_TOKENS = 2048
const HISTORY_TURNS = 12        // mensajes de contexto que se reenvían al modelo

// ── Comandos ───────────────────────────────────────────────────────────────
export const COMMANDS = [
  { cmd: '/help', args: '', desc: 'Muestra todos los comandos disponibles.' },
  { cmd: '/reel-guion', args: '<tema o ángulo>', desc: 'Escribe el guion: hook, bullets y CTA, con la estructura completa.' },
  { cmd: '/reel-estudio', args: '<guion o transcripción>', desc: 'Estudia un reel ajeno: extrae su patrón y lo guarda en la memoria del perfil.' },
  { cmd: '/conocimiento', args: '<info>', desc: 'Guarda información en la memoria permanente de este perfil.' },
  { cmd: '/email', args: '<tema>', desc: 'Escribe un email de marketing con asunto, cuerpo, P.D. y enlaces con UTM.' },
  { cmd: '/memoria', args: '', desc: 'Lista lo que la IA tiene guardado sobre este perfil.' },
]

const HELP_TEXT = [
  'Estos son los comandos que entiendo:',
  '',
  ...COMMANDS.map(c => `**${c.cmd}** ${c.args ? `\`${c.args}\`` : ''}\n${c.desc}`),
  '',
  'Sin comando, es una conversación normal: pregúntame lo que quieras sobre contenido, guiones o copy.',
].join('\n')

// ── System prompt ──────────────────────────────────────────────────────────
const BASE_ROLE = `Eres el copywriter de cabecera de este perfil de negocio dentro de HELM.
Escribes guiones para redes (reels, carousels, YouTube), hooks, bullet points y
email marketing. Hablas español de España, directo y sin florituras.

Trabajas SIEMPRE con el método de abajo. No es una sugerencia: es cómo se hace
aquí. Y usas la memoria del perfil (más abajo) para que todo suene a esta cuenta
concreta y no a un guion genérico de internet.

Tres cosas que no se negocian:
· Tocar la emoción del espectador. Sin emoción no sirve de nada.
· Nada de saludos ni preámbulos: se arranca hablando.
· Un solo CTA, concreto.

Si te falta contexto del negocio para escribir bien, dilo y pide justo el dato
que necesitas — no te lo inventes.`

const TASKS = {
  guion: `TAREA: escribe el guion que te piden.

Entrega en este orden y con estos títulos:

**HOOK** — 3 opciones distintas, cada una de una familia diferente. Una línea cada una.
**GANAS / PIERDES** — una frase que deje en evidencia qué gana el que escucha y qué pierde el que no.
**DESARROLLO** — 3 bullets, uno por idea, de menor a mayor impacto. Cada uno con su capa: dato, emoción u opinión.
**TRIPLE AUTORIDAD** — persona reconocida + entidad o estudio + el ángulo de experiencia propia que debería contar.
**CIERRE / CTA** — una sola acción.

Recuerda: puntos clave y ángulos, no un guion cerrado palabra por palabra — él
escribe su propio script encima de esto.`,

  estudio: `TAREA: estudia el reel/guion que te acaban de pasar y extrae su patrón para
poder replicarlo. Analiza, no resumas.

Entrega:
**TIPO DE HOOK** — a qué familia pertenece y por qué funciona (o por qué no).
**ESTRUCTURA** — cómo está montado: dónde acaba la intro, cómo encadena, dónde reabre el bucle.
**CAPAS** — cuáles de las tres (dato / emoción / opinión) usa y cuál le falta.
**QUÉ ROBAR** — el mecanismo concreto que se puede reutilizar, explicado como plantilla rellenable.
**CÓMO APLICARLO A ESTA CUENTA** — un ejemplo ya adaptado al perfil.

Sé concreto y breve. Esto se guarda en memoria para usarlo después.`,

  email: `TAREA: escribe el email de marketing que te piden.

Entrega:
**ASUNTO** — 3 opciones, 4-8 palabras cada una.
**PREHEADER** — continúa el asunto, no lo repite.
**CUERPO** — entra directo a la escena o al conflicto, un solo objetivo.
**P.D.** — con la promesa resumida.

Todos los enlaces llevan UTMs con el formato del método. Marca cada enlace como
[TEXTO DEL ENLACE](URL?utm_source=email&utm_medium=...&utm_campaign=...&utm_content=...)
y usa slugs en minúscula con guiones. Si no te han dado la URL de destino,
escribe {{url}} como marcador pero deja los UTMs ya montados.`,
}

function buildSystem({ clientName, knowledge }) {
  const memoria = knowledge.length
    ? knowledge.map(k => `### ${k.title || k.kind}\n${k.content}`).join('\n\n')
    : '(Todavía no hay nada guardado de este perfil. Si necesitas contexto, pídelo.)'

  return [
    BASE_ROLE,
    `# PERFIL ACTIVO\n${clientName}`,
    `# MÉTODO\n${COPY_KNOWLEDGE}`,
    `# MEMORIA DE ESTE PERFIL\nEsto es lo que sabes de esta cuenta. Tiene prioridad sobre cualquier suposición tuya.\n\n${memoria}`,
  ].join('\n\n---\n\n')
}

// ── Helpers de datos ───────────────────────────────────────────────────────
async function getKnowledge(clientId) {
  const { data } = await supabase
    .from('helm_knowledge').select('id, kind, title, content, created_at')
    .eq('client_id', clientId).order('created_at', { ascending: true }).limit(200)
  return data || []
}

async function getHistory(clientId, limit = HISTORY_TURNS) {
  const { data } = await supabase
    .from('helm_chat_messages').select('id, role, content, command, created_at')
    .eq('client_id', clientId).order('created_at', { ascending: false }).limit(limit)
  return (data || []).reverse()
}

async function saveMessage(clientId, role, content, command = null) {
  const { data } = await supabase
    .from('helm_chat_messages').insert({ client_id: clientId, role, content, command })
    .select('id, role, content, command, created_at').single()
  return data
}

function parseCommand(text) {
  const m = String(text || '').trim().match(/^(\/[a-z-]+)\s*([\s\S]*)$/i)
  if (!m) return { command: null, body: String(text || '').trim() }
  const command = m[1].toLowerCase()
  if (!COMMANDS.some(c => c.cmd === command)) return { command: null, body: String(text || '').trim() }
  return { command, body: m[2].trim() }
}

function titleFrom(text) {
  const first = String(text).split('\n').find(l => l.trim()) || 'Sin título'
  return first.trim().slice(0, 80)
}

// Llama al modelo LOCAL (Ollama en este servidor) y devuelve el texto.
function ask({ system, messages }) {
  return llmChat({ system, messages, maxTokens: MAX_TOKENS, temperature: 0.75 })
}

// ── Handler ────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  applyCors(req, res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  const action = req.query.action
  const ip = getClientIp(req)

  // Sesión válida y con permiso sobre el perfil que se pide. `health` y
  // `commands` no tocan datos de nadie, así que solo exigen estar logueado.
  const reqClientId = req.query.clientId || req.body?.clientId || null
  const isPublicAction = action === 'health' || action === 'commands'
  try {
    if (isPublicAction) await validateAuth(req, { required: true })
    else await requireProfileAccess(req, reqClientId)
  } catch (err) {
    return res.status(err.statusCode || 401).json({ error: err.message })
  }

  // GET ?action=history|knowledge
  if (req.method === 'GET') {
    if (action === 'health') return res.status(200).json({ ...(await llmHealth()), ...llmInfo })
    if (action === 'commands') return res.status(200).json({ commands: COMMANDS })
    const clientId = req.query.clientId
    if (!clientId) return res.status(400).json({ error: 'clientId requerido' })
    if (action === 'history') return res.status(200).json({ messages: await getHistory(clientId, 200) })
    if (action === 'knowledge') return res.status(200).json({ knowledge: await getKnowledge(clientId) })
    return res.status(400).json({ error: 'Acción no soportada' })
  }

  // DELETE ?action=history|knowledge
  if (req.method === 'DELETE') {
    if (action === 'knowledge') {
      const id = req.query.id || req.body?.id
      if (!id || !reqClientId) return res.status(400).json({ error: 'id y clientId requeridos' })
      const { error } = await supabase.from('helm_knowledge')
        .delete().eq('id', id).eq('client_id', reqClientId)
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ success: true })
    }
    if (action === 'history') {
      const clientId = req.query.clientId || req.body?.clientId
      if (!clientId) return res.status(400).json({ error: 'clientId requerido' })
      const { error } = await supabase.from('helm_chat_messages').delete().eq('client_id', clientId)
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ success: true })
    }
    return res.status(400).json({ error: 'Acción no soportada' })
  }

  // POST ?action=send
  if (req.method === 'POST' && action === 'send') {
    const gate = rateLimit({ key: `chat:${ip}`, max: 30, windowMs: 60_000 })
    if (!gate.ok) {
      res.setHeader('Retry-After', String(gate.retryAfter))
      return res.status(429).json({ error: 'Demasiadas peticiones seguidas.', retryAfter: gate.retryAfter })
    }

    const { clientId, message } = req.body || {}
    if (!clientId || !message?.trim()) {
      return res.status(400).json({ error: 'clientId y message son obligatorios' })
    }

    const { data: client } = await supabase
      .from('clients').select('id, name').eq('id', clientId).maybeSingle()
    if (!client) return res.status(404).json({ error: 'Perfil no encontrado' })

    const { command, body } = parseCommand(message)

    // Comandos que se resuelven sin llamar al modelo.
    if (command === '/help') {
      const userMsg = await saveMessage(clientId, 'user', message, command)
      const botMsg = await saveMessage(clientId, 'assistant', HELP_TEXT, command)
      return res.status(200).json({ userMessage: userMsg, message: botMsg })
    }

    if (command === '/memoria') {
      const k = await getKnowledge(clientId)
      const text = k.length
        ? [`Tengo ${k.length} bloques guardados de **${client.name}**:`, '',
           ...k.map(x => `· **${x.title || 'Sin título'}** — ${x.kind}`)].join('\n')
        : 'Todavía no tengo nada guardado de este perfil. Usa `/conocimiento` para empezar.'
      const userMsg = await saveMessage(clientId, 'user', message, command)
      const botMsg = await saveMessage(clientId, 'assistant', text, command)
      return res.status(200).json({ userMessage: userMsg, message: botMsg })
    }

    if (command === '/conocimiento') {
      if (!body) return res.status(400).json({ error: 'Escribe la información después de /conocimiento' })
      const { error } = await supabase.from('helm_knowledge').insert({
        client_id: clientId, kind: 'nota', title: titleFrom(body), content: body, source: 'chat',
      })
      if (error) return res.status(500).json({ error: error.message })
      const userMsg = await saveMessage(clientId, 'user', message, command)
      const botMsg = await saveMessage(
        clientId, 'assistant',
        `Guardado en la memoria de **${client.name}**. Lo tendré en cuenta a partir de ahora.`,
        command,
      )
      return res.status(200).json({ userMessage: userMsg, message: botMsg })
    }

    // Comandos que sí llaman al modelo.
    const knowledge = await getKnowledge(clientId)
    const history = await getHistory(clientId)

    const task = command === '/reel-guion' ? TASKS.guion
      : command === '/reel-estudio' ? TASKS.estudio
      : command === '/email' ? TASKS.email
      : null

    // Los comandos estructurados van SIN historial y con la tarea pegada al
    // turno del usuario. Con un modelo de 14B el historial pesa más que las
    // instrucciones del system: si la respuesta anterior fue un guion, te
    // devuelve un guion aunque le pidas un email. Sin historial no hay dudas.
    const system = buildSystem({ clientName: client.name, knowledge, task })
    const messages = task
      ? [{ role: 'user', content: `${task}\n\n---\n\nPETICIÓN: ${body || message}` }]
      : [
          ...history.map(m => ({ role: m.role, content: m.content })),
          { role: 'user', content: message },
        ]

    let answer
    try {
      answer = await ask({ system, messages })
    } catch (err) {
      return res.status(err.statusCode || 502).json({ error: err.message || 'Error llamando al modelo' })
    }

    const userMsg = await saveMessage(clientId, 'user', message, command)
    const botMsg = await saveMessage(clientId, 'assistant', answer, command)

    // /reel-estudio guarda tanto el material bruto como el análisis.
    if (command === '/reel-estudio' && body) {
      await supabase.from('helm_knowledge').insert([
        { client_id: clientId, kind: 'reel', title: `Reel estudiado — ${titleFrom(body)}`, content: body, source: 'chat' },
        { client_id: clientId, kind: 'analisis', title: `Patrón — ${titleFrom(body)}`, content: answer, source: 'chat' },
      ])
    }

    return res.status(200).json({ userMessage: userMsg, message: botMsg })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
