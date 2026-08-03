// HELM — la marca del perfil en la pestaña del navegador.
//
// Las páginas públicas (el portal de la comunidad, el formulario que rellena el
// cliente) son la plataforma DE SU FORMADOR, no HELM. Pero el index.html es uno
// solo para toda la app y dice "HELM — El puesto de mando de tu negocio", con
// el icono de HELM: si no se reescribe, el alumno abre el enlace de su formador
// y lo primero que lee es el nombre de otro producto.
//
// Lo que esto NO arregla: la tarjeta de vista previa al compartir el enlace por
// WhatsApp o LinkedIn. El bot que la genera no ejecuta JavaScript. Eso se
// resuelve en el servidor (ver api/portal-meta.js).
import { useEffect } from 'react'

export function useMarcaEnLaPestana(marca) {
  useEffect(() => {
    if (!marca?.nombre) return undefined
    const tituloPrevio = document.title
    document.title = marca.subtitulo ? `${marca.nombre} — ${marca.subtitulo}` : marca.nombre

    const iconos = [...document.querySelectorAll("link[rel~='icon'], link[rel='apple-touch-icon']")]
    const previos = iconos.map(l => ({ href: l.getAttribute('href'), type: l.getAttribute('type') }))
    if (marca.logo) {
      for (const l of iconos) { l.setAttribute('href', marca.logo); l.removeAttribute('type') }
    }
    return () => {
      document.title = tituloPrevio
      iconos.forEach((l, i) => {
        l.setAttribute('href', previos[i].href)
        if (previos[i].type) l.setAttribute('type', previos[i].type)
      })
    }
  }, [marca])
}

// La cabecera con logo y nombre. Misma forma en el portal de la comunidad y en
// el formulario público: para quien la ve, las dos páginas son de la misma casa.
export function Marca({ marca }) {
  if (!marca?.nombre) return null
  return (
    <div className="helm-portal-marca">
      {marca.logo
        ? <img src={marca.logo} alt="" />
        : <div className="helm-portal-ini">{marca.nombre[0].toUpperCase()}</div>}
      <div>
        <b>{marca.nombre}</b>
        {marca.subtitulo && <span>{marca.subtitulo}</span>}
      </div>
    </div>
  )
}
