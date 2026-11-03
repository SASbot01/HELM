// HELM ACADEMY — s4sf.net/helm-academy.
//
// El funnel de entrada al Skool. Antes de ir a la comunidad, la persona ve qué
// va a aprender y cómo puede vivir de ello, y deja sus datos: contacto (nombre,
// correo, teléfono, edad, dónde vive), a qué se dedica y tres preguntas de
// cualificación (a qué se quiere dedicar, cuánto quiere ganar, si ya usa la IA).
// Se guarda en el CRM de Silvestre AI (embudo «School», api/leads · school) y
// después se la redirige al Skool. Apuntarse da el acceso a AI para todo al
// momento: aquí ya se deja abierto en este navegador, y en cualquier otro basta
// con poner el mismo correo.
import { useEffect, useState } from 'react'
import { ArrowRight, Check } from 'lucide-react'
import { pideLead } from './leads.js'
import { origen } from './inicio/socio/origen.js'
import { track } from './inicio/socio/track.js'
import { useCabeceraPublica } from './inicio/cabecera.js'
import AIPT, { SKOOL_URL } from './aiparatodo/config.jsx'
import './helmAcademy.css'

// Las preguntas de cualificación son de seleccionar: así el equipo y los
// agentes leen valores fijos, no texto libre de internet.
const QUIERO = [
  'Crear contenido y vivir de ello',
  'Montar mi agencia o servicio con IA',
  'Automatizar y hacer crecer mi negocio',
  'Cambiar de profesión / nuevos ingresos',
  'Aún lo estoy decidiendo',
]
const INGRESO = [
  'Menos de 1.000 €/mes',
  '1.000 – 2.000 €/mes',
  '2.000 – 3.000 €/mes',
  '3.000 – 5.000 €/mes',
  'Más de 5.000 €/mes',
]
const USA_IA = [
  'Todavía no',
  'Un poco, a veces',
  'Sí, casi a diario',
  'Es mi herramienta principal',
]
const APRENDES = [
  'Sistemas y procesos con IA que puedes repetir, no trucos sueltos.',
  'Cómo convertirlo en ingresos: contenido, servicios o tu propio negocio.',
  'En español, sin humo y con datos encima de la mesa.',
]

export default function HelmAcademy() {
  useCabeceraPublica({
    titulo: 'HELM Academy — aprende a dirigir la IA y vive de ello',
    descripcion: 'Entra gratis a la comunidad de Alex Silvestre. Sistemas de IA en español para crear, facturar y crecer.',
    imagen: '/inicio/og.jpg', colorBarra: '#2A0A13',
  })
  useEffect(() => { track('vista_pagina', { pagina: 'helm-academy' }) }, [])

  const [f, setF] = useState({
    nombre: '', email: '', telefono: '', edad: '', residencia: '',
    dedico: '', quiero: '', ingreso: '', usa_ia: '', website: '',
  })
  const [estado, setEstado] = useState(null)
  const [error, setError] = useState(null)
  const pon = (campo) => (e) => setF(s => ({ ...s, [campo]: e.target.value }))
  const completo = f.nombre.trim() && f.email.trim() && f.telefono.trim() && f.edad.trim() &&
    f.residencia.trim() && f.dedico.trim() && f.quiero && f.ingreso && f.usa_ia

  async function enviar(e) {
    e.preventDefault()
    if (!completo || estado === 'enviando') return
    setEstado('enviando'); setError(null)
    try {
      const r = await pideLead('school', {
        nombre: f.nombre.trim(), email: f.email.trim(), telefono: f.telefono.trim(),
        edad: f.edad.trim(), residencia: f.residencia.trim(), dedico: f.dedico.trim(),
        quiero: f.quiero, ingreso: f.ingreso, usa_ia: f.usa_ia,
        website: f.website, origen: origen(),
      })
      track('lead', { donde: 'helm-academy' })
      // AI para todo, ya abierto en este navegador (la misma llave que la puerta).
      if (r?.id) {
        try { localStorage.setItem(AIPT.llave, JSON.stringify({ id: r.id, nombre: f.nombre.trim(), at: new Date().toISOString() })) } catch { /* incógnito */ }
      }
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

        {/* El funnel: qué vas a aprender y cómo vivir de ello, antes del formulario. */}
        <div className="ha-funnel">
          <img className="ha-foto" src="/inicio/alex-sinfondo.webp" alt="Alex Silvestre" width="264" height="264" loading="eager" />
          <h1>Aprende a <em>dirigir</em> la IA<br />y vive de ello</h1>
          <p className="ha-lead">
            No es otro curso de «prompts mágicos». Son sistemas reales de IA, en español,
            para crear contenido, montar tu servicio y facturar con ello.
          </p>
          <ul className="ha-aprendes">
            {APRENDES.map((t, i) => (
              <li key={i}><Check size={16} aria-hidden="true" /> <span>{t}</span></li>
            ))}
          </ul>
          <p className="ha-gratis">Entrar es <b>gratis</b>. Déjanos tus datos y te llevamos dentro.</p>
        </div>

        <form className="ha-form" onSubmit={enviar}>
          <input aria-label="Nombre" placeholder="Tu nombre" required value={f.nombre} maxLength={80} autoComplete="name" onChange={pon('nombre')} />
          <input aria-label="Correo" type="email" placeholder="Tu correo" required value={f.email} maxLength={160} autoComplete="email" inputMode="email" onChange={pon('email')} />
          <input aria-label="Teléfono" type="tel" placeholder="Tu teléfono" required value={f.telefono} maxLength={40} autoComplete="tel" inputMode="tel" onChange={pon('telefono')} />
          <div className="ha-fila">
            <input aria-label="Edad" placeholder="Edad" required value={f.edad} maxLength={3} inputMode="numeric" autoComplete="off" onChange={pon('edad')} />
            <input aria-label="Lugar de residencia" placeholder="¿Dónde vives?" required value={f.residencia} maxLength={120} autoComplete="address-level2" onChange={pon('residencia')} />
          </div>
          <input aria-label="A qué te dedicas" placeholder="¿A qué te dedicas ahora?" required value={f.dedico} maxLength={120} autoComplete="organization-title" onChange={pon('dedico')} />

          <Selector label="¿A qué te quieres dedicar?" value={f.quiero} onChange={pon('quiero')} opciones={QUIERO} />
          <Selector label="¿Cuánto quieres ganar al mes?" value={f.ingreso} onChange={pon('ingreso')} opciones={INGRESO} />
          <Selector label="¿Ya usas la IA para trabajar?" value={f.usa_ia} onChange={pon('usa_ia')} opciones={USA_IA} />

          {/* La trampa: fuera de la vista y del teclado; solo la rellena un bot. */}
          <input className="ha-trampa" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" value={f.website} onChange={pon('website')} />

          <button className="ha-btn" disabled={estado === 'enviando' || !completo}>
            {estado === 'enviando' ? 'Entrando…' : <>Entrar gratis a HELM Academy <ArrowRight size={18} /></>}
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

// Un desplegable con etiqueta flotante: la pregunta se queda arriba cuando hay
// respuesta, así se lee qué se eligió sin ocupar una fila aparte.
function Selector({ label, value, onChange, opciones }) {
  return (
    <label className={`ha-select${value ? ' lleno' : ''}`}>
      <span className="ha-select-lab">{label}</span>
      <select aria-label={label} required value={value} onChange={onChange}>
        <option value="" disabled>Elige una opción…</option>
        {opciones.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  )
}
