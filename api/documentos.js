// HELM — el portal donde el cliente de una asesoría sube su documentación.
//
//   GET  ?action=estado&t=<token>   → qué le falta por entregar
//   POST ?action=subir&nombre=…     → sube un fichero (el cuerpo, tal cual) y lo
//                                     registra; el enlace va en X-Enlace
//
// El dolor que resuelve: 25 personas persiguiendo facturas por WhatsApp, email
// y teléfono cada trimestre. Aquí el cliente entra por SU enlace, ve qué le
// falta y lo sube. Cuando sube algo, la obligación pasa sola de "pendiente de
// docs" a "en proceso", que es lo que hace que el despacho deje de perseguirle.
//
// Público, como los formularios: lo abre gente de la calle desde su navegador.
// Lo que autentica es el token del enlace, un JWT firmado por HELM que lleva
// dentro el contacto y caduca. Sin token no se ve nada, y un token de un cliente
// no sirve para ver los papeles de otro.
import { supabase } from './lib/supabase.js'
import { applyCors, rateLimit, getClientIp, signJwt, verifyJwt } from './_lib/auth.js'
import { requireProfileAccess } from './_lib/access.js'

const txt = (v, max = 300) => String(v == null ? '' : v).trim().slice(0, max)

// Los mismos que el portal (src/pages/PortalDocumentos.jsx) y que el check de
// la tabla helm_fiscal_documentos.
const TIPOS = new Set(['factura_emitida', 'factura_recibida', 'extracto', 'nomina', 'contrato', 'otro'])

export const MAX_MB = 25

// El mismo texto que enseña el portal antes de subir (PortalDocumentos.jsx).
export const NO_ADMITIDO = 'solo se admiten PDF, fotos (JPG, PNG, WebP, HEIC, TIFF), Excel, Word, OpenDocument (ODS, ODT), '
  + 'CSV, TXT, ZIP, facturas electrónicas (XML, XSIG) o extractos del banco (Norma 43)'

// Lo que manda un cliente a su asesoría: PDF, fotos y escaneos, hojas de
// cálculo, algún Word, los extractos del banco (Norma 43), las facturas
// electrónicas (Facturae) y, si son muchas, un ZIP. El tipo con el que se guarda
// lo pone esta tabla por la extensión, no el navegador, y los primeros bytes
// tienen que cuadrar con ella. El bucket es público: sin esto, cualquiera con un
// enlace podía colgar una página web (un .html, un .svg con script) servida
// desde nuestro dominio.
const empieza = (firma, desde = 0) => (b) =>
  b.length >= desde + firma.length && b.toString('latin1', desde, desde + firma.length) === firma
const ZIP = empieza('PK\x03\x04')                       // zip, xlsx, docx, ods, odt
const OLE = empieza('\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1')   // xls, doc
const JPG = { tipo: 'image/jpeg', cuadra: empieza('\xff\xd8\xff') }
const HEIC = { tipo: 'image/heic', cuadra: empieza('ftyp', 4) }
const TIFF = { tipo: 'image/tiff', cuadra: (b) => empieza('II*\x00')(b) || empieza('MM\x00*')(b) }

// Texto: no hay firma, pero un binario con ceros no es texto. Salvo en UTF-16
// (Excel lo guarda así con «Texto Unicode»), que lleva un cero en cada letra
// y empieza por su BOM: FF FE o FE FF.
const UTF16 = (b) => empieza('\xff\xfe')(b) || empieza('\xfe\xff')(b)
const esTexto = (b) => UTF16(b) || !b.includes(0)
// Un XML empieza por `<` (tras el BOM y algún espacio, si los lleva).
const esXml = (b) => {
  if (!esTexto(b)) return false
  let ini
  if (UTF16(b)) {
    const trozo = Buffer.from(b.subarray(2, 2 + (Math.min(b.length - 2, 400) & ~1)))
    ini = (b[0] === 0xff ? trozo : trozo.swap16()).toString('utf16le')
  } else {
    ini = b.subarray(0, 200).toString('utf8').replace(/^\uFEFF/, '')
  }
  return ini.trimStart().startsWith('<')
}
// Lo que se importa en el programa de contabilidad y no hace falta ver en el
// navegador va como binario: se descarga tal cual. Un XML NUNCA como
// application/xml ni text/xml: el navegador lo pintaría y un XML puede llevar
// script (XHTML, SVG) con nuestro origen.
const BINARIO = 'application/octet-stream'
const NORMA43 = { tipo: BINARIO, cuadra: esTexto }
const FACTURAE = { tipo: BINARIO, cuadra: esXml }

export const FORMATOS = {
  // La cabecera de un PDF puede llevar algo de basura delante.
  pdf: { tipo: 'application/pdf', cuadra: (b) => b.subarray(0, 1024).includes('%PDF-') },
  jpg: JPG,
  jpeg: JPG,
  png: { tipo: 'image/png', cuadra: empieza('\x89PNG\r\n\x1a\n') },
  webp: { tipo: 'image/webp', cuadra: (b) => empieza('RIFF')(b) && empieza('WEBP', 8)(b) },
  heic: HEIC,
  heif: { ...HEIC, tipo: 'image/heif' },
  // Lo que sale de muchos escáneres de oficina.
  tif: TIFF,
  tiff: TIFF,
  xlsx: { tipo: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', cuadra: ZIP },
  xls: { tipo: 'application/vnd.ms-excel', cuadra: OLE },
  ods: { tipo: 'application/vnd.oasis.opendocument.spreadsheet', cuadra: ZIP },
  // Sin charset: los .txt y .csv de muchos bancos van en Latin-1, y con
  // `charset=utf-8` forzado salían con los acentos rotos.
  csv: { tipo: 'text/csv', cuadra: esTexto },
  txt: { tipo: 'text/plain', cuadra: esTexto },
  // Extractos bancarios en Norma 43 (el «Cuaderno 43» que da cada banco).
  n43: NORMA43,
  q43: NORMA43,
  aeb: NORMA43,
  // Factura electrónica Facturae, sin firmar (.xml) o firmada (.xsig).
  xml: FACTURAE,
  xsig: FACTURAE,
  docx: { tipo: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', cuadra: ZIP },
  doc: { tipo: 'application/msword', cuadra: OLE },
  odt: { tipo: 'application/vnd.oasis.opendocument.text', cuadra: ZIP },
  zip: { tipo: 'application/zip', cuadra: ZIP },
}

// El fichero llega en crudo: scripts/api-server.mjs deja los bytes en
// req.rawBody (en Vercel vendrían ya como Buffer en req.body).
function cuerpoCrudo(req) {
  if (Buffer.isBuffer(req.rawBody)) return req.rawBody
  if (Buffer.isBuffer(req.body)) return req.body
  return null
}

// Un año de validez: la relación con una asesoría dura años y un enlace que
// caduca cada mes obliga a reenviarlo, que es justo el trabajo que queríamos
// quitar. Se puede invalidar cambiando el JWT_SECRET o borrando el contacto.
const DIAS = 365

/** El enlace personal de un cliente. Lo genera el panel, no el propio cliente. */
export const tokenDe = (clientId, contactId) =>
  signJwt({ kind: 'docs', clientId, sub: contactId }, { expiresIn: 60 * 60 * 24 * DIAS })

async function contactoDelToken(token) {
  let p
  try { p = await verifyJwt(String(token || '')) } catch {
    const e = new Error('Este enlace ha caducado o no es válido. Pídele uno nuevo a tu asesoría.')
    e.statusCode = 401; throw e
  }
  if (p.kind !== 'docs') { const e = new Error('Enlace no válido'); e.statusCode = 403; throw e }

  const { data } = await supabase
    .from('crm_contacts').select('id, client_id, name, company')
    .eq('id', p.sub).maybeSingle()
  if (!data || data.client_id !== p.clientId) {
    const e = new Error('Este enlace ya no está activo'); e.statusCode = 403; throw e
  }
  return data
}

export default async function handler(req, res) {
  applyCors(req, res)
  if (req.method === 'OPTIONS') return res.status(204).end()

  const ip = getClientIp(req)
  const gate = rateLimit({ key: `documentos:${ip || 'anon'}`, max: 60, windowMs: 60_000 })
  if (!gate.ok) {
    res.setHeader('Retry-After', String(gate.retryAfter || 60))
    return res.status(429).json({ error: 'Demasiadas peticiones' })
  }

  try {
    const action = req.query.action

    // ── Qué le falta ───────────────────────────────────────────────────────
    if (req.method === 'GET' && action === 'estado') {
      const contacto = await contactoDelToken(req.query.t)
      const { data: cliente } = await supabase
        .from('clients').select('name, brand_name, brand_subtitle, logo_url')
        .eq('id', contacto.client_id).maybeSingle()

      // Solo lo que sigue abierto y no ha vencido hace siglos: enseñarle al
      // cliente el 303 del trimestre pasado que ya se presentó solo confunde.
      const hoy = new Date().toISOString().slice(0, 10)
      const { data: pendientes } = await supabase
        .from('helm_fiscal_obligaciones')
        .select('id, modelo, periodo, fecha_limite, estado')
        .eq('contact_id', contacto.id)
        .in('estado', ['pendiente_docs', 'en_proceso'])
        .gte('fecha_limite', hoy)
        .order('fecha_limite').limit(20)

      const { data: subidos } = await supabase
        .from('helm_fiscal_documentos')
        .select('id, nombre, tipo, subido_at')
        .eq('contact_id', contacto.id)
        .order('subido_at', { ascending: false }).limit(30)

      return res.status(200).json({
        cliente: { nombre: contacto.name, empresa: contacto.company || null },
        marca: cliente ? {
          nombre: cliente.brand_name || cliente.name,
          subtitulo: cliente.brand_subtitle || null,
          logo: cliente.logo_url || null,
        } : null,
        pendientes: pendientes || [],
        subidos: subidos || [],
      })
    }

    // ── Subir un documento ─────────────────────────────────────────────────
    // El fichero llega aquí y lo escribe en el bucket el servidor, con la clave
    // de servicio. Antes iba del navegador al bucket por una URL firmada a
    // través de /sb, pero esa firma la hace storage con su secreto JWT, que en
    // la Supabase local es el de ejemplo y es público: cualquiera podía
    // fabricarse una URL para cualquier ruta del bucket. Ahora /sb solo deja
    // ver archivos (scripts/sb-proxy.mjs).
    //
    // El cuerpo es el fichero tal cual, así que el resto va fuera: el nombre,
    // el tipo y la obligación en la URL, y el enlace en la cabecera X-Enlace
    // (en la URL acabaría en los registros). La ruta la pone el servidor, no
    // el navegador: no hay forma de subir a la carpeta de otro.
    if (req.method === 'POST' && action === 'subir') {
      const contacto = await contactoDelToken(req.headers?.['x-enlace'])

      const nombre = txt(req.query.nombre, 200)
      const limpio = txt(req.query.nombre, 400).replace(/[^\w.\-() ]+/g, '_').slice(-120)
      if (!nombre || !limpio) return res.status(400).json({ error: 'Falta el nombre del fichero' })
      const ext = limpio.includes('.') ? limpio.split('.').pop().toLowerCase() : ''
      const formato = Object.hasOwn(FORMATOS, ext) ? FORMATOS[ext] : null
      if (!formato) {
        return res.status(415).json({ error: `${nombre}: ${NO_ADMITIDO}` })
      }

      const bytes = cuerpoCrudo(req)
      if (!bytes?.length) return res.status(400).json({ error: `${nombre} está vacío` })
      if (bytes.length > MAX_MB * 1024 * 1024) return res.status(413).json({ error: `${nombre} pesa más de ${MAX_MB} MB` })
      if (!formato.cuadra(bytes)) {
        return res.status(415).json({ error: `${nombre} no parece un archivo de ese tipo. Ábrelo y vuelve a guardarlo antes de subirlo.` })
      }

      // Que nadie cuelgue lo suyo de la obligación de otro contacto.
      const obligacionId = txt(req.query.obligacion, 64) || null
      if (obligacionId) {
        const { data: obl } = await supabase.from('helm_fiscal_obligaciones')
          .select('id').eq('id', obligacionId).eq('contact_id', contacto.id).maybeSingle()
        if (!obl) return res.status(403).json({ error: 'Esa obligación no es tuya' })
      }

      const ruta = `fiscal/${contacto.client_id}/${contacto.id}/${Date.now()}-${limpio}`
      const { error: errUp } = await supabase.storage.from('helm').upload(ruta, bytes, {
        contentType: formato.tipo, cacheControl: '3600', upsert: false,
      })
      if (errUp) return res.status(500).json({ error: 'No se pudo subir: ' + errUp.message })

      const tipo = TIPOS.has(req.query.tipo) ? req.query.tipo : 'otro'
      const { data, error } = await supabase.from('helm_fiscal_documentos').insert({
        client_id: contacto.client_id,
        contact_id: contacto.id,
        obligacion_id: obligacionId,
        nombre,
        ruta,
        tipo,
        origen: 'portal',
      }).select('id').single()
      if (error) {
        // Un fichero sin su fila no lo ve nadie: mejor no dejarlo en el bucket.
        await supabase.storage.from('helm').remove([ruta])
        return res.status(500).json({ error: 'No se pudo registrar: ' + error.message })
      }

      // Que el cliente haya entregado algo es la señal de que el despacho puede
      // ponerse: la obligación deja de estar "pendiente de docs" sola. Es el
      // paso que evita la llamada de "¿me lo has mandado ya?".
      if (obligacionId) {
        await supabase.from('helm_fiscal_obligaciones')
          .update({ estado: 'en_proceso', updated_at: new Date().toISOString() })
          .eq('id', obligacionId).eq('contact_id', contacto.id)
          .eq('estado', 'pendiente_docs')
      }

      return res.status(200).json({ ok: true, id: data.id, ruta })
    }

    // La URL firmada de antes ya no existe. Quien tenga el portal abierto desde
    // antes del cambio tiene el JS viejo: que sepa qué hacer.
    if (req.method === 'POST' && action === 'firmar') {
      return res.status(410).json({ error: 'El portal se ha actualizado. Recarga la página y vuelve a subir el archivo.' })
    }

    // ── El enlace de un cliente, para el panel ─────────────────────────────
    // Va con sesion: lo pide el despacho, no el cliente. Se genera al vuelo y
    // no se guarda — un token guardado es un token que hay que rotar.
    if (req.method === 'GET' && action === 'enlace') {
      const { clientId, contactId } = req.query
      if (!clientId || !contactId) return res.status(400).json({ error: 'Faltan clientId y contactId' })
      await requireProfileAccess(req, clientId)
      const { data } = await supabase
        .from('crm_contacts').select('id').eq('id', contactId).eq('client_id', clientId).maybeSingle()
      if (!data) return res.status(404).json({ error: 'Contacto no encontrado' })
      return res.status(200).json({ token: await tokenDe(clientId, contactId) })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message })
    console.error('[documentos]', err)
    return res.status(500).json({ error: 'Error interno' })
  }
}
