import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { ToastProvider } from './components/Toast.jsx'
import { ThemeProvider } from './contexts/ThemeContext.jsx'
import SuperAdminLogin from './pages/admin/SuperAdminLogin.jsx'
import HelmApp from './helm/HelmApp.jsx'
import './index.css'

// App reducida a HELM: se entra por /login (superadmin) → /admin (Helm).
// Todo lo demás (apex-operations, ClientApp, MID, ERP, landings, funnels…)
// se retiró del routing.

// Scroll al top en cada cambio de ruta, respetando anclas #hash.
function ScrollToTop() {
  const { pathname, hash } = useLocation()
  useEffect(() => {
    if (hash) {
      const el = document.querySelector(hash)
      if (el) { el.scrollIntoView({ behavior: 'auto' }); return }
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [pathname, hash])
  return null
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <BrowserRouter>
        <ScrollToTop />
        <Routes>
          <Route path="/" element={<Navigate to="/admin" replace />} />
          <Route path="/login" element={<SuperAdminLogin />} />
          {/* HELM — app limpia (CRM · Ventas · Diario · Finanzas · Informe · Plugins). */}
          <Route path="/admin/*" element={<HelmApp />} />
          {/* Cualquier otra ruta vuelve al login. */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
        <ToastProvider />
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>
)
