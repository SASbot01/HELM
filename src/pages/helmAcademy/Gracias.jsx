// HELM ACADEMY — s4sf.net/helm-academy/gracias.
//
// Lo que ve quien acaba de dejar sus datos en /helm-academy: recibe en el
// momento lo que ha pedido (la guía, que se abre dentro de la academia, y el
// vídeo si lo hay) y, sobre todo, se entera de cuál es su siguiente paso —
// esperar el mensaje que alguien del equipo le manda en menos de 24 horas. Por
// eso ese aviso va arriba del todo y otra vez, con el detalle, en el último paso.
//
// Qué guía, qué vídeo y para qué se le escribe están en ./entrega.js. Si falta
// el vídeo, su bloque no se pinta y los pasos se renumeran solos.
//
// El botón de la guía abre la academia (academy.helmm.app) en otra pestaña:
// esta se queda, con el aviso. Recién apuntado lleva el enlace de entrada que
// dio la academia (un solo uso, unos minutos): entra sin crear otra cuenta.
// Usado o caducado, lleva a la dirección normal de la guía.
//
// También se llega aquí desde el correo de confirmación, en otro dispositivo:
// sin lo que recuerda el navegador se pinta igual, sin nombre ni teléfono, y
// la guía sale de la dirección (?guia=).
import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowUpRight, Check, Download, MessageCircle, Play } from 'lucide-react'
import { pideLead } from '../leads.js'
import { track } from '../inicio/socio/track.js'
import { useCabeceraPublica } from '../inicio/cabecera.js'
import AIPT, { SKOOL_URL } from '../aiparatodo/config.jsx'
import {
  VSL, PDF, CONTACTO, SKOOL_EN_GRACIAS, NOTA_VIDEO, NOTA_ABRE, NOTA_GUIA,
  guiaDe, tituloGuia, enlaceAcademia, videoDe, queEntrega, urlYoutube, portadaYoutube,
  leeEntrega, entradaViva, gastaEntrada,
} from './entrega.js'
import '../helmAcademy.css'

// Una línea en la ficha del CRM («abrió la guía», «empezó a ver el vídeo»):
// así quien le escribe sabe por dónde va. Con la ficha que dejó el formulario
// en este navegador; sin ella (otro dispositivo) no se anota, y no pasa nada.
function anota(texto) {
  let id = null
  try { id = JSON.parse(localStorage.getItem(AIPT.llave) || 'null')?.id || null } catch { /* incógnito */ }
  if (id) pideLead('nota', { id, texto }).catch(() => {})
}

export default function Gracias() {
  useCabeceraPublica({
    titulo: 'HELM Academy — ya lo tienes',
    descripcion: 'Tu guía de HELM Academy. En menos de 24 horas te escribe una persona del equipo.',
    imagen: '/inicio/og.jpg', colorBarra: '#2A0A13',
  })
  useEffect(() => { track('vista_pagina', { pagina: 'helm-academy-gracias' }) }, [])

  const [entrega] = useState(leeEntrega)
  // Qué guía: la de la dirección (el correo, el atajo del formulario) o, si no
  // viene, la que pidió desde este navegador.
  const [params] = useSearchParams()
  const guiaPedida = guiaDe(params.get('guia'))
  const guia = guiaPedida || guiaDe(entrega?.guia)
  const titulo = tituloGuia(guia)
  // El enlace de entrada a la academia, mientras valga y sea el de esta guía.
  const [entrada, setEntrada] = useState(() => (
    !guiaPedida || guiaPedida === entrega?.guia ? entradaViva(entrega) : null
  ))
  // Caduca con la pantalla abierta: entonces el botón pasa a la dirección normal.
  const caduca = entrega?.entrada?.hasta
  useEffect(() => {
    if (!entrada) return undefined
    const t = setTimeout(() => setEntrada(null), Math.max(0, Date.parse(caduca) - Date.now()))
    return () => clearTimeout(t)
  }, [entrada, caduca])
  const alAbrir = () => {
    track('clic_cta', { donde: 'ha-academia' })
    anota(NOTA_ABRE)
    if (!entrada) return
    // Es de un solo uso: ya no vale para otra vez. El cambio de enlace va en
    // otra vuelta, para que el navegador siga el que se acaba de pulsar.
    gastaEntrada()
    setTimeout(() => setEntrada(null), 0)
  }

  const video = videoDe(VSL)
  const tienes = queEntrega(guia, VSL)
  const contado = entrega
    ? [['Quieres', entrega.quiero], ['Tu meta', entrega.ingreso], ['Usas la IA', entrega.usa_ia]].filter(([, v]) => v)
    : []

  return (
    <div className="ha ha--gracias">
      <main className="ha-card">
        <div className="ha-cab">
          <span className="ha-logo">HA</span>
          <div>
            <b>HELM Academy</b>
            <small>Por Alex Silvestre</small>
          </div>
        </div>

        <div className="ha-hecho">
          <span className="ha-hecho-ok"><Check size={20} aria-hidden="true" /></span>
          <h1>{entrega?.nombre ? `Hecho, ${entrega.nombre}.` : 'Hecho.'} <em>Ya lo tienes.</em></h1>
          <p className="ha-lead">Aquí abajo tienes {tienes}.</p>
        </div>

        {/* Lo primero que tiene que quedar claro: cuál es el siguiente paso. */}
        <p className="ha-aviso" role="status">
          <MessageCircle size={18} aria-hidden="true" />
          <span>
            <b>Tu siguiente paso: esperar nuestro {CONTACTO.canal}.</b>{' '}
            Te escribe una persona del equipo de {CONTACTO.equipo} en menos de {CONTACTO.plazo}, con {CONTACTO.motivo}.
          </span>
        </p>

        <ol className="ha-pasos">
          {video && (
            <li className="ha-paso">
              <h2>Mira el vídeo <small>{VSL.minutos} min</small></h2>
              <p>{VSL.gancho}</p>
              <Video video={video} />
            </li>
          )}

          <li className="ha-paso">
            <h2>{guia ? 'Abre tu guía' : 'Abre las guías'}</h2>
            <p>
              {titulo && <><b>{titulo}.</b>{' '}</>}
              {guia ? 'Está' : 'Están'} dentro de la academia de HELM, en la parte gratuita.{' '}
              {entrada
                ? 'Entras directamente con este botón, sin crear otra cuenta.'
                : 'Si te pide una cuenta, es gratis: usa el mismo correo que nos has dejado.'}
            </p>
            <a
              className="ha-btn ha-btn--enlace" href={entrada || enlaceAcademia(guia)} target="_blank" rel="noopener noreferrer"
              onClick={alAbrir}
            >
              {guia ? 'Abrir la guía' : 'Abrir las guías'} <ArrowUpRight size={18} aria-hidden="true" />
            </a>
            {PDF.href && (
              <p className="ha-pdf">
                <a
                  href={PDF.href} download target="_blank" rel="noopener noreferrer"
                  onClick={() => { track('clic_cta', { donde: 'ha-guia' }); anota(NOTA_GUIA) }}
                >
                  <Download size={14} aria-hidden="true" /> O descárgala en PDF
                </a>
              </p>
            )}
          </li>

          <li className="ha-paso ha-paso--espera">
            <h2>Espera nuestro {CONTACTO.canal}</h2>
            <p>
              En menos de {CONTACTO.plazo} te escribe por {CONTACTO.canal} una persona del equipo de {CONTACTO.equipo},{' '}
              {entrega?.tel
                ? <>al número que termina en <b>···{entrega.tel}</b>.</>
                : <>al teléfono que nos has dejado.</>}
            </p>
            <p>{CONTACTO.explica}</p>
            {contado.length > 0 && (
              <ul className="ha-contado" aria-label="Lo que nos has contado">
                {contado.map(([k, v]) => <li key={k}><span>{k}</span> {v}</li>)}
              </ul>
            )}
            <p><b>No tienes que hacer nada más.</b> Solo contestar cuando te escribamos.</p>
            {CONTACTO.numero && (
              <p className="ha-numero">
                Te escribimos desde el <b>{CONTACTO.numero}</b>. Guárdalo para que no te entre como desconocido.
              </p>
            )}
          </li>
        </ol>

        {SKOOL_EN_GRACIAS && (
          <p className="ha-mientras">
            Mientras esperas:{' '}
            <a href={SKOOL_URL} target="_blank" rel="noopener noreferrer" onClick={() => track('clic_cta', { donde: 'ha-skool' })}>
              pásate por la comunidad <ArrowUpRight size={14} aria-hidden="true" />
            </a>
          </p>
        )}

        {!entrega && (
          <p className="ha-legal">
            ¿Todavía no nos has dejado tus datos? <Link to={guia ? `/helm-academy?guia=${guia}` : '/helm-academy'}>Hazlo aquí</Link> y te escribimos.
          </p>
        )}
      </main>
    </div>
  )
}

// El vídeo. Con YouTube se pinta primero la portada y el reproductor (y sus
// cookies) solo entra cuando le dan al play; con un archivo propio, el vídeo
// del navegador. La primera vez que empieza queda anotado en la ficha.
function Video({ video }) {
  const [puesto, setPuesto] = useState(false)
  const anotado = useRef(false)
  const alEmpezar = () => {
    if (anotado.current) return
    anotado.current = true
    track('clic_cta', { donde: 'ha-video' })
    anota(NOTA_VIDEO)
  }

  if (video.tipo === 'mp4') {
    return (
      <div className="ha-video">
        <video controls playsInline preload="metadata" poster={VSL.poster || undefined} aria-label={VSL.titulo} onPlay={alEmpezar}>
          <source src={video.src} type="video/mp4" />
        </video>
      </div>
    )
  }
  if (puesto) {
    return (
      <div className="ha-video">
        <iframe
          src={urlYoutube(video.id)} title={VSL.titulo}
          allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowFullScreen
        />
      </div>
    )
  }
  return (
    <button
      type="button" className="ha-video ha-video--portada" aria-label={`Ver el vídeo: ${VSL.titulo}`}
      onClick={() => { setPuesto(true); alEmpezar() }}
    >
      <img src={VSL.poster || portadaYoutube(video.id)} alt="" />
      <span className="ha-play"><Play size={26} aria-hidden="true" /></span>
      <span className="ha-video-pie">{VSL.titulo} · {VSL.minutos} min</span>
    </button>
  )
}
