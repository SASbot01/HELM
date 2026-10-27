// La pasarela /sb: lo único de la Supabase local que sale a internet.
//
// Detrás de localhost:54321 está la Supabase entera: tablas, archivos, la
// administración de Postgres (/pg, que ejecuta SQL), auth, GraphQL… Desde la
// reforma de agencias (migraciones 097 y 098) el navegador ya no habla con las
// tablas por aquí: el panel va por /api/db con su sesión (api/_lib/pasarela.js)
// y las páginas públicas por endpoints del servidor. Así que solo queda una
// cosa, de lectura y sin clave:
//
//   · GET/HEAD /storage/v1/object/public/…   ver un archivo por su enlace
//     (los enlaces viejos guardados en la base apuntan aquí)
//
// Antes pasaban también las subidas a una URL firmada (PUT/POST
// /storage/v1/object/upload/sign/…?token=), las del portal de documentos. Ese
// token lo firma storage con su secreto JWT, y en esta Supabase es el de
// ejemplo del CLI, que es público: cualquiera podía fabricarse uno para
// cualquier ruta del bucket y sobrescribir facturas o colgar lo que quisiera
// bajo nuestro dominio. Ahora el portal le manda el fichero a
// api/documentos.js y lo escribe el servidor. Aquí no se sube nada.
//
// Si alguien manda además una clave, tiene que ser la pública: la de servicio
// se salta todas las reglas y nunca viaja por aquí.
//
// Lo usa vite.config.js, igual en desarrollo que en el build publicado. La CSP
// con que salen estos archivos la pone scripts/cabeceras.mjs.
import { SALTO } from '../api/_lib/almacen.js'

const PUBLICO = /^\/sb\/storage\/v1\/object\/public\/[^?]+(\?|$)/
const LECTURA = ['GET', 'HEAD', 'OPTIONS']

function rolDe(token) {
  try {
    return JSON.parse(Buffer.from(String(token).split('.')[1] || '', 'base64url').toString('utf8')).role || ''
  } catch { return '' }
}

/** Por qué no pasa una petición, o '' si pasa. */
export function motivoBloqueo({ method = 'GET', url = '', headers = {} }) {
  const m = String(method).toUpperCase()
  const ruta = String(url).split('?')[0]
  // SALTO: un `..` (o codificado), una barra codificada o invertida. La misma
  // regla que en la pasarela del panel (api/_lib/almacen.js).
  if (!PUBLICO.test(url) || SALTO.test(ruta) || !LECTURA.includes(m)) return 'ruta'
  const claves = [
    headers.apikey,
    /^Bearer\s+(.+)$/i.exec(headers.authorization || '')?.[1],
    new URL(url, 'http://local').searchParams.get('apikey'),
  ].filter(Boolean)
  return claves.every(c => rolDe(c) === 'anon') ? '' : 'rol'
}

/** La entrada '/sb' del proxy de Vite. */
export function sbProxy(target = 'http://localhost:54321') {
  return {
    target,
    changeOrigin: true,
    // Sin websockets: la web no usa Realtime.
    ws: false,
    rewrite: (p) => p.replace(/^\/sb/, ''),
    // `false` hace que Vite conteste 404 sin tocar la base.
    bypass: (req) => (motivoBloqueo(req) ? false : undefined),
  }
}
