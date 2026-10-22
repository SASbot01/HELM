// HELM — las solicitudes de acceso con aprobación (AI para todo).
//
// Llegan por la puerta de la web (api/leads · solicitar-acceso) y quedan como
// contactos del perfil en «pendiente». Aquí Alex las ve y las aprueba o
// rechaza (api/accesos). Al aprobar, la persona entra en la web con su mismo
// correo; si hay correo saliente configurado se le avisa, y si no, aquí sale el
// enlace para pasárselo a mano.
import { useState } from 'react'
import { Check, X, Loader2, Inbox, Copy } from 'lucide-react'
import { accesosApi } from './lib'
import { FormNote } from './ui'

const fecha = (iso) => (iso ? new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : '')

export default function AccesosRecibidos({ accesos, fallo, onCambio }) {
  const [obrando, setObrando] = useState(null)   // id de la solicitud en proceso
  const [error, setError] = useState(null)
  const [hecho, setHecho] = useState(null)       // { email, url, correo } de la última aprobada
  const [copiado, setCopiado] = useState(false)

  async function decidir(a, accion) {
    setObrando(a.id); setError(null)
    try {
      const r = await accesosApi[accion](a.id)
      setHecho(accion === 'aprobar' ? { email: a.email, url: r.enlace, correo: r.correo } : null)
      onCambio?.()
    } catch (e) {
      setError(e.message || 'No se ha podido.')
    } finally {
      setObrando(null)
    }
  }

  function copiar(url) {
    try { navigator.clipboard?.writeText(url) } catch { /* sin portapapeles */ }
    setCopiado(true); setTimeout(() => setCopiado(false), 1500)
  }

  const lista = accesos || []

  return (
    <div className="helm-accesos">
      <FormNote>{fallo || error}</FormNote>

      {hecho && (
        <div className="helm-acc-ok">
          <Check size={15} />
          <span>
            Aprobado <b>{hecho.email}</b>.{' '}
            {hecho.correo?.enviado
              ? 'Le he mandado el correo con el enlace.'
              : 'Pásale este enlace para entrar con su correo:'}
          </span>
          {!hecho.correo?.enviado && hecho.url && (
            <button type="button" className="helm-btn sm" onClick={() => copiar(hecho.url)}>
              {copiado ? <><Check size={13} /> Copiado</> : <><Copy size={13} /> Copiar enlace</>}
            </button>
          )}
        </div>
      )}

      {lista.length === 0 && !fallo ? (
        <p className="helm-acc-vacio"><Inbox size={16} /> No hay solicitudes pendientes.</p>
      ) : (
        <ul className="helm-acc-lista">
          {lista.map(a => (
            <li key={a.id}>
              <div className="helm-acc-quien">
                <b>{a.nombre || a.email}</b>
                <small>{a.email}{a.solicitado ? ` · pidió el ${fecha(a.solicitado)}` : ''}</small>
              </div>
              <div className="helm-acc-acciones">
                <button type="button" className="helm-btn sm" disabled={obrando === a.id} onClick={() => decidir(a, 'aprobar')}>
                  {obrando === a.id ? <Loader2 size={13} className="helm-acc-girando" /> : <Check size={13} />} Aprobar
                </button>
                <button type="button" className="helm-btn sm ghost" disabled={obrando === a.id} onClick={() => decidir(a, 'rechazar')}>
                  <X size={13} /> Rechazar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
