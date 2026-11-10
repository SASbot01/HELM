// HELM — la licencia de la agencia y sus claves de IA (desde el 2026-11-08).
//
// Una agencia paga 97 € al año (IVA incluido) y ya está: HELM no vende
// créditos ni cobra por el uso de la IA. La IA la pone cada agencia con su
// propia clave de Claude (y su token de Replicate para las imágenes de
// Portadas). Ver api/creditos.js, api/_lib/licencia.js y api/_lib/claves-
// agencia.js.
//
//   · PuertaLicencia: envuelve el panel (HelmApp). Sin licencia vigente, encima
//     de todo sale el pago («Licencia 97 €/año → pagar») y no se puede cerrar:
//     el servidor contesta 402 a todo lo demás. Al volver de Stripe confirma el
//     pago y da paso. También se abre si una petición contesta 402 a mitad
//     (helm:sin-licencia, lo lanza apiFetch en ./lib.js).
//   · LicenciaYClaves: el modal de Perfiles → «Licencia y claves»: hasta cuándo
//     vale, renovar, la clave de Claude y el token de Replicate de la agencia y
//     el enlace del conector de Claude.
//   · BotonLicencia: el botón de la cabecera de Perfiles, con aviso si falta la
//     clave de Claude o la licencia vence en menos de 30 días.
import { useCallback, useEffect, useRef, useState } from 'react'
import { KeyRound, Copy, Check, ArrowRight, LogOut, AlertTriangle, ShieldCheck } from 'lucide-react'
import { licenciaApi } from './lib'
import { Modal, Field, Input, Select, FormNote } from './ui'
import './bienvenida.css'

const fechaLarga = (iso) => (iso ? new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : '')
const fecha = (d) => new Date(d).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
const eur = (n) => Number(n || 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 })
const diasHasta = (iso) => (iso ? Math.ceil((Date.parse(iso) - Date.now()) / 86_400_000) : null)
const AVISO_DIAS = 30

/** Lo que incluye la licencia, dicho igual en el pago y en el modal. */
function Incluye() {
  return (
    <ul className="lic-incluye">
      <li><ShieldCheck size={15} aria-hidden="true" /> Todo HELM para tu agencia: tus perfiles, tu equipo y tus agentes.</li>
      <li><KeyRound size={15} aria-hidden="true" /> La IA la pones tú con tu propia clave de Claude: la pagas directamente a Anthropic. Sin créditos ni cobros por uso.</li>
      <li><ArrowRight size={15} aria-hidden="true" /> Un pago al año, con factura. No se renueva sola: cuando vence, la renuevas desde aquí.</li>
    </ul>
  )
}

// ── La puerta ───────────────────────────────────────────────────────────────

/**
 * Envuelve el panel. Mientras se mira la licencia, el panel se pinta igual (al
 * que la tiene no se le hace esperar); si no la tiene, encima sale el pago.
 * `onSalir`: cerrar sesión.
 */
export function PuertaLicencia({ children, onSalir }) {
  const [estado, setEstado] = useState(null)        // licenciaApi.estado()
  const [activada, setActivada] = useState(null)    // { venceAt } al volver de pagar
  const [verClaves, setVerClaves] = useState(false)
  const [error, setError] = useState(null)
  const mirando = useRef(false)

  const mirar = useCallback(() => {
    if (mirando.current) return Promise.resolve(null)
    mirando.current = true
    return licenciaApi.estado()
      .then(e => { setEstado(e); return e })
      // Si no se puede mirar, se deja pasar: el servidor manda de todas formas.
      .catch(() => { setEstado(s => s || { vigente: true }); return null })
      .finally(() => { mirando.current = false })
  }, [])

  useEffect(() => {
    if (!localStorage.getItem('bw_admin_jwt')) return
    // Vuelta de Stripe: /admin?licencia=ok&session_id=… Se confirma el pago (el
    // servidor se lo pregunta a Stripe) antes de mirar la licencia.
    const p = new URLSearchParams(window.location.search)
    const vuelta = p.get('licencia')
    const sesion = p.get('session_id')
    if (vuelta) {
      p.delete('licencia'); p.delete('session_id')
      window.history.replaceState(null, '', window.location.pathname + (p.toString() ? `?${p}` : ''))
    }
    const pago = vuelta === 'ok' && sesion
      ? licenciaApi.confirmar(sesion).then(r => Boolean(r?.pagado)).catch(e => { setError(e.message); return false })
      : Promise.resolve(false)
    pago.then(pagado => mirar().then(e => { if (pagado && e?.vigente) setActivada({ venceAt: e.venceAt }) }))
  }, [mirar])

  // Una petición que contesta 402 a mitad (la licencia ha vencido con el panel abierto).
  useEffect(() => {
    const vuelveAMirar = () => { mirar() }
    window.addEventListener('helm:sin-licencia', vuelveAMirar)
    return () => window.removeEventListener('helm:sin-licencia', vuelveAMirar)
  }, [mirar])

  const bloqueado = Boolean(estado && !estado.vigente)
  return (
    <>
      {children}
      {bloqueado && <PagoLicencia estado={estado} error={error} onSalir={onSalir} />}
      {!bloqueado && activada && (
        <LicenciaActivada
          venceAt={activada.venceAt}
          puedeClaves={Boolean(estado?.esAdmin)}
          onClaves={() => { setActivada(null); setVerClaves(true) }}
          onFin={() => setActivada(null)}
        />
      )}
      {verClaves && <LicenciaYClaves onClose={() => setVerClaves(false)} />}
    </>
  )
}

/** El pago: no se puede cerrar. Quien no administra la agencia ve a quién avisar. */
function PagoLicencia({ estado, error: errorInicial, onSalir }) {
  const [pagando, setPagando] = useState(false)
  const [error, setError] = useState(errorInicial || null)
  const caducada = Boolean(estado.venceAt)
  const nombre = estado.agencia?.nombre

  async function pagar() {
    setError(null); setPagando(true)
    try { window.location.assign((await licenciaApi.pagar()).url) }
    catch (e) { setError(e.message); setPagando(false) }
  }

  return (
    <div className="bv-velo" role="dialog" aria-modal="true" aria-labelledby="lic-titulo">
      <div className="bv-caja">
        <div className="bv-timon" aria-hidden="true">
          <span className="bv-halo" />
          <img src="/assets/logos/helm-mark.svg" alt="" />
        </div>
        <h2 id="lic-titulo">
          {caducada ? 'Tu licencia de HELM ha caducado' : `Activa HELM${nombre ? ` para ${nombre}` : ''}`}
        </h2>
        <p className="bv-lead">
          {caducada
            ? `Venció el ${fechaLarga(estado.venceAt)}. Renuévala para volver a entrar: tus perfiles y tus datos siguen ahí.`
            : 'Una licencia por agencia, con todos tus perfiles dentro.'}
        </p>
        <div className="lic-precio"><b>{eur(estado.precio)}</b><span>al año · IVA incluido</span></div>
        <Incluye />
        {estado.puedePagar ? (
          estado.pagosActivos ? (
            <button type="button" className="bv-empezar" onClick={pagar} disabled={pagando}>
              {pagando ? 'Abriendo el pago…' : <>{caducada ? 'Renovar' : 'Pagar'} {eur(estado.precio)} <ArrowRight size={16} /></>}
            </button>
          ) : (
            <p className="bv-nota">Los pagos con tarjeta aún no están activos. Escríbenos y te activamos la licencia.</p>
          )
        ) : (
          <p className="bv-nota">Pide a quien administra la agencia que {caducada ? 'renueve' : 'active'} la licencia.</p>
        )}
        {error && <p className="bv-error">{error}</p>}
        <div>
          <button type="button" className="bv-saltar" onClick={onSalir}><LogOut size={14} /> Salir</button>
        </div>
      </div>
    </div>
  )
}

/** Al volver de pagar: hasta cuándo vale y el siguiente paso (la clave de Claude). */
function LicenciaActivada({ venceAt, puedeClaves, onClaves, onFin }) {
  return (
    <div className="bv-velo" role="dialog" aria-modal="true" aria-labelledby="lic-ok">
      <div className="bv-caja bv-regalo">
        <div className="bv-chispas" aria-hidden="true">{Array.from({ length: 14 }, (_, i) => <i key={i} style={{ '--i': i }} />)}</div>
        <div className="bv-timon" aria-hidden="true">
          <span className="bv-halo" />
          <img src="/assets/logos/helm-mark.svg" alt="" />
        </div>
        <p className="bv-eti">Pago recibido</p>
        <h2 id="lic-ok">Licencia activa hasta el {fechaLarga(venceAt)}</h2>
        <p className="bv-lead">
          {puedeClaves
            ? 'Siguiente paso: pon la clave de Claude de tu agencia. Sin ella, la IA de tus perfiles no trabaja.'
            : 'Ya puedes seguir trabajando.'}
        </p>
        {puedeClaves ? (
          <>
            <button type="button" className="bv-empezar" onClick={onClaves}>Poner mi clave de Claude <ArrowRight size={16} /></button>
            <div><button type="button" className="bv-saltar" onClick={onFin}>Más tarde</button></div>
          </>
        ) : (
          <button type="button" className="bv-empezar" onClick={onFin}>Empezar <ArrowRight size={16} /></button>
        )}
      </div>
    </div>
  )
}

// ── El botón y el modal de Perfiles ─────────────────────────────────────────

/**
 * El botón de la cabecera de Perfiles. Avisa (punto) si falta la clave de
 * Claude o si la licencia vence en menos de 30 días. `recarga`: para releer.
 */
export function BotonLicencia({ onAbrir, recarga }) {
  const [aviso, setAviso] = useState(null)
  useEffect(() => {
    let vivo = true
    Promise.all([licenciaApi.estado(), licenciaApi.claves().catch(() => null)])
      .then(([e, c]) => {
        if (!vivo) return
        if (e?.exenta) return setAviso(null)
        const dias = diasHasta(e?.venceAt)
        if (c && !c.anthropic?.configurada) setAviso('Falta la clave de Claude de la agencia')
        else if (dias != null && dias <= AVISO_DIAS) setAviso(`La licencia vence en ${dias} ${dias === 1 ? 'día' : 'días'}`)
        else setAviso(null)
      })
      .catch(() => {})
    return () => { vivo = false }
  }, [recarga])
  return (
    <button type="button" className="helm-btn" onClick={onAbrir} title={aviso || 'La licencia de la agencia y sus claves de IA'}>
      <KeyRound size={15} /> Licencia y claves{aviso && <span className="helm-altas-num" aria-label={aviso}>!</span>}
    </button>
  )
}

export function LicenciaYClaves({ onClose }) {
  const [estado, setEstado] = useState(null)
  const [claves, setClaves] = useState(null)
  const [error, setError] = useState(null)
  const [pagando, setPagando] = useState(false)

  const cargar = () => Promise.all([licenciaApi.estado(), licenciaApi.claves().catch(() => null)])
    .then(([e, c]) => { setEstado(e); setClaves(c) })
    .catch(e => setError(e.message))
  useEffect(() => { cargar() }, [])

  async function renovar() {
    setError(null); setPagando(true)
    try { window.location.assign((await licenciaApi.pagar()).url) }
    catch (e) { setError(e.message); setPagando(false) }
  }

  const dias = diasHasta(estado?.venceAt)
  return (
    <Modal title={estado?.agencia ? `Licencia y claves · ${estado.agencia.nombre}` : 'Licencia y claves'} onClose={onClose} wide>
      {!estado && !error && <p className="helm-settings-lead">Cargando…</p>}
      <FormNote>{error}</FormNote>
      {estado && (
        <div className="helm-creditos lic">
          <h4>Licencia</h4>
          {estado.exenta ? (
            <p className="helm-settings-lead">Esta agencia no necesita licencia (es la de la casa) y su IA va con las claves del servidor.</p>
          ) : (
            <>
              <div className="lic-estado">
                <strong>{estado.vigente ? `Activa hasta el ${fechaLarga(estado.venceAt)}` : 'Caducada'}</strong>
                {estado.vigente && dias != null && <span className={dias <= AVISO_DIAS ? 'lic-pronto' : ''}>quedan {dias} {dias === 1 ? 'día' : 'días'}</span>}
              </div>
              <p className="helm-field-hint">
                {eur(estado.precio)} al año, IVA incluido. Si renuevas antes de que venza, el año nuevo empieza cuando acaba el actual: no pierdes días.
              </p>
              {estado.puedePagar && estado.pagosActivos && (
                <button type="button" className="helm-btn" onClick={renovar} disabled={pagando}>
                  {pagando ? 'Abriendo el pago…' : `Renovar un año · ${eur(estado.precio)}`}
                </button>
              )}
            </>
          )}

          {!estado.exenta && claves && (
            <>
              <ClaveClaude claves={claves} onGuardado={setClaves} />
              <TokenReplicate claves={claves} onGuardado={setClaves} />
            </>
          )}

          <EnlaceMcp />
        </div>
      )}
    </Modal>
  )
}

/** La clave de Claude de la agencia: con ella trabaja la IA de todos sus perfiles. */
function ClaveClaude({ claves, onGuardado }) {
  const a = claves.anthropic || {}
  const modelos = claves.modelos || []
  const [clave, setClave] = useState('')
  const [modelo, setModelo] = useState(a.modelo || claves.modeloPorDefecto || modelos[0]?.id || '')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState(null)
  const [hecho, setHecho] = useState(null)

  async function guardar(e) {
    e.preventDefault(); setError(null); setHecho(null); setOcupado(true)
    try {
      onGuardado(await licenciaApi.guardarClaves({ anthropicKey: clave.trim() || undefined, anthropicModel: modelo }))
      setClave(''); setHecho(clave.trim() ? 'Clave guardada. La IA de tus perfiles ya trabaja con ella.' : 'Modelo cambiado.')
    } catch (err) { setError(err.message) } finally { setOcupado(false) }
  }
  async function quitar() {
    if (!window.confirm('¿Quitar la clave de Claude de la agencia? La IA de tus perfiles se parará hasta que pongas otra (salvo los que tengan su propia clave).')) return
    setError(null); setHecho(null); setOcupado(true)
    try { onGuardado(await licenciaApi.guardarClaves({ borrar: ['anthropic'] })); setHecho('Clave quitada.') }
    catch (err) { setError(err.message) } finally { setOcupado(false) }
  }

  return (
    <div className="lic-clave">
      <h4>Clave de Claude</h4>
      {a.configurada ? (
        <p className="helm-settings-lead">
          Puesta (…{a.last4}). Con ella trabaja la IA de todos tus perfiles, salvo los que tengan su propia clave en Ajustes → IA.
          Lo que gaste se factura a tu cuenta de Anthropic.
        </p>
      ) : (
        <div className="helm-creditos-aviso"><AlertTriangle size={14} /> Sin clave, la IA de tus perfiles no trabaja (agentes, estudios, el bot de Telegram…).</div>
      )}
      <form className="lic-form" onSubmit={guardar}>
        <Field label={a.configurada ? 'Cambiar la clave' : 'API key de Anthropic'}>
          <Input type="password" value={clave} onChange={e => setClave(e.target.value)} placeholder="sk-ant-…" autoComplete="off" required={!a.configurada} />
        </Field>
        <Field label="Modelo">
          <Select value={modelo} onChange={e => setModelo(e.target.value)}>
            {modelos.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
          </Select>
        </Field>
        <div className="lic-acc">
          <button type="submit" className="helm-btn primary" disabled={ocupado || (!clave.trim() && (!a.configurada || modelo === a.modelo))}>
            {ocupado ? 'Comprobando…' : 'Guardar'}
          </button>
          {a.configurada && <button type="button" className="helm-btn" onClick={quitar} disabled={ocupado}>Quitar</button>}
        </div>
      </form>
      <small className="helm-field-hint">
        Sácala de console.anthropic.com → API keys. Se comprueba contra Anthropic antes de guardarse y se queda en el servidor: aquí solo
        se ven los cuatro últimos caracteres.
      </small>
      <FormNote>{error}</FormNote>
      <FormNote tone="ok">{hecho}</FormNote>
    </div>
  )
}

/** El token de Replicate: solo para las imágenes con IA de Portadas. */
function TokenReplicate({ claves, onGuardado }) {
  const r = claves.replicate || {}
  const [token, setToken] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState(null)

  async function guardar(e) {
    e.preventDefault(); setError(null); setOcupado(true)
    try { onGuardado(await licenciaApi.guardarClaves({ replicateToken: token.trim() })); setToken('') }
    catch (err) { setError(err.message) } finally { setOcupado(false) }
  }
  async function quitar() {
    if (!window.confirm('¿Quitar el token de Replicate? Portadas dejará de generar imágenes con IA.')) return
    setError(null); setOcupado(true)
    try { onGuardado(await licenciaApi.guardarClaves({ borrar: ['replicate'] })) }
    catch (err) { setError(err.message) } finally { setOcupado(false) }
  }

  return (
    <div className="lic-clave">
      <h4>Token de Replicate <small>opcional</small></h4>
      <p className="helm-field-hint">
        Solo para generar imágenes con IA en Portadas (el fondo y la portada entera). Lo que cueste cada imagen lo paga tu cuenta de Replicate.
        {r.configurada ? ` Puesto (…${r.last4}).` : ' Sin él, Portadas compone con el fotograma del reel, sin imágenes con IA.'}
      </p>
      <form className="lic-form" onSubmit={guardar}>
        <Field label={r.configurada ? 'Cambiar el token' : 'API token de Replicate'}>
          <Input type="password" value={token} onChange={e => setToken(e.target.value)} placeholder="r8_…" autoComplete="off" required />
        </Field>
        <div className="lic-acc">
          <button type="submit" className="helm-btn" disabled={ocupado || !token.trim()}>{ocupado ? 'Guardando…' : 'Guardar'}</button>
          {r.configurada && <button type="button" className="helm-btn" onClick={quitar} disabled={ocupado}>Quitar</button>}
        </div>
      </form>
      <FormNote>{error}</FormNote>
    </div>
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
