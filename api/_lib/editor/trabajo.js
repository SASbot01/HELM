// HELM — Editor de reels: el trabajo `editor-render` del worker
// (scripts/agents-worker.mjs). La API solo sube el original y encola; esto
// corre en el worker porque transcribir y montar se comen la CPU varios
// minutos, y el panel tiene que seguir respondiendo.
//
//   1. ffprobe        → tamaño visible (con la rotación del móvil), duración, audio
//   2. audio a 16 kHz → Whisper (scripts/agents-transcribe.py --palabras)
//   3. el plan        → tomas, muletillas, silencios, zoom, subtítulos y los
//                       recursos del usuario: imágenes y clips, logo y música (plan.js);
//                       la música se mide (mideMusica) para llevarla a su sonoridad
//   4. ffmpeg         → el MP4 1080×1920 (render.js)
//   5. el cobro       → solo si ha salido bien: precio_eur de la fila, con la
//                       referencia `editor:<id>` (nunca dos veces) y apuntado en
//                       cobrado_eur (0 si el perfil no paga: sin agencia o la casa)
//
// En cada paso se apunta en helm_ediciones el estado, el % y qué está haciendo
// en castellano llano: el panel lo enseña tal cual. Si mientras tanto alguien
// borra la edición, el montaje se corta (y no se cobra). Si el apunte del
// cobro falla, cobrado_eur se queda vacío y lo reintenta reintentaCobros (el
// worker, cada hora).
//
// Lo que se queda colgado no ocupa sitio para siempre: una subida parada más
// de HORAS_SUBIDA pasa a «error» (caducaSubidas, al crear y cada hora), y una
// edición en cola o a medias cuyo trabajo ya no va a correr, también
// (edicionFallida cuando el worker se rinde; cierraColgadas cada hora, por si
// ni eso se pudo apuntar).
import fsp from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { supabase } from '../../lib/supabase.js'
import { normalizaEstilo } from '../../../src/agents/editor/estilo.js'
import { ejecuta, FFMPEG } from '../variantes.js'
import { sondeaVideo, COMO_MOV } from './formato.js'
import { cobrarFijo, cobradoYa, quienPagaPerfil } from '../creditos.js'
import { planDeEdicion } from './plan.js'
import { assDe } from './subtitulos.js'
import { renderiza, entradasDe, mideMusica } from './render.js'
import {
  UUID, HORAS_SUBIDA, rutaOriginal, rutaEditado, rutaVoz, rutaAss, rutaRecurso, limpiaEdiciones, maxDuracionOriginal, pasaDelTope,
} from './archivos.js'
import { gananciaMusica } from './plan.js'

export const TABLA = 'helm_ediciones'
// Lo que ya está lanzado y aún no ha acabado (ni bien ni mal).
export const EN_CURSO = Object.freeze(['en_cola', 'transcribiendo', 'montando'])
// Una subida que lleva esto sin recibir nada es que se abandonó (su carpeta
// la borra limpiaEdiciones a la vez: api/_lib/subida-trozos.js).
export const CADUCA_SUBIENDO_MS = HORAS_SUBIDA * 3600_000
export const ABANDONADA = 'La subida no terminó. Vuelve a subir el vídeo.'
const COLGADA = 'No se pudo editar el vídeo (se quedó a medias). Vuelve a subirlo: no se te ha cobrado.'
// Una edición en cola sin trabajo vivo se da por colgada pasado este rato (el
// margen es para no pisar un «lanzar» que está encolando justo ahora).
const MARGEN_COLGADA_MS = 15 * 60_000
const lanza = promisify(execFile)
// Whisper en CPU: media hora de tope (un original de 10 minutos tarda bastante menos).
const TOPE_WHISPER_MS = 30 * 60_000
// Cada cuánto se apunta el % en la base de datos como mucho.
const CADA_PROGRESO_MS = 3000

const recorta = (t, n) => String(t || '').slice(0, n)
const fallo = (message) => Object.assign(new Error(message), { statusCode: 422 })
const duerme = (ms) => new Promise(r => setTimeout(r, ms))
const minSeg = (s) => {
  const t = Math.round(Number(s) || 0)
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
}

/**
 * Transcribe con las marcas de tiempo de cada palabra. Devuelve las palabras
 * ([{ w, a, b, p }]) y el idioma.
 */
export async function transcribePalabras(audio, { py, script, modelo }) {
  const { stdout } = await lanza(py, [script, audio, modelo, '--palabras'], { timeout: TOPE_WHISPER_MS, maxBuffer: 40 * 1024 * 1024 })
  let out
  try { out = JSON.parse(stdout) } catch { throw new Error('Whisper no ha devuelto JSON') }
  if (out.error) throw new Error(`Whisper: ${out.error}`)
  if (!Array.isArray(out.palabras)) throw new Error('Whisper no ha devuelto las palabras (¿falta --palabras en agents-transcribe.py?)')
  return { palabras: out.palabras, idioma: out.idioma || '' }
}

/**
 * Cobra una edición que ha salido bien. Devuelve lo que hay que apuntar en
 * cobrado_eur: el precio (cobrado ahora, o ya cobrado antes con la misma
 * referencia si el worker la repite), 0 si el perfil no paga, o null si no se
 * ha podido apuntar (se reintenta luego: con la misma referencia no hay riesgo
 * de cobrar dos veces). Nunca lanza.
 */
export async function cobraEdicion(clientId, id, precio, { log = () => {} } = {}) {
  const euros = Math.round((Number(precio) || 0) * 100) / 100
  if (!(euros > 0)) return 0
  const referencia = `editor:${id}`
  const saldo = await cobrarFijo(clientId, euros, { concepto: 'editor-reels', referencia, origen: 'auto' })
  if (saldo != null) return euros
  try {
    const ya = await cobradoYa(referencia)
    if (ya != null) return ya
    if (!await quienPagaPerfil(clientId)) return 0
  } catch (e) {
    log(`! edición ${id}: no sé si está cobrada (${e?.message || e}); lo vuelvo a mirar luego`)
    return null
  }
  log(`! edición ${id}: no se pudo cobrar (${euros} €); lo vuelvo a intentar luego`)
  return null
}

/**
 * Las ediciones listas que no se pudieron cobrar (cobrado_eur vacío y con
 * precio): se vuelve a intentar. Lo llama el worker cada hora. Devuelve
 * cuántas ha dejado apuntadas.
 */
export async function reintentaCobros({ db = supabase, log = () => {} } = {}) {
  const { data, error } = await db.from(TABLA).select('id, client_id, precio_eur')
    .eq('estado', 'listo').is('cobrado_eur', null).gt('precio_eur', 0).limit(50)
  if (error) throw new Error(error.message)
  let hechas = 0
  for (const f of data || []) {
    const cobrado = await cobraEdicion(f.client_id, f.id, f.precio_eur, { log })
    if (cobrado == null) continue
    await db.from(TABLA).update({ cobrado_eur: cobrado }).eq('id', f.id).eq('client_id', f.client_id)
    hechas++
  }
  return hechas
}

/**
 * Las subidas paradas desde hace más de HORAS_SUBIDA pasan a «error» (y dejan
 * sitio en los topes): las de todos los perfiles, o solo las de `clientId`.
 * Devuelve cuántas.
 */
export async function caducaSubidas({ db = supabase, clientId = null } = {}) {
  const ahora = new Date()
  let q = db.from(TABLA).update({ estado: 'error', paso: null, error: ABANDONADA, updated_at: ahora.toISOString() })
    .eq('estado', 'subiendo').lt('updated_at', new Date(ahora.getTime() - CADUCA_SUBIENDO_MS).toISOString())
  if (clientId) q = q.eq('client_id', clientId)
  const { data, error } = await q.select('id')
  if (error) throw new Error(error.message)
  return (data || []).length
}

/**
 * El trabajo `editor-render` de esta edición ya no se va a reintentar: si la
 * fila sigue en cola o a medias (el fallo fue antes de que editorRender
 * pudiera apuntarlo), pasa a «error». Lo llama el worker al rendirse.
 */
export async function edicionFallida(job, motivo, { db = supabase } = {}) {
  const { clientId, edicionId: id } = job?.payload || {}
  if (!UUID.test(String(id || '')) || !clientId) return false
  const { data, error } = await db.from(TABLA).update({
    estado: 'error', paso: 'No se pudo editar', error: recorta(motivo || COLGADA, 300), updated_at: new Date().toISOString(),
  }).eq('id', id).eq('client_id', clientId).in('estado', EN_CURSO).select('id')
  if (error) throw new Error(error.message)
  return Boolean(data?.length)
}

/**
 * Lo que se quedó colgado, de todos los perfiles (el worker, cada hora): las
 * subidas abandonadas, y las ediciones en cola o a medias de hace más de
 * MARGEN_COLGADA_MS cuyo trabajo ya no está pendiente ni corriendo (no se
 * llegó a encolar, o falló sin poder apuntarlo en la fila). Sin esto ocuparían
 * para siempre un sitio del perfil y apartarían su precio del saldo de la
 * agencia. Devuelve cuántas filas ha cerrado.
 */
export async function cierraColgadas({ db = supabase, log = () => {} } = {}) {
  let cerradas = await caducaSubidas({ db })
  const { data, error } = await db.from(TABLA).select('id, client_id').in('estado', EN_CURSO)
    .lt('updated_at', new Date(Date.now() - MARGEN_COLGADA_MS).toISOString()).limit(200)
  if (error) throw new Error(error.message)
  if (!data?.length) return cerradas
  const { data: trabajos, error: e2 } = await db.from('agent_jobs').select('clave, estado').in('clave', data.map(f => `editor-render:${f.id}`))
  if (e2) throw new Error(e2.message)
  const vivos = new Set((trabajos || []).filter(j => j.estado === 'pendiente' || j.estado === 'corriendo').map(j => j.clave))
  for (const f of data) {
    if (vivos.has(`editor-render:${f.id}`)) continue
    if (await edicionFallida({ payload: { clientId: f.client_id, edicionId: f.id } }, COLGADA, { db })) {
      cerradas++
      log(`! edición ${f.id}: se quedó a medias sin trabajo en la cola; pasa a error (sin cobrar)`)
    }
  }
  return cerradas
}

/**
 * El paso del worker. `opciones`:
 *   py, script, modelo → para Whisper (los mismos que usa el worker)
 *   db                 → el cliente de Supabase (por defecto, el del servidor)
 *   transcribe         → para las pruebas: sustituye a Whisper
 *   log                → para el registro del worker
 *   esperaMs           → lo que espera entre reintentos al leer la fila (pruebas: 0)
 */
export async function editorRender(job, opciones = {}) {
  const { db = supabase, log = () => {}, transcribe = transcribePalabras, esperaMs = 2000 } = opciones
  const { clientId, edicionId: id } = job?.payload || {}
  if (!UUID.test(String(id || '')) || !clientId) throw new Error('Trabajo de edición sin edicionId o clientId')

  // La fila, con dos reintentos: el trabajo tiene un solo intento, y si la base
  // no contesta aquí la edición se quedaría «en cola» para siempre. Si no hay
  // manera, se intenta dejarla en «error» antes de rendirse.
  let fila = null
  for (let intento = 1; ; intento++) {
    const { data, error } = await db.from(TABLA).select('id, client_id, estado, estilo, recursos, precio_eur')
      .eq('id', id).eq('client_id', clientId).maybeSingle()
    if (!error) { fila = data; break }
    if (intento >= 3) {
      await edicionFallida(job, COLGADA, { db }).catch(() => false)
      throw new Error(`No se pudo leer la edición: ${error.message}`)
    }
    log(`! edición ${id}: no pude leer la fila (${error.message}); lo intento otra vez`)
    await duerme(esperaMs * intento)
  }
  if (!fila) { log(`= edición ${id}: ya no existe (la borraron)`); return }
  if (fila.estado === 'listo') { log(`= edición ${id}: ya estaba lista`); return }

  const corte = new AbortController()
  // Apunta cambios; devuelve false si la fila ya no está (la borraron): eso
  // corta el trabajo.
  const marca = async (cambios) => {
    const { data } = await db.from(TABLA).update({ ...cambios, updated_at: new Date().toISOString() })
      .eq('id', id).eq('client_id', clientId).select('id')
    const sigue = Array.isArray(data) ? data.length > 0 : true
    if (!sigue) corte.abort()
    return sigue
  }
  let ultimo = 0
  const avanza = (progreso, extra = {}) => {
    if (Date.now() - ultimo < CADA_PROGRESO_MS) return
    ultimo = Date.now()
    marca({ progreso: Math.round(progreso), ...extra }).catch(() => {})
  }
  const borrada = () => corte.signal.aborted

  const voz = rutaVoz(id)
  const ass = rutaAss(id)
  let reloj = null
  try {
    await limpiaEdiciones().catch(() => 0)
    const entrada = await rutaOriginal(id)
    if (!entrada) throw fallo('El vídeo original ya no está (se guardan 7 días). Vuelve a subirlo.')
    if (!await marca({ estado: 'transcribiendo', progreso: 3, paso: 'Leyendo el vídeo', error: null })) return

    // Siempre como MP4/MOV (formato.js): lo que subió el usuario no se deja adivinar.
    const info = await sondeaVideo(entrada)
    if (!info.duracion) throw fallo('No se sabe cuánto dura el vídeo')
    if (pasaDelTope(info.duracion)) throw fallo(`El vídeo dura más de ${Math.round(maxDuracionOriginal() / 60)} minutos`)
    const { size: bytes } = await fsp.stat(entrada)
    const estilo = normalizaEstilo(fila.estilo)

    let palabras = []
    if (info.audio) {
      if (!await marca({ progreso: 6, paso: 'Sacando la voz del vídeo', duracion_original: info.duracion })) return
      await ejecuta(FFMPEG(), ['-hide_banner', '-nostdin', '-y', '-loglevel', 'error', ...COMO_MOV, '-i', entrada,
        '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', voz], { tope: 10 * 60_000, senal: corte.signal })
      if (!await marca({ progreso: 10, paso: `Transcribiendo la voz palabra a palabra (${minSeg(info.duracion)} de vídeo)` })) return
      // Whisper no dice cómo va: el % sube con una estimación (en esta máquina,
      // del orden de la mitad de lo que dura el audio) y se para antes del 46.
      const t0 = Date.now()
      const estimado = Math.max(20_000, info.duracion * 600)
      reloj = setInterval(() => avanza(10 + Math.min(35, ((Date.now() - t0) / estimado) * 35)), CADA_PROGRESO_MS)
      const r = await transcribe(voz, opciones)
      clearInterval(reloj); reloj = null
      palabras = r.palabras
      await fsp.rm(voz, { force: true })
    } else {
      await marca({ progreso: 10, paso: 'El vídeo no tiene sonido: sin voz no hay nada que cortar; solo se encuadra', duracion_original: info.duracion })
    }
    if (borrada()) return

    if (!await marca({ estado: 'montando', progreso: 48, paso: 'Quitando tomas repetidas, muletillas y silencios' })) return
    const recursos = Array.isArray(fila.recursos) ? fila.recursos : []
    const plan = planDeEdicion({ info, palabras, estilo, bytes, recursos })
    // Las rutas de los recursos que usa el plan salen de su id y del de la
    // edición, nunca de la fila; si alguno ya no está, no se monta a medias.
    const porId = new Map(recursos.map(x => [x.id, x]))
    const rutas = {}
    for (const e of entradasDe(plan)) {
      const x = porId.get(e.recurso)
      const ruta = x ? rutaRecurso(id, x.id, x.ext) : null
      if (!ruta || !await fsp.stat(ruta).then(st => st.isFile(), () => false)) throw fallo(`Falta un archivo que subiste («${x?.nombre || 'recurso'}»). Vuelve a subirlo.`)
      rutas[e.recurso] = ruta
    }
    // La música, a su sonoridad de referencia: se mide el trozo que va a sonar
    // (en bucle hasta lo que dura el editado) y se apunta la ganancia fija que
    // la lleva ahí; así musicaVolumen suena igual con cualquier pista. Si no se
    // puede medir, va tal cual (como antes).
    if (plan.musica && !plan.musica.sola) {
      const lufs = await mideMusica(rutas[plan.musica.recurso], plan.duracionFinal, { senal: corte.signal })
        .catch((e) => { log(`! edición ${id}: no pude medir la música (${e?.message || e}); va sin ajustar`); return null })
      plan.musica.ganancia = gananciaMusica(lufs, plan.audio?.loudnorm?.I)
    }
    if (borrada()) return
    const tieneSubtitulos = plan.bloques.length > 0
    if (tieneSubtitulos) await fsp.writeFile(ass, assDe(plan.bloques, estilo), 'utf8')
    const r = plan.resumen
    const que = [
      r.tomas ? `${r.tomas} ${r.tomas === 1 ? 'toma repetida' : 'tomas repetidas'}` : '',
      r.muletillas ? `${r.muletillas} ${r.muletillas === 1 ? 'muletilla' : 'muletillas'}` : '',
      r.silencios ? `${r.silencios} ${r.silencios === 1 ? 'silencio' : 'silencios'}` : '',
    ].filter(Boolean).join(', ')
    const con = [
      r.recursos ? `${r.recursos} ${r.recursos === 1 ? 'imagen o clip' : 'imágenes o clips'}` : '',
      r.logo ? 'logo' : '',
      r.musica ? 'música' : '',
    ].filter(Boolean).join(', ')
    if (!await marca({
      progreso: 52, plan,
      paso: `Montando el vídeo (${minSeg(info.duracion)} → ${minSeg(plan.duracionFinal)}${que ? `; fuera ${que}` : ''}${con ? `; con ${con}` : ''})`,
    })) return

    const hecho = await renderiza({
      entrada, salida: rutaEditado(id), plan, ass: tieneSubtitulos ? ass : null, senal: corte.signal, rutas,
      alProgreso: (f) => avanza(52 + f * 46),
    })
    // «Listo» y el cobro van solo si la fila sigue (y se ha podido apuntar).
    const { data: lista, error: e1 } = await db.from(TABLA).update({
      estado: 'listo', progreso: 100, paso: 'Listo para descargar', duracion_final: hecho.duracion, bytes: hecho.bytes, error: null,
      updated_at: new Date().toISOString(),
    }).eq('id', id).eq('client_id', clientId).select('id')
    if (e1) throw new Error(`No se pudo apuntar la edición como lista: ${e1.message}`)
    if (Array.isArray(lista) && !lista.length) { corte.abort(); log(`= edición ${id}: la borraron al acabar; no se cobra`); return }
    log(`✓ edición ${id}: ${minSeg(info.duracion)} → ${minSeg(hecho.duracion)} (${(hecho.bytes / 1048576).toFixed(1)} MB)`)

    // Ha salido bien: ahora, y solo ahora, se cobra. Nada de aquí puede
    // devolver la edición a «error»: el vídeo ya está hecho.
    try {
      const cobrado = await cobraEdicion(clientId, id, fila.precio_eur, { log })
      if (cobrado != null) {
        const { error: e2 } = await db.from(TABLA).update({ cobrado_eur: cobrado }).eq('id', id).eq('client_id', clientId)
        if (e2) log(`! edición ${id}: cobrada pero sin apuntar cobrado_eur (${e2.message}); lo apunta reintentaCobros`)
        else if (cobrado > 0) log(`€ edición ${id}: cobrados ${cobrado} €`)
      }
    } catch (e) {
      log(`! edición ${id}: el cobro falló (${e?.message || e}); lo reintenta reintentaCobros`)
    }
  } catch (e) {
    if (borrada()) { log(`= edición ${id}: la borraron a medias, corto`); return }
    await marca({ estado: 'error', paso: 'No se pudo editar', error: recorta(e?.message || 'No se pudo editar', 300) }).catch(() => {})
    throw e
  } finally {
    if (reloj) clearInterval(reloj)
    await fsp.rm(voz, { force: true }).catch(() => {})
    await fsp.rm(ass, { force: true }).catch(() => {})
  }
}
