// PÁGINA INICIO — la cara pública de la marca personal de Alex Silvestre.
//
//   www.s4sf.net/paginainicio
//
// Es el destino del enlace de la bio de Instagram: alguien ve un Reel, pulsa el
// enlace y aterriza aquí. Todo lo que hay en pantalla existe para que pulse uno
// de los dos botones, y el orden responde a las tres preguntas que se hace en
// ese momento, en este orden: quién eres (foto y nombre), por qué te escucho
// (la tesis y el dato), y a dónde voy (los botones).
//
// El destino de verdad es YOUTUBE, no esta página: aquí no se enseña nada, se
// deriva al sitio donde se enseña a fondo. Por eso es el único botón con relleno.
import { useEffect } from 'react'
import { Youtube, Instagram, ArrowUpRight } from 'lucide-react'
import './inicio/inicio.css'

// Los enlaces, juntos y arriba: son lo que se cambia cada dos por tres y no
// tiene gracia buscarlos entre el maquetado.
const YOUTUBE = 'https://www.youtube.com/@S4sf'
const INSTAGRAM = 'https://www.instagram.com/silvesttre.ai'

const TITULO = 'Alex Silvestre — Aprende a dirigir la IA, no solo a usarla'
const DESCRIPCION = 'IA aplicada en español, sin humo y con datos. Empieza por la serie de YouTube.'

/**
 * Mete en el <head> lo que necesita una página que se comparte por mensaje.
 *
 * Va aquí y no en index.html porque ese <head> lo comparten el panel y todas
 * las páginas públicas: escribir ahí el título de esta dejaría "Alex Silvestre"
 * en la pestaña de todo el mundo. El bot de WhatsApp no ejecuta JavaScript y no
 * ve nada de esto — para eso está la vista previa estática que sirve
 * vercel.json (public/inicio/preview.html).
 */
function useCabecera() {
  useEffect(() => {
    const previo = document.title
    document.title = TITULO

    const metas = [
      ['name', 'description', DESCRIPCION],
      ['property', 'og:title', TITULO],
      ['property', 'og:description', DESCRIPCION],
      ['property', 'og:image', '/inicio/og.jpg'],
      ['property', 'og:type', 'profile'],
      ['name', 'twitter:card', 'summary_large_image'],
    ].map(([attr, clave, valor]) => {
      let el = document.head.querySelector(`meta[${attr}="${clave}"]`)
      const creada = !el
      if (!el) {
        el = document.createElement('meta')
        el.setAttribute(attr, clave)
        document.head.appendChild(el)
      }
      const antes = el.getAttribute('content')
      el.setAttribute('content', valor)
      return { el, creada, antes }
    })

    // El color de la barra del navegador en el móvil: sin esto asoma el negro
    // azulado del panel por encima del granate.
    const theme = document.querySelector('meta[name="theme-color"]')
    const themeAntes = theme?.getAttribute('content')
    theme?.setAttribute('content', '#2A0A13')

    // Al salir se deja el <head> como estaba: esto es una SPA y la siguiente
    // pantalla puede ser el panel.
    return () => {
      document.title = previo
      for (const { el, creada, antes } of metas) {
        if (creada) el.remove()
        else if (antes != null) el.setAttribute('content', antes)
      }
      if (themeAntes) theme?.setAttribute('content', themeAntes)
    }
  }, [])
}

export default function PaginaInicio() {
  useCabecera()

  return (
    <div className="ini">
      <main className="ini-card">
        <img
          className="ini-foto"
          src="/inicio/alex.jpg"
          alt="Alex Silvestre"
          width="1100" height="1338"
          // La foto es lo primero que se ve y ocupa media pantalla: cargarla
          // perezosa sería dejar un hueco gris justo donde mira todo el mundo.
          fetchPriority="high"
        />

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
          {/* El primario. La serie larga está en YouTube y es donde se enseña
              de verdad: todo lo demás de la marca apunta aquí. */}
          <a className="ini-btn on" href={YOUTUBE} target="_blank" rel="noopener noreferrer">
            <Youtube size={22} />
            <span>
              Empieza por la serie de YouTube
              <small>Vídeos largos, paso a paso y sin paja</small>
            </span>
            <ArrowUpRight className="ini-flecha" size={17} />
          </a>

          <a className="ini-btn" href={INSTAGRAM} target="_blank" rel="noopener noreferrer">
            <Instagram size={22} />
            <span>
              Sígueme en Instagram
              <small>@silvesttre.ai</small>
            </span>
            <ArrowUpRight className="ini-flecha" size={17} />
          </a>
        </div>

        <p className="ini-pie">
          Alex Silvestre · IA aplicada para profesionales y negocios
        </p>
      </main>
    </div>
  )
}
