// ACCESOS — s4sf.net/accesos.
//
// La entrada a AI para todo, suelta: solo el correo. Entra quien se apuntó a
// HELM Academy con ese correo (el formulario de /helm-academy da el acceso); si
// no está, se le manda allí. Reutiliza el formulario de la puerta.
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCabeceraPublica } from './inicio/cabecera.js'
import { track } from './inicio/socio/track.js'
import EntradaPorCorreo from './comunidad/EntradaPorCorreo.jsx'
import AIPT from './aiparatodo/config.jsx'
import './comunidad/comunidad.css'
import './accesos.css'

export default function Accesos() {
  useCabeceraPublica({
    titulo: 'Acceso a AI para todo',
    descripcion: 'Entra en AI para todo con el correo con el que te apuntaste a HELM Academy.',
    imagen: '/inicio/og.jpg', colorBarra: '#050203',
  })
  useEffect(() => { track('vista_pagina', { pagina: 'accesos' }) }, [])
  const navigate = useNavigate()

  return (
    <div className="aip acc-pagina">
      <main className="acc-main">
        <div className="acc-logo">{AIPT.logo}</div>
        <EntradaPorCorreo
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
