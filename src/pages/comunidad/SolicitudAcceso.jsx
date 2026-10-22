// Solicitud de acceso a una comunidad con aprobación (AI para todo).
//
// Solo nombre y correo: no abre nada, deja la solicitud para que la apruebe el
// dueño (que comprueba, por el formulario de HELM Academy, quién se unió al
// Skool). Cuando está aprobada, la persona vuelve, pulsa «comprobar» y entra.
// Se usa suelto en la página /accesos y dentro de la puerta de un hilo.
import { useState } from 'react'
import { ArrowRight, Lock, Check } from 'lucide-react'
import { track } from '../inicio/socio/track.js'
import { solicitarAcceso, comprobarAcceso } from './crm.js'

export default function SolicitudAcceso({ cfg, onEntrar }) {
  const a = cfg.puerta.aprobacion
  const [f, setF] = useState({ nombre: '', email: '', website: '' })
  const [fase, setFase] = useState('form')          // form · enviando · pendiente · comprobando
  const [error, setError] = useState(null)
  const pon = (campo) => (e) => setF(s => ({ ...s, [campo]: e.target.value }))
  const completo = f.nombre.trim() && f.email.trim()

  async function pedir(e) {
    e.preventDefault()
    if (!completo || fase === 'enviando') return
    setFase('enviando'); setError(null)
    try {
      const r = await solicitarAcceso(cfg, { nombre: f.nombre, email: f.email, website: f.website })
      track('lead', { donde: cfg.clave, embudo: 'acceso' })
      if (r?.estado === 'aprobado') { onEntrar({ id: r.id, nombre: f.nombre.trim() }); return }
      setFase('pendiente')
    } catch (err) { setError(err.message); setFase('form') }
  }

  async function comprobar() {
    setFase('comprobando'); setError(null)
    try {
      const r = await comprobarAcceso(cfg, f.email)
      if (r?.estado === 'aprobado') { onEntrar({ id: r.id, nombre: f.nombre.trim() }); return }
      setError(a.pendiente.aun); setFase('pendiente')
    } catch (err) { setError(err.message); setFase('pendiente') }
  }

  if (fase === 'pendiente' || fase === 'comprobando') {
    return (
      <div className="aip-card aip-puerta aip-aprobada">
        <p className="aip-kicker"><Check size={13} /> solicitud enviada</p>
        <h2>{a.pendiente.titulo}</h2>
        <p>{a.pendiente.texto}</p>
        {a.skool && (
          <a className="aip-btn grande" href={a.skool}>{a.pendiente.skoolBoton} <ArrowRight size={18} /></a>
        )}
        <button type="button" className="aip-btn sec" onClick={comprobar} disabled={fase === 'comprobando'}>
          {fase === 'comprobando' ? 'Comprobando…' : a.pendiente.comprobar}
        </button>
        {error && <p className="aip-error" role="alert">{error}</p>}
      </div>
    )
  }

  return (
    <form className="aip-card aip-puerta" onSubmit={pedir}>
      <p className="aip-kicker"><Lock size={13} /> {a.kicker}</p>
      <h2>{a.titulo}</h2>
      <p>{a.texto}</p>
      <div className="aip-campos">
        <input aria-label="Nombre" placeholder="Tu nombre" required value={f.nombre} maxLength={80} autoComplete="given-name" onChange={pon('nombre')} />
        <input aria-label="Correo" type="email" placeholder="Tu correo" required value={f.email} maxLength={160} autoComplete="email" inputMode="email" onChange={pon('email')} />
        {/* La trampa: fuera de la vista y del teclado; solo la rellena un bot. */}
        <input className="aip-trampa" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" value={f.website} onChange={pon('website')} />
        <button className="aip-btn" disabled={fase === 'enviando' || !completo}>
          {fase === 'enviando' ? 'Enviando…' : <>{a.boton} <ArrowRight size={18} /></>}
        </button>
      </div>
      {error && <p className="aip-error" role="alert">{error}</p>}
      <p className="aip-legal">{a.legal}</p>
    </form>
  )
}
