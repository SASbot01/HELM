// HELM — Editor de reels: dónde vive cada archivo. Lo usan la API (que sube
// el original) y el worker (que lo edita), los dos con la misma carpeta:
//
//   ${HELM_DATA_DIR}/editor/<id>/original.<ext>   lo que subió el usuario
//   ${HELM_DATA_DIR}/editor/<id>/editado.mp4      lo que devuelve HELM
//   (y mientras trabaja: voz.wav, subtitulos.ass, editado.mp4.part)
//
// Las rutas salen SIEMPRE del id (un uuid), nunca de lo que diga la fila ni
// del nombre del archivo que subió el usuario. Todo se borra a los 7 días.
import fsp from 'node:fs/promises'
import path from 'node:path'
import { DIAS_GUARDADO, MAX_MB_SUBIDA } from '../../../src/agents/editor/estilo.js'

export { DIAS_GUARDADO }
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const CARPETA_EDITOR = () => path.join(process.env.HELM_DATA_DIR || '/home/s4sf/helm-data', 'editor')
/** El tope de una subida, en bytes (HELM_EDITOR_MAX_MB, 800 por defecto). */
export const maxBytesSubida = () => (Number(process.env.HELM_EDITOR_MAX_MB) || MAX_MB_SUBIDA) * 1024 * 1024
/** Lo que puede durar el original (HELM_EDITOR_MAX_SEGUNDOS, 10 minutos por defecto). */
export const maxDuracionOriginal = () => Number(process.env.HELM_EDITOR_MAX_SEGUNDOS) || 600
/** Lo que tiene que quedar libre en el disco después de la subida (HELM_EDITOR_MIN_LIBRE_MB, 2 GB). */
export const minLibreBytes = () => {
  const mb = Number(process.env.HELM_EDITOR_MIN_LIBRE_MB)
  return (Number.isFinite(mb) && mb >= 0 ? mb : 2048) * 1024 * 1024
}

const seguro = (id) => {
  if (!UUID.test(String(id || ''))) throw Object.assign(new Error('Edición no válida'), { statusCode: 400 })
  return String(id).toLowerCase()
}
export const dirEdicion = (id) => path.join(CARPETA_EDITOR(), seguro(id))
export const rutaEditado = (id) => path.join(dirEdicion(id), 'editado.mp4')
export const rutaVoz = (id) => path.join(dirEdicion(id), 'voz.wav')
export const rutaAss = (id) => path.join(dirEdicion(id), 'subtitulos.ass')
export const rutaOriginalCon = (id, ext) => path.join(dirEdicion(id), `original.${ext}`)

// Lo que graba un móvil (y poco más). La extensión es solo para quien mire la
// carpeta: ffprobe lee el contenido, no el nombre.
const POR_TIPO = {
  'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/x-m4v': 'm4v', 'video/webm': 'webm',
  'video/x-matroska': 'mkv', 'video/3gpp': '3gp', 'video/3gpp2': '3g2', 'video/mpeg': 'mpg', 'video/x-msvideo': 'avi',
}
const EXTENSIONES = new Set(Object.values(POR_TIPO))

/** La extensión del original: por su tipo, o por su nombre si el tipo es raro, o mp4. */
export function extensionDe(tipo, nombre = '') {
  const t = String(tipo || '').split(';')[0].trim().toLowerCase()
  if (POR_TIPO[t]) return POR_TIPO[t]
  const ext = String(nombre).toLowerCase().match(/\.([a-z0-9]{2,4})$/)?.[1]
  return EXTENSIONES.has(ext) ? ext : 'mp4'
}

/** El original de una edición (original.<ext>), o null si ya no está. */
export async function rutaOriginal(id) {
  const dir = dirEdicion(id)
  let nombres = []
  try { nombres = await fsp.readdir(dir) } catch { return null }
  const n = nombres.find(x => /^original\.[a-z0-9]{2,4}$/.test(x))
  return n ? path.join(dir, n) : null
}

/** Borra la carpeta entera de una edición. */
export async function borraEdicion(id) {
  await fsp.rm(dirEdicion(id), { recursive: true, force: true })
}

/**
 * Borra las ediciones cuyo archivo más nuevo tenga más de `dias` días (el
 * original y el editado van juntos). Devuelve cuántas carpetas ha quitado.
 */
export async function limpiaEdiciones(dias = DIAS_GUARDADO) {
  const limite = Date.now() - dias * 86_400_000
  let nombres = []
  try { nombres = await fsp.readdir(CARPETA_EDITOR()) } catch { return 0 }
  let borradas = 0
  for (const n of nombres) {
    if (!UUID.test(n)) continue
    const dir = path.join(CARPETA_EDITOR(), n)
    try {
      const dentro = await fsp.readdir(dir)
      let reciente = (await fsp.stat(dir)).mtimeMs
      for (const x of dentro) {
        try { reciente = Math.max(reciente, (await fsp.stat(path.join(dir, x))).mtimeMs) } catch { /* ya no está */ }
      }
      if (reciente < limite) { await fsp.rm(dir, { recursive: true, force: true }); borradas++ }
    } catch { /* ya no está */ }
  }
  return borradas
}

/** ¿Sigue el editado en el disco y dentro de los 7 días? Devuelve su stat o null. */
export async function editadoDisponible(id) {
  try {
    const st = await fsp.stat(rutaEditado(id))
    return st.isFile() && Date.now() - st.mtimeMs < DIAS_GUARDADO * 86_400_000 ? st : null
  } catch { return null }
}
