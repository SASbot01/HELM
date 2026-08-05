import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { ToastProvider } from './components/Toast.jsx'
import { ThemeProvider } from './contexts/ThemeContext.jsx'
import SuperAdminLogin from './pages/admin/SuperAdminLogin.jsx'
import Registro from './pages/Registro.jsx'
import UsersAdmin from './pages/UsersAdmin.jsx'
import HelmApp from './helm/HelmApp.jsx'
import FormularioPublico from './pages/FormularioPublico.jsx'
import ComunidadPublica from './pages/ComunidadPublica.jsx'
import PrimerMapa from './pages/PrimerMapa.jsx'
import SilvestreValor from './pages/SilvestreValor.jsx'
import PortalDocumentos from './pages/PortalDocumentos.jsx'
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
          {/* Registro público (crea negocio + acceso pendientes de aprobación). */}
          <Route path="/registro" element={<Registro />} />
          {/* Panel de usuarios — solo superadmins (la propia página lo comprueba). */}
          <Route path="/usersadmin" element={<UsersAdmin />} />
          {/* Lead magnet público: diagnóstico operativo. Los leads entran al
              CRM del perfil indicado en primermapa/guardar.js. */}
          <Route path="/primermap" element={<PrimerMapa />} />
          {/* Formulario público que rellena el cliente. Va ANTES de /:slug/*,
              que si no se lo tragaría como si fuese el slug de un perfil. */}
          <Route path="/f/:formId" element={<FormularioPublico />} />
          {/* Portal público de la comunidad interna de un perfil. Va ANTES de
              /:slug/* por lo mismo que /f/: si no, se lo tragaría. */}
          <Route path="/c/:slug" element={<ComunidadPublica />} />
          {/* El portal donde el cliente de una asesoria sube su documentacion.
              El token del enlace es lo que autentica; va ANTES de /:slug/* como
              todas las publicas. */}
          <Route path="/d/:token" element={<PortalDocumentos />} />
          {/* Formulario de valor de Silvestre IA. Los leads entran al CRM del
              perfil indicado en silvestreai/guardar.js. También va ANTES de
              /:slug/*, que si no leería "silvestreai" como slug de perfil. */}
          <Route path="/silvestreai" element={<Navigate to="/silvestreai/valor" replace />} />
          <Route path="/silvestreai/valor" element={<SilvestreValor />} />
          {/* HELM — app limpia (CRM · Ventas · Diario · Finanzas · Chat · Ajustes).
              /admin entra sin perfil fijado (redirige al último usado) y
              /<slug> abre directamente ese perfil: /silvestre, /enformaconhugo… */}
          <Route path="/admin/*" element={<HelmApp />} />
          <Route path="/:slug/*" element={<HelmApp />} />
          {/* Cualquier otra ruta vuelve al login. */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
        <ToastProvider />
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>
)
