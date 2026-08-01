// HELM — Comunidad: el único sitio del panel donde los perfiles se ven entre
// ellos.
//
// Todo lo demás en HELM está aislado por client_id: tu CRM, tus ventas y tu
// chat no los toca nadie. Esto es lo contrario a propósito — un hilo común
// donde la gente que está montando su negocio pregunta y se contesta. Cada
// mensaje va firmado con la marca del perfil (logo y nombre), que es lo que
// hace que se reconozcan.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Send, Trash2, Users, Loader2 } from 'lucide-react'
import { fetchCommunity, postCommunity, deleteCommunity, brandOf, MISSING_TABLE } from '../lib'
import { Empty } from '../ui'
import MigracionPendiente from '../MigracionPendiente'

const MAX = 4000
const REFRESCO_MS = 8000

// Hora corta para los mensajes de hoy, día y hora para los de antes: en un hilo
// que se lee de arriba abajo, la fecha completa en cada mensaje es ruido.
function cuando(iso) {
  const d = new Date(iso)
  const hoy = new Date()
  const mismoDia = d.toDateString() === hoy.toDateString()
  return d.toLocaleString('es-ES', mismoDia
    ? { hour: '2-digit', minute: '2-digit' }
    : { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function Avatar({ logo, name }) {
  if (logo) return <img className="helm-com-avatar" src={logo} alt="" />
  return <div className="helm-com-avatar ini">{(name || '?')[0].toUpperCase()}</div>
}

export default function Comunidad({ clientId, client }) {
  const [rows, setRows] = useState(null)
  const [fatal, setFatal] = useState(null)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)
  const endRef = useRef(null)
  const logRef = useRef(null)

  // Quién escribe. El superadmin entra como equipo de HELM; el resto, con la
  // marca de su perfil.
  const yo = useMemo(() => {
    const superadmin = localStorage.getItem('bw_superadmin')
    if (superadmin) {
      return { clientId: null, esAdmin: true, nombre: 'Equipo HELM', email: superadmin, marca: 'HELM', logo: '' }
    }
    let sesion = null
    try { sesion = JSON.parse(localStorage.getItem('bw_client') || 'null') } catch { /* sesión corrupta */ }
    const marca = brandOf(client)
    return {
      clientId,
      esAdmin: false,
      nombre: sesion?.name || sesion?.email || marca.name,
      email: sesion?.email || null,
      marca: marca.name,
      logo: marca.logo,
    }
  }, [clientId, client])

  const load = useCallback(async ({ silencioso = false } = {}) => {
    const { rows: r, error: e } = await fetchCommunity()
    if (e) { setFatal(e); if (!silencioso) setRows([]); return }
    setFatal(null)
    setRows(r)
  }, [])

  useEffect(() => { load() }, [load])

  // Refresco periódico: es un chat, y sin esto habría que recargar para ver lo
  // que escriben los demás. En segundo plano no se pide nada.
  useEffect(() => {
    const t = setInterval(() => { if (!document.hidden) load({ silencioso: true }) }, REFRESCO_MS)
    const onVisible = () => { if (!document.hidden) load({ silencioso: true }) }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVisible) }
  }, [load])

  // Al fondo solo si ya estabas al fondo: si estás leyendo hacia arriba, un
  // mensaje nuevo no debe arrancarte de donde estás.
  useEffect(() => {
    const el = logRef.current
    if (!el) return
    const cerca = el.scrollHeight - el.scrollTop - el.clientHeight < 220
    if (cerca) endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [rows])

  async function enviar(e) {
    e?.preventDefault()
    const body = input.trim()
    if (!body || sending) return
    setSending(true); setError(null)
    try {
      const guardado = await postCommunity({
        client_id: yo.clientId,
        author_name: yo.nombre,
        author_email: yo.email,
        brand_name: yo.marca,
        brand_logo: yo.logo || null,
        body: body.slice(0, MAX),
        is_admin: yo.esAdmin,
      })
      setInput('')
      setRows(rs => [...(rs || []), guardado])
      endRef.current?.scrollIntoView({ behavior: 'smooth' })
    } catch (err) {
      setError(err.message || 'No se pudo enviar el mensaje')
    }
    setSending(false)
  }

  async function borrar(m) {
    if (!confirm('¿Borrar tu mensaje de la comunidad?')) return
    setRows(rs => rs.filter(x => x.id !== m.id))
    try { await deleteCommunity(m.id) } catch (err) { setError(err.message); load() }
  }

  const puedeBorrar = (m) => yo.esAdmin || (Boolean(m.client_id) && m.client_id === clientId)

  if (fatal === MISSING_TABLE) return <MigracionPendiente seccion="Comunidad" archivo="migrations/helm_comunidad.sql" />
  if (fatal) return <div className="helm-formerror">{fatal}</div>

  return (
    <div className="helm-chat helm-com">
      <div className="helm-chat-main">
        <div className="helm-chat-bar">
          <div className="helm-chat-bar-info">
            <Users size={14} />
            Un solo hilo para todos los negocios de HELM. Lo que escribas aquí lo ve todo el mundo.
          </div>
        </div>

        <div className="helm-chat-log" ref={logRef}>
          {rows === null ? (
            <Empty>Cargando la comunidad…</Empty>
          ) : rows.length === 0 ? (
            <div className="helm-chat-intro">
              <Users size={22} />
              <h3>Aquí no hay nadie todavía</h3>
              <p>
                Sé el primero: preséntate, cuenta qué estás montando o pregunta lo que
                te tenga atascado. Al otro lado hay gente con el mismo problema.
              </p>
            </div>
          ) : rows.map(m => {
            const mio = Boolean(m.client_id) && m.client_id === clientId
            return (
              <div key={m.id} className={'helm-com-msg' + (mio ? ' mine' : '') + (m.is_admin ? ' admin' : '')}>
                <Avatar logo={m.brand_logo} name={m.brand_name || m.author_name} />
                <div className="helm-com-body">
                  <div className="helm-com-head">
                    <b>{m.brand_name || m.author_name}</b>
                    {m.brand_name && m.author_name && m.brand_name !== m.author_name && (
                      <span className="helm-com-who">{m.author_name}</span>
                    )}
                    {m.is_admin && <span className="helm-badge green">HELM</span>}
                    <small>{cuando(m.created_at)}</small>
                    {puedeBorrar(m) && (
                      <button className="helm-com-del" onClick={() => borrar(m)} aria-label="Borrar mensaje">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                  <div className="helm-com-text">
                    {String(m.body).split('\n').map((line, i) => <p key={i}>{line || ' '}</p>)}
                  </div>
                </div>
              </div>
            )
          })}
          <div ref={endRef} />
        </div>

        {error && <div className="helm-formerror helm-chat-error">{error}</div>}

        <form className="helm-chat-form" onSubmit={enviar}>
          <textarea
            className="helm-chat-input"
            rows={1}
            value={input}
            maxLength={MAX}
            placeholder="Escribe a la comunidad…  (Enter envía, Mayús+Enter salta de línea)"
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() } }}
          />
          <button type="submit" className="helm-btn primary" disabled={sending || !input.trim()}>
            {sending ? <Loader2 size={15} className="helm-spin" /> : <Send size={15} />}
          </button>
        </form>
      </div>
    </div>
  )
}
