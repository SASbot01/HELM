// /gracias — después de reservar la auditoría.
//
// Aquí se marca la llamada en el CRM y se lanza `llamada_reservada`, y solo
// una vez por reserva: se llega desde el calendario (mensaje del iframe o
// redirección de Cal.com), y recargar la página no puede contar dos llamadas.
import { useEffect } from 'react'
import { CalendarClock, Check } from 'lucide-react'
import { CAL_REPROGRAMAR_URL, VIDEO_GRACIAS, LLAVE_SESION } from './config.js'
import { marcaLlamada } from './crm.js'
import { track } from './track.js'
import Pendiente from './Pendiente.jsx'
import Pie from './Pie.jsx'
import { useFuentesSocio } from './fuentes.js'
import { useCabeceraPublica } from '../cabecera.js'
import './socio.css'

// Si Cal.com redirige a /gracias dentro del iframe, se saca a la ventana de
// arriba (mismo origen, así que el navegador lo permite).
function enMarco() {
  try { return window.top !== window.self } catch { return true }
}

export default function Gracias() {
  const enmarcada = enMarco()
  useFuentesSocio()
  useCabeceraPublica({ titulo: 'Llamada reservada — Socio IA', descripcion: 'Mira esto antes de entrar en la llamada.', imagen: '/socio/og.jpg', colorBarra: '#0a0a0c' })

  useEffect(() => {
    if (enmarcada) {
      try { window.top.location.assign('/gracias') } catch { /* nada que hacer */ }
      return
    }
    let ficha = null
    try { ficha = JSON.parse(sessionStorage.getItem(LLAVE_SESION) || 'null') } catch { /* incógnito */ }
    track('vista_pagina', { pagina: 'gracias' })
    if (ficha && !ficha.llamada) {
      track('llamada_reservada')
      marcaLlamada(ficha.id)
      try { sessionStorage.setItem(LLAVE_SESION, JSON.stringify({ ...ficha, llamada: true })) } catch { /* da igual */ }
    }
  }, [enmarcada])

  if (enmarcada) return null

  return (
    <div className="so">
      <main className="so-gracias">
        <p className="so-tag"><span className="so-hex" aria-hidden="true" /> SOCIO IA</p>
        <h1>Llamada reservada. <em>Mira esto antes de entrar.</em></h1>

        {VIDEO_GRACIAS ? (
          <div className="so-video">
            <iframe src={VIDEO_GRACIAS} title="Antes de la llamada" loading="lazy"
              allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
          </div>
        ) : (
          <Pendiente bloque>vídeo de 2–3 minutos antes de la llamada (VITE_VIDEO_GRACIAS)</Pendiente>
        )}

        <h2>Trae esto a la llamada</h2>
        <ul className="so-check">
          <li><Check size={18} aria-hidden="true" /> El enlace a tu embudo: la página o el camino por el que te compran hoy.</li>
          <li><Check size={18} aria-hidden="true" /> Tus cifras del último mes.</li>
          <li><Check size={18} aria-hidden="true" /> Tu producto: qué es, cuánto cuesta y qué resultados da.</li>
        </ul>

        <p className="so-reprogramar">
          <CalendarClock size={18} aria-hidden="true" />
          {CAL_REPROGRAMAR_URL
            ? <span>Si no puedes, <a href={CAL_REPROGRAMAR_URL} target="_blank" rel="noopener noreferrer">cambia la hora aquí</a>.</span>
            : <span>Si no puedes, cambia la hora desde el enlace del correo de confirmación.</span>}
        </p>
      </main>
      <Pie />
    </div>
  )
}
