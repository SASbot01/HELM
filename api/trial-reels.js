// HELM — Trial reels: variantes editadas de un reel propio para volver a
// probar la idea como «Reel de prueba» de Instagram.
//
//   GET  ?action=lista   &clientId=                 → las variantes del perfil (las 30 últimas)
//                                                     y sus vídeos subidos (`fuentes`)
//   POST ?action=ganchos { clientId, mediaId }      → 3 ganchos de texto (gasta créditos)
//        ó           { clientId, texto }            → lo mismo para un vídeo subido: de qué va
//   POST ?action=fuente  { clientId, nombre, bytes, tipo, duracion? }
//                                                   → empieza la subida de un vídeo propio: { fuenteId }
//   POST ?action=trozo   &clientId=&id=&offset=     → un trozo, en crudo (api/_lib/subida-trozos.js);
//                                                     el último lo cierra y lo sondea: { …, fuente }
//   GET  ?action=trozo   &clientId=&id=             → { recibidos, estado }, para seguir una subida cortada
//                                                     con el mismo id (o empezar otra si falló)
//   GET  ?action=fuente-video &clientId=&id=        → el vídeo subido, para la vista previa
//   POST ?action=borrar-fuente { clientId, id }     → quitarlo (y su archivo); también para cancelar una subida
//   POST ?action=crear   { clientId, mediaId | fuenteId, variantes: [{ ajustes, ganchoPng }] }
//                                                   → hasta 3 variantes en cola; devuelve sus ids
//   GET  ?action=estado  &clientId=&id=             → cómo va una
//   GET  ?action=descarga&clientId=&id=             → el MP4, como adjunto
//   POST ?action=borrar  { clientId, id }           → quitarla (y su archivo)
//
// Cada hora, aunque nadie abra el agente (scripts/api-server.mjs carga este
// módulo al arrancar), mantenimiento() borra lo que pasa de 7 días y vuelve a
// probar los cobros que no llegaron a apuntarse.
//
// El vídeo de partida sale de la cuenta de Instagram conectada del perfil (un
// reel que esté en helm_ig_media de ESE perfil, pedido a Meta con SU token y
// bajado solo del CDN de Meta) o, desde el 27-oct, de un MP4/MOV que sube el
// propio usuario desde su ordenador o su móvil (helm_trial_fuentes, migración
// 115). Lo subido se comprueba por sus bytes (esVideoIsoBmff y ffprobe), no por
// el nombre ni el tipo que diga el navegador, y se borra a los 7 días.
//
// Cobra a PRECIO FIJO (src/helm/precios.js): 0,30 € por variante. Antes de
// crear se mira que llegue el saldo (402 si no, contando lo que la agencia ya
// tiene apartado sin cobrar en TODOS los agentes: apartadoDeAgencia, dentro
// del cerrojo común de la agencia); cada variante se cobra SOLO cuando sale
// bien, con la referencia `trial:<id>` (nunca dos veces), y nunca si la
// borraron mientras se montaba. La agencia de la casa (sin_cobro) y un perfil
// sin agencia no pagan. El 402 lleva cifras solo para quien puede ver el saldo
// (puedeVerSaldo), y lo que gasta o sube exige que el rol pueda usar los
// agentes del perfil (puedeUsarAgentes).
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
import { requireProfileAccess, agenciaDe, puedeUsarAgentes, puedeVerSaldo } from './_lib/access.js'
import { enContexto } from './_lib/contexto.js'
import { llmChat } from './_lib/llm.js'
import { getToken, getMediaUrls } from './_lib/instagram.js'
import { exigirImporte, cobrarFijo, cobradoYa, quienPagaPerfil, conCerrojoAgencia, PRECIOS_FIJOS } from './_lib/creditos.js'
import { recibeTrozo, recibidosDe, cierraSubida, contestaError, rutaParte } from './_lib/subida-trozos.js'
import {
  normalizaAjustes, procesaVariante, descargaFuente, limpiaViejos, encola, enCola, quitaDeCola, colaUsa, largoCola, sondea,
  rutaSalida, rutaGancho, rutaFuente, rutaFuenteSubida, dirSubidaFuente, minLibreTrial, esVideoIsoBmff, guardadoDelPerfil,
  CARPETA, MAX_VIDEO, MAX_DURACION_FUENTE, DIAS_GUARDADO,
} from './_lib/variantes.js'
import { normalizaGanchos, esReel, MAX_VARIANTES, PALABRAS_GANCHO, MAX_CARACTERES_GANCHO, LIENZO } from '../src/agents/trialreels/reglas.js'
import { extraeJson } from './portadas.js'

const TABLA = 'helm_trial_reels'
const COLUMNAS = 'id, media_id, fuente_id, variante, ajustes, estado, bytes, duracion, error, precio_eur, cobrado_eur, created_at, updated_at'
const FUENTES = 'helm_trial_fuentes'
const COLUMNAS_FUENTE = 'id, nombre, bytes, tipo, duracion, estado, error, created_at, updated_at'
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
// Lo que cuesta cada variante, en euros de saldo.
const PRECIO = PRECIOS_FIJOS['trial-reel']
// Vídeos subiéndose a la vez por perfil, y vídeos nuevos por perfil y hora:
// cada uno son hasta 200 MB de disco.
const MAX_SUBIENDO_PERFIL = 3
const MAX_FUENTES_HORA = 20
// Una subida que lleva esto sin recibir un byte (ni la fila ni su subida.part
// se han movido) se da por cortada: ya no cuenta para MAX_SUBIENDO_PERFIL y el
// panel la enseña como «Cortada». Un trozo de 32 MB por un móvil lento tarda
// unos minutos; esto le deja margen de sobra.
const SUBIDA_PARADA_MS = 15 * 60_000
// Lo que un perfil puede tener guardado de vídeos subidos (cada uno, 7 días):
// subir no cuesta nada y el disco es el del Editor de reels y los montajes.
const MAX_GUARDADOS_PERFIL = 10
const MAX_BYTES_GUARDADOS = 2 * 1024 * 1024 * 1024
// Cada cuánto corre mantenimiento() (y la primera vez, al minuto de cargar).
const CADA_MANTENIMIENTO_MS = 60 * 60_000
// Los vídeos que acepta la subida (lo que graba un móvil, también el 3GP de
// algunos Android); el tipo lo dice el navegador y puede venir vacío: lo que
// manda son los bytes (esVideoIsoBmff).
const TIPOS_VIDEO = new Set(['video/mp4', 'video/quicktime', 'video/x-m4v', 'video/3gpp', ''])
const EXT_VIDEO = /\.(mp4|mov|m4v|3gp)$/i
const NO_ES_VIDEO = 'Ese archivo no es un vídeo MP4 o MOV. Si lo es, expórtalo otra vez como MP4 (desde la galería del móvil o con cualquier editor) y vuelve a subirlo.'
const MB = 1024 * 1024
// Lo que gasta o sube (o quita): exige además que el rol pueda usar los agentes.
const ACCIONES_DE_USO = new Set(['fuente', 'trozo', 'crear', 'ganchos', 'borrar', 'borrar-fuente'])
const SIN_ROL = 'Tu rol no puede usar los agentes de este perfil.'
// Lo que se sirve de un archivo (el MP4 montado, el vídeo subido): que el
// navegador no lo interprete como otra cosa ni ejecute nada desde el origen del
// panel, aunque un día cambie lo que se acepta al subir.
function cabecerasDeArchivo(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox")
}

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
const fallo = (message, statusCode, extra = {}) => Object.assign(new Error(message), { statusCode, ...extra })
const euros = (v) => (v == null ? null : Number(v))

/** El nombre del archivo, solo para enseñarlo: sin carpetas ni caracteres de control. */
export function nombreSeguro(nombre) {
  const base = String(nombre ?? '').split(/[\\/]/).pop()
  return base.replace(/\p{Cc}/gu, '').replace(/\s+/g, ' ').trim().slice(0, 120) || 'video.mp4'
}

/** ¿Sigue en disco (y dentro de sus 7 días) el vídeo subido? */
async function fuenteDisponible(clientId, fuenteId) {
  try {
    const st = await fsp.stat(rutaFuenteSubida(clientId, fuenteId))
    return st.isFile() && Date.now() - st.mtimeMs < DIAS_GUARDADO * 86_400_000
  } catch { return false }
}

/**
 * Cuándo se movió por última vez una subida: la fila (cada trozo que llega la
 * toca) o su subida.part (crece mientras entra un trozo). En ms.
 */
async function actividadDe(f) {
  let t = new Date(f.updated_at || f.created_at).getTime() || 0
  try { t = Math.max(t, (await fsp.stat(rutaParte(dirSubidaFuente(f.id)))).mtimeMs) } catch { /* aún sin trozos */ }
  return t
}
const subidaViva = async (f) => f.estado === 'subiendo' && Date.now() - (await actividadDe(f)) <= SUBIDA_PARADA_MS

/**
 * Un vídeo subido tal y como lo ve el panel. Uno «subiendo» que no se mueve
 * desde hace SUBIDA_PARADA_MS sale como «cortada» (se cerró la pestaña, se
 * cortó la red…): el panel lo enseña así, con «Quitar».
 */
async function publicaFuente(f, clientId) {
  let estado = f.estado
  let error = f.error || null
  if (estado === 'subiendo' && !(await subidaViva(f))) {
    estado = 'cortada'
    error = 'La subida se cortó a medias. Quítala y vuelve a subir el vídeo.'
  }
  return {
    id: f.id,
    nombre: f.nombre || 'video.mp4',
    bytes: f.bytes == null ? null : Number(f.bytes),
    duracion: f.duracion == null ? null : Number(f.duracion),
    estado,
    error,
    disponible: estado === 'lista' ? await fuenteDisponible(clientId, f.id) : false,
    creado: f.created_at,
  }
}

// Lo que la agencia tiene ya comprometido en Trial reels (las variantes en
// cola o montándose, sin cobrar) lo cuenta apartadoDeAgencia de
// api/_lib/creditos.js junto con lo de los demás agentes: exigirImporte lo
// resta solo. (Hasta el 27-oct era pendienteTrial, y solo restaba lo suyo.)

/**
 * Cobra una variante que ha salido bien (cobrarFijo con `trial:<id>`: con la
 * misma referencia no se cobra dos veces) y apunta lo cobrado en la fila: lo
 * cobrado ahora o antes (un reintento), o 0 si la agencia no paga. Si no se
 * sabe (falla la base), se deja en null y se vuelve a probar desde la lista o
 * desde mantenimiento().
 * Nunca lanza.
 */
export async function cobraVariante({ id, clientId, precio }) {
  const importe = Number(precio)
  if (!(importe > 0)) return null
  const referencia = `trial:${id}`
  try {
    let cobrado = (await cobrarFijo(clientId, importe, { concepto: 'trial-reel', referencia, origen: 'auto' })) != null ? importe : null
    if (cobrado == null) cobrado = await cobradoYa(referencia)
    if (cobrado == null && !(await quienPagaPerfil(clientId))) cobrado = 0
    if (cobrado != null) await marca(id, { cobrado_eur: cobrado })
    return cobrado
  } catch (e) {
    console.error('[trial-reels] no se pudo apuntar el cobro de', id, e?.message || e)
    return null
  }
}
// Los cobros que se están reintentando desde la lista o mantenimiento() (para
// no repetirlos a la vez).
const reintentando = new Set()

/**
 * Lo que se hace aunque nadie abra Trial reels: borrar lo que pasa de 7 días
 * (y las subidas abandonadas) y volver a cobrar lo que salió bien y no llegó a
 * apuntar su cobro (una caída de la base o un reinicio justo entonces; con la
 * misma referencia no se cobra dos veces). Devuelve cuántos cobros ha
 * apuntado. Nunca lanza.
 */
export async function mantenimiento() {
  await limpiaViejos().catch(e => console.error('[trial-reels] no pude limpiar:', e?.message || e))
  let apuntados = 0
  try {
    const { data, error } = await supabase.from(TABLA).select('id, client_id, precio_eur, cobrado_eur, updated_at')
      .eq('estado', 'listo').is('cobrado_eur', null).gt('precio_eur', 0).order('updated_at', { ascending: true }).limit(200)
    if (error) throw error
    for (const f of data || []) {
      // Las recién terminadas las está cobrando su trabajo.
      if (Date.now() - new Date(f.updated_at || 0).getTime() < MARGEN_REANIMA || reintentando.has(f.id)) continue
      reintentando.add(f.id)
      try {
        if ((await cobraVariante({ id: f.id, clientId: f.client_id, precio: f.precio_eur })) != null) apuntados++
      } finally { reintentando.delete(f.id) }
    }
  } catch (e) {
    console.error('[trial-reels] no pude mirar los cobros pendientes:', e?.message || e)
  }
  return apuntados
}

// Una vez por proceso (globalThis, por si el módulo se carga dos veces) y sin
// retener el proceso al salir. En los tests no corre: se llama a mano.
if (!globalThis.__helmTrialMantenimiento && !process.env.VITEST) {
  let corriendo = false
  const corre = () => {
    if (corriendo) return
    corriendo = true
    mantenimiento()
      .then(n => { if (n) console.log(`[trial-reels] ${n} cobro(s) pendiente(s) apuntado(s)`) })
      .finally(() => { corriendo = false })
  }
  setTimeout(corre, 60_000).unref?.()
  globalThis.__helmTrialMantenimiento = setInterval(corre, CADA_MANTENIMIENTO_MS)
  globalThis.__helmTrialMantenimiento.unref?.()
}

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
    mediaId: fila.media_id || null,
    fuenteId: fila.fuente_id || null,
    variante: fila.variante,
    ajustes: fila.ajustes || {},
    estado,
    error,
    bytes: fila.bytes == null ? null : Number(fila.bytes),
    duracion: fila.duracion == null ? null : Number(fila.duracion),
    precio: euros(fila.precio_eur),
    cobrado: euros(fila.cobrado_eur),
    disponible,
    creado: fila.created_at,
    actualizado: fila.updated_at,
  }
}

/** Apunta cambios en la variante. Lanza si la base no lo guarda (nadie debe dar por hecho lo que no consta). */
async function marca(id, cambios) {
  const { error } = await supabase.from(TABLA).update({ ...cambios, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) {
    console.error('[trial-reels] no se pudo apuntar', id, error.message || error)
    throw fallo('No se pudo guardar cómo va la variante. Vuelve a crearla.', 500)
  }
}

/**
 * El trabajo de una variante, tal y como corre en la cola: baja la fuente (si
 * no está ya de otra variante de la misma tanda; un vídeo subido ya está en
 * disco), monta, apunta el resultado y, si ha salido bien, la cobra. Todo con
 * el id y el perfil; nada de lo que diga la fila sobre rutas.
 */
function trabajoDe({ id, clientId, mediaId, fuenteId = null }) {
  const subido = Boolean(fuenteId)
  const fuente = subido ? rutaFuenteSubida(clientId, fuenteId) : rutaFuente(clientId, mediaId)
  return {
    id,
    fuente,
    // Fuera del contexto de la petición que lo encoló: no debe quedar a nombre
    // de nadie (el cobro va aparte, con el perfil explícito).
    ejecuta: () => enContexto({ origen: 'trial-reels' }, async () => {
      const { data: fila } = await supabase.from(TABLA).select('id, media_id, ajustes, estado, precio_eur')
        .eq('id', id).eq('client_id', clientId).maybeSingle()
      if (!fila || fila.estado !== 'en_cola') return
      await marca(id, { estado: 'procesando', error: null })
      const ajustes = normalizaAjustes(fila.ajustes)
      const gancho = ajustes.conGancho ? rutaGancho(id) : null
      let salio = false
      let borrada = false
      try {
        await limpiaViejos()
        if (subido && !fs.existsSync(fuente)) throw fallo(`El vídeo que subiste ya no está (se guardan ${DIAS_GUARDADO} días). Vuelve a subirlo.`)
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
        // Solo cuenta como hecha (y se cobra) si la base ha apuntado «listo»
        // en SU fila: si no, nadie la podría descargar. Si no vuelve ninguna,
        // la borraron mientras se montaba (el botón sale también en
        // «procesando», y quitaDeCola solo para ffmpeg si ya corría): fuera
        // el MP4 y no se cobra.
        const { data: marcadas, error: errListo } = await supabase.from(TABLA)
          .update({ estado: 'listo', archivo: `trial-reels/${id}.mp4`, bytes: r.bytes, duracion: r.duracion, error: null, updated_at: new Date().toISOString() })
          .eq('id', id).eq('client_id', clientId).select('id')
        if (errListo) {
          console.error('[trial-reels] no se pudo apuntar', id, errListo.message || errListo)
          throw fallo('No se pudo guardar cómo va la variante. Vuelve a crearla.', 500)
        }
        if (!marcadas?.length) {
          borrada = true
          console.log('[trial-reels]', id, 'la borraron mientras se montaba: ni se guarda ni se cobra')
          await fsp.rm(rutaSalida(id), { force: true })
        } else {
          salio = true
        }
      } catch (e) {
        console.error('[trial-reels]', id, e?.message || e)
        // Lo que no se entrega no se queda en el disco.
        await fsp.rm(rutaSalida(id), { force: true })
        await marca(id, { estado: 'error', error: recorta(e?.message || 'No se pudo montar', 300) })
      } finally {
        if (gancho) await fsp.rm(gancho, { force: true })
        // La de Instagram se vuelve a bajar cuando haga falta; la subida no:
        // se queda sus 7 días para sacar más variantes.
        if (!subido && !colaUsa(fuente, id)) await fsp.rm(fuente, { force: true })
      }
      // Solo lo que ha salido bien (y sigue en la tabla) se cobra.
      if (salio && !borrada) await cobraVariante({ id, clientId, precio: fila.precio_eur })
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
    // Un trozo en crudo sin leer: contestaError cierra la conexión al acabar.
    if (action === 'trozo') return contestaError(req, res, Object.assign(err, { statusCode: err.statusCode || 401 }))
    return res.status(err.statusCode || 401).json({ error: err.message })
  }

  // Lo que gasta o sube: solo si el rol puede usar los agentes del perfil. Va
  // antes de leer nada del cuerpo de un trozo (contestaError no lo lee y
  // cierra la conexión). Si no se puede mirar (falla la base), tampoco pasa.
  if (ACCIONES_DE_USO.has(action)) {
    let corte = null
    try {
      if (!(await puedeUsarAgentes(auth, clientId))) corte = fallo(SIN_ROL, 403)
    } catch (err) {
      console.error('[trial-reels] no se pudo mirar el rol:', err?.message || err)
      corte = fallo('No se pudo comprobar tu rol ahora mismo. Prueba otra vez.', 503)
    }
    if (corte) {
      if (action === 'trozo') return contestaError(req, res, corte)
      return res.status(corte.statusCode).json({ error: corte.message })
    }
  }

  // ── POST|GET ?action=trozo ─────────────────────────────────────────────
  // El cuerpo es el trozo en crudo (scripts/api-server.mjs no lo lee): va
  // aparte, con sus errores por contestaError.
  if (action === 'trozo') return trozo(req, res, clientId)

  try {
    // ── GET ?action=lista ──────────────────────────────────────────────────
    if (req.method === 'GET' && action === 'lista') {
      const [{ data, error }, { data: fuentes, error: errFuentes }] = await Promise.all([
        supabase.from(TABLA).select(COLUMNAS).eq('client_id', clientId).order('created_at', { ascending: false }).limit(30),
        supabase.from(FUENTES).select(COLUMNAS_FUENTE).eq('client_id', clientId).order('created_at', { ascending: false }).limit(20),
      ])
      if (error) return res.status(500).json({ error: error.message })
      if (errFuentes) return res.status(500).json({ error: errFuentes.message })
      for (const f of data || []) {
        const edad = Date.now() - new Date(f.updated_at || f.created_at).getTime()
        // Lo que se quedó en cola antes de un reinicio vuelve a la cola.
        if (f.estado === 'en_cola' && !enCola(f.id) && Date.now() - new Date(f.created_at).getTime() > MARGEN_REANIMA) {
          encola(trabajoDe({ id: f.id, clientId, mediaId: f.media_id, fuenteId: f.fuente_id }))
        }
        // Lo que salió bien y no llegó a apuntar su cobro (se cayó la base o el
        // servidor justo entonces): se vuelve a probar, con la misma referencia.
        if (f.estado === 'listo' && f.cobrado_eur == null && Number(f.precio_eur) > 0 && edad > MARGEN_REANIMA && !reintentando.has(f.id)) {
          reintentando.add(f.id)
          cobraVariante({ id: f.id, clientId, precio: f.precio_eur }).finally(() => reintentando.delete(f.id))
        }
      }
      return res.status(200).json({
        trabajos: await Promise.all((data || []).map(publica)),
        fuentes: await Promise.all((fuentes || []).map(f => publicaFuente(f, clientId))),
      })
    }

    // ── POST ?action=ganchos ───────────────────────────────────────────────
    // Lo único que gasta por tokens: Claude lee el reel (o lo que cuenta el
    // usuario de su vídeo subido) y la Biblia y propone 3 ganchos.
    if (req.method === 'POST' && action === 'ganchos') {
      const mediaId = String(req.body?.mediaId || '')
      let base
      if (mediaId) {
        const { data: reel } = await supabase.from('helm_ig_media')
          .select('media_id, caption, visitas, retencion_media, guardados, compartidos')
          .eq('client_id', clientId).eq('media_id', mediaId).maybeSingle()
        if (!reel) return res.status(404).json({ error: 'No encuentro ese reel en este perfil' })
        if (!String(reel.caption || '').trim()) return res.status(400).json({ error: 'Ese reel no tiene caption: escribe tú el gancho' })
        base = [
          `CAPTION DEL REEL:\n${recorta(reel.caption, 2200)}`,
          `DATOS: ${Number(reel.visitas) || 0} visualizaciones · ${Number(reel.guardados) || 0} guardados · ${Number(reel.compartidos) || 0} compartidos${reel.retencion_media ? ` · ${Number(reel.retencion_media).toFixed(1)} s de visionado medio` : ''}.`,
        ]
      } else {
        // Un vídeo subido no tiene caption: lo que cuente el usuario hace de caption.
        const texto = recorta(String(req.body?.texto || '').trim(), 2200)
        if (!texto) return res.status(400).json({ error: 'Cuenta de qué va el vídeo para proponer ganchos, o escríbelos tú' })
        base = [`DE QUÉ VA EL VÍDEO (lo cuenta su autor; hace de caption):\n${texto}`]
      }

      const { data: biblias } = await supabase.from('helm_biblia').select('kind, content').eq('client_id', clientId)
      const biblia = (biblias || []).map(b => `## Biblia de ${b.kind}\n${recorta(b.content, 3500)}`).join('\n\n')
      const usuario = [
        ...base,
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

    // ── POST ?action=fuente ────────────────────────────────────────────────
    // Empieza la subida de un vídeo propio: se apunta lo que anuncia el
    // navegador y los trozos llegan por ?action=trozo. Si no llega el saldo ni
    // para una variante, se dice ya, antes de subir cientos de MB.
    if (req.method === 'POST' && action === 'fuente') {
      const nombre = nombreSeguro(req.body?.nombre)
      const bytes = Number(req.body?.bytes)
      const tipo = String(req.body?.tipo || '').split(';')[0].trim().toLowerCase()
      const crudo = req.body?.duracion
      const duracion = crudo == null || crudo === '' ? null : Number(crudo)
      if (!Number.isSafeInteger(bytes) || bytes <= 0) return res.status(400).json({ error: 'No se sabe cuánto pesa el vídeo' })
      if (bytes > MAX_VIDEO) return res.status(413).json({ error: `El vídeo pesa más de ${Math.round(MAX_VIDEO / MB)} MB` })
      if (!TIPOS_VIDEO.has(tipo) || (!tipo && !EXT_VIDEO.test(nombre))) {
        return res.status(415).json({ error: 'Sube un vídeo MP4 o MOV (lo que graba el móvil). Si es de otro tipo, expórtalo como MP4.' })
      }
      // La del navegador es orientativa (la de verdad la da ffprobe al acabar),
      // pero si ya dice que se pasa, no se sube.
      if (duracion != null && (!Number.isFinite(duracion) || duracion <= 0)) return res.status(400).json({ error: 'No se sabe cuánto dura el vídeo' })
      if (duracion != null && duracion > MAX_DURACION_FUENTE + 0.5) {
        return res.status(400).json({ error: `El vídeo dura más de ${MAX_DURACION_FUENTE / 60} minutos` })
      }

      const { data: recientes, error: errR } = await supabase.from(FUENTES).select('id, estado, bytes, created_at, updated_at').eq('client_id', clientId)
        .order('created_at', { ascending: false }).limit(MAX_FUENTES_HORA + 5)
      if (errR) return res.status(500).json({ error: errR.message })
      // Solo cuentan las que de verdad se están subiendo: una cortada (pestaña
      // cerrada, red caída) no tapa el hueco.
      const vivas = []
      for (const f of recientes || []) if (await subidaViva(f)) vivas.push(f)
      if (vivas.length >= MAX_SUBIENDO_PERFIL) return res.status(429).json({ error: 'Ya hay vídeos subiéndose en este perfil. Espera a que terminen.' })
      const haceUnaHora = Date.now() - 3_600_000
      if ((recientes || []).filter(f => new Date(f.created_at).getTime() > haceUnaHora).length >= MAX_FUENTES_HORA) {
        return res.status(429).json({ error: 'Has subido muchos vídeos en la última hora. Prueba dentro de un rato.' })
      }
      // El tope de lo guardado: lo que hay en el disco y lo que está llegando.
      const guardado = await guardadoDelPerfil(clientId)
      if (guardado.videos + vivas.length >= MAX_GUARDADOS_PERFIL) {
        return res.status(429).json({ error: `Ya tienes ${MAX_GUARDADOS_PERFIL} vídeos subidos guardados. Quita alguno en «Tus vídeos subidos» para subir otro.` })
      }
      const llegando = vivas.reduce((s, f) => s + (Number(f.bytes) || 0), 0)
      if (guardado.bytes + llegando + bytes > MAX_BYTES_GUARDADOS) {
        const gb = (n) => (n / 1024 ** 3).toLocaleString('es-ES', { maximumFractionDigits: 1 })
        return res.status(429).json({
          error: `Tus vídeos subidos ya ocupan ${gb(guardado.bytes + llegando)} GB y el tope es de ${gb(MAX_BYTES_GUARDADOS)} GB por perfil. Quita alguno en «Tus vídeos subidos» para subir este.`,
        })
      }
      // Aquí no se aparta nada (subir no cuesta): basta con mirar, sin cerrojo.
      await exigirImporte(clientId, PRECIO, { detalle: await puedeVerSaldo(auth, clientId) })
      // De paso, fuera lo viejo y las subidas abandonadas (también lo hace cada montaje).
      limpiaViejos().catch(() => {})

      const { data: f, error } = await supabase.from(FUENTES).insert({
        client_id: clientId, nombre, bytes, tipo: tipo || null, duracion: duracion == null ? null : Math.round(duracion * 100) / 100,
        estado: 'subiendo', creado_por: UUID.test(String(auth?.userId || '')) ? auth.userId : null,
      }).select(COLUMNAS_FUENTE)
      if (error) return res.status(500).json({ error: 'No se pudo empezar la subida: ' + error.message })
      const fila = Array.isArray(f) ? f[0] : f
      return res.status(200).json({ fuenteId: fila.id, fuente: await publicaFuente(fila, clientId) })
    }

    // ── POST ?action=crear ─────────────────────────────────────────────────
    if (req.method === 'POST' && action === 'crear') {
      const fuenteId = req.body?.fuenteId == null || req.body.fuenteId === '' ? '' : String(req.body.fuenteId)
      if (fuenteId && req.body?.mediaId) return res.status(400).json({ error: 'O un reel o un vídeo subido, no los dos' })
      const mediaId = fuenteId ? null : String(req.body?.mediaId || '')
      if (fuenteId ? !UUID.test(fuenteId) : !MEDIA.test(mediaId)) {
        return res.status(400).json({ error: fuenteId ? 'Vídeo no válido' : 'Reel no válido' })
      }
      const variantes = Array.isArray(req.body?.variantes) ? req.body.variantes : []
      if (!variantes.length || variantes.length > MAX_VARIANTES) {
        return res.status(400).json({ error: `Entre 1 y ${MAX_VARIANTES} variantes` })
      }
      if (fuenteId) {
        const { data: f } = await supabase.from(FUENTES).select('id, estado').eq('id', fuenteId).eq('client_id', clientId).maybeSingle()
        if (!f) return res.status(404).json({ error: 'No encuentro ese vídeo en este perfil' })
        if (f.estado !== 'lista') return res.status(409).json({ error: f.estado === 'subiendo' ? 'El vídeo aún no ha terminado de subir' : 'Ese vídeo no se pudo leer. Vuelve a subirlo.' })
        if (!(await fuenteDisponible(clientId, fuenteId))) {
          return res.status(410).json({ error: `Ese vídeo ya no está (se guardan ${DIAS_GUARDADO} días). Vuelve a subirlo.` })
        }
      } else {
        const { data: reel } = await supabase.from('helm_ig_media').select('media_id, tipo, producto')
          .eq('client_id', clientId).eq('media_id', mediaId).maybeSingle()
        if (!reel) return res.status(404).json({ error: 'No encuentro ese reel en este perfil' })
        if (!esReel(reel)) return res.status(400).json({ error: 'Esa publicación no es un reel' })
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
        fuente_id: fuenteId || null,
        variante: i + 1,
        ajustes: { ...normalizaAjustes(v?.ajustes, `${mediaId || fuenteId}:${i}`), conGancho: Boolean(pngs[i]) },
        estado: 'en_cola',
        precio_eur: PRECIO,
        creado_por: UUID.test(String(auth?.userId || '')) ? auth.userId : null,
      }))
      // Lo que el perfil tiene en marcha, el saldo y meterlas en la tabla van
      // de uno en uno por agencia, con el MISMO cerrojo que el resto de
      // agentes (conCerrojoAgencia): dos «crear» a la vez, o un «crear» y una
      // portada o un vídeo del Editor, no pasan con lo que solo llega para uno.
      // Un perfil sin agencia no paga, pero su tope de pendientes también va
      // de uno en uno: su propio id hace de clave.
      const verSaldo = await puedeVerSaldo(auth, clientId)
      const { data: creadas, error } = await conCerrojoAgencia((await agenciaDe(clientId)) || clientId, async () => {
        const { count } = await supabase.from(TABLA).select('id', { count: 'exact', head: true })
          .eq('client_id', clientId).in('estado', ['en_cola', 'procesando'])
        if ((count || 0) + variantes.length > MAX_PENDIENTES_PERFIL) {
          throw fallo('Ya hay variantes de este perfil montándose. Espera a que terminen.', 429)
        }
        // Que llegue para todas, contando lo que la agencia ya tiene apartado
        // sin cobrar (de todos los agentes). Si no, 402 y no se crea ninguna.
        // Se cobran al salir bien.
        await exigirImporte(clientId, PRECIO * variantes.length, { detalle: verSaldo })
        return supabase.from(TABLA).insert(filas).select(COLUMNAS)
      })
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
      for (const f of orden) if (f.estado === 'en_cola') encola(trabajoDe({ id: f.id, clientId, mediaId, fuenteId: fuenteId || null }))
      return res.status(200).json({ ids: orden.map(f => f.id), trabajos: await Promise.all(orden.map(publica)) })
    }

    // ── GET ?action=estado | descarga | fuente-video · POST ?action=borrar | borrar-fuente
    const id = String(req.query.id || req.body?.id || '')
    if (['estado', 'descarga', 'borrar', 'fuente-video', 'borrar-fuente'].includes(action) && !UUID.test(id)) {
      return res.status(400).json({ error: action.includes('fuente') ? 'Vídeo no válido' : 'Variante no válida' })
    }

    // El vídeo subido, para la vista previa del taller (solo del perfil).
    if (req.method === 'GET' && action === 'fuente-video') {
      const { data: f } = await supabase.from(FUENTES).select('id, estado').eq('id', id).eq('client_id', clientId).maybeSingle()
      if (!f) return res.status(404).json({ error: 'No encuentro ese vídeo' })
      if (f.estado !== 'lista' || !(await fuenteDisponible(clientId, id))) {
        return res.status(410).json({ error: `Ese vídeo ya no está (se guardan ${DIAS_GUARDADO} días). Vuelve a subirlo.` })
      }
      const ruta = rutaFuenteSubida(clientId, id)
      const st = await fsp.stat(ruta)
      res.setHeader('Content-Type', 'video/mp4')
      res.setHeader('Content-Length', String(st.size))
      // Un nombre fijo: el que puso quien subió no sale de la base.
      res.setHeader('Content-Disposition', 'inline; filename="video.mp4"')
      res.setHeader('Cache-Control', 'private, no-store')
      cabecerasDeArchivo(res)
      try {
        await pipeline(fs.createReadStream(ruta), res)
      } catch (e) {
        if (!res.headersSent) return res.status(500).json({ error: 'No se pudo leer el archivo' })
        res.destroy(e)
      }
      return undefined
    }

    if (req.method === 'POST' && action === 'borrar-fuente') {
      const { data: f } = await supabase.from(FUENTES).select('id').eq('id', id).eq('client_id', clientId).maybeSingle()
      if (!f) return res.status(404).json({ error: 'No encuentro ese vídeo' })
      const { count } = await supabase.from(TABLA).select('id', { count: 'exact', head: true })
        .eq('client_id', clientId).eq('fuente_id', id).in('estado', ['en_cola', 'procesando'])
      if (count) return res.status(409).json({ error: 'Hay variantes de este vídeo montándose. Espera a que terminen.' })
      await Promise.all([
        fsp.rm(rutaFuenteSubida(clientId, id), { force: true }),
        fsp.rm(dirSubidaFuente(id), { recursive: true, force: true }),
      ])
      const { error } = await supabase.from(FUENTES).delete().eq('id', id).eq('client_id', clientId)
      if (error) return res.status(500).json({ error: 'No se pudo borrar: ' + error.message })
      return res.status(200).json({ ok: true })
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
      cabecerasDeArchivo(res)
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
    // Un 402 (sin saldo) es una respuesta normal, no un fallo del servidor.
    if (!err?.statusCode || err.statusCode >= 500) console.error('[trial-reels]', err)
    if (res.headersSent) return undefined
    return res.status(err.statusCode || 500).json({ error: err.message || 'Error' })
  }
}

// Los vídeos subidos que se están cerrando (sondeando) ahora mismo: un trozo
// que llegue mientras (un reintento del último) no debe empezar otra subida.
const cerrando = new Set()

/**
 * Un trozo del vídeo subido (POST, el cuerpo en crudo) o cuánto ha llegado
 * (GET). El primero se mira por sus bytes (si no es un MP4/MOV, fuera y 415);
 * el último cierra la subida, la sondea con ffprobe y deja el vídeo «lista».
 */
async function trozo(req, res, clientId) {
  try {
    const id = String(req.query.id || '')
    if (!UUID.test(id)) throw fallo('Vídeo no válido', 400)
    if (req.method !== 'GET' && req.method !== 'POST') throw fallo('Method not allowed', 405)
    const { data: f, error } = await supabase.from(FUENTES).select(COLUMNAS_FUENTE).eq('id', id).eq('client_id', clientId).maybeSingle()
    if (error) throw error
    if (!f) throw fallo('No encuentro ese vídeo', 404)
    const total = Number(f.bytes)
    const dir = dirSubidaFuente(id)
    const destino = rutaFuenteSubida(clientId, id)
    // Ya entero (o cerrándose): todo lo que tenga que llegar ha llegado.
    const entero = f.estado === 'lista' || cerrando.has(id) || fs.existsSync(destino)
    // Con el estado, para que el panel sepa si seguir esta subida o empezar otra.
    if (req.method === 'GET') return res.status(200).json({ recibidos: entero ? total : await recibidosDe(dir), estado: entero ? 'lista' : f.estado })
    if (entero) throw fallo('Ese vídeo ya ha llegado entero.', 409, { recibidos: total })
    if (f.estado !== 'subiendo') throw fallo(f.error || 'Esa subida falló. Vuelve a subir el vídeo.', 410)

    const r = await recibeTrozo(req, { dir, total, offset: req.query.offset, minLibre: minLibreTrial() })
    // En cuanto están los primeros bytes, se mira que sea un vídeo de verdad.
    if (Number(req.query.offset) < 12 && r.recibidos >= 12) {
      const cabeza = Buffer.alloc(12)
      const h = await fsp.open(rutaParte(dir), 'r')
      try { await h.read(cabeza, 0, 12, 0) } finally { await h.close() }
      if (!esVideoIsoBmff(cabeza)) {
        await fsp.rm(dir, { recursive: true, force: true })
        await marcaFuente(id, { estado: 'error', error: NO_ES_VIDEO })
        throw fallo(NO_ES_VIDEO, 415)
      }
    }
    if (!r.completo) {
      // Que se note que sigue viva (ver subidaViva): cada trozo toca la fila.
      await marcaFuente(id, {}).catch(() => {})
      return res.status(200).json(r)
    }

    cerrando.add(id)
    try {
      await cierraSubida(dir, destino, total)
      await fsp.rm(dir, { recursive: true, force: true })
      // Otra vez los primeros bytes, ya del archivo entero (uno de menos de 12
      // bytes no ha pasado por la comprobación de arriba).
      const cabeza = Buffer.alloc(12)
      const h = await fsp.open(destino, 'r')
      try { await h.read(cabeza, 0, 12, 0) } finally { await h.close() }
      if (!esVideoIsoBmff(cabeza)) {
        await fsp.rm(destino, { force: true })
        await marcaFuente(id, { estado: 'error', error: NO_ES_VIDEO })
        throw fallo(NO_ES_VIDEO, 415)
      }
      let info
      try {
        info = await sondea(destino)
        if (!info.duracion) throw fallo('No se sabe cuánto dura el vídeo', 422)
        if (info.duracion > MAX_DURACION_FUENTE) throw fallo(`El vídeo dura más de ${MAX_DURACION_FUENTE / 60} minutos`, 422)
      } catch (e) {
        await fsp.rm(destino, { force: true })
        const mensaje = e?.statusCode === 422 && e.message ? e.message : 'No se pudo leer el vídeo. Prueba con un MP4 o MOV del móvil.'
        await marcaFuente(id, { estado: 'error', error: mensaje })
        throw fallo(mensaje, 422)
      }
      const cambios = { estado: 'lista', error: null, duracion: Math.round(info.duracion * 100) / 100 }
      await marcaFuente(id, cambios)
      return res.status(200).json({ ...r, fuente: await publicaFuente({ ...f, ...cambios }, clientId) })
    } finally {
      cerrando.delete(id)
    }
  } catch (e) {
    return contestaError(req, res, e)
  }
}

async function marcaFuente(id, cambios) {
  await supabase.from(FUENTES).update({ ...cambios, updated_at: new Date().toISOString() }).eq('id', id)
}
