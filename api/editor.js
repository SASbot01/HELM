// HELM — Editor de reels: subes el vídeo en bruto (vertical, grabado con el
// móvil) y HELM te devuelve el MP4 editado.
//
//   POST ?action=subir   &clientId=      cuerpo = el vídeo, en crudo
//        cabeceras: Content-Type: video/* · X-Nombre: encodeURIComponent(nombre)
//                                        → { id }
//   GET  ?action=lista   &clientId=      → { ediciones: [{ id, nombre_original, estado, progreso, paso,
//                                            duracion_original, duracion_final, created_at, error }] }
//   GET  ?action=estado  &clientId=&id=  → { edicion: { …lo mismo, plan: resumen del plan } }
//   GET  ?action=descarga&clientId=&id=  → el MP4, como adjunto
//   GET  ?action=estilos &clientId=      → { estilos: [{ id, nombre, params, global }],
//                                            porDefecto: { id, nombre, params, global } }
//   POST ?action=estilo  { clientId, params, nombre? }  → guarda el estilo del perfil
//                                        → { estilo, porDefecto }
//   POST ?action=borrar  { clientId, id }               → { ok: true }
//
// La subida NO pasa por readBody de scripts/api-server.mjs (no cabría): llega
// la petición sin leer y se escribe a disco según entra, con su tope
// (HELM_EDITOR_MAX_MB, 800 por defecto). Aquí solo se sube, se comprueba con
// ffprobe y se encola: transcribir y montar lo hace el worker (trabajo
// `editor-render`, api/_lib/editor/trabajo.js), de uno en uno.
//
// Los archivos (original y editado) se guardan 7 días; la fila, hasta que se
// borre. Cada edición usa el estilo del perfil (o el global, «Estilo HELM»),
// copiado en la fila al subir: cambiar el estilo luego no cambia lo ya subido.
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { supabase } from './lib/supabase.js'
import { applyCors, rateLimit, getClientIp } from './_lib/auth.js'
import { requireProfileAccess } from './_lib/access.js'
import { sondea } from './_lib/variantes.js'
import { normalizaEstilo, ESTILO_POR_DEFECTO, EN_MARCHA } from '../src/agents/editor/estilo.js'
import { resumenDePlan } from './_lib/editor/plan.js'
import {
  UUID, DIAS_GUARDADO, CARPETA_EDITOR, dirEdicion, rutaOriginalCon, extensionDe, borraEdicion,
  editadoDisponible, rutaEditado, maxBytesSubida, maxDuracionOriginal, minLibreBytes,
} from './_lib/editor/archivos.js'

const TABLA = 'helm_ediciones'
const ESTILOS = 'helm_estilos_edicion'
const COLUMNAS = 'id, nombre_original, estado, progreso, paso, duracion_original, duracion_final, created_at, updated_at, error'
// Por perfil, lo que puede haber a medias a la vez; y en todo el servidor.
const MAX_PENDIENTES_PERFIL = 3
const MAX_COLA = 20
// Una subida que lleva más de esto sin acabar es que se cortó (o el servidor
// se reinició a medias).
const CADUCA_SUBIENDO = 3 * 3600_000

const recorta = (t, n) => String(t || '').slice(0, n)
// Para filename*= de Content-Disposition: encodeURIComponent deja ' ( ) * ! sin codificar.
const rfc5987 = (t) => encodeURIComponent(t).replace(/['()*!]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
const num = (v) => (v == null ? null : Number(v))
const ahora = () => new Date().toISOString()

/** La fila tal y como la ve el panel (los campos del contrato, ni uno más). */
function publica(fila) {
  let estado = fila.estado
  let error = fila.error || null
  let paso = fila.paso || null
  const edad = Date.now() - new Date(fila.updated_at || fila.created_at).getTime()
  if (estado === 'subiendo' && edad > CADUCA_SUBIENDO) {
    estado = 'error'
    error = 'La subida no terminó. Vuelve a subir el vídeo.'
    paso = null
    supabase.from(TABLA).update({ estado, error, updated_at: ahora() })
      .eq('id', fila.id).eq('estado', 'subiendo').then(() => {}, () => {})
  }
  return {
    id: fila.id,
    nombre_original: fila.nombre_original || '',
    estado,
    progreso: Math.max(0, Math.min(100, Number(fila.progreso) || 0)),
    paso,
    duracion_original: num(fila.duracion_original),
    duracion_final: num(fila.duracion_final),
    created_at: fila.created_at,
    error,
  }
}

/** El estilo con el que se edita lo que sube este perfil: el suyo, o el global. */
async function estilosDe(clientId) {
  const [{ data: globales }, { data: propios }] = await Promise.all([
    supabase.from(ESTILOS).select('id, nombre, params, updated_at').is('client_id', null).order('created_at', { ascending: true }),
    supabase.from(ESTILOS).select('id, nombre, params, updated_at').eq('client_id', clientId).order('updated_at', { ascending: false }),
  ])
  const global = (globales || [])[0] || null
  const base = normalizaEstilo(global?.params || {})
  const forma = (f, esGlobal) => ({ id: f.id, nombre: f.nombre, params: normalizaEstilo(f.params || {}, base), global: esGlobal })
  const estilos = [...(propios || []).map(f => forma(f, false)), ...(globales || []).map(f => forma(f, true))]
  const porDefecto = estilos[0] || { id: null, nombre: 'Estilo HELM', params: normalizaEstilo(ESTILO_POR_DEFECTO), global: true }
  return { estilos, porDefecto, base }
}

async function encolaEdicion(clientId, id) {
  const { error } = await supabase.from('agent_jobs').upsert({
    tipo: 'editor-render', payload: { clientId, edicionId: id },
    clave: `editor-render:${id}`,
    // Un montaje que falla volvería a fallar igual: un solo intento.
    estado: 'pendiente', max_intentos: 1, correr_tras: ahora(),
  }, { onConflict: 'clave', ignoreDuplicates: true })
  if (error) throw new Error(`No se pudo encolar: ${error.message}`)
}

/**
 * Contesta a una subida sin leer su cuerpo: se responde y se cierra la
 * conexión, para no tragarse cientos de MB que no se van a usar.
 */
function rechaza(req, res, statusCode, error) {
  if (!res.headersSent) {
    res.setHeader('Connection', 'close')
    res.status(statusCode).json({ error })
  }
  if (!req.readableEnded) res.on('finish', () => req.destroy())
  return undefined
}

/** El nombre del archivo, legible y sin nada raro (solo se enseña). */
function nombreDe(cabecera) {
  let n = String(cabecera || '')
  try { n = decodeURIComponent(n) } catch { /* llegó sin codificar */ }
  n = n.replace(/\p{Cc}/gu, ' ').replace(/[\\/]+/g, ' ').replace(/\s+/g, ' ').trim()
  return recorta(n, 160) || 'vídeo'
}

async function subir(req, res, { clientId, auth }) {
  const tipo = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase()
  if (!/^video\/[a-z0-9.+-]+$/.test(tipo)) return rechaza(req, res, 415, 'Eso no es un vídeo. Sube el archivo tal cual sale del móvil (MP4 o MOV).')
  const max = maxBytesSubida()
  const mb = Math.round(max / 1048576)
  const largo = Number(req.headers['content-length'] || 0)
  if (largo > max) return rechaza(req, res, 413, `El vídeo pesa más de ${mb} MB.`)

  // Sitio en el disco: lo que va a ocupar y un margen para el editado.
  try {
    await fsp.mkdir(CARPETA_EDITOR(), { recursive: true })
    const st = await fsp.statfs(CARPETA_EDITOR())
    if (st.bavail * st.bsize < (largo || max) + minLibreBytes()) return rechaza(req, res, 507, 'El servidor se ha quedado sin sitio para vídeos. Prueba más tarde.')
  } catch (e) {
    console.error('[editor] sin carpeta de datos', e?.message || e)
    return rechaza(req, res, 500, 'No se puede guardar el vídeo ahora mismo.')
  }

  const [{ count: delPerfil }, { count: enTodo }] = await Promise.all([
    supabase.from(TABLA).select('id', { count: 'exact', head: true }).eq('client_id', clientId).in('estado', EN_MARCHA),
    supabase.from(TABLA).select('id', { count: 'exact', head: true }).in('estado', EN_MARCHA),
  ])
  if ((delPerfil || 0) >= MAX_PENDIENTES_PERFIL) return rechaza(req, res, 429, `Ya hay ${MAX_PENDIENTES_PERFIL} vídeos de este perfil editándose. Espera a que acabe alguno.`)
  if ((enTodo || 0) >= MAX_COLA) return rechaza(req, res, 503, 'HELM está editando muchos vídeos ahora mismo. Prueba en unos minutos.')

  const nombre = nombreDe(req.headers['x-nombre'])
  const { porDefecto } = await estilosDe(clientId)
  const id = randomUUID()
  const { error: e1 } = await supabase.from(TABLA).insert({
    id, client_id: clientId, nombre_original: nombre, estado: 'subiendo', progreso: 0, paso: 'Subiendo el vídeo',
    estilo: porDefecto.params, creado_por: UUID.test(String(auth?.userId || '')) ? auth.userId : null,
  })
  if (e1) return rechaza(req, res, 500, 'No se pudo empezar la subida: ' + e1.message)

  const destino = rutaOriginalCon(id, extensionDe(tipo, nombre))
  const parcial = `${destino}.part`
  let total = 0
  const tope = new Transform({
    transform(trozo, _c, cb) {
      total += trozo.length
      if (total > max) return cb(Object.assign(new Error(`El vídeo pesa más de ${mb} MB.`), { statusCode: 413 }))
      cb(null, trozo)
    },
  })
  const olvida = async () => {
    await borraEdicion(id).catch(() => {})
    await supabase.from(TABLA).delete().eq('id', id).eq('client_id', clientId).then(() => {}, () => {})
  }
  try {
    await fsp.mkdir(dirEdicion(id), { recursive: true })
    await pipeline(req, tope, fs.createWriteStream(parcial))
    await fsp.rename(parcial, destino)
  } catch (e) {
    await olvida()
    if (e.statusCode === 413) return rechaza(req, res, 413, e.message)
    // La conexión se cortó (el usuario cerró la pestaña o se fue la red).
    if (!res.headersSent && !res.destroyed) res.status(400).json({ error: 'La subida se cortó a medias. Vuelve a probar.' })
    return undefined
  }
  if (!total) { await olvida(); return res.status(400).json({ error: 'No ha llegado ningún vídeo.' }) }

  // ¿Es un vídeo de verdad, y de los que se pueden editar?
  let info
  try { info = await sondea(destino) } catch { info = null }
  const maxSeg = maxDuracionOriginal()
  const motivo = !info ? 'No se puede leer ese vídeo. Prueba a exportarlo otra vez desde el móvil (MP4 o MOV).'
    : !info.duracion ? 'No se sabe cuánto dura ese vídeo.'
      : info.duracion > maxSeg ? `El vídeo dura más de ${Math.round(maxSeg / 60)} minutos. Recórtalo y vuelve a subirlo.`
        : null
  if (motivo) { await olvida(); return res.status(422).json({ error: motivo }) }

  await supabase.from(TABLA).update({
    estado: 'en_cola', progreso: 0, paso: info.audio ? 'En cola' : 'En cola (el vídeo no tiene sonido: solo se encuadrará)',
    duracion_original: Math.round(info.duracion * 100) / 100, updated_at: ahora(),
  }).eq('id', id)
  try {
    await encolaEdicion(clientId, id)
  } catch (e) {
    await supabase.from(TABLA).update({ estado: 'error', paso: null, error: recorta(e.message, 300), updated_at: ahora() }).eq('id', id)
    return res.status(500).json({ error: e.message })
  }
  return res.status(200).json({ id })
}

export default async function handler(req, res) {
  applyCors(req, res)
  // X-Nombre va en la subida: si el panel llama desde otro origen, que pase.
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,x-client-slug,x-webhook-secret,X-Nombre')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const action = req.query.action
  const esSubida = action === 'subir'
  // 120 y no 60: el panel pregunta cada 3 s mientras se edita.
  const gate = rateLimit({ key: `editor:${getClientIp(req)}`, max: 120, windowMs: 60_000 })
  if (!gate.ok) {
    res.setHeader('Retry-After', String(gate.retryAfter))
    if (esSubida) return rechaza(req, res, 429, 'Demasiadas peticiones seguidas')
    return res.status(429).json({ error: 'Demasiadas peticiones seguidas', retryAfter: gate.retryAfter })
  }

  const clientId = req.query.clientId || req.body?.clientId
  if (req.query?.clientId && req.body?.clientId && String(req.query.clientId) !== String(req.body.clientId)) {
    return res.status(400).json({ error: 'El perfil de la URL y el del cuerpo no coinciden' })
  }
  if (!clientId) return esSubida ? rechaza(req, res, 400, 'clientId requerido') : res.status(400).json({ error: 'clientId requerido' })
  if (!UUID.test(String(clientId))) return esSubida ? rechaza(req, res, 400, 'Perfil no válido') : res.status(400).json({ error: 'Perfil no válido' })

  let auth
  try {
    auth = await requireProfileAccess(req, clientId)
  } catch (err) {
    if (esSubida) return rechaza(req, res, err.statusCode || 401, err.message)
    return res.status(err.statusCode || 401).json({ error: err.message })
  }

  try {
    // ── POST ?action=subir ─────────────────────────────────────────────────
    if (esSubida) {
      if (req.method !== 'POST') return rechaza(req, res, 405, 'Method not allowed')
      return await subir(req, res, { clientId, auth })
    }

    // ── GET ?action=lista ──────────────────────────────────────────────────
    if (req.method === 'GET' && action === 'lista') {
      const { data, error } = await supabase.from(TABLA).select(COLUMNAS)
        .eq('client_id', clientId).order('created_at', { ascending: false }).limit(30)
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ ediciones: (data || []).map(publica) })
    }

    // ── GET ?action=estilos · POST ?action=estilo ──────────────────────────
    if (req.method === 'GET' && action === 'estilos') {
      const { estilos, porDefecto } = await estilosDe(clientId)
      return res.status(200).json({ estilos, porDefecto })
    }

    if (req.method === 'POST' && action === 'estilo') {
      const crudos = req.body?.params
      if (!crudos || typeof crudos !== 'object' || Array.isArray(crudos)) return res.status(400).json({ error: 'Faltan los ajustes del estilo' })
      const { base } = await estilosDe(clientId)
      const params = normalizaEstilo(crudos, base)
      const nombre = recorta(String(req.body?.nombre || '').replace(/\p{Cc}/gu, ' ').trim(), 60) || 'Estilo del perfil'
      const { data: ya } = await supabase.from(ESTILOS).select('id').eq('client_id', clientId)
        .order('updated_at', { ascending: false }).limit(1)
      const cambios = { nombre, params, updated_at: ahora() }
      const { error } = ya?.length
        ? await supabase.from(ESTILOS).update(cambios).eq('id', ya[0].id).eq('client_id', clientId)
        : await supabase.from(ESTILOS).insert({ client_id: clientId, ...cambios })
      if (error) return res.status(500).json({ error: 'No se pudo guardar el estilo: ' + error.message })
      const { porDefecto } = await estilosDe(clientId)
      return res.status(200).json({ estilo: porDefecto, porDefecto })
    }

    // ── GET ?action=estado | descarga · POST ?action=borrar ────────────────
    const id = String(req.query.id || req.body?.id || '')
    if (['estado', 'descarga', 'borrar'].includes(action) && !UUID.test(id)) {
      return res.status(400).json({ error: 'Edición no válida' })
    }

    if (req.method === 'GET' && action === 'estado') {
      const { data: fila } = await supabase.from(TABLA).select(`${COLUMNAS}, plan`).eq('id', id).eq('client_id', clientId).maybeSingle()
      if (!fila) return res.status(404).json({ error: 'No encuentro esa edición' })
      return res.status(200).json({ edicion: { ...publica(fila), plan: resumenDePlan(fila.plan) } })
    }

    if (req.method === 'GET' && action === 'descarga') {
      const { data: fila } = await supabase.from(TABLA).select('id, estado, nombre_original')
        .eq('id', id).eq('client_id', clientId).maybeSingle()
      if (!fila) return res.status(404).json({ error: 'No encuentro esa edición' })
      if (fila.estado !== 'listo') return res.status(409).json({ error: 'Ese vídeo aún no está listo' })
      const st = await editadoDisponible(id)
      if (!st) return res.status(410).json({ error: `Este vídeo ya no está (se guardan ${DIAS_GUARDADO} días). Vuelve a subirlo.` })
      const base = String(fila.nombre_original || 'reel').replace(/\.[a-z0-9]{2,4}$/i, '').slice(0, 80) || 'reel'
      const ascii = base.normalize('NFD').replace(/[^\x20-\x7e]/g, '').replace(/["\\;]/g, '').trim() || 'reel'
      res.setHeader('Content-Type', 'video/mp4')
      res.setHeader('Content-Length', String(st.size))
      res.setHeader('Content-Disposition', `attachment; filename="${ascii}-editado.mp4"; filename*=UTF-8''${rfc5987(`${base}-editado.mp4`)}`)
      res.setHeader('Cache-Control', 'private, no-store')
      try {
        await pipeline(fs.createReadStream(rutaEditado(id)), res)
      } catch (e) {
        if (!res.headersSent) return res.status(500).json({ error: 'No se pudo leer el archivo' })
        res.destroy(e)
      }
      return undefined
    }

    if (req.method === 'POST' && action === 'borrar') {
      const { data: fila } = await supabase.from(TABLA).select('id').eq('id', id).eq('client_id', clientId).maybeSingle()
      if (!fila) return res.status(404).json({ error: 'No encuentro esa edición' })
      // El trabajo que aún no ha empezado, fuera; si ya está montando, el
      // worker ve que la fila no está y corta su ffmpeg.
      await supabase.from('agent_jobs').delete().eq('clave', `editor-render:${id}`).eq('estado', 'pendiente')
      const { error } = await supabase.from(TABLA).delete().eq('id', id).eq('client_id', clientId)
      if (error) return res.status(500).json({ error: 'No se pudo borrar: ' + error.message })
      await borraEdicion(id)
      return res.status(200).json({ ok: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('[editor]', err)
    if (res.headersSent) return undefined
    if (esSubida) return rechaza(req, res, err.statusCode || 500, err.message || 'Error')
    return res.status(err.statusCode || 500).json({ error: err.message || 'Error' })
  }
}
