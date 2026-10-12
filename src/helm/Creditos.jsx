// HELM — créditos de la agencia.
//
// Se paga por uso: la agencia compra créditos y la IA de HELM los gasta al
// trabajar para sus perfiles (en el panel, en el contenido automático y cuando
// el conector de Claude le pide algo a HELM). Lo que Claude haga en la cuenta
// del propio usuario no gasta créditos. Ver api/creditos.js.
//
// Aquí también vive el enlace del conector de Claude de la agencia entera: es
// de la agencia, como el saldo, no de un perfil.
import { useEffect, useState } from 'react'
import { Coins, Copy, Check } from 'lucide-react'
import { creditosApi } from './lib'
import { Modal, FormNote } from './ui'

const fmt = (n) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }).format(Math.floor(Number(n) || 0))
const fecha = (d) => new Date(d).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
const QUE = { recarga: 'Recarga', regalo: 'Regalo', ajuste: 'Ajuste', consumo: 'IA' }
const DONDE = { panel: 'panel', mcp: 'conector de Claude', auto: 'contenido automático' }

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

export default function Creditos({ onClose }) {
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
                Los gasta la IA de HELM cuando trabaja para tus perfiles: en el panel, en el contenido automático y
                cuando el conector de Claude le pide algo a HELM. Lo que Claude hace en tu propia cuenta no gasta
                créditos. 1 € = 100 créditos, sin cuota ni permanencia.
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
