// HELM — el lienzo vivo: el fondo de puntos del panel, en 3D y en tiempo real.
//
// El tema ya pintaba un lienzo de puntos con CSS, plano y quieto. Esto lo
// dibuja con WebGL como lo que quiere ser: una superficie con fondo, que está
// por DEBAJO de las piezas del panel.
//
//   · respira: una ondulación muy lenta la recorre siempre, así que nunca está
//     del todo quieta
//   · tiene profundidad: al mover el ratón el campo se desplaza menos que las
//     piezas, que por eso se leen flotando encima
//   · responde a lo que pasa: cada hecho real (cambiar de sección, una
//     notificación que llega) suelta una onda desde el sitio donde ocurre, con
//     la cresta en el color de esa rama
//
// Sin librerías: es una rejilla de puntos y dos shaders. Si el navegador no
// tiene WebGL, o la persona pide menos movimiento, se queda el lienzo de CSS
// de siempre (tema.css): por eso este componente solo marca `.vivo` en el
// panel cuando de verdad está dibujando.
//
// Para soltar una onda desde cualquier parte del panel:
//   window.dispatchEvent(new CustomEvent('helm:pulso', { detail: { x, y } }))
import { useEffect, useRef } from 'react'

const PASO = 22          // px entre puntos: el mismo del lienzo de CSS
const MAX_ONDAS = 6
const VIDA_ONDA = 3.2    // segundos

const VERT = `
attribute vec2 a_pos;
uniform vec2 u_res;
uniform vec2 u_ojo;      // dónde mira la cámara, en px
uniform float u_t;
uniform float u_dpr;
uniform vec4 u_onda[${MAX_ONDAS}];   // x, y, edad (s), fuerza
varying float v_alto;
varying float v_cresta;

void main() {
  // La respiración: dos ondulaciones largas y lentas que se cruzan.
  float alto = 0.34 * sin(a_pos.x * 0.0042 + u_t * 0.21) * cos(a_pos.y * 0.0051 - u_t * 0.17)
             + 0.18 * sin((a_pos.x + a_pos.y) * 0.0027 + u_t * 0.13);
  float cresta = 0.0;
  for (int i = 0; i < ${MAX_ONDAS}; i++) {
    float edad = u_onda[i].z;
    if (edad < 0.0) continue;
    float d = distance(a_pos, u_onda[i].xy);
    float radio = edad * 520.0;
    float ancho = 46.0 + edad * 26.0;
    float anillo = exp(-pow((d - radio) / ancho, 2.0));
    float fuerza = u_onda[i].w * pow(1.0 - edad / ${VIDA_ONDA.toFixed(1)}, 1.6);
    cresta += anillo * fuerza;
  }
  alto += cresta * 1.6;

  // Perspectiva: lo que sube se acerca al ojo, así que se abre desde donde
  // mira la cámara y se ve más grande.
  vec2 p = u_ojo + (a_pos - u_ojo) * (1.0 + alto * 0.03);
  vec2 clip = (p / u_res) * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  gl_PointSize = u_dpr * (2.4 + alto * 1.6);
  v_alto = alto;
  v_cresta = clamp(cresta, 0.0, 1.0);
}`

const FRAG = `
precision mediump float;
uniform vec3 u_tono;
varying float v_alto;
varying float v_cresta;

void main() {
  float d = length(gl_PointCoord - 0.5);
  float punto = smoothstep(0.5, 0.12, d);
  // En reposo, el gris apagado del lienzo. Solo la cresta coge luz y color.
  float luz = 0.12 + v_alto * 0.26 + v_cresta * 0.55;
  vec3 color = mix(vec3(1.0), u_tono, v_cresta * 0.85);
  gl_FragColor = vec4(color, punto * clamp(luz, 0.03, 0.9));
}`

function programa(gl) {
  const sh = (tipo, src) => {
    const s = gl.createShader(tipo)
    gl.shaderSource(s, src); gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s))
    return s
  }
  const p = gl.createProgram()
  gl.attachShader(p, sh(gl.VERTEX_SHADER, VERT))
  gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FRAG))
  gl.linkProgram(p)
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p))
  return p
}

// '#d9b66b' → [0.85, 0.71, 0.42]
function rgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim())
  if (!m) return [0.85, 0.71, 0.42]
  const n = parseInt(m[1], 16)
  return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

/** @param {string} vista  la sección abierta: al cambiar, suelta una onda */
export default function Lienzo({ vista }) {
  const ref = useRef(null)
  const soltar = useRef(null)

  useEffect(() => {
    const canvas = ref.current
    const raiz = canvas.parentElement
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const gl = canvas.getContext('webgl', { alpha: true, antialias: false, powerPreference: 'low-power' })
    if (!gl) return
    let prog
    try { prog = programa(gl) } catch (e) { console.warn('[helm] lienzo', e.message); return }

    gl.useProgram(prog)
    const u = Object.fromEntries(['u_res', 'u_ojo', 'u_t', 'u_dpr', 'u_tono', 'u_onda'].map(n => [n, gl.getUniformLocation(prog, n)]))
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    const aPos = gl.getAttribLocation(prog, 'a_pos')
    gl.enableVertexAttribArray(aPos)
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
    gl.clearColor(0, 0, 0, 0)

    let ancho = 0, alto = 0, puntos = 0, dpr = 1
    function medir() {
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      ancho = window.innerWidth; alto = window.innerHeight
      canvas.width = Math.round(ancho * dpr); canvas.height = Math.round(alto * dpr)
      gl.viewport(0, 0, canvas.width, canvas.height)
      // Un margen fuera de la pantalla: al abrirse la perspectiva no se ve el borde.
      const xs = [], m = PASO * 3
      for (let y = -m; y <= alto + m; y += PASO) for (let x = -m; x <= ancho + m; x += PASO) xs.push(x + 1, y + 1)
      puntos = xs.length / 2
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(xs), gl.STATIC_DRAW)
    }
    medir()

    const ondas = []                       // { x, y, t0, fuerza }
    const raton = { x: ancho / 2, y: alto / 2 }
    const clic = { x: ancho / 2, y: alto / 2 }
    const ojo = { x: ancho / 2, y: alto / 2 }
    let tono = rgb(getComputedStyle(raiz).getPropertyValue('--tono'))

    soltar.current = ({ x = clic.x, y = clic.y, fuerza = 1 } = {}) => {
      // El color se lee al soltarla: es el de la rama en la que se está AHORA.
      tono = rgb(getComputedStyle(raiz).getPropertyValue('--tono'))
      ondas.push({ x, y, t0: performance.now() / 1000, fuerza })
      if (ondas.length > MAX_ONDAS) ondas.shift()
    }
    const alPulso = (e) => soltar.current(e.detail || {})
    const alMover = (e) => { raton.x = e.clientX; raton.y = e.clientY }
    // Dónde se pulsó por última vez: de ahí sale la onda al cambiar de sección.
    const alPulsar = (e) => { clic.x = e.clientX; clic.y = e.clientY }
    window.addEventListener('helm:pulso', alPulso)
    window.addEventListener('pointermove', alMover, { passive: true })
    window.addEventListener('pointerdown', alPulsar, { passive: true, capture: true })
    window.addEventListener('resize', medir)

    const datosOndas = new Float32Array(MAX_ONDAS * 4)
    let raf = 0, ultimo = 0
    function pinta(ms) {
      raf = requestAnimationFrame(pinta)
      const t = ms / 1000
      while (ondas.length && t - ondas[0].t0 > VIDA_ONDA) ondas.shift()
      // Sin ondas, la respiración va tan lenta que con 30 imágenes por
      // segundo sobra: la mitad de trabajo para la gráfica.
      if (!ondas.length && ms - ultimo < 33) return
      ultimo = ms
      // La cámara sigue al ratón con retraso y muy poco recorrido.
      ojo.x += (raton.x - ojo.x) * 0.04
      ojo.y += (raton.y - ojo.y) * 0.04
      datosOndas.fill(-1)
      ondas.forEach((o, i) => datosOndas.set([o.x, o.y, t - o.t0, o.fuerza], i * 4))
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.uniform2f(u.u_res, ancho, alto)
      gl.uniform2f(u.u_ojo, ojo.x, ojo.y)
      gl.uniform1f(u.u_t, t)
      gl.uniform1f(u.u_dpr, dpr)
      gl.uniform3fv(u.u_tono, tono)
      gl.uniform4fv(u.u_onda, datosOndas)
      gl.drawArrays(gl.POINTS, 0, puntos)
    }
    // Con la pestaña en segundo plano no se dibuja nada.
    const alOcultar = () => {
      cancelAnimationFrame(raf)
      if (!document.hidden) raf = requestAnimationFrame(pinta)
    }
    document.addEventListener('visibilitychange', alOcultar)
    raf = requestAnimationFrame(pinta)
    raiz.classList.add('vivo')

    return () => {
      cancelAnimationFrame(raf)
      soltar.current = null
      raiz.classList.remove('vivo')
      window.removeEventListener('helm:pulso', alPulso)
      window.removeEventListener('pointermove', alMover)
      window.removeEventListener('pointerdown', alPulsar, { capture: true })
      window.removeEventListener('resize', medir)
      document.removeEventListener('visibilitychange', alOcultar)
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    }
  }, [])

  // Cambiar de sección: la onda sale de donde se ha pulsado. Un instante
  // después, para que el panel ya tenga el color de la rama nueva.
  const primera = useRef(true)
  useEffect(() => {
    if (primera.current) { primera.current = false; return }
    const t = setTimeout(() => soltar.current?.(), 30)
    return () => clearTimeout(t)
  }, [vista])

  return <canvas ref={ref} className="helm-lienzo" aria-hidden="true" />
}
