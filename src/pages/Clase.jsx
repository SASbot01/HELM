// PÁGINA DE LA BIO — s4sf.net, s4sf.net/paginainicio y s4sf.net/clase.
//
// Es el destino del enlace de la bio de Instagram: alguien ve un Reel, pulsa el
// enlace y aterriza aquí. Desde el 22-10-2026 va toda en una sola tarjeta, al
// estilo de las bios de creadores (a partir de una de referencia que pasó Alex):
//
//   1. HELM Academy — el héroe: «skool» enorme con los colores del logo de
//      Skool y Alex recortado (sin fondo) delante. Toda la tarjeta es el
//      enlace al formulario de entrada (/helm-academy), que guarda el lead en
//      el CRM (embudo «School») y redirige al Skool.
//   2. ¿En qué puedo ayudarte? — YouTube y «¿Eres una empresa o negocio?»
//      (/empresas, Socio IA).
//
// AI para todo ya no sale aquí: sigue en /aiparatodo, con el acceso por
// aprobación en /accesos. La foto del coche y el fondo «hacker» se quitaron.
import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Youtube, Building2, ArrowRight, ArrowUpRight } from 'lucide-react'
import { useCabeceraPublica } from './inicio/cabecera.js'
import { track } from './inicio/socio/track.js'
import '../fonts/inter-tight.css'
import '../fonts/montserrat.css'
import './inicio/inicio.css'
import './inicio/bio.css'

// Lo que se cambia cada dos por tres, junto y arriba: enlaces y handle.
const HANDLE = 'silvesttre.ai'
const YOUTUBE = 'https://www.youtube.com/@silvesttre-ai'
const INSTAGRAM = `https://www.instagram.com/${HANDLE}`
const TITULO = 'Alex Silvestre — Aprende a dirigir la IA, no solo a usarla'
const DESCRIPCION = 'IA aplicada en español, sin humo y con datos. Entra gratis en HELM Academy.'

// «skool», cada letra con el color que lleva en el logo de Skool.
const SKOOL = [['s', 'azul'], ['k', 'rojo'], ['o', 'oro'], ['o', 'azul'], ['l', 'rojo']]

export default function Clase() {
  useCabeceraPublica({
    titulo: TITULO, descripcion: DESCRIPCION,
    imagen: '/inicio/og.jpg', colorBarra: '#2A0A13',
  })

  useEffect(() => {
    track('vista_pagina', { pagina: 'clase' })
  }, [])

  return (
    <div className="ini ini--pantera ini--bio">
      <main className="bio">
        <header className="bio-quien">
          <h1>Alex Silvestre</h1>
          <p className="bio-rol">IA aplicada, en español</p>
          <a className="bio-arroba" href={INSTAGRAM} target="_blank" rel="noopener noreferrer">@{HANDLE}</a>
        </header>

        {/* El héroe entero es el enlace: se pincha en la foto, en «skool» o en
            el botón y se va al formulario de HELM Academy. */}
        <Link
          className="bio-heroe"
          to="/helm-academy"
          aria-label="Unirme gratis a HELM Academy, la comunidad de Alex en Skool"
          onClick={() => track('clic_cta', { donde: 'bio-skool' })}
        >
          <span className="bio-escena">
            <span className="bio-skool" aria-hidden="true">
              {SKOOL.map(([letra, color], i) => <span key={i} className={`bio-letra ${color}`}>{letra}</span>)}
            </span>
            {/* La foto va por encima de las letras: así la cabeza tapa el pie
                de «skool», como en una portada de estudio. */}
            <img
              className="bio-foto"
              src="/inicio/alex-sinfondo.webp?v=2"
              alt=""
              width="900" height="792"
              fetchPriority="high"
            />
          </span>
          <span className="bio-lema">Aprende a dirigir la IA, no solo a usarla.<br />Gratis, en español y con casos reales.</span>
          <span className="bio-cta">Unirme a HELM Academy <ArrowRight size={18} /></span>
        </Link>

        <p className="bio-sep">¿En qué puedo ayudarte?</p>

        <nav className="bio-lista" aria-label="Enlaces">
          <a
            className="bio-enlace" href={YOUTUBE} target="_blank" rel="noopener noreferrer"
            onClick={() => track('clic_cta', { donde: 'bio-youtube' })}
          >
            <span className="bio-icono yt"><Youtube size={24} /></span>
            <span className="bio-txt">
              <b>Mi canal de YouTube</b>
              <span>La serie larga, paso a paso y sin paja.</span>
              <small>youtube.com/@silvesttre-ai</small>
            </span>
            <ArrowUpRight className="bio-flecha" size={16} />
          </a>

          <a
            className="bio-enlace" href="/empresas"
            onClick={() => track('clic_cta', { donde: 'bio-empresa' })}
          >
            <span className="bio-icono"><Building2 size={22} /></span>
            <span className="bio-txt">
              <b>¿Eres una empresa o negocio?</b>
              <span>Monto y llevo HELM, el sistema que vende por ti.</span>
              <small>s4sf.net/empresas</small>
            </span>
            <ArrowRight className="bio-flecha" size={16} />
          </a>
        </nav>

        <p className="bio-pie">© {new Date().getFullYear()} Alex Silvestre · IA aplicada</p>
      </main>
    </div>
  )
}
