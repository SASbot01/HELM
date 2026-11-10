// HELM — las reglas del almacén: el bucket público `helm` de Supabase Storage.
//
// El bucket se sirve desde el MISMO dominio que el panel (helm.s4sf.net/api/db/
// storage/… y los enlaces viejos de /sb/storage/…). Un archivo que el navegador
// abra como página web (un .html, un .svg con script, un .js) corre con el
// origen del panel y puede leer la sesión (bw_admin_jwt, en localStorage). Antes
// cualquier usuario con sesión subía a su carpeta lo que quisiera, con el tipo
// que dijera su navegador. Por eso, aquí, en un solo sitio:
//
//   · SALTO      rutas que intentan salirse de su carpeta (scripts/sb-proxy.mjs
//                y api/_lib/pasarela.js)
//   · TIPOS      lo que se puede subir y con qué tipo se guarda: lo pone el
//                servidor por la extensión, nunca el navegador (pasarela.js).
//                El panel mira la misma lista antes de subir (uploadFile en
//                src/helm/lib.js), para avisar sin mandar los megas
//   · cspArchivo la CSP con que sale cualquier archivo del almacén, para lo que
//                ya estuviera dentro (scripts/cabeceras.mjs y pasarela.js)
//
// Sin dependencias ni nada de Node (Buffer, process) a propósito: lo importa
// también vite.config.js (por scripts/cabeceras.mjs y scripts/sb-proxy.mjs) y
// el propio panel en el navegador (src/helm/lib.js).

// Un `..` (o su versión codificada) en la ruta: Kong o storage pueden
// resolverlo y salir de la carpeta (o de /object/public) hacia cualquier otra
// parte de la Supabase. Lo mismo con una barra codificada o invertida. Ningún
// enlace legítimo los lleva. Se mira la ruta TAL CUAL llega, sin la query: `new
// URL` resuelve los `..` y cambia `\` por `/` antes de que nadie la vea.
export const SALTO = /(^|\/)(\.|%2e){2}(\/|$)|%2f|%5c|\\/i

const WORD = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const EXCEL = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const POWERPOINT = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
// Lo que no hace falta ver en el navegador (apuntes en Markdown, subtítulos, un
// RTF) va como binario: se descarga tal cual y nadie lo pinta.
const BINARIO = 'application/octet-stream'

// Lo que sube el panel (Biblioteca, Gastos, el logo de Ajustes): fotos, PDF,
// ofimática, vídeo, audio, texto y ZIP. Ni SVG (es XML y puede llevar script),
// ni HTML, ni XML, ni nada que el navegador ejecute. Una extensión nueva se
// añade aquí, con un tipo que el navegador no pueda tomar por una página.
export const TIPOS = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg',
  // Windows guarda así muchas fotos bajadas de WhatsApp Web: es un JPG.
  jfif: 'image/jpeg',
  png: 'image/png', webp: 'image/webp', gif: 'image/gif',
  heic: 'image/heic', heif: 'image/heif', avif: 'image/avif',
  // Lo que sale de muchos escáneres.
  tif: 'image/tiff', tiff: 'image/tiff',
  pdf: 'application/pdf',
  docx: WORD, doc: 'application/msword',
  xlsx: EXCEL, xls: 'application/vnd.ms-excel',
  pptx: POWERPOINT, ppt: 'application/vnd.ms-powerpoint',
  odt: 'application/vnd.oasis.opendocument.text', ods: 'application/vnd.oasis.opendocument.spreadsheet',
  odp: 'application/vnd.oasis.opendocument.presentation',
  // Sin charset: los .txt y .csv de muchos bancos van en Latin-1, y con
  // `charset=utf-8` forzado salían con los acentos rotos. Que lo adivine el
  // navegador.
  csv: 'text/csv', txt: 'text/plain',
  md: BINARIO, srt: BINARIO, rtf: BINARIO,
  zip: 'application/zip',
  mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm',
  // Lo que graba un móvil viejo (vídeo) y las notas de voz de Android.
  '3gp': 'video/3gpp', amr: 'audio/amr',
  mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav',
  // Las notas de voz de WhatsApp son .opus (o .ogg).
  ogg: 'audio/ogg', opus: 'audio/ogg',
}

export const NO_ADMITIDO = 'Ese tipo de archivo no se puede subir. Valen fotos (JPG, PNG, WebP, GIF, HEIC, AVIF, TIFF), '
  + 'PDF, Word, Excel, PowerPoint, OpenDocument, CSV, texto (TXT, MD, SRT, RTF), ZIP, vídeo (MP4, M4V, MOV, WebM, 3GP) '
  + 'y audio (MP3, M4A, WAV, OGG, OPUS, AMR). SVG y páginas web, no.'

/** El tipo con el que se guarda un archivo por su nombre, o null si no se admite. */
export function tipoDeArchivo(nombre) {
  const m = /\.([a-z0-9]+)$/i.exec(String(nombre || ''))
  const ext = m ? m[1].toLowerCase() : ''
  return Object.hasOwn(TIPOS, ext) ? TIPOS[ext] : null
}

// La CSP de lo que sale del almacén. Para una imagen, un vídeo o un PDF metidos
// en la página (<img>, <video>) no cuenta: solo se aplica cuando el archivo se
// abre como documento (en su pestaña o en un iframe), que es justo cuando un
// HTML o un SVG que ya estuviera en el bucket ejecutaría su script. `sandbox`
// lo deja además en un origen opaco: aunque algo se ejecutara, no ve la sesión.
const CSP_ARCHIVO = "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; sandbox"
// Al PDF, al vídeo y al audio NO se les pone CSP ninguna: los abre un visor del
// propio navegador, que para pintar las páginas carga sus recursos por
// `blob:`/worker, y cualquier `default-src 'none'` se los corta y deja el
// documento en blanco. Comprobado en Chrome (nov. 2026): el visor abre, lee el
// título y el número de páginas del PDF, pero las pinta TODAS en blanco; con un
// .mp4 el reproductor sale vacío (Firefox y Safari, peor aún). Se probó a
// abrirle hueco (`object-src 'self'`, etc.) y seguía en blanco: lo único que
// renderiza de verdad es no mandar CSP. Y no hace falta: ninguno de los tres
// ejecuta nada con el origen del panel (el JS de un PDF va dentro del visor) y
// `nosniff` + su content-type impiden que se lean como HTML. La CSP cerrada
// (con `sandbox`) se queda SOLO para HTML/SVG, que son los que sí podrían
// ejecutar algo. `cspArchivo` devuelve null para estos tres y quien llama no
// pone la cabecera (y si había una puesta por defecto, la quita).
const CON_VISOR = /^(application\/pdf|video\/[\w.+-]+|audio\/[\w.+-]+)$/

/** La CSP para un archivo del almacén según el tipo con que sale, o null si es
 *  un PDF/vídeo/audio (lo abre el visor del navegador: sin CSP para que no salga
 *  en blanco; su aislamiento lo da el propio visor + nosniff, no esta cabecera). */
export function cspArchivo(tipo) {
  const esencia = String(tipo || '').split(';')[0].trim().toLowerCase()
  if (CON_VISOR.test(esencia)) return null
  return CSP_ARCHIVO
}
