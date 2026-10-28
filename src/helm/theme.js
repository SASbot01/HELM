// HELM — el tema visual.
//
// Un solo tema y un solo color. Antes había cinco temas elegibles por
// navegador (negro, verde, azul, rojo, blanco) y, encima, el color de marca de
// cada perfil pisaba el acento del tema. El resultado era que HELM no tenía
// aspecto propio: cada cliente y cada navegador veían una aplicación distinta,
// los estados (error, aviso, éxito) chocaban con un acento que cambiaba solo, y
// no había forma de diseñar nada con criterio.
//
// Ahora la paleta vive entera en theme.css y no la pisa nadie. Este módulo se
// queda solo con lo que el resto de la app sigue llamando.
//
// El color de marca del perfil NO desaparece: sigue en `clients.primary_color`
// y se usa donde de verdad representa al negocio — la tarjeta que sale al
// compartir el enlace (api/portal-meta.js) y el icono de la pestaña
// (marcaPestana). Lo que ya no hace es repintar el panel.
import { useCallback, useEffect } from 'react'

// El fondo del NAVEGADOR: el rebote del scroll y la barra de estado del móvil
// quedan fuera del contenedor .helm, así que hay que pintarlos aparte o asoma
// una franja de otro color al hacer scroll. Es el mismo --bg de theme.css.
const BG = '#070708'

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i

// Normaliza "#abc", "abc", "#AABBCC" → "#aabbcc". Null si no es un color.
// La sigue usando Ajustes para validar el color de marca del perfil.
export function normalizaHex(valor) {
  const v = String(valor || '').trim()
  if (!HEX.test(v)) return null
  const hex = v.replace('#', '').toLowerCase()
  const full = hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex
  return '#' + full
}

/**
 * Antes devolvía las variables CSS con las que el color de marca del perfil
 * repintaba el panel entero. Ahora devuelve null siempre: el acento de HELM es
 * uno y no se negocia.
 *
 * Se mantiene la función —y no se borra la llamada en HelmApp— porque
 * `style={acentoDe(...) || undefined}` ya trataba el null como "no pintes
 * nada", que es exactamente el comportamiento que queremos.
 */
export function acentoDe() {
  return null
}

/**
 * Devuelve siempre el mismo tema. La firma se mantiene ([valor, setter])
 * porque la usan HelmApp, Ajustes, FormularioPublico y PortalDocumentos.
 */
export function useHelmTheme() {
  const setTheme = useCallback(() => {}, [])

  useEffect(() => {
    document.documentElement.style.backgroundColor = BG
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BG)
  }, [])

  return ['helm', setTheme]
}
