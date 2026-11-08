// HELM — licencia de la agencia (97 €/año) y «trae tu propia clave» de Claude.
//
// Sustituye a la pantalla de créditos: ya no se compran créditos ni se regalan
// los de bienvenida. La agencia paga una licencia anual y mete SU clave de
// Claude; sus agentes llaman a Claude con ella (la agencia paga a Anthropic).
//
//   · LicenciaGate  → pantalla de bloqueo cuando no hay licencia activa, en vez
//                     del panel de perfiles. Pagar 97 €/año o canjear un código.
//   · LicenciaPanel → el modal con el estado de la licencia, la clave de Claude
//                     de la agencia y el enlace del conector de Claude.
import { useEffect, useState } from 'react'
import { ShieldCheck, KeyRound, ArrowRight, RefreshCw } from 'lucide-react'
import { creditosApi } from './lib'
import { Modal, FormNote } from './ui'
import { EnlaceMcp } from './Creditos'
import './bienvenida.css'

const fechaLarga = (d) => (d ? new Date(d).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : null)

// ── La pantalla de bloqueo: sin licencia activa, no se entra al panel ────────
export function LicenciaGate({ licencia, onPagar, onCanjear, pagando, error }) {
  const [codigo, setCodigo] = useState('')
  const [canjeando, setCanjeando] = useState(false)
  const [errCodigo, setErrCodigo] = useState(null)
  const precio = licencia?.precio ?? 97
  const vencida = licencia?.motivo === 'vencida'

  async function canjear(e) {
    e.preventDefault()
    if (!codigo.trim()) return
    setErrCodigo(null); setCanjeando(true)
    try { await onCanjear(codigo.trim()) }
    catch (err) { setErrCodigo(err.message) }
    finally { setCanjeando(false) }
  }

  return (
    <div className="bv-velo" role="dialog" aria-modal="true" aria-labelledby="lic-titulo">
      <div className="bv-caja bv-oferta">
        <div className="bv-timon" aria-hidden="true">
          <span className="bv-halo" />
          <img src="/assets/logos/helm-mark.svg" alt="" />
        </div>
        <h2 id="lic-titulo">{vencida ? 'Tu licencia ha caducado' : 'Activa tu licencia de HELM'}</h2>
        <p className="bv-lead">
          HELM funciona con una licencia anual: {precio} € al año por tu agencia y todos sus perfiles.
          Sin créditos ni cobros por uso. La IA la pones tú, con tu propia clave de Claude.
          {vencida && licencia?.venceAt ? ` Caducó el ${fechaLarga(licencia.venceAt)}.` : ''}
        </p>
        {licencia?.pagosActivos ? (
          <button type="button" className="bv-empezar" disabled={pagando} onClick={onPagar}>
            {pagando ? 'Abriendo el pago…' : <>Pagar {precio} €/año <ArrowRight size={16} /></>}
          </button>
        ) : (
          <p className="bv-nota">Los pagos con tarjeta aún no están activos. Escríbenos y te activamos la licencia.</p>
        )}
        {error && <p className="bv-error">{error}</p>}

        <form onSubmit={canjear} className="lic-codigo">
          <label htmlFor="lic-codigo-input">¿Tienes un código de cortesía?</label>
          <div className="lic-fila">
            <input
              id="lic-codigo-input" value={codigo}
              onChange={e => setCodigo(e.target.value.toUpperCase())}
              placeholder="HELM-XXXX-XXXX-XXXX" autoComplete="off" spellCheck={false}
            />
            <button type="submit" className="helm-btn" disabled={canjeando || !codigo.trim()}>
              {canjeando ? 'Canjeando…' : 'Canjear'}
            </button>
          </div>
          {errCodigo && <p className="bv-error">{errCodigo}</p>}
        </form>
      </div>
    </div>
  )
}

// ── El modal de la licencia activa ──────────────────────────────────────────
export function LicenciaPanel({ licencia, onClose, onPagar, pagando }) {
  const sinCobro = licencia?.agencia?.sinCobro
  return (
    <Modal title={licencia?.agencia ? `Licencia · ${licencia.agencia.nombre}` : 'Licencia'} onClose={onClose} wide>
      <div className="helm-creditos">
        {sinCobro ? (
          <p className="helm-settings-lead">Esta agencia es de la casa: no necesita licencia.</p>
        ) : licencia?.activa ? (
          <>
            <div className="lic-estado lic-ok">
              <ShieldCheck size={18} />
              <span>
                <b>Licencia activa</b>
                {licencia.venceAt ? <small>Válida hasta el {fechaLarga(licencia.venceAt)}</small> : <small>Sin caducidad</small>}
              </span>
            </div>
            {licencia.venceAt && licencia.pagosActivos && (
              <button type="button" className="helm-btn" disabled={pagando} onClick={onPagar}>
                <RefreshCw size={14} /> {pagando ? 'Abriendo el pago…' : `Renovar un año más (${licencia.precio ?? 97} €)`}
              </button>
            )}
          </>
        ) : (
          <p className="helm-settings-lead">Esta agencia no tiene licencia activa.</p>
        )}

        <ClaveClaude />
        <EnlaceMcp />
      </div>
    </Modal>
  )
}

// ── «Trae tu propia clave»: la clave de Claude de la agencia ─────────────────
function ClaveClaude() {
  const [estado, setEstado] = useState(null)   // { tiene, last4 }
  const [clave, setClave] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => { creditosApi.claveClaude().then(setEstado).catch(() => setEstado({ tiene: false })) }, [])

  async function guardar(e) {
    e.preventDefault()
    if (!clave.trim()) return
    setError(null); setMsg(null); setGuardando(true)
    try {
      const r = await creditosApi.guardarClaveClaude(clave.trim())
      setEstado(r); setClave('')
      setMsg(r.tiene ? `Clave guardada (termina en ${r.last4}).` : 'Clave quitada.')
    } catch (err) { setError(err.message) }
    finally { setGuardando(false) }
  }

  async function quitar() {
    setError(null); setMsg(null); setGuardando(true)
    try { const r = await creditosApi.guardarClaveClaude(''); setEstado(r); setMsg('Clave quitada.') }
    catch (err) { setError(err.message) }
    finally { setGuardando(false) }
  }

  return (
    <div className="helm-creditos-mcp">
      <h4><KeyRound size={15} /> Clave de Claude de la agencia</h4>
      <p className="helm-field-hint">
        Tus agentes (editor de reels, portadas, trial, el chat con herramientas…) llaman a Claude con esta clave, y la
        agencia paga su consumo a Anthropic directamente. {estado?.tiene
          ? <>Ahora mismo hay una configurada (termina en <b>{estado.last4}</b>).</>
          : 'Todavía no has puesto ninguna: sin ella, los perfiles sin clave propia usan el modelo local.'}
      </p>
      <form onSubmit={guardar} className="lic-fila">
        <input
          type="password" value={clave} onChange={e => setClave(e.target.value)}
          placeholder="sk-ant-…" autoComplete="off" spellCheck={false}
        />
        <button type="submit" className="helm-btn" disabled={guardando || !clave.trim()}>
          {guardando ? 'Comprobando…' : 'Guardar'}
        </button>
      </form>
      {estado?.tiene && (
        <button type="button" className="helm-btn lic-quitar" onClick={quitar} disabled={guardando}>Quitar clave</button>
      )}
      {msg && <p className="helm-field-hint">{msg}</p>}
      <FormNote>{error}</FormNote>
    </div>
  )
}
