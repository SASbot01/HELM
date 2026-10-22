// ACCESOS — s4sf.net/accesos.
//
// La solicitud de acceso a AI para todo, suelta: solo nombre y correo. No abre
// nada; la ve Alex en el panel, la cruza con quién se apuntó a HELM Academy y,
// si está dentro, la acepta. Al aprobarla, la persona vuelve aquí (o a cualquier
// hilo), pulsa «comprobar» y entra. Reutiliza el formulario de la puerta.
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCabeceraPublica } from './inicio/cabecera.js'
import { track } from './inicio/socio/track.js'
import SolicitudAcceso from './comunidad/SolicitudAcceso.jsx'
import AIPT from './aiparatodo/config.jsx'
import './comunidad/comunidad.css'
import './accesos.css'

export default function Accesos() {
  useCabeceraPublica({
    titulo: 'Acceso a AI para todo',
    descripcion: 'Pide acceso a AI para todo: déjanos tu nombre y tu correo.',
    imagen: '/inicio/og.jpg', colorBarra: '#050203',
  })
  useEffect(() => { track('vista_pagina', { pagina: 'accesos' }) }, [])
  const navigate = useNavigate()

  return (
    <div className="aip acc-pagina">
      <main className="acc-main">
        <div className="acc-logo">{AIPT.logo}</div>
        <SolicitudAcceso
          cfg={AIPT}
          onEntrar={({ id, nombre }) => {
            const acc = { id: id || null, nombre, at: new Date().toISOString() }
            try { localStorage.setItem(AIPT.llave, JSON.stringify(acc)) } catch { /* incógnito */ }
            navigate('/aiparatodo')
          }}
        />
      </main>
    </div>
  )
}
