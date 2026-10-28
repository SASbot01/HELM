// Servidor estilo Vercel para las funciones de `api/` cuando Helm corre en
// este servidor (sin Vercel delante). Mapea /api/<path> -> api/<path>.js
// (o /index.js, o [param].js) y llama a su default export con (req,res)
// con forma Vercel.
//
// Vive en el repo (antes era un script suelto en /tmp que se perdía) y lo
// arranca la unit systemd `helm-api.service` en el puerto 5182.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { enContexto } from '../api/_lib/contexto.js'
import { pasarela } from '../api/_lib/pasarela.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const API_ROOT = path.resolve(HERE, '..', 'api')
const PORT = process.env.API_PORT ? Number(process.env.API_PORT) : 5182

function resolveHandlerFile(pathname) {
  let rel = pathname.replace(/^\/api\/?/, '').replace(/\/+$/, '')
  if (!rel) rel = 'index'
  const tryList = [
    path.join(API_ROOT, `${rel}.js`),
    path.join(API_ROOT, rel, 'index.js'),
  ]
  for (const f of tryList) if (fs.existsSync(f)) return f
  // dynamic [param].js in the containing dir
  const parts = rel.split('/')
  const last = parts.pop()
  const dir = path.join(API_ROOT, parts.join('/'))
  if (fs.existsSync(dir)) {
    const dyn = fs.readdirSync(dir).find(n => /^\[.+\]\.js$/.test(n))
    if (dyn) return { file: path.join(dir, dyn), param: dyn.slice(1, -4), value: last }
  }
  return null
}

const MAX_CUERPO = 30 * 1024 * 1024

// Las subidas en crudo (un vídeo entero, un trozo de 32 MB de uno o un recurso
// del Editor de reels: el archivo es el cuerpo, no JSON): no se leen aquí (no
// caben en MAX_CUERPO ni en memoria, y pasadas por readBody se pierde el
// stream); el handler recibe la petición sin tocar y la escribe a disco según
// llega, con su propio tope (api/_lib/subida-trozos.js).
const EN_CRUDO = {
  '/api/editor': ['subir', 'trozo', 'recurso'],
  '/api/trial-reels': ['trozo'],
}
const subidaEnCrudo = (pathname, query) =>
  (EN_CRUDO[pathname.replace(/\/+$/, '')] || []).includes(query.action)

// Lo que se lee como texto: JSON (también los *+json), formularios y text/*.
// Lo demás (un fichero del portal de documentos, application/octet-stream) se
// queda en bytes en req.rawBody y req.body va vacío: pasado a UTF-8 se rompía
// cualquier byte que no fuera texto, y nadie lo lee de ahí (api/documentos.js y
// los webhooks leen los bytes; /api/db ni pasa por aquí). Sin content-type, como
// antes, texto.
const ES_TEXTO = /^\s*(application\/(json|x-www-form-urlencoded|[\w.+-]+\+json)|text\/|;|$)/i

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = []
    let total = 0
    req.on('data', c => {
      // Nadie manda 30 MB de JSON a una función: se corta la conexión.
      total += c.length
      if (total > MAX_CUERPO) { req.destroy(); return resolve(undefined) }
      chunks.push(c)
    })
    req.on('end', () => {
      // El cuerpo tal cual llegó: las firmas de los webhooks (Stripe) se
      // calculan sobre estos bytes, no sobre el JSON vuelto a escribir.
      req.rawBody = Buffer.concat(chunks)
      const ct = (req.headers['content-type'] || '')
      if (!req.rawBody.length || !ES_TEXTO.test(ct)) return resolve(undefined)
      const raw = req.rawBody.toString('utf8')
      if (ct.includes('application/json')) { try { return resolve(JSON.parse(raw)) } catch { return resolve(undefined) } }
      if (ct.includes('application/x-www-form-urlencoded')) return resolve(Object.fromEntries(new URLSearchParams(raw)))
      resolve(raw)
    })
    req.on('error', () => resolve(undefined))
  })
}

function decorateRes(res) {
  res.status = (code) => { res.statusCode = code; return res }
  res.json = (obj) => { if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)); return res }
  res.send = (body) => {
    if (body == null) return res.end()
    if (typeof body === 'object') return res.json(body)
    if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.end(String(body)); return res
  }
  return res
}

// Cada petición, con su propio contexto (quién la hace y a quién se cobra lo
// que gaste en IA): ver api/_lib/contexto.js.
const server = http.createServer((req, res) => enContexto({ origen: 'panel' }, () => atiende(req, res)))

async function atiende(req, res) {
  decorateRes(res)
  // La base de datos del panel: va por su propia puerta, que reenvía el cuerpo
  // sin leerlo (puede ser un archivo) y filtra por agencia.
  if (req.url.startsWith('/api/db/')) return pasarela(req, res)
  try {
    const u = new URL(req.url, `http://localhost:${PORT}`)
    const resolved = resolveHandlerFile(u.pathname)
    if (!resolved) { res.status(404).json({ error: `No API handler for ${u.pathname}` }); return }
    const file = typeof resolved === 'string' ? resolved : resolved.file
    const query = Object.fromEntries(u.searchParams)
    if (typeof resolved === 'object' && resolved.param) query[resolved.param] = resolved.value
    req.query = query
    req.body = subidaEnCrudo(u.pathname, query) ? undefined : await readBody(req)
    const mod = await import(pathToFileURL(file).href)
    const handler = mod.default || mod.handler
    if (typeof handler !== 'function') { res.status(500).json({ error: `Handler in ${path.basename(file)} is not a function` }); return }
    await handler(req, res)
    if (!res.writableEnded) res.end()
  } catch (err) {
    // Solo la ruta, sin parámetros: ahí viajan tokens (el del conector MCP va
    // en la propia ruta, los de enlaces y OAuth en la query) y esto es un log.
    const ruta = String(req.url).split('?')[0].replace(/^(\/api\/mcp\/).+/, '$1***')
    console.error(`[api] ${req.method} ${ruta} ->`, err?.stack || err)
    if (!res.headersSent) res.status(500).json({ error: 'Error interno' })
    else if (!res.writableEnded) res.end()
  }
}

server.listen(PORT, '127.0.0.1', () => console.log(`[api] listening on 127.0.0.1:${PORT} -> ${API_ROOT}`))

// Trial reels limpia su disco (7 días) y reintenta los cobros sin apuntar cada
// hora (api/trial-reels.js · mantenimiento): se carga ya, aunque nadie abra el
// agente. Con la misma URL que usa atiende(), para que sea el mismo módulo.
import(pathToFileURL(path.join(API_ROOT, 'trial-reels.js')).href)
  .catch(e => console.error('[api] no pude cargar trial-reels:', e?.message || e))
