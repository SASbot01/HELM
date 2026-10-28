// Origen del apex (s4sf.net y www.s4sf.net) cuando Helm corre en este
// servidor detrás del túnel de Cloudflare.
//
// Por qué existe: la ingress del túnel `s4sf-net` manda los cuatro hostnames
// a este servidor, pero no todos al mismo puerto:
//
//   s4sf.net             -> http://127.0.0.1:4317   <- esto
//   www.s4sf.net         -> http://127.0.0.1:4317   <- esto
//   helm.s4sf.net        -> http://localhost:5173   (vite preview)
//   consultoria.s4sf.net -> http://localhost:5173   (vite preview)
//
// Esa configuración vive en el panel de Cloudflare Zero Trust (el túnel es de
// los gestionados por token: `cloudflared tunnel run`, sin config.yml local),
// así que desde el servidor no se puede cambiar el puerto de destino. Nadie
// escuchaba en 4317 y el apex devolvía 502 mientras los dos subdominios iban
// bien. En vez de esperar a tocar el panel, aquí está el que escucha: reenvía
// todo a la misma app del 5173, con lo que los cuatro hostnames sirven lo
// mismo y el apex deja de depender de un puerto huérfano.
//
// La raíz `/` no se decide aquí sino en el router del frontend
// (src/main.jsx): el navegador mira el hostname y enseña la página de inicio
// en el apex y el panel en helm./consultoria. Un 302 desde aquí también
// funcionaría, pero dejaría a la vista una URL /paginainicio que el apex no
// necesita enseñar.
//
// Lo arranca la unit systemd `helm-apex.service`, igual que api-server.mjs
// arranca con `helm-api.service`.
import http from 'node:http'

const PORT = Number(process.env.APEX_PORT || 4317)
const UPSTREAM_HOST = process.env.APEX_UPSTREAM_HOST || '127.0.0.1'
const UPSTREAM_PORT = Number(process.env.APEX_UPSTREAM_PORT || 5173)

// El Host original se reenvía tal cual (s4sf.net / www.s4sf.net). Lo necesitan
// dos cosas de vite.config.js: `allowedHosts`, que lista '.s4sf.net', y el
// `cors.origin` del bloque preview, que nombra los dos hosts del apex (la
// página de inicio manda sus formularios a api/leads.js). Por /sb ya no se
// escribe nada: solo GET/HEAD de /storage/v1/object/public/…, ver
// scripts/sb-proxy.mjs.
const server = http.createServer((req, res) => {
  const upstream = http.request(
    { host: UPSTREAM_HOST, port: UPSTREAM_PORT, method: req.method, path: req.url, headers: req.headers },
    (arriba) => {
      res.writeHead(arriba.statusCode || 502, arriba.headers)
      arriba.pipe(res)
    },
  )
  upstream.on('error', (err) => {
    console.error(`[apex] ${req.method} ${req.url} -> ${err.message}`)
    if (res.headersSent) return res.destroy()
    res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('502 — la app no responde en el origen\n')
  })
  req.pipe(upstream)
})

// Los websockets se reenvían igual que el resto. Hoy no los usa nadie: /sb ya
// no deja pasar Realtime (solo GET/HEAD de /storage/v1/object/public/…, con
// `ws: false`, ver scripts/sb-proxy.mjs) y la web no tiene otros. Se queda
// por si algún día los hay, para que el apex no se comporte distinto que
// helm.s4sf.net.
server.on('upgrade', (req, socket, head) => {
  const arriba = http.request({
    host: UPSTREAM_HOST,
    port: UPSTREAM_PORT,
    method: req.method,
    path: req.url,
    headers: req.headers,
  })
  arriba.on('upgrade', (resArriba, socketArriba, headArriba) => {
    const cabeceras = Object.entries(resArriba.headers)
      .flatMap(([k, v]) => (Array.isArray(v) ? v.map((x) => `${k}: ${x}`) : [`${k}: ${v}`]))
      .join('\r\n')
    socket.write(`HTTP/1.1 101 Switching Protocols\r\n${cabeceras}\r\n\r\n`)
    // Bytes que ya venían pegados al handshake por cada lado: se devuelven al
    // principio del flujo del otro extremo antes de conectar los dos sockets.
    if (headArriba?.length) socketArriba.unshift(headArriba)
    if (head?.length) socketArriba.write(head)
    socketArriba.pipe(socket)
    socket.pipe(socketArriba)
  })
  arriba.on('error', () => socket.destroy())
  socket.on('error', () => arriba.destroy())
  arriba.end()
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[apex] listening on 127.0.0.1:${PORT} -> ${UPSTREAM_HOST}:${UPSTREAM_PORT}`)
})
