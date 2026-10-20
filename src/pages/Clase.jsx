// PÁGINA DE LA BIO — s4sf.net, s4sf.net/paginainicio y s4sf.net/clase.
//
// Es el destino del enlace de la bio de Instagram: alguien ve un Reel, pulsa el
// enlace y aterriza aquí. Todo lo que hay en pantalla existe para que haga UNA
// de estas cosas:
//
//   1. AI para todo              → /aiparatodo, la comunidad gratis (skills,
//                                  news y la guía de Claude). Ahí se deja el
//                                  correo. Sustituye a la «Charla gratis» (la
//                                  masterclass detrás de un formulario), que
//                                  queda en el historial de git.
//   2. Irse a YouTube            → donde se enseña a fondo.
//   3. ¿Eres una empresa o negocio? → /empresas, donde se vende HELM montado
//                                  y llevado por Alex.
//
// Instagram ya no tiene botón: quien llega aquí viene de Instagram. El handle
// sigue encima de la foto como firma.
import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Youtube, Building2, ChevronRight, Sparkles } from 'lucide-react'
import { useCabeceraPublica } from './inicio/cabecera.js'
import { track } from './inicio/socio/track.js'
import FondoHacker from './inicio/FondoHacker.jsx'
import '../fonts/inter-tight.css'
import './inicio/inicio.css'

// Lo que se cambia cada dos por tres, junto y arriba: enlaces y handle.
const HANDLE = 'silvesttre.ia'
const YOUTUBE = 'https://www.youtube.com/@silvesttre-ai'
const INSTAGRAM = `https://www.instagram.com/${HANDLE}`
const TITULO = 'Alex Silvestre — Aprende a dirigir la IA, no solo a usarla'
const DESCRIPCION = 'IA aplicada en español, sin humo y con datos. Entra gratis en AI para todo.'

export default function Clase() {
  useCabeceraPublica({
    titulo: TITULO, descripcion: DESCRIPCION,
    imagen: '/inicio/og.jpg', colorBarra: '#2A0A13',
  })

  useEffect(() => {
    track('vista_pagina', { pagina: 'clase' })
  }, [])

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
          {/* El primario: AI para todo, gratis. El correo se pide allí. */}
          <Link className="ini-btn on" to="/aiparatodo" onClick={() => track('clic_cta', { donde: 'bio-aiparatodo' })}>
            <span className="ini-btn-icono"><Sparkles size={20} /></span>
            <span className="ini-btn-txt">
              <b>AI para todo</b>
              <small>Gratis: webs premiadas con su prompt, skills, news y guías de Claude</small>
            </span>
            <ChevronRight className="ini-flecha" size={20} />
          </Link>

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

        {/* Fijo detrás de todo en escritorio (position: fixed no depende de
            dónde esté en el HTML); en el móvil, justo debajo de los botones. */}
        <FondoHacker />

        <p className="ini-pie">
          © {new Date().getFullYear()} Alex Silvestre · IA aplicada
        </p>
      </main>
    </div>
  )
}
