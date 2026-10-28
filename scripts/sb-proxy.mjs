// La pasarela /sb: lo único de la Supabase local que sale a internet.
//
// Detrás de localhost:54321 está la Supabase entera: tablas, archivos, la
// administración de Postgres (/pg, que ejecuta SQL), auth, GraphQL… Desde la
// reforma de agencias (migraciones 097 y 098) el navegador ya no habla con las
// tablas por aquí: el panel va por /api/db con su sesión (api/_lib/pasarela.js)
// y las páginas públicas por endpoints del servidor. Así que solo quedan dos
// cosas, y ninguna necesita clave:
//
//   · GET /storage/v1/object/public/…        ver un archivo por su enlace
//     (los enlaces viejos guardados en la base apuntan aquí)
//   · PUT/POST /storage/v1/object/upload/sign/…?token=…
//     subir a una URL que ha firmado el servidor para una ruta concreta (el
//     portal de documentos, api/documentos.js); la autoriza el token firmado
//
// Si alguien manda además una clave, tiene que ser la pública: la de servicio
// se salta todas las reglas y nunca viaja por aquí.
//
// Lo usa vite.config.js, igual en desarrollo que en el build publicado.

const PUBLICO = /^\/sb\/storage\/v1\/object\/public\/[^?]+(\?|$)/
const FIRMADA = /^\/sb\/storage\/v1\/object\/upload\/sign\/[^?]+\?(.*&)?token=/

function rolDe(token) {
  try {
    return JSON.parse(Buffer.from(String(token).split('.')[1] || '', 'base64url').toString('utf8')).role || ''
  } catch { return '' }
}

/** Por qué no pasa una petición, o '' si pasa. */
export function motivoBloqueo({ method = 'GET', url = '', headers = {} }) {
  const m = String(method).toUpperCase()
  const vale = PUBLICO.test(url) ? ['GET', 'HEAD', 'OPTIONS'].includes(m)
    : FIRMADA.test(url) ? ['PUT', 'POST', 'OPTIONS'].includes(m)
      : false
  if (!vale) return 'ruta'
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
