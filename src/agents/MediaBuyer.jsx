// Agent OS — el Media buyer: lleva las campañas de Meta Ads del perfil
// (api/meta-ads.js). Cada mañana propone subir, bajar o pausar con su porqué
// (llega a la Bandeja y a Telegram para aprobarlo); un vigilante sin IA mira
// el gasto cada media hora y solo puede FRENAR. Aquí se conecta la cuenta,
// se ponen los topes (que el agente nunca pasa), se ve el parte y el registro,
// y está el botón de parar los anuncios. Cambiar algo: solo quien administra
// la agencia; el resto, lo ve.
import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Plug, ShieldAlert, PlayCircle, ListChecks, Save } from 'lucide-react'
import { metaAdsApi } from '../helm/lib'
import './bandeja.css'

const eur = (n) => (n == null || n === '' ? '—' : `${Number(n).toLocaleString('es-ES', { maximumFractionDigits: 2 })} €`)
const fecha = (iso) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}
const ACCION = { presupuesto: 'Presupuesto', pausar: 'Pausa', activar: 'Activación', parar_todo: 'Parar todo', reanudar_todo: 'Reanudar', topes: 'Topes' }
const FASES = { captacion: 'Captación (coste por lead)', carrito: 'Carrito abierto (coste por venta)', cierre: 'Cierre (no toca nada)' }

function Topes({ c, puedeCambiar, onGuardar }) {
  const [f, setF] = useState({
    tope_diario: c.tope_diario ?? '', tope_mensual: c.tope_mensual ?? '', objetivo_cpl: c.objetivo_cpl ?? '',
    objetivo_cpa: c.objetivo_cpa ?? '', fase: c.fase || 'captacion', nivel: c.nivel ?? 1,
  })
  const cambia = (k) => (e) => setF(x => ({ ...x, [k]: e.target.value }))
  const campo = (k, etiqueta, ayuda) => (
    <label className="mb-campo">
      <span>{etiqueta}</span>
      <input type="number" min="0" step="0.01" inputMode="decimal" value={f[k]} onChange={cambia(k)} disabled={!puedeCambiar} />
      {ayuda && <small>{ayuda}</small>}
    </label>
  )
  return (
    <form className="mb-topes" onSubmit={(e) => { e.preventDefault(); onGuardar({ cuenta: c.cuenta_id, ...f, nivel: Number(f.nivel) }) }}>
      {campo('tope_diario', 'Tope diario (€)', 'La suma de presupuestos diarios nunca lo pasa.')}
      {campo('tope_mensual', 'Tope mensual (€)', 'Ponlo también como límite de gasto de la cuenta en Meta.')}
      {campo('objetivo_cpl', 'Coste por lead objetivo (€)')}
      {campo('objetivo_cpa', 'Coste por venta objetivo (€)')}
      <label className="mb-campo">
        <span>Fase</span>
        <select value={f.fase} onChange={cambia('fase')} disabled={!puedeCambiar}>
          {Object.entries(FASES).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
        </select>
      </label>
      <label className="mb-campo">
        <span>Qué hace</span>
        <select value={f.nivel} onChange={cambia('nivel')} disabled={!puedeCambiar}>
          <option value={0}>Solo mira y te manda el parte</option>
          <option value={1}>Propone cambios y tú los apruebas</option>
        </select>
      </label>
      {puedeCambiar && <button type="submit" className="ag-btn primario sm"><Save size={13} /> Guardar topes</button>}
    </form>
  )
}

export default function MediaBuyer({ clientId, onVolver }) {
  const [estado, setEstado] = useState(null)
  const [parte, setParte] = useState(null)
  const [registro, setRegistro] = useState([])
  const [disponibles, setDisponibles] = useState(null)
  const [token, setToken] = useState('')
  const [aviso, setAviso] = useState('')
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)

  const cargar = useCallback(async () => {
    try {
      const e = await metaAdsApi.estado(clientId)
      setEstado(e)
      if (e.conectado && e.cuentas?.some(c => c.activa)) {
        const [p, r] = await Promise.all([metaAdsApi.parte(clientId).catch(() => null), metaAdsApi.registro(clientId).catch(() => null)])
        setParte(p)
        setRegistro(r?.acciones || [])
      }
      setError('')
    } catch (e) {
      setError(e?.message || 'No se ha podido cargar el Media buyer.')
    }
  }, [clientId])
  useEffect(() => { cargar() }, [cargar])

  async function hacer(fn, ok) {
    setOcupado(true)
    setAviso('')
    try {
      const r = await fn()
      setAviso(r?.texto || ok)
      await cargar()
    } catch (e) {
      setAviso(e?.message || 'No se ha podido hacer.')
    } finally {
      setOcupado(false)
    }
  }

  const volver = onVolver && (
    <button type="button" className="ag-volver" onClick={onVolver}><ArrowLeft size={14} strokeWidth={2.2} /> Contenido y anuncios</button>
  )
  if (error) return <div className="ag embebido">{volver}<p className="ag-error">{error}</p></div>
  if (!estado) return <div className="ag embebido">{volver}</div>
  const puede = estado.puedeCambiar === true
  const activas = (estado.cuentas || []).filter(c => c.activa)

  return (
    <div className="ag embebido mb">
      <header className="ag-top dentro">
        <div>
          {volver}
          <h1>Media buyer</h1>
          <p>Lleva tus campañas de Meta: sube lo que vende, apaga lo que no y nunca pasa del tope que tú pongas. Cada mañana te propone los cambios y tú los apruebas en la Bandeja o en Telegram.</p>
        </div>
      </header>
      {aviso && <p className="bj-aviso" role="status">{aviso}</p>}

      <section className="mb-bloque">
        <h2 className="ag-seccion"><Plug size={16} /> Conexión con Meta</h2>
        {estado.conectado ? (
          <p>Conectado{estado.usuario ? ` como ${estado.usuario}` : ''}{estado.token ? ` (${estado.token})` : ''}{estado.conectado_en ? ` desde el ${fecha(estado.conectado_en)}` : ''}.
            {puede && <> <button type="button" className="ag-btn sm" disabled={ocupado} onClick={() => window.confirm('¿Desconectar Meta? El agente deja de mirar y de proponer.') && hacer(() => metaAdsApi.desconectar(clientId), 'Desconectado.')}>Desconectar</button></>}
          </p>
        ) : puede ? (
          <form className="mb-conectar" onSubmit={(e) => { e.preventDefault(); if (token.trim()) hacer(() => metaAdsApi.conectar(clientId, token.trim()), 'Conectado. Ahora elige las cuentas que lleva.').then(() => setToken('')) }}>
            <p>Pega el token del usuario del sistema «HELM Media buyer» (Configuración del negocio de Meta → Usuarios del sistema → Generar token, con ads_read, ads_management y business_management). No se enseña nunca entero.</p>
            <input type="password" autoComplete="off" value={token} onChange={e => setToken(e.target.value)} placeholder="EAAG…" aria-label="Token de Meta" />
            <button type="submit" className="ag-btn primario sm" disabled={ocupado || !token.trim()}>Conectar</button>
          </form>
        ) : <p className="ag-vacio">Aún no está conectado. Quien administra la agencia lo conecta aquí.</p>}
      </section>

      {estado.conectado && (
        <section className="mb-bloque">
          <h2 className="ag-seccion">Cuentas publicitarias</h2>
          {puede && (
            <button type="button" className="ag-btn sm" disabled={ocupado} onClick={async () => { try { setDisponibles((await metaAdsApi.disponibles(clientId)).cuentas || []) } catch (e) { setAviso(e?.message || 'No se han podido leer las cuentas.') } }}>
              Elegir qué cuentas lleva
            </button>
          )}
          {disponibles && (
            <form className="mb-elegir" onSubmit={(e) => {
              e.preventDefault()
              const marcadas = [...new FormData(e.currentTarget).getAll('cuenta')]
              hacer(() => metaAdsApi.cuentas(clientId, marcadas), 'Cuentas guardadas. Ponles sus topes.').then(() => setDisponibles(null))
            }}>
              {disponibles.length === 0 && <p className="ag-vacio">El token no ve ninguna cuenta: asígnale las cuentas al usuario del sistema en Meta.</p>}
              {disponibles.map(c => (
                <label key={c.cuenta_id} className="bj-ajuste-on">
                  <input type="checkbox" name="cuenta" value={c.cuenta_id} defaultChecked={c.conectada} />
                  <span>{c.nombre || c.cuenta_id} <small>({c.cuenta_id}{c.moneda ? ` · ${c.moneda}` : ''})</small></span>
                </label>
              ))}
              <button type="submit" className="ag-btn primario sm" disabled={ocupado}>Guardar</button>
            </form>
          )}
          {activas.length === 0 && !disponibles && <p className="ag-vacio">Todavía no lleva ninguna cuenta.</p>}
          {activas.map(c => (
            <div key={c.cuenta_id} className="mb-cuenta">
              <h3>{c.nombre || c.cuenta_id}</h3>
              {!c.tope_diario || !c.tope_mensual
                ? <p className="mb-falta"><ShieldAlert size={14} /> Sin topes no propone ninguna subida. Ponlos aquí.</p>
                : <p className="mb-resumen">Tope diario {eur(c.tope_diario)} · duro del día {eur(c.tope_duro_efectivo)} · mensual {eur(c.tope_mensual)}. Subidas de +{c.subida_max_pct ?? 20} % como mucho, cada {c.horas_entre_subidas ?? 72} h.</p>}
              <Topes c={c} puedeCambiar={puede} onGuardar={(t) => hacer(() => metaAdsApi.topes(clientId, t), 'Topes guardados.')} />
              {/* «Parar» está SIEMPRE: aunque haya una parada pendiente (p. ej. la
                  del vigilante por el tope del mes, que no deja reanudar hasta el
                  mes siguiente), alguien puede reactivar en Ads Manager y el freno
                  de HELM tiene que seguir a mano. */}
              {puede && (
                <div className="mb-botones">
                  <button type="button" className="ag-btn peligro sm" disabled={ocupado} onClick={() => window.confirm(`¿Parar YA todos los anuncios activos de ${c.nombre || c.cuenta_id}? Se guarda la lista para reanudar exactamente eso.`) && hacer(() => metaAdsApi.parar(clientId, c.cuenta_id), 'Anuncios parados.')}><ShieldAlert size={13} /> Parar los anuncios</button>
                  {c.parada && <button type="button" className="ag-btn sm" disabled={ocupado} onClick={() => hacer(() => metaAdsApi.reanudar(clientId, c.cuenta_id), 'Reanudado.')}><PlayCircle size={13} /> Reanudar lo que se paró ({c.parada.campanas} campañas)</button>}
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      {parte?.partes?.length > 0 && (
        <section className="mb-bloque">
          <h2 className="ag-seccion">El parte</h2>
          {parte.partes.map(p => (
            <div key={p.cuenta} className="mb-cuenta">
              <h3>{p.nombre || p.cuenta}{p.actualizado ? <small> · actualizado {fecha(p.actualizado)}</small> : null}</h3>
              <p className="mb-parte">{p.texto}</p>
            </div>
          ))}
          {parte.propuestas?.length > 0 && <p className="mb-resumen">{parte.propuestas.length} propuesta(s) del Media buyer esperan en la Bandeja.</p>}
        </section>
      )}

      {registro.length > 0 && (
        <section className="mb-bloque">
          <h2 className="ag-seccion"><ListChecks size={16} /> Lo que se ha hecho</h2>
          <ul className="mb-registro">
            {registro.map(r => (
              <li key={r.id}>
                <span className={`bj-estado ${r.estado === 'hecho' ? 'aplicada' : r.estado === 'fallido' ? 'fallida' : ''}`}>{r.estado}</span>
                <span className="bj-hecha-txt"><b>{ACCION[r.accion] || r.accion}</b> {r.objeto_nombre || r.objeto_id}{r.porque ? ` — ${r.porque}` : ''} <small>({fecha(r.creada_en)} · {r.quien})</small></span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
