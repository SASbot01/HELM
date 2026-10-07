import { useEffect } from 'react'

/**
 * Mete en el <head> lo que necesita una página que se comparte por mensaje.
 *
 * Va aquí y no en index.html porque ese <head> lo comparten el panel y todas
 * las páginas públicas: escribir ahí el título de una dejaría su nombre en la
 * pestaña de todo el mundo. Y va en un fichero aparte porque hay más de una
 * página de estas —la de Alex y la de Hugo— y el efecto tiene una parte
 * delicada que no conviene tener copiada dos veces: al salir hay que dejar el
 * <head> exactamente como estaba, porque esto es una SPA y la pantalla
 * siguiente puede ser el panel.
 *
 * El bot de WhatsApp no ejecuta JavaScript y no ve nada de esto. Para eso
 * están las vistas previas estáticas de public/inicio/.
 */
export function useCabeceraPublica({ titulo, descripcion, imagen, colorBarra }) {
  useEffect(() => {
    const previo = document.title
    document.title = titulo

    const metas = [
      ['name', 'description', descripcion],
      ['property', 'og:title', titulo],
      ['property', 'og:description', descripcion],
      ['property', 'og:image', imagen],
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
    // azulado del panel por encima del fondo de la página.
    const theme = document.querySelector('meta[name="theme-color"]')
    const themeAntes = theme?.getAttribute('content')
    theme?.setAttribute('content', colorBarra)

    return () => {
      document.title = previo
      for (const { el, creada, antes } of metas) {
        if (creada) el.remove()
        else if (antes != null) el.setAttribute('content', antes)
      }
      if (themeAntes) theme?.setAttribute('content', themeAntes)
    }
  }, [titulo, descripcion, imagen, colorBarra])
}
