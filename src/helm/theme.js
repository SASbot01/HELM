// HELM — el tema visual (verde / blanco / negro).
//
// Solo cambia el atributo data-theme del contenedor .helm; los colores los
// resuelve theme.css. Se guarda por navegador, no por perfil: es una
// preferencia de quien mira la pantalla, no un dato del negocio.
import { useCallback, useEffect, useState } from 'react'
import { productoActual } from './producto'

// `bg` es el color de fondo del NAVEGADOR (rebote del scroll, barra de estado
// del móvil). Vive aquí y no en el CSS porque hay que pintarlo en el <html> y
// en la meta theme-color, fuera del contenedor .helm.
export const THEMES = [
  { key: 'verde',  label: 'Verde',  desc: 'OLED con acento esmeralda. El de siempre.', bg: '#05100A' },
  { key: 'azul',   label: 'Azul',   desc: 'OLED con acento azul eléctrico.',           bg: '#050A16' },
  { key: 'rojo',   label: 'Rojo',   desc: 'OLED con acento carmesí. Intenso.',         bg: '#0E0709' },
  { key: 'negro',  label: 'Negro',  desc: 'Monocromo puro. Sin acento de color.',      bg: '#000000' },
  { key: 'blanco', label: 'Blanco', desc: 'Fondo claro, para trabajar con luz o proyectar.', bg: '#EFF2F0' },
  // No aparece en el selector (ver TEMAS_ELEGIBLES): lo fija el producto.
  { key: 'toga', label: 'Toga', desc: 'Pizarra fría con acento azul acero.', bg: '#0B0F14', oculto: true },
]

// Los que se ofrecen en Ajustes. El del vertical no se elige a mano.
export const TEMAS_ELEGIBLES = THEMES.filter(t => !t.oculto)
const KEYS = THEMES.map(t => t.key)
const STORAGE_KEY = 'helm_theme'
export const DEFAULT_THEME = 'verde'

export function readTheme() {
  // El vertical de consultoría lleva su propio tema y no es elegible: un
  // despacho no se presenta con el verde neón de un infoproductor, y dejar que
  // cada usuario lo cambie rompe la identidad del producto que se le vende.
  const fijo = productoActual().tema
  if (fijo) return fijo
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return KEYS.includes(v) ? v : DEFAULT_THEME
  } catch { return DEFAULT_THEME }
}

export function useHelmTheme() {
  const [theme, setThemeState] = useState(readTheme)

  const setTheme = useCallback((next) => {
    const v = KEYS.includes(next) ? next : DEFAULT_THEME
    setThemeState(v)
    try { localStorage.setItem(STORAGE_KEY, v) } catch { /* modo incógnito: se pierde al cerrar, y ya */ }
    // Avisa a las demás pestañas y a Ajustes, que también pinta el selector.
    window.dispatchEvent(new CustomEvent('helm:theme', { detail: v }))
  }, [])

  // Un cambio desde otra pestaña (o desde Ajustes mientras el shell ya está
  // montado) tiene que reflejarse aquí sin recargar.
  useEffect(() => {
    const onLocal = (e) => setThemeState(e.detail)
    const onStorage = (e) => { if (e.key === STORAGE_KEY) setThemeState(readTheme()) }
    window.addEventListener('helm:theme', onLocal)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener('helm:theme', onLocal)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  // El fondo del navegador (rebote del scroll, barra de estado en móvil) debe
  // seguir al tema; si no, en tema blanco asoma una franja negra al hacer scroll.
  useEffect(() => {
    const bg = THEMES.find(t => t.key === theme)?.bg || THEMES[0].bg
    document.documentElement.style.backgroundColor = bg
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg)
  }, [theme])

  return [theme, setTheme]
}
