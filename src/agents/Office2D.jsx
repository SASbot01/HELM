// HELM — La oficina del equipo de agentes, pixel-art y en vista cenital.
//
// Cada agente tiene SU mesa, repartidas en rejilla para que no se amontonen. El
// monitor brilla con su estado (trabajando · hecho · reposo · error). Los que
// trabajan están sentados; los que no, pasean por la oficina. El nombre sale al
// pasar el ratón; al pinchar, se elige el agente. Todo en un <canvas>, sin libs.
import { useEffect, useRef } from 'react'

const EST_CSS = { working: '#7aa5f8', done: '#4ade80', idle: '#6b6b73', error: '#e4362b' }
// Plantilla: cada agente con su color, su pelo y su celda (col,fila) en la rejilla.
export const ROSTER = [
  { k: 'director', nombre: 'Director', color: '#d9b66b', pelo: '#2a2320', cell: [1, 1] },
  { k: 'investigador', nombre: 'Investigador', color: '#7aa5f8', pelo: '#3a2a1d', cell: [3, 1] },
  { k: 'analista', nombre: 'Analista', color: '#4ade80', pelo: '#1d1915', cell: [5, 1] },
  { k: 'productor', nombre: 'Productor', color: '#e0894a', pelo: '#4a3520', cell: [1, 3] },
  { k: 'comercial', nombre: 'Comercial', color: '#e86fa6', pelo: '#2a2320', cell: [3, 3] },
  { k: 'informe', nombre: 'Informe', color: '#b08bdd', pelo: '#161310', cell: [5, 3] },
  { k: 'guionista', nombre: 'Guionista', color: '#d9b66b', pelo: '#4a3520', cell: [1, 5] },
  { k: 'programador', nombre: 'Programador', color: '#7aa5f8', pelo: '#2a2320', cell: [3, 5] },
  { k: 'virales', nombre: 'Virales', color: '#4ade80', pelo: '#3a2a1d', cell: [5, 5] },
]
const sentado = (e) => e === 'working' || e === 'done' || e === 'error'

function construir(container, onPick, estadosIniciales) {
  const TILE = 22, COLS = 7, ROWS = 7
  const W = COLS * TILE, H = ROWS * TILE + 10
  const cv = document.createElement('canvas')
  cv.width = W; cv.height = H
  cv.style.imageRendering = 'pixelated'; cv.style.display = 'block'
  container.appendChild(cv)
  const g = cv.getContext('2d')

  function fit() {
    const r = container.getBoundingClientRect()
    const s = Math.max(0.1, Math.min(r.width / W, r.height / H))
    cv.style.width = W * s + 'px'; cv.style.height = H * s + 'px'
  }
  const ro = new ResizeObserver(fit); ro.observe(container); fit()

  const cell = (cx, cy) => ({ x: cx * TILE + TILE / 2, y: cy * TILE + TILE / 2 })
  const paseo = []
  for (let cx = 0; cx < COLS; cx++) for (let cy = 0; cy < ROWS; cy++) if (cx % 2 === 0 && cy % 2 === 0) paseo.push(cell(cx, cy))
  const puntoPaseo = () => paseo[(Math.random() * paseo.length) | 0]

  const agents = ROSTER.map(a => {
    const d = cell(a.cell[0], a.cell[1])
    const seat = { x: d.x, y: d.y + TILE * 0.62 }
    const estado = estadosIniciales[a.k] || 'idle'
    const ag = { ...a, deskPx: d, seat, x: seat.x, y: seat.y, tx: seat.x, ty: seat.y, estado, phase: Math.random() * 6, pause: 0, moving: false }
    if (!sentado(estado)) { const p = puntoPaseo(); ag.x = p.x; ag.y = p.y; const q = puntoPaseo(); ag.tx = q.x; ag.ty = q.y }
    return ag
  })
  const nuevoDestino = (a) => { const p = puntoPaseo(); a.tx = p.x; a.ty = p.y }

  const rect = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x | 0, y | 0, Math.ceil(w), Math.ceil(h)) }
  function dibujaSuelo() {
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      rect(x * TILE, y * TILE, TILE, TILE, (x + y) % 2 ? '#5a4330' : '#53402c')
      rect(x * TILE, y * TILE, TILE, 1, '#4a3728')
    }
    rect(TILE * 0.6, TILE * 0.6, W - TILE * 1.2, H - TILE * 1.2 - 10, 'rgba(90,63,82,.5)')
  }
  function dibujaMesa(a) {
    const d = a.deskPx
    rect(d.x - TILE * 0.42, d.y - TILE * 0.32 + 2, TILE * 0.84, TILE * 0.7, 'rgba(0,0,0,.28)')
    rect(d.x - TILE * 0.42, d.y - TILE * 0.34, TILE * 0.84, TILE * 0.66, '#6b4d2e')
    rect(d.x - TILE * 0.42, d.y - TILE * 0.34, TILE * 0.84, 2, '#845f39')
    const ec = EST_CSS[a.estado]
    rect(d.x - TILE * 0.2, d.y - TILE * 0.26, TILE * 0.4, TILE * 0.3, '#0d0d10')
    rect(d.x - TILE * 0.16, d.y - TILE * 0.22, TILE * 0.32, TILE * 0.22, a.estado === 'idle' ? '#2a2a33' : ec)
  }
  function dibujaAgente(a, moving) {
    const s = TILE * 0.5, px = a.x, py = a.y
    rect(px - s * 0.4, py + s * 0.28, s * 0.8, s * 0.3, 'rgba(0,0,0,.3)')
    const step = moving ? Math.sin(a.phase * 8) * 2 : 0
    rect(px - s * 0.28, py + s * 0.22 + step, s * 0.2, s * 0.22, '#2b2b33')
    rect(px + s * 0.08, py + s * 0.22 - step, s * 0.2, s * 0.22, '#2b2b33')
    rect(px - s * 0.36, py - s * 0.02, s * 0.72, s * 0.4, a.color)
    rect(px - s * 0.3, py - s * 0.5, s * 0.6, s * 0.52, a.pelo)
    rect(px - s * 0.22, py - s * 0.16, s * 0.44, s * 0.16, '#d7a98a')
  }
  function dibujaEstado(a, destacado) {
    const px = a.x, py = a.y - TILE * 0.62
    g.fillStyle = '#0d0d0e'; g.beginPath(); g.arc(px, py, 4.2, 0, 7); g.fill()
    g.fillStyle = EST_CSS[a.estado]; g.beginPath(); g.arc(px, py, 3, 0, 7); g.fill()
    if (a.estado === 'done' || a.estado === 'error') {
      g.fillStyle = '#0d0d0e'; g.font = 'bold 5px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'
      g.fillText(a.estado === 'done' ? '✓' : '!', px, py + 0.5)
    }
    if (destacado) {
      g.font = 'bold 7px ui-sans-serif,system-ui,sans-serif'
      const w = g.measureText(a.nombre).width + 10, ty = py - 9
      rect(px - w / 2, ty - 6, w, 11, 'rgba(14,14,18,.95)')
      g.fillStyle = '#eaeaec'; g.textAlign = 'center'; g.textBaseline = 'middle'
      g.fillText(a.nombre, px, ty - 0.3)
    }
  }

  let hoverK = null, raf = 0, last = performance.now()
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now
    g.clearRect(0, 0, W, H); dibujaSuelo()
    for (const a of agents) dibujaMesa(a)
    for (const a of agents) {
      a.phase += dt
      if (sentado(a.estado)) { a.tx = a.seat.x; a.ty = a.seat.y }
      else if (a.pause > 0) a.pause -= dt
      else if (Math.hypot(a.tx - a.x, a.ty - a.y) < 2 && Math.random() < 0.02) { a.pause = 0.6 + Math.random() * 1.5; nuevoDestino(a) }
      const dx = a.tx - a.x, dy = a.ty - a.y, dist = Math.hypot(dx, dy)
      if (dist > 1) { const sp = (sentado(a.estado) ? 0.9 : 0.55) * (dt * 60); a.x += dx / dist * sp; a.y += dy / dist * sp; a.moving = !sentado(a.estado) }
      else a.moving = false
    }
    const orden = [...agents].sort((x, y) => x.y - y.y)
    for (const a of orden) dibujaAgente(a, a.moving)
    for (const a of orden) dibujaEstado(a, a.k === hoverK)
    raf = requestAnimationFrame(frame)
  }
  raf = requestAnimationFrame(frame)
  const vagar = setInterval(() => { for (const a of agents) if (!sentado(a.estado) && a.pause <= 0 && Math.random() < 0.3) nuevoDestino(a) }, 1500)

  const aAgente = (e) => {
    const r = cv.getBoundingClientRect()
    const mx = (e.clientX - r.left) / r.width * W, my = (e.clientY - r.top) / r.height * H
    let best = null, bd = TILE * 0.62
    for (const a of agents) { const d = Math.hypot(a.x - mx, a.y - my); if (d < bd) { bd = d; best = a } }
    return best
  }
  const onMove = (e) => { const a = aAgente(e); hoverK = a ? a.k : null; cv.style.cursor = a ? 'pointer' : 'default' }
  const onLeave = () => { hoverK = null }
  const onClick = (e) => { const a = aAgente(e); if (a) onPick(a.k) }
  cv.addEventListener('mousemove', onMove)
  cv.addEventListener('mouseleave', onLeave)
  cv.addEventListener('click', onClick)

  return {
    setEstados(map) {
      for (const a of agents) {
        const e = map[a.k] || 'idle'
        if (e === a.estado) continue
        const antes = sentado(a.estado)
        a.estado = e
        if (!sentado(e) && antes) nuevoDestino(a) // pasa a pasear: se levanta
      }
    },
    dispose() {
      cancelAnimationFrame(raf); clearInterval(vagar); ro.disconnect()
      cv.removeEventListener('mousemove', onMove); cv.removeEventListener('mouseleave', onLeave); cv.removeEventListener('click', onClick)
      if (cv.parentNode === container) container.removeChild(cv)
    },
  }
}

export default function Office2D({ estados = {}, onSelect }) {
  const ref = useRef(null)
  const apiRef = useRef(null)
  const pickRef = useRef(onSelect); pickRef.current = onSelect

  useEffect(() => {
    if (!ref.current) return undefined
    let api
    try { api = construir(ref.current, k => pickRef.current?.(k), estados) }
    catch (e) { console.error('[Office2D]', e); return undefined }
    apiRef.current = api
    return () => { api.dispose(); apiRef.current = null }
  }, []) // se construye una vez; los estados se actualizan aparte

  useEffect(() => { apiRef.current?.setEstados(estados) }, [estados])

  return <div className="of2d" ref={ref} aria-label="La oficina del equipo de agentes, vista cenital" />
}
