// HELM — subir un archivo grande por trozos (el vídeo en bruto del Editor de
// reels, el de Trial reels…). El lado del servidor es api/_lib/subida-trozos.js.
//
// Uso:
//   import { subePorTrozos } from '../helm/subida.js'
//   const control = new AbortController()
//   const r = await subePorTrozos({
//     url: `/api/editor?action=trozo&clientId=${clientId}&id=${id}`,
//     archivo,                                           // File o Blob
//     alProgreso: (fraccion, { cargado, total }) => …,   // 0…1, para la barra
//     senal: control.signal,                             // cancela: el error lleva `cancelada: true`
//   })
//   // r = la última respuesta del servidor: { recibidos, completo }
//
// Cada trozo va en su petición: POST <url>&offset=N, el trozo como cuerpo
// (application/octet-stream) y la misma sesión que apiFetch (src/helm/lib.js).
//
// Por qué por trozos: Cloudflare corta cualquier petición de más de 100 MB y
// Node, las que tardan más de 5 minutos. Un vídeo de cientos de MB va en
// trozos de 32 MB, uno detrás de otro:
//   · si un trozo falla por la red (o el servidor está caído u ocupado), se
//     repite hasta REINTENTOS veces, esperando el doble cada vez (1, 2, 4, 8,
//     15 y 15 s: unos 45 s en total, lo que tarda un móvil en pasar de Wi-Fi a
//     4G y volver a tener red);
//   · el servidor dice siempre cuántos bytes tiene (`recibidos`): si un trozo
//     no le cuadra (409), se sigue desde donde él diga — así un trozo cortado a
//     medias o repetido no se escribe dos veces ni deja un agujero. Solo se
//     desconfía de un servidor que contesta MAX_SALTOS veces seguidas sin
//     avanzar: los cortes que sí avanzan pueden ser tantos como haga falta;
//   · la barra suma lo ya confirmado más lo que lleva el trozo en curso.
// Todo lo de aquí arriba es puro; solo mandaTrozo toca el navegador.

export const TROZO = 32 * 1024 * 1024
export const REINTENTOS = 6
// La espera antes de repetir un trozo: `pausa` y el doble cada vez, hasta esto.
export const ESPERA_MAX_MS = 15_000
// Un servidor que contesta una y otra vez sin avanzar no va a cuadrar nunca.
export const MAX_SALTOS = 5

const cancelada = () => Object.assign(new Error('Subida cancelada'), { cancelada: true })
const cortada = () => Object.assign(new Error('La subida se cortó. Comprueba la conexión y vuelve a probar.'), { red: true })

/** ¿Merece la pena repetir el trozo? Fallos de red, el servidor caído o ocupado. */
export const reintentable = (e) => Boolean(e?.red) || e?.status === 0 || e?.status === 408 || e?.status === 429 || e?.status >= 500

/** Lo que se espera antes del reintento número `intento` (0, 1…). */
export const esperaDe = (pausa, intento) => Math.min(ESPERA_MAX_MS, pausa * 2 ** intento)

/** Espera `ms`, o corta antes si se cancela. */
export function espera(ms, senal) {
  return new Promise((ok, mal) => {
    if (senal?.aborted) return mal(cancelada())
    const t = setTimeout(() => { senal?.removeEventListener?.('abort', corta); ok() }, ms)
    function corta() { clearTimeout(t); mal(cancelada()) }
    senal?.addEventListener?.('abort', corta, { once: true })
  })
}

/** La url del trozo que empieza en `offset` (la url ya trae su `?action=…`). */
export const urlDeTrozo = (url, offset) => `${url}${String(url).includes('?') ? '&' : '?'}offset=${offset}`

// La sesión, como apiFetch. Sin localStorage (Node, modo privado raro) no hay.
function sesion() {
  try { return globalThis.localStorage?.getItem('bw_admin_jwt') || null } catch { return null }
}
function sesionCaducada() {
  try {
    globalThis.localStorage?.removeItem('bw_admin_jwt')
    globalThis.localStorage?.removeItem('bw_superadmin')
    globalThis.localStorage?.removeItem('bw_client')
  } catch { /* sin almacenamiento */ }
  if (typeof window !== 'undefined' && window.location) window.location.href = '/login'
}

/**
 * Manda un trozo con XMLHttpRequest (lo único que sabe contar lo que lleva
 * subido). Promesa con el JSON de la respuesta; si falla, el error lleva
 * `status` y `datos` (el JSON), o `red: true`, o `cancelada: true`.
 */
export function mandaTrozo({ url, cuerpo, alAvanzar = null, senal = null }) {
  return new Promise((ok, mal) => {
    if (senal?.aborted) return mal(cancelada())
    const xhr = new XMLHttpRequest()
    const corta = () => xhr.abort()
    const fin = (fn, v) => { senal?.removeEventListener?.('abort', corta); fn(v) }
    xhr.open('POST', url)
    const token = sesion()
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.setRequestHeader('Content-Type', 'application/octet-stream')
    xhr.responseType = 'text'
    if (alAvanzar && xhr.upload) xhr.upload.onprogress = (e) => alAvanzar(Number(e.loaded) || 0)
    xhr.onload = () => {
      let datos = {}
      try { datos = JSON.parse(xhr.responseText || '{}') } catch { /* sin JSON */ }
      if (xhr.status === 401) {
        sesionCaducada()
        return fin(mal, Object.assign(new Error('Tu sesión ha caducado. Vuelve a iniciar sesión.'), { status: 401, datos }))
      }
      // Sin créditos: el panel abre la recarga, como con apiFetch.
      if (xhr.status === 402 && typeof window !== 'undefined' && window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent('helm:sin-saldo', { detail: datos?.error || null }))
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        return fin(mal, Object.assign(new Error(datos?.error || `Error ${xhr.status}`), { status: xhr.status, datos }))
      }
      fin(ok, datos)
    }
    xhr.onerror = () => fin(mal, cortada())
    xhr.ontimeout = () => fin(mal, cortada())
    xhr.onabort = () => fin(mal, cancelada())
    senal?.addEventListener?.('abort', corta, { once: true })
    xhr.send(cuerpo)
  })
}

/**
 * Sube `archivo` a `url` en trozos de `trozo` bytes (ver arriba).
 *   alProgreso(fraccion, { cargado, total })
 *   senal   → AbortSignal: cancela (el error lleva `cancelada: true`)
 *   desde   → por dónde empezar, si ya se sabe lo que tiene el servidor (si no
 *             cuadra, el servidor lo corrige con un 409)
 *   manda   → cómo se manda cada trozo (por defecto, mandaTrozo)
 * Devuelve la última respuesta del servidor ({ recibidos, completo }).
 */
export async function subePorTrozos({
  url, archivo, trozo = TROZO, alProgreso = null, senal = null,
  reintentos = REINTENTOS, pausa = 1000, desde = 0, manda = mandaTrozo,
}) {
  const total = Number(archivo?.size) || 0
  if (!total) throw new Error('El archivo está vacío.')
  const paso = Math.max(1, Number(trozo) || TROZO)
  const avisa = (n) => alProgreso?.(Math.min(1, n / total), { cargado: Math.min(total, n), total })
  let hecho = Math.max(0, Math.min(total, Number(desde) || 0))
  let ultima = { recibidos: hecho, completo: hecho >= total }
  // Respuestas seguidas que no hacen avanzar la subida. Avanzar es pasar de lo
  // más alto que el servidor ha confirmado (`maximo`): eso pone la cuenta a 0;
  // un servidor que va y viene no avanza.
  let saltos = 0
  let maximo = hecho
  const sinAvanzar = (ahora) => {
    if (ahora > maximo) { maximo = ahora; saltos = 0; return false }
    return ++saltos > MAX_SALTOS
  }
  avisa(hecho)
  while (hecho < total) {
    if (senal?.aborted) throw cancelada()
    const inicio = hecho
    const fin = Math.min(total, inicio + paso)
    for (let intento = 0; ; intento++) {
      try {
        const r = await manda({
          url: urlDeTrozo(url, inicio),
          cuerpo: archivo.slice(inicio, fin),
          alAvanzar: (n) => avisa(inicio + Math.max(0, Math.min(n, fin - inicio))),
          senal,
        })
        const recibidos = Number(r?.recibidos)
        hecho = Number.isFinite(recibidos) ? recibidos : fin
        ultima = { ...r, recibidos: hecho, completo: r?.completo ?? hecho >= total }
        // Una respuesta que no avanza es un servidor que no está guardando nada.
        if (sinAvanzar(hecho)) throw Object.assign(new Error('El servidor no está guardando el archivo.'), { status: 500, final: true })
        break
      } catch (e) {
        if (e?.cancelada || senal?.aborted) throw cancelada()
        if (e?.final) throw e
        // El servidor tiene otra cantidad: se sigue desde la suya.
        if (e?.status === 409 && Number.isFinite(Number(e?.datos?.recibidos))) {
          // Un 409 tras un corte a medias trae más bytes: eso es avanzar.
          if (sinAvanzar(Number(e.datos.recibidos))) throw e
          hecho = Number(e.datos.recibidos)
          ultima = { recibidos: hecho, completo: hecho >= total }
          break
        }
        if (reintentable(e) && intento < reintentos) { await espera(esperaDe(pausa, intento), senal); continue }
        throw e
      }
    }
    if (hecho > total) throw Object.assign(new Error('El servidor tiene más bytes de los que tiene el archivo.'), { status: 500 })
    avisa(hecho)
  }
  return ultima
}
