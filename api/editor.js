// HELM — Editor de reels: subes el vídeo en bruto (vertical, grabado con el
// móvil) y, si quieres, imágenes o clips de apoyo, tu logo y una música; HELM
// te devuelve el MP4 editado. Cuesta créditos: 1,50 € por cada bloque de 3
// minutos empezado del vídeo en bruto (precioEditor, src/helm/precios.js), que
// se comprueban ANTES de subir y de lanzar y se cobran solo si sale bien.
//
//   POST ?action=crear   { clientId, nombre, bytes, tipo, duracion, estilo_ref?, params? }
//        duracion = la del <video> del navegador (s); estilo_ref = clave de
//        ESTILOS_REFERENCIA; params = ajustes del estilo que mandan sobre todo
//                                        → { edicion: { id, estado: 'subiendo', precio_eur, … } }
//                                          402 sin saldo · 429 con 2 subiendo o en cola en el perfil
//   POST ?action=trozo   &clientId=&id=&offset=N   cuerpo = el trozo, en crudo
//                                        → { recibidos, completo }   (409 → { recibidos })
//   GET  ?action=trozo   &clientId=&id=  → { recibidos }
//   POST ?action=recurso &clientId=&id=&tipo=broll|logo|musica&nombre=…   cuerpo = el archivo
//                                        → { recurso: { id, tipo, clase, nombre, bytes, duracion, palabra } }
//   POST ?action=quitar-recurso { clientId, id, recurso }  → { ok: true, recursos }
//   POST ?action=lanzar  { clientId, id, recursos?: [{ id, palabra? }] }
//                                        → { edicion }  (402 sin saldo, ya con el precio de la duración real)
//   GET  ?action=lista   &clientId=      → { ediciones: [{ id, nombre_original, estado, progreso, paso,
//                                            duracion_original, duracion_final, created_at, error,
//                                            estilo_ref, recursos, precio_eur, cobrado_eur }] }
//   GET  ?action=estado  &clientId=&id=  → { edicion: { …lo mismo, plan: resumen del plan } }
//   GET  ?action=descarga&clientId=&id=  → el MP4, como adjunto
//   GET  ?action=estilos &clientId=      → { estilos: [{ id, nombre, params, global }],
//                                            porDefecto: { id, nombre, params, global } }
//   POST ?action=estilo  { clientId, params, nombre? }  → guarda el estilo del perfil
//                                        → { estilo, porDefecto }
//   POST ?action=borrar  { clientId, id }               → { ok: true }
//
// El vídeo sube por trozos de 32 MB (src/helm/subida.js → api/_lib/subida-trozos.js):
// Cloudflare corta las peticiones de más de 100 MB. Los trozos y los recursos
// NO pasan por readBody de scripts/api-server.mjs: llegan sin leer y se
// escriben a disco según entran, con su tope. Cada recurso va en una sola
// petición, y su tipo se mira por los bytes (api/_lib/editor/recursos.js).
// Al lanzar se mira el vídeo con ffprobe, se recalcula el precio con lo que
// dura de verdad, se cierra la subida y se encola: transcribir y montar lo
// hace el worker (trabajo `editor-render`, api/_lib/editor/trabajo.js), que
// cobra al terminar bien.
//
// El estilo con el que se edita sale, de más a menos fuerza, de: `params` del
// cuerpo > el estilo de referencia elegido (ESTILOS_REFERENCIA[estilo_ref].estilo)
// > el estilo guardado del perfil > el de HELM. Se copia en la fila al crear:
// cambiar el estilo luego no cambia lo ya subido.
//
// Los archivos (original, recursos y editado) se guardan 7 días; la fila,
// hasta que se borre. Una subida que no se lanza en 6 horas se pierde.
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { supabase } from './lib/supabase.js'
import { applyCors, rateLimit, getClientIp } from './_lib/auth.js'
import { requireProfileAccess } from './_lib/access.js'
import { sondea } from './_lib/variantes.js'
import { exigirImporte, precioEditor } from './_lib/creditos.js'
import { recibeTrozo, recibidosDe, cierraSubida, contestaError } from './_lib/subida-trozos.js'
import { normalizaEstilo, ESTILO_POR_DEFECTO, EN_MARCHA } from '../src/agents/editor/estilo.js'
import { ESTILOS_REFERENCIA } from '../src/agents/editor/estilos-referencia.js'
import { resumenDePlan } from './_lib/editor/plan.js'
import { caducaSubidas, ABANDONADA, CADUCA_SUBIENDO_MS as CADUCA_SUBIENDO } from './_lib/editor/trabajo.js'
import {
  TIPOS_RECURSO, MAX_RECURSOS, BYTES_FIRMA, MAX_LADO_IMAGEN, MIN_DURACION_CLIP, MIN_DURACION_MUSICA,
  maxBytesDeTipo, firmaDe, admite, quitaOrientacion, nombreRecurso, sondeaAudio, publicoRecurso, palabraDe,
} from './_lib/editor/recursos.js'
import {
  UUID, DIAS_GUARDADO, CARPETA_EDITOR, dirEdicion, dirRecursos, rutaRecurso, rutaOriginal, rutaOriginalCon,
  rutaParcial, rutaSubida, extensionDe, borraEdicion, editadoDisponible, rutaEditado, maxBytesSubida,
  maxDuracionOriginal, pasaDelTope, minLibreBytes,
} from './_lib/editor/archivos.js'

const TABLA = 'helm_ediciones'
const ESTILOS = 'helm_estilos_edicion'
const COLUMNAS = 'id, nombre_original, estado, progreso, paso, duracion_original, duracion_final, created_at, updated_at, error, estilo_ref, recursos, precio_eur, cobrado_eur'
// Por perfil, lo que puede estar subiendo o en cola a la vez; y en todo el
// servidor, lo que puede haber a medias (las subidas abandonadas no cuentan).
export const MAX_A_LA_VEZ_PERFIL = 2
const A_LA_VEZ = ['subiendo', 'en_cola']
export const MAX_COLA = 20
// Lo que se lee y se tira de un archivo que no vale, para que el navegador
// reciba el error con su mensaje y no un corte de red; si sigue, se corta.
const MAX_TIRADO = 16 * 1024 * 1024
const MB = 1024 * 1024
// Las acciones cuyo cuerpo es un archivo en crudo (no lo lee el api-server).
const EN_CRUDO = ['trozo', 'recurso', 'subir']

const recorta = (t, n) => String(t || '').slice(0, n)
// Para filename*= de Content-Disposition: encodeURIComponent deja ' ( ) * ! sin codificar.
const rfc5987 = (t) => encodeURIComponent(t).replace(/['()*!]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
const num = (v) => (v == null ? null : Number(v))
const ahora = () => new Date().toISOString()
const r2 = (n) => Math.round(Number(n) * 100) / 100
const falla = (mensaje, statusCode, extra = {}) => Object.assign(new Error(mensaje), { statusCode, ...extra })
const edad = (f) => Date.now() - new Date(f.updated_at || f.created_at).getTime()

/**
 * De uno en uno por `clave` (el api-server es un solo proceso): lo que lee y
 * vuelve a escribir la lista de recursos de una edición, y lo que mira el
 * saldo y aparta un trabajo (así dos «lanzar» a la vez no gastan el mismo saldo).
 */
const colas = new Map()
function enFila(clave, fn) {
  const antes = colas.get(clave) || Promise.resolve()
  const turno = antes.then(fn, fn)
  const hecho = turno.then(() => {}, () => {})
  colas.set(clave, hecho)
  hecho.then(() => { if (colas.get(clave) === hecho) colas.delete(clave) })
  return turno
}

/** La fila tal y como la ve el panel (los campos del contrato, ni uno más). */
function publica(fila) {
  let estado = fila.estado
  let error = fila.error || null
  let paso = fila.paso || null
  if (estado === 'subiendo' && edad(fila) > CADUCA_SUBIENDO) {
    estado = 'error'
    error = ABANDONADA
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
    estilo_ref: fila.estilo_ref || null,
    recursos: (Array.isArray(fila.recursos) ? fila.recursos : []).map(publicoRecurso),
    precio_eur: num(fila.precio_eur),
    cobrado_eur: num(fila.cobrado_eur),
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

/**
 * El estilo de una edición nueva: los `params` del cuerpo mandan sobre el
 * estilo de referencia elegido, este sobre el del perfil y este sobre el de
 * HELM. Un estilo de referencia sin `estilo` (aún sin analizar) no cambia nada.
 */
async function estiloEfectivo(clientId, referencia, params) {
  const { porDefecto } = await estilosDe(clientId)
  let base = porDefecto.params
  if (referencia?.estilo && typeof referencia.estilo === 'object') base = normalizaEstilo(referencia.estilo, base)
  return normalizaEstilo(params || {}, base)
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
 * Lo que la agencia ya tiene apartado en ediciones que aún no se han cobrado
 * (subiendo, en cola o editándose), sin contar `menos`: se resta del saldo
 * antes de dejar empezar otra. Las subidas abandonadas no cuentan.
 */
async function pendienteDe({ agenciaId }, menos = null) {
  const { data: perfiles, error: e1 } = await supabase.from('clients').select('id').eq('agencia_id', agenciaId)
  if (e1) throw e1
  const ids = (perfiles || []).map(p => p.id)
  if (!ids.length) return 0
  const { data, error } = await supabase.from(TABLA).select('id, estado, precio_eur, created_at, updated_at')
    .in('client_id', ids).in('estado', EN_MARCHA).is('cobrado_eur', null)
  if (error) throw error
  return (data || [])
    .filter(f => f.id !== menos && !(f.estado === 'subiendo' && edad(f) > CADUCA_SUBIENDO))
    .reduce((t, f) => t + (Number(f.precio_eur) || 0), 0)
}

/** ¿Hay sitio en el disco para `bytes` más el margen? Si no, un 507. */
async function hayDisco(bytes) {
  await fsp.mkdir(CARPETA_EDITOR(), { recursive: true })
  const st = await fsp.statfs(CARPETA_EDITOR())
  if (st.bavail * st.bsize < bytes + minLibreBytes()) throw falla('El servidor se ha quedado sin sitio para vídeos. Prueba más tarde.', 507)
}

/** Lo que anunció el navegador al crear: { bytes, ext, tipo }, o null. */
async function leeSubida(id) {
  try {
    const j = JSON.parse(await fsp.readFile(rutaSubida(id), 'utf8'))
    return Number.isSafeInteger(j?.bytes) && j.bytes > 0 ? j : null
  } catch { return null }
}

/** La fila de una edición del perfil (cada consulta filtra por los dos). */
async function filaDe(clientId, id, columnas = 'id, estado, recursos') {
  const { data, error } = await supabase.from(TABLA).select(columnas).eq('id', id).eq('client_id', clientId).maybeSingle()
  if (error) throw error
  return data
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

/** El nombre del vídeo, legible y sin nada raro (solo se enseña). */
function nombreDe(texto) {
  let n = String(texto || '')
  try { n = decodeURIComponent(n) } catch { /* llegó sin codificar */ }
  n = n.replace(/\p{Cc}/gu, ' ').replace(/[\\/]+/g, ' ').replace(/\s+/g, ' ').trim()
  return recorta(n, 160) || 'vídeo'
}

// ── crear ───────────────────────────────────────────────────────────────────
async function crear(req, res, { clientId, auth }) {
  const b = req.body || {}
  const tipo = String(b.tipo || '').split(';')[0].trim().toLowerCase()
  if (!/^video\/[a-z0-9.+-]+$/.test(tipo)) return res.status(415).json({ error: 'Eso no es un vídeo. Sube el archivo tal cual sale del móvil (MP4 o MOV).' })
  const bytes = Number(b.bytes)
  if (!Number.isSafeInteger(bytes) || bytes <= 0) return res.status(400).json({ error: 'Falta lo que pesa el vídeo.' })
  const max = maxBytesSubida()
  if (bytes > max) return res.status(413).json({ error: `El vídeo pesa más de ${Math.round(max / MB)} MB.` })
  // La duración la dice el navegador; la de verdad (ffprobe) se mira al lanzar.
  let duracion = null
  if (b.duracion != null && b.duracion !== '') {
    duracion = Number(b.duracion)
    if (!Number.isFinite(duracion) || duracion < 0) return res.status(400).json({ error: 'La duración del vídeo no es válida.' })
  }
  if (duracion != null && pasaDelTope(duracion)) return res.status(422).json({ error: `El vídeo dura más de ${Math.round(maxDuracionOriginal() / 60)} minutos. Recórtalo y vuelve a subirlo.` })
  let referencia = null
  if (b.estilo_ref != null && b.estilo_ref !== '') {
    referencia = ESTILOS_REFERENCIA.find(e => e.clave === String(b.estilo_ref)) || null
    if (!referencia) return res.status(400).json({ error: 'Ese estilo de referencia no existe.' })
  }
  if (b.params != null && (typeof b.params !== 'object' || Array.isArray(b.params))) return res.status(400).json({ error: 'Los ajustes del estilo no son válidos.' })

  await hayDisco(bytes)

  return enFila('saldo', async () => {
    // Las subidas abandonadas de TODOS los perfiles pasan a error: si no, las de
    // quien no vuelve al editor llenarían el tope del servidor para siempre. Y
    // aunque eso fallara, al contar se dejan fuera por su edad.
    await caducaSubidas().catch(e => console.error('[editor] no pude caducar las subidas paradas', e?.message || e))
    const { data: enMarcha, error: eM } = await supabase.from(TABLA).select('id, client_id, estado, created_at, updated_at').in('estado', EN_MARCHA)
    if (eM) throw eM
    const vivas = (enMarcha || []).filter(f => !(f.estado === 'subiendo' && edad(f) > CADUCA_SUBIENDO))
    const delPerfil = vivas.filter(f => f.client_id === clientId && A_LA_VEZ.includes(f.estado)).length
    const enTodo = vivas.length
    if (delPerfil >= MAX_A_LA_VEZ_PERFIL) return res.status(429).json({ error: `Ya hay ${MAX_A_LA_VEZ_PERFIL} vídeos de este perfil subiendo o en cola. Espera a que empiece alguno.` })
    if (enTodo >= MAX_COLA) return res.status(503).json({ error: 'HELM está editando muchos vídeos ahora mismo. Prueba en unos minutos.' })

    // Sin saldo, ni se empieza a subir (402 con el mensaje para el usuario).
    const precio = precioEditor(duracion ?? 0)
    await exigirImporte(clientId, precio, { pendiente: (q) => pendienteDe(q) })

    const estilo = await estiloEfectivo(clientId, referencia, b.params)
    const id = randomUUID()
    const fila = {
      id, client_id: clientId, nombre_original: nombreDe(b.nombre), estado: 'subiendo', progreso: 0, paso: 'Subiendo el vídeo',
      estilo, estilo_ref: referencia?.clave || null, recursos: [], precio_eur: precio,
      duracion_s: duracion == null ? null : r2(duracion),
      creado_por: UUID.test(String(auth?.userId || '')) ? auth.userId : null,
    }
    const { error } = await supabase.from(TABLA).insert(fila)
    if (error) return res.status(500).json({ error: 'No se pudo empezar la subida: ' + error.message })
    try {
      await fsp.mkdir(dirEdicion(id), { recursive: true })
      await fsp.writeFile(rutaSubida(id), JSON.stringify({ bytes, ext: extensionDe(tipo, fila.nombre_original), tipo }))
      // Vacío, para que la limpieza de subidas a medias la vea desde ya.
      await fsp.writeFile(rutaParcial(id), '')
    } catch (e) {
      console.error('[editor] sin carpeta de datos', e?.message || e)
      await borraEdicion(id).catch(() => {})
      await supabase.from(TABLA).delete().eq('id', id).eq('client_id', clientId).then(() => {}, () => {})
      return res.status(500).json({ error: 'No se puede guardar el vídeo ahora mismo.' })
    }
    return res.status(200).json({ edicion: publica({ ...fila, created_at: ahora(), updated_at: ahora() }) })
  })
}

// ── trozo ───────────────────────────────────────────────────────────────────
async function trozo(req, res, { clientId, id }) {
  const fila = await filaDe(clientId, id, 'id, estado')
  if (!fila) return rechaza(req, res, 404, 'No encuentro esa edición')
  if (fila.estado !== 'subiendo') return rechaza(req, res, 409, 'Esta subida ya está cerrada.')
  const anuncio = await leeSubida(id)
  if (!anuncio) return rechaza(req, res, 410, 'La subida se perdió (pasó demasiado tiempo). Vuelve a empezar.')
  if (req.method === 'GET') return res.status(200).json({ recibidos: await recibidosDe(dirEdicion(id)) })
  let r
  try {
    r = await recibeTrozo(req, { dir: dirEdicion(id), total: anuncio.bytes, offset: req.query.offset, minLibre: minLibreBytes() })
  } catch (e) {
    return contestaError(req, res, e)
  }
  // Que se vea que sigue viva (la que lleva horas sin moverse, caduca).
  const pct = Math.floor((r.recibidos / anuncio.bytes) * 100)
  await supabase.from(TABLA).update({ paso: r.completo ? 'Vídeo subido' : `Subiendo el vídeo (${pct} %)`, updated_at: ahora() })
    .eq('id', id).eq('client_id', clientId).eq('estado', 'subiendo').then(() => {}, () => {})
  return res.status(200).json(r)
}

// ── recursos ────────────────────────────────────────────────────────────────
/**
 * Un Transform que mira la firma en los primeros bytes y deja pasar el
 * archivo solo si vale para `tipo`, y hasta su tope. Si no vale, lo que siga
 * llegando se lee y se tira (hasta MAX_TIRADO; más, se corta) y falla al
 * final, con el error que toca (415 o 413): así el navegador lo recibe con su
 * mensaje y no como un corte de red.
 */
function conFirma(tipo) {
  let espera = []
  let largo = 0
  let n = 0
  let admitido = null
  let rechazo = null
  let tirado = 0
  const pasaDeTope = () => falla(`Ese archivo pesa más de ${Math.round(admitido.tope / MB)} MB.`, 413)
  const t = new Transform({
    transform(trozo, _c, cb) {
      n += trozo.length
      if (rechazo) { tirado += trozo.length; return tirado > MAX_TIRADO ? cb(rechazo) : cb() }
      let sale = trozo
      if (!admitido) {
        espera.push(trozo)
        largo += trozo.length
        if (largo < BYTES_FIRMA) return cb()
        sale = Buffer.concat(espera)
        espera = []
        try { admitido = admite(tipo, firmaDe(sale.subarray(0, BYTES_FIRMA))) } catch (e) { rechazo = e; return cb() }
      }
      if (n > admitido.tope) { rechazo = pasaDeTope(); return cb() }
      cb(null, sale)
    },
    flush(cb) {
      if (!rechazo && !admitido && largo > 0) {
        // Más pequeño que la firma: se mira con lo que hay.
        const todo = Buffer.concat(espera)
        try { admitido = admite(tipo, firmaDe(todo)) } catch (e) { rechazo = e }
        if (!rechazo) this.push(todo)
      }
      cb(rechazo || null)
    },
  })
  t.admitido = () => admitido
  t.bytes = () => n
  return t
}

/** Lo que dice ffprobe de un recurso recién guardado; lanza 422 si no sirve. */
async function sondeaRecurso(ruta, adm) {
  if (adm.clase === 'imagen' || adm.clase === 'logo') {
    // La orientación del móvil se quita del EXIF y se apunta (ver recursos.js).
    const giro = adm.ext === 'jpg' ? await quitaOrientacion(ruta) : 1
    const v = await sondea(ruta)
    if (!v.ancho || !v.alto) throw falla('No se puede leer esa imagen.', 422)
    if (Math.max(v.ancho, v.alto) > MAX_LADO_IMAGEN) throw falla(`La imagen es demasiado grande (más de ${MAX_LADO_IMAGEN} píxeles de lado). Redúcela y vuelve a subirla.`, 422)
    return { ancho: v.ancho, alto: v.alto, giro }
  }
  if (adm.clase === 'video') {
    const v = await sondea(ruta)
    if (!(v.duracion >= MIN_DURACION_CLIP)) throw falla('Ese clip es demasiado corto.', 422)
    return { ancho: v.ancho, alto: v.alto, duracion: r2(v.duracion) }
  }
  const a = await sondeaAudio(ruta)
  if (!(a.duracion >= MIN_DURACION_MUSICA)) throw falla('Esa música es demasiado corta.', 422)
  return { duracion: r2(a.duracion) }
}

async function recurso(req, res, { clientId, id }) {
  const tipo = String(req.query.tipo || '')
  if (!TIPOS_RECURSO.includes(tipo)) return rechaza(req, res, 400, 'Tipo de recurso no válido (broll, logo o musica).')
  const fila = await filaDe(clientId, id)
  if (!fila) return rechaza(req, res, 404, 'No encuentro esa edición')
  if (fila.estado !== 'subiendo') return rechaza(req, res, 409, 'Esta edición ya está en marcha: los recursos se suben antes de lanzarla.')
  const lleno = `Ya hay ${MAX_RECURSOS.broll} imágenes o clips. Quita alguno para subir otro.`
  if (tipo === 'broll' && (fila.recursos || []).filter(r => r.tipo === 'broll').length >= MAX_RECURSOS.broll) return rechaza(req, res, 409, lleno)
  const tope = maxBytesDeTipo(tipo)
  const largo = Number(req.headers['content-length'])
  if (Number.isFinite(largo) && largo > tope) return rechaza(req, res, 413, `Ese archivo pesa más de ${Math.round(tope / MB)} MB.`)
  try {
    await hayDisco(Number.isFinite(largo) ? largo : tope)
  } catch (e) {
    return rechaza(req, res, e.statusCode || 500, e.statusCode ? e.message : 'No se puede guardar el archivo ahora mismo.')
  }

  // Se escribe según llega, con el nombre de su id; la extensión, la de su firma.
  const rid = randomUUID()
  await fsp.mkdir(dirRecursos(id), { recursive: true })
  const parcial = path.join(dirRecursos(id), `${rid}.part`)
  const filtro = conFirma(tipo)
  // Si el cuerpo ya lo leyó alguien (un servidor que no lo deja pasar en crudo), está en req.rawBody.
  const fuente = req.readableEnded && Buffer.isBuffer(req.rawBody) ? Readable.from([req.rawBody]) : req
  try {
    await pipeline(fuente, filtro, fs.createWriteStream(parcial))
  } catch (e) {
    await fsp.rm(parcial, { force: true })
    if (e?.statusCode) return rechaza(req, res, e.statusCode, e.message)
    // La conexión se cortó (el usuario cerró la pestaña o se fue la red).
    if (!res.headersSent && !res.destroyed) res.status(400).json({ error: 'La subida se cortó a medias. Vuelve a probar.' })
    return undefined
  }
  const adm = filtro.admitido()
  const bytes = filtro.bytes()
  if (!adm || !bytes) { await fsp.rm(parcial, { force: true }); return res.status(400).json({ error: 'No ha llegado ningún archivo.' }) }
  const ruta = rutaRecurso(id, rid, adm.ext)
  await fsp.rename(parcial, ruta)

  let info
  try {
    info = await sondeaRecurso(ruta, adm)
  } catch (e) {
    await fsp.rm(ruta, { force: true })
    return res.status(422).json({ error: e?.statusCode === 422 ? e.message : 'No se puede leer ese archivo. Prueba a exportarlo otra vez.' })
  }

  // Se apunta en la fila de uno en uno: el panel sube varios a la vez.
  return enFila(`edicion:${id}`, async () => {
    const actual = await filaDe(clientId, id)
    if (!actual || actual.estado !== 'subiendo') {
      await fsp.rm(ruta, { force: true })
      return actual
        ? res.status(409).json({ error: 'Esta edición ya está en marcha: los recursos se suben antes de lanzarla.' })
        : res.status(404).json({ error: 'No encuentro esa edición' })
    }
    let lista = Array.isArray(actual.recursos) ? actual.recursos : []
    let sustituidos = []
    if (tipo === 'broll') {
      if (lista.filter(r => r.tipo === 'broll').length >= MAX_RECURSOS.broll) {
        await fsp.rm(ruta, { force: true })
        return res.status(409).json({ error: lleno })
      }
    } else {
      // Un logo y una música como mucho: el nuevo sustituye al que hubiera.
      sustituidos = lista.filter(r => r.tipo === tipo)
      lista = lista.filter(r => r.tipo !== tipo)
    }
    const nuevo = { id: rid, tipo, clase: adm.clase, ext: adm.ext, nombre: nombreRecurso(req.query.nombre), bytes, ...info, palabra: null }
    const { error } = await supabase.from(TABLA).update({ recursos: [...lista, nuevo], updated_at: ahora() })
      .eq('id', id).eq('client_id', clientId).eq('estado', 'subiendo')
    if (error) {
      await fsp.rm(ruta, { force: true })
      return res.status(500).json({ error: 'No se pudo guardar el recurso: ' + error.message })
    }
    for (const v of sustituidos) await fsp.rm(rutaRecurso(id, v.id, v.ext), { force: true }).catch(() => {})
    return res.status(200).json({ recurso: publicoRecurso(nuevo) })
  })
}

async function quitaRecurso(req, res, { clientId, id }) {
  const rid = String(req.body?.recurso || '')
  if (!UUID.test(rid)) return res.status(400).json({ error: 'Recurso no válido' })
  return enFila(`edicion:${id}`, async () => {
    const fila = await filaDe(clientId, id)
    if (!fila) return res.status(404).json({ error: 'No encuentro esa edición' })
    if (fila.estado !== 'subiendo') return res.status(409).json({ error: 'Esta edición ya está en marcha: ya no se pueden quitar recursos.' })
    const lista = Array.isArray(fila.recursos) ? fila.recursos : []
    const quitado = lista.find(r => r.id === rid)
    if (!quitado) return res.status(404).json({ error: 'Ese recurso no está en esta edición.' })
    const quedan = lista.filter(r => r.id !== rid)
    const { error } = await supabase.from(TABLA).update({ recursos: quedan, updated_at: ahora() })
      .eq('id', id).eq('client_id', clientId).eq('estado', 'subiendo')
    if (error) return res.status(500).json({ error: 'No se pudo quitar: ' + error.message })
    await fsp.rm(rutaRecurso(id, quitado.id, quitado.ext), { force: true }).catch(() => {})
    return res.status(200).json({ ok: true, recursos: quedan.map(publicoRecurso) })
  })
}

// ── lanzar ──────────────────────────────────────────────────────────────────
async function lanzar(req, res, { clientId, id }) {
  const pedidos = req.body?.recursos
  if (pedidos != null && (!Array.isArray(pedidos) || pedidos.length > 40)) return res.status(400).json({ error: 'La lista de recursos no es válida.' })

  return enFila(`edicion:${id}`, async () => {
    const fila = await filaDe(clientId, id, COLUMNAS)
    if (!fila) return res.status(404).json({ error: 'No encuentro esa edición' })
    // Ya lanzada (dos clics): se devuelve como está, sin encolar otra vez.
    if (fila.estado !== 'subiendo') return res.status(200).json({ edicion: publica(fila) })

    // Los recursos en el orden pedido y con su palabra; los que no vengan en
    // la lista también van (sin palabra): para no usarlos, quitar-recurso.
    const actuales = Array.isArray(fila.recursos) ? fila.recursos : []
    let recursos = actuales.map(r => ({ ...r, palabra: null }))
    if (pedidos) {
      const porId = new Map(actuales.map(r => [r.id, r]))
      const vistos = new Set()
      const elegidos = []
      for (const p of pedidos) {
        const r = porId.get(String(p?.id || ''))
        if (!r) return res.status(400).json({ error: 'Uno de los recursos no está en esta edición.' })
        if (vistos.has(r.id)) continue
        vistos.add(r.id)
        elegidos.push({ ...r, palabra: r.tipo === 'broll' ? palabraDe(p?.palabra) : null })
      }
      recursos = [...elegidos, ...recursos.filter(r => !vistos.has(r.id))]
    }

    // El vídeo tiene que haber llegado entero; si un «lanzar» anterior ya
    // cerró la subida (y luego no hubo saldo), está como original.
    const dir = dirEdicion(id)
    const anuncio = await leeSubida(id)
    let ruta = await rutaOriginal(id)
    if (!ruta) {
      if (!anuncio) return res.status(410).json({ error: 'La subida se perdió (pasó demasiado tiempo). Vuelve a empezar.' })
      const recibidos = await recibidosDe(dir)
      if (recibidos !== anuncio.bytes) return res.status(409).json({ error: 'El vídeo todavía no ha llegado entero.', recibidos })
      ruta = rutaParcial(id)
    }

    // ¿Es un vídeo de verdad, de los que se pueden editar? Y lo que dura de verdad.
    let info
    try { info = await sondea(ruta) } catch { info = null }
    const motivo = !info ? 'No se puede leer ese vídeo. Prueba a exportarlo otra vez desde el móvil (MP4 o MOV).'
      : !info.duracion ? 'No se sabe cuánto dura ese vídeo.'
        : pasaDelTope(info.duracion) ? `El vídeo dura más de ${Math.round(maxDuracionOriginal() / 60)} minutos. Recórtalo y vuelve a subirlo.`
          : null
    if (motivo) {
      await supabase.from(TABLA).update({ estado: 'error', paso: null, error: motivo, updated_at: ahora() }).eq('id', id).eq('client_id', clientId)
      await borraEdicion(id).catch(() => {})
      return res.status(422).json({ error: motivo })
    }
    // El precio de verdad: el de lo que dura el vídeo, no el que dijo el navegador.
    const precio = precioEditor(info.duracion)

    return enFila('saldo', async () => {
      // Sin saldo, la edición se queda subida: al recargar, se vuelve a lanzar.
      await exigirImporte(clientId, precio, { pendiente: (q) => pendienteDe(q, id) })
      if (ruta === rutaParcial(id)) {
        try {
          await cierraSubida(dir, rutaOriginalCon(id, anuncio.ext), anuncio.bytes)
        } catch (e) {
          return res.status(e.statusCode || 500).json({ error: e.statusCode ? e.message : 'No se pudo cerrar la subida.', ...(e.recibidos != null ? { recibidos: e.recibidos } : {}) })
        }
      }
      const duracion = r2(info.duracion)
      const { data: hecha, error } = await supabase.from(TABLA).update({
        estado: 'en_cola', progreso: 0, error: null,
        paso: info.audio ? 'En cola' : 'En cola (el vídeo no tiene sonido: solo se encuadrará)',
        duracion_original: duracion, duracion_s: duracion, precio_eur: precio, recursos, updated_at: ahora(),
      }).eq('id', id).eq('client_id', clientId).eq('estado', 'subiendo').select(COLUMNAS)
      if (error) return res.status(500).json({ error: 'No se pudo lanzar: ' + error.message })
      if (!hecha?.length) {
        const ya = await filaDe(clientId, id, COLUMNAS)
        return ya ? res.status(200).json({ edicion: publica(ya) }) : res.status(404).json({ error: 'No encuentro esa edición' })
      }
      try {
        await encolaEdicion(clientId, id)
      } catch (e) {
        await supabase.from(TABLA).update({ estado: 'error', paso: null, error: recorta(e.message, 300), updated_at: ahora() }).eq('id', id).eq('client_id', clientId)
        return res.status(500).json({ error: e.message })
      }
      await fsp.rm(rutaSubida(id), { force: true }).catch(() => {})
      return res.status(200).json({ edicion: publica(hecha[0]) })
    })
  })
}

export default async function handler(req, res) {
  applyCors(req, res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  const action = req.query.action
  const crudo = req.method === 'POST' && EN_CRUDO.includes(action)
  const corta = (code, error) => (crudo ? rechaza(req, res, code, error) : res.status(code).json({ error }))
  // 120 y no 60: el panel pregunta cada 3 s mientras se edita.
  const gate = rateLimit({ key: `editor:${getClientIp(req)}`, max: 120, windowMs: 60_000 })
  if (!gate.ok) {
    res.setHeader('Retry-After', String(gate.retryAfter))
    if (crudo) return rechaza(req, res, 429, 'Demasiadas peticiones seguidas')
    return res.status(429).json({ error: 'Demasiadas peticiones seguidas', retryAfter: gate.retryAfter })
  }

  const clientId = req.query.clientId || req.body?.clientId
  if (req.query?.clientId && req.body?.clientId && String(req.query.clientId) !== String(req.body.clientId)) {
    return corta(400, 'El perfil de la URL y el del cuerpo no coinciden')
  }
  if (!clientId) return corta(400, 'clientId requerido')
  if (!UUID.test(String(clientId))) return corta(400, 'Perfil no válido')

  let auth
  try {
    auth = await requireProfileAccess(req, clientId)
  } catch (err) {
    return corta(err.statusCode || 401, err.message)
  }

  try {
    // La subida de una sola vez de antes: ahora va por crear → trozo → lanzar.
    if (action === 'subir') return corta(410, 'Esta forma de subir vídeos ya no existe: recarga la página.')

    if (req.method === 'POST' && action === 'crear') return await crear(req, res, { clientId, auth })

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

    // ── Lo de una edición: trozo, recurso, lanzar, estado, descarga, borrar ─
    const id = String(req.query.id || req.body?.id || '')
    if (!UUID.test(id)) return corta(400, 'Edición no válida')

    if (action === 'trozo' && (req.method === 'POST' || req.method === 'GET')) return await trozo(req, res, { clientId, id })
    if (req.method === 'POST' && action === 'recurso') return await recurso(req, res, { clientId, id })
    if (req.method === 'POST' && action === 'quitar-recurso') return await quitaRecurso(req, res, { clientId, id })
    if (req.method === 'POST' && action === 'lanzar') return await lanzar(req, res, { clientId, id })

    if (req.method === 'GET' && action === 'estado') {
      const fila = await filaDe(clientId, id, `${COLUMNAS}, plan`)
      if (!fila) return res.status(404).json({ error: 'No encuentro esa edición' })
      return res.status(200).json({ edicion: { ...publica(fila), plan: resumenDePlan(fila.plan) } })
    }

    if (req.method === 'GET' && action === 'descarga') {
      const fila = await filaDe(clientId, id, 'id, estado, nombre_original')
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
      const fila = await filaDe(clientId, id, 'id')
      if (!fila) return res.status(404).json({ error: 'No encuentro esa edición' })
      // El trabajo que aún no ha empezado, fuera; si ya está montando, el
      // worker ve que la fila no está y corta su ffmpeg.
      await supabase.from('agent_jobs').delete().eq('clave', `editor-render:${id}`).eq('estado', 'pendiente')
      const { error } = await supabase.from(TABLA).delete().eq('id', id).eq('client_id', clientId)
      if (error) return res.status(500).json({ error: 'No se pudo borrar: ' + error.message })
      await borraEdicion(id)
      return res.status(200).json({ ok: true })
    }

    return corta(405, 'Method not allowed')
  } catch (err) {
    const code = err.statusCode || 500
    if (code >= 500) console.error('[editor]', err)
    if (res.headersSent) return undefined
    // Un 402 (sin saldo), 507 (sin disco)… llevan su mensaje para el usuario.
    if (crudo) return rechaza(req, res, code, err.message || 'Error')
    return res.status(code).json({ error: err.message || 'Error' })
  }
}
