// HELM — Trial reels: variantes editadas de un reel propio para volver a
// probar la idea como «Reel de prueba» de Instagram.
//
//   GET  ?action=lista   &clientId=                 → las variantes del perfil (las 30 últimas)
//   POST ?action=ganchos { clientId, mediaId }      → 3 ganchos de texto (gasta créditos)
//   POST ?action=crear   { clientId, mediaId, variantes: [{ ajustes, ganchoPng }] }
//                                                   → hasta 3 variantes en cola; devuelve sus ids
//   GET  ?action=estado  &clientId=&id=             → cómo va una
//   GET  ?action=descarga&clientId=&id=             → el MP4, como adjunto
//   POST ?action=borrar  { clientId, id }           → quitarla (y su archivo)
//
// El vídeo de partida SOLO sale de la cuenta de Instagram conectada del perfil:
// un reel que esté en helm_ig_media de ESE perfil, pedido a Meta con SU token
// (getMediaUrls) y bajado solo del CDN de Meta. Aquí no se suben archivos ni
// se bajan reels de otros: el agente trabaja con el contenido del cliente.
//
// El montaje lo hace ffmpeg en este servidor (api/_lib/variantes.js), de uno
// en uno; el gancho lo compone el navegador con el kit de Portadas
// (src/agents/trialreels/gancho.js) y llega como PNG transparente. HELM no
// publica: la app de Meta no tiene permiso de publicación. Se descargan y se
// suben en la app de Instagram como «Reel de prueba».
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'
import { supabase } from './lib/supabase.js'
import { applyCors, rateLimit, getClientIp } from './_lib/auth.js'
import { requireProfileAccess } from './_lib/access.js'
import { enContexto } from './_lib/contexto.js'
import { llmChat } from './_lib/llm.js'
import { getToken, getMediaUrls } from './_lib/instagram.js'
import {
  normalizaAjustes, procesaVariante, descargaFuente, limpiaViejos, encola, enCola, quitaDeCola, colaUsa, largoCola,
  rutaSalida, rutaGancho, rutaFuente, CARPETA, MAX_VIDEO, DIAS_GUARDADO,
} from './_lib/variantes.js'
import { normalizaGanchos, esReel, MAX_VARIANTES, PALABRAS_GANCHO, MAX_CARACTERES_GANCHO, LIENZO } from '../src/agents/trialreels/reglas.js'
import { extraeJson } from './portadas.js'

const TABLA = 'helm_trial_reels'
const COLUMNAS = 'id, media_id, variante, ajustes, estado, bytes, duracion, error, created_at, updated_at'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MEDIA = /^\d{5,30}$/
const MAX_PNG = 4 * 1024 * 1024
// Por perfil, lo que puede haber esperando a la vez; y en todo el servidor.
const MAX_PENDIENTES_PERFIL = 6
const MAX_COLA = 30
// Un montaje tiene 8 minutos de tope: «procesando» con más de 15 es que el
// servidor se reinició a medias.
const CADUCA_PROCESANDO = 15 * 60_000
// Una fila «en_cola» que no está en la cola de memoria es de antes de un
// reinicio: se vuelve a encolar (con margen, para no pisar a `crear`).
const MARGEN_REANIMA = 60_000

const REGLAS = `Escribes GANCHOS de texto para los 2–3 primeros segundos de un reel de Instagram, en español de España, para cuentas de negocio y creadores. El gancho va sobreimpreso arriba mientras arranca el vídeo; su trabajo es que quien está haciendo scroll se pare. Es un reel que la cuenta ya publicó y que va a volver a probar como «Reel de prueba» (se enseña primero a gente que no la sigue), así que el gancho tiene que funcionar con quien NO conoce la cuenta.

REGLAS
1. Sale de lo que el vídeo CUMPLE según el caption: una cifra, un resultado, un error típico, una pregunta del cliente. Prohibido prometer lo que no está.
2. Entre ${PALABRAS_GANCHO.min} y ${PALABRAS_GANCHO.max} palabras y ${MAX_CARACTERES_GANCHO} caracteres como mucho. Se tiene que leer de un vistazo en el móvil.
3. Las 3 opciones cambian de ÁNGULO, no de sinónimos: (A) curiosidad o hueco («lo que nadie te cuenta de…», sin usar esa frase hecha), (B) el dolor o el error del que mira, en segunda persona, (C) el resultado concreto o la idea contraria.
4. No repitas la primera línea del caption: complétala.
5. Una sola palabra resaltada, que esté en el texto. Tildes, «¿» y «¡» obligatorios, cifras en número, sin emojis, sin hashtags, sin anglicismos salvo marcas.
6. Nada de clickbait falso, de ingresos garantizados ni de salud milagrosa; nada de imitar a otras cuentas.
7. Respeta el tono de la marca (Biblia) si la hay.

Responde SOLO con JSON, sin nada alrededor:
{"opciones":[{"texto":"…","resaltada":"…","angulo":"A · curiosidad","porque":"una frase"}]}`

const recorta = (s, n) => String(s || '').slice(0, n)
const fallo = (message, statusCode) => Object.assign(new Error(message), { statusCode })

/** La fila tal y como la ve el panel, con el estado de verdad. */
async function publica(fila) {
  let estado = fila.estado
  let error = fila.error || null
  const edad = Date.now() - new Date(fila.updated_at || fila.created_at).getTime()
  if (estado === 'procesando' && edad > CADUCA_PROCESANDO && !enCola(fila.id)) {
    estado = 'error'
    error = 'Se cortó a medias (el servidor se reinició). Vuelve a crearla.'
    supabase.from(TABLA).update({ estado, error, updated_at: new Date().toISOString() })
      .eq('id', fila.id).eq('estado', 'procesando').then(() => {}, () => {})
  }
  let disponible = false
  if (estado === 'listo') {
    try {
      const st = await fsp.stat(rutaSalida(fila.id))
      disponible = st.isFile() && Date.now() - st.mtimeMs < DIAS_GUARDADO * 86_400_000
    } catch { disponible = false }
  }
  return {
    id: fila.id,
    mediaId: fila.media_id,
    variante: fila.variante,
    ajustes: fila.ajustes || {},
    estado,
    error,
    bytes: fila.bytes == null ? null : Number(fila.bytes),
    duracion: fila.duracion == null ? null : Number(fila.duracion),
    disponible,
    creado: fila.created_at,
    actualizado: fila.updated_at,
  }
}

async function marca(id, cambios) {
  await supabase.from(TABLA).update({ ...cambios, updated_at: new Date().toISOString() }).eq('id', id)
}

/**
 * El trabajo de una variante, tal y como corre en la cola: baja la fuente (si
 * no está ya de otra variante de la misma tanda), monta y apunta el resultado.
 * Todo con el id y el perfil; nada de lo que diga la fila sobre rutas.
 */
function trabajoDe({ id, clientId, mediaId }) {
  const fuente = rutaFuente(clientId, mediaId)
  return {
    id,
    fuente,
    // Fuera del contexto de la petición que lo encoló: esto no cobra nada y
    // no debe quedar a nombre de nadie.
    ejecuta: () => enContexto({ origen: 'trial-reels' }, async () => {
      const { data: fila } = await supabase.from(TABLA).select('id, media_id, ajustes, estado')
        .eq('id', id).eq('client_id', clientId).maybeSingle()
      if (!fila || fila.estado !== 'en_cola') return
      await marca(id, { estado: 'procesando', error: null })
      const ajustes = normalizaAjustes(fila.ajustes)
      const gancho = ajustes.conGancho ? rutaGancho(id) : null
      try {
        await limpiaViejos()
        if (!fs.existsSync(fuente)) {
          const { data: reel } = await supabase.from('helm_ig_media').select('media_id, tipo, producto')
            .eq('client_id', clientId).eq('media_id', fila.media_id).maybeSingle()
          if (!reel || !esReel(reel)) throw fallo('Ese reel ya no está en este perfil')
          const { token } = await getToken(supabase, clientId)
          const urls = await getMediaUrls(token, fila.media_id)
          if (!urls.video) throw fallo('Esa publicación no es un vídeo')
          await descargaFuente(urls.video, fuente, { max: MAX_VIDEO })
        }
        if (gancho && !fs.existsSync(gancho)) throw fallo('El gancho se perdió (el servidor se reinició). Vuelve a crear la variante.')
        const r = await procesaVariante({ entrada: fuente, salida: rutaSalida(id), gancho, ajustes })
        await marca(id, { estado: 'listo', archivo: `trial-reels/${id}.mp4`, bytes: r.bytes, duracion: r.duracion, error: null })
      } catch (e) {
        console.error('[trial-reels]', id, e?.message || e)
        await marca(id, { estado: 'error', error: recorta(e?.message || 'No se pudo montar', 300) })
      } finally {
        if (gancho) await fsp.rm(gancho, { force: true })
        if (!colaUsa(fuente, id)) await fsp.rm(fuente, { force: true })
      }
    }),
  }
}

/** El PNG del gancho: base64 (con o sin «data:»), PNG de verdad y 1080×1920. */
function leePng(crudo) {
  if (crudo == null || crudo === '') return null
  const b64 = String(crudo).replace(/^data:image\/png;base64,/, '')
  if (b64.length > Math.ceil(MAX_PNG / 3) * 4 + 16) throw fallo('El gancho pesa demasiado (máximo 4 MB)', 413)
  const buf = Buffer.from(b64, 'base64')
  const firma = buf.subarray(0, 8).toString('hex') === '89504e470d0a1a0a' && buf.subarray(12, 16).toString('latin1') === 'IHDR'
  if (!firma) throw fallo('El gancho no es un PNG', 400)
  if (buf.readUInt32BE(16) !== LIENZO.ancho || buf.readUInt32BE(20) !== LIENZO.alto) throw fallo('El gancho tiene que medir 1080×1920', 400)
  if (buf.length > MAX_PNG) throw fallo('El gancho pesa demasiado (máximo 4 MB)', 413)
  return buf
}

export default async function handler(req, res) {
  applyCors(req, res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  const action = req.query.action
  // 120 y no 60: el panel pregunta cada 3 s mientras se monta.
  const gate = rateLimit({ key: `trial-reels:${getClientIp(req)}`, max: 120, windowMs: 60_000 })
  if (!gate.ok) {
    res.setHeader('Retry-After', String(gate.retryAfter))
    return res.status(429).json({ error: 'Demasiadas peticiones seguidas', retryAfter: gate.retryAfter })
  }

  const clientId = req.query.clientId || req.body?.clientId
  if (req.query?.clientId && req.body?.clientId && String(req.query.clientId) !== String(req.body.clientId)) {
    return res.status(400).json({ error: 'El perfil de la URL y el del cuerpo no coinciden' })
  }
  if (!clientId) return res.status(400).json({ error: 'clientId requerido' })

  let auth
  try {
    auth = await requireProfileAccess(req, clientId)
  } catch (err) {
    return res.status(err.statusCode || 401).json({ error: err.message })
  }

  try {
    // ── GET ?action=lista ──────────────────────────────────────────────────
    if (req.method === 'GET' && action === 'lista') {
      const { data, error } = await supabase.from(TABLA).select(COLUMNAS)
        .eq('client_id', clientId).order('created_at', { ascending: false }).limit(30)
      if (error) return res.status(500).json({ error: error.message })
      // Lo que se quedó en cola antes de un reinicio vuelve a la cola.
      for (const f of data || []) {
        if (f.estado === 'en_cola' && !enCola(f.id) && Date.now() - new Date(f.created_at).getTime() > MARGEN_REANIMA) {
          encola(trabajoDe({ id: f.id, clientId, mediaId: f.media_id }))
        }
      }
      return res.status(200).json({ trabajos: await Promise.all((data || []).map(publica)) })
    }

    // ── POST ?action=ganchos ───────────────────────────────────────────────
    // Lo único que gasta: Claude lee el reel y la Biblia y propone 3 ganchos.
    if (req.method === 'POST' && action === 'ganchos') {
      const mediaId = String(req.body?.mediaId || '')
      const { data: reel } = await supabase.from('helm_ig_media')
        .select('media_id, caption, visitas, retencion_media, guardados, compartidos')
        .eq('client_id', clientId).eq('media_id', mediaId).maybeSingle()
      if (!reel) return res.status(404).json({ error: 'No encuentro ese reel en este perfil' })
      if (!String(reel.caption || '').trim()) return res.status(400).json({ error: 'Ese reel no tiene caption: escribe tú el gancho' })

      const { data: biblias } = await supabase.from('helm_biblia').select('kind, content').eq('client_id', clientId)
      const biblia = (biblias || []).map(b => `## Biblia de ${b.kind}\n${recorta(b.content, 3500)}`).join('\n\n')
      const usuario = [
        `CAPTION DEL REEL:\n${recorta(reel.caption, 2200)}`,
        `DATOS: ${Number(reel.visitas) || 0} visualizaciones · ${Number(reel.guardados) || 0} guardados · ${Number(reel.compartidos) || 0} compartidos${reel.retencion_media ? ` · ${Number(reel.retencion_media).toFixed(1)} s de visionado medio` : ''}.`,
        biblia ? `MARCA:\n${biblia}` : 'MARCA: sin Biblia todavía; usa un tono claro y directo.',
        'Dame los 3 ganchos.',
      ].join('\n\n')

      let respuesta
      try {
        respuesta = await llmChat({ clientId, system: REGLAS, messages: [{ role: 'user', content: usuario }], maxTokens: 700, temperature: 0.8 })
      } catch (err) {
        return res.status(err.statusCode || 502).json({ error: err.message || 'La IA no ha respondido' })
      }
      const opciones = normalizaGanchos(extraeJson(respuesta)?.opciones)
      if (!opciones.length) return res.status(502).json({ error: 'La IA no ha dado ningún gancho válido. Prueba otra vez.' })
      return res.status(200).json({ opciones })
    }

    // ── POST ?action=crear ─────────────────────────────────────────────────
    if (req.method === 'POST' && action === 'crear') {
      const mediaId = String(req.body?.mediaId || '')
      if (!MEDIA.test(mediaId)) return res.status(400).json({ error: 'Reel no válido' })
      const variantes = Array.isArray(req.body?.variantes) ? req.body.variantes : []
      if (!variantes.length || variantes.length > MAX_VARIANTES) {
        return res.status(400).json({ error: `Entre 1 y ${MAX_VARIANTES} variantes` })
      }
      const { data: reel } = await supabase.from('helm_ig_media').select('media_id, tipo, producto')
        .eq('client_id', clientId).eq('media_id', mediaId).maybeSingle()
      if (!reel) return res.status(404).json({ error: 'No encuentro ese reel en este perfil' })
      if (!esReel(reel)) return res.status(400).json({ error: 'Esa publicación no es un reel' })

      const { count } = await supabase.from(TABLA).select('id', { count: 'exact', head: true })
        .eq('client_id', clientId).in('estado', ['en_cola', 'procesando'])
      if ((count || 0) + variantes.length > MAX_PENDIENTES_PERFIL) {
        return res.status(429).json({ error: 'Ya hay variantes de este perfil montándose. Espera a que terminen.' })
      }
      if (largoCola() + variantes.length > MAX_COLA) {
        return res.status(503).json({ error: 'HELM está montando muchas variantes ahora mismo. Prueba en unos minutos.' })
      }

      let pngs
      try { pngs = variantes.map(v => leePng(v?.ganchoPng)) }
      catch (err) { return res.status(err.statusCode || 400).json({ error: err.message }) }

      const filas = variantes.map((v, i) => ({
        client_id: clientId,
        media_id: mediaId,
        variante: i + 1,
        ajustes: { ...normalizaAjustes(v?.ajustes, `${mediaId}:${i}`), conGancho: Boolean(pngs[i]) },
        estado: 'en_cola',
        creado_por: UUID.test(String(auth?.userId || '')) ? auth.userId : null,
      }))
      const { data: creadas, error } = await supabase.from(TABLA).insert(filas).select(COLUMNAS)
      if (error) return res.status(500).json({ error: 'No se pudieron crear las variantes: ' + error.message })

      const orden = [...creadas].sort((a, b) => a.variante - b.variante)
      for (const f of orden) {
        const png = pngs[f.variante - 1]
        if (!png) continue
        try {
          await fsp.mkdir(CARPETA(), { recursive: true })
          await fsp.writeFile(rutaGancho(f.id), png)
        } catch (e) {
          await marca(f.id, { estado: 'error', error: 'No se pudo guardar el gancho: ' + recorta(e.message, 120) })
          f.estado = 'error'
        }
      }
      for (const f of orden) if (f.estado === 'en_cola') encola(trabajoDe({ id: f.id, clientId, mediaId }))
      return res.status(200).json({ ids: orden.map(f => f.id), trabajos: await Promise.all(orden.map(publica)) })
    }

    // ── GET ?action=estado | descarga · POST ?action=borrar ────────────────
    const id = String(req.query.id || req.body?.id || '')
    if (['estado', 'descarga', 'borrar'].includes(action) && !UUID.test(id)) {
      return res.status(400).json({ error: 'Variante no válida' })
    }

    if (req.method === 'GET' && action === 'estado') {
      const { data: fila } = await supabase.from(TABLA).select(COLUMNAS).eq('id', id).eq('client_id', clientId).maybeSingle()
      if (!fila) return res.status(404).json({ error: 'No encuentro esa variante' })
      return res.status(200).json({ trabajo: await publica(fila) })
    }

    if (req.method === 'GET' && action === 'descarga') {
      const { data: fila } = await supabase.from(TABLA).select('id, estado, variante, created_at')
        .eq('id', id).eq('client_id', clientId).maybeSingle()
      if (!fila) return res.status(404).json({ error: 'No encuentro esa variante' })
      if (fila.estado !== 'listo') return res.status(409).json({ error: 'Esa variante aún no está lista' })
      const ruta = rutaSalida(id)
      let st
      try { st = await fsp.stat(ruta) } catch { st = null }
      if (!st || Date.now() - st.mtimeMs > DIAS_GUARDADO * 86_400_000) {
        return res.status(410).json({ error: `Esta variante ya no está (se guardan ${DIAS_GUARDADO} días). Vuelve a crearla.` })
      }
      const dia = String(fila.created_at || '').slice(0, 10) || 'reel'
      res.setHeader('Content-Type', 'video/mp4')
      res.setHeader('Content-Length', String(st.size))
      res.setHeader('Content-Disposition', `attachment; filename="trial-reel-${dia}-v${Number(fila.variante) || 1}.mp4"`)
      res.setHeader('Cache-Control', 'private, no-store')
      try {
        await pipeline(fs.createReadStream(ruta), res)
      } catch (e) {
        if (!res.headersSent) return res.status(500).json({ error: 'No se pudo leer el archivo' })
        res.destroy(e)
      }
      return undefined
    }

    if (req.method === 'POST' && action === 'borrar') {
      const { data: fila } = await supabase.from(TABLA).select('id').eq('id', id).eq('client_id', clientId).maybeSingle()
      if (!fila) return res.status(404).json({ error: 'No encuentro esa variante' })
      quitaDeCola(id)
      await Promise.all([fsp.rm(rutaSalida(id), { force: true }), fsp.rm(rutaGancho(id), { force: true })])
      const { error } = await supabase.from(TABLA).delete().eq('id', id).eq('client_id', clientId)
      if (error) return res.status(500).json({ error: 'No se pudo borrar: ' + error.message })
      return res.status(200).json({ ok: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('[trial-reels]', err)
    if (res.headersSent) return undefined
    return res.status(err.statusCode || 500).json({ error: err.message || 'Error' })
  }
}
