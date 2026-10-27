// HELM — Editor de reels: la subida por trozos. Módulo puro (sin navegador ni
// red): cómo se manda cada trozo se le pasa desde fuera. Lo usa editorApi.subir
// (src/helm/lib.js), que manda cada trozo con XMLHttpRequest.
//
// Por qué por trozos: Cloudflare corta cualquier petición de más de 100 MB y
// Node, las que tardan más de 5 minutos. Un vídeo de cientos de MB va en
// trozos de 32 MB, uno detrás de otro, cada uno en su petición:
//   · si un trozo falla por la red, se repite (hasta 3 veces, esperando un poco
//     más cada vez);
//   · el servidor dice siempre cuántos bytes tiene (`recibidos`): si un trozo
//     ya lo tenía, no lo escribe dos veces, y si no cuadra (409), se sigue
//     desde donde él diga;
//   · la barra suma lo ya confirmado más lo que lleva el trozo en curso.

export const TROZO = 32 * 1024 * 1024
export const REINTENTOS = 3
// Un servidor que contesta 409 una y otra vez no va a cuadrar nunca.
const MAX_SALTOS = 5

const cancelada = () => Object.assign(new Error('Subida cancelada'), { cancelada: true })

/** ¿Merece la pena repetir el trozo? Fallos de red, el servidor caído o ocupado. */
export const reintentable = (e) => Boolean(e?.red) || e?.status === 0 || e?.status === 408 || e?.status === 429 || e?.status >= 500

/** Espera `ms`, o corta antes si se cancela. */
export function espera(ms, senal) {
  return new Promise((ok, mal) => {
    if (senal?.aborted) return mal(cancelada())
    const t = setTimeout(() => { senal?.removeEventListener?.('abort', corta); ok() }, ms)
    function corta() { clearTimeout(t); mal(cancelada()) }
    senal?.addEventListener?.('abort', corta, { once: true })
  })
}

// Lo que graba un móvil, por si el navegador no sabe el tipo del archivo.
const TIPOS = { mp4: 'video/mp4', m4v: 'video/x-m4v', mov: 'video/quicktime', webm: 'video/webm', mkv: 'video/x-matroska', '3gp': 'video/3gpp', avi: 'video/x-msvideo', mpg: 'video/mpeg' }

/** El tipo del vídeo: el que diga el navegador o, si no lo sabe, por la extensión. */
export function tipoDeVideo(archivo) {
  const t = String(archivo?.type || '').toLowerCase()
  if (t.startsWith('video/')) return t
  const ext = String(archivo?.name || '').toLowerCase().match(/\.([a-z0-9]{2,4})$/)?.[1]
  return TIPOS[ext] || 'video/mp4'
}

/**
 * Sube `tamano` bytes en trozos de `trozo`.
 *   manda({ desde, hasta, alAvanzar(bytesDelTrozo) }) → promesa con { recibidos }
 *     (la respuesta del servidor); si falla, el error lleva `status` y `datos`
 *     (el JSON de la respuesta) o `red: true`.
 *   alProgreso(fraccion, { cargado, total })
 *   senal → AbortSignal: cancela (el error lleva `cancelada: true`)
 * Devuelve los bytes que el servidor confirma (= tamano).
 */
export async function subePorTrozos({ tamano, trozo = TROZO, manda, alProgreso = null, senal = null, reintentos = REINTENTOS, pausa = 800 }) {
  const total = Number(tamano) || 0
  const paso = Math.max(1, Number(trozo) || TROZO)
  const avisa = (n) => alProgreso?.(total ? Math.min(1, n / total) : 1, { cargado: Math.min(total, n), total })
  let hecho = 0
  let saltos = 0
  avisa(0)
  while (hecho < total) {
    if (senal?.aborted) throw cancelada()
    const desde = hecho
    const hasta = Math.min(total, desde + paso)
    for (let intento = 0; ; intento++) {
      try {
        const r = await manda({ desde, hasta, alAvanzar: (n) => avisa(desde + Math.max(0, Math.min(n, hasta - desde))) })
        const recibidos = Number(r?.recibidos)
        hecho = Number.isFinite(recibidos) ? recibidos : hasta
        // Una respuesta que no avanza es un servidor que no está guardando nada.
        if (hecho <= desde && ++saltos > MAX_SALTOS) throw Object.assign(new Error('El servidor no está guardando el vídeo'), { status: 500 })
        break
      } catch (e) {
        if (e?.cancelada || senal?.aborted) throw cancelada()
        // El servidor tiene otra cantidad: se sigue desde la suya.
        if (e?.status === 409 && Number.isFinite(Number(e?.datos?.recibidos))) {
          if (++saltos > MAX_SALTOS) throw e
          hecho = Number(e.datos.recibidos)
          break
        }
        if (reintentable(e) && intento < reintentos) { await espera(pausa * (intento + 1), senal); continue }
        throw e
      }
    }
    if (hecho > total) throw Object.assign(new Error('El servidor tiene más bytes de los que tiene el vídeo'), { status: 500 })
    avisa(hecho)
  }
  return hecho
}
