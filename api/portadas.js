// HELM — Portadas de reels: el agente que propone el texto de la portada y el
// material con el que el panel la compone (el fotograma real del reel).
//
//   GET  ?action=marca  &clientId=             → el kit de la serie del perfil
//   POST ?action=marca  { clientId, marca }    → guardarlo
//   POST ?action=textos { clientId, mediaId }  → 3 propuestas de texto (gasta créditos)
//   GET  ?action=video     &clientId=&mediaId= → el vídeo del reel, para elegir fotograma
//   GET  ?action=imagen    &clientId=&mediaId= → la portada actual
//   GET  ?action=capacidad &clientId=          → ¿se puede generar fondo con IA?
//   POST ?action=fondo-prompt { clientId, mediaId?, tema? } → un prompt de fondo (gasta créditos)
//   POST ?action=fondo-ia     { clientId, prompt }          → genera el fondo con IA (gasta en Replicate)
//   POST ?action=portada-ia   { clientId, fotograma, titulo, estilo, detalle?, mediaId? }
//                                                           → la portada ENTERA con IA en un estilo (Replicate)
//   GET  ?action=ejemplos     &clientId=                    → las portadas de ejemplo que subió el perfil
//   POST ?action=ejemplo      { clientId, nombre, imagen }  → subir una (se usa como estilo)
//   POST ?action=ejemplo-borrar { clientId, id }            → quitarla
//
// El TITULAR nunca lo pinta una IA: el estudio de portadas (docs/estudio-
// portadas-reels.md) manda texto corto, legible y en serie, así que Claude
// propone el texto y el navegador lo compone con tipografía nítida
// (src/agents/portadas/componer.js). Lo que SÍ puede generar la IA, desde el
// 2026-10-19, es el FONDO: una escena 9:16 con hueco para el titular, cuando
// no vale un fotograma. Nunca la cara real del cliente (el prompt lo prohíbe)
// y la portada se marca como IA (Ley de IA, art. 50). Ver api/_lib/imagen.js.
//
// Desde el 2026-10-22 hay además «Portada con IA» (Alex: «que le des a crear
// portada y genere la imagen la IA, con estilos de ejemplo»): la IA hace la
// portada entera en el estilo elegido, a partir de un FOTOGRAMA REAL del reel
// y conservando a la persona tal cual (src/agents/portadas/estilosIa.js). El
// titular lo escribe la IA dentro de la imagen; el panel avisa de revisarlo.
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import crypto from 'node:crypto'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { supabase } from './lib/supabase.js'
import { applyCors, rateLimit, getClientIp } from './_lib/auth.js'
import { requireProfileAccess } from './_lib/access.js'
import { llmChat } from './_lib/llm.js'
import { getToken, getMediaUrls } from './_lib/instagram.js'
import { fetchPublico } from './_lib/web.js'
import { generaFondo, generaPortadaIa, hayClaveImagen } from './_lib/imagen.js'
import {
  estiloIaPorClave, referenciaDe, promptPortadaIa, MAX_TITULO_IA, MAX_DETALLE_IA, MAX_EJEMPLOS, MAX_NOMBRE_EJEMPLO,
} from '../src/agents/portadas/estilosIa.js'
import {
  normalizaMarca, normalizaOpciones, MARCA_POR_DEFECTO, PLANTILLAS, PALABRAS, MAX_CARACTERES,
} from '../src/agents/portadas/reglas.js'

const CLAVE_MARCA = 'portadas-marca'
const CLAVE_EJEMPLOS = 'portadas-ejemplos'
// Las imágenes que llegan del panel: el fotograma y los ejemplos que se suben.
const IMAGEN_DATA = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/
const MAX_FOTOGRAMA = 8 * 1024 * 1024
const MAX_EJEMPLO = 6 * 1024 * 1024
const RAIZ = fileURLToPath(new URL('..', import.meta.url))

// ¿Los primeros bytes son de verdad de una imagen de ese tipo? La etiqueta MIME
// de la data URL la pone quien sube, así que no basta: sin esto, un perfil puede
// colar bytes arbitrarios etiquetados como image/png y dejarlos servidos desde
// el almacén público, o mandárselos a Replicate (que cuesta).
function cabeceraCuadra(tipo, buf) {
  if (tipo === 'image/jpeg') return buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff
  if (tipo === 'image/png') return buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 && buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  if (tipo === 'image/webp') return buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP'
  return false
}

/** { tipo, buf } de una data URL de imagen, o null si no lo es, pasa de `max` o
 *  los bytes no son de verdad una imagen de ese tipo. */
export function imagenDeDataUrl(dataUrl, max) {
  const m = IMAGEN_DATA.exec(String(dataUrl || ''))
  if (!m) return null
  const buf = Buffer.from(m[2], 'base64')
  if (!buf.length || buf.length > max) return null
  const tipo = `image/${m[1]}`
  if (!cabeceraCuadra(tipo, buf)) return null
  return { tipo, buf }
}
const comoDataUrl = (tipo, buf) => `data:${tipo};base64,${buf.toString('base64')}`

// Los ejemplos de cada perfil: una lista en agent_memory (como el kit) y las
// imágenes en el almacén `helm`, en <perfil>/portadas/ejemplos/.
async function ejemplosDe(clientId) {
  const { data } = await supabase.from('agent_memory').select('id, contenido')
    .eq('client_id', clientId).eq('clave', CLAVE_EJEMPLOS).maybeSingle()
  let lista = []
  try { lista = data?.contenido ? JSON.parse(data.contenido) : [] } catch { lista = [] }
  return { id: data?.id || null, lista: Array.isArray(lista) ? lista : [] }
}
async function guardaEjemplos(clientId, id, lista) {
  const fila = { contenido: JSON.stringify(lista), updated_at: new Date().toISOString() }
  const { error } = id
    ? await supabase.from('agent_memory').update(fila).eq('id', id).eq('client_id', clientId)
    : await supabase.from('agent_memory').insert({ ...fila, client_id: clientId, clave: CLAVE_EJEMPLOS, ambito: 'portadas', agente: 'portadas', tipo: 'ejemplos' })
  if (error) throw Object.assign(new Error('No se pudo guardar la lista de ejemplos: ' + error.message), { statusCode: 500 })
}
const publico = (e) => ({ id: e.id, nombre: e.nombre, url: e.url, creado: e.creado })

// Subir y borrar ejemplos es leer la lista, tocarla y reescribirla: dos a la vez
// (doble clic, dos pestañas) se pisarían y dejarían la imagen ya subida huérfana
// en el almacén. api-server.mjs es un solo proceso, así que basta con ponerlas en
// fila por perfil. (La tarea diaria no toca esta lista, así que no compite.)
const colaEjemplos = new Map()
function enColaEjemplos(clientId, fn) {
  const antes = colaEjemplos.get(clientId) || Promise.resolve()
  const p = antes.catch(() => {}).then(fn)
  colaEjemplos.set(clientId, p)
  p.catch(() => {}).finally(() => { if (colaEjemplos.get(clientId) === p) colaEjemplos.delete(clientId) })
  return p
}
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

// Cómo Claude escribe el prompt del FONDO para Ideogram. En inglés (el modelo
// responde mejor), vertical, con hueco arriba para el titular, SIN texto y SIN
// caras reconocibles: la persona y el título van aparte.
const REGLAS_FONDO = `You write a single image prompt for Ideogram that generates a VERTICAL 9:16 BACKGROUND for an Instagram reel cover. The background sets the mood; the headline text and any person are added separately afterwards, so:

RULES
1. NO text, letters, numbers or logos in the image. The title is composed on top later.
2. NO recognizable human faces or real people. Abstract figures, hands, objects, places, textures or scenes are fine, but never a portrait that could be mistaken for the client.
3. Composition: leave the TOP THIRD visually calm (space for a headline). Strong, scroll-stopping, high-contrast, editorial thumbnail look.
4. Match the sector and topic you are given, and the brand colours if provided. Think like the best thumbnail designers of that niche (fitness, filmmaking, AI, beauty…).
5. One or two sentences, concrete and visual (subject, setting, lighting, colour, mood, style). End with: "vertical 9:16, no text, cinematic, high detail".

Reply with ONLY the prompt in English, nothing else.`

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

    // ── GET ?action=capacidad ──────────────────────────────────────────────
    // ¿Hay clave de imagen en el server? El panel enseña u oculta el fondo IA.
    if (req.method === 'GET' && action === 'capacidad') {
      return res.status(200).json({ fondoIa: hayClaveImagen(), portadaIa: hayClaveImagen() })
    }

    // ── GET ?action=ejemplos ───────────────────────────────────────────────
    if (req.method === 'GET' && action === 'ejemplos') {
      const { lista } = await ejemplosDe(clientId)
      return res.status(200).json({ ejemplos: lista.map(publico) })
    }

    // ── POST ?action=ejemplo ───────────────────────────────────────────────
    // Una portada de ejemplo subida a mano: queda como estilo del perfil.
    if (req.method === 'POST' && action === 'ejemplo') {
      const nombre = recorta(String(req.body?.nombre || '').trim(), MAX_NOMBRE_EJEMPLO)
      const img = imagenDeDataUrl(req.body?.imagen, MAX_EJEMPLO)
      if (!nombre) return res.status(400).json({ error: 'Ponle un nombre al ejemplo' })
      if (!img) return res.status(400).json({ error: 'La imagen tiene que ser JPG, PNG o WebP de menos de 6 MB' })
      return enColaEjemplos(clientId, async () => {
        const { id, lista } = await ejemplosDe(clientId)
        if (lista.length >= MAX_EJEMPLOS) return res.status(400).json({ error: `Como mucho ${MAX_EJEMPLOS} ejemplos: quita alguno antes` })
        const nuevo = crypto.randomUUID()
        const ruta = `${clientId}/portadas/ejemplos/${nuevo}.${img.tipo.split('/')[1].replace('jpeg', 'jpg')}`
        const { error: errUp } = await supabase.storage.from('helm').upload(ruta, img.buf, { contentType: img.tipo, upsert: false, cacheControl: '31536000' })
        if (errUp) return res.status(500).json({ error: 'No se pudo subir la imagen: ' + errUp.message })
        const { data: pub } = supabase.storage.from('helm').getPublicUrl(ruta)
        const ejemplo = { id: nuevo, nombre, ruta, url: pub?.publicUrl || '', creado: new Date().toISOString() }
        try { await guardaEjemplos(clientId, id, [...lista, ejemplo]) } catch (err) { await supabase.storage.from('helm').remove([ruta]); throw err }
        return res.status(200).json({ ejemplo: publico(ejemplo), ejemplos: [...lista, ejemplo].map(publico) })
      })
    }

    // ── POST ?action=ejemplo-borrar ────────────────────────────────────────
    if (req.method === 'POST' && action === 'ejemplo-borrar') {
      const quitar = String(req.body?.id || '')
      return enColaEjemplos(clientId, async () => {
        const { id, lista } = await ejemplosDe(clientId)
        const fuera = lista.find(e => e.id === quitar)
        if (!fuera) return res.status(404).json({ error: 'Ese ejemplo ya no está' })
        const quedan = lista.filter(e => e.id !== quitar)
        await guardaEjemplos(clientId, id, quedan)
        // Solo del propio namespace del perfil; el error del almacén no debe
        // romper el borrado (la lista ya está sin él), pero sí quedar en el log.
        if (String(fuera.ruta || '').startsWith(`${clientId}/portadas/ejemplos/`)) {
          const { error: errDel } = await supabase.storage.from('helm').remove([fuera.ruta])
          if (errDel) console.error('portadas: no se pudo borrar del almacén', fuera.ruta, errDel.message)
        }
        return res.status(200).json({ ejemplos: quedan.map(publico) })
      })
    }

    // ── POST ?action=portada-ia ────────────────────────────────────────────
    // La portada entera con IA en un estilo, desde un fotograma real.
    if (req.method === 'POST' && action === 'portada-ia') {
      if (!hayClaveImagen()) return res.status(503).json({ error: 'Falta la clave de imagen (REPLICATE_API_TOKEN) en el servidor' })
      const fotograma = imagenDeDataUrl(req.body?.fotograma, MAX_FOTOGRAMA)
      const titulo = String(req.body?.titulo || '').trim()
      const detalle = recorta(String(req.body?.detalle || '').trim(), MAX_DETALLE_IA)
      const claveEstilo = String(req.body?.estilo || '')
      if (!fotograma) return res.status(400).json({ error: 'Elige primero el fotograma (o sube una foto)' })
      if (!titulo) return res.status(400).json({ error: 'Escribe el titular' })
      if (titulo.length > MAX_TITULO_IA) return res.status(400).json({ error: `El titular, como mucho ${MAX_TITULO_IA} caracteres` })

      const imagenes = [comoDataUrl(fotograma.tipo, fotograma.buf)]
      let estilo
      if (claveEstilo.startsWith('ej:')) {
        // Un ejemplo subido por el perfil: su imagen va de referencia.
        const { lista } = await ejemplosDe(clientId)
        const ej = lista.find(e => e.id === claveEstilo.slice(3))
        if (!ej) return res.status(404).json({ error: 'Ese ejemplo ya no está' })
        const { data: blob, error: errBaja } = await supabase.storage.from('helm').download(ej.ruta)
        if (errBaja || !blob) return res.status(502).json({ error: 'No se pudo leer el ejemplo' })
        imagenes.push(comoDataUrl(blob.type || 'image/jpeg', Buffer.from(await blob.arrayBuffer())))
        estilo = { estilo: 'Copy the layout and look of the style reference as closely as possible — composition, title treatment, colors, lighting and graphic elements — adapted to this person and this title.' }
      } else {
        estilo = estiloIaPorClave(claveEstilo)
        if (!estilo) return res.status(400).json({ error: 'Elige un estilo' })
        if (estilo.clave === 'libre' && !detalle) return res.status(400).json({ error: 'Describe el estilo que quieres' })
        const ref = referenciaDe(estilo)
        if (ref) imagenes.push(comoDataUrl('image/jpeg', await readFile(`${RAIZ}${ref}`)))
      }

      let tema = ''
      const mediaId = String(req.body?.mediaId || '')
      if (mediaId) {
        const { data: reel } = await supabase.from('helm_ig_media')
          .select('caption').eq('client_id', clientId).eq('media_id', mediaId).maybeSingle()
        tema = recorta(String(reel?.caption || '').split('\n')[0], 300)
      }
      const prompt = promptPortadaIa({ estilo, titulo, tema, detalle, imagenes: imagenes.length })
      // Cada generación cuesta dinero en Replicate: un tope por perfil y hora.
      // Se consume solo aquí, con la petición ya validada, para que las entradas
      // mal formadas (400) no gasten el cupo.
      const tope = rateLimit({ key: `portada-ia:${clientId}`, max: 30, windowMs: 3_600_000 })
      if (!tope.ok) return res.status(429).json({ error: 'Has generado muchas portadas seguidas. Prueba dentro de un rato.', retryAfter: tope.retryAfter })
      try {
        const { dataUrl } = await generaPortadaIa({ prompt, imagenes })
        return res.status(200).json({ imagen: dataUrl, ia: true })
      } catch (err) {
        return res.status(err.statusCode || 502).json({ error: err.message || 'No se pudo generar la portada' })
      }
    }

    // ── POST ?action=fondo-prompt ──────────────────────────────────────────
    // Claude escribe el prompt del fondo a partir del reel, el tema y el kit.
    if (req.method === 'POST' && action === 'fondo-prompt') {
      const tema = recorta(String(req.body?.tema || '').trim(), 400)
      const mediaId = String(req.body?.mediaId || '')
      let caption = ''
      if (mediaId) {
        const { data: reel } = await supabase.from('helm_ig_media')
          .select('caption').eq('client_id', clientId).eq('media_id', mediaId).maybeSingle()
        caption = recorta(reel?.caption || '', 1500)
      }
      if (!tema && !caption) return res.status(400).json({ error: 'Dime el tema del fondo o elige un reel' })
      const { marca } = await marcaDe(clientId)
      const colores = [marca?.colorPrincipal, marca?.colorResalte].filter(Boolean)
      const usuario = [
        tema ? `TEMA DEL FONDO: ${tema}` : '',
        caption ? `CAPTION DEL REEL (para el tono, no para copiar):\n${caption}` : '',
        colores.length ? `COLORES DE LA MARCA: ${colores.join(', ')}` : '',
        'Escribe el prompt del fondo.',
      ].filter(Boolean).join('\n\n')
      let prompt
      try {
        prompt = await llmChat({ clientId, system: REGLAS_FONDO, messages: [{ role: 'user', content: usuario }], maxTokens: 300, temperature: 0.8 })
      } catch (err) {
        return res.status(err.statusCode || 502).json({ error: err.message || 'La IA no ha respondido' })
      }
      return res.status(200).json({ prompt: String(prompt || '').trim().replace(/^["'`]+|["'`]+$/g, '') })
    }

    // ── POST ?action=fondo-ia ──────────────────────────────────────────────
    // Genera el fondo con Ideogram (gasta en Replicate). Sin clave → 503 claro.
    if (req.method === 'POST' && action === 'fondo-ia') {
      const prompt = recorta(String(req.body?.prompt || '').trim(), 1500)
      if (!prompt) return res.status(400).json({ error: 'Escribe la descripción del fondo' })
      try {
        const { dataUrl } = await generaFondo({ prompt, aspecto: '9:16' })
        return res.status(200).json({ imagen: dataUrl, ia: true })
      } catch (err) {
        return res.status(err.statusCode || 502).json({ error: err.message || 'No se pudo generar el fondo' })
      }
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
