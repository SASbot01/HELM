// El calendario de la auditoría, incrustado (Cal.com).
//
// Va como <iframe> con ?embed=true y no con el script de embed de Cal.com: el
// script pesa y aquí solo hace falta una cosa, enterarse de que ha reservado.
// Para eso se escuchan los mensajes que manda el iframe y se busca
// "bookingSuccessful" en ellos (Cal.com lo manda con ese nombre, con o sin
// sufijo de versión).
//
// Red de seguridad: en Cal.com, el evento de la auditoría debe tener
// "Redirigir al reservar" → https://s4sf.net/gracias. Si el mensaje no llega,
// la redirección carga /gracias DENTRO del iframe, y Gracias.jsx detecta que
// está enmarcada y saca a la ventana de arriba.
import { useEffect } from 'react'
import { CAL_URL } from './config.js'
import Pendiente from './Pendiente.jsx'

function urlCalendario({ nombre, email }) {
  try {
    const u = new URL(CAL_URL)
    u.searchParams.set('embed', 'true')
    u.searchParams.set('theme', 'dark')
    if (nombre) u.searchParams.set('name', nombre)
    if (email) u.searchParams.set('email', email)
    return u.toString()
  } catch {
    return null
  }
}

export default function Calendario({ nombre, email, alReservar }) {
  const src = CAL_URL ? urlCalendario({ nombre, email }) : null

  useEffect(() => {
    if (!src) return
    const origenCal = new URL(src).origin
    function alMensaje(e) {
      if (e.origin !== origenCal) return
      let texto = ''
      try { texto = typeof e.data === 'string' ? e.data : JSON.stringify(e.data) } catch { return }
      if (/bookingSuccessful/.test(texto)) alReservar()
    }
    window.addEventListener('message', alMensaje)
    return () => window.removeEventListener('message', alMensaje)
  }, [src, alReservar])

  if (!src) {
    return (
      <div className="so-cal-vacio">
        <Pendiente bloque siempre>URL del calendario (VITE_CAL_URL en .env)</Pendiente>
        <p>
          Tus respuestas ya están guardadas. Te escribo en menos de 24 horas
          a tu correo para cerrar la hora de la auditoría.
        </p>
      </div>
    )
  }

  return (
    <div className="so-cal">
      <iframe src={src} title="Reserva tu auditoría de 30 minutos" loading="lazy" />
      <a className="so-cal-fuera" href={src.replace('embed=true', 'embed=false')} target="_blank" rel="noopener noreferrer">
        ¿No carga? Ábrelo aquí
      </a>
    </div>
  )
}
