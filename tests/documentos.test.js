// El portal de documentos (api/documentos.js · subir): el fichero lo escribe el
// servidor en la carpeta del contacto del enlace, con el tipo que dice su
// extensión y solo si los bytes cuadran con ella. Antes iba por una URL firmada
// a través de /sb, y esa firma se podía falsificar (tests/seguridad.test.js).
// Sin red ni base: Supabase va simulado.
import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect, vi, beforeEach } from 'vitest'

process.env.JWT_SECRET = 'secreto-de-prueba-para-los-tests-del-portal-0123456789'

const PERFIL = 'c0000000-0000-4000-8000-0000000000d1'
const OTRO_PERFIL = 'c0000000-0000-4000-8000-0000000000d2'
const CONTACTO = 'k0000000-0000-4000-8000-0000000000d1'
const VECINO = 'k0000000-0000-4000-8000-0000000000d2'
const OBL = 'o0000000-0000-4000-8000-0000000000d1'
const OBL_AJENA = 'o0000000-0000-4000-8000-0000000000d2'

// ── Base y almacén simulados ───────────────────────────────────────────────
const db = {}
const subidas = []
const borradas = []
let fallaRegistro = false
function reinicia() {
  db.crm_contacts = [
    { id: CONTACTO, client_id: PERFIL, name: 'Ana Pérez', company: null },
    { id: VECINO, client_id: PERFIL, name: 'Luis', company: null },
  ]
  db.helm_fiscal_obligaciones = [
    { id: OBL, contact_id: CONTACTO, estado: 'pendiente_docs' },
    { id: OBL_AJENA, contact_id: VECINO, estado: 'pendiente_docs' },
  ]
  db.helm_fiscal_documentos = []
  subidas.length = 0
  borradas.length = 0
  fallaRegistro = false
}

function consulta(tabla) {
  const filtros = []
  let nueva = null
  let cambio = null
  const casan = () => (db[tabla] || []).filter(f => filtros.every(([c, v]) => f[c] === v))
  const q = {
    select() { return q },
    eq(c, v) { filtros.push([c, v]); return q },
    insert(fila) { nueva = fila; return q },
    update(c) { cambio = c; return q },
    maybeSingle() { return Promise.resolve({ data: structuredClone(casan()[0] || null), error: null }) },
    single() {
      if (fallaRegistro) return Promise.resolve({ data: null, error: { message: 'la base no contesta' } })
      const fila = { id: `doc-${db[tabla].length + 1}`, ...nueva }
      db[tabla].push(fila)
      return Promise.resolve({ data: { id: fila.id }, error: null })
    },
    // Un update se ejecuta al esperarlo, como en supabase-js.
    then(ok, ko) {
      return Promise.resolve().then(() => {
        if (cambio) for (const f of casan()) Object.assign(f, cambio)
        return { data: null, error: null }
      }).then(ok, ko)
    },
  }
  return q
}
const almacen = {
  upload: vi.fn(async (ruta, bytes, opciones) => { subidas.push({ ruta, bytes, opciones }); return { data: { path: ruta }, error: null } }),
  remove: vi.fn(async (rutas) => { borradas.push(...rutas); return { data: [], error: null } }),
}
vi.mock('../api/lib/supabase.js', () => ({
  supabase: { from: (t) => consulta(t), storage: { from: () => almacen } },
}))

const { default: documentos, tokenDe, FORMATOS, MAX_MB, NO_ADMITIDO } = await import('../api/documentos.js')
const { signJwt } = await import('../api/_lib/auth.js')

function respuesta() {
  return {
    statusCode: 0, body: null,
    status(c) { this.statusCode = c; return this },
    json(b) { this.body = b; return this },
    end() { return this },
    setHeader() {},
  }
}
let ip = 0
async function llama({ method = 'POST', query = {}, headers = {}, bytes }) {
  const res = respuesta()
  await documentos({
    method, query, socket: {},
    headers: { 'x-forwarded-for': `10.2.0.${++ip % 250}`, ...headers },
    // Lo que deja scripts/api-server.mjs: los bytes en rawBody y, como no es
    // JSON, ni formulario ni texto, nada en body.
    rawBody: bytes, body: undefined,
  }, res)
  return res
}

const PDF = Buffer.from('%PDF-1.7\n1 0 obj << >> endobj\n%%EOF\n')
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16, 1)])
const HTML = Buffer.from('<!doctype html><script>alert(document.domain)</script>')

async function sube({ nombre = 'factura.pdf', bytes = PDF, tipo = 'factura_recibida', obligacion = '', enlace, tipoNavegador } = {}) {
  const headers = { 'content-type': tipoNavegador || 'application/octet-stream' }
  const token = enlace === undefined ? await tokenDe(PERFIL, CONTACTO) : enlace
  if (token) headers['x-enlace'] = token
  return llama({ query: { action: 'subir', nombre, tipo, obligacion }, headers, bytes })
}

beforeEach(() => { reinicia(); almacen.upload.mockClear(); almacen.remove.mockClear() })

describe('portal de documentos · subir', () => {
  it('guarda el fichero en la carpeta del contacto, lo registra y mueve la obligación', async () => {
    const r = await sube({ obligacion: OBL })
    expect(r.statusCode, JSON.stringify(r.body)).toBe(200)
    expect(subidas).toHaveLength(1)
    const [s] = subidas
    expect(s.ruta).toMatch(new RegExp(`^fiscal/${PERFIL}/${CONTACTO}/\\d+-factura\\.pdf$`))
    expect(s.bytes.equals(PDF)).toBe(true)
    expect(s.opciones).toMatchObject({ contentType: 'application/pdf', upsert: false })
    expect(r.body).toMatchObject({ ok: true, ruta: s.ruta })
    expect(db.helm_fiscal_documentos).toEqual([expect.objectContaining({
      client_id: PERFIL, contact_id: CONTACTO, obligacion_id: OBL, nombre: 'factura.pdf',
      ruta: s.ruta, tipo: 'factura_recibida', origen: 'portal',
    })])
    expect(db.helm_fiscal_obligaciones.find(o => o.id === OBL).estado).toBe('en_proceso')
  })

  it('sin obligación también vale (un contrato suelto)', async () => {
    const r = await sube({ tipo: 'contrato' })
    expect(r.statusCode).toBe(200)
    expect(db.helm_fiscal_documentos[0]).toMatchObject({ obligacion_id: null, tipo: 'contrato' })
  })

  it('el tipo con el que se guarda lo decide la extensión, no el navegador', async () => {
    const r = await sube({ nombre: 'Ticket.PNG', bytes: PNG, tipoNavegador: 'text/html' })
    expect(r.statusCode).toBe(200)
    expect(subidas[0].opciones.contentType).toBe('image/png')
  })

  it('sin enlace, con uno falso o con uno de otra cosa, no sube nada', async () => {
    expect((await sube({ enlace: '' })).statusCode).toBe(401)
    expect((await sube({ enlace: 'x.y.z' })).statusCode).toBe(401)
    const alta = await signJwt({ kind: 'alta', clientId: PERFIL, sub: CONTACTO })
    expect((await sube({ enlace: alta })).statusCode).toBe(403)
    // El enlace de un contacto que ya no es de ese perfil.
    expect((await sube({ enlace: await tokenDe(OTRO_PERFIL, CONTACTO) })).statusCode).toBe(403)
    // El enlace ya no viaja en el cuerpo ni en la URL.
    const r = await llama({ query: { action: 'subir', nombre: 'f.pdf', t: await tokenDe(PERFIL, CONTACTO) }, bytes: PDF })
    expect(r.statusCode).toBe(401)
    expect(subidas).toHaveLength(0)
  })

  it('no admite páginas web ni nada que no esté en la lista', async () => {
    for (const nombre of ['x.html', 'x.htm', 'logo.svg', 'x.js', 'factura.pdf.html', 'sin-extension', 'x.constructor', 'x.__proto__']) {
      const r = await sube({ nombre, bytes: HTML })
      expect(r.statusCode, nombre).toBe(415)
    }
    expect(subidas).toHaveLength(0)
  })

  it('los primeros bytes tienen que cuadrar con la extensión', async () => {
    expect((await sube({ nombre: 'factura.pdf', bytes: HTML })).statusCode).toBe(415)
    expect((await sube({ nombre: 'foto.jpg', bytes: PDF })).statusCode).toBe(415)
    expect((await sube({ nombre: 'hoja.xlsx', bytes: PDF })).statusCode).toBe(415)
    expect((await sube({ nombre: 'banco.csv', bytes: Buffer.from([0x41, 0x00, 0x42]) })).statusCode).toBe(415)
    expect(subidas).toHaveLength(0)

    const zip = Buffer.concat([Buffer.from('PK\x03\x04', 'latin1'), Buffer.alloc(20)])
    const ole = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(20)])
    const heic = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypheic', 'latin1'), Buffer.alloc(12)])
    for (const [nombre, bytes, tipo] of [
      ['hoja.xlsx', zip, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
      ['viejo.xls', ole, 'application/vnd.ms-excel'],
      ['contrato.docx', zip, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      ['movil.heic', heic, 'image/heic'],
      ['banco.csv', Buffer.from('fecha;importe\n2026-10-01;-12,50\n'), 'text/csv'],
      ['raro.pdf', Buffer.concat([Buffer.alloc(100, 0x20), PDF]), 'application/pdf'],
    ]) {
      const r = await sube({ nombre, bytes })
      expect(r.statusCode, nombre).toBe(200)
      expect(subidas.at(-1).opciones.contentType, nombre).toBe(tipo)
    }
  })

  it('los formatos de una asesoría: escaneos TIFF, ZIP, Norma 43 y Facturae', async () => {
    const tif = (firma) => Buffer.concat([Buffer.from(firma, 'latin1'), Buffer.alloc(20, 7)])
    const zip = Buffer.concat([Buffer.from('PK\x03\x04', 'latin1'), Buffer.alloc(20)])
    // Un registro de cabecera de Norma 43 (11 + entidad + oficina + cuenta…).
    const n43 = Buffer.from('1101820000000123456726102627102620000000000000EUR3\r\n22...\r\n', 'latin1')
    const facturae = Buffer.from('\uFEFF<?xml version="1.0" encoding="UTF-8"?>\n<fe:Facturae xmlns:fe="http://www.facturae.es/..."/>')
    const utf16 = (texto, be = false) => {
      const le = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(texto, 'utf16le')])
      return be ? Buffer.concat([Buffer.from([0xfe, 0xff]), Buffer.from(Buffer.from(texto, 'utf16le')).swap16()]) : le
    }
    for (const [nombre, bytes, tipo] of [
      ['escaneo.tif', tif('II*\x00'), 'image/tiff'],
      ['escaneo.TIFF', tif('MM\x00*'), 'image/tiff'],
      ['facturas-octubre.zip', zip, 'application/zip'],
      ['banco.n43', n43, 'application/octet-stream'],
      ['banco.q43', n43, 'application/octet-stream'],
      ['banco.aeb', n43, 'application/octet-stream'],
      ['banco.txt', n43, 'text/plain'],
      ['F-2026-001.xml', facturae, 'application/octet-stream'],
      ['F-2026-001.xsig', Buffer.from('  \n<ds:Signature/>'), 'application/octet-stream'],
      ['F-2026-002.xml', utf16('<?xml version="1.0"?><fe:Facturae/>'), 'application/octet-stream'],
      ['F-2026-003.xml', utf16('<?xml version="1.0"?><fe:Facturae/>', true), 'application/octet-stream'],
      // El CSV de Excel en «Texto Unicode»: UTF-16 con su BOM, un cero en cada letra.
      ['banco.csv', utf16('fecha;importe\n2026-10-01;-12,50\n'), 'text/csv'],
      ['banco2.csv', utf16('fecha;importe\n', true), 'text/csv'],
    ]) {
      const r = await sube({ nombre, bytes })
      expect(r.statusCode, `${nombre} ${JSON.stringify(r.body)}`).toBe(200)
      expect(subidas.at(-1).opciones.contentType, nombre).toBe(tipo)
    }
  })

  it('el TXT y el CSV del banco en Latin-1 entran, y sin charset: con utf-8 forzado salían los acentos rotos', async () => {
    const latin1 = Buffer.from('Fecha;Concepto;Importe\r\n01/10/2026;Recibo agua Lorca, cañería;-12,50\r\n', 'latin1')
    for (const [nombre, tipo] of [['movimientos.txt', 'text/plain'], ['movimientos.csv', 'text/csv']]) {
      const r = await sube({ nombre, bytes: latin1 })
      expect(r.statusCode, nombre).toBe(200)
      expect(subidas.at(-1).opciones.contentType, nombre).toBe(tipo)
    }
    for (const ext of ['csv', 'txt']) expect(FORMATOS[ext].tipo, ext).not.toMatch(/charset/i)
  })

  it('el aviso nombra todo lo que se admite, también TXT, WebP y OpenDocument', () => {
    for (const nombre of ['PDF', 'JPG', 'PNG', 'WebP', 'HEIC', 'TIFF', 'Excel', 'Word', 'OpenDocument', 'ODS', 'ODT',
      'CSV', 'TXT', 'ZIP', 'XML', 'XSIG', 'Norma 43']) {
      expect(NO_ADMITIDO, nombre).toContain(nombre)
    }
  })

  it('y si los bytes no cuadran con esos formatos, no', async () => {
    for (const [nombre, bytes] of [
      ['escaneo.tif', PNG], ['escaneo.tiff', Buffer.from('MM*\x00raro', 'latin1')],
      ['todo.zip', PDF], ['banco.n43', Buffer.from([0x31, 0x31, 0x00, 0x32])], ['notas.txt', Buffer.concat([PNG, Buffer.alloc(4)])],
      ['F.xml', PDF], ['F.xsig', Buffer.from('no es un xml')], ['F.xml', Buffer.concat([Buffer.from('<x'), Buffer.from([0])])],
    ]) {
      expect((await sube({ nombre, bytes })).statusCode, nombre).toBe(415)
    }
    expect(subidas).toHaveLength(0)
  })

  it('nada se guarda con un tipo que el navegador pinte como página (ni XML, ni HTML, ni SVG)', () => {
    for (const [ext, { tipo }] of Object.entries(FORMATOS)) {
      expect(tipo.split(';')[0], ext).not.toMatch(/html|svg|javascript|ecmascript|(^|\/|\+)xml$/i)
    }
  })

  it(`vacío o de más de ${MAX_MB} MB, no`, async () => {
    expect((await sube({ bytes: Buffer.alloc(0) })).statusCode).toBe(400)
    // Sin cuerpo (lo que queda si api-server.mjs corta uno de más de 30 MB).
    const sinCuerpo = await llama({
      query: { action: 'subir', nombre: 'factura.pdf' }, headers: { 'x-enlace': await tokenDe(PERFIL, CONTACTO) },
    })
    expect(sinCuerpo.statusCode).toBe(400)
    const grande = Buffer.concat([PDF, Buffer.alloc(MAX_MB * 1024 * 1024 + 1 - PDF.length)])
    expect((await sube({ bytes: grande })).statusCode).toBe(413)
    expect(subidas).toHaveLength(0)
  })

  it('el nombre no saca el fichero de su carpeta', async () => {
    const r = await sube({ nombre: '../../' + OTRO_PERFIL + '/x/../factura.pdf' })
    expect(r.statusCode).toBe(200)
    const prefijo = `fiscal/${PERFIL}/${CONTACTO}/`
    expect(subidas[0].ruta.startsWith(prefijo)).toBe(true)
    expect(subidas[0].ruta.slice(prefijo.length)).not.toContain('/')
  })

  it('no cuelga documentos de la obligación de otro contacto', async () => {
    const r = await sube({ obligacion: OBL_AJENA })
    expect(r.statusCode).toBe(403)
    expect(subidas).toHaveLength(0)
    expect(db.helm_fiscal_documentos).toHaveLength(0)
    expect(db.helm_fiscal_obligaciones.find(o => o.id === OBL_AJENA).estado).toBe('pendiente_docs')
  })

  it('un tipo que no existe se guarda como «otro»', async () => {
    await sube({ tipo: 'lo-que-sea' })
    expect(db.helm_fiscal_documentos[0].tipo).toBe('otro')
  })

  it('si no se puede registrar, el fichero no se queda huérfano en el bucket', async () => {
    fallaRegistro = true
    const r = await sube()
    expect(r.statusCode).toBe(500)
    expect(borradas).toEqual([subidas[0].ruta])
  })

  it('la URL firmada de antes ya no existe: pide recargar', async () => {
    const r = await llama({ query: { action: 'firmar' }, headers: { 'content-type': 'application/json' } })
    expect(r.statusCode).toBe(410)
    expect(r.body.error).toMatch(/Recarga/)
    expect(subidas).toHaveLength(0)
  })

  it('el portal acepta las mismas extensiones que el servidor', () => {
    const fuente = fs.readFileSync(path.resolve(__dirname, '../src/pages/PortalDocumentos.jsx'), 'utf8')
    const acepta = /const ACEPTA = '([^']+)'/.exec(fuente)?.[1]
    expect(acepta).toBeTruthy()
    expect(acepta.split(',').sort()).toEqual(Object.keys(FORMATOS).map(e => `.${e}`).sort())
    // Y avisa con el mismo texto que el servidor.
    const aviso = /const NO_ADMITIDO = ('[^']+'(?:\s*\+\s*'[^']+')*)/.exec(fuente)?.[1]
    expect(aviso && aviso.split(/'\s*\+\s*'/).join('').slice(1, -1)).toBe(NO_ADMITIDO)
    // Y ya no sube a ninguna URL firmada.
    expect(fuente).not.toMatch(/action=firmar|upload\/sign|firma\.url/)
  })
})
