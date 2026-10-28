// Agent OS — la bandeja: lo que proponen los agentes de departamento y espera
// tu aprobación (api/propuestas.js). Cada propuesta dice qué ha visto el
// agente y por qué, qué se hará al aprobarla y, si hay que escribir a un
// cliente, el mensaje ya redactado con su botón de WhatsApp (lo mandas tú).
// Aprobar y rechazar solo lo ve quien administra la agencia; el resto, la lee.
// Al aprobar solo se manda el id y el sí: lo que se hace es lo que se guardó.
// Todo lo que viene de la propuesta es texto (React lo escapa) y el enlace,
// solo si es de WhatsApp.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, X, Copy, MessageCircle, Inbox, RefreshCw, ChevronDown } from 'lucide-react'
import { propuestasApi } from '../helm/lib'
import { AGENTES } from './agentes'
import './bandeja.css'

// Los archivos de api/_lib/departamentos que no se llaman como su casilla.
const ALIAS = { 'guionista-ventas': 'guionista' }
const nombreAgente = (k) => AGENTES.find(a => a.key === (ALIAS[k] || k))?.nombre || k
const fecha = (iso) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}
const ESTADO = { aplicada: 'Hecha', rechazada: 'Rechazada', caducada: 'Caducada', fallida: 'No se pudo', aprobada: 'Aplicándose' }
// Como esEnlaceWhatsapp de api/_lib/propuestas.js: ni javascript: ni otra web.
const esWhatsapp = (url) => typeof url === 'string' && /^https:\/\/wa\.me\/[1-9]\d{7,14}(\?text=[A-Za-z0-9\-_.!~*'()%]*)?$/.test(url)

async function copia(texto) {
  try {
    if (!navigator.clipboard?.writeText) return false
    await navigator.clipboard.writeText(texto)
    return true
  } catch {
    return false
  }
}

function Propuesta({ p, puedeDecidir, onDecidir, ocupada }) {
  const [copiado, setCopiado] = useState(null)
  const reloj = useRef(null)
  useEffect(() => () => clearTimeout(reloj.current), [])
  async function copiar() {
    setCopiado(await copia(p.mensaje) ? 'si' : 'no')
    clearTimeout(reloj.current)
    reloj.current = setTimeout(() => setCopiado(null), 1800)
  }
  const conHerramienta = Boolean(p.herramienta || p.resumen)
  return (
    <li className="bj-prop">
      <header>
        <span className="bj-agente">{nombreAgente(p.agente)}</span>
        <time dateTime={p.creada_en}>{fecha(p.creada_en)}</time>
      </header>
      <h4>{p.titulo}</h4>
      {p.porque && <p className="bj-porque">{p.porque}</p>}
      {p.resumen && <p className="bj-hara"><b>Al aprobar:</b> {p.resumen}</p>}
      {p.mensaje && (
        <div className="bj-mensaje">
          <p>{p.mensaje}</p>
          <div className="bj-mensaje-btns">
            <button type="button" className="ag-btn sm" onClick={copiar}>
              {copiado === 'si' ? <><Check size={13} /> Copiado</> : copiado === 'no' ? <><Copy size={13} /> No se ha podido copiar</> : <><Copy size={13} /> Copiar</>}
            </button>
            {esWhatsapp(p.enlace) && (
              <a className="ag-btn sm" href={p.enlace} target="_blank" rel="noopener noreferrer"><MessageCircle size={13} /> Abrir WhatsApp</a>
            )}
          </div>
        </div>
      )}
      {puedeDecidir && (
        <footer>
          <button type="button" className="ag-btn primario sm" disabled={ocupada} onClick={() => onDecidir(p, true)}>
            <Check size={13} /> {conHerramienta ? 'Aprobar' : 'Hecho'}
          </button>
          <button type="button" className="ag-btn sm" disabled={ocupada} onClick={() => onDecidir(p, false)}>
            <X size={13} /> Rechazar
          </button>
        </footer>
      )}
    </li>
  )
}

export default function Bandeja({ clientId }) {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [sinPermiso, setSinPermiso] = useState(false)
  const [aviso, setAviso] = useState('')
  const [ocupadas, setOcupadas] = useState(() => new Set())
  const [verDecididas, setVerDecididas] = useState(false)
  const [lanzando, setLanzando] = useState(false)

  const cargar = useCallback(async () => {
    try {
      setDatos(await propuestasApi.lista(clientId))
      setError('')
      setSinPermiso(false)
    } catch (e) {
      // Quien no puede usar los agentes de este perfil no ve la bandeja.
      if (e?.status === 403) setSinPermiso(true)
      else setError(e?.message || 'No se ha podido cargar la bandeja.')
    }
  }, [clientId])
  useEffect(() => { cargar() }, [cargar])

  async function decidir(p, aprobar) {
    if (ocupadas.has(p.id)) return
    setOcupadas(s => new Set(s).add(p.id))
    setAviso('')
    try {
      const r = await propuestasApi.decidir(clientId, p.id, aprobar)
      setAviso(r?.texto || (aprobar ? 'Hecho.' : 'Rechazada.'))
    } catch (e) {
      setAviso(e?.message || 'No se ha podido hacer.')
    } finally {
      setOcupadas(s => { const n = new Set(s); n.delete(p.id); return n })
      cargar()
    }
  }

  async function pasarAhora() {
    setLanzando(true)
    try {
      const r = await propuestasApi.correr(clientId)
      setAviso(r?.encolado === false && r?.texto
        ? r.texto
        : 'Los agentes están mirando el perfil. En unos minutos aparece aquí lo que encuentren.')
    } catch (e) {
      setAviso(e?.message || 'No se ha podido lanzar.')
    } finally {
      setLanzando(false)
    }
  }

  if (sinPermiso) return null
  if (error && !datos) {
    return (
      <section className="bj">
        <p className="ag-error">{error}</p>
        <button type="button" className="ag-btn sm" onClick={cargar}><RefreshCw size={13} /> Reintentar</button>
      </section>
    )
  }
  if (!datos) return null
  const pendientes = Array.isArray(datos.pendientes) ? datos.pendientes : []
  const decididas = Array.isArray(datos.decididas) ? datos.decididas : []
  const puedeDecidir = datos.puedeDecidir === true

  return (
    <section className="bj" aria-label="Bandeja de los agentes">
      <div className="bj-cab">
        <h2 className="ag-seccion"><Inbox size={17} /> Pendiente de tu aprobación {pendientes.length > 0 && <span className="bj-n">{pendientes.length}</span>}</h2>
        {puedeDecidir && (
          <button type="button" className="ag-btn sm" onClick={pasarAhora} disabled={lanzando}><RefreshCw size={13} /> Pasar los agentes ahora</button>
        )}
      </div>
      {aviso && <p className="bj-aviso" role="status">{aviso}</p>}
      {pendientes.length === 0
        ? <p className="ag-vacio bj-vacio">No hay nada esperando. Los agentes miran el negocio cada mañana y lo que haya que hacer con un cliente o con dinero aparece aquí y en tu Telegram para que lo apruebes.</p>
        : <ul className="bj-lista">{pendientes.map(p => <Propuesta key={p.id} p={p} puedeDecidir={puedeDecidir} onDecidir={decidir} ocupada={ocupadas.has(p.id)} />)}</ul>}
      {decididas.length > 0 && (
        <div className="bj-hechas">
          <button type="button" className="bj-ver" onClick={() => setVerDecididas(v => !v)} aria-expanded={verDecididas}>
            <ChevronDown size={14} className={verDecididas ? 'abierto' : ''} /> Lo último que se ha decidido ({decididas.length})
          </button>
          {verDecididas && (
            <ul>
              {decididas.map(p => (
                <li key={p.id}>
                  <span className={`bj-estado ${ESTADO[p.estado] ? p.estado : ''}`}>{ESTADO[p.estado] || p.estado}</span>
                  <span className="bj-hecha-txt"><b>{nombreAgente(p.agente)}:</b> {p.titulo}{p.resultado ? ` — ${p.resultado}` : ''}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {puedeDecidir && <AjustesAgentes clientId={clientId} />}
    </section>
  )
}

// Encender o apagar cada agente en este perfil y si lo interno (tareas para tu
// equipo) lo hace solo o te lo propone. Solo quien administra la agencia.
const AUTONOMIA = { proponer: 'Te lo propone todo', interno: 'Lo interno lo hace solo' }
function AjustesAgentes({ clientId }) {
  const [abierto, setAbierto] = useState(false)
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const cargar = useCallback(async () => {
    try { setDatos(await propuestasApi.ajustes(clientId)); setError('') } catch (e) { setError(e?.message || 'No se han podido cargar los ajustes.') }
  }, [clientId])
  async function cambia(agente, cambios) {
    try { await propuestasApi.ajuste(clientId, agente, cambios); await cargar() } catch (e) { setError(e?.message || 'No se ha podido guardar.') }
  }
  const de = new Map((datos?.ajustes || []).map(a => [a.agente, a]))
  return (
    <div className="bj-hechas bj-ajustes">
      <button type="button" className="bj-ver" aria-expanded={abierto}
        onClick={() => { const abrir = !abierto; setAbierto(abrir); if (abrir && !datos) cargar() }}>
        <ChevronDown size={14} className={abierto ? 'abierto' : ''} /> Encender o apagar agentes
      </button>
      {abierto && error && <p className="ag-error">{error}</p>}
      {abierto && datos && (
        <ul>
          {(datos.agentes || []).map(k => {
            const a = de.get(k) || { activo: true, autonomia: 'proponer' }
            return (
              <li key={k} className="bj-ajuste">
                <label className="bj-ajuste-on">
                  <input type="checkbox" checked={a.activo !== false} onChange={e => cambia(k, { activo: e.target.checked })} />
                  <span>{nombreAgente(k)}</span>
                </label>
                <select aria-label={`Qué hace solo ${nombreAgente(k)}`} value={a.autonomia || 'proponer'} disabled={a.activo === false}
                  onChange={e => cambia(k, { autonomia: e.target.value })}>
                  {Object.entries(AUTONOMIA).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                </select>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
