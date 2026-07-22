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

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = []
    req.on('data', c => chunks.push(c))
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      const ct = (req.headers['content-type'] || '')
      if (!raw) return resolve(undefined)
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

const server = http.createServer(async (req, res) => {
  decorateRes(res)
  try {
    const u = new URL(req.url, `http://localhost:${PORT}`)
    const resolved = resolveHandlerFile(u.pathname)
    if (!resolved) { res.status(404).json({ error: `No API handler for ${u.pathname}` }); return }
    const file = typeof resolved === 'string' ? resolved : resolved.file
    const query = Object.fromEntries(u.searchParams)
    if (typeof resolved === 'object' && resolved.param) query[resolved.param] = resolved.value
    req.query = query
    req.body = await readBody(req)
    const mod = await import(pathToFileURL(file).href)
    const handler = mod.default || mod.handler
    if (typeof handler !== 'function') { res.status(500).json({ error: `Handler in ${path.basename(file)} is not a function` }); return }
    await handler(req, res)
    if (!res.writableEnded) res.end()
  } catch (err) {
    console.error(`[api] ${req.method} ${req.url} ->`, err?.stack || err)
    if (!res.headersSent) res.status(500).json({ error: 'Internal dev-server error', detail: String(err?.message || err) })
    else if (!res.writableEnded) res.end()
  }
})

server.listen(PORT, '127.0.0.1', () => console.log(`[api] listening on 127.0.0.1:${PORT} -> ${API_ROOT}`))
