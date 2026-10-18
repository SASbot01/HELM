// La oficina de un agente: lo que ves al entrar en él.
//
// Arriba, su estado de verdad —qué hace, qué está haciendo ahora, qué ha
// dejado hecho y qué le falta— para que ningún agente «se vea vacío». Debajo,
// dos cosas: abrir su panel entero y hablar con él. En el chat puedes darle
// indicaciones; si marcas «que lo recuerde», se le quedan para siempre.
//
// El estado se refresca solo cada 20 s, pero se para cuando la pestaña no se
// ve: no tiene sentido preguntar al servidor por una oficina que nadie mira.
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Loader2, MessageSquare, Send, Sparkles, Pin } from 'lucide-react'
import { oficinaApi } from '../helm/lib'

export default function Oficina({ clientId, agente, onVolver, onAbrir, volverLabel = 'Agentes' }) {
  const [estado, setEstado] = useState(null)
  const [error, setError] = useState('')
  const [chatAbierto, setChatAbierto] = useState(false)

  const cargar = useCallback(() => {
    oficinaApi.estado(clientId, agente.key)
      .then(r => { setEstado(r.estado); setError('') })
      .catch(e => setError(e.message))
  }, [clientId, agente.key])

  useEffect(() => {
    cargar()
    let t
    const tic = () => { if (!document.hidden) cargar() }
    const arranca = () => { clearInterval(t); t = setInterval(tic, 20_000) }
    arranca()
    document.addEventListener('visibilitychange', tic)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', tic) }
  }, [cargar])

  const entrable = agente.estado === 'activo' || agente.abrible

  return (
    <div className="ag embebido">
      <header className="ag-top dentro">
        <div>
          <button type="button" className="ag-volver" onClick={onVolver}>
            <ArrowLeft size={14} strokeWidth={2.2} /> {volverLabel}
          </button>
          <h1>{agente.nombre}</h1>
          <p>{agente.detalle || agente.resumen}</p>
        </div>
      </header>

      {error && <p className="ag-error">{error}</p>}

      <section className="of-estado">
        {!estado ? (
          <p className="ag-vacio"><Loader2 size={15} className="of-girando" /> Mirando qué tiene entre manos…</p>
        ) : (
          <div className="of-bloques">
            <Bloque titulo="Ahora mismo" vacio="No tiene nada entre manos ahora mismo." items={estado.haciendo} tono="vivo" />
            <Bloque titulo="Último hecho" vacio="Todavía no ha dejado nada hecho." items={estado.ultimos} tono="ok" />
            <BloqueFalta falta={estado.falta} onAbrir={entrable ? () => onAbrir(agente.key) : null} />
          </div>
        )}
      </section>

      <div className="of-acciones">
        {entrable && (
          <button type="button" className="ag-btn primario" onClick={() => onAbrir(agente.key)}>
            Abrir {agente.nombre} <ArrowRight size={15} strokeWidth={2.2} />
          </button>
        )}
        <button type="button" className={`ag-btn${chatAbierto ? ' on' : ''}`} onClick={() => setChatAbierto(v => !v)}>
          <MessageSquare size={15} /> Hablar con el agente
        </button>
      </div>

      {chatAbierto && <Chat clientId={clientId} agente={agente} onCambio={cargar} />}
    </div>
  )
}

function Bloque({ titulo, items, vacio, tono }) {
  const hay = items && items.length
  return (
    <div className={`of-bloque ${tono}`}>
      <h3>{titulo}</h3>
      {hay ? <ul>{items.map((t, i) => <li key={i}>{t}</li>)}</ul> : <p className="of-vacio-bloque">{vacio}</p>}
    </div>
  )
}

function BloqueFalta({ falta, onAbrir }) {
  const hay = falta && falta.length
  return (
    <div className="of-bloque falta">
      <h3>Pendiente</h3>
      {hay ? (
        <ul>
          {falta.map((f, i) => (
            <li key={i}>
              {f.texto}
              {f.cta && onAbrir && (
                <button type="button" className="ag-btn sm" onClick={onAbrir}>
                  {f.cta === 'conectar' ? 'Conectar' : 'Abrir'}
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : <p className="of-vacio-bloque">Nada pendiente. Al día.</p>}
    </div>
  )
}

function Chat({ clientId, agente, onCambio }) {
  const [mensajes, setMensajes] = useState(null)
  const [texto, setTexto] = useState('')
  const [recordar, setRecordar] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const finRef = useRef(null)

  useEffect(() => {
    oficinaApi.historial(clientId, agente.key).then(r => setMensajes(r.mensajes)).catch(e => setError(e.message))
  }, [clientId, agente.key])

  useEffect(() => { finRef.current?.scrollIntoView({ block: 'nearest' }) }, [mensajes, enviando])

  async function enviar(e) {
    e.preventDefault()
    const t = texto.trim()
    if (!t || enviando) return
    setEnviando(true); setError('')
    // Pinta ya tu mensaje; la respuesta llega del servidor.
    setMensajes(m => [...(m || []), { id: `tmp-${Date.now()}`, rol: 'tu', texto: t }])
    setTexto('')
    try {
      const r = await oficinaApi.hablar(clientId, agente.key, t, recordar)
      setMensajes(m => {
        const sinTmp = (m || []).filter(x => !String(x.id).startsWith('tmp-'))
        return [...sinTmp, r.tuyo, r.suyo]
      })
      if (recordar) { setRecordar(false); onCambio?.() }
    } catch (err) {
      setError(err.message)
      setMensajes(m => (m || []).filter(x => !String(x.id).startsWith('tmp-')))
      setTexto(t)
    }
    setEnviando(false)
  }

  return (
    <section className="of-chat">
      <div className="of-hilo">
        {mensajes === null ? (
          <p className="ag-vacio"><Loader2 size={14} className="of-girando" /> Abriendo el hilo…</p>
        ) : mensajes.length === 0 ? (
          <p className="of-chat-intro">
            <Sparkles size={15} /> Pregúntale qué está haciendo, pídele algo o dale una indicación. Con «que lo recuerde» se la queda para siempre.
          </p>
        ) : (
          mensajes.map(m => (
            <div key={m.id} className={`of-msg ${m.rol}`}>
              <span className="of-msg-quien">{m.rol === 'tu' ? 'Tú' : agente.nombre}</span>
              <p>{m.texto}</p>
            </div>
          ))
        )}
        {enviando && <div className="of-msg agente pensando"><Loader2 size={14} className="of-girando" /> Pensando…</div>}
        <div ref={finRef} />
      </div>

      {error && <p className="ag-error">{error}</p>}

      <form className="of-escribir" onSubmit={enviar}>
        <textarea
          value={texto}
          onChange={e => setTexto(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) enviar(e) }}
          placeholder={`Escríbele a ${agente.nombre}…`}
          rows={2}
          disabled={enviando}
        />
        <div className="of-escribir-pie">
          <label className={`of-recordar${recordar ? ' on' : ''}`}>
            <input type="checkbox" checked={recordar} onChange={e => setRecordar(e.target.checked)} disabled={enviando} />
            <Pin size={13} /> Que lo recuerde siempre
          </label>
          <button type="submit" className="ag-btn primario sm" disabled={enviando || !texto.trim()}>
            <Send size={14} /> Enviar
          </button>
        </div>
      </form>
    </section>
  )
}
