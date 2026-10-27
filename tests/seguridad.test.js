// Lo que no puede volver a abrirse: la pasarela /sb, los enlaces que llegan a
// yt-dlp, las direcciones internas que el servidor no debe visitar y la CSP de
// los archivos del almacén.
import { Buffer } from 'node:buffer'
import { describe, it, expect } from 'vitest'
import { motivoBloqueo } from '../scripts/sb-proxy.mjs'
import { cabecerasSeguridad } from '../scripts/cabeceras.mjs'

const jwt = (role) => `x.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.y`
const con = (role) => ({ apikey: jwt(role), authorization: `Bearer ${jwt(role)}` })

describe('pasarela /sb', () => {
  it('solo deja ver archivos públicos', () => {
    expect(motivoBloqueo({ url: '/sb/storage/v1/object/public/helm/a/b.png', headers: {} })).toBe('')
    expect(motivoBloqueo({ method: 'HEAD', url: '/sb/storage/v1/object/public/helm/a/b.png', headers: {} })).toBe('')
    expect(motivoBloqueo({ method: 'OPTIONS', url: '/sb/storage/v1/object/public/helm/a/b.png', headers: {} })).toBe('')
    expect(motivoBloqueo({ url: '/sb/storage/v1/object/public/helm/fiscal/c/k/1-factura (1)..final.pdf?download=', headers: {} })).toBe('')
  })

  // El token de una URL firmada lo firma storage con el secreto JWT por defecto
  // de la Supabase local, que es público: cualquiera se fabricaba uno. El
  // portal de documentos sube ahora por api/documentos.js (tests/documentos.test.js).
  it('ya no deja subir a una URL firmada, ni con token', () => {
    for (const method of ['PUT', 'POST', 'OPTIONS', 'GET']) {
      for (const url of ['/sb/storage/v1/object/upload/sign/helm/fiscal/a/b.pdf?token=x',
        '/sb/storage/v1/object/upload/sign/helm/a.pdf?x=1&token=x', '/sb/storage/v1/object/sign/helm/a.pdf?token=x']) {
        expect(motivoBloqueo({ method, url, headers: {} }), `${method} ${url}`).toBe('ruta')
      }
    }
  })

  it('no deja salir de los archivos públicos con un `..` ni con barras codificadas', () => {
    for (const url of [
      '/sb/storage/v1/object/public/../../../rest/v1/clients',
      '/sb/storage/v1/object/public/helm/../../upload/sign/helm/a.pdf?token=x',
      '/sb/storage/v1/object/public/%2e%2e/%2E%2E/pg/tables',
      '/sb/storage/v1/object/public/helm/.%2e/x',
      '/sb/storage/v1/object/public/helm%2f..%2f..%2fbucket',
      '/sb/storage/v1/object/public/helm\\..\\x',
      '/sb/storage/v1/object/public/helm/%5c..%5cx',
    ]) {
      expect(motivoBloqueo({ url, headers: {} }), url).toBe('ruta')
    }
  })

  it('no deja escribir ni borrar en los archivos públicos', () => {
    for (const method of ['PUT', 'POST', 'PATCH', 'DELETE']) {
      expect(motivoBloqueo({ method, url: '/sb/storage/v1/object/public/helm/a.png', headers: {} }), method).toBe('ruta')
    }
  })

  it('ya no deja pasar tablas, ni con la clave pública', () => {
    for (const url of ['/sb/rest/v1/crm_contacts?select=*', '/sb/rest/v1/clients', '/sb/rest/v1/rpc/x']) {
      expect(motivoBloqueo({ url, headers: con('anon') }), url).toBe('ruta')
    }
  })

  it('no deja subir, borrar ni listar archivos', () => {
    expect(motivoBloqueo({ method: 'POST', url: '/sb/storage/v1/object/helm/a/b.pdf', headers: con('anon') })).toBe('ruta')
    expect(motivoBloqueo({ method: 'DELETE', url: '/sb/storage/v1/object/helm', headers: con('anon') })).toBe('ruta')
    expect(motivoBloqueo({ method: 'POST', url: '/sb/storage/v1/object/list/helm', headers: {} })).toBe('ruta')
    expect(motivoBloqueo({ method: 'DELETE', url: '/sb/storage/v1/object/public/helm/a.png', headers: {} })).toBe('ruta')
    expect(motivoBloqueo({ method: 'PUT', url: '/sb/storage/v1/object/upload/sign/helm/a.pdf', headers: {} })).toBe('ruta')
  })

  it('no deja pasar la administración ni nada más', () => {
    for (const url of ['/sb/pg/tables', '/sb/pg/query', '/sb/auth/v1/settings', '/sb/rest/v1/',
      '/sb/graphql/v1', '/sb/storage/v1/bucket', '/sb/realtime/v1/websocket', '/sb/functions/v1/x']) {
      expect(motivoBloqueo({ url, headers: con('anon') }), url).toBe('ruta')
    }
  })

  it('no deja pasar la clave de servicio, vaya donde vaya', () => {
    const anon = jwt('anon'), servicio = jwt('service_role')
    const url = '/sb/storage/v1/object/public/helm/a.png'
    expect(motivoBloqueo({ url, headers: con('service_role') })).toBe('rol')
    expect(motivoBloqueo({ url, headers: { apikey: anon, authorization: `Bearer ${servicio}` } })).toBe('rol')
    expect(motivoBloqueo({ url: `${url}?apikey=${servicio}`, headers: { apikey: anon } })).toBe('rol')
    expect(motivoBloqueo({ url, headers: { apikey: 'no-es-un-jwt' } })).toBe('rol')
  })
})

// El middleware de scripts/cabeceras.mjs con una respuesta como la de Node:
// setHeader/getHeader y un writeHead cuyas cabeceras pisan a las de setHeader.
function sirve(url, { tipo, delAlmacen, fijas } = {}) {
  let mw
  cabecerasSeguridad().configurePreviewServer({ middlewares: { use: (f) => { mw = f } } })
  const cab = {}
  const res = {
    setHeader(k, v) { cab[k.toLowerCase()] = v },
    getHeader(k) { return cab[k.toLowerCase()] },
    writeHead(estado, h) { for (const [k, v] of Object.entries(h || {})) cab[k.toLowerCase()] = v; return this },
  }
  let sigue = false
  mw({ url }, res, () => { sigue = true })
  // Lo que hace el proxy de Vite: copia las cabeceras de quien contesta (con
  // setHeader) y escribe.
  if (tipo) res.setHeader('Content-Type', tipo)
  for (const [k, v] of Object.entries(delAlmacen || {})) res.setHeader(k, v)
  res.writeHead(200, fijas)
  return { cab, sigue }
}

describe('cabeceras · archivos del almacén', () => {
  const ALMACEN = ['/api/db/storage/v1/object/public/helm/p1/adjuntos/x', '/sb/storage/v1/object/public/helm/p1/x']

  it('un HTML o un SVG que ya estuviera en el bucket sale en sandbox y sin scripts', () => {
    for (const base of ALMACEN) {
      for (const tipo of ['text/html', 'text/html; charset=utf-8', 'image/svg+xml', 'application/xhtml+xml', 'text/xml',
        'text/html; x=application/pdf', undefined]) {
        const { cab, sigue } = sirve(`${base}.html`, { tipo })
        expect(sigue).toBe(true)
        const csp = cab['content-security-policy']
        expect(csp, `${base} ${tipo}`).toMatch(/^default-src 'none';/)
        expect(csp, `${base} ${tipo}`).toMatch(/; sandbox$/)
        expect(csp).not.toMatch(/script-src/)
        expect(cab['x-content-type-options']).toBe('nosniff')
      }
    }
  })

  it('las imágenes y los vídeos se siguen viendo: img-src y media-src del propio dominio', () => {
    for (const tipo of ['image/png', 'image/jpeg', 'video/mp4', 'audio/mpeg']) {
      const csp = sirve(`${ALMACEN[0]}.bin`, { tipo }).cab['content-security-policy']
      expect(csp, tipo).toContain("img-src 'self' data:")
      expect(csp, tipo).toContain("media-src 'self'")
      expect(csp, tipo).toContain("style-src 'unsafe-inline'")
    }
    // La imagen abierta en su pestaña se ve igual dentro del sandbox.
    expect(sirve(`${ALMACEN[0]}.png`, { tipo: 'image/png' }).cab['content-security-policy']).toMatch(/sandbox$/)
  })

  it('PDF, vídeo y audio, sin sandbox (su visor no funciona dentro), pero con el resto cerrado', () => {
    for (const tipo of ['application/pdf', 'Application/PDF; charset=binary', 'video/mp4', 'video/quicktime', 'audio/mpeg', 'audio/mp4']) {
      const csp = sirve(`${ALMACEN[1]}.x`, { tipo }).cab['content-security-policy']
      expect(csp, tipo).toMatch(/^default-src 'none';/)
      expect(csp, tipo).not.toMatch(/sandbox|script-src/)
    }
  })

  it('quien contesta detrás no puede abrirla con su propia CSP', () => {
    const otra = "default-src * 'unsafe-inline'"
    expect(sirve(`${ALMACEN[0]}.html`, { tipo: 'text/html', delAlmacen: { 'Content-Security-Policy': otra } })
      .cab['content-security-policy']).toMatch(/sandbox$/)
    expect(sirve(`${ALMACEN[0]}.html`, { fijas: { 'Content-Type': 'text/html', 'Content-Security-Policy': otra } })
      .cab['content-security-policy']).toMatch(/sandbox$/)
  })

  it('el resto de la web sigue con su CSP de siempre, y los ficheros con hash con su caché', () => {
    const panel = sirve('/panel/silvestre', { tipo: 'text/html' }).cab
    expect(panel['content-security-policy']).toMatch(/script-src 'self'/)
    expect(panel['content-security-policy']).not.toMatch(/sandbox/)
    const js = sirve('/assets/index-Bx9z3Yqa.js', { tipo: 'text/javascript', fijas: { 'Cache-Control': 'no-cache' } }).cab
    expect(js['cache-control']).toBe('public, max-age=31536000, immutable')
    expect(js['content-security-policy']).toMatch(/script-src 'self'/)
  })
})
