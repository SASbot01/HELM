// Generación de imagen con IA, solo para FONDOS de portada (9:16). El titular
// y, si hace falta, la persona van aparte: aquí se crea la escena, y el
// compositor pone el texto nítido encima (ver src/agents/portadas/componer.js).
//
// Vía Replicate con Ideogram (el que mejor compone fondos con hueco para el
// texto). La clave la pone Alex en .env.server como REPLICATE_API_TOKEN y nunca
// sale de aquí. Sin clave, no se inventa nada: se devuelve un error claro.
//
// Por ley (art. 50 de la Ley de IA de la UE) una imagen generada hay que
// marcarla como IA; el agente lo deja dicho y la portada lleva la marca de
// agua. Nunca se genera la cara real de un cliente: el prompt lo prohíbe.
const MODELO = process.env.PORTADAS_IDEOGRAM_MODELO || 'ideogram-ai/ideogram-v3-turbo'
const MAX_BYTES = 10 * 1024 * 1024

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
  if (!crear.ok || !pred) {
    const e = new Error(pred?.detail || `Replicate ha respondido ${crear.status}`)
    e.statusCode = crear.status === 401 ? 503 : 502
    throw e
  }

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
