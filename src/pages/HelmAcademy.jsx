// HELM ACADEMY — s4sf.net/helm-academy.
//
// El formulario de entrada al Skool: antes de ir a la comunidad, la persona
// deja sus datos (nombre, correo, a qué se dedica, edad, dónde vive, teléfono).
// Se guardan en el CRM de Silvestre AI (embudo «School», api/leads · school) y
// después se la redirige al Skool. Así Alex sabe quién se apuntó y puede
// cruzarlo con las solicitudes de /accesos para dar acceso a AI para todo.
import { useEffect, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { pideLead } from './leads.js'
import { origen } from './inicio/socio/origen.js'
import { track } from './inicio/socio/track.js'
import { useCabeceraPublica } from './inicio/cabecera.js'
import { SKOOL_URL } from './aiparatodo/config.jsx'
import './helmAcademy.css'

export default function HelmAcademy() {
  useCabeceraPublica({
    titulo: 'HELM Academy — la comunidad de Silvestre AI',
    descripcion: 'Entra gratis a HELM Academy. Déjanos tus datos y te llevamos a la comunidad.',
    imagen: '/inicio/og.jpg', colorBarra: '#2A0A13',
  })
  useEffect(() => { track('vista_pagina', { pagina: 'helm-academy' }) }, [])

  const [f, setF] = useState({ nombre: '', email: '', dedico: '', edad: '', residencia: '', telefono: '', website: '' })
  const [estado, setEstado] = useState(null)
  const [error, setError] = useState(null)
  const pon = (campo) => (e) => setF(s => ({ ...s, [campo]: e.target.value }))
  const completo = f.nombre.trim() && f.email.trim() && f.dedico.trim() && f.edad.trim() && f.residencia.trim() && f.telefono.trim()

  async function enviar(e) {
    e.preventDefault()
    if (!completo || estado === 'enviando') return
    setEstado('enviando'); setError(null)
    try {
      await pideLead('school', {
        nombre: f.nombre.trim(), email: f.email.trim(), dedico: f.dedico.trim(),
        edad: f.edad.trim(), residencia: f.residencia.trim(), telefono: f.telefono.trim(),
        website: f.website, origen: origen(),
      })
      track('lead', { donde: 'helm-academy' })
      // Al Skool. (replace: que el "atrás" del navegador no vuelva al formulario.)
      window.location.replace(SKOOL_URL)
    } catch (err) {
      setError(err.message); setEstado(null)
    }
  }

  return (
    <div className="ha">
      <main className="ha-card">
        <div className="ha-cab">
          <span className="ha-logo">HA</span>
          <div>
            <b>HELM Academy</b>
            <small>Comunidad gratis en Skool · Por Alex Silvestre</small>
          </div>
        </div>

        <h1>Entra a HELM Academy</h1>
        <p className="ha-lead">Déjanos tus datos y te llevamos dentro. Es gratis.</p>

        <form className="ha-form" onSubmit={enviar}>
          <input aria-label="Nombre" placeholder="Tu nombre" required value={f.nombre} maxLength={80} autoComplete="name" onChange={pon('nombre')} />
          <input aria-label="Correo" type="email" placeholder="Tu correo" required value={f.email} maxLength={160} autoComplete="email" inputMode="email" onChange={pon('email')} />
          <input aria-label="A qué te dedicas" placeholder="¿A qué te dedicas?" required value={f.dedico} maxLength={120} autoComplete="organization-title" onChange={pon('dedico')} />
          <div className="ha-fila">
            <input aria-label="Edad" placeholder="Edad" required value={f.edad} maxLength={3} inputMode="numeric" autoComplete="off" onChange={pon('edad')} />
            <input aria-label="Lugar de residencia" placeholder="¿Dónde vives?" required value={f.residencia} maxLength={120} autoComplete="address-level2" onChange={pon('residencia')} />
          </div>
          <input aria-label="Teléfono" type="tel" placeholder="Tu teléfono" required value={f.telefono} maxLength={40} autoComplete="tel" inputMode="tel" onChange={pon('telefono')} />
          {/* La trampa: fuera de la vista y del teclado; solo la rellena un bot. */}
          <input className="ha-trampa" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" value={f.website} onChange={pon('website')} />

          <button className="ha-btn" disabled={estado === 'enviando' || !completo}>
            {estado === 'enviando' ? 'Entrando…' : <>Entrar a HELM Academy <ArrowRight size={18} /></>}
          </button>
          {error && <p className="ha-error" role="alert">{error}</p>}
        </form>

        <p className="ha-legal">
          Usamos tus datos para darte acceso a la comunidad y enviarte contenido de Silvestre AI.
          Puedes darte de baja cuando quieras. <a href="/privacidad" target="_blank" rel="noopener noreferrer">Privacidad</a>
        </p>
      </main>
    </div>
  )
}
