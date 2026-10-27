// HELM — Editor de reels: dónde vive cada archivo. Lo usan la API (que sube
// el original) y el worker (que lo edita), los dos con la misma carpeta:
//
//   ${HELM_DATA_DIR}/editor/<id>/subida.part      mientras sube, trozo a trozo
//   ${HELM_DATA_DIR}/editor/<id>/subida.json      { bytes, ext, tipo } que anunció
//   ${HELM_DATA_DIR}/editor/<id>/original.<ext>   lo que subió el usuario, ya entero
//   ${HELM_DATA_DIR}/editor/<id>/recursos/<uuid>.<ext>  imágenes, clips, logo y música
//   ${HELM_DATA_DIR}/editor/<id>/editado.mp4      lo que devuelve HELM
//   (y mientras trabaja: voz.wav, subtitulos.ass, editado.mp4.part)
//
// Las rutas salen SIEMPRE del id (un uuid), nunca de lo que diga la fila ni
// del nombre del archivo que subió el usuario. Todo se borra a los 7 días; una
// subida que se quedó a medias, a las 6 horas.
import fsp from 'node:fs/promises'
import path from 'node:path'
import { DIAS_GUARDADO, MAX_MB_SUBIDA } from '../../../src/agents/editor/estilo.js'
import { HORAS_SUBIDA, PARTE, limpiaSubidas } from '../subida-trozos.js'
import { GRACIA_EDITOR_S } from '../../../src/helm/precios.js'

export { DIAS_GUARDADO, HORAS_SUBIDA }
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const CARPETA_EDITOR = () => path.join(process.env.HELM_DATA_DIR || '/home/s4sf/helm-data', 'editor')
/** El tope de una subida, en bytes (HELM_EDITOR_MAX_MB, 800 por defecto). */
export const maxBytesSubida = () => (Number(process.env.HELM_EDITOR_MAX_MB) || MAX_MB_SUBIDA) * 1024 * 1024
/** Lo que puede durar el original (HELM_EDITOR_MAX_SEGUNDOS, 10 minutos por defecto). */
export const maxDuracionOriginal = () => Number(process.env.HELM_EDITOR_MAX_SEGUNDOS) || 600
/**
 * ¿Dura más de lo que se deja editar? Con el mismo medio segundo de gracia que
 * el precio (GRACIA_EDITOR_S, src/helm/precios.js): el navegador y ffprobe no
 * dan la misma duración, y un vídeo de «10:00» que mide 600,2 s no puede pasar
 * al crear y caer al lanzar, con todo ya subido.
 */
export const pasaDelTope = (segundos) => Number(segundos) > maxDuracionOriginal() + GRACIA_EDITOR_S
/**
 * Lo que puede tener guardado un perfil en la carpeta del editor
 * (HELM_EDITOR_MAX_GB_PERFIL, 8 GB por defecto): originales, recursos y
 * editados de sus ediciones de los últimos días, y lo que está llegando.
 * Sin esto, pagando (o gratis en la agencia de la casa) se llenaría el disco
 * del servidor, que es el de todo lo demás.
 */
export const maxBytesPerfil = () => {
  const gb = Number(process.env.HELM_EDITOR_MAX_GB_PERFIL)
  return (Number.isFinite(gb) && gb > 0 ? gb : 8) * 1024 * 1024 * 1024
}
/** Lo que pueden sumar los recursos de una edición (imágenes, clips, logo y música). */
export const MAX_BYTES_RECURSOS_EDICION = 300 * 1024 * 1024
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
export const rutaParcial = (id) => path.join(dirEdicion(id), PARTE)
export const rutaSubida = (id) => path.join(dirEdicion(id), 'subida.json')
export const dirRecursos = (id) => path.join(dirEdicion(id), 'recursos')
// Las extensiones que puede tener un recurso guardado (las pone su firma, ver recursos.js).
const EXT_RECURSO = new Set(['jpg', 'png', 'webp', 'mp4', 'mov', 'mp3', 'm4a', 'wav'])
/** Dónde va un recurso: su id es un uuid nuestro y la extensión, una de las de su firma. */
export const rutaRecurso = (id, recursoId, ext) => {
  if (!UUID.test(String(recursoId || '')) || !EXT_RECURSO.has(String(ext))) throw Object.assign(new Error('Recurso no válido'), { statusCode: 400 })
  return path.join(dirRecursos(id), `${String(recursoId).toLowerCase()}.${ext}`)
}

// Lo que graba un móvil: MP4, MOV, M4V y 3GP, los de la familia ISO BMFF, y
// nada más (WebM, MKV, AVI… no: se exportan a MP4). Lo que manda son los
// bytes (formato.js: esVideoMov, y ffprobe/ffmpeg con -f mov); el tipo y la
// extensión los pone el navegador, y la extensión es solo para quien mire la
// carpeta.
const POR_TIPO = {
  'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/x-m4v': 'm4v', 'video/3gpp': '3gp', 'video/3gpp2': '3g2',
}
const EXTENSIONES = new Set(Object.values(POR_TIPO))
const extensionDelNombre = (nombre) => String(nombre || '').toLowerCase().match(/\.([a-z0-9]{2,4})$/)?.[1] || ''

/**
 * ¿Se admite al crear un original con ese tipo (el que dice el navegador)?
 * Uno de POR_TIPO; o sin tipo (el navegador no lo sabe), si el nombre acaba en
 * una de sus extensiones. Los bytes se miran después, al llegar.
 */
export const NO_MOV = /^video\/(webm|x-matroska|matroska|x-msvideo|avi|mpeg|mp2t|ogg|x-flv|x-ms-wmv)$/

export function tipoAdmitido(tipo, nombre = '') {
  const t = String(tipo || '').split(';')[0].trim().toLowerCase()
  if (POR_TIPO[t]) return true
  // Un tipo de vídeo raro (video/x-quicktime…) con una extensión buena vale: el
  // panel deja pasar lo mismo, y los bytes se miran igual al llegar. Los que se
  // sabe que no son MP4/MOV (WebM, MKV, AVI, MPEG), no, se llamen como se llamen.
  if (t && (!t.startsWith('video/') || NO_MOV.test(t))) return false
  return EXTENSIONES.has(extensionDelNombre(nombre))
}

/** La extensión del original: por su tipo, o por su nombre si el tipo es raro, o mp4. */
export function extensionDe(tipo, nombre = '') {
  const t = String(tipo || '').split(';')[0].trim().toLowerCase()
  if (POR_TIPO[t]) return POR_TIPO[t]
  const ext = extensionDelNombre(nombre)
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

/**
 * Lo que ocupa en el disco la carpeta de una edición, en bytes: el original
 * (o lo subido hasta ahora), los recursos, el editado y lo que haya a medias.
 * 0 si ya no está.
 */
export async function ocupaEdicion(id) {
  return bytesDeCarpeta(dirEdicion(id))
}

async function bytesDeCarpeta(dir) {
  let entradas = []
  try { entradas = await fsp.readdir(dir, { withFileTypes: true }) } catch { return 0 }
  let total = 0
  for (const e of entradas) {
    const ruta = path.join(dir, e.name)
    if (e.isDirectory()) total += await bytesDeCarpeta(ruta)
    else if (e.isFile()) {
      try { total += (await fsp.stat(ruta)).size } catch { /* ya no está */ }
    }
  }
  return total
}

/** Borra la carpeta entera de una edición. */
export async function borraEdicion(id) {
  await fsp.rm(dirEdicion(id), { recursive: true, force: true })
}

/**
 * Borra las subidas a medias (con subida.part) que lleven más de
 * `horasSubida` horas sin recibir nada —eso lo hace limpiaSubidas, la de todas
 * las subidas por trozos— y las ediciones cuyo archivo más nuevo tenga más de
 * `dias` días (el original, los recursos y el editado van juntos). La fila se
 * queda, como historial. Devuelve cuántas carpetas ha quitado.
 */
export async function limpiaEdiciones(dias = DIAS_GUARDADO, horasSubida = HORAS_SUBIDA) {
  let borradas = await limpiaSubidas(CARPETA_EDITOR(), horasSubida)
  const limite = Date.now() - dias * 86_400_000
  let nombres = []
  try { nombres = await fsp.readdir(CARPETA_EDITOR()) } catch { return borradas }
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
