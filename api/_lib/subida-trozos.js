// HELM — recibir un archivo grande por trozos: el lado del servidor de
// src/helm/subida.js (el vídeo en bruto del Editor de reels, el de Trial
// reels…). Cada subida vive en su carpeta, mientras llega, como
//   <dir>/subida.part     los bytes recibidos hasta ahora, en orden
// y al cerrarla se renombra a su sitio (original.mp4 o lo que diga quien la usa).
//
// Uso, en un handler cuyo cuerpo NO lee scripts/api-server.mjs (ver
// subidaEnCrudo allí) y después de comprobar el acceso y que la fila sigue
// «subiendo» (una subida ya cerrada no tiene subida.part: recibiría desde 0):
//   import { recibeTrozo, recibidosDe, cierraSubida, contestaError, limpiaSubidas } from './_lib/subida-trozos.js'
//   import { minLibreBytes } from './_lib/editor/archivos.js'   // o el tope de disco de tu agente
//   // POST ?action=trozo&offset=N   (cuerpo = el trozo, en crudo)
//   try {
//     const r = await recibeTrozo(req, { dir, total: fila.bytes, offset: req.query.offset, minLibre: minLibreBytes() })
//     return res.status(200).json(r)                   // { recibidos, completo }
//   } catch (e) { return contestaError(req, res, e) }  // un 409 lleva { recibidos }
//   // GET ?action=trozo  → res.json({ recibidos: await recibidosDe(dir) })
//   // al lanzar:           const { bytes } = await cierraSubida(dir, destino, fila.bytes)
//   // en la limpieza:      await limpiaSubidas(carpetaDeTodasLasSubidas)
// Sin `minLibre` no se mira el disco antes de escribir: pásalo siempre.
//
// Las reglas: un trozo solo se escribe si empieza justo donde acaba lo
// recibido (si no, 409 con `recibidos` y el cliente sigue desde ahí); nunca
// más de `maxTrozo` (32 MB y un margen) ni más allá de `total`; y de uno en uno
// por subida. El cliente manda los trozos de uno en uno, así que si llega otro
// mientras uno sigue entrando es que el cliente dio el anterior por perdido (el
// móvil pasó de Wi-Fi a 4G y la conexión vieja se quedó medio abierta): el
// nuevo GANA, se corta el viejo y, cuando ha soltado el archivo, se sigue con
// la comprobación de siempre. Un trozo que se corta a medias deja escrito lo
// que llegó, que es justo el principio del trozo: el siguiente intento recibe
// el 409 y sigue sin agujeros. Y un trozo que no manda nada en
// ESPERA_TROZO_MS se corta (Node, si no, espera 5 minutos).
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { TROZO } from '../../src/helm/subida.js'

export const PARTE = 'subida.part'
// Lo que manda el cliente (32 MB) y un margen, por si alguien lo afina.
export const MAX_TROZO = TROZO + 1024 * 1024
// Una subida que lleva esto sin recibir nada se da por perdida.
export const HORAS_SUBIDA = 6
// Un trozo que lleva esto sin mandar ni un byte se da por perdido.
export const ESPERA_TROZO_MS = 60_000

const MB = 1024 * 1024
const falla = (mensaje, statusCode, extra = {}) => Object.assign(new Error(mensaje), { statusCode, ...extra })
const entero = (v) => {
  const n = typeof v === 'number' ? v : (typeof v === 'string' && /^\d+$/.test(v.trim()) ? Number(v) : NaN)
  return Number.isSafeInteger(n) && n >= 0 ? n : null
}

// Las subidas con un trozo entrando ahora mismo: clave → { req, hecho }, con
// `hecho` la promesa que se cumple (nunca falla) cuando ese trozo ha acabado y
// ha soltado el archivo. El api-server es un solo proceso: con esto basta.
const enCurso = new Map()
const clave = (dir) => path.resolve(String(dir))

export const rutaParte = (dir) => path.join(dir, PARTE)

/** Los bytes que ya tiene una subida (0 si aún no ha llegado nada). */
export async function recibidosDe(dir) {
  try {
    const st = await fsp.stat(rutaParte(dir))
    return st.isFile() ? st.size : 0
  } catch { return 0 }
}

/** Corta el trozo que esté entrando en esa subida y espera a que suelte el archivo. */
async function suelta(k) {
  // En bucle: mientras se espera puede haber entrado otro, y gana el último.
  for (let previo = enCurso.get(k); previo; previo = enCurso.get(k)) {
    try { previo.req?.destroy?.() } catch { /* ya estaba cortado */ }
    await previo.hecho
  }
}

/** Si el trozo se queda callado ESPERA_TROZO_MS, se corta (solo con una petición de Node de verdad). */
function vigila(req) {
  if (typeof req?.setTimeout !== 'function' || !req.socket) return () => {}
  req.setTimeout(ESPERA_TROZO_MS, () => req.destroy())
  // Al acabar se quita, para que no corte la conexión mientras se contesta
  // (con el cuerpo leído, req ya cuenta como destruido pero el socket sigue).
  return () => { try { req.setTimeout(0) } catch { /* sin socket */ } }
}

/** Lee y tira el cuerpo (hasta `max` bytes; más, se corta), para que la respuesta llegue entera al navegador. */
function descarta(req, max) {
  return new Promise((ok) => {
    if (!req || req.readableEnded || req.destroyed || typeof req.on !== 'function') return ok()
    let n = 0
    const fin = () => ok()
    req.on('data', (c) => { n += c.length; if (n > max) { req.destroy(); ok() } })
    req.once('end', fin)
    req.once('close', fin)
    req.once('error', fin)
    req.resume?.()
  })
}

/**
 * Un Transform que deja pasar `limite` bytes como mucho. Lo que se pasa ya no
 * se escribe, pero se sigue leyendo (hasta `sobra` bytes más) para que el
 * navegador reciba el 413 con su mensaje y no un corte de red; al acabar, 413.
 * Si se pasa de eso también, 413 en el acto (y se corta la conexión).
 */
function conTope(limite, mensaje, sobra = 0) {
  let n = 0
  return new Transform({
    transform(trozo, _c, cb) {
      n += trozo.length
      if (n <= limite) return cb(null, trozo)
      if (n > limite + sobra) return cb(falla(mensaje, 413))
      cb()
    },
    flush(cb) { cb(n > limite ? falla(mensaje, 413) : null) },
  })
}

/** Espera a que el archivo esté cerrado: hasta entonces puede quedar una escritura en vuelo. */
function cerrado(archivo) {
  if (!archivo || archivo.closed) return Promise.resolve()
  return new Promise((ok) => {
    const t = setTimeout(ok, 5000)
    t.unref?.()
    archivo.once('close', () => { clearTimeout(t); ok() })
  })
}

/**
 * Escribe el cuerpo de `req` (el trozo) en <dir>/subida.part, en `offset`.
 *   total    → lo que pesa el archivo entero (lo que anunció el cliente al empezar)
 *   offset   → dónde empieza el trozo (número o el texto de la query)
 *   maxTrozo → tope de un trozo (MAX_TROZO)
 *   minLibre → bytes que tienen que quedar libres en el disco después (0: no se mira)
 * Devuelve { recibidos, completo }. Lanza errores con `statusCode` (400, 409 con
 * `recibidos`, 413, 507) para contestaError.
 */
export async function recibeTrozo(req, { dir, total, offset, maxTrozo = MAX_TROZO, minLibre = 0 } = {}) {
  const tot = entero(total)
  const off = entero(offset)
  if (!dir) throw falla('No se sabe dónde guardar el archivo.', 500)
  if (!tot) throw falla('No se sabe cuánto pesa el archivo.', 400)
  if (off == null) throw falla('Falta desde dónde va el trozo (offset).', 400)
  const tope = Math.max(1, Number(maxTrozo) || MAX_TROZO)
  const k = clave(dir)
  const deja = vigila(req)
  // El trozo nuevo gana al que se haya quedado colgado (ver arriba). Se apunta
  // YA, antes de esperar a nada, para que el que llegue detrás lo vea a él.
  const anterior = enCurso.get(k)
  const yo = { req }
  enCurso.set(k, yo)
  const escrito = (async () => {
    try {
      if (anterior) {
        try { anterior.req?.destroy?.() } catch { /* ya estaba cortado */ }
        await anterior.hecho
      }
      return await escribe(req, { dir, tot, off, tope, minLibre: Number(minLibre) || 0 })
    } finally {
      deja()
      if (enCurso.get(k) === yo) enCurso.delete(k)
    }
  })()
  yo.hecho = escrito.then(() => {}, () => {})
  return escrito
}

async function escribe(req, { dir, tot, off, tope, minLibre }) {
  // Cortado mientras esperaba a que el anterior soltara el archivo: ya ha
  // llegado otro detrás (que gana) y no se toca nada.
  // (Un cuerpo leído entero también cuenta como destruido: ese sigue, por rawBody.)
  if (req.destroyed && !req.readableEnded) throw falla('El trozo se cortó a medias. Vuelve a probar.', 400, { recibidos: await recibidosDe(dir) })
  await fsp.mkdir(dir, { recursive: true })
  const recibidos = await recibidosDe(dir)
  if (off !== recibidos) {
    // Se lee entero antes de contestar: si se cierra la conexión con el
    // trozo a medio mandar, el navegador ve un fallo de red y no el 409.
    await descarta(req, tope)
    throw falla('Ese trozo no va ahí: sigue desde lo que ya ha llegado.', 409, { recibidos })
  }
  const cabe = Math.min(tope, tot - off)
  const masGrande = `El trozo pesa más de ${Math.round(tope / MB)} MB.`
  const mensajeTope = cabe < tope ? 'Ese trozo se pasa de lo que pesa el archivo.' : masGrande
  const largo = Number(req.headers?.['content-length'])
  if (Number.isFinite(largo) && largo > cabe) {
    // Se tira sin escribirlo, para que el 413 llegue con su mensaje; si es
    // desmesurado, ni se lee (se corta la conexión).
    if (largo <= cabe + tope) await descarta(req, largo)
    throw falla(largo > tope ? masGrande : mensajeTope, 413)
  }
  if (minLibre > 0) {
    const st = await fsp.statfs(dir)
    if (st.bavail * st.bsize < (Number.isFinite(largo) ? largo : cabe) + minLibre) {
      await descarta(req, tope)
      throw falla('El servidor se ha quedado sin sitio. Prueba más tarde.', 507)
    }
  }
  // Si el cuerpo ya lo leyó alguien (un servidor que no lo deja pasar en
  // crudo), está en req.rawBody.
  const fuente = req.readableEnded && Buffer.isBuffer(req.rawBody) ? Readable.from([req.rawBody]) : req
  const parte = rutaParte(dir)
  const archivo = fs.createWriteStream(parte, { flags: off === 0 ? 'w' : 'r+', start: off })
  try {
    await pipeline(fuente, conTope(Math.max(0, cabe), mensajeTope, tope), archivo)
  } catch (e) {
    await cerrado(archivo)
    if (e?.statusCode === 413) {
      // Lo que pasa del tope no es de este archivo: fuera el trozo entero.
      await fsp.truncate(parte, off).catch(() => {})
      throw falla(e.message, 413)
    }
    // La conexión se cortó: lo escrito es el principio del trozo y se queda.
    throw falla('El trozo se cortó a medias. Vuelve a probar.', 400, { recibidos: await recibidosDe(dir) })
  }
  const ahora = await recibidosDe(dir)
  return { recibidos: ahora, completo: ahora === tot }
}

/**
 * Cierra una subida: renombra <dir>/subida.part a `destino`. Con `total`,
 * solo si ha llegado entera (si no, 409 con `recibidos`). Si ya estaba cerrada
 * (dos clics en «lanzar») y `destino` existe, no hace nada. Devuelve { bytes }.
 * Un trozo que siga «entrando» a estas alturas es uno que el cliente dio por
 * perdido: se corta y se espera a que suelte el archivo.
 */
export async function cierraSubida(dir, destino, total = null) {
  const tot = total == null ? null : entero(total)
  await suelta(clave(dir))
  let st = null
  try { st = await fsp.stat(rutaParte(dir)) } catch { /* no hay parte */ }
  if (!st) {
    try {
      const hecho = await fsp.stat(destino)
      if (hecho.isFile() && (tot == null || hecho.size === tot)) return { bytes: hecho.size }
    } catch { /* tampoco está cerrada */ }
    throw falla('No ha llegado el archivo. Vuelve a subirlo.', 400)
  }
  if (tot != null && st.size !== tot) throw falla('El archivo todavía no ha llegado entero.', 409, { recibidos: st.size })
  await fsp.mkdir(path.dirname(destino), { recursive: true })
  await fsp.rename(rutaParte(dir), destino)
  return { bytes: st.size }
}

/**
 * Contesta un error de recibeTrozo/cierraSubida: { error } y, si es un 409,
 * { recibidos }. Si el cuerpo no se ha leído, cierra la conexión al terminar
 * para no tragarse un trozo que no se va a usar.
 */
export function contestaError(req, res, e) {
  const code = e?.statusCode || 500
  if (code >= 500 && code !== 507) console.error('[subida]', e?.stack || e)
  if (res.headersSent) { if (!res.writableEnded) res.end(); return undefined }
  const leido = !req || req.readableEnded || req.destroyed
  if (!leido) {
    res.setHeader('Connection', 'close')
    res.on?.('finish', () => req.destroy())
  }
  const cuerpo = { error: code >= 500 && code !== 507 ? 'No se pudo guardar el archivo ahora mismo.' : e.message }
  if (e?.recibidos != null) cuerpo.recibidos = e.recibidos
  return res.status(code).json(cuerpo)
}

/**
 * Borra las subidas abandonadas de `carpeta`: cada subcarpeta con un
 * subida.part en la que nada ha cambiado en `horas` horas se borra ENTERA
 * (lo que haya dentro era de esa subida, que nunca se cerró). Devuelve
 * cuántas ha quitado.
 */
export async function limpiaSubidas(carpeta, horas = HORAS_SUBIDA) {
  const limite = Date.now() - horas * 3_600_000
  let entradas = []
  try { entradas = await fsp.readdir(carpeta, { withFileTypes: true }) } catch { return 0 }
  let borradas = 0
  for (const d of entradas) {
    if (!d.isDirectory()) continue
    const dir = path.join(carpeta, d.name)
    if (enCurso.has(clave(dir))) continue
    try {
      const dentro = await fsp.readdir(dir)
      if (!dentro.includes(PARTE)) continue
      let reciente = (await fsp.stat(dir)).mtimeMs
      for (const x of dentro) {
        try { reciente = Math.max(reciente, (await fsp.stat(path.join(dir, x))).mtimeMs) } catch { /* ya no está */ }
      }
      if (reciente < limite) { await fsp.rm(dir, { recursive: true, force: true }); borradas++ }
    } catch { /* ya no está */ }
  }
  return borradas
}
