import { StrictMode, Suspense, lazy, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { ThemeProvider } from './contexts/ThemeContext.jsx'
import SuperAdminLogin from './pages/admin/SuperAdminLogin.jsx'
import Registro from './pages/Registro.jsx'
import UsersAdmin from './pages/UsersAdmin.jsx'
import HelmApp from './helm/HelmApp.jsx'
import { origen } from './pages/inicio/socio/origen.js'
import './index.css'

// Las páginas públicas y el Agent OS van cada una en su propio archivo: quien
// entra a una landing no se descarga el panel, ni al revés. El panel, el login
// y el registro siguen en el principal porque tema.css (abajo) tiene que
// cargar después de sus estilos para mandar sobre ellos.
//
// Si un archivo no carga (un despliegue cambia los nombres de los archivos y
// la pestaña abierta pide uno que ya no existe, o se corta la red), se recarga
// la página una vez para traer los nuevos. Sin esto, React desmonta todo y se
// queda en blanco. La marca de tiempo evita un bucle si el fallo es otro.
const perezoso = (cargar) => lazy(() => cargar().catch((e) => {
  try {
    const ultima = Number(sessionStorage.getItem('aip.recarga')) || 0
    if (Date.now() - ultima > 30_000) {
      sessionStorage.setItem('aip.recarga', String(Date.now()))
      window.location.reload()
      return new Promise(() => {})
    }
  } catch { /* sin sessionStorage: que salga el error */ }
  throw e
}))
const AIParaTodo = perezoso(() => import('./pages/aiparatodo/AIParaTodo.jsx'))
const FormularioPublico = perezoso(() => import('./pages/FormularioPublico.jsx'))
const PrimerMapa = perezoso(() => import('./pages/PrimerMapa.jsx'))
const SilvestreValor = perezoso(() => import('./pages/SilvestreValor.jsx'))
const PortalDocumentos = perezoso(() => import('./pages/PortalDocumentos.jsx'))
const PaginaInicio = perezoso(() => import('./pages/PaginaInicio.jsx'))
const PaginaInicioHugo = perezoso(() => import('./pages/PaginaInicioHugo.jsx'))
const Clase = perezoso(() => import('./pages/Clase.jsx'))
const SocioIA = perezoso(() => import('./pages/inicio/socio/SocioIA.jsx'))
const Gracias = perezoso(() => import('./pages/inicio/socio/Gracias.jsx'))
const Legal = perezoso(() => import('./pages/inicio/socio/Legal.jsx'))
const AgentOS = perezoso(() => import('./agents/AgentOS.jsx'))
const WebHelm = perezoso(() => import('./pages/helm/Web.jsx'))
const Plataforma = perezoso(() => import('./helm/Plataforma.jsx'))
// El tema de HELM va después de theme.css (que carga HelmApp) para mandar sobre él.
import './helm/tema.css'

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

// El panel vive en helm.s4sf.net. Por un dominio de marca (s4sf.net,
// enformaconhugo.com) solo se sirve lo público: quien abre ahí /admin, /login
// o un /<perfil> salta al mismo sitio en el dominio del panel.
const DOMINIO_PANEL = 'helm.s4sf.net'
function SoloEnElPanel({ children }) {
  const enMarca = Boolean(PORTADAS_POR_DOMINIO[window.location.hostname])
  useEffect(() => {
    if (!enMarca) return
    const { pathname, search, hash } = window.location
    window.location.replace(`https://${DOMINIO_PANEL}${pathname}${search}${hash}`)
  }, [enMarca])
  return enMarca ? null : children
}

// /nonegociables: la guía en PDF, que vive en AI para todo. Se conservan las
// UTM del enlace para que el alta sepa de qué Reel vino.
function NoNegociables() {
  const { search } = useLocation()
  origen()   // guarda las UTM antes de redirigir (ver src/pages/inicio/socio/origen.js)
  return <Navigate to={`/aiparatodo/guia/no-negociables/mis-8-no-negociables-con-claude${search}`} replace />
}

// Qué hay en `/`: la portada de la marca si entras por su dominio; por el del
// panel (o en local), el panel si hay sesión y la web de HELM si no.
function Raiz() {
  const Portada = PORTADAS_POR_DOMINIO[window.location.hostname]
  if (Portada) return <Portada />
  return localStorage.getItem('bw_admin_jwt') ? <Navigate to="/admin" replace /> : <WebHelm />
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
        <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<Raiz />} />
          <Route path="/login" element={<SoloEnElPanel><SuperAdminLogin /></SoloEnElPanel>} />
          {/* Registro público: crea la agencia y entra directo, sin aprobación. */}
          <Route path="/registro" element={<SoloEnElPanel><Registro /></SoloEnElPanel>} />
          {/* La web del producto, también con sesión abierta (en / se salta al panel). */}
          <Route path="/web" element={<SoloEnElPanel><WebHelm /></SoloEnElPanel>} />
          <Route path="/plataforma" element={<SoloEnElPanel><Plataforma /></SoloEnElPanel>} />
          {/* Panel de usuarios — solo superadmins (la propia página lo comprueba). */}
          <Route path="/usersadmin" element={<SoloEnElPanel><UsersAdmin /></SoloEnElPanel>} />
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
          {/* s4sf.net: la página de la bio también en /clase (es el enlace al
              que manda el formulario de /empresas a quien no encaja), Socio IA
              en /empresas —el botón «¿Eres una empresa o negocio?»—, la
              página de después de reservar la auditoría y las legales del
              formulario. Públicas, así que ANTES de /:slug/*. */}
          <Route path="/clase" element={<Clase />} />
          <Route path="/empresas" element={<SocioIA />} />
          {/* AI para todo: la comunidad gratis de la bio, con sus rutas dentro. */}
          <Route path="/aiparatodo/*" element={<AIParaTodo />} />
          {/* La guía en PDF de los no negociables: pública, sin sesión, y con
              el alta en el CRM (embudo «Lead magnet»). Vive dentro de AI para
              todo; esto es el enlace corto. */}
          <Route path="/nonegociables" element={<NoNegociables />} />
          <Route path="/gracias" element={<Gracias />} />
          <Route path="/privacidad" element={<Legal pagina="privacidad" />} />
          <Route path="/aviso-legal" element={<Legal pagina="aviso-legal" />} />
          {/* Agent OS — el taller del operador. Solo superadmin: la propia
              página lo comprueba y api/agents.js lo exige en el servidor. Va
              ANTES de /:slug/*, que si no leería "agents" como slug de perfil. */}
          <Route path="/agents/*" element={<SoloEnElPanel><AgentOS /></SoloEnElPanel>} />
          {/* HELM — app limpia (CRM · Ventas · Diario · Finanzas · Chat · Ajustes).
              /admin entra sin perfil fijado (redirige al último usado) y
              /<slug> abre directamente ese perfil: /silvestre, /enformaconhugo… */}
          <Route path="/admin/*" element={<SoloEnElPanel><HelmApp /></SoloEnElPanel>} />
          <Route path="/:slug/*" element={<SoloEnElPanel><HelmApp /></SoloEnElPanel>} />
          {/* Cualquier otra ruta vuelve al login. */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
        </Suspense>
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>
)
