// HELM — captura inteligente de facturas de compra (Sage Active módulo 2).
//
//   POST ?action=ocr   → lee una factura de proveedor ya subida al bucket y
//                        sugiere sus campos (proveedor, NIF, fecha, importes).
//
// Todo local, como el resto de la IA de HELM: Tesseract lee el texto de la
// imagen/PDF y el modelo qwen2.5 que ya corre en este servidor lo estructura.
// Nada sale a una API externa ni cuesta un céntimo por factura procesada.
//
// Principio heredado de _lib/acciones.js y que aquí importa el doble: el
// modelo NO es de fiar para los datos. Un 14B leyendo un OCR ruidoso puede
// leer un 8 donde había un 3. Por eso esto SUGIERE, nunca guarda solo: el
// texto crudo del OCR viaja siempre junto a los campos extraídos para que
// quien revisa pueda comparar, y cualquier NIF o importe raro se marca como
// aviso en vez de dejarse pasar en silencio.
//
// Nota para el día de la migración a Vercel (tarea #8): Tesseract y
// pdftoppm son binarios del sistema operativo, instalados aquí con apt. Un
// entorno serverless de Vercel no los trae — este endpoint necesitará una
// función con runtime propio (Docker) o un servicio de OCR aparte.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { supabase } from './lib/supabase.js'
import { applyCors, rateLimit, getClientIp } from './_lib/auth.js'
import { requireProfileAccess } from './_lib/access.js'
import { llmChatConHerramientas } from './_lib/llm.js'

const run = promisify(execFile)
const MAX_OCR_MB = 15

const HERRAMIENTA = {
  type: 'function',
  function: {
    name: 'extraer_factura',
    description: 'Registra los datos de la factura de proveedor leída del texto OCR.',
    parameters: {
      type: 'object',
      properties: {
        proveedor_nombre: { type: 'string', description: 'Razón social del proveedor que emite la factura, sin el NIF' },
        proveedor_nif: { type: 'string', description: 'NIF o CIF del proveedor, formato español. Vacío si no se ve.' },
        fecha: { type: 'string', description: 'Fecha de la factura en formato AAAA-MM-DD. Vacío si no se ve con claridad.' },
        concepto: { type: 'string', description: 'Resumen breve de qué es el gasto (1 línea)' },
        base: { type: 'number', description: 'Base imponible, sin el IVA. Solo el número, sin símbolo de moneda.' },
        iva_pct: { type: 'number', description: 'Porcentaje de IVA aplicado (21, 10, 4 o 0). 21 si no se distingue.' },
        total: { type: 'number', description: 'Importe total de la factura, con IVA incluido.' },
      },
      required: ['proveedor_nombre', 'base', 'total'],
    },
  },
}

const SYSTEM = `Eres el motor de extracción de datos de facturas de proveedor de una asesoría fiscal española.
Se te da el texto que ha leído un OCR de una factura escaneada o fotografiada — puede tener errores de
lectura, palabras cortadas o líneas desordenadas.

Tu única tarea es llamar a la herramienta "extraer_factura" con los datos que consigas identificar.
Reglas:
- Si un dato no aparece con claridad, deja el campo vacío o en 0. NUNCA inventes un NIF, una fecha o un
  importe que no esté en el texto.
- El NIF/CIF español tiene el formato de una letra + 8 dígitos, o 8 dígitos + una letra.
- Si hay varios importes (base, IVA, total), el total es el más alto y suele decir "TOTAL" al lado.
- No expliques nada en texto. Solo llama a la herramienta.`

const numero = (v) => {
  if (v === '' || v == null) return 0
  const n = Number(String(v).replace(/\./g, m => (String(v).split(',')[1] ? '' : m)).replace(',', '.'))
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0
}
const texto = (v, max = 300) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

// AAAA-MM-DD válida, ni en el futuro ni de hace más de 10 años — más allá de
// eso, seguramente el OCR leyó mal un dígito.
function fechaValida(v) {
  const s = texto(v, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const d = new Date(s + 'T00:00:00Z')
  if (Number.isNaN(d.getTime())) return null
  const hoy = new Date()
  const hace10 = new Date(); hace10.setFullYear(hoy.getFullYear() - 10)
  if (d > hoy || d < hace10) return null
  return s
}

const NIF_RE = /^[A-Z0-9]\d{7}[A-Z0-9]$/i

async function extraerTextoOCR(buffer, nombreArchivo) {
  const dir = await mkdtemp(path.join(tmpdir(), 'helm-ocr-'))
  try {
    const esPdf = /\.pdf$/i.test(nombreArchivo) || buffer.subarray(0, 4).toString('ascii') === '%PDF'
    let imgBase = path.join(dir, 'pagina')
    if (esPdf) {
      const pdfPath = path.join(dir, 'origen.pdf')
      await writeFile(pdfPath, buffer)
      // Solo la primera página: una factura de proveedor casi nunca pasa de una.
      await run('pdftoppm', ['-png', '-r', '200', '-f', '1', '-l', '1', '-singlefile', pdfPath, imgBase])
    } else {
      const ext = path.extname(nombreArchivo) || '.jpg'
      const imgPath = imgBase + ext
      await writeFile(imgPath, buffer)
      imgBase = imgPath.replace(new RegExp(`${ext}$`), '')
    }
    const imgFile = esPdf ? `${imgBase}.png` : path.join(dir, path.basename(imgBase) + path.extname(nombreArchivo || '.jpg'))
    const { stdout } = await run('tesseract', [imgFile, 'stdout', '-l', 'spa+eng'], { maxBuffer: 10 * 1024 * 1024 })
    return stdout
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

export default async function handler(req, res) {
  applyCors(req, res)
  if (req.method === 'OPTIONS') return res.status(204).end()

  const ip = getClientIp(req)
  const gate = rateLimit({ key: `gastos:${ip || 'anon'}`, max: 20, windowMs: 60_000 })
  if (!gate.ok) {
    res.setHeader('Retry-After', String(gate.retryAfter || 60))
    return res.status(429).json({ error: 'Demasiadas facturas seguidas. Espera un momento.' })
  }

  try {
    const action = req.query.action

    if (req.method === 'POST' && action === 'ocr') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
      const clientId = texto(body.clientId, 64)
      const ruta = texto(body.ruta, 400)
      if (!clientId || !ruta) return res.status(400).json({ error: 'Faltan clientId y ruta' })
      await requireProfileAccess(req, clientId)
      if (!ruta.startsWith(`${clientId}/gastos/`)) {
        return res.status(403).json({ error: 'Ruta no permitida' })
      }

      const { data: blob, error: dlErr } = await supabase.storage.from('helm').download(ruta)
      if (dlErr) return res.status(404).json({ error: 'No se pudo leer el archivo: ' + dlErr.message })
      const buffer = Buffer.from(await blob.arrayBuffer())
      if (buffer.length > MAX_OCR_MB * 1024 * 1024) {
        return res.status(413).json({ error: `El archivo pesa más de ${MAX_OCR_MB} MB` })
      }

      const textoOcr = (await extraerTextoOCR(buffer, ruta)).trim()
      if (!textoOcr) {
        return res.status(200).json({
          ok: true, texto_ocr: '', avisos: ['No se ha podido leer texto de este archivo. Rellena los campos a mano.'],
          sugerido: { proveedor_nombre: '', proveedor_nif: '', fecha: '', concepto: '', base: 0, iva_pct: 21, total: 0 },
        })
      }

      const { toolCalls } = await llmChatConHerramientas({
        clientId,
        system: SYSTEM,
        messages: [{ role: 'user', content: `Texto OCR de la factura:\n\n${textoOcr.slice(0, 6000)}` }],
        tools: [HERRAMIENTA],
        temperature: 0.1,
        maxTokens: 500,
      })
      const args = toolCalls.find(c => c.name === 'extraer_factura')?.args || {}

      const avisos = []
      const nif = texto(args.proveedor_nif, 12).toUpperCase().replace(/\s+/g, '')
      if (nif && !NIF_RE.test(nif)) avisos.push('El NIF/CIF no tiene un formato reconocible — revísalo.')
      const fecha = fechaValida(args.fecha)
      if (args.fecha && !fecha) avisos.push('No se ha podido leer la fecha con confianza — compruébala.')
      const base = numero(args.base)
      const total = numero(args.total)
      const ivaPct = [0, 4, 10, 21].includes(Number(args.iva_pct)) ? Number(args.iva_pct) : 21
      if (base > 0 && total > 0 && Math.abs(base * (1 + ivaPct / 100) - total) > Math.max(1, total * 0.05)) {
        avisos.push('La base + IVA no cuadra con el total leído — revisa los importes.')
      }
      if (!base && !total) avisos.push('No se ha identificado ningún importe — rellénalos a mano.')

      return res.status(200).json({
        ok: true,
        texto_ocr: textoOcr.slice(0, 8000),
        avisos,
        sugerido: {
          proveedor_nombre: texto(args.proveedor_nombre, 200),
          proveedor_nif: nif,
          fecha: fecha || '',
          concepto: texto(args.concepto, 200),
          base, iva_pct: ivaPct, total,
        },
      })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message })
    console.error('[gastos]', err)
    return res.status(500).json({ error: 'No se pudo procesar la factura: ' + (err.message || 'error interno') })
  }
}
