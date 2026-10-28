// Generación de imagen con IA para las portadas (9:16), por Replicate. La
// clave la pone Alex en .env.server como REPLICATE_API_TOKEN y nunca sale de
// aquí. Sin clave, no se inventa nada: se devuelve un error claro.
//
//   · generaFondo: solo el FONDO (Ideogram); el titular lo pone el compositor
//     encima, nítido (src/agents/portadas/componer.js). Sin caras.
//   · generaPortadaIa: la portada ENTERA en un estilo (nano-banana-pro), a
//     partir de un FOTOGRAMA REAL del reel: la persona es la del vídeo y el
//     prompt pide conservarla tal cual; no se inventa ninguna cara
//     (src/agents/portadas/estilosIa.js).
//
// Por ley (art. 50 de la Ley de IA de la UE) una imagen generada hay que
// marcarla como IA: el panel lo dice en cada portada generada.
//
// TIEMPO: delante del api-server está Cloudflare, que corta a los 100 s sin
// respuesta (524). Si la imagen llega después, el navegador ya ha recibido un
// error y la imagen se pierde (y Portadas la cobraba igual). Por eso cada
// generación tiene un `limite` (una hora, en ms) y nada pasa de él: cada
// petición a Replicate se corta al llegar, la espera de un 429 solo se hace si
// cabe y la predicción que no ha terminado se cancela en Replicate. Pasado el
// límite: error 504 con `tope: true`. Por defecto, TOPE_IMAGEN_MS desde ahora;
// quien sirve la petición pasa el suyo, contado desde que la recibió:
//   await generaPortadaIa({ prompt, imagenes, limite: inicio + TOPE_IMAGEN_MS })
const MODELO = process.env.PORTADAS_IDEOGRAM_MODELO || 'ideogram-ai/ideogram-v3-turbo'
const MODELO_PORTADA = process.env.PORTADAS_IA_MODELO || 'google/nano-banana-pro'
const MAX_BYTES = 10 * 1024 * 1024
const MAX_SALIDA_PORTADA = 15 * 1024 * 1024
// 85 s: por debajo de los 100 s de Cloudflare, con margen para cobrar y mandar
// la respuesta (una portada son unos MB en base64).
export const TOPE_IMAGEN_MS = 85_000
// Prefer: wait=N de Replicate: como mucho 60 s, y dejando unos segundos.
const MAX_WAIT_S = 60
const MARGEN_WAIT_MS = 5_000
// Una espera por 429 solo si después quedan al menos estos ms para generar.
const MIN_TRAS_429_MS = 20_000

/** ¿Hay con qué generar imágenes? (la tiene que poner Alex en el server). */
export function hayClaveImagen() {
  return Boolean(process.env.REPLICATE_API_TOKEN)
}

function faltaClave() {
  const e = new Error('Falta la clave de imagen. Añade REPLICATE_API_TOKEN en el .env.server del servidor y reinicia helm-api.')
  e.statusCode = 503
  return e
}

function primeraUrl(output) {
  if (!output) return ''
  if (typeof output === 'string') return output
  if (Array.isArray(output)) return primeraUrl(output[0])
  if (typeof output === 'object' && output.url) return String(output.url)
  return ''
}

// Lo que dice Replicate, en claro: sin saldo, frenado por saldo bajo o la
// clave mal. Sin esto, el panel enseñaba «Replicate ha respondido 402».
function errorDeReplicate(status, cuerpo) {
  const detalle = String(cuerpo?.detail || cuerpo?.title || '')
  let msg = detalle || `Replicate ha respondido ${status}`
  let code = 502
  if (status === 401) { msg = 'La clave de Replicate no vale (REPLICATE_API_TOKEN).'; code = 503 }
  else if (status === 402 || /insufficient credit/i.test(detalle)) { msg = 'Replicate se ha quedado sin saldo. Recárgalo en replicate.com/account/billing y vuelve a probar.'; code = 503 }
  else if (status === 429) { msg = 'Replicate está frenando las peticiones (con poco saldo solo deja una cada pocos segundos). Prueba en un momento.'; code = 429 }
  return Object.assign(new Error(msg), { statusCode: code })
}

/** El error de pasarse del límite: 504, con `tope` para que quien cobra sepa qué ha pasado. */
export function tardaDemasiado() {
  return Object.assign(new Error('La IA está tardando demasiado en hacer la imagen y se ha parado. Prueba otra vez en un momento.'), { statusCode: 504, tope: true })
}
const quedan = (limite) => limite - Date.now()
const duerme = (ms) => new Promise(r => setTimeout(r, ms))

/** fetch que no pasa del límite: se corta al llegar a él (también al leer el cuerpo). */
async function pide(url, opts, limite) {
  const ms = quedan(limite)
  if (ms <= 0) throw tardaDemasiado()
  try {
    return await fetch(url, { ...opts, signal: AbortSignal.timeout(ms) })
  } catch (e) {
    if (e?.name === 'TimeoutError' || e?.name === 'AbortError' || quedan(limite) <= 0) throw tardaDemasiado()
    throw e
  }
}
async function cuerpoJson(r, limite) {
  try { return await r.json() } catch (e) {
    if (e?.name === 'TimeoutError' || e?.name === 'AbortError' || quedan(limite) <= 0) throw tardaDemasiado()
    return null
  }
}

// El Prefer de Replicate: que espere lo que quepa (sin pasar de 60 s).
function prefer(limite, maxS = MAX_WAIT_S) {
  const s = Math.min(maxS, Math.floor((quedan(limite) - MARGEN_WAIT_MS) / 1000))
  return s >= 1 ? `wait=${s}` : null
}

// Lo que ya no se va a esperar, se cancela: que Replicate no siga (ni lo cobre).
// Sin esperar la respuesta y sin fallar si no se puede.
function cancela(token, p) {
  if (!p?.id || ['succeeded', 'failed', 'canceled'].includes(p.status)) return
  fetch(p.urls?.cancel || `https://api.replicate.com/v1/predictions/${p.id}/cancel`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5_000),
  }).then(() => {}, () => {})
}

async function esperaPrediccion(token, pred, { espera = 1500, limite } = {}) {
  let p = pred
  for (;;) {
    if (p?.status === 'succeeded') return p
    if (p?.status === 'failed' || p?.status === 'canceled') {
      throw new Error(`La generación ha fallado: ${p.error || p.status}`)
    }
    // No da tiempo a otra vuelta: se para aquí, y se cancela en Replicate.
    if (quedan(limite) <= espera) { cancela(token, p); throw tardaDemasiado() }
    await duerme(espera)
    let r
    try {
      r = await pide(p.urls?.get || `https://api.replicate.com/v1/predictions/${p.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      }, limite)
    } catch (e) {
      if (e?.tope) cancela(token, p)
      throw e
    }
    const siguiente = await cuerpoJson(r, limite).catch((e) => { if (e?.tope) cancela(token, p); throw e })
    // Un fallo suelto al preguntar (un 5xx, un cuerpo raro) no la da por
    // perdida: se vuelve a preguntar por la MISMA predicción, dentro del límite.
    if (r.ok && siguiente?.status) p = siguiente
  }
}

// La imagen ya generada, también dentro del límite.
async function bajaImagen(url, limite, error) {
  const img = await pide(url, {}, limite)
  if (!img.ok) throw Object.assign(new Error(error), { statusCode: 502 })
  try {
    return { tipo: img.headers.get('content-type'), buf: Buffer.from(await img.arrayBuffer()) }
  } catch (e) {
    if (e?.name === 'TimeoutError' || e?.name === 'AbortError' || quedan(limite) <= 0) throw tardaDemasiado()
    throw Object.assign(new Error(error), { statusCode: 502 })
  }
}

/**
 * Genera un fondo con Ideogram y lo devuelve como data URL para que el
 * compositor lo pinte. `aspecto` por defecto 9:16 (la portada del reel).
 * `limite`: hasta cuándo se puede esperar (ver TIEMPO arriba).
 */
export async function generaFondo({ prompt, aspecto = '9:16', limite = Date.now() + TOPE_IMAGEN_MS } = {}) {
  const token = process.env.REPLICATE_API_TOKEN
  if (!token) throw faltaClave()
  const limpio = String(prompt || '').trim()
  if (!limpio) { const e = new Error('Hace falta una descripción del fondo'); e.statusCode = 400; throw e }

  const espera = prefer(limite)
  const crear = await pide(`https://api.replicate.com/v1/models/${MODELO}/predictions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(espera ? { Prefer: espera } : {}) },
    body: JSON.stringify({ input: { prompt: limpio, aspect_ratio: aspecto } }),
  }, limite)
  const pred = await cuerpoJson(crear, limite)
  if (!crear.ok || !pred) throw errorDeReplicate(crear.status, pred)

  const fin = await esperaPrediccion(token, pred, { espera: 1500, limite })
  const url = primeraUrl(fin.output)
  if (!url) throw Object.assign(new Error('La IA no ha devuelto ninguna imagen'), { statusCode: 502 })

  const { tipo: t, buf } = await bajaImagen(url, limite, 'No se pudo descargar la imagen generada')
  const tipo = t || 'image/png'
  if (buf.length > MAX_BYTES) throw Object.assign(new Error('La imagen generada es demasiado grande'), { statusCode: 502 })
  return { dataUrl: `data:${tipo};base64,${buf.toString('base64')}`, bytes: buf.length }
}

/**
 * Genera la portada entera en un estilo. `imagenes`: data URLs; la primera es
 * el fotograma real y la segunda, si va, la referencia de estilo. Devuelve la
 * imagen como data URL. Si Replicate frena por saldo bajo (429), espera lo que
 * dice y lo reintenta un par de veces, solo si después aún da tiempo a generar.
 * `limite`: hasta cuándo se puede esperar (ver TIEMPO arriba).
 */
export async function generaPortadaIa({ prompt, imagenes, aspecto = '9:16', limite = Date.now() + TOPE_IMAGEN_MS } = {}) {
  const token = process.env.REPLICATE_API_TOKEN
  if (!token) throw faltaClave()
  if (!prompt || !imagenes?.length) throw Object.assign(new Error('Falta el fotograma o el estilo'), { statusCode: 400 })

  let pred = null
  for (let intento = 0; intento < 3; intento++) {
    const espera = prefer(limite)
    const crear = await pide(`https://api.replicate.com/v1/models/${MODELO_PORTADA}/predictions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(espera ? { Prefer: espera } : {}) },
      body: JSON.stringify({ input: { prompt, image_input: imagenes, aspect_ratio: aspecto, resolution: '2K', output_format: 'jpg' } }),
    }, limite)
    const cuerpo = await cuerpoJson(crear, limite)
    if (crear.status === 429 && intento < 2) {
      // Replicate pide la espera en la cabecera Retry-After; el cuerpo es solo
      // {detail:…}. Se respeta esa cabecera (acotada), y si no viene, 10 s.
      // Si después ya no daría tiempo a generar, no se espera: 429 ya.
      const pideS = Number(crear.headers.get('retry-after')) || Number(cuerpo?.retry_after) || 10
      const ms = (Math.min(pideS, 30) + 1) * 1000
      if (quedan(limite) - ms < MIN_TRAS_429_MS) throw errorDeReplicate(429, cuerpo)
      await duerme(ms)
      continue
    }
    if (!crear.ok || !cuerpo) throw errorDeReplicate(crear.status, cuerpo)
    pred = cuerpo
    break
  }
  if (!pred) throw errorDeReplicate(429, null)

  const fin = await esperaPrediccion(token, pred, { espera: 2000, limite })
  const url = primeraUrl(fin.output)
  if (!url) throw Object.assign(new Error('La IA no ha devuelto ninguna imagen'), { statusCode: 502 })
  const { tipo: t, buf } = await bajaImagen(url, limite, 'No se pudo descargar la portada generada')
  const tipo = t || 'image/jpeg'
  if (buf.length > MAX_SALIDA_PORTADA) throw Object.assign(new Error('La portada generada es demasiado grande'), { statusCode: 502 })
  return { dataUrl: `data:${tipo};base64,${buf.toString('base64')}`, bytes: buf.length }
}

