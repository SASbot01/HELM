// Las comunidades — la puerta de un hilo. Cada comunidad elige con su
// configuración qué pide para leer:
//
//   · solo datos (cfg.puerta.datos, sin cfg.cobro) — nombre, correo,
//     profesión y, si la comunidad los pide, ingresos, una vez; entran en el
//     CRM de su perfil y se abre todo. Es la de Filmmaking para todo (con
//     ingresos) y, desde el 20-10-2026, la de AI para todo (sin ellos).
//   · solo pago (cfg.cobro, sin datos) — el muro del Payment Link de Stripe,
//     que vuelve con ?pago=ok.
//   · las dos — primero los datos (el alta en el CRM no depende de que pague)
//     y después el muro, con el correo ya puesto en Stripe.
//
// El acceso se guarda en el navegador con la llave de cada comunidad
// (cfg.llave): pagar o dejar los datos en una no abre la otra. Solo lo que hace
// falta: la ficha, el nombre para saludar y, si hay muro, el correo para
// rellenarlo en Stripe. Ni la profesión ni los ingresos se quedan ahí.
import { useState } from 'react'
import { ArrowRight, Lock } from 'lucide-react'
import { track } from '../inicio/socio/track.js'
import { accesoGuardado, useComunidad } from './datos.js'
import { altaMiembro } from './crm.js'
import SolicitudAcceso from './SolicitudAcceso.jsx'

export default function Puerta({ setAcceso, pipeline, nota, titulo, texto, boton, inmediato, llave }) {
  const cfg = useComunidad()
  const llaveAcc = llave || cfg.llave
  const [lead, setLead] = useState(() => (cfg.cobro && cfg.puerta?.datos ? accesoGuardado(`${cfg.llave}.datos`) : null))
  // Acceso con aprobación (AI para todo): se pide (nombre y correo) y lo aprueba
  // el dueño. Solo el contenido general; los PDF (lead magnet) pasan `inmediato`
  // con su propia llave (`${cfg.llave}.pdf`) y abren solo el PDF, no el resto.
  if (cfg.puerta?.aprobacion && !inmediato && !cfg.cobro) {
    return (
      <SolicitudAcceso
        cfg={cfg}
        onEntrar={({ id, nombre }) => {
          const acc = { id: id || null, nombre, at: new Date().toISOString() }
          try { localStorage.setItem(llaveAcc, JSON.stringify(acc)) } catch { /* incógnito */ }
          setAcceso(acc)
        }}
      />
    )
  }
  if (!cfg.puerta?.datos) return <Muro titulo={titulo} />
  if (!cfg.cobro) {
    return (
      <Datos
        pipeline={pipeline} nota={nota} titulo={titulo} texto={texto} boton={boton}
        listo={(acc) => {
          try { localStorage.setItem(llaveAcc, JSON.stringify(acc)) } catch { /* modo incógnito */ }
          setAcceso(acc)
        }}
      />
    )
  }
  if (lead) return <Muro titulo={titulo} correo={lead.email} />
  return (
    <Datos
      pipeline={pipeline} nota={nota} titulo={titulo} texto={texto} boton={boton}
      listo={(acc) => {
        try { localStorage.setItem(`${cfg.llave}.datos`, JSON.stringify(acc)) } catch { /* modo incógnito */ }
        setLead(acc)
      }}
    />
  )
}

// ── El muro de pago ─────────────────────────────────────────────────────────
function Muro({ titulo, correo }) {
  const { cobro, privacidad } = useComunidad()
  const enlace = correo ? `${cobro.link}?prefilled_email=${encodeURIComponent(correo)}` : cobro.link
  return (
    <div className="aip-card aip-puerta aip-muro">
      <p className="aip-kicker"><Lock size={13} /> contenido para miembros</p>
      <h2>{titulo || cobro.titulo}</h2>
      <p>{cobro.incluye}</p>
      <div className="aip-precio">
        <span className="aip-precio-ahora">{cobro.precio.ahora}<small>{cobro.precio.periodo}</small></span>
        {cobro.precio.antes && <span className="aip-precio-antes">{cobro.precio.antes}</span>}
        {cobro.precio.nota && <span className="aip-precio-vida">{cobro.precio.nota}</span>}
      </div>
      {cobro.urgencia && <p className="aip-urgencia">{cobro.urgencia}</p>}
      <a className="aip-btn grande" href={enlace}>{`${cobro.boton} `}<ArrowRight size={18} /></a>
      <p className="aip-legal">{`${cobro.legal} `}<a href={privacidad}>Privacidad</a></p>
    </div>
  )
}

// ── Los datos ───────────────────────────────────────────────────────────────
// Nombre, correo, profesión y, si la comunidad los pide, ingresos. Los
// ingresos (y la profesión, si la comunidad da opciones) son botones: una
// pulsación, sin desplegables que en el móvil se abren a pantalla completa.
function Datos({ listo, pipeline, nota, titulo, texto, boton }) {
  const cfg = useComunidad()
  const d = cfg.puerta.datos
  const [f, setF] = useState({ nombre: '', email: '', profesion: '', ingresos: '', website: '' })
  const [estado, setEstado] = useState(null)
  const [error, setError] = useState(null)
  const pon = (campo) => (e) => setF(s => ({ ...s, [campo]: e.target.value }))
  const tramos = d.ingresos ? Object.entries(d.ingresos) : null
  const completo = f.nombre.trim() && f.email.trim() && f.profesion.trim() && (!tramos || f.ingresos)
  const profesiones = d.profesiones ? Object.entries(d.profesiones) : null

  async function entrar(e) {
    e.preventDefault()
    if (!completo) return
    setEstado('enviando'); setError(null)
    try {
      const nombre = f.nombre.trim(), email = f.email.trim(), profesion = f.profesion.trim()
      const lead = await altaMiembro(cfg, { nombre, email, profesion, ingresos: f.ingresos, pipeline, nota, website: f.website })
      // A las analíticas (y al píxel, en la versión suelta) solo va que hubo un
      // alta y por dónde: nunca los datos de la persona.
      track('lead', { donde: cfg.clave, embudo: pipeline })
      listo({ id: lead?.id || null, nombre, ...(cfg.cobro ? { email } : {}), at: new Date().toISOString() })
    } catch (err) {
      // En una comunidad gratis, si el servidor está saturado de altas (429),
      // se entra igual: el contenido es gratis y quien llega no tiene la culpa.
      // Ese alta no queda en el CRM.
      if (err.status === 429 && !cfg.cobro) {
        track('lead_sin_guardar', { donde: cfg.clave })
        listo({ id: null, nombre: f.nombre.trim(), at: new Date().toISOString() })
        return
      }
      setError(err.message); setEstado(null)
    }
  }

  return (
    <form className="aip-card aip-puerta" onSubmit={entrar}>
      <p className="aip-kicker"><Lock size={13} />{` ${d.kicker || 'contenido para miembros'}`}</p>
      <h2>{titulo || d.titulo}</h2>
      <p>{texto || d.texto}</p>
      <div className="aip-campos cuatro">
        <input aria-label="Nombre" placeholder="Tu nombre" required value={f.nombre} maxLength={80} autoComplete="given-name" onChange={pon('nombre')} />
        <input aria-label="Correo" type="email" placeholder="Tu correo" required value={f.email} maxLength={160} autoComplete="email" inputMode="email" onChange={pon('email')} />
        {/* La trampa: fuera de la vista y del teclado; solo la rellena un bot. */}
        <input className="aip-trampa" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" value={f.website} onChange={pon('website')} />
        {profesiones ? (
          <fieldset className="aip-ingresos">
            <legend>A qué te dedicas</legend>
            {profesiones.map(([valor, etiqueta], i) => (
              <label key={valor} className={[f.profesion === valor && 'on', profesiones.length % 2 && i === profesiones.length - 1 && 'ancho'].filter(Boolean).join(' ')}>
                <input type="radio" name="profesion" value={valor} aria-label={etiqueta} required checked={f.profesion === valor} onChange={pon('profesion')} />
                <span>{etiqueta}</span>
              </label>
            ))}
          </fieldset>
        ) : (
          <input className="ancho" aria-label="Profesión" placeholder={d.placeholderProfesion} required value={f.profesion} maxLength={120} autoComplete="organization-title" onChange={pon('profesion')} />
        )}
        {tramos && (
          <fieldset className="aip-ingresos">
            <legend>Tus ingresos al mes</legend>
            {tramos.map(([valor, etiqueta]) => (
              <label key={valor} className={f.ingresos === valor ? 'on' : ''}>
                <input type="radio" name="ingresos" value={valor} aria-label={etiqueta} required checked={f.ingresos === valor} onChange={pon('ingresos')} />
                <span>{etiqueta.replace('/mes', '')}</span>
              </label>
            ))}
          </fieldset>
        )}
        <button className="aip-btn" disabled={estado === 'enviando' || !completo}>
          {estado === 'enviando' ? 'Abriendo…' : <>{boton || d.boton} <ArrowRight size={18} /></>}
        </button>
      </div>
      {error && <p className="aip-error" role="alert">{error}</p>}
      <p className="aip-legal">{d.legal}</p>
    </form>
  )
}
