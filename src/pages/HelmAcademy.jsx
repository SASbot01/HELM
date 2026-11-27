// HELM ACADEMY — s4sf.net/helm-academy.
//
// El embudo: alguien ve un vídeo de YouTube, llega aquí, ve qué va a aprender y
// cómo puede vivir de ello, y el botón le lleva al quiz de la academia
// (academy.helmm.app): unas preguntas y sus datos de contacto, y entra gratis en
// AI para todo con su plan. Allí se le dice que en menos de 24 horas le escribe
// alguien del equipo; aquí también, antes de que le dé al botón.
//
// Esta página ya no tiene formulario ni guarda nada: los datos se dejan en el
// quiz, y la academia manda cada alta al CRM de Silvestre AI desde su servidor
// (api/leads · school, embudo «School»).
//
// Cada vídeo enlaza aquí con su guía: /helm-academy?guia=que-ningun-lead-se-enfrie.
// El botón lleva entonces a esa guía (la academia pone su título sobre el quiz
// y la abre al terminar); sin ?guia=, a la parte gratuita entera. La campaña de
// la visita (utm_* y fbclid) viaja en el enlace, para que el alta llegue al CRM
// sabiendo de dónde vino. Guías, vídeo y lo que se promete, en
// helmAcademy/entrega.js.
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ArrowRight, Check, Play } from 'lucide-react'
import { origen } from './inicio/socio/origen.js'
import { track } from './inicio/socio/track.js'
import { useCabeceraPublica } from './inicio/cabecera.js'
import {
  ACADEMIA, CAMPANA, VSL, CONTACTO,
  guiaDe, tituloGuia, enlaceQuiz, videoDe, urlYoutube, portadaYoutube,
} from './helmAcademy/entrega.js'
import './helmAcademy.css'

const APRENDES = [
  'Sistemas y procesos con IA que puedes repetir, no trucos sueltos.',
  'Cómo convertirlo en ingresos: contenido, servicios o tu propio negocio.',
  'En español, sin humo y con datos encima de la mesa.',
]

export default function HelmAcademy() {
  useCabeceraPublica({
    titulo: 'HELM Academy — aprende a dirigir la IA y vive de ello',
    descripcion: `Contesta ${ACADEMIA.preguntas} preguntas y entra gratis con tu plan. Sistemas de IA en español para crear, facturar y crecer, por Alex Silvestre.`,
    imagen: '/inicio/og.jpg', colorBarra: '#2A0A13',
  })
  useEffect(() => { track('vista_pagina', { pagina: 'helm-academy' }) }, [])

  // La guía del vídeo del que viene, si la landing llega con ?guia=.
  const [params] = useSearchParams()
  const guia = guiaDe(params.get('guia'))
  const titulo = tituloGuia(guia)
  // La campaña que se le pasa a la academia: la de la visita (quien entró por la
  // bio con sus UTM y llegó aquí pulsando) y, por encima, la de esta dirección.
  const campana = { ...origen() }
  for (const k of CAMPANA) { const v = params.get(k); if (v) campana[k] = v }
  const quiz = enlaceQuiz(guia, campana)
  const video = videoDe(VSL)

  return (
    <div className="ha">
      <main className="ha-card">
        <div className="ha-cab">
          <span className="ha-logo">HA</span>
          <div>
            <b>HELM Academy</b>
            <small>Gratis · Por Alex Silvestre</small>
          </div>
        </div>

        {/* El funnel: qué vas a aprender y cómo vivir de ello, antes del botón. */}
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
        </div>

        {video && <Video video={video} />}

        <p className="ha-gratis">
          Es <b>gratis</b>. Contesta {ACADEMIA.preguntas} preguntas y{' '}
          {guia
            ? <>te abrimos la guía{titulo && <> <b>«{titulo}»</b></>}.</>
            : <>entras con tu plan.</>}
        </p>
        <a className="ha-btn" href={quiz} onClick={() => track('clic_cta', { donde: 'ha-quiz' })}>
          {guia ? 'Quiero la guía' : 'Empezar el quiz'} <ArrowRight size={18} aria-hidden="true" />
        </a>

        {/* Antes de darle al botón ya sabe lo que viene: el quiz, su plan y que
            después le escribimos. */}
        <ol className="ha-pasos" aria-label="Cómo funciona">
          <li className="ha-paso">
            <h2>Contestas el quiz</h2>
            <p>Son {ACADEMIA.preguntas} preguntas, de una en una, y tus datos de contacto. Con eso preparamos tu plan.</p>
          </li>
          <li className="ha-paso">
            <h2>Entras con tu plan</h2>
            <p>
              Gratis, en AI para todo:{' '}
              {guia
                ? <>tu guía{titulo && <>, <b>«{titulo}»</b></>}, ya abierta,</>
                : <>la guía por la que te conviene empezar</>}
              {' '}y el resto de guías, las skills y las webs de referencia.
            </p>
          </li>
          <li className="ha-paso ha-paso--espera">
            <h2>Te escribimos por {CONTACTO.canal}</h2>
            <p>
              En menos de {CONTACTO.plazo} te escribe una persona del equipo de {CONTACTO.equipo}, {CONTACTO.para}.{' '}
              <b>No tienes que hacer nada más.</b>
            </p>
          </li>
        </ol>
      </main>
    </div>
  )
}

// El vídeo de la landing, encima del botón. Con YouTube se pinta primero la
// portada y el reproductor (y sus cookies) solo entra cuando le dan al play; con
// un archivo propio, el vídeo del navegador.
function Video({ video }) {
  const [puesto, setPuesto] = useState(false)
  const medido = useRef(false)
  const alEmpezar = () => {
    if (medido.current) return
    medido.current = true
    track('clic_cta', { donde: 'ha-video' })
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
