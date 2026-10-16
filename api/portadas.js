// HELM — Portadas de reels: el agente que propone el texto de la portada y el
// material con el que el panel la compone (el fotograma real del reel).
//
//   GET  ?action=marca  &clientId=             → el kit de la serie del perfil
//   POST ?action=marca  { clientId, marca }    → guardarlo
//   POST ?action=textos { clientId, mediaId }  → 3 propuestas de texto (gasta créditos)
//   GET  ?action=video  &clientId=&mediaId=    → el vídeo del reel, para elegir fotograma
//   GET  ?action=imagen &clientId=&mediaId=    → la portada actual
//
// La imagen NO la pinta una IA. El estudio de portadas (docs/estudio-portadas-
// reels.md) lo deja claro: la portada convierte en el perfil y en Explorar, y
// lo que funciona es texto corto, legible y en serie sobre la cara real. Una
// IA de imagen deforma caras, se come las tildes y obliga a avisar (Ley de IA,
// art. 50), y la cara del cliente saldría a un tercero. Así que Claude propone
// el texto, el navegador compone con tipografía sobre el fotograma
// (src/agents/portadas/componer.js) y la cara no sale de HELM.
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { supabase } from './lib/supabase.js'
import { applyCors, rateLimit, getClientIp } from './_lib/auth.js'
import { requireProfileAccess } from './_lib/access.js'
import { llmChat } from './_lib/llm.js'
import { getToken, getMediaUrls } from './_lib/instagram.js'
import { fetchPublico } from './_lib/web.js'
import {
  normalizaMarca, normalizaOpciones, MARCA_POR_DEFECTO, PLANTILLAS, PALABRAS, MAX_CARACTERES,
} from '../src/agents/portadas/reglas.js'

const CLAVE_MARCA = 'portadas-marca'
// Del CDN de Meta y de nada más: esto descarga lo que diga la Graph API, y una
// dirección de otro sitio sería que algo ha ido muy mal.
const CDN_META = /(^|\.)(cdninstagram\.com|fbcdn\.net)$/i
const MAX_VIDEO = 200 * 1024 * 1024
const MAX_IMAGEN = 20 * 1024 * 1024

const REGLAS = `Diseñas el TEXTO de portadas de reels de Instagram en español de España para cuentas de negocio y creadores. La portada no da alcance: convierte en el perfil y en Explorar, cuando alguien decide si seguir la cuenta y qué otro vídeo ver. Se ve recortada a 3:4 en la cuadrícula, pequeña (unos 130 px de ancho en el móvil).

REGLAS DEL TEXTO
1. Sale de la promesa más concreta que el vídeo CUMPLE según el caption: una cifra, un resultado, la pregunta del cliente o un nombre propio. Prohibido prometer lo que no está.
2. Entre ${PALABRAS.min} y ${PALABRAS.max} palabras y ${MAX_CARACTERES} caracteres como mucho; si es una pregunta del cliente entre comillas, hasta ${PALABRAS.maxPregunta} palabras.
3. Las 3 opciones cambian de ÁNGULO, no de sinónimos: (A) beneficio o cifra, (B) pregunta en voz del cliente o curiosidad, (C) idea contraria o nombre propio con novedad.
4. No repitas la primera línea del caption ni el gancho literal: complétalos.
5. Una sola palabra resaltada, que esté en el texto. Mayúsculas con tilde, «¿» y «¡» obligatorios, cifras en número, sin emojis, sin anglicismos salvo marcas.
6. Nada de imitar cuentas, logos o tuits de terceros; nada de salud milagrosa ni de ingresos garantizados.
7. Respeta el tono de la marca (Biblia) si la hay.

PLANTILLAS: ${PLANTILLAS.map(p => `${p.id} (${p.nombre})`).join(', ')}. Elige la que encaje: «pregunta» para la voz del cliente, «numero» si el texto lleva una cifra protagonista, «etiqueta» si la serie tiene etiqueta, «arriba» o «costura» para el resto.

Responde SOLO con JSON, sin nada alrededor:
{"opciones":[{"texto":"…","resaltada":"…","secundario":"","plantilla":"…","angulo":"A · beneficio","porque":"una frase"}]}`

const recorta = (s, n) => String(s || '').slice(0, n)

async function marcaDe(clientId) {
  const { data } = await supabase.from('agent_memory').select('id, contenido')
    .eq('client_id', clientId).eq('clave', CLAVE_MARCA).maybeSingle()
  let guardada = {}
  try { guardada = data?.contenido ? JSON.parse(data.contenido) : {} } catch { guardada = {} }
  return { id: data?.id || null, marca: normalizaMarca({ ...MARCA_POR_DEFECTO, ...guardada }) }
}

/** El JSON de la respuesta del modelo, aunque venga con texto alrededor. */
export function extraeJson(texto) {
  const s = String(texto || '')
  const a = s.indexOf('{')
  const b = s.lastIndexOf('}')
  if (a < 0 || b <= a) return null
  try { return JSON.parse(s.slice(a, b + 1)) } catch { return null }
}

/** Descarga del CDN de Meta y la sirve tal cual, con tope de tamaño. */
async function sirveDelCdn(res, url, { max, tipos }) {
  let host
  try { host = new URL(url).hostname } catch { host = '' }
  if (!CDN_META.test(host)) return res.status(502).json({ error: 'Instagram ha devuelto una dirección inesperada' })
  const r = await fetchPublico(url, { headers: { Accept: tipos } })
  if (!r || !r.ok || !r.body) return res.status(502).json({ error: 'Instagram no ha dejado descargar el archivo' })
  const largo = Number(r.headers.get('content-length') || 0)
  if (largo > max) return res.status(413).json({ error: 'El archivo es demasiado grande' })
  res.setHeader('Content-Type', r.headers.get('content-type') || 'application/octet-stream')
  if (largo) res.setHeader('Content-Length', String(largo))
  res.setHeader('Cache-Control', 'private, max-age=600')
  let total = 0
  const tope = new Transform({
    transform(trozo, _c, cb) {
      total += trozo.length
      if (total > max) return cb(new Error('demasiado grande'))
      cb(null, trozo)
    },
  })
  try {
    await pipeline(Readable.fromWeb(r.body), tope, res)
  } catch (e) {
    if (!res.headersSent) return res.status(502).json({ error: 'No se pudo descargar el archivo' })
    res.destroy(e)
  }
  return undefined
}

export default async function handler(req, res) {
  applyCors(req, res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  const action = req.query.action
  const gate = rateLimit({ key: `portadas:${getClientIp(req)}`, max: 60, windowMs: 60_000 })
  if (!gate.ok) {
    res.setHeader('Retry-After', String(gate.retryAfter))
    return res.status(429).json({ error: 'Demasiadas peticiones seguidas', retryAfter: gate.retryAfter })
  }

  const clientId = req.query.clientId || req.body?.clientId
  if (req.query?.clientId && req.body?.clientId && String(req.query.clientId) !== String(req.body.clientId)) {
    return res.status(400).json({ error: 'El perfil de la URL y el del cuerpo no coinciden' })
  }
  if (!clientId) return res.status(400).json({ error: 'clientId requerido' })

  try {
    await requireProfileAccess(req, clientId)
  } catch (err) {
    return res.status(err.statusCode || 401).json({ error: err.message })
  }

  try {
    // ── GET ?action=marca ──────────────────────────────────────────────────
    if (req.method === 'GET' && action === 'marca') {
      const { marca } = await marcaDe(clientId)
      return res.status(200).json({ marca })
    }

    // ── POST ?action=marca ─────────────────────────────────────────────────
    if (req.method === 'POST' && action === 'marca') {
      const marca = normalizaMarca(req.body?.marca)
      const { id } = await marcaDe(clientId)
      const fila = { contenido: JSON.stringify(marca), updated_at: new Date().toISOString() }
      const { error } = id
        ? await supabase.from('agent_memory').update(fila).eq('id', id).eq('client_id', clientId)
        : await supabase.from('agent_memory').insert({
          ...fila, client_id: clientId, clave: CLAVE_MARCA, ambito: 'portadas', agente: 'portadas', tipo: 'marca',
        })
      if (error) return res.status(500).json({ error: 'No se pudo guardar el kit: ' + error.message })
      return res.status(200).json({ ok: true, marca })
    }

    // ── POST ?action=textos ────────────────────────────────────────────────
    // Lo único que gasta: Claude lee el reel y la Biblia y propone 3 textos.
    if (req.method === 'POST' && action === 'textos') {
      const mediaId = String(req.body?.mediaId || '')
      const { data: reel } = await supabase.from('helm_ig_media')
        .select('media_id, caption, publicado_en, visitas, retencion_media, guardados, compartidos')
        .eq('client_id', clientId).eq('media_id', mediaId).maybeSingle()
      if (!reel) return res.status(404).json({ error: 'No encuentro ese reel en este perfil' })
      if (!String(reel.caption || '').trim()) return res.status(400).json({ error: 'Ese reel no tiene caption: escribe tú el texto de la portada' })

      const [{ data: biblias }, { marca }] = await Promise.all([
        supabase.from('helm_biblia').select('kind, content').eq('client_id', clientId),
        marcaDe(clientId),
      ])
      const biblia = (biblias || []).map(b => `## Biblia de ${b.kind}\n${recorta(b.content, 3500)}`).join('\n\n')
      const usuario = [
        `CAPTION DEL REEL:\n${recorta(reel.caption, 2200)}`,
        `DATOS: ${Number(reel.visitas) || 0} visualizaciones · ${Number(reel.guardados) || 0} guardados · ${Number(reel.compartidos) || 0} compartidos${reel.retencion_media ? ` · ${Number(reel.retencion_media).toFixed(1)} s de visionado medio` : ''}.`,
        marca.etiqueta ? `ETIQUETA DE LA SERIE: ${marca.etiqueta}` : '',
        biblia ? `MARCA:\n${biblia}` : 'MARCA: sin Biblia todavía; usa un tono claro y directo.',
        'Dame las 3 opciones.',
      ].filter(Boolean).join('\n\n')

      let respuesta
      try {
        respuesta = await llmChat({ clientId, system: REGLAS, messages: [{ role: 'user', content: usuario }], maxTokens: 900, temperature: 0.7 })
      } catch (err) {
        return res.status(err.statusCode || 502).json({ error: err.message || 'La IA no ha respondido' })
      }
      const opciones = normalizaOpciones(extraeJson(respuesta)?.opciones)
      if (!opciones.length) return res.status(502).json({ error: 'La IA no ha dado ninguna opción válida. Prueba otra vez.' })
      return res.status(200).json({ opciones })
    }

    // ── GET ?action=video | imagen ─────────────────────────────────────────
    if (req.method === 'GET' && (action === 'video' || action === 'imagen')) {
      const mediaId = String(req.query.mediaId || '')
      // Solo publicaciones de ESTE perfil: el id de otra cuenta no se pide a
      // Meta con el token de esta.
      const { data: reel } = await supabase.from('helm_ig_media').select('media_id')
        .eq('client_id', clientId).eq('media_id', mediaId).maybeSingle()
      if (!reel) return res.status(404).json({ error: 'No encuentro ese reel en este perfil' })
      const { token } = await getToken(supabase, clientId)
      const urls = await getMediaUrls(token, mediaId)
      const url = action === 'video' ? urls.video : urls.imagen
      if (!url) return res.status(404).json({ error: action === 'video' ? 'Esa publicación no es un vídeo' : 'Esa publicación no tiene portada' })
      return await sirveDelCdn(res, url, action === 'video'
        ? { max: MAX_VIDEO, tipos: 'video/mp4,video/*' }
        : { max: MAX_IMAGEN, tipos: 'image/jpeg,image/*' })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('[portadas]', err)
    if (res.headersSent) return undefined
    return res.status(err.statusCode || 500).json({ error: err.message || 'Error' })
  }
}
