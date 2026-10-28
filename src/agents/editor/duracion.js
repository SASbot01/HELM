// HELM — Editor de reels: cuánto dura un vídeo, leído en el navegador antes de
// subirlo. Para enseñar el PRECIO antes de pagar nada (1,50 € por cada bloque
// de 3 minutos, src/helm/precios.js) y para no subir 800 MB de algo que pasa
// de 10 minutos. El servidor lo vuelve a medir con ffprobe al lanzar.
//
// Uso:
//   import { leeDuracion } from './editor/duracion'
//   const segundos = await leeDuracion(archivo)   // número, o null si no se sabe
//
// Un <video> que solo carga los metadatos: no reproduce, no descarga nada y
// no se pega en la página. Si el navegador no sabe leerlo (un códec raro) o
// tarda más de `espera`, devuelve null: el precio se calcula entonces al subir.

export function leeDuracion(archivo, { espera = 15_000 } = {}) {
  return new Promise((ok) => {
    if (!archivo || typeof document === 'undefined' || typeof URL?.createObjectURL !== 'function') return ok(null)
    const video = document.createElement('video')
    const url = URL.createObjectURL(archivo)
    let hecho = false
    const fin = (d) => {
      if (hecho) return
      hecho = true
      clearTimeout(reloj)
      video.onloadedmetadata = null; video.ontimeupdate = null; video.onerror = null
      video.removeAttribute('src')
      try { video.load() } catch { /* sin load (jsdom) */ }
      URL.revokeObjectURL(url)
      const n = Number(d)
      ok(Number.isFinite(n) && n > 0 ? n : null)
    }
    const reloj = setTimeout(() => fin(null), espera)
    video.preload = 'metadata'
    video.muted = true
    video.onloadedmetadata = () => {
      // Algunos WebM y MP4 sin índice dicen Infinity hasta que se busca al
      // final: entonces el navegador ya sabe lo que mide.
      if (video.duration === Infinity) {
        video.ontimeupdate = () => fin(video.duration)
        video.currentTime = 1e9
        return
      }
      fin(video.duration)
    }
    video.onerror = () => fin(null)
    video.src = url
  })
}
