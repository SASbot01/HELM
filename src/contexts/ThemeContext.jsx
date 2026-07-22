// ThemeContext — owner del per-user theme toggle (light/dark).
//
// Diseño:
// - El bootstrap visual ya pasó en index.html (inline-script lee
//   localStorage('blackwolf-theme') y agrega .theme-{light|dark} a <html>
//   antes de que React monte). Aquí solo manejamos la transición y la
//   sincronización con team.theme_preference del servidor.
//
// - Persistencia: localStorage es la fuente de verdad para el render
//   inicial (sobrevive a recarga sin necesidad de fetch). El servidor
//   (team.theme_preference) es la fuente de verdad cross-device — se
//   reconcilia cuando ClientApp termina de cargar el userMember:
//     setTheme(member.theme_preference, { skipApi: true })
//
// - El POST a /api/profile/update lo dispara MyProfilePage cuando el
//   usuario cambia el toggle, no este context. Mantiene este module
//   agnóstico de auth/identity.

import { createContext, useContext, useEffect, useState, useCallback } from 'react'

const STORAGE_KEY = 'blackwolf-theme'
const VALID = new Set(['light', 'dark'])

const ThemeContext = createContext({
  theme: 'light',
  setTheme: () => {},
})

function readInitial() {
  // El inline-script ya puso una clase en <html>. Confiamos en ella primero
  // (asi nunca discrepamos del primer paint).
  if (typeof document !== 'undefined') {
    if (document.documentElement.classList.contains('theme-dark')) return 'dark'
    if (document.documentElement.classList.contains('theme-light')) return 'light'
  }
  // Fallback (SSR/testing): localStorage.
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (VALID.has(v)) return v
  } catch (e) { if (import.meta.env.DEV) console.debug('silent catch', e?.message) }
  return 'light'
}

function applyToDom(next) {
  if (typeof document === 'undefined') return
  const html = document.documentElement
  if (next === 'dark') {
    html.classList.remove('theme-light')
    html.classList.add('theme-dark')
  } else {
    html.classList.remove('theme-dark')
    html.classList.add('theme-light')
  }
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(readInitial)

  // Defensa: si algo externo (otro tab, devtools, otra pestaña haciendo
  // localStorage.setItem) cambia el theme, sincronizamos.
  useEffect(() => {
    function onStorage(e) {
      if (e.key !== STORAGE_KEY) return
      const next = VALID.has(e.newValue) ? e.newValue : 'light'
      setThemeState(next)
      applyToDom(next)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const setTheme = useCallback((next) => {
    if (!VALID.has(next)) return
    setThemeState(next)
    applyToDom(next)
    try { localStorage.setItem(STORAGE_KEY, next) } catch (e) { if (import.meta.env.DEV) console.debug('silent catch', e?.message) }
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
