// HELM — Editor de reels: la subida por trozos. Ya no vive aquí: es la de todo
// HELM (src/helm/subida.js, la usan también Trial reels y lo que venga) y esto
// solo la reexporta, con lo que es propio del vídeo del editor.
//
// Uso:
//   import { subePorTrozos, tipoDeVideo } from './editor/subida'
//   await subePorTrozos({ url: `/api/editor?action=trozo&clientId=${clientId}&id=${id}`, archivo, alProgreso, senal })
export { TROZO, REINTENTOS, ESPERA_MAX_MS, MAX_SALTOS, esperaDe, reintentable, espera, urlDeTrozo, mandaTrozo, subePorTrozos } from '../../helm/subida.js'

// Lo que graba un móvil, por si el navegador no sabe el tipo del archivo.
const TIPOS = { mp4: 'video/mp4', m4v: 'video/x-m4v', mov: 'video/quicktime', '3gp': 'video/3gpp' }

/** El tipo del vídeo: el que diga el navegador o, si no lo sabe, por la extensión. */
export function tipoDeVideo(archivo) {
  const t = String(archivo?.type || '').toLowerCase()
  if (t.startsWith('video/')) return t
  const ext = String(archivo?.name || '').toLowerCase().match(/\.([a-z0-9]{2,4})$/)?.[1]
  return TIPOS[ext] || 'video/mp4'
}
