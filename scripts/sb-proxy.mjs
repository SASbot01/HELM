// La pasarela /sb: lo único de la Supabase local que sale a internet.
//
// La web habla con la base por el mismo origen (/sb → localhost:54321). Detrás
// de ese puerto está la Supabase entera: además de las tablas y los archivos,
// la administración de Postgres (/pg, que ejecuta SQL), auth, GraphQL… Nada de
// eso lo usa la web, y publicarlo era dejar la base abierta. Aquí se deja
// pasar solo lo que la web necesita:
//
//   · /rest/v1/<tabla>          leer y escribir tablas
//   · /storage/v1/object/…      subir, bajar y borrar archivos
//
// y solo con la clave pública (rol `anon`). Una petición con una clave de otro
// rol —la de servicio, que se salta todas las reglas de la base— no pasa: el
// servidor (api/, worker) habla con la base en local, nunca por aquí.
//
// Lo usa vite.config.js, igual en desarrollo que en el build publicado.

const RUTAS = /^\/sb\/(rest\/v1\/[a-z0-9_]+|storage\/v1\/object\/[^?]+)(\?|$)/
// Los enlaces públicos de archivos se abren sin clave (un <img>, un enlace).
const SIN_CLAVE = /^\/sb\/storage\/v1\/object\/public\//

function rolDe(token) {
  try {
    return JSON.parse(Buffer.from(String(token).split('.')[1] || '', 'base64url').toString('utf8')).role || ''
  } catch { return '' }
}

/** Por qué no pasa una petición, o '' si pasa. */
export function motivoBloqueo({ method = 'GET', url = '', headers = {} }) {
  if (!RUTAS.test(url)) return 'ruta'
  // El preflight no lleva clave: la llevará la petición de verdad.
  if (method === 'OPTIONS') return ''
  const claves = [
    headers.apikey,
    /^Bearer\s+(.+)$/i.exec(headers.authorization || '')?.[1],
    new URL(url, 'http://local').searchParams.get('apikey'),
  ].filter(Boolean)
  if (!claves.length) return SIN_CLAVE.test(url) ? '' : 'sin clave'
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
