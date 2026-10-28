// HELM — Editor de reels: los recursos que el usuario sube junto al vídeo en
// bruto, y cómo se comprueban. Lo usa la API (api/editor.js, al recibirlos) y
// el plan y el montaje (plan.js y render.js, al usarlos).
//
//   · broll  → imágenes (JPG, PNG o WEBP, ≤ 15 MB) o clips (MP4 o MOV,
//              ≤ 90 MB) que entran unos segundos donde se dice su palabra.
//              Hasta 12.
//   · logo   → PNG o WEBP (con transparencia), ≤ 5 MB. Uno.
//   · musica → MP3, M4A o WAV, ≤ 30 MB. Una.
//
// El tipo sale de los BYTES (la firma del principio del archivo), nunca de la
// extensión ni de lo que diga el navegador; y lo que se ha guardado se vuelve
// a mirar con ffprobe (que un clip tenga imagen y la música, sonido). El
// nombre del archivo solo se enseña: el recurso se guarda como
// <id de la edición>/recursos/<uuid>.<ext>, con la extensión de su firma.
//
// Las fotos del móvil traen la orientación en el EXIF: unas versiones de
// ffmpeg la aplican solas y otras no (la del servidor, la 6.1, no; la 8, sí).
// Para que salgan igual en todas, al guardar una JPG se le pone la orientación
// a 1 (los bytes de la imagen no se tocan) y el giro se apunta en el recurso:
// lo aplica el montaje (render.js, filtroGiro).
import fsp from 'node:fs/promises'
import { ejecuta, FFPROBE } from '../variantes.js'
import { formatoDe } from './formato.js'

export const TIPOS_RECURSO = Object.freeze(['broll', 'logo', 'musica'])
export const MAX_RECURSOS = Object.freeze({ broll: 12, logo: 1, musica: 1 })

const MB = 1024 * 1024
// Topes por lo que ES el archivo (por su firma), no por el tipo que se pidió.
export const MAX_BYTES_RECURSO = Object.freeze({ imagen: 15 * MB, clip: 90 * MB, logo: 5 * MB, musica: 30 * MB })
// Lo más que puede pesar algo de cada tipo, para cortar antes de leer nada.
export const maxBytesDeTipo = (tipo) => (tipo === 'broll' ? MAX_BYTES_RECURSO.clip : MAX_BYTES_RECURSO[tipo] || 0)
// Una foto más grande que esto (en píxeles por lado) se come la memoria de ffmpeg.
export const MAX_LADO_IMAGEN = 8192
// Un clip o una música más cortos no dan para nada.
export const MIN_DURACION_CLIP = 0.5
export const MIN_DURACION_MUSICA = 1
// Lo que hace falta leer del principio para saber qué es.
export const BYTES_FIRMA = 32

const falla = (mensaje, statusCode) => Object.assign(new Error(mensaje), { statusCode })
const ascii = (b, desde, hasta) => b.subarray(desde, hasta).toString('latin1')

// Lo que se dice cuando el archivo no es de lo que toca.
const QUE_VALE = {
  broll: 'Las imágenes y clips tienen que ser JPG, PNG, WEBP, MP4 o MOV.',
  logo: 'El logo tiene que ser PNG o WEBP (mejor con el fondo transparente).',
  musica: 'La música tiene que ser MP3, M4A o WAV.',
}

// Las marcas ftyp de HEIF (HEIC del iPhone y sus secuencias) y de AVIF:
// ffmpeg no las lee como imagen, así que no valen.
const MARCAS_HEIF = new Set(['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'mif1', 'msf1', 'avif', 'avis'])
const NO_HEIF = 'Las fotos HEIC/AVIF no valen: expórtala como JPG o PNG.'

/**
 * Qué es un archivo por sus primeros bytes. PURA. Devuelve
 * { clase: 'imagen'|'video'|'audio', ext, formato } o null si no se reconoce.
 * Un MP4/MOV sin más es `video`; uno cuya marca es de audio (M4A), `audio`;
 * una foto HEIC/HEIF o AVIF, formato 'heif' (sin extensión: no se admite).
 */
export function firmaDe(cabeza) {
  const b = Buffer.isBuffer(cabeza) ? cabeza : Buffer.from(cabeza || [])
  if (b.length < 4) return null
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { clase: 'imagen', ext: 'jpg', formato: 'jpeg' }
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { clase: 'imagen', ext: 'png', formato: 'png' }
  if (b.length >= 12 && ascii(b, 0, 4) === 'RIFF') {
    const forma = ascii(b, 8, 12)
    if (forma === 'WEBP') {
      // Una WEBP animada no la lee el decodificador de ffmpeg: fuera.
      const animada = b.length >= 21 && ascii(b, 12, 16) === 'VP8X' && (b[20] & 0x02) !== 0
      return { clase: 'imagen', ext: 'webp', formato: animada ? 'webp-animada' : 'webp' }
    }
    if (forma === 'WAVE') return { clase: 'audio', ext: 'wav', formato: 'wav' }
    return null
  }
  if (b.length >= 12 && ascii(b, 4, 8) === 'ftyp') {
    const marca = ascii(b, 8, 12)
    // Las fotos HEIC/HEIF del iPhone y las AVIF también empiezan por ftyp: se
    // reconocen por su marca (la principal o una de las compatibles, que van
    // del byte 16 al final de la caja ftyp) para no tomarlas por un vídeo.
    const fin = Math.min(b.length, b.readUInt32BE(0) >= 16 ? b.readUInt32BE(0) : b.length)
    const marcas = [marca]
    for (let i = 16; i + 4 <= fin; i += 4) marcas.push(ascii(b, i, i + 4))
    if (marcas.some(m => MARCAS_HEIF.has(m))) return { clase: 'imagen', ext: null, formato: 'heif' }
    if (/^M4[ABP] $/.test(marca)) return { clase: 'audio', ext: 'm4a', formato: 'm4a' }
    if (marca === 'qt  ') return { clase: 'video', ext: 'mov', formato: 'mov' }
    return { clase: 'video', ext: 'mp4', formato: 'mp4' }
  }
  // QuickTime antiguo: sin ftyp, empieza directamente por un átomo.
  if (b.length >= 8 && ['moov', 'mdat', 'wide', 'free', 'skip', 'pnot'].includes(ascii(b, 4, 8))) return { clase: 'video', ext: 'mov', formato: 'mov' }
  if (ascii(b, 0, 3) === 'ID3') return { clase: 'audio', ext: 'mp3', formato: 'mp3' }
  // Una trama MPEG de audio suelta: 11 bits de sincronía y una capa que no sea
  // la «reservada» (así no se confunde con el AAC en ADTS).
  if (b[0] === 0xff && (b[1] & 0xe0) === 0xe0 && (b[1] & 0x06) !== 0) return { clase: 'audio', ext: 'mp3', formato: 'mp3' }
  return null
}

/**
 * ¿Vale ese archivo (por su firma) para ese tipo de recurso? PURA. Devuelve
 * { clase, ext, tope } con `clase` lo que será en el montaje ('imagen' | 'video'
 * | 'logo' | 'musica') y `tope` lo más que puede pesar; si no vale, lanza un
 * 415 con lo que sí se puede subir.
 */
export function admite(tipo, firma) {
  const no = () => falla(QUE_VALE[tipo] || 'Ese tipo de recurso no existe.', 415)
  if (!firma) throw no()
  if (firma.formato === 'webp-animada') throw falla('Las WEBP animadas no valen: sube la imagen fija (o un clip MP4).', 415)
  if (firma.formato === 'heif') throw tipo === 'musica' ? no() : falla(NO_HEIF, 415)
  if (tipo === 'broll') {
    if (firma.clase === 'imagen') return { clase: 'imagen', ext: firma.ext, tope: MAX_BYTES_RECURSO.imagen }
    if (firma.clase === 'video') return { clase: 'video', ext: firma.ext, tope: MAX_BYTES_RECURSO.clip }
    throw no()
  }
  if (tipo === 'logo') {
    if (firma.formato === 'png' || firma.formato === 'webp') return { clase: 'logo', ext: firma.ext, tope: MAX_BYTES_RECURSO.logo }
    throw no()
  }
  if (tipo === 'musica') {
    // Un MP4 con sonido también vale (se queda solo el audio): ffprobe dirá si lo tiene.
    if (firma.clase === 'audio') return { clase: 'musica', ext: firma.ext, tope: MAX_BYTES_RECURSO.musica }
    if (firma.clase === 'video') return { clase: 'musica', ext: 'm4a', tope: MAX_BYTES_RECURSO.musica }
    throw no()
  }
  throw no()
}

/**
 * La orientación EXIF de una JPG (1–8; 1 = tal cual) y dónde está su valor en
 * el archivo, para poder ponerla a 1. PURA. Solo mira el principio (el EXIF va
 * en el APP1, antes de la imagen). Sin EXIF u orientación: { orientacion: 1, posicion: null }.
 */
export function orientacionJpeg(buf) {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf || [])
  const nada = { orientacion: 1, posicion: null }
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return nada
  let i = 2
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) return nada
    const marca = b[i + 1]
    // Sin longitud: SOI/EOI/RSTn y el relleno 0xFF.
    if (marca === 0xff) { i++; continue }
    if (marca === 0xd8 || marca === 0x01 || (marca >= 0xd0 && marca <= 0xd7)) { i += 2; continue }
    // Empieza la imagen (SOS) o se acaba: el EXIF ya no va a venir.
    if (marca === 0xda || marca === 0xd9) return nada
    const largo = b.readUInt16BE(i + 2)
    if (largo < 2) return nada
    const datos = i + 4
    if (marca === 0xe1 && datos + 14 <= b.length && ascii(b, datos, datos + 6) === 'Exif\0\0') {
      const tiff = datos + 6
      const orden = ascii(b, tiff, tiff + 2)
      if (orden !== 'II' && orden !== 'MM') return nada
      const le = orden === 'II'
      const u16 = (o) => (le ? b.readUInt16LE(o) : b.readUInt16BE(o))
      const u32 = (o) => (le ? b.readUInt32LE(o) : b.readUInt32BE(o))
      const fin = Math.min(b.length, datos + largo - 2)
      const ifd = tiff + u32(tiff + 4)
      if (ifd + 2 > fin) return nada
      const n = u16(ifd)
      for (let k = 0; k < n; k++) {
        const e = ifd + 2 + k * 12
        if (e + 12 > fin) break
        // 0x0112 = Orientation, SHORT (3), 1 valor: va en los 2 primeros bytes del campo.
        if (u16(e) === 0x0112 && u16(e + 2) === 3) {
          const o = u16(e + 8)
          return { orientacion: o >= 1 && o <= 8 ? o : 1, posicion: e + 8, le }
        }
      }
      return nada
    }
    i = datos + largo - 2
  }
  return nada
}

/** ¿El giro de esa orientación EXIF cambia el ancho por el alto (5–8)? */
export const giroCambiaLados = (orientacion) => Number(orientacion) >= 5 && Number(orientacion) <= 8

/**
 * Pone a 1 la orientación EXIF de una JPG ya guardada (si la tenía) y devuelve
 * la que tenía. Lee solo el principio del archivo y escribe 2 bytes.
 */
export async function quitaOrientacion(ruta) {
  const h = await fsp.open(ruta, 'r+')
  try {
    const cabeza = Buffer.alloc(128 * 1024)
    const { bytesRead } = await h.read(cabeza, 0, cabeza.length, 0)
    const { orientacion, posicion, le } = orientacionJpeg(cabeza.subarray(0, bytesRead))
    if (posicion != null && orientacion !== 1) {
      const uno = Buffer.alloc(2)
      if (le) uno.writeUInt16LE(1); else uno.writeUInt16BE(1)
      await h.write(uno, 0, 2, posicion)
    }
    return orientacion
  } finally {
    await h.close()
  }
}

/**
 * El nombre del archivo, para enseñarlo: sin carpetas (lo que vaya antes de la
 * última / o \ fuera), sin puntos delante, sin caracteres de control, y corto.
 */
export function nombreRecurso(crudo) {
  let n = String(crudo ?? '')
  try { n = decodeURIComponent(n) } catch { /* llegó sin codificar */ }
  n = n.split(/[\\/]+/).filter(Boolean).pop() || ''
  n = n.replace(/\p{Cc}/gu, ' ').replace(/^[.\s]+/, '').replace(/\s+/g, ' ').trim()
  return n.slice(0, 120) || 'recurso'
}

/**
 * Lo que dice ffprobe de una música: { duracion } o un 422 si no tiene sonido.
 * La que va en M4A (un MP4/MOV) se abre con su demuxer (formatoDe, formato.js).
 */
export async function sondeaAudio(ruta) {
  const { stdout } = await ejecuta(FFPROBE(), ['-v', 'error', ...formatoDe(ruta), '-print_format', 'json', '-show_streams', '-show_format', ruta], { tope: 60_000 })
  let j
  try { j = JSON.parse(stdout) } catch { throw falla('No se puede leer esa música.', 422) }
  return infoDeAudio(j)
}

/** De la salida de ffprobe: si hay sonido y cuánto dura. PURA. */
export function infoDeAudio(j) {
  const streams = Array.isArray(j?.streams) ? j.streams : []
  const a = streams.find(x => x.codec_type === 'audio')
  if (!a) throw falla('Ese archivo no tiene sonido.', 422)
  const duracion = Number(j?.format?.duration) || Number(a.duration) || 0
  return { duracion }
}

/** Un recurso tal y como lo ve el panel (sin rutas ni extensiones). */
export function publicoRecurso(r) {
  return {
    id: r.id,
    tipo: r.tipo,
    clase: r.clase,
    nombre: r.nombre || 'recurso',
    bytes: Number(r.bytes) || 0,
    duracion: r.duracion == null ? null : Number(r.duracion),
    palabra: r.palabra || null,
  }
}

/** Una palabra (o frase corta) a la que atar un recurso: texto limpio, 4 palabras como mucho. */
export function palabraDe(v) {
  if (typeof v !== 'string') return null
  const t = v.replace(/\p{Cc}/gu, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 4).join(' ').slice(0, 60)
  return t || null
}
