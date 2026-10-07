// Medición. En el proyecto no hay Meta Pixel ni Google Analytics todavía, así
// que `track()` deja los eventos preparados: los mete en `window.dataLayer`
// (lo que lee Google Tag Manager) y, si algún día se pega el píxel de Meta o
// gtag en index.html, los manda también ahí sin tocar nada más.
//
// Eventos que existen (y ninguno más, para que los informes no se llenen de
// nombres sueltos):
//   vista_pagina        · { pagina }
//   clic_cta            · { donde }
//   paso_formulario     · { paso }            (1–5, al ENTRAR en el paso)
//   encaja / no_encaja  · { precio, facturacion, resultados }
//   llamada_reservada   · {}
//
// Cada evento lleva además el origen (UTM + palabra clave) y la variante del
// titular, para poder cruzar "qué Reel" con "cuántas llamadas".
import { origen } from './origen.js'
import { varianteTitular } from './config.js'

// Los nombres estándar de Meta, para que las campañas puedan optimizar a ellos.
const META_ESTANDAR = {
  vista_pagina: 'PageView',
  encaja: 'Lead',
  llamada_reservada: 'Schedule',
}

export function track(evento, datos = {}) {
  const payload = { ...origen(), titular: varianteTitular(), ...datos }
  try {
    window.dataLayer = window.dataLayer || []
    window.dataLayer.push({ event: evento, ...payload })

    if (typeof window.fbq === 'function') {
      const estandar = META_ESTANDAR[evento]
      if (estandar) window.fbq('track', estandar, payload)
      else window.fbq('trackCustom', evento, payload)
    }
    if (typeof window.gtag === 'function') window.gtag('event', evento, payload)

    if (new URLSearchParams(window.location.search).has('debug')) {
      console.info('[track]', evento, payload)
    }
  } catch {
    // Medir nunca puede romper la página.
  }
}
