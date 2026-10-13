// AI para todo — lo que la comunidad pública lee de HELM (las breves y el
// diario del perfil silvestre). Es la API de todas las comunidades
// (api/_lib/comunidad-publica.js) fijada a AI para todo: sigue en esta URL
// porque es la que pide s4sf.net/aiparatodo.
import { atiendeComunidad } from './_lib/comunidad-publica.js'

export default function handler(req, res) {
  return atiendeComunidad(req, res, 'aiparatodo')
}
