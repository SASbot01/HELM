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

// ── El color de marca del perfil ───────────────────────────────────────────
// El tema (verde/azul/rojo…) es la preferencia de quien mira la pantalla. El
// color de marca es del NEGOCIO, y manda sobre el acento del tema: quien entra
// al panel de su empresa tiene que ver su color, no el de HELM.
//
// No se toca la paleta entera, solo el acento: los fondos, bordes y textos del
// tema siguen mandando. Cambiar el fondo por un color de marca cualquiera
// acabaría en paneles ilegibles con cada hex que alguien pegue.

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i

// Normaliza "#abc", "abc", "#AABBCC" → "#aabbcc". Null si no es un color.
export function normalizaHex(valor) {
  const v = String(valor || '').trim()
  if (!HEX.test(v)) return null
  const hex = v.replace('#', '').toLowerCase()
  const full = hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex
  return '#' + full
}

const canales = (hex) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))

// Mezcla hacia negro. Sirve para el segundo color de los degradados, que en la
// paleta original es siempre una versión más apagada del acento.
function oscurece(hex, factor) {
  const [r, g, b] = canales(hex)
  const c = (x) => Math.round(x * (1 - factor)).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

// Luminancia percibida (ITU-R BT.601). Decide si el texto que va ENCIMA del
// acento tiene que ser blanco o negro: un amarillo de marca con texto blanco
// encima no se lee, y es un color que la gente elige.
const claro = (hex) => {
  const [r, g, b] = canales(hex)
  return (r * 299 + g * 587 + b * 114) / 1000 > 150
}

const rgba = (hex, alpha) => `rgba(${canales(hex).join(',')},${alpha})`

/**
 * Las variables CSS que hay que poner en el contenedor `.helm` para que el
 * perfil se pinte con su color.
 *
 * Se sobrescriben `--cyan` y `--violet` porque son los dos que usa toda la app
 * como acento (ver theme.css: los degradados "cyan→violet" son EL acento). Con
 * esos dos y los dos brillos, el panel entero cambia de color de golpe.
 *
 * Devuelve null si no hay color válido: entonces manda el tema, que es el
 * comportamiento de siempre.
 */
export function acentoDe(color) {
  const hex = normalizaHex(color)
  if (!hex) return null
  return {
    '--cyan': hex,
    '--violet': oscurece(hex, 0.28),
    '--glow-1': rgba(hex, 0.30),
    '--glow-2': rgba(oscurece(hex, 0.35), 0.22),
    '--on-accent': claro(hex) ? '#06060B' : '#FFFFFF',
  }
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
