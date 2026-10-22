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
const MODELO = process.env.PORTADAS_IDEOGRAM_MODELO || 'ideogram-ai/ideogram-v3-turbo'
const MODELO_PORTADA = process.env.PORTADAS_IA_MODELO || 'google/nano-banana-pro'
const MAX_BYTES = 10 * 1024 * 1024
const MAX_SALIDA_PORTADA = 15 * 1024 * 1024

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

async function esperaPrediccion(token, pred, { intentos = 40, espera = 1500 } = {}) {
  let p = pred
  for (let i = 0; i < intentos; i++) {
    if (p.status === 'succeeded') return p
    if (p.status === 'failed' || p.status === 'canceled') {
      throw new Error(`La generación ha fallado: ${p.error || p.status}`)
    }
    await new Promise(r => setTimeout(r, espera))
    const r = await fetch(p.urls?.get || `https://api.replicate.com/v1/predictions/${p.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    p = await r.json()
  }
  throw new Error('La generación ha tardado demasiado. Inténtalo otra vez.')
}

/**
 * Genera un fondo con Ideogram y lo devuelve como data URL para que el
 * compositor lo pinte. `aspecto` por defecto 9:16 (la portada del reel).
 */
export async function generaFondo({ prompt, aspecto = '9:16' } = {}) {
  const token = process.env.REPLICATE_API_TOKEN
  if (!token) throw faltaClave()
  const limpio = String(prompt || '').trim()
  if (!limpio) { const e = new Error('Hace falta una descripción del fondo'); e.statusCode = 400; throw e }

  const crear = await fetch(`https://api.replicate.com/v1/models/${MODELO}/predictions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'wait' },
    body: JSON.stringify({ input: { prompt: limpio, aspect_ratio: aspecto } }),
  })
  const pred = await crear.json().catch(() => null)
  if (!crear.ok || !pred) throw errorDeReplicate(crear.status, pred)

  const fin = await esperaPrediccion(token, pred)
  const url = primeraUrl(fin.output)
  if (!url) throw Object.assign(new Error('La IA no ha devuelto ninguna imagen'), { statusCode: 502 })

  const img = await fetch(url)
  if (!img.ok) throw Object.assign(new Error('No se pudo descargar la imagen generada'), { statusCode: 502 })
  const tipo = img.headers.get('content-type') || 'image/png'
  const buf = Buffer.from(await img.arrayBuffer())
  if (buf.length > MAX_BYTES) throw Object.assign(new Error('La imagen generada es demasiado grande'), { statusCode: 502 })
  return { dataUrl: `data:${tipo};base64,${buf.toString('base64')}`, bytes: buf.length }
}

/**
 * Genera la portada entera en un estilo. `imagenes`: data URLs; la primera es
 * el fotograma real y la segunda, si va, la referencia de estilo. Devuelve la
 * imagen como data URL. Si Replicate frena por saldo bajo (429), espera lo que
 * dice y lo reintenta un par de veces.
 */
export async function generaPortadaIa({ prompt, imagenes, aspecto = '9:16' } = {}) {
  const token = process.env.REPLICATE_API_TOKEN
  if (!token) throw faltaClave()
  if (!prompt || !imagenes?.length) throw Object.assign(new Error('Falta el fotograma o el estilo'), { statusCode: 400 })

  let pred = null
  for (let intento = 0; intento < 3; intento++) {
    const crear = await fetch(`https://api.replicate.com/v1/models/${MODELO_PORTADA}/predictions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'wait=60' },
      body: JSON.stringify({ input: { prompt, image_input: imagenes, aspect_ratio: aspecto, resolution: '2K', output_format: 'jpg' } }),
    })
    const cuerpo = await crear.json().catch(() => null)
    if (crear.status === 429 && intento < 2) {
      await new Promise(r => setTimeout(r, (Math.min(Number(cuerpo?.retry_after) || 10, 30) + 1) * 1000))
      continue
    }
    if (!crear.ok || !cuerpo) throw errorDeReplicate(crear.status, cuerpo)
    pred = cuerpo
    break
  }
  if (!pred) throw errorDeReplicate(429, null)

  const fin = await esperaPrediccion(token, pred, { intentos: 60, espera: 2000 })
  const url = primeraUrl(fin.output)
  if (!url) throw Object.assign(new Error('La IA no ha devuelto ninguna imagen'), { statusCode: 502 })
  const img = await fetch(url)
  if (!img.ok) throw Object.assign(new Error('No se pudo descargar la portada generada'), { statusCode: 502 })
  const tipo = img.headers.get('content-type') || 'image/jpeg'
  const buf = Buffer.from(await img.arrayBuffer())
  if (buf.length > MAX_SALIDA_PORTADA) throw Object.assign(new Error('La portada generada es demasiado grande'), { statusCode: 502 })
  return { dataUrl: `data:${tipo};base64,${buf.toString('base64')}`, bytes: buf.length }
}

