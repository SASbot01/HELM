// HELM — Editor de reels: el trabajo `editor-render` del worker
// (scripts/agents-worker.mjs). La API solo sube el original y encola; esto
// corre en el worker porque transcribir y montar se comen la CPU varios
// minutos, y el panel tiene que seguir respondiendo.
//
//   1. ffprobe        → tamaño visible (con la rotación del móvil), duración, audio
//   2. audio a 16 kHz → Whisper (scripts/agents-transcribe.py --palabras)
//   3. el plan        → tomas, muletillas, silencios, zoom y subtítulos (plan.js)
//   4. ffmpeg         → el MP4 1080×1920 (render.js)
//
// En cada paso se apunta en helm_ediciones el estado, el % y qué está haciendo
// en castellano llano: el panel lo enseña tal cual. Si mientras tanto alguien
// borra la edición, el montaje se corta.
import fsp from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { supabase } from '../../lib/supabase.js'
import { normalizaEstilo } from '../../../src/agents/editor/estilo.js'
import { ejecuta, sondea, FFMPEG } from '../variantes.js'
import { planDeEdicion } from './plan.js'
import { assDe } from './subtitulos.js'
import { renderiza } from './render.js'
import {
  UUID, rutaOriginal, rutaEditado, rutaVoz, rutaAss, limpiaEdiciones, maxDuracionOriginal,
} from './archivos.js'

export const TABLA = 'helm_ediciones'
const lanza = promisify(execFile)
// Whisper en CPU: media hora de tope (un original de 10 minutos tarda bastante menos).
const TOPE_WHISPER_MS = 30 * 60_000
// Cada cuánto se apunta el % en la base de datos como mucho.
const CADA_PROGRESO_MS = 3000

const recorta = (t, n) => String(t || '').slice(0, n)
const fallo = (message) => Object.assign(new Error(message), { statusCode: 422 })
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
 * El paso del worker. `opciones`:
 *   py, script, modelo → para Whisper (los mismos que usa el worker)
 *   db                 → el cliente de Supabase (por defecto, el del servidor)
 *   transcribe         → para las pruebas: sustituye a Whisper
 *   log                → para el registro del worker
 */
export async function editorRender(job, opciones = {}) {
  const { db = supabase, log = () => {}, transcribe = transcribePalabras } = opciones
  const { clientId, edicionId: id } = job?.payload || {}
  if (!UUID.test(String(id || '')) || !clientId) throw new Error('Trabajo de edición sin edicionId o clientId')

  const { data: fila, error } = await db.from(TABLA).select('id, client_id, estado, estilo')
    .eq('id', id).eq('client_id', clientId).maybeSingle()
  if (error) throw new Error(error.message)
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

    const info = await sondea(entrada)
    if (!info.duracion) throw fallo('No se sabe cuánto dura el vídeo')
    if (info.duracion > maxDuracionOriginal()) throw fallo(`El vídeo dura más de ${Math.round(maxDuracionOriginal() / 60)} minutos`)
    const { size: bytes } = await fsp.stat(entrada)
    const estilo = normalizaEstilo(fila.estilo)

    let palabras = []
    if (info.audio) {
      if (!await marca({ progreso: 6, paso: 'Sacando la voz del vídeo', duracion_original: info.duracion })) return
      await ejecuta(FFMPEG(), ['-hide_banner', '-nostdin', '-y', '-loglevel', 'error', '-i', entrada,
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
    const plan = planDeEdicion({ info, palabras, estilo, bytes })
    const tieneSubtitulos = plan.bloques.length > 0
    if (tieneSubtitulos) await fsp.writeFile(ass, assDe(plan.bloques, estilo), 'utf8')
    const r = plan.resumen
    const que = [
      r.tomas ? `${r.tomas} ${r.tomas === 1 ? 'toma repetida' : 'tomas repetidas'}` : '',
      r.muletillas ? `${r.muletillas} ${r.muletillas === 1 ? 'muletilla' : 'muletillas'}` : '',
      r.silencios ? `${r.silencios} ${r.silencios === 1 ? 'silencio' : 'silencios'}` : '',
    ].filter(Boolean).join(', ')
    if (!await marca({
      progreso: 52, plan,
      paso: `Montando el vídeo (${minSeg(info.duracion)} → ${minSeg(plan.duracionFinal)}${que ? `; fuera ${que}` : ''})`,
    })) return

    const hecho = await renderiza({
      entrada, salida: rutaEditado(id), plan, ass: tieneSubtitulos ? ass : null, senal: corte.signal,
      alProgreso: (f) => avanza(52 + f * 46),
    })
    await marca({ estado: 'listo', progreso: 100, paso: 'Listo para descargar', duracion_final: hecho.duracion, bytes: hecho.bytes, error: null })
    log(`✓ edición ${id}: ${minSeg(info.duracion)} → ${minSeg(hecho.duracion)} (${(hecho.bytes / 1048576).toFixed(1)} MB)`)
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
