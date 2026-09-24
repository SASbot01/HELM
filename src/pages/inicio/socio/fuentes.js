import { useEffect } from 'react'

// Barlow Condensed (titulares) solo se carga en las páginas de Socio IA: el
// index.html de HELM es común al panel y no tiene por qué pagarla. Inter ya
// viene cargada desde ese index.html.
const HREF = 'https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@900&display=swap'

export function useFuentesSocio() {
  useEffect(() => {
    if (document.querySelector(`link[href="${HREF}"]`)) return
    const l = document.createElement('link')
    l.rel = 'stylesheet'
    l.href = HREF
    document.head.appendChild(l)
  }, [])
}
