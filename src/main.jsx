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
import PrimerMapa from './pages/PrimerMapa.jsx'
import SilvestreValor from './pages/SilvestreValor.jsx'
import PortalDocumentos from './pages/PortalDocumentos.jsx'
import PaginaInicio from './pages/PaginaInicio.jsx'
import PaginaInicioHugo from './pages/PaginaInicioHugo.jsx'
import Clase from './pages/Clase.jsx'
import Gracias from './pages/inicio/socio/Gracias.jsx'
import Legal from './pages/inicio/socio/Legal.jsx'
import AgentOS from './agents/AgentOS.jsx'
import './index.css'

// App reducida a HELM: se entra por /login (superadmin) → /admin (Helm).
// Todo lo demás (apex-operations, ClientApp, MID, ERP, landings, funnels…)
// se retiró del routing.

// El dominio raíz es la cara pública de la marca y los subdominios son el
// producto, pero el túnel sirve todos los hostnames desde este mismo build:
// la decisión no puede estar en el servidor, se toma aquí mirando el hostname.
//
// Cada marca con dominio propio entra aquí con su página. Añadir una es añadir
// una línea; mientras el dominio no apunte al túnel, /paginainicio (ver
// PaginaInicioPorHost más abajo) sirve para verla y para el enlace de la bio.
const PORTADAS_POR_DOMINIO = {
  's4sf.net': PaginaInicio,
  'www.s4sf.net': PaginaInicio,
  'enformaconhugo.com': PaginaInicioHugo,
  'www.enformaconhugo.com': PaginaInicioHugo,
}

// Qué hay en `/`: la portada de la marca si entras por su dominio, y el panel
// si entras por helm. o consultoria. (o en local, donde se trabaja el producto).
function Raiz() {
  const Portada = PORTADAS_POR_DOMINIO[window.location.hostname]
  return Portada ? <Portada /> : <Navigate to="/admin" replace />
}

// La misma ruta /paginainicio sirve la portada de quien la pida, mirando por
// qué dominio ha entrado. Es la misma tabla que Raiz: así el enlace de la bio
// de cada marca puede compartir el mismo path sin que una pise a la otra, y
// funciona tanto si el dominio ya apunta al túnel como si de momento se
// enseña con el hostname de Helm. Por defecto sale la de Alex, que es la
// dueña histórica de esta ruta.
function PaginaInicioPorHost() {
  const Portada = PORTADAS_POR_DOMINIO[window.location.hostname] || PaginaInicio
  return <Portada />
}

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
          <Route path="/" element={<Raiz />} />
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
          {/* El portal donde el cliente de una asesoria sube su documentacion.
              El token del enlace es lo que autentica; va ANTES de /:slug/* como
              todas las publicas. */}
          <Route path="/d/:token" element={<PortalDocumentos />} />
          {/* Formulario de valor de Silvestre IA. Los leads entran al CRM del
              perfil indicado en silvestreai/guardar.js. También va ANTES de
              /:slug/*, que si no leería "silvestreai" como slug de perfil. */}
          <Route path="/silvestreai" element={<Navigate to="/silvestreai/valor" replace />} />
          <Route path="/silvestreai/valor" element={<SilvestreValor />} />
          {/* La cara pública de la marca: el enlace de la bio de Instagram. Un
              solo path para todas las marcas — PaginaInicioPorHost mira el
              dominio y decide cuál enseña, así que enformaconhugo.com y s4sf.net
              sirven la misma ruta con contenido distinto. Va ANTES de /:slug/*
              como todas las públicas — si no, "paginainicio" se leería como el
              slug de un perfil y acabaría en el login. */}
          <Route path="/paginainicio" element={<PaginaInicioPorHost />} />
          {/* Socio IA (s4sf.net): la masterclass como salida secundaria, la
              página de después de reservar la auditoría y las legales del
              formulario. Públicas, así que ANTES de /:slug/*. */}
          <Route path="/clase" element={<Clase />} />
          <Route path="/gracias" element={<Gracias />} />
          <Route path="/privacidad" element={<Legal pagina="privacidad" />} />
          <Route path="/aviso-legal" element={<Legal pagina="aviso-legal" />} />
          {/* Agent OS — el taller del operador. Solo superadmin: la propia
              página lo comprueba y api/agents.js lo exige en el servidor. Va
              ANTES de /:slug/*, que si no leería "agents" como slug de perfil. */}
          <Route path="/agents" element={<AgentOS />} />
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
