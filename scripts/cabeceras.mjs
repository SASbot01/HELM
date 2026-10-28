// Las cabeceras de seguridad de todo lo que sirve el build (`vite preview`).
//
// Lo importante es la CSP: le dice al navegador de dónde puede cargar cosas la
// web. La sesión vive en localStorage, así que un script ajeno que se colara en
// la página podría llevársela; con esto el navegador no lo ejecuta.
//
// El inventario de lo que la web carga de verdad (octubre de 2026):
//   · código, estilos y tipografías: solo de este servidor
//   · datos: /api, mismo origen (/sb solo sirve archivos públicos, GET/HEAD)
//   · imágenes y vídeo: de cualquier https (logos, miniaturas de reels, avatares)
//   · iframes: el calendario de reservas y el vídeo de /gracias
// No hay píxeles ni analítica de terceros. El día que se pegue uno (Meta,
// Google), hay que añadir su dominio a script-src y connect-src aquí.
//
// Solo se aplica al build: el servidor de desarrollo necesita scripts en línea
// para recargar en caliente.
//
// Los archivos del almacén (el bucket público `helm`: /api/db/storage/… y los
// enlaces viejos de /sb/storage/…) llevan otra, mucho más cerrada: salen de
// este mismo dominio, y un HTML o un SVG con script que ya estuviera dentro se
// ejecutaría con el origen del panel y se llevaría la sesión. Ver
// api/_lib/almacen.js.
import { cspArchivo } from '../api/_lib/almacen.js'

// /gracias se abre DENTRO del iframe del calendario de reservas, que es de
// otro dominio. Es la única página que se deja incrustar fuera.
const CALENDARIOS = 'https://cal.com https://*.cal.com https://cal.eu https://*.cal.eu'

function csp(ruta) {
  const enMarco = /^\/gracias(\/|\?|$)/.test(ruta) ? `'self' ${CALENDARIOS}` : "'self'"
  return [
    "default-src 'self'",
    "script-src 'self'",
    // React y las animaciones escriben estilos en línea (atributo style).
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: https:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-src 'self' https:",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    `frame-ancestors ${enMarco}`,
  ].join('; ')
}

// Los ficheros del build con hash en el nombre (assets/index-Bx9z3Yqa.js) no
// cambian nunca: el navegador puede guardarlos un año sin preguntar. Solo los
// de primer nivel de /assets: /assets/logos/… viene de public/, sin hash, y
// con caché larga un logo nuevo tardaría un año en verse.
const CON_HASH = /^\/assets\/[^/]+-[A-Za-z0-9_-]{8}\.(js|css|woff2?|png|jpe?g|svg|webp|avif|gif|ico|mp4|webm|json|wasm)(\?.*)?$/

const DEL_ALMACEN = /^\/(sb|api\/db)\/storage\//

export const CABECERAS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=15552000',
}

/** Plugin de Vite: pone las cabeceras en cada respuesta del build. */
export function cabecerasSeguridad() {
  return {
    name: 'helm-cabeceras',
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url || '/'
        const archivo = DEL_ALMACEN.test(url)
        const conHash = CON_HASH.test(url)
        for (const [k, v] of Object.entries(CABECERAS)) res.setHeader(k, v)
        res.setHeader('Content-Security-Policy', archivo ? cspArchivo('') : csp(url))
        if (archivo || conHash) {
          // sirv manda su «no-cache» en writeHead, que pisa a setHeader: se
          // quita de ahí y se deja el nuestro. Y la CSP de un archivo depende
          // de su tipo, que solo se sabe cuando contesta el almacén (el proxy
          // copia sus cabeceras justo antes de este writeHead).
          const writeHead = res.writeHead
          res.writeHead = function (estado, ...resto) {
            const i = typeof resto[0] === 'string' ? 1 : 0
            const fijas = resto[i] && typeof resto[i] === 'object' && !Array.isArray(resto[i]) ? resto[i] : null
            let tipo = res.getHeader('content-type')
            for (const k of Object.keys(fijas || {})) {
              const l = k.toLowerCase()
              if (l === 'content-type') tipo = fijas[k]
              if ((conHash && l === 'cache-control') || (archivo && l === 'content-security-policy')) delete fijas[k]
            }
            if (conHash) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
            if (archivo) res.setHeader('Content-Security-Policy', cspArchivo(tipo))
            return writeHead.call(this, estado, ...resto)
          }
        }
        next()
      })
    },
  }
}
