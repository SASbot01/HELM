// El formulario de cualificación: el corazón de la página.
//
// Una pregunta por pantalla y con barra de progreso: en el móvil, cinco
// preguntas a la vista asustan; una sola se contesta sin pensar. Las de
// opciones avanzan solas al tocar (un toque = un paso).
//
// Lógica de encaje (sección 5.8 del brief):
//   precio < 1.000 €  o  sin resultados  →  no encaja → a la clase gratis
//   todo lo demás                         →  encaja    → calendario
// Se guardan TODOS los envíos en el CRM, encajen o no (ver crm.js · altaSocio).
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check } from 'lucide-react'
import { altaSocio } from './crm.js'
import { track } from './track.js'
import { varianteTitular, LLAVE_SESION } from './config.js'
import Calendario from './Calendario.jsx'

const PRECIOS = [
  { v: 'menos-1000', t: 'Menos de 1.000 €' },
  { v: '1000-3000', t: 'Entre 1.000 y 3.000 €' },
  { v: 'mas-3000', t: 'Más de 3.000 €' },
]
const FACTURACION = [
  { v: '0', t: 'Todavía nada' },
  { v: 'hasta-5000', t: 'Hasta 5.000 €' },
  { v: '5000-20000', t: 'Entre 5.000 y 20.000 €' },
  { v: 'mas-20000', t: 'Más de 20.000 €' },
]
const RESULTADOS = [
  { v: 'si', t: 'Sí, tengo casos' },
  { v: 'todavia-no', t: 'Todavía no' },
]

const TOTAL = 5
const encaja = (r) => r.precio !== 'menos-1000' && r.resultados === 'si'

export default function Formulario() {
  const [paso, setPaso] = useState(1)
  const [r, setR] = useState({ que_vende: '', precio: '', facturacion: '', resultados: '', nombre: '', email: '', instagram: '', rgpd: false })
  const [estado, setEstado] = useState(null)       // null | 'enviando'
  const [error, setError] = useState(null)
  const [fallos, setFallos] = useState(0)
  const [final, setFinal] = useState(null)         // null | 'encaja' | 'no-encaja'
  const caja = useRef(null)
  const primeraVez = useRef(true)

  useEffect(() => {
    if (final) return
    track('paso_formulario', { paso })
    // Al cambiar de paso, el foco va a la pregunta nueva (lectores de pantalla
    // y teclado); la primera vez no, que robaría el scroll al cargar la página.
    if (primeraVez.current) { primeraVez.current = false; return }
    caja.current?.querySelector('input, button.so-op')?.focus({ preventScroll: true })
  }, [paso, final])

  const set = (campo, valor) => setR(s => ({ ...s, [campo]: valor }))
  const elige = (campo, valor) => { set(campo, valor); setPaso(p => p + 1) }

  async function enviar(e) {
    e.preventDefault()
    const va = encaja(r)
    setEstado('enviando'); setError(null)
    try {
      const { id } = await altaSocio({ respuestas: r, encaja: va, titular: varianteTitular() })
      try { sessionStorage.setItem(LLAVE_SESION, JSON.stringify({ id, encaja: va })) } catch { /* da igual */ }
      termina(va)
    } catch (err) {
      // Dos fallos seguidos y sigue igual: si encaja, el calendario recoge sus
      // datos de todas formas, y bloquearle aquí sería perderle seguro.
      if (fallos >= 1) { termina(va); return }
      setFallos(n => n + 1)
      setError(`${err.message} Si vuelve a fallar, sigo sin guardarlo.`)
      setEstado(null)
    }
  }

  function termina(va) {
    track(va ? 'encaja' : 'no_encaja', { precio: r.precio, facturacion: r.facturacion, resultados: r.resultados })
    setFinal(va ? 'encaja' : 'no-encaja')
    setEstado(null)
    setTimeout(() => caja.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }

  const alReservar = useCallback(() => { window.location.assign('/gracias') }, [])

  if (final === 'encaja') {
    return (
      <div className="so-form" ref={caja}>
        <div className="so-form-ok"><Check size={18} /> Encajas. Elige hora.</div>
        <h3 className="so-form-q">Reserva tu auditoría de 30 minutos</h3>
        <p className="so-form-ayuda">Miramos tu producto, cómo vendes hoy y dónde se te escapa la gente.</p>
        <Calendario nombre={r.nombre} email={r.email} alReservar={alReservar} />
      </div>
    )
  }

  if (final === 'no-encaja') {
    const motivo = r.precio === 'menos-1000'
      ? 'Socio IA está pensado para productos de 1.000 € o más: por debajo, el porcentaje no da para llevar el sistema bien.'
      : 'Para montar el sistema necesito casos o resultados que enseñar: son lo que vende.'
    return (
      <div className="so-form" ref={caja}>
        <h3 className="so-form-q">Ahora mismo no encajas en Socio IA, pero esto te sirve</h3>
        <p className="so-form-ayuda">{motivo}</p>
        <p className="so-form-ayuda">
          Mientras tanto, la charla gratis te enseña a montar la base tú. Cuando lo
          tengas, vuelve y lo hablamos.
        </p>
        <a className="so-btn" href="/clase" onClick={() => track('clic_cta', { donde: 'no-encaja-clase' })}>
          Ver la charla gratis <ArrowRight size={20} />
        </a>
      </div>
    )
  }

  return (
    <div className="so-form" ref={caja}>
      <div className="so-progreso" role="progressbar" aria-valuemin={1} aria-valuemax={TOTAL} aria-valuenow={paso} aria-label={`Paso ${paso} de ${TOTAL}`}>
        <span style={{ width: `${(paso / TOTAL) * 100}%` }} />
      </div>
      <div className="so-form-cab">
        {paso > 1
          ? <button type="button" className="so-atras" onClick={() => setPaso(p => p - 1)}><ArrowLeft size={16} /> Atrás</button>
          : <span />}
        <span>Paso {paso} de {TOTAL}</span>
      </div>

      {paso === 1 && (
        <form onSubmit={(e) => { e.preventDefault(); if (r.que_vende.trim()) setPaso(2) }}>
          <label className="so-form-q" htmlFor="q-vende">¿Qué vendes?</label>
          <p className="so-form-ayuda">En una línea. Ej.: «formación de fotografía de bodas».</p>
          <input
            id="q-vende" className="so-input" type="text" maxLength={140} autoComplete="off"
            placeholder="Tu producto o servicio" value={r.que_vende}
            onChange={e => set('que_vende', e.target.value)}
          />
          <button className="so-btn" disabled={!r.que_vende.trim()}>Siguiente <ArrowRight size={20} /></button>
        </form>
      )}

      {paso === 2 && (
        <Opciones pregunta="¿Cuánto cuesta?" opciones={PRECIOS} valor={r.precio} onElige={v => elige('precio', v)} />
      )}
      {paso === 3 && (
        <Opciones pregunta="¿Cuánto facturas al mes ahora?" opciones={FACTURACION} valor={r.facturacion} onElige={v => elige('facturacion', v)} />
      )}
      {paso === 4 && (
        <Opciones pregunta="¿Tienes casos o resultados de clientes?" opciones={RESULTADOS} valor={r.resultados} onElige={v => elige('resultados', v)} />
      )}

      {paso === 5 && (
        <form onSubmit={enviar}>
          <p className="so-form-q">¿A quién le escribo?</p>
          <label className="so-label" htmlFor="q-nombre">Nombre</label>
          <input id="q-nombre" className="so-input" type="text" required maxLength={80} autoComplete="given-name"
            value={r.nombre} onChange={e => set('nombre', e.target.value)} />
          <label className="so-label" htmlFor="q-email">Correo</label>
          <input id="q-email" className="so-input" type="email" required maxLength={160} autoComplete="email" inputMode="email"
            value={r.email} onChange={e => set('email', e.target.value)} />
          <label className="so-label" htmlFor="q-ig">Instagram</label>
          <input id="q-ig" className="so-input" type="text" required maxLength={60} autoComplete="off" autoCapitalize="none"
            placeholder="@tucuenta" value={r.instagram} onChange={e => set('instagram', e.target.value)} />

          <label className="so-rgpd">
            <input type="checkbox" required checked={r.rgpd} onChange={e => set('rgpd', e.target.checked)} />
            <span>
              Acepto la <a href="/privacidad" target="_blank" rel="noopener noreferrer">política de privacidad</a>.
              Uso tus datos solo para valorar si encajas y contactarte sobre la auditoría.
            </span>
          </label>

          <button className="so-btn" disabled={estado === 'enviando' || !r.rgpd}>
            {estado === 'enviando' ? 'Un momento…' : <>Ver si encajo <ArrowRight size={20} /></>}
          </button>
          {error && <p className="so-error" role="alert">{error}</p>}
        </form>
      )}
    </div>
  )
}

function Opciones({ pregunta, opciones, valor, onElige }) {
  return (
    <fieldset className="so-ops">
      <legend className="so-form-q">{pregunta}</legend>
      {opciones.map(o => (
        <button type="button" key={o.v} className={`so-op${valor === o.v ? ' on' : ''}`} onClick={() => onElige(o.v)}>
          <span className="so-hex" aria-hidden="true" />
          {o.t}
        </button>
      ))}
    </fieldset>
  )
}
