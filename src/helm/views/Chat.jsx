// HELM — Chat con IA. Cada perfil tiene su conversación y su memoria propias.
// Los comandos (/help, /reel-guion, /reel-estudio, /conocimiento, /email,
// /memoria) los resuelve el backend en api/chat.js.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Send, Sparkles, Brain, Trash2, Loader2 } from 'lucide-react'
import { chatApi } from '../lib'
import { Empty } from '../ui'

const COMMANDS = [
  { cmd: '/reel-guion', args: '<tema o ángulo>', desc: 'Guion completo: hooks, ganas/pierdes, bullets, autoridad y CTA' },
  { cmd: '/reel-estudio', args: '<guion o transcripción>', desc: 'Estudia un reel ajeno y guarda su patrón' },
  { cmd: '/conocimiento', args: '<info>', desc: 'Guarda información en la memoria del perfil' },
  { cmd: '/email', args: '<tema>', desc: 'Email de marketing con UTMs' },
  { cmd: '/memoria', args: '', desc: 'Lista lo que la IA sabe de este perfil' },
  { cmd: '/help', args: '', desc: 'Todos los comandos' },
]

// Markdown mínimo: **negrita**, `código` y saltos de línea. Suficiente para
// lo que devuelve el modelo, sin meter una dependencia entera.
function renderRich(text) {
  const parts = String(text).split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) return <strong key={i}>{p.slice(2, -2)}</strong>
    if (p.startsWith('`') && p.endsWith('`')) return <code key={i} className="helm-chat-code">{p.slice(1, -1)}</code>
    return <span key={i}>{p}</span>
  })
}

function Message({ msg }) {
  const mine = msg.role === 'user'
  return (
    <div className={'helm-chat-msg' + (mine ? ' mine' : '')}>
      {!mine && <div className="helm-chat-avatar"><Sparkles size={13} /></div>}
      <div className="helm-chat-bubble">
        {msg.command && <div className="helm-chat-cmd">{msg.command}</div>}
        {String(msg.content).split('\n').map((line, i) => (
          <p key={i}>{line ? renderRich(line) : ' '}</p>
        ))}
      </div>
    </div>
  )
}

export default function Chat({ clientId }) {
  // messages === null → todavía cargando (mismo patrón que el resto de vistas)
  const [messages, setMessages] = useState(null)
  const [knowledge, setKnowledge] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)
  const [showMemory, setShowMemory] = useState(false)
  const endRef = useRef(null)
  const inputRef = useRef(null)

  // Autocompletado de comandos: se abre al escribir "/" al principio.
  const suggestions = useMemo(() => {
    const t = input.trimStart()
    if (!t.startsWith('/') || t.includes(' ')) return []
    return COMMANDS.filter(c => c.cmd.startsWith(t.toLowerCase()))
  }, [input])

  const load = () =>
    Promise.all([chatApi.history(clientId), chatApi.knowledge(clientId)])
      .then(([h, k]) => {
        setMessages(h.messages || [])
        setKnowledge(k.knowledge || [])
        setError(null)
      })
      .catch(err => {
        setMessages([])
        setError(err.message)
      })

  useEffect(() => { load() }, [clientId]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, sending])

  async function send(e) {
    e?.preventDefault()
    const text = input.trim()
    if (!text || sending) return
    setInput('')
    setSending(true)
    setError(null)
    // Optimista: el mensaje del usuario aparece ya.
    const optimistic = { id: `tmp-${Date.now()}`, role: 'user', content: text }
    setMessages(m => [...(m || []), optimistic])
    try {
      const res = await chatApi.send(clientId, text)
      setMessages(m => [...(m || []).filter(x => x.id !== optimistic.id), res.userMessage, res.message])
      if (/^\/(conocimiento|reel-estudio)/i.test(text)) {
        chatApi.knowledge(clientId).then(k => setKnowledge(k.knowledge || [])).catch(() => {})
      }
    } catch (err) {
      setMessages(m => (m || []).filter(x => x.id !== optimistic.id))
      setInput(text)
      setError(err.message)
    }
    setSending(false)
    inputRef.current?.focus()
  }

  async function clearChat() {
    if (!confirm('¿Vaciar la conversación de este perfil? La memoria guardada no se toca.')) return
    await chatApi.clearHistory(clientId)
    setMessages([])
  }

  async function forget(id) {
    if (!confirm('¿Borrar este bloque de la memoria?')) return
    await chatApi.forget(id)
    setKnowledge(k => k.filter(x => x.id !== id))
  }

  return (
    <div className="helm-chat">
      <div className="helm-chat-main">
        <div className="helm-chat-bar">
          <div className="helm-chat-bar-info">
            <Brain size={14} />
            {knowledge.length} bloques en memoria
          </div>
          <div className="helm-chat-bar-actions">
            <button className="helm-btn" onClick={() => setShowMemory(s => !s)}>
              {showMemory ? 'Ocultar memoria' : 'Ver memoria'}
            </button>
            {messages?.length > 0 && (
              <button className="helm-btn" onClick={clearChat}><Trash2 size={15} /> Vaciar</button>
            )}
          </div>
        </div>

        <div className="helm-chat-log">
          {messages === null ? (
            <Empty>Cargando conversación…</Empty>
          ) : messages.length === 0 ? (
            <div className="helm-chat-intro">
              <Sparkles size={22} />
              <h3>Tu copywriter, con la memoria de este perfil</h3>
              <p>
                Escribe <code>/help</code> para ver los comandos, o cuéntame de qué va el
                contenido y empezamos. Todo lo que guardes con <code>/conocimiento</code> lo
                usaré en cada guion.
              </p>
              <div className="helm-chat-chips">
                {COMMANDS.slice(0, 4).map(c => (
                  <button key={c.cmd} className="helm-chat-chip"
                    onClick={() => { setInput(c.cmd + ' '); inputRef.current?.focus() }}>
                    {c.cmd}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map(m => <Message key={m.id} msg={m} />)
          )}
          {sending && (
            <div className="helm-chat-msg">
              <div className="helm-chat-avatar"><Sparkles size={13} /></div>
              <div className="helm-chat-bubble typing">
                <Loader2 size={14} className="helm-spin" /> Escribiendo…
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {error && <div className="helm-formerror helm-chat-error">{error}</div>}

        <form className="helm-chat-form" onSubmit={send}>
          {suggestions.length > 0 && (
            <div className="helm-chat-suggest">
              {suggestions.map(c => (
                <button key={c.cmd} type="button" className="helm-chat-suggest-row"
                  onClick={() => { setInput(c.cmd + (c.args ? ' ' : '')); inputRef.current?.focus() }}>
                  <b>{c.cmd}</b>
                  {c.args && <span className="args">{c.args}</span>}
                  <span className="desc">{c.desc}</span>
                </button>
              ))}
            </div>
          )}
          <textarea
            ref={inputRef}
            className="helm-chat-input"
            rows={1}
            value={input}
            placeholder="Escribe un mensaje o / para ver los comandos…"
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
            }}
          />
          <button type="submit" className="helm-btn primary" disabled={sending || !input.trim()}>
            <Send size={15} />
          </button>
        </form>
      </div>

      {showMemory && (
        <aside className="helm-chat-memory">
          <div className="helm-chat-memory-head">Memoria de este perfil</div>
          {knowledge.length === 0 ? (
            <Empty>Vacía. Usa <code>/conocimiento</code>.</Empty>
          ) : (
            knowledge.map(k => (
              <div key={k.id} className="helm-chat-know">
                <div className="helm-chat-know-head">
                  <span className={'helm-chat-kind ' + k.kind}>{k.kind}</span>
                  <Trash2 size={13} className="helm-x" onClick={() => forget(k.id)} />
                </div>
                <b>{k.title || 'Sin título'}</b>
                <p>{k.content.slice(0, 220)}{k.content.length > 220 ? '…' : ''}</p>
              </div>
            ))
          )}
        </aside>
      )}
    </div>
  )
}
