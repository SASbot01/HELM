// Entrada a una comunidad con solo el correo (AI para todo).
//
// Desde el 27-10-2026 no se pide acceso ni se aprueba a mano: quien rellena el
// formulario de HELM Academy (/helm-academy) queda con el acceso dado en el CRM,
// y aquí basta con poner ese mismo correo. Si el correo no está, se le manda al
// formulario. Se usa suelta en la página /accesos y dentro de la puerta de un hilo.
import { useState } from 'react'
import { ArrowRight, Lock } from 'lucide-react'
import { track } from '../inicio/socio/track.js'
import { comprobarAcceso } from './crm.js'

export default function EntradaPorCorreo({ cfg, onEntrar }) {
  const a = cfg.puerta.aprobacion
  const [email, setEmail] = useState('')
  const [fase, setFase] = useState('form')          // form · comprobando · no-esta
  const [error, setError] = useState(null)

  async function entrar(e) {
    e.preventDefault()
    if (!email.trim() || fase === 'comprobando') return
    setFase('comprobando'); setError(null)
    try {
      const r = await comprobarAcceso(cfg, email)
      if (r?.estado === 'aprobado') {
        track('lead', { donde: cfg.clave, embudo: 'entrada-correo' })
        onEntrar({ id: r.id, nombre: '' })
        return
      }
      setFase('no-esta')
    } catch (err) { setError(err.message); setFase('form') }
  }

  return (
    <form className="aip-card aip-puerta" onSubmit={entrar}>
      <p className="aip-kicker"><Lock size={13} /> {a.kicker}</p>
      <h2>{a.titulo}</h2>
      <p>{a.texto}</p>
      <div className="aip-campos">
        <input
          aria-label="Correo" type="email" placeholder="Tu correo" required value={email} maxLength={160}
          autoComplete="email" inputMode="email" onChange={(e) => { setEmail(e.target.value); if (fase === 'no-esta') setFase('form') }}
        />
        <button className="aip-btn" disabled={fase === 'comprobando' || !email.trim()}>
          {fase === 'comprobando' ? 'Comprobando…' : <>{a.boton} <ArrowRight size={18} /></>}
        </button>
      </div>
      {fase === 'no-esta' ? (
        <div className="aip-no-esta" role="status">
          <p>{a.noEsta}</p>
          <a className="aip-btn grande" href={a.skool}>{a.skoolBoton} <ArrowRight size={18} /></a>
        </div>
      ) : (
        <a className="aip-skool-paso" href={a.skool}>{a.skoolEnlace} <ArrowRight size={15} /></a>
      )}
      {error && <p className="aip-error" role="alert">{error}</p>}
      <p className="aip-legal">{a.legal}</p>
    </form>
  )
}
