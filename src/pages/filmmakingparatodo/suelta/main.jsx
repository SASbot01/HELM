// Filmmaking para todo, suelta: la misma comunidad, servida desde la web de
// Abel en detrasdecamara.org/filmmakingparatodo (repo DetrasdeCamaras), fuera
// de HELM.
//
// Se construye con vite.suelta.config.js (scripts/construir-suelta.sh) y
// habla con la API de HELM en s4sf.net: las noticias y el diario por
// /api/comunidad?c=filmmakingparatodo y el alta por /api/leads. El navegador
// solo dice de qué comunidad viene; el perfil (detras-de-camra) lo pone el
// servidor.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Comunidad from '../../comunidad/Comunidad.jsx'
import FMPT from '../config.jsx'
import '../../../fonts/inter.css'
import '../ddc.css'

const HELM = 'https://s4sf.net'
const CONFIG = {
  ...FMPT,
  api: `${HELM}/api/comunidad?c=filmmakingparatodo`,
  apiBase: HELM,
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path={`${CONFIG.ruta}/*`} element={<Comunidad config={CONFIG} />} />
        <Route path="*" element={<Navigate to={CONFIG.ruta} replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
