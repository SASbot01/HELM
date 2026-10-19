// El scroll de la web pública de HELM: convierte la posición dentro de
// .hx-historia en un progreso t (0…N), lo suaviza y con él mueve la máscara
// «HELM», las tarjetas de capítulo y la escena 3D (que se suscribe con onFrame).
//
//   0–0,75  la palabra HELM se abre sobre la escena
//   1       titular                     2–8  los siete capítulos
//   9       cierre («Empieza con tu primer cliente»)
//
// Todo va por estilos en línea y clases, sin estado de React: se repinta en
// cada fotograma y React no debe enterarse.

export const N = 10
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
const smooth = (a, b, v) => { const x = clamp((v - a) / (b - a), 0, 1); return x * x * (3 - 2 * x) }

// Ventanas [entra, sale] de cada tarjeta, en unidades de t.
const VENTANAS = [[0.66, 1.9]]
for (let k = 1; k <= 7; k++) VENTANAS.push([k + 0.95, k + 1.9])
VENTANAS.push([8.95, Infinity])

// Punto de la palabra donde la tinta es más gruesa: el zoom se hace sobre él
// para que, al crecer, la letra llene la pantalla con la escena. Se rasteriza
// a escala reducida y se busca el máximo de una transformada de distancia.
function puntoDeZoom(texto, fuente, fs, w, h, cx, base) {
  const k = 0.25
  const cw = Math.max(8, Math.ceil(w * k)), ch = Math.max(8, Math.ceil(h * k))
  const c = document.createElement('canvas')
  c.width = cw; c.height = ch
  const g = c.getContext('2d')
  g.font = `900 ${fs * k}px ${fuente}`
  g.textAlign = 'center'
  g.textBaseline = 'alphabetic'
  g.fillStyle = '#000'
  g.fillText(texto, cx * k, base * k)
  const px = g.getImageData(0, 0, cw, ch).data
  const d = new Float32Array(cw * ch)
  const INF = 1e9
  for (let i = 0; i < cw * ch; i++) d[i] = px[i * 4 + 3] > 127 ? INF : 0
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const i = y * cw + x
    if (!d[i]) continue
    let m = d[i]
    if (x > 0) m = Math.min(m, d[i - 1] + 1)
    if (y > 0) m = Math.min(m, d[i - cw] + 1)
    if (x > 0 && y > 0) m = Math.min(m, d[i - cw - 1] + 1.414)
    if (x < cw - 1 && y > 0) m = Math.min(m, d[i - cw + 1] + 1.414)
    d[i] = m
  }
  let best = -1, bx = cx, by = base
  for (let y = ch - 1; y >= 0; y--) for (let x = cw - 1; x >= 0; x--) {
    const i = y * cw + x
    if (!d[i]) continue
    let m = d[i]
    if (x < cw - 1) m = Math.min(m, d[i + 1] + 1)
    if (y < ch - 1) m = Math.min(m, d[i + cw] + 1)
    if (x < cw - 1 && y < ch - 1) m = Math.min(m, d[i + cw + 1] + 1.414)
    if (x > 0 && y < ch - 1) m = Math.min(m, d[i + cw - 1] + 1.414)
    d[i] = m
    // a igual grosor, gana el trazo más a la izquierda (la H)
    if (m > best + 0.01 || (Math.abs(m - best) <= 0.01 && x < bx * k)) { best = m; bx = x / k; by = y / k }
  }
  return { x: bx, y: by }
}

export function crearHistoria(r) {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const subs = []
  const M = { top: 0, unit: 1, vh: 0, w: 0 }
  const origen = { x: 0, y: 0 }
  let objetivo = 0
  let t = 0
  let corriendo = false, ultimo = 0, raf = 0, vivo = true

  function maqueta() {
    const vh = window.innerHeight, w = window.innerWidth
    if (!vh || !w) return
    // En móvil la barra del navegador cambia innerHeight al hacer scroll:
    // solo se recoloca si cambia el ancho o la altura en más de un 20 %.
    if (w === M.w && Math.abs(vh - M.vh) < M.vh * 0.2) return
    M.w = w; M.vh = vh
    M.unit = Math.round(vh * (w < 760 ? 0.85 : 1))
    r.historia.style.height = (M.unit * N + vh) + 'px'
    r.historia.querySelectorAll('[data-at]').forEach((a) => { a.style.top = Math.round(parseFloat(a.dataset.at) * M.unit) + 'px' })
    M.top = r.historia.getBoundingClientRect().top + window.pageYOffset
    maquetaMascara()
  }

  function maquetaMascara() {
    if (!r.mascara || !r.texto) return
    const w = window.innerWidth, h = window.innerHeight
    r.mascara.setAttribute('viewBox', `0 0 ${w} ${h}`)
    const fuente = '"Barlow Condensed", "Arial Narrow", Impact, sans-serif'
    const fs = Math.min(w * 0.42, h * 0.62)
    const g = document.createElement('canvas').getContext('2d')
    g.font = `900 ${fs}px ${fuente}`
    const cap = g.measureText('H').actualBoundingBoxAscent || fs * 0.7
    const cx = w / 2, base = h * 0.46 + cap / 2
    r.texto.setAttribute('font-size', fs)
    r.texto.setAttribute('x', cx)
    r.texto.setAttribute('y', base)
    Object.assign(origen, puntoDeZoom('HELM', fuente, fs, w, h, cx, base))
  }

  function pinta(tt) {
    if (r.mascara) {
      const z = clamp(tt / 0.75, 0, 1)
      if (z >= 1) r.mascara.style.display = 'none'
      else {
        r.mascara.style.display = ''
        const s = Math.exp(Math.log(110) * z * z * z)     // empieza lento y se acelera
        r.palabra.setAttribute('transform', `translate(${origen.x} ${origen.y}) scale(${s}) translate(${-origen.x} ${-origen.y})`)
        r.mascara.style.opacity = String(1 - smooth(0.55, 0.75, tt))
      }
    }
    if (r.intro) {
      const o = 1 - smooth(0.03, 0.18, tt)
      r.intro.style.opacity = String(o)
      r.intro.style.visibility = o <= 0 ? 'hidden' : ''
    }
    r.tarjetas.forEach((c) => {
      const k = +c.dataset.tarjeta
      const [a0, a1] = VENTANAS[k]
      const f = 0.2
      const a = smooth(a0, a0 + f, tt) * (a1 === Infinity ? 1 : 1 - smooth(a1 - f, a1, tt))
      c.style.opacity = a.toFixed(3)
      c.style.setProperty('--dy', ((1 - a) * (tt < (a0 + a1) / 2 ? 40 : -40)).toFixed(1) + 'px')
      const on = a > 0.01
      if (on !== c.classList.contains('is-on')) {
        c.classList.toggle('is-on', on)
        if (on) c.removeAttribute('aria-hidden'); else c.setAttribute('aria-hidden', 'true')
      }
    })
    r.escenario.style.setProperty('--velo', (smooth(1.8, 2.05, tt) * (1 - smooth(8.8, 9.05, tt))).toFixed(3))
    r.escenario.style.setProperty('--fundido', smooth(9.2, 10, tt).toFixed(3))
    if (r.capitulos) {
      const cap = Math.floor(tt - 0.9)
      r.capitulos.classList.toggle('is-on', tt > 1.95 && tt < 8.9)
      Array.from(r.capitulos.children).forEach((li, j) => li.classList.toggle('is-active', j + 1 === cap))
    }
  }

  function lee() {
    objetivo = clamp((window.pageYOffset - M.top) / M.unit, 0, N)
    if (!Number.isFinite(objetivo)) objetivo = 0
    const fuera = window.pageYOffset > M.top + M.unit * N + M.vh
    r.raiz.classList.toggle('is-fuera', fuera)
    r.cabecera?.classList.toggle('is-solida', window.pageYOffset > M.top + M.unit * N)
  }

  function fotograma(ts) {
    corriendo = false
    if (!vivo) return
    const dt = ultimo ? Math.min((ts - ultimo) / 1000, 0.1) : 0.016
    ultimo = ts
    t += (objetivo - t) * (reduce ? 1 : 1 - Math.exp(-dt * 5.5))
    if (!Number.isFinite(t)) t = objetivo
    if (Math.abs(objetivo - t) < 0.0005) t = objetivo
    pinta(t)
    const fuera = r.raiz.classList.contains('is-fuera')
    for (const fn of subs) {
      try { fn(t, dt, fuera) } catch (e) { if (!fn.fallo) { fn.fallo = true; console.warn('[helm web]', e) } }
    }
    // La escena sigue viva mientras se ve; fuera de la historia el bucle
    // duerme hasta el siguiente scroll.
    if ((!fuera && !reduce) || Math.abs(objetivo - t) > 0.0005) pide()
    else ultimo = 0
  }
  function pide() { if (!corriendo && vivo) { corriendo = true; raf = requestAnimationFrame(fotograma) } }

  const alScroll = () => { lee(); pide() }
  const alCambiarTamano = () => { maqueta(); lee(); pide() }
  maqueta()
  lee()
  t = objetivo
  window.addEventListener('scroll', alScroll, { passive: true })
  window.addEventListener('resize', alCambiarTamano)
  document.fonts?.ready?.then(() => { if (vivo) { M.w = 0; alCambiarTamano() } })
  pide()

  return {
    onFrame(fn) { subs.push(fn); pide() },
    pide,
    // Pinta un instante concreto sin esperar a requestAnimationFrame (pruebas).
    seek(v) {
      t = objetivo = clamp(+v || 0, 0, N)
      pinta(t)
      subs.forEach((fn) => fn(t, 0.016, false))
    },
    // Lleva el scroll a un instante de la historia (anclas).
    irA(v) { window.scrollTo({ top: M.top + v * M.unit, behavior: reduce ? 'auto' : 'smooth' }) },
    dispose() {
      vivo = false
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', alScroll)
      window.removeEventListener('resize', alCambiarTamano)
    },
  }
}
