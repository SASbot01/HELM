// HELM — Editor de reels: cómo se abre como vídeo lo que sube el usuario (el
// vídeo en bruto y los clips de apoyo). Lo usan la API (api/editor.js, al
// recibirlo y al lanzarlo) y el worker (trabajo.js y render.js, al montarlo).
//
// Solo se editan MP4/MOV/M4V/3GP: los de la familia ISO BMFF, que es lo que
// graba un móvil. Dos defensas, como en Trial reels (api/_lib/variantes.js,
// esVideoIsoBmff): ffmpeg adivina el formato por el CONTENIDO, y una lista HLS
// o un concat disfrazados de .mp4 le harían abrir otros archivos del servidor
// y meterlos en el vídeo editado.
//   1. Los primeros bytes tienen que ser de un MP4/MOV (esVideoMov): se mira en
//      cuanto llegan (el primer trozo) y otra vez al lanzar, antes de ffprobe.
//   2. ffprobe y ffmpeg lo abren SIEMPRE con el demuxer de MP4/MOV (COMO_MOV
//      delante de su -i): aunque algo se colara, nunca se leería como lista.
//
// Uso:
//   import { esVideoMov, sondeaVideo, COMO_MOV, NO_ES_MP4 } from './formato.js'
//   if (!await esVideoMov(ruta)) → 415 con NO_ES_MP4 (y fuera la subida)
//   const info = await sondeaVideo(ruta)        // como sondea(), con -f mov
//   ejecuta(FFMPEG(), [...COMO_MOV, '-i', ruta, …])
import fsp from 'node:fs/promises'
import { ejecuta, infoDeSonda, esVideoIsoBmff, FFPROBE } from '../variantes.js'

/** Lo que va justo delante del -i de un MP4/MOV: el demuxer, sin dejar que ffmpeg adivine. */
export const COMO_MOV = Object.freeze(['-f', 'mov'])
/** Lo que hace falta del principio para saber si es un MP4/MOV (esVideoIsoBmff). */
export const BYTES_CABECERA = 12
/** Lo que se dice cuando los bytes no son de un MP4/MOV. */
export const NO_ES_MP4 = 'Ese archivo no es un vídeo MP4 o MOV. Solo se editan vídeos MP4 o MOV (lo que graba el móvil): si es de otro tipo (WebM, MKV, AVI…), exporta a MP4 y vuelve a subirlo.'

// Los archivos guardados que son de la familia MP4/MOV (por la extensión que
// les pone su firma: recursos.js). La música en M4A también lo es.
const EXT_MOV = /\.(mp4|mov|m4v|m4a|3gp|3g2)$/i

/** Lo que va delante del -i de un archivo guardado: COMO_MOV si es de la familia MP4/MOV, nada si no. PURA. */
export const formatoDe = (ruta) => (EXT_MOV.test(String(ruta || '')) ? [...COMO_MOV] : [])

/** Los primeros `n` bytes de un archivo (menos si es más corto). */
export async function cabeceraDe(ruta, n = BYTES_CABECERA) {
  const h = await fsp.open(ruta, 'r')
  try {
    const cabeza = Buffer.alloc(n)
    const { bytesRead } = await h.read(cabeza, 0, n, 0)
    return cabeza.subarray(0, bytesRead)
  } finally {
    await h.close()
  }
}

/** ¿Empieza ese archivo como un MP4/MOV? false también si no se puede leer o es más corto que la cabecera. */
export async function esVideoMov(ruta) {
  try { return esVideoIsoBmff(await cabeceraDe(ruta)) } catch { return false }
}

/** Los argumentos de ffprobe para un MP4/MOV, con su demuxer. PURA. */
export const argumentosSonda = (ruta) => ['-v', 'error', ...COMO_MOV, '-print_format', 'json', '-show_streams', '-show_format', ruta]

/**
 * Lo que dice ffprobe de un MP4/MOV (como sondea() de variantes.js, pero sin
 * dejarle adivinar el formato): { ancho, alto, duracion, audio }. Lanza si no
 * se puede leer como MP4/MOV.
 */
export async function sondeaVideo(ruta) {
  const { stdout } = await ejecuta(FFPROBE(), argumentosSonda(ruta), { tope: 60_000 })
  let j
  try { j = JSON.parse(stdout) } catch { throw Object.assign(new Error('No se pudo leer el vídeo'), { statusCode: 422 }) }
  return infoDeSonda(j)
}
