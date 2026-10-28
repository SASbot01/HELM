// Las comunidades públicas — lo que leen de HELM (las breves y el diario de su
// perfil), por su clave: GET /api/comunidad?c=<clave>&action=…
//
// La clave solo vale si está en la lista cerrada de api/_lib/comunidades.js,
// que es la que dice qué perfil lee cada una. Un perfil nunca sale de la URL.
// (AI para todo tiene además su propia URL, /api/aiparatodo.)
import { atiendeComunidad } from './_lib/comunidad-publica.js'

export default function handler(req, res) {
  return atiendeComunidad(req, res, req.query?.c)
}
