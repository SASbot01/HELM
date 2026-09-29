// PÁGINA DE LA BIO — s4sf.net, s4sf.net/paginainicio y s4sf.net/clase.
//
// Es el destino del enlace de la bio de Instagram: alguien ve un Reel, pulsa el
// enlace y aterriza aquí. Entre el 23 y el 28 de septiembre de 2026 la portada
// fue la página de Socio IA; ahora vuelve a ser esta, y Socio IA vive en
// /empresas, detrás del botón de «¿Eres una empresa o negocio?».
//
// Todo lo que hay en pantalla existe para que haga UNA de estas cosas:
//
//   1. Charla gratis             → deja nombre y correo, y se abre la
//                                  masterclass entera. El único sitio de la
//                                  página donde se pide algo.
//   2. Irse a YouTube            → donde se enseña a fondo.
//   3. ¿Eres una empresa o negocio? → /empresas, donde se vende HELM montado
//                                  y llevado por Alex.
//
// Instagram ya no tiene botón: quien llega aquí viene de Instagram. El handle
// sigue encima de la foto como firma.
//
// Hubo una masterclass en directo (28/08/2026). Ya se dio, así que en su sitio
// va la grabación —el mismo contenido sin fecha— detrás del formulario: el
// vídeo es lo que se regala, el correo es lo que se cobra por él. Cuando haya
// fecha nueva se recupera de git la sala de espera (asientos, cuenta atrás y
// enlace de calendario; su CSS sigue en inicio.css) y `./inicio/crm.js` no se
// toca: el alta de leads es la misma.
import { useEffect, useState } from 'react'
import { Youtube, Building2, ChevronRight, PlayCircle, Lock, Check } from 'lucide-react'
import { useCabeceraPublica } from './inicio/cabecera.js'
import { altaLead, marcaComunidad, contarApuntados } from './inicio/crm.js'
import { track } from './inicio/socio/track.js'
import FondoHacker from './inicio/FondoHacker.jsx'
import './inicio/inicio.css'

// Lo que se cambia cada dos por tres, junto y arriba: enlaces y handle.
const HANDLE = 'silvesttre.ia'
const YOUTUBE = 'https://www.youtube.com/@S4sf'
const INSTAGRAM = `https://www.instagram.com/${HANDLE}`
// La comunidad. El enlace NO se enseña antes de dejar el correo: un Discord
// abierto en la página se lleva a la gente sin que quede el email.
const COMUNIDAD = 'https://discord.gg/EbYATEK8n'
// La grabación de la masterclass, que es el premio del formulario.
// ⚠️ Apunta al canal mientras no esté el enlace del vídeo concreto: un enlace
// roto pierde a quien lo pulsa, y el canal al menos lo deja donde está todo.
const CLASE = 'https://www.youtube.com/@S4sf'
// Con qué se anota en el CRM quién pidió esta clase. Va en las notas del
// contacto, igual que se anotaba el directo, para poder distinguir luego a
// quien vino por la grabación de quien vino por otra cosa.
const CLASE_ETIQUETA = 'Pidió la clase gratuita (grabación masterclass)'

// Quien ya dejó el correo no lo vuelve a dejar. Se guarda en el navegador
// porque no hay sesión que consultar en una página pública, y pedirle los datos
// otra vez a quien ya los dio es la forma más rápida de que cierre la pestaña.
const LLAVE = 's4sf.clase'

function accesoGuardado() {
  try {
    const crudo = localStorage.getItem(LLAVE)
    return crudo ? JSON.parse(crudo) : null
  } catch {
    return null   // modo incógnito o cookies bloqueadas: se pide el correo y ya
  }
}

function guardaAcceso(acceso) {
  try { localStorage.setItem(LLAVE, JSON.stringify(acceso)) } catch { /* da igual */ }
}

const TITULO = 'Alex Silvestre — Aprende a dirigir la IA, no solo a usarla'
const DESCRIPCION = 'IA aplicada en español, sin humo y con datos. Mira la masterclass gratis.'

export default function Clase() {
  useCabeceraPublica({
    titulo: TITULO, descripcion: DESCRIPCION,
    imagen: '/inicio/og.jpg', colorBarra: '#2A0A13',
  })

  const [acceso, setAcceso] = useState(accesoGuardado)
  // El formulario vive DENTRO del botón de la charla: no se ve hasta que se
  // pulsa, y se despliega justo debajo. Una página de enlaces con un formulario
  // siempre abierto al final parecía pedir el correo antes de ofrecer nada.
  const [abierta, setAbierta] = useState(false)
  useEffect(() => {
    track('vista_pagina', { pagina: 'clase' })
    // Su tipografía se carga solo aquí: la principal no la usa y no tiene por
    // qué pagarla.
    const l = document.createElement('link')
    l.rel = 'stylesheet'
    l.href = 'https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700;800&display=swap'
    document.head.appendChild(l)
    return () => l.remove()
  }, [])

  // El botón primario no abre el vídeo: despliega el formulario debajo, que
  // es donde se hace lo que promete. Abrir otra pestaña para pedir el correo
  // pierde a la mitad por el camino. Pulsarlo otra vez lo recoge.
  const alFormulario = () => {
    if (abierta) { setAbierta(false); return }
    setAbierta(true)
    track('clic_cta', { donde: 'bio-charla' })
    setTimeout(() => document.getElementById('clase')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60)
    // El foco, además del scroll: en el móvil abre el teclado y deja claro que
    // hay que escribir. Sin esto, el salto parece que no ha hecho nada.
    setTimeout(() => document.getElementById('clase-email')?.focus({ preventScroll: true }), 420)
  }

  return (
    <div className="ini ini--pantera">
      <main className="ini-card">
        {/* El handle va DENTRO de la foto, arriba a la izquierda: es la firma
            de la cuenta y lo primero que reconoce quien llega de Instagram. */}
        <div className="ini-marco">
          <a className="ini-handle" href={INSTAGRAM} target="_blank" rel="noopener noreferrer">
            @{HANDLE}
          </a>
          <img
            className="ini-foto"
            src="/inicio/alex.jpg"
            alt="Alex Silvestre"
            width="1100" height="1338"
            // La foto ocupa media pantalla y es lo primero que se ve: cargarla
            // perezosa sería dejar un hueco gris justo donde mira todo el mundo.
            fetchPriority="high"
          />
        </div>

        <div className="ini-nombre">
          <b>Alex Silvestre</b>
          <span>IA aplicada, en español</span>
        </div>

        <h1>Aprende a <em>dirigir</em> la IA,<br />no solo a usarla</h1>

        <p className="ini-lead">
          Sin humo: sistemas y procesos que puedes repetir, con datos encima de la mesa.
          De la base a la práctica, y de la práctica a vivir de ello.
        </p>

        <div className="ini-dato">
          <b>+90.000 leads</b> generados con estas metodologías
        </div>

        <div className="ini-sep">Empieza aquí</div>

        <div className="ini-botones">
          {/* El primario. Para quien ya dejó el correo es el enlace directo:
              hacerle pasar dos veces por la misma puerta solo le enfada. */}
          {acceso ? (
            <a className="ini-btn on" href={CLASE} target="_blank" rel="noopener noreferrer">
              <span className="ini-btn-icono"><PlayCircle size={20} /></span>
              <span className="ini-btn-txt">
                <b>Charla gratis</b>
                <small>Ya tienes acceso — la clase entera, una hora</small>
              </span>
              <ChevronRight className="ini-flecha" size={20} />
            </a>
          ) : (
            <button className="ini-btn on" onClick={alFormulario} aria-expanded={abierta} aria-controls="clase">
              <span className="ini-btn-icono"><PlayCircle size={20} /></span>
              <span className="ini-btn-txt">
                <b>Charla gratis</b>
                <small>Una hora de clase · solo tu nombre y tu correo</small>
              </span>
              <ChevronRight className={'ini-flecha' + (abierta ? ' abierta' : '')} size={20} />
            </button>
          )}
          {!acceso && abierta && <PuertaClase acceso={acceso} setAcceso={setAcceso} />}

          <a className="ini-btn" href={YOUTUBE} target="_blank" rel="noopener noreferrer">
            <span className="ini-btn-icono"><Youtube size={20} /></span>
            <span className="ini-btn-txt">
              <b>Mi canal de YouTube</b>
              <small>La serie larga, paso a paso y sin paja</small>
            </span>
            <ChevronRight className="ini-flecha" size={20} />
          </a>

          <a
            className="ini-btn"
            href="/empresas"
            onClick={() => track('clic_cta', { donde: 'bio-empresa' })}
          >
            <span className="ini-btn-icono"><Building2 size={20} /></span>
            <span className="ini-btn-txt">
              <b>¿Eres una empresa o negocio?</b>
              <small>Monto y llevo HELM, el sistema que vende por ti</small>
            </span>
            <ChevronRight className="ini-flecha" size={20} />
          </a>
        </div>

        {/* Con el correo ya dejado, la sala de la clase va aquí abajo. */}
        {acceso && <PuertaClase acceso={acceso} setAcceso={setAcceso} />}

        <p className="ini-pie">
          © {new Date().getFullYear()} Alex Silvestre · IA aplicada
        </p>
      </main>
      {/* Detrás de todo en escritorio; al final de la página en el móvil. */}
      <FondoHacker />
    </div>
  )
}

// El logo de Discord va a mano: lucide quitó las marcas de su catálogo en la
// 0.297 y este botón necesita el símbolo de verdad. Con un icono genérico de
// "chat" nadie reconoce a dónde va, y un botón que no se entiende no se pulsa.
function IconoDiscord() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189z" />
    </svg>
  )
}

// ── La puerta de la clase ───────────────────────────────────────────────────
// Dos campos y ni uno más. Cada campo extra se paga en gente que no lo rellena,
// y para mandar la siguiente masterclass por correo hace falta exactamente el
// correo.
function PuertaClase({ acceso, setAcceso }) {
  const [f, setF] = useState({ nombre: '', email: '' })
  const [estado, setEstado] = useState(null)   // null | 'enviando' | 'warp'
  const [error, setError] = useState(null)
  const [apuntados, setApuntados] = useState(null)

  // Cuánta gente la ha pedido ya, una sola vez al abrirse: es decorativo
  // (social proof), no un contador en vivo que justifique reconsultarlo.
  useEffect(() => {
    if (acceso) contarApuntados(CLASE_ETIQUETA).then(setApuntados)
  }, [acceso])

  async function enviar(e) {
    e.preventDefault()
    setEstado('enviando'); setError(null)
    try {
      const nombre = f.nombre.trim()
      const lead = await altaLead({ ...f, nombre, evento: CLASE_ETIQUETA })
      const nuevo = { id: lead?.id || null, nombre }
      guardaAcceso(nuevo)
      // El instante de después de pulsar es donde más se pierde conversión
      // emocional. El portal dura 1.1s: lo justo para sentirse un salto, no
      // una espera.
      setEstado('warp')
      setTimeout(() => {
        setAcceso(nuevo); setEstado(null)
        // La sala se pinta abajo del todo, no donde estaba el formulario: se
        // lleva a la persona hasta ella para que no se quede sin ver la clase.
        setTimeout(() => document.getElementById('clase')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
      }, 1100)
    } catch (err) {
      setError(err.message)
      setEstado(null)
    }
  }

  if (estado === 'warp') {
    return (
      <div className="ini-warp" id="clase">
        <span className="ini-warp-anillo" />
        <span className="ini-warp-anillo" style={{ animationDelay: '.12s' }} />
        <span className="ini-warp-anillo" style={{ animationDelay: '.24s' }} />
        <span className="ini-warp-texto">Abriendo tu clase…</span>
      </div>
    )
  }

  // Con el correo dejado, la clase. El vídeo NO se abre solo al confirmar: el
  // alta va por red y para cuando responde ya no hay gesto del usuario que
  // valga, así que el navegador bloquearía la pestaña y la persona se quedaría
  // mirando una confirmación sin clase. Se abre con este botón, que es un clic
  // más y ninguna sorpresa.
  if (acceso) {
    const nombre = acceso.nombre || 'invitado/a'
    return (
      <div className="ini-sala" id="clase">
        <div className="ini-sala-foco" />

        <div className="ini-sala-panel">
          <div className="ini-sala-cab">
            <span className="ini-sala-check"><Check size={15} /></span>
            <span>Acceso abierto</span>
          </div>

          <h2 className="ini-sala-bienvenida">Toda tuya, <em>{nombre}</em> 👋</h2>
          <p className="ini-sala-sub">
            {apuntados != null && apuntados > 1 ? `Ya la han visto ${apuntados} personas. ` : ''}
            Una hora entera, sin recortes. Esto es lo que hay dentro:
          </p>

          <ul className="ini-agenda">
            <li>
              <span className="ini-agenda-n">01</span>
              <span>Pasar de <em>usar</em> IA a <em>dirigirla</em>: sistemas y procesos que se repiten</span>
            </li>
            <li>
              <span className="ini-agenda-n">02</span>
              <span>Todo el potencial de Claude y otras IAs para crear tus sistemas — y cómo se controlan</span>
            </li>
            <li>
              <span className="ini-agenda-n">03</span>
              <span>El plan real: de la base a la práctica, y de la práctica a vivir de ello</span>
            </li>
          </ul>

          <a className="ini-btn on grande" href={CLASE} target="_blank" rel="noopener noreferrer">
            <span className="ini-btn-icono"><PlayCircle size={20} /></span>
            <span className="ini-btn-txt">
              <b>Ver la clase ahora</b>
              <small>La masterclass entera, sin cortes</small>
            </span>
            <ChevronRight className="ini-flecha" size={20} />
          </a>

          <a
            className="ini-btn discord"
            href={COMUNIDAD}
            target="_blank"
            rel="noopener noreferrer"
            // Se anota al vuelo y sin `await`: el navegador ya está abriendo
            // Discord en otra pestaña y no se le hace esperar por una fila.
            onClick={() => marcaComunidad(acceso.id)}
          >
            <span className="ini-btn-icono"><IconoDiscord /></span>
            <span className="ini-btn-txt">
              <b>Entrar en la comunidad</b>
              <small>El Discord donde se resuelven dudas y se avisa del próximo directo</small>
            </span>
            <ChevronRight className="ini-flecha" size={20} />
          </a>
        </div>
      </div>
    )
  }

  return (
    <form className="ini-lista" id="clase" onSubmit={enviar}>
      <div className="ini-lista-cab">
        <Lock size={16} />
        <b>Dime a dónde te la mando y la abro</b>
      </div>
      <p className="ini-lista-cuando">Masterclass completa · 1 hora · gratis</p>
      <p>Nombre y correo, nada más. Te llega también el aviso de la siguiente en directo.</p>
      <input
        type="text" placeholder="Tu nombre" value={f.nombre} maxLength={80}
        autoComplete="given-name"
        onChange={e => setF(s => ({ ...s, nombre: e.target.value }))}
      />
      <input
        id="clase-email"
        type="email" placeholder="Tu email" value={f.email} required maxLength={160}
        autoComplete="email" inputMode="email"
        onChange={e => setF(s => ({ ...s, email: e.target.value }))}
      />
      <button className="ini-btn on" disabled={estado === 'enviando' || !f.email.trim()}>
        <b>{estado === 'enviando' ? 'Un momento…' : 'Ver la charla gratis'}</b>
      </button>
      {error && <span className="ini-error">{error}</span>}
    </form>
  )
}
