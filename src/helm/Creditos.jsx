// HELM — créditos de la agencia.
//
// Se paga por uso: la agencia compra créditos y la IA de HELM los gasta al
// trabajar para sus perfiles (en el panel, en el contenido automático, en el bot
// de Telegram y cuando el conector de Claude le pide algo a HELM). Lo que Claude
// haga en la cuenta del propio usuario no gasta créditos. Ver api/creditos.js.
//
// Aquí también vive el enlace del conector de Claude de la agencia entera: es
// de la agencia, como el saldo, no de un perfil.
import { useEffect, useRef, useState } from 'react'
import { Coins, Copy, Check, X, ArrowRight } from 'lucide-react'
import { creditosApi } from './lib'
import { Modal, FormNote } from './ui'
import './bienvenida.css'

const fmt = (n) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0, useGrouping: 'always' }).format(Math.floor(Number(n) || 0))
const fecha = (d) => new Date(d).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
const QUE = { recarga: 'Recarga', regalo: 'Regalo', ajuste: 'Ajuste', consumo: 'IA' }
const DONDE = { panel: 'panel', mcp: 'conector de Claude', auto: 'contenido automático', telegram: 'Telegram' }

/** El botón de la cabecera de Perfiles: el saldo a la vista. */
export function BotonCreditos({ onAbrir, recarga }) {
  const [s, setS] = useState(null)
  useEffect(() => { creditosApi.saldo().then(setS).catch(() => setS(null)) }, [recarga])
  if (!s) return null
  return (
    <button type="button" className="helm-btn" onClick={onAbrir} title="Créditos de la agencia">
      <Coins size={15} /> {s.agencia?.sinCobro ? 'Créditos' : `${fmt(s.creditos)} créditos`}
    </button>
  )
}

// `aviso`: por qué se abre solo (p. ej. «te has quedado sin créditos»).
export default function Creditos({ onClose, aviso }) {
  const [s, setS] = useState(null)
  const [error, setError] = useState(null)
  const [comprando, setComprando] = useState(null)
  const cargar = () => creditosApi.saldo().then(setS).catch(e => setError(e.message))
  useEffect(() => { cargar() }, [])

  async function comprar(pack) {
    setError(null); setComprando(pack)
    try { window.location.assign((await creditosApi.comprar(pack)).url) }
    catch (e) { setError(e.message); setComprando(null) }
  }

  return (
    <Modal title={s?.agencia ? `Créditos · ${s.agencia.nombre}` : 'Créditos'} onClose={onClose} wide>
      {aviso && <div className="helm-creditos-aviso">{aviso}</div>}
      {!s && !error && <p className="helm-settings-lead">Cargando…</p>}
      <FormNote>{error}</FormNote>
      {s && (
        <div className="helm-creditos">
          {s.agencia.sinCobro ? (
            <p className="helm-settings-lead">Esta agencia no paga su consumo de IA. Abajo tienes lo que ha gastado igualmente.</p>
          ) : (
            <>
              <div className="helm-creditos-saldo">
                <strong>{fmt(s.creditos)}</strong> <span>créditos</span>
              </div>
              <p className="helm-settings-lead">
                Los gasta la IA de HELM cuando trabaja para tus perfiles: en el panel, en el contenido automático, en
                el bot de Telegram y cuando el conector de Claude le pide algo a HELM. Lo que Claude hace en tu propia
                cuenta no gasta créditos. 1 € = 100 créditos, sin cuota ni permanencia.
              </p>
              {s.creditos <= 0 && <FormNote>Sin créditos la IA de tus perfiles está parada. Recarga para que siga trabajando.</FormNote>}
              <div className="helm-creditos-packs">
                {s.packs.map(p => (
                  <button key={p.id} type="button" className="helm-btn" disabled={Boolean(comprando) || !s.pagosActivos} onClick={() => comprar(p.id)}>
                    {fmt(p.creditos)} créditos · {p.euros} €
                  </button>
                ))}
              </div>
              {!s.pagosActivos && <p className="helm-field-hint">Los pagos con tarjeta aún no están activos: escríbenos y te cargamos los créditos.</p>}
            </>
          )}

          <EnlaceMcp />

          <h4>Movimientos</h4>
          {s.movimientos.length ? (
            <ul className="helm-creditos-movs">
              {s.movimientos.map(m => (
                <li key={m.id}>
                  <span>{QUE[m.tipo] || m.tipo}{m.tipo === 'consumo' ? ` · ${DONDE[m.origen] || m.origen}${m.perfil ? ` · ${m.perfil}` : ''}` : ''}</span>
                  <small>{fecha(m.fecha)}{m.tokens ? ` · ${fmt(m.tokens)} tokens` : ''}</small>
                  <b className={m.creditos < 0 ? 'resta' : 'suma'}>{m.creditos > 0 ? '+' : ''}{m.creditos.toLocaleString('es-ES', { maximumFractionDigits: 2 })}</b>
                </li>
              ))}
            </ul>
          ) : <p className="helm-field-hint">Todavía no hay movimientos.</p>}
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
  useEffect(() => { creditosApi.enlaceMcp().then(setEstado).catch(() => {}) }, [])

  async function generar() {
    if (estado?.existe && !window.confirm('El enlace anterior dejará de funcionar. ¿Generar uno nuevo?')) return
    setError(null)
    try { setUrl((await creditosApi.nuevoEnlaceMcp()).url); setEstado({ existe: true }) }
    catch (e) { setError(e.message) }
  }

  return (
    <div className="helm-creditos-mcp">
      <h4>Conector de Claude</h4>
      <p className="helm-field-hint">
        Añádelo en Claude (Ajustes → Conectores → Añadir conector personalizado) y trabaja con todos los perfiles de
        tu agencia desde tu chat: sus creadores de referencia, su calendario y sus métricas.
      </p>
      {url ? (
        <div className="helm-creditos-url">
          <code>{url}</code>
          <button type="button" className="helm-btn" onClick={() => { navigator.clipboard?.writeText(url); setCopiado(true) }}>
            {copiado ? <Check size={14} /> : <Copy size={14} />} {copiado ? 'Copiado' : 'Copiar'}
          </button>
          <small>Guárdalo ahora: no se vuelve a enseñar. Quien lo tenga entra a tus perfiles.</small>
        </div>
      ) : (
        <button type="button" className="helm-btn" onClick={generar}>{estado?.existe ? 'Generar uno nuevo' : 'Generar enlace'}</button>
      )}
      {estado?.existe && !url && estado.ultimo_uso && <small className="helm-field-hint"> Último uso: {fecha(estado.ultimo_uso)}</small>}
      <FormNote>{error}</FormNote>
    </div>
  )
}

// ── La bienvenida de una agencia nueva ─────────────────────────────────────
// Lo primero que ve al entrar: la oferta de comprar créditos. Si la cierra
// («Ahora no» o la X), se le regalan los de bienvenida, con su celebración.
// Si compra, vuelve de Stripe y se abre ya en el regalo (`pagado`), que
// también le toca. El servidor solo regala una vez por agencia.
export function Bienvenida({ saldo, pagado = false, onFin }) {
  const [fase, setFase] = useState(pagado ? 'regalo' : 'oferta')   // oferta | regalo
  const [regalo, setRegalo] = useState(null)                      // créditos regalados
  const [comprando, setComprando] = useState(null)
  const [error, setError] = useState(null)
  const pedido = useRef(false)
  const nombre = saldo?.agencia?.nombre
  const gratis = saldo?.bienvenida?.creditos || 0

  // Una sola petición aunque se pulse dos veces (y el servidor, además, solo regala una vez).
  function pedirRegalo() {
    if (pedido.current) return
    pedido.current = true
    creditosApi.bienvenida()
      .then(r => setRegalo(r.creditos || gratis))
      .catch(e => { setError(e.message); setRegalo(0) })
  }
  function reclamar() { setFase('regalo'); setError(null); pedirRegalo() }
  useEffect(() => { if (pagado) pedirRegalo() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const tecla = (e) => { if (e.key === 'Escape') (fase === 'oferta' ? reclamar() : onFin()) }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [fase]) // eslint-disable-line react-hooks/exhaustive-deps

  async function comprar(pack) {
    setError(null); setComprando(pack)
    try { window.location.assign((await creditosApi.comprar(pack)).url) }
    catch (e) { setError(e.message); setComprando(null) }
  }

  return (
    <div className="bv-velo" role="dialog" aria-modal="true" aria-labelledby="bv-titulo">
      <div className={'bv-caja bv-' + fase}>
        {fase === 'oferta' && (
          <button type="button" className="bv-cerrar" onClick={reclamar} aria-label="Cerrar y empezar con el regalo"><X size={18} /></button>
        )}
        <div className="bv-timon" aria-hidden="true">
          <span className="bv-halo" />
          <img src="/assets/logos/helm-mark.svg" alt="" />
        </div>

        {fase === 'oferta' ? (
          <>
            <h2 id="bv-titulo">Bienvenido a HELM{nombre ? `, ${nombre}` : ''}</h2>
            <p className="bv-lead">
              Tu agencia funciona con créditos: la IA solo gasta cuando trabaja para tus clientes.
              Sin cuota y sin permanencia. 1 € = 100 créditos.
            </p>
            {saldo?.pagosActivos ? (
              <div className="bv-packs">
                {saldo.packs.map((p, i) => (
                  <button
                    key={p.id} type="button" className="bv-pack" style={{ '--i': i }}
                    disabled={Boolean(comprando)} onClick={() => comprar(p.id)}
                  >
                    <span className="bv-pack-eur">{p.euros} €</span>
                    <span className="bv-pack-cr">{fmt(p.creditos)} créditos</span>
                    <span className="bv-pack-ir">{comprando === p.id ? 'Abriendo pago…' : <>Comprar <ArrowRight size={14} /></>}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="bv-nota">Los pagos con tarjeta aún no están activos.</p>
            )}
            {error && <p className="bv-error">{error}</p>}
            <button type="button" className="bv-saltar" onClick={reclamar}>
              Ahora no, empezar con {fmt(gratis)} créditos de regalo
            </button>
          </>
        ) : (
          <>
            <div className="bv-chispas" aria-hidden="true">{Array.from({ length: 14 }, (_, i) => <i key={i} style={{ '--i': i }} />)}</div>
            <p className="bv-eti">{pagado ? 'Pago recibido · y además' : 'Tu regalo de bienvenida'}</p>
            <h2 id="bv-titulo" className="bv-cifra">
              +<Contador hasta={regalo} /> <span>créditos</span>
            </h2>
            <p className="bv-lead">
              {regalo === 0 && error
                ? error
                : 'Crea el perfil de tu primer cliente y prueba la IA. Cuando se acaben, recargas desde el botón Créditos y sigues.'}
            </p>
            <button type="button" className="bv-empezar" onClick={onFin} disabled={regalo == null}>
              Empezar <ArrowRight size={16} />
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// Cuenta de 0 a `hasta` en algo menos de un segundo, frenando al final.
function Contador({ hasta }) {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!hasta) return
    let raf
    const t0 = performance.now()
    const paso = (t) => {
      const k = Math.min(1, (t - t0) / 900)
      setN(Math.round(hasta * (1 - Math.pow(1 - k, 3))))
      if (k < 1) raf = requestAnimationFrame(paso)
    }
    raf = requestAnimationFrame(paso)
    return () => cancelAnimationFrame(raf)
  }, [hasta])
  return <>{hasta == null ? '…' : fmt(hasta ? n : 0)}</>
}

// ── Sin créditos, en cualquier pantalla del panel ───────────────────────────
// lib.js avisa con «helm:sin-saldo» cuando el servidor contesta 402. Quien
// administra la agencia ve la recarga; el resto del equipo, a quién avisar.
export function AvisoSinSaldo() {
  const [aviso, setAviso] = useState(null)
  useEffect(() => {
    const abre = (e) => setAviso(e.detail || 'Te has quedado sin créditos. Recarga para que la IA siga trabajando.')
    window.addEventListener('helm:sin-saldo', abre)
    return () => window.removeEventListener('helm:sin-saldo', abre)
  }, [])
  if (!aviso) return null
  if (localStorage.getItem('bw_superadmin')) return <Creditos aviso={aviso} onClose={() => setAviso(null)} />
  return (
    <Modal title="Sin créditos" onClose={() => setAviso(null)}>
      <p className="helm-settings-lead">La agencia se ha quedado sin créditos y la IA está parada. Avisa a quien la administra para que recargue.</p>
    </Modal>
  )
}
