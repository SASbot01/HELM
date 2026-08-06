// HELM — Copiloto Fiscal. La respuesta seria a "Sage Copilot": no es el
// copywriter de infoproducto con otro nombre, es un rol distinto que conoce
// los plazos y clientes reales de este despacho (ver FISCAL_ROLE en
// api/chat.js). Sin comandos de contenido: aquí solo se habla.
import { useEffect, useRef, useState } from 'react'
import { Send, ShieldCheck, Loader2 } from 'lucide-react'
import { chatApi } from '../lib'
import { Empty } from '../ui'

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
      {!mine && <div className="helm-chat-avatar"><ShieldCheck size={13} /></div>}
      <div className="helm-chat-bubble">
        {String(msg.content).split('\n').map((line, i) => (
          <p key={i}>{line ? renderRich(line) : ' '}</p>
        ))}
      </div>
    </div>
  )
}

const SUGERENCIAS = [
  '¿Qué plazos tengo esta semana?',
  '¿Cómo va el trimestre de presentaciones?',
  'Redáctame un aviso para un cliente con el 303 pendiente',
]

export default function Copiloto({ clientId }) {
  const [messages, setMessages] = useState(null)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)
  const endRef = useRef(null)
  const inputRef = useRef(null)

  const load = () => chatApi.history(clientId)
    .then(h => { setMessages(h.messages || []); setError(null) })
    .catch(err => { setMessages([]); setError(err.message) })

  useEffect(() => { load() }, [clientId]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, sending])

  async function send(e, textoDirecto) {
    e?.preventDefault()
    const text = (textoDirecto ?? input).trim()
    if (!text || sending) return
    setInput('')
    setSending(true)
    setError(null)
    const optimistic = { id: `tmp-${Date.now()}`, role: 'user', content: text }
    setMessages(m => [...(m || []), optimistic])
    try {
      const res = await chatApi.send(clientId, text)
      setMessages(m => [...(m || []).filter(x => x.id !== optimistic.id), res.userMessage, res.message])
    } catch (err) {
      setMessages(m => (m || []).filter(x => x.id !== optimistic.id))
      setInput(text)
      setError(err.message)
    }
    setSending(false)
    inputRef.current?.focus()
  }

  return (
    <div className="helm-chat">
      <div className="helm-chat-main">
        <div className="helm-chat-log">
          {messages === null ? (
            <Empty>Cargando conversación…</Empty>
          ) : messages.length === 0 ? (
            <div className="helm-chat-intro">
              <ShieldCheck size={22} />
              <h3>Tu copiloto fiscal</h3>
              <p>
                Conoce los plazos y clientes que ya tienes en Fiscal. Pregúntale por vencimientos,
                por cómo va el trimestre, o pídele que te redacte un aviso — el borrador siempre lo
                revisas tú antes de mandarlo.
              </p>
              <div className="helm-chat-chips">
                {SUGERENCIAS.map(s => (
                  <button key={s} className="helm-chat-chip" onClick={() => send(null, s)}>{s}</button>
                ))}
              </div>
            </div>
          ) : (
            messages.map(m => <Message key={m.id} msg={m} />)
          )}
          {sending && (
            <div className="helm-chat-msg">
              <div className="helm-chat-avatar"><ShieldCheck size={13} /></div>
              <div className="helm-chat-bubble typing">
                <Loader2 size={14} className="helm-spin" /> Escribiendo…
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {error && <div className="helm-formerror helm-chat-error">{error}</div>}

        <form className="helm-chat-form" onSubmit={send}>
          <textarea
            ref={inputRef}
            className="helm-chat-input"
            rows={1}
            value={input}
            placeholder="Pregunta por un plazo, un cliente o pide un aviso…"
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
    </div>
  )
}
