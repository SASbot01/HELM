// PÁGINA INICIO — la cara pública de la marca personal de Alex Silvestre.
//
//   www.s4sf.net/paginainicio
//
// Es el destino del enlace de la bio de Instagram: alguien ve un Reel, pulsa el
// enlace y aterriza aquí. Todo lo que hay en pantalla existe para que haga UNA
// de estas cosas, por este orden de valor:
//
//   1. Apuntarse a la masterclass → entra en el CRM con fecha y hora, y de ahí
//      directo al Discord de la comunidad.
//   2. Irse a YouTube             → donde se enseña a fondo.
//   3. Seguir en Instagram        → el contacto más barato y el más frágil.
//
// La masterclass manda sobre YouTube mientras haya fecha: un directo tiene día
// y hora, y lo que caduca va primero. Cuando pase, el sitio de honor vuelve a
// ser la serie de YouTube — se cambia en MASTERCLASS, aquí abajo.
import { useEffect, useState } from 'react'
import { Youtube, Instagram, ChevronRight, Radio, Check, CalendarClock, Armchair, User } from 'lucide-react'
import { useCabeceraPublica } from './inicio/cabecera.js'
import { altaLead, marcaComunidad, contarApuntados } from './inicio/crm.js'
import './inicio/inicio.css'

// Lo que se cambia cada dos por tres, junto y arriba: enlaces, handle y la
// próxima sesión en directo.
const HANDLE = 'silvesttre.ia'
const YOUTUBE = 'https://www.youtube.com/@S4sf'
const INSTAGRAM = `https://www.instagram.com/${HANDLE}`
// La comunidad. El enlace NO se enseña antes de dejar el email: un Discord
// abierto en la página se lleva a la gente sin que quede el correo, y entonces
// no hay a quién avisar del directo.
const COMUNIDAD = 'https://discord.gg/EbYATEK8n'

const TITULO = 'Alex Silvestre — Aprende a dirigir la IA, no solo a usarla'
const DESCRIPCION = 'IA aplicada en español, sin humo y con datos. Apúntate a la masterclass gratis.'

const MASTERCLASS = {
  cuando: 'Viernes 28 de agosto · 20:00',
  corto: '28 ago · 20:00',
  // Lo que se guarda con el lead en el CRM, para saber a qué sesión se apuntó
  // cuando haya habido cuatro.
  etiqueta: 'Masterclass 28/08/2026 20:00',
  // 20:00 de Madrid en agosto es CEST, UTC+2 → 18:00 UTC. Es la única fecha
  // que se declara: la cuenta atrás y el enlace de calendario salen de aquí,
  // no de una segunda copia que se pueda desincronizar de `cuando`.
  cuandoISO: '2026-08-28T18:00:00Z',
}

// La disposición de la sala: filas × asientos, y en cuál de todos se sienta
// quien acaba de entrar. Fija (no aleatoria) para que el pop-in del "tuyo" se
// pueda cronometrar contra el resto de la animación sin sorpresas.
const SALA_FILAS = 4
const SALA_POR_FILA = 5
const SALA_TU_ASIENTO = 12   // fila 3, más o menos centrado — ni la primera fila ni el fondo

// El enlace de "añadir a mi calendario". Una hora de duración, sin preguntar:
// es una masterclass, no hace falta que nadie decida cuánto dura la suya.
function enlaceCalendario() {
  const inicio = new Date(MASTERCLASS.cuandoISO)
  const fin = new Date(inicio.getTime() + 60 * 60 * 1000)
  const utc = (d) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: 'Masterclass gratis · Alex Silvestre',
    dates: `${utc(inicio)}/${utc(fin)}`,
    details: 'Aprende a dirigir la IA, no solo a usarla.',
  })
  return `https://calendar.google.com/calendar/render?${params}`
}

export default function PaginaInicio() {
  useCabeceraPublica({
    titulo: TITULO, descripcion: DESCRIPCION,
    imagen: '/inicio/og.jpg', colorBarra: '#2A0A13',
  })

  // El botón de la masterclass no lleva a ningún sitio: baja al formulario, que
  // es donde se hace lo que promete. Un botón que abre otra pestaña para pedir
  // el correo pierde a la mitad por el camino.
  const alFormulario = () => {
    document.getElementById('lista')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    // El foco, además del scroll: en el móvil abre el teclado y deja claro que
    // hay que escribir. Sin esto, el salto parece que no ha hecho nada.
    setTimeout(() => document.getElementById('lista-email')?.focus({ preventScroll: true }), 420)
  }

  return (
    <div className="ini">
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
          {/* El primario mientras haya fecha: es lo único de esta página que
              caduca. */}
          <button className="ini-btn on" onClick={alFormulario}>
            <span className="ini-btn-icono"><Radio size={20} /></span>
            <span className="ini-btn-txt">
              <b>Masterclass gratis</b>
              <small>{MASTERCLASS.cuando}</small>
            </span>
            <ChevronRight className="ini-flecha" size={20} />
          </button>

          <a className="ini-btn" href={YOUTUBE} target="_blank" rel="noopener noreferrer">
            <span className="ini-btn-icono"><Youtube size={20} /></span>
            <span className="ini-btn-txt">
              <b>Mi canal de YouTube</b>
              <small>La serie larga, paso a paso y sin paja</small>
            </span>
            <ChevronRight className="ini-flecha" size={20} />
          </a>

          <a className="ini-btn" href={INSTAGRAM} target="_blank" rel="noopener noreferrer">
            <span className="ini-btn-icono"><Instagram size={20} /></span>
            <span className="ini-btn-txt">
              <b>Sígueme en Instagram</b>
              <small>@{HANDLE}</small>
            </span>
            <ChevronRight className="ini-flecha" size={20} />
          </a>
        </div>

        <Lista />

        <p className="ini-pie">
          © {new Date().getFullYear()} Alex Silvestre · IA aplicada
        </p>
      </main>
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

// ── La lista de la masterclass ──────────────────────────────────────────────
// Dos campos y ni uno más. Cada campo extra se paga en gente que no lo rellena,
// y para mandar una invitación por correo hace falta exactamente el correo.
function Lista() {
  const [f, setF] = useState({ nombre: '', email: '' })
  const [estado, setEstado] = useState(null)   // null | 'enviando' | 'warp' | 'ok'
  const [error, setError] = useState(null)
  // El id que devuelve el CRM, para poder anotar después quién pulsó el botón
  // de la comunidad. Si el alta fue de un email repetido, es el id de siempre.
  const [leadId, setLeadId] = useState(null)
  const [restante, setRestante] = useState(null)
  const [apuntados, setApuntados] = useState(null)

  // Cuenta atrás a la masterclass, mientras se ve la sala.
  useEffect(() => {
    if (estado !== 'ok') return
    const tick = () => {
      const diff = Math.max(0, new Date(MASTERCLASS.cuandoISO).getTime() - Date.now())
      setRestante({
        d: Math.floor(diff / 86400000),
        h: Math.floor(diff / 3600000) % 24,
        m: Math.floor(diff / 60000) % 60,
      })
    }
    tick()
    const id = setInterval(tick, 30000)
    return () => clearInterval(id)
  }, [estado])

  // El número de gente en la sala, una sola vez al entrar: es decorativo
  // (social proof), no un contador en vivo que justifique reconsultarlo.
  useEffect(() => {
    if (estado === 'ok') contarApuntados(MASTERCLASS.etiqueta).then(setApuntados)
  }, [estado])

  async function enviar(e) {
    e.preventDefault()
    setEstado('enviando'); setError(null)
    try {
      const lead = await altaLead({ ...f, evento: MASTERCLASS.etiqueta })
      setLeadId(lead?.id || null)
      // El instante de después de pulsar es donde más se pierde conversión
      // emocional — es donde más se puede dar, no solo confirmar. El portal
      // dura 1.1s: lo justo para sentirse un salto, no una espera.
      setEstado('warp')
      setTimeout(() => setEstado('ok'), 1100)
    } catch (err) {
      setError(err.message)
      setEstado(null)
    }
  }

  if (estado === 'warp') {
    return (
      <div className="ini-warp" id="lista">
        <span className="ini-warp-anillo" />
        <span className="ini-warp-anillo" style={{ animationDelay: '.12s' }} />
        <span className="ini-warp-anillo" style={{ animationDelay: '.24s' }} />
        <span className="ini-warp-texto">Preparando tu plaza…</span>
      </div>
    )
  }

  // Al terminar no se vuelve al formulario vacío: quien ya se ha apuntado tiene
  // que ver que se ha apuntado, y saber qué pasa ahora. Y "ahora" es el
  // Discord: el correo con la invitación tarda días en llegar y la atención se
  // gasta en segundos, así que el siguiente paso se da AQUÍ, mientras la
  // persona sigue mirando la pantalla.
  if (estado === 'ok') {
    const nombre = f.nombre.trim() || 'invitado/a'
    return (
      <div className="ini-sala" id="lista">
        <div className="ini-sala-foco" />

        <div className="ini-teatro" aria-hidden="true">
          {Array.from({ length: SALA_FILAS }).map((_, fila) => (
            <div className="ini-fila" key={fila}>
              {Array.from({ length: SALA_POR_FILA }).map((_, col) => {
                const i = fila * SALA_POR_FILA + col
                const tuyo = i === SALA_TU_ASIENTO
                return (
                  <span
                    key={col}
                    className={'ini-asiento' + (tuyo ? ' tuyo' : '')}
                    style={{ animationDelay: `${i * 14}ms` }}
                  >
                    <Armchair size={tuyo ? 22 : 18} strokeWidth={tuyo ? 2 : 1.6} />
                    {tuyo && (
                      <span className="ini-personilla">
                        <User size={13} strokeWidth={2.6} />
                        <em>{nombre}</em>
                      </span>
                    )}
                  </span>
                )
              })}
            </div>
          ))}
        </div>

        <div className="ini-sala-panel">
          <div className="ini-sala-cab">
            <span className="ini-sala-check"><Check size={15} /></span>
            <span>Plaza reservada</span>
          </div>

          <h2 className="ini-sala-bienvenida">Bienvenido/a, <em>{nombre}</em> 👋</h2>
          <p className="ini-sala-sub">
            {apuntados != null && apuntados > 1 ? `Sois ${apuntados} en la sala. ` : ''}
            Te enviamos la invitación por correo antes del {MASTERCLASS.corto}.
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

          {restante && (
            <div className="ini-cuenta">
              <div><b>{restante.d}</b><span>días</span></div>
              <div><b>{String(restante.h).padStart(2, '0')}</b><span>hrs</span></div>
              <div><b>{String(restante.m).padStart(2, '0')}</b><span>min</span></div>
            </div>
          )}

          <a
            className="ini-btn discord grande"
            href={COMUNIDAD}
            target="_blank"
            rel="noopener noreferrer"
            // Se anota al vuelo y sin `await`: el navegador ya está abriendo
            // Discord en otra pestaña y no se le hace esperar por una fila.
            onClick={() => marcaComunidad(leadId)}
          >
            <span className="ini-btn-icono"><IconoDiscord /></span>
            <span className="ini-btn-txt">
              <b>Entrar en la comunidad</b>
              <small>El Discord donde se avisa del directo y se resuelven dudas</small>
            </span>
            <ChevronRight className="ini-flecha" size={20} />
          </a>

          <a className="ini-sala-cal" href={enlaceCalendario()} target="_blank" rel="noopener noreferrer">
            <CalendarClock size={15} />
            Añadir a mi calendario
          </a>
        </div>
      </div>
    )
  }

  return (
    <form className="ini-lista" id="lista" onSubmit={enviar}>
      <div className="ini-lista-cab">
        <CalendarClock size={16} />
        <b>Entra en la lista de la siguiente masterclass</b>
      </div>
      <p className="ini-lista-cuando">{MASTERCLASS.cuando}</p>
      <p>Te enviamos la invitación por correo. Es gratis y no hay que instalar nada.</p>
      <input
        type="text" placeholder="Tu nombre" value={f.nombre} maxLength={80}
        onChange={e => setF(s => ({ ...s, nombre: e.target.value }))}
      />
      <input
        id="lista-email"
        type="email" placeholder="Tu email" value={f.email} required maxLength={160}
        autoComplete="email" inputMode="email"
        onChange={e => setF(s => ({ ...s, email: e.target.value }))}
      />
      <button className="ini-btn on" disabled={estado === 'enviando' || !f.email.trim()}>
        <b>{estado === 'enviando' ? 'Un momento…' : 'Reservar mi plaza'}</b>
      </button>
      {error && <span className="ini-error">{error}</span>}
    </form>
  )
}
