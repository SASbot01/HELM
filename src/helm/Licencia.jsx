// HELM — la licencia de la agencia (97 €/año) y su clave de Claude.
//
// Desde el 7-nov-2026 una agencia paga una licencia anual y ya está: HELM no
// vende créditos ni cobra por el uso de la IA. La IA la pone la agencia: su
// propia clave de Claude (aquí, en Ajustes de la agencia) o su cuenta de
// Claude con el conector. Ver api/licencia.js.
//
//   · PuertaLicencia: va en HelmApp, encima de todo. Sin licencia válida tapa
//     el panel: quien administra la agencia ve el pago (la «bienvenida» de una
//     agencia nueva, o la renovación); el resto del equipo, a quién avisar. Se
//     abre al entrar y cada vez que el servidor contesta 402 (lib.js →
//     «helm:sin-licencia»). Al volver de pagar, la celebra y ofrece poner ya la
//     clave de Claude.
//   · AjustesAgencia: el modal del tablero de Perfiles (botón «Agencia») con la
//     licencia, la clave de Claude y el conector de Claude de la agencia.
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowRight, Check, Copy, KeyRound, LogOut, ShieldCheck, Trash2 } from 'lucide-react'
import { licenciaApi } from './lib'
import { Modal, Field, Input, Select, FormNote } from './ui'
import './licencia.css'

const fecha = (d) => (d ? new Date(d).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : '—')
const fechaCorta = (d) => (d ? new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')
const euros = (n) => `${Number(n || 0).toLocaleString('es-ES', { maximumFractionDigits: 2 })} €`

/** Lo que trae la licencia, para la pantalla de pago. */
const INCLUYE = [
  'Un perfil para cada cliente: CRM, contenido, métricas, formularios…',
  'Los agentes de HELM trabajando para cada perfil (equipo, estudio de contenido, editor de reels, portadas…).',
  'El conector de Claude y el bot de Telegram para toda la agencia.',
  'La IA la pones tú: tu clave de Claude o tu cuenta de Claude con el conector. HELM no cobra por uso.',
]

// Lee y limpia la vuelta de Stripe (?licencia=ok&session_id=…): una sola vez,
// aunque el efecto corra dos veces (React en desarrollo).
let vueltaLeida = false
function vueltaDeStripe() {
  if (vueltaLeida || typeof window === 'undefined') return null
  const p = new URLSearchParams(window.location.search)
  const licencia = p.get('licencia')
  if (!licencia) return null
  vueltaLeida = true
  window.history.replaceState(null, '', window.location.pathname)
  return { ok: licencia === 'ok', sessionId: p.get('session_id') }
}

async function irAPagar(setPagando, setError) {
  setError(null); setPagando(true)
  try { window.location.assign((await licenciaApi.pagar()).url) }
  catch (e) { setError(e.message); setPagando(false) }
}

// ── La puerta ───────────────────────────────────────────────────────────────
export function PuertaLicencia({ onSalir }) {
  const [estado, setEstado] = useState(null)   // lo de licenciaApi.estado
  const [fase, setFase] = useState(null)       // null (abierta) | 'pagar' | 'pagada'
  const [venceAt, setVenceAt] = useState(null) // tras pagar
  const [aviso, setAviso] = useState(null)     // un fallo al confirmar o al leer
  const leyendo = useRef(false)

  const mira = useCallback(async () => {
    if (leyendo.current) return
    leyendo.current = true
    try {
      const e = await licenciaApi.estado()
      setEstado(e)
      if (e?.licencia && e.licencia.valida === false) setFase(f => (f === 'pagada' ? f : 'pagar'))
      return e
    } catch {
      // Sin poder mirarlo (sin red, sesión caducada…) no se tapa nada: el
      // servidor sigue sin dejar pasar a quien no tenga licencia.
      return null
    } finally {
      leyendo.current = false
    }
  }, [])

  useEffect(() => {
    if (!localStorage.getItem('bw_admin_jwt')) return
    const vuelta = vueltaDeStripe()
    if (vuelta?.ok && vuelta.sessionId) {
      // Se le pregunta a Stripe (en el servidor) antes de leer el estado: así
      // ya sale la licencia nueva. El webhook también la activa por si acaso.
      licenciaApi.confirmar(vuelta.sessionId)
        .then(r => {
          if (r.pagado) { setVenceAt(r.venceAt); setFase('pagada') }
          else setAviso('Stripe aún no ha confirmado el pago. En cuanto lo haga, la licencia se activa sola: vuelve a entrar en un minuto.')
        })
        .catch(e => setAviso(e.message))
        .finally(() => mira())
    } else {
      mira()
    }
    const abre = () => { mira() }
    window.addEventListener('helm:sin-licencia', abre)
    return () => window.removeEventListener('helm:sin-licencia', abre)
  }, [mira])

  if (fase === 'pagada') {
    return (
      <Pagada
        venceAt={venceAt || estado?.licencia?.venceAt}
        ia={estado?.ia}
        onFin={() => { setFase(null); mira() }}
      />
    )
  }
  if (fase !== 'pagar' || !estado || estado.licencia?.valida !== false) return null
  return estado.administra
    ? <Pagar estado={estado} aviso={aviso} onSalir={onSalir} />
    : (
      <div className="lic-velo" role="dialog" aria-modal="true" aria-labelledby="lic-titulo">
        <div className="lic-caja">
          <Timon />
          <h2 id="lic-titulo">La licencia de la agencia no está activa</h2>
          <p className="lic-lead">Mientras no se renueve, HELM está parado para todo el equipo. Avisa a quien administra la agencia.</p>
          <button type="button" className="lic-salir" onClick={onSalir}><LogOut size={14} /> Salir</button>
        </div>
      </div>
    )
}

function Timon() {
  return (
    <div className="lic-timon" aria-hidden="true">
      <span className="lic-halo" />
      <img src="/assets/logos/helm-mark.svg" alt="" />
    </div>
  )
}

/** La pantalla de pago: la bienvenida de una agencia nueva o la renovación. */
function Pagar({ estado, aviso, onSalir }) {
  const [pagando, setPagando] = useState(false)
  const [error, setError] = useState(null)
  const l = estado.licencia || {}
  const nombre = estado.agencia?.nombre
  const renovar = Boolean(l.venceAt)
  return (
    <div className="lic-velo" role="dialog" aria-modal="true" aria-labelledby="lic-titulo">
      <div className="lic-caja">
        <Timon />
        {renovar ? (
          <>
            <h2 id="lic-titulo">Tu licencia caducó el {fecha(l.venceAt)}</h2>
            <p className="lic-lead">Renuévala para que tu agencia{nombre ? `, ${nombre},` : ''} vuelva a entrar. Todo lo tuyo sigue aquí, tal cual lo dejaste.</p>
          </>
        ) : (
          <>
            <h2 id="lic-titulo">Bienvenido a HELM{nombre ? `, ${nombre}` : ''}</h2>
            <p className="lic-lead">Una licencia para toda tu agencia y ya está: sin créditos, sin cuota por uso.</p>
          </>
        )}

        <div className="lic-precio">
          <strong>{euros(l.precio || 97)}</strong>
          <span>al año · IVA incluido</span>
        </div>
        <ul className="lic-incluye">
          {INCLUYE.map(t => <li key={t}><Check size={14} /> {t}</li>)}
        </ul>

        {l.pagosActivos === false ? (
          <p className="lic-nota">El pago con tarjeta aún no está activo: escríbenos y te activamos la licencia.</p>
        ) : (
          <button type="button" className="lic-pagar" disabled={pagando} onClick={() => irAPagar(setPagando, setError)}>
            {pagando ? 'Abriendo el pago…' : <>{renovar ? 'Renovar' : 'Pagar'} {euros(l.precio || 97)} <ArrowRight size={16} /></>}
          </button>
        )}
        {(error || aviso) && <p className="lic-error">{error || aviso}</p>}
        <p className="lic-nota">Pago seguro con Stripe. Te llega la factura por correo.</p>
        <button type="button" className="lic-salir" onClick={onSalir}><LogOut size={14} /> Salir</button>
      </div>
    </div>
  )
}

/** Recién pagada: la celebración y, si aún no la tiene, poner la clave de Claude. */
function Pagada({ venceAt, ia, onFin }) {
  // La acaba de poner aquí, o ya la tenía (o trabaja con la de HELM: la casa).
  const [puesta, setPuesta] = useState(false)
  const conClave = puesta || Boolean(ia?.clave || ia?.deHelm)
  useEffect(() => {
    const tecla = (e) => { if (e.key === 'Escape') onFin() }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [onFin])
  return (
    <div className="lic-velo" role="dialog" aria-modal="true" aria-labelledby="lic-titulo">
      <div className="lic-caja lic-pagada">
        <div className="lic-chispas" aria-hidden="true">{Array.from({ length: 14 }, (_, i) => <i key={i} style={{ '--i': i }} />)}</div>
        <Timon />
        <p className="lic-eti">Pago recibido</p>
        <h2 id="lic-titulo">Licencia activa{venceAt ? ` hasta el ${fecha(venceAt)}` : ''}</h2>
        {conClave || !ia ? (
          <p className="lic-lead">Ya está todo. Crea el perfil de tu primer cliente y pon a trabajar a los agentes.</p>
        ) : (
          <>
            <p className="lic-lead">
              Último paso: la IA. Pega tu clave de Claude y los agentes de todos tus perfiles trabajarán con ella
              (la pagas tú a Anthropic, a precio de coste). Puedes hacerlo luego en Perfiles → Agencia.
            </p>
            <div className="lic-clave">
              <ClaveClaude ia={ia} onCambio={(r) => setPuesta(Boolean(r?.clave))} compacta />
            </div>
          </>
        )}
        <button type="button" className="lic-empezar" onClick={onFin}>
          {conClave || !ia ? 'Empezar' : 'Ahora no, empezar'} <ArrowRight size={16} />
        </button>
      </div>
    </div>
  )
}

// ── La clave de Claude de la agencia ────────────────────────────────────────
/**
 * Ver, poner, cambiar o quitar la clave. `ia` es lo de licenciaApi.estado().ia;
 * `onCambio(r)` recibe { clave, last4, model } al guardar o quitar.
 */
export function ClaveClaude({ ia, onCambio, compacta = false }) {
  const [tiene, setTiene] = useState(ia?.clave ? { last4: ia.last4, model: ia.model } : null)
  const [editando, setEditando] = useState(!ia?.clave)
  const [clave, setClave] = useState('')
  const [modelo, setModelo] = useState(ia?.model || ia?.porDefecto || 'claude-opus-5')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)
  const modelos = ia?.modelos || []
  const etiqueta = (id) => modelos.find(m => m.id === id)?.label || id

  async function guardar(e) {
    e.preventDefault(); setError(null); setGuardando(true)
    try {
      const r = await licenciaApi.guardarClave(clave.trim(), modelo)
      setTiene({ last4: r.last4, model: r.model }); setEditando(false); setClave('')
      onCambio?.(r)
    } catch (err) { setError(err.message) } finally { setGuardando(false) }
  }

  async function quitar() {
    if (!window.confirm('Sin clave, los agentes de tus perfiles dejan de usar Claude. ¿Quitarla?')) return
    setError(null)
    try { await licenciaApi.quitarClave(); setTiene(null); setEditando(true); onCambio?.({ clave: false }) }
    catch (err) { setError(err.message) }
  }

  if (tiene && !editando) {
    return (
      <div className="lic-clave-ok">
        <span><KeyRound size={15} /> Clave conectada · …{tiene.last4}{tiene.model ? ` · ${etiqueta(tiene.model)}` : ''}</span>
        <span className="lic-clave-acc">
          <button type="button" className="helm-btn" onClick={() => setEditando(true)}>Cambiar</button>
          <button type="button" className="helm-btn danger" onClick={quitar} title="Quitar la clave"><Trash2 size={14} /></button>
        </span>
        <FormNote>{error}</FormNote>
      </div>
    )
  }

  return (
    <form onSubmit={guardar} className={'lic-clave-form' + (compacta ? ' compacta' : '')}>
      <Field label="Clave de API de Claude" hint="Empieza por sk-ant-. Se crea en console.anthropic.com → API keys.">
        <Input
          type="password" value={clave} onChange={e => setClave(e.target.value)}
          placeholder="sk-ant-…" autoComplete="off" spellCheck={false} required
        />
      </Field>
      {modelos.length > 0 && (
        <Field label="Modelo para el chat" hint={modelos.find(m => m.id === modelo)?.desc}>
          <Select value={modelo} onChange={e => setModelo(e.target.value)}>
            {modelos.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
          </Select>
        </Field>
      )}
      <FormNote>{error}</FormNote>
      <div className="lic-clave-acc">
        <button type="submit" className="helm-btn primary" disabled={guardando || !clave.trim()}>
          {guardando ? 'Comprobando…' : 'Guardar clave'}
        </button>
        {tiene && <button type="button" className="helm-btn" onClick={() => { setEditando(false); setError(null) }}>Cancelar</button>}
      </div>
    </form>
  )
}

// ── Ajustes de la agencia ───────────────────────────────────────────────────
export function AjustesAgencia({ onClose }) {
  const [e, setE] = useState(null)
  const [error, setError] = useState(null)
  const [pagando, setPagando] = useState(false)
  const cargar = () => licenciaApi.estado().then(setE).catch(err => setError(err.message))
  useEffect(() => { cargar() }, [])

  const l = e?.licencia
  return (
    <Modal title={e?.agencia ? `Agencia · ${e.agencia.nombre}` : 'Agencia'} onClose={onClose} wide>
      {!e && !error && <p className="helm-settings-lead">Cargando…</p>}
      <FormNote>{error}</FormNote>
      {e && (
        <div className="lic-ajustes">
          <section>
            <h4><ShieldCheck size={16} /> Licencia</h4>
            {l.sinCobro ? (
              <p className="helm-settings-lead">La agencia de la casa no necesita licencia.</p>
            ) : (
              <>
                <p className="helm-settings-lead">
                  {l.valida
                    ? <>Activa hasta el <b>{fecha(l.venceAt)}</b> ({l.dias} {l.dias === 1 ? 'día' : 'días'}).</>
                    : l.venceAt ? <>Caducó el <b>{fecha(l.venceAt)}</b>.</> : 'Todavía no tienes licencia.'}
                  {' '}{euros(l.precio)} al año, IVA incluido. Si renuevas antes de que caduque, el año nuevo empieza cuando acabe el que tienes.
                </p>
                {l.pagosActivos ? (
                  <button type="button" className="helm-btn primary" disabled={pagando} onClick={() => irAPagar(setPagando, setError)}>
                    {pagando ? 'Abriendo el pago…' : l.valida ? `Renovar un año · ${euros(l.precio)}` : `Pagar ${euros(l.precio)}`}
                  </button>
                ) : (
                  <p className="helm-field-hint">El pago con tarjeta aún no está activo: escríbenos y te la renovamos.</p>
                )}
              </>
            )}
            {l.historial?.length > 0 && (
              <ul className="lic-historial">
                {l.historial.map(h => (
                  <li key={h.id} className={h.estado === 'anulada' ? 'anulada' : ''}>
                    <span>{fechaCorta(h.empieza)} → {fechaCorta(h.vence)}</span>
                    <small>{h.origen === 'manual' ? `Regalada por HELM${h.nota ? ` · ${h.nota}` : ''}` : `Pagada el ${fechaCorta(h.pagada)}`}{h.estado === 'anulada' ? ' · anulada' : ''}</small>
                    <b>{h.origen === 'manual' ? '—' : euros(h.importe)}</b>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h4><KeyRound size={16} /> Clave de Claude</h4>
            <p className="helm-settings-lead">
              Con ella trabajan los agentes de todos tus perfiles: el equipo, el estudio de contenido, las noticias, el
              bot de Telegram, el chat… La pagas tú a Anthropic, directamente: HELM no cobra por uso. Un perfil con su
              propia clave (Ajustes → IA) usa la suya.
            </p>
            {e.ia?.deHelm && !e.ia?.clave && (
              <p className="helm-field-hint">Ahora mismo esta agencia trabaja con la clave de HELM.</p>
            )}
            <ClaveClaude ia={e.ia} onCambio={() => cargar()} />
          </section>

          <section>
            <EnlaceMcp />
          </section>
        </div>
      )}
    </Modal>
  )
}

/** El conector de Claude de toda la agencia: un enlace para todos sus perfiles. */
function EnlaceMcp() {
  const [estado, setEstado] = useState(null)   // { existe, created_at, ultimo_uso }
  const [url, setUrl] = useState('')
  const [copiado, setCopiado] = useState(false)
  const [error, setError] = useState(null)
  useEffect(() => { licenciaApi.enlaceMcp().then(setEstado).catch(() => {}) }, [])

  async function generar() {
    if (estado?.existe && !window.confirm('El enlace anterior dejará de funcionar. ¿Generar uno nuevo?')) return
    setError(null)
    try { setUrl((await licenciaApi.nuevoEnlaceMcp()).url); setEstado({ existe: true }) }
    catch (e) { setError(e.message) }
  }

  return (
    <div className="lic-mcp">
      <h4>Conector de Claude</h4>
      <p className="helm-field-hint">
        La otra forma de poner la IA: añádelo en Claude (Ajustes → Conectores → Añadir conector personalizado) y
        trabaja con todos los perfiles de tu agencia desde tu chat, con tu cuenta de Claude: sus creadores de
        referencia, su calendario y sus métricas.
      </p>
      {url ? (
        <div className="lic-mcp-url">
          <code>{url}</code>
          <button type="button" className="helm-btn" onClick={() => { navigator.clipboard?.writeText(url); setCopiado(true) }}>
            {copiado ? <Check size={14} /> : <Copy size={14} />} {copiado ? 'Copiado' : 'Copiar'}
          </button>
          <small>Guárdalo ahora: no se vuelve a enseñar. Quien lo tenga entra a tus perfiles.</small>
        </div>
      ) : (
        <button type="button" className="helm-btn" onClick={generar}>{estado?.existe ? 'Generar uno nuevo' : 'Generar enlace'}</button>
      )}
      {estado?.existe && !url && estado.ultimo_uso && <small className="helm-field-hint"> Último uso: {fechaCorta(estado.ultimo_uso)}</small>}
      <FormNote>{error}</FormNote>
    </div>
  )
}
