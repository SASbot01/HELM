// Escena 3D de la web pública de HELM. Se carga aparte (import dinámico desde
// Web.jsx) para que three.js no pese en el panel.
//
// Un «puesto de mando» de noche: en el centro el timón del logo; alrededor,
// las torres de los clientes (un perfil por cliente) y, entre medias, un
// escenario por capítulo con paneles que imitan las pantallas reales del
// panel. No tiene bucle propio: historia.js le pasa el progreso t (0…10) en
// cada fotograma.
//
//   0–1  atardecer dorado: la palabra HELM se abre sobre el timón
//   2    vista general                     3  el perfil de Estudio Nova
//   4    leads entrando al CRM             5  la mesa de los siete agentes
//   6    roadmap + vídeo que se ordena     7  informe
//   8    Claude                            9–10  amanece: cierre
import * as THREE from './3d/three.module.min.js'

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
const smooth = (a, b, v) => { const x = clamp((v - a) / (b - a), 0, 1); return x * x * (3 - 2 * x) }
const lerp = (a, b, k) => a + (b - a) * k
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const V3 = (x, y, z) => new THREE.Vector3(x, y, z)

const UI = '"Geist", system-ui, -apple-system, "Segoe UI", sans-serif'
const DISPLAY = '"Barlow Condensed", "Arial Narrow", Impact, sans-serif'
const ORO = '#d9b66b'

export function hayWebGL() {
  try {
    const c = document.createElement('canvas')
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')))
  } catch { return false }
}

export function montarEscena({ canvas, etiquetas, getT }) {
  const small = Math.min(window.innerWidth, window.innerHeight) < 600
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  let T = getT()

  // ── Renderer ───────────────────────────────────────────────────────────
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.5 : 1.75))
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(32, 1, 2, 5000)
  scene.fog = new THREE.Fog(0x000000, 190, 1100)

  // ── Cielo ──────────────────────────────────────────────────────────────
  const skyU = {
    top: { value: new THREE.Color() }, mid: { value: new THREE.Color() }, bot: { value: new THREE.Color() },
    sunDir: { value: V3(0, 0.1, -1) }, sunCol: { value: new THREE.Color() }, sunAmt: { value: 1 },
  }
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyU,
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform vec3 top; uniform vec3 mid; uniform vec3 bot; uniform vec3 sunDir; uniform vec3 sunCol; uniform float sunAmt;
      varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = h > 0.0 ? mix(mid, top, pow(clamp(h * 2.2, 0.0, 1.0), 0.5)) : mix(mid, bot, clamp(-h * 6.0, 0.0, 1.0));
        float s = max(dot(d, normalize(sunDir)), 0.0);
        col += sunCol * (smoothstep(0.9992, 0.9996, s) * 2.0 + pow(s, 18.0) * 0.55 + pow(s, 3.0) * 0.14) * sunAmt;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  })
  const sky = new THREE.Mesh(new THREE.SphereGeometry(2400, 48, 24), skyMat)
  sky.frustumCulled = false
  scene.add(sky)

  // Atardecer dorado (entrada), noche azulada (capítulos) y amanecer (cierre).
  const PAL = {
    oro:      { top: '#0b0912', mid: '#e9a35c', bot: '#120d10', fog: '#6a4632', sun: '#ffcf8a', sunI: 2.4, dir: [0.05, 0.11, -1], hs: '#d8c2a0', hg: '#2a2026', hI: 1.0, glow: 1, luz: 0.55 },
    noche:    { top: '#030308', mid: '#211c33', bot: '#050508', fog: '#14111f', sun: '#b9c4ff', sunI: 0.8, dir: [-0.45, 0.7, 0.35], hs: '#6c72a8', hg: '#141220', hI: 0.95, glow: 0, luz: 1 },
    amanecer: { top: '#100c1c', mid: '#f0b06a', bot: '#120d12', fog: '#7a5038', sun: '#ffd9a0', sunI: 2.2, dir: [-0.55, 0.14, -0.8], hs: '#e0c8a8', hg: '#2a2026', hI: 1.1, glow: 1, luz: 0.7 },
  }
  const COLS = ['top', 'mid', 'bot', 'fog', 'sun', 'hs', 'hg']
  for (const k in PAL) {
    const p = PAL[k]
    COLS.forEach((c) => { p[c] = new THREE.Color(p[c]) })
    p.dir = V3(...p.dir).normalize()
  }
  const env = { dir: V3(), sunI: 0, hI: 0, glow: 0, luz: 0 }
  COLS.forEach((c) => { env[c] = new THREE.Color() })
  function mezcla(a, b, k) {
    COLS.forEach((c) => env[c].lerpColors(a[c], b[c], k))
    env.dir.lerpVectors(a.dir, b.dir, k).normalize()
    env.sunI = lerp(a.sunI, b.sunI, k); env.hI = lerp(a.hI, b.hI, k)
    env.glow = lerp(a.glow, b.glow, k); env.luz = lerp(a.luz, b.luz, k)
  }

  // Reflejos para los metales del timón: un entorno con el mismo cielo y unas
  // tiras de luz, prefiltrado una vez.
  {
    const envScene = new THREE.Scene()
    const u = THREE.UniformsUtils.clone(skyU)
    mezcla(PAL.oro, PAL.noche, 0.35)
    u.top.value.copy(env.top); u.mid.value.copy(env.mid); u.bot.value.copy(env.bot)
    u.sunDir.value.copy(PAL.oro.dir); u.sunCol.value.copy(env.sun); u.sunAmt.value = 1
    envScene.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, uniforms: u, vertexShader: skyMat.vertexShader, fragmentShader: skyMat.fragmentShader })))
    const tira = new THREE.MeshBasicMaterial({ color: '#fff3dc' })
    ;[[-40, 30, -20], [40, 26, 10], [0, 60, 30]].forEach(([x, y, z]) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(30, 3, 3), tira)
      m.position.set(x, y, z); m.lookAt(0, 0, 0); envScene.add(m)
    })
    const pmrem = new THREE.PMREMGenerator(renderer)
    scene.environment = pmrem.fromScene(envScene, 0.03).texture
    pmrem.dispose()
  }

  // ── Luz ────────────────────────────────────────────────────────────────
  const hemi = new THREE.HemisphereLight(0xffffff, 0x222222, 1)
  const sun = new THREE.DirectionalLight(0xffffff, 1)
  sun.castShadow = true
  sun.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048)
  sun.shadow.bias = -0.0005
  sun.shadow.normalBias = 0.05
  Object.assign(sun.shadow.camera, { left: -110, right: 110, top: 110, bottom: -110, near: 1, far: 800 })
  scene.add(hemi, sun, sun.target)
  const luzTimon = new THREE.PointLight('#ffc978', 0, 70, 1.6)
  luzTimon.position.set(0, 16, 12)
  const luzMesa = new THREE.PointLight('#ffcf85', 0, 40, 1.6)
  luzMesa.position.set(50, 9, 30)
  scene.add(luzTimon, luzMesa)

  // ── Utilidades ─────────────────────────────────────────────────────────
  function canvasTex(w, h, draw) {
    const c = document.createElement('canvas')
    c.width = w; c.height = h
    const g = c.getContext('2d')
    draw(g, w, h)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 8
    t.userData = { g, w, h, draw }
    return t
  }
  function redibuja(tex, draw = tex.userData.draw) {
    const { g, w, h } = tex.userData
    g.clearRect(0, 0, w, h)
    draw(g, w, h)
    tex.needsUpdate = true
  }
  function rr(g, x, y, w, h, r) {
    g.beginPath()
    g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r)
    g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
    g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r)
    g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y)
    g.closePath()
  }
  // Fondo de panel como las tarjetas de HELM: vidrio oscuro con borde que
  // degrada del oro al gris.
  function fondo(g, w, h, r = 46) {
    rr(g, 4, 4, w - 8, h - 8, r)
    const bg = g.createLinearGradient(0, 0, 0, h)
    bg.addColorStop(0, 'rgba(24,24,27,.96)'); bg.addColorStop(1, 'rgba(12,12,14,.96)')
    g.fillStyle = bg; g.fill()
    const br = g.createLinearGradient(0, 0, w, h)
    br.addColorStop(0, 'rgba(217,182,107,.85)'); br.addColorStop(0.45, 'rgba(255,255,255,.12)'); br.addColorStop(1, 'rgba(255,255,255,.06)')
    g.lineWidth = 4; g.strokeStyle = br; g.stroke()
  }
  function texto(g, s, x, y, size, color = '#fff', weight = 500, align = 'left', font = UI) {
    g.font = `${weight} ${size}px ${font}`
    g.fillStyle = color; g.textAlign = align; g.textBaseline = 'alphabetic'
    g.fillText(s, x, y)
  }
  const glowTex = canvasTex(64, 64, (g) => {
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32)
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,.5)'); r.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = r; g.fillRect(0, 0, 64, 64)
  })
  function panel(wWorld, wPx, hPx, draw) {
    const tex = canvasTex(wPx, hPx, draw)
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthWrite: false, side: THREE.DoubleSide })
    const m = new THREE.Mesh(new THREE.PlaneGeometry(wWorld, wWorld * hPx / wPx), mat)
    m.renderOrder = 2
    m.userData.tex = tex
    return m
  }

  // ── Materiales ─────────────────────────────────────────────────────────
  const MAT = {
    suelo: new THREE.MeshStandardMaterial({ color: '#0b0b10', roughness: 0.5, metalness: 0.5 }),
    platino: new THREE.MeshStandardMaterial({ color: '#e7eaf1', roughness: 0.2, metalness: 1 }),
    oro: new THREE.MeshStandardMaterial({ color: ORO, roughness: 0.28, metalness: 1 }),
    grafito: new THREE.MeshStandardMaterial({ color: '#1b1c24', roughness: 0.45, metalness: 0.55 }),
    oscuro: new THREE.MeshStandardMaterial({ color: '#101116', roughness: 0.6, metalness: 0.4 }),
    brillo: new THREE.MeshBasicMaterial({ color: '#f6d48e', toneMapped: false }),
    linea: new THREE.MeshBasicMaterial({ color: '#8a6f3c', transparent: true, opacity: 0.55, toneMapped: false, depthWrite: false }),
  }

  // ── Suelo y rejilla ────────────────────────────────────────────────────
  {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), MAT.suelo)
    s.rotation.x = -Math.PI / 2
    s.receiveShadow = true
    scene.add(s)
    const grid = new THREE.GridHelper(1200, 120, '#5c4a2a', '#2a2418')
    grid.position.y = 0.04
    grid.material.transparent = true
    grid.material.opacity = 0.32
    grid.material.depthWrite = false
    scene.add(grid)
  }

  // ── El timón ───────────────────────────────────────────────────────────
  const TIMON = V3(0, 14.5, 0)
  const rueda = new THREE.Group()
  {
    const podio = new THREE.Mesh(new THREE.CylinderGeometry(15, 16, 1.2, 96), MAT.grafito)
    podio.position.y = 0.6; podio.receiveShadow = true; podio.castShadow = true
    scene.add(podio)
    ;[15.2, 11, 7].forEach((r, i) => {
      const a = new THREE.Mesh(new THREE.TorusGeometry(r, i ? 0.06 : 0.14, 8, 160), MAT.brillo)
      a.rotation.x = Math.PI / 2; a.position.y = 1.22
      scene.add(a)
    })
    const columna = new THREE.Mesh(new THREE.BoxGeometry(2.4, 14.4, 2.4), MAT.grafito)
    columna.position.set(0, 7.8, -1.8); columna.castShadow = true
    scene.add(columna)

    const aro = new THREE.Mesh(new THREE.TorusGeometry(8.2, 0.58, 24, 140), MAT.platino)
    const aroIn = new THREE.Mesh(new THREE.TorusGeometry(3, 0.34, 16, 72), MAT.platino)
    const cubo = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 1.8, 40).rotateX(Math.PI / 2), MAT.oro)
    const radios = []
    const mangos = []
    for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4
      radios.push(new THREE.CylinderGeometry(0.24, 0.24, 9.6, 12).translate(0, 4.8, 0).rotateZ(a))
      mangos.push(new THREE.CylinderGeometry(0.46, 0.32, 2.6, 16).translate(0, 10.4, 0).rotateZ(a))
      mangos.push(new THREE.SphereGeometry(0.55, 16, 12).translate(0, 11.9, 0).rotateZ(a))
    }
    const unir = (gs) => {
      const n = gs.map((g) => (g.index ? g.toNonIndexed() : g))
      let total = 0
      n.forEach((g) => { total += g.attributes.position.count })
      const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3)
      let o = 0
      n.forEach((g) => { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count })
      const b = new THREE.BufferGeometry()
      b.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      b.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
      return b
    }
    rueda.add(aro, aroIn, cubo, new THREE.Mesh(unir(radios), MAT.platino), new THREE.Mesh(unir(mangos), MAT.oro))
    rueda.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true } })
    rueda.position.copy(TIMON)
    scene.add(rueda)
  }
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#ffcf85', transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending }))
  halo.scale.setScalar(52)
  halo.position.set(0, 14.5, -3)
  scene.add(halo)

  // ── Torres: un perfil por cliente ──────────────────────────────────────
  const ventanas = canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = '#0c0d13'; g.fillRect(0, 0, w, h)
    let s = 7
    const r = () => { s = (s * 9301 + 49297) % 233280; return s / 233280 }
    for (let y = 0; y < 12; y++) for (let x = 0; x < 5; x++) {
      const v = r()
      g.fillStyle = v > 0.55 ? `rgba(245,${200 + Math.floor(r() * 30)},140,${0.55 + r() * 0.45})` : 'rgba(40,44,60,.9)'
      g.fillRect(8 + x * 24, 6 + y * 21, 16, 12)
    }
  })
  ventanas.wrapS = ventanas.wrapT = THREE.RepeatWrapping
  const TORRES = [
    { n: 'Estudio Nova', x: -46, z: -34, h: 40, w: 13 },
    { n: 'Clínica Sonrisa', x: -14, z: -102, h: 30, w: 12 },
    { n: 'Café Lumen', x: 40, z: -96, h: 46, w: 11 },
    { n: 'Atlas Gym', x: 98, z: -54, h: 28, w: 12 },
    { n: 'Inmo Brisa', x: 112, z: 14, h: 36, w: 12 },
    { n: 'Nómada Films', x: -100, z: -70, h: 32, w: 12 },
    { n: 'Luna Estética', x: -118, z: 6, h: 24, w: 11 },
    { n: 'Ruta Bikes', x: 74, z: -132, h: 38, w: 12 },
  ]
  const torreMats = []
  TORRES.forEach((tr) => {
    const tex = ventanas.clone()
    tex.needsUpdate = true
    tex.repeat.set(1, tr.h / 22)
    const mat = new THREE.MeshStandardMaterial({ color: '#15161e', map: tex, emissive: new THREE.Color('#ffd28a'), emissiveMap: tex, emissiveIntensity: 0.6, roughness: 0.25, metalness: 0.7 })
    torreMats.push(mat)
    const techo = MAT.oscuro
    const b = new THREE.Mesh(new THREE.BoxGeometry(tr.w, tr.h, tr.w), [mat, mat, techo, techo, mat, mat])
    b.position.set(tr.x, tr.h / 2, tr.z)
    b.castShadow = true; b.receiveShadow = true
    scene.add(b)
    const corona = new THREE.Mesh(new THREE.BoxGeometry(tr.w + 0.5, 0.35, tr.w + 0.5), MAT.brillo)
    corona.position.set(tr.x, tr.h + 0.1, tr.z)
    scene.add(corona)
    const base = new THREE.Mesh(new THREE.TorusGeometry(tr.w * 0.95, 0.08, 6, 80), MAT.brillo)
    base.rotation.x = Math.PI / 2
    base.position.set(tr.x, 0.1, tr.z)
    scene.add(base)
    tr.ancla = V3(tr.x, tr.h + 3, tr.z)
  })

  // ── Caminos de luz con datos que van y vienen del timón ────────────────
  const DESTINOS = [...TORRES.map((t) => [t.x, t.z]), [-52, 22], [50, 30], [58, -34], [2, -60]]
  const particulas = []
  {
    DESTINOS.forEach(([x, z]) => {
      const d = Math.hypot(x, z)
      const ang = Math.atan2(z, x)
      const largo = d - 16
      const tira = new THREE.Mesh(new THREE.PlaneGeometry(largo, 0.32), MAT.linea)
      tira.rotation.x = -Math.PI / 2
      tira.rotation.z = -ang
      tira.position.set(Math.cos(ang) * (16 + largo / 2), 0.08, Math.sin(ang) * (16 + largo / 2))
      scene.add(tira)
      for (let k = 0; k < 5; k++) particulas.push({ ang, r0: 16, r1: d, f: k / 5, v: 0.22 + (k % 3) * 0.05, dentro: k % 2 === 0 })
    })
  }
  const partGeo = new THREE.BufferGeometry()
  partGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(particulas.length * 3), 3))
  const partes = new THREE.Points(partGeo, new THREE.PointsMaterial({ map: glowTex, color: '#ffd796', size: 2.4, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }))
  partes.frustumCulled = false
  scene.add(partes)

  // ── Capítulo 02: el menú del perfil, junto a la torre de Estudio Nova ──
  const menu = panel(13, 1024, 1300, (g, w, h) => {
    fondo(g, w, h)
    texto(g, 'Estudio Nova', 64, 120, 62, '#fff', 600)
    texto(g, T('e.menu.sub'), 64, 172, 30, '#a3a3ad', 400)
    const items = T('e.menu.items').split(',')
    const grupos = [[T('e.menu.dinero'), items.slice(0, 6), '#d9b66b'], [T('e.menu.clientes'), items.slice(6, 10), '#7aa5f8'], [T('e.menu.contenido'), items.slice(10, 12), '#e0525a']]
    let y = 250
    grupos.forEach(([titulo, lista, color], gi) => {
      g.fillStyle = color; g.beginPath(); g.arc(70, y - 10, 8, 0, Math.PI * 2); g.fill()
      texto(g, titulo, 92, y, 30, '#c9c9ce', 500)
      y += 30
      lista.forEach((it, i) => {
        const cx = 64 + (i % 2) * 456, cy = y + Math.floor(i / 2) * 136
        rr(g, cx, cy, 432, 116, 26)
        g.fillStyle = gi === 0 && i === 0 ? 'rgba(217,182,107,.14)' : 'rgba(255,255,255,.04)'
        g.fill()
        g.lineWidth = 2.5; g.strokeStyle = gi === 0 && i === 0 ? 'rgba(217,182,107,.8)' : 'rgba(255,255,255,.1)'; g.stroke()
        rr(g, cx + 26, cy + 26, 30, 30, 8); g.lineWidth = 3; g.strokeStyle = gi === 0 && i === 0 ? ORO : '#8d8d95'; g.stroke()
        texto(g, it, cx + 26, cy + 96, 32, '#fff', 500)
      })
      y += Math.ceil(lista.length / 2) * 136 + 34
    })
  })
  menu.position.set(-27, 15, -18)
  menu.lookAt(-3, 19, 14)
  scene.add(menu)

  // ── Capítulo 03: leads → CRM ───────────────────────────────────────────
  const CRM = V3(-54, 9.5, 20)
  const COLX = [0, 1, 2, 3].map((i) => (226 + i * 378) / 1600 * 22 - 11)   // centros de columna en el panel
  const kanban = panel(22, 1600, 960, (g, w, h) => {
    fondo(g, w, h)
    texto(g, 'CRM', 64, 104, 56, '#fff', 600)
    texto(g, '· Estudio Nova', 186, 104, 40, '#8d8d95', 400)
    ;[T('e.nuevo'), T('e.cualificado'), T('e.llamada'), T('e.cliente')].forEach((c, i) => {
      const x = 48 + i * 378
      rr(g, x, 150, 356, 770, 28); g.fillStyle = 'rgba(255,255,255,.03)'; g.fill()
      g.lineWidth = 2; g.strokeStyle = 'rgba(255,255,255,.08)'; g.stroke()
      g.fillStyle = i === 3 ? '#4cc38a' : ORO
      g.beginPath(); g.arc(x + 34, 200, 9, 0, Math.PI * 2); g.fill()
      texto(g, c, x + 56, 212, 32, '#fff', 600)
    })
  })
  kanban.position.copy(CRM)
  kanban.lookAt(-12, 15, 54)
  scene.add(kanban)
  kanban.updateMatrixWorld(true)
  const LEADS = [['Laura Gil', 0, 3], ['Marcos Ruiz', 1, 2], ['Ana Torres', 0, 2], ['Pablo Vera', 1, 1], ['Sara León', 0, 1], ['Iker Sanz', 1, 0]]
  const leadMats = []
  const leads = LEADS.map(([nombre, fuente, hasta], i) => {
    const m = panel(4.3, 600, 170, () => {})
    leadMats.push(m)
    m.userData.dibujo = (g, w, h) => {
      rr(g, 4, 4, w - 8, h - 8, 26)
      g.fillStyle = 'rgba(32,32,36,.98)'; g.fill(); g.lineWidth = 3; g.strokeStyle = 'rgba(217,182,107,.55)'; g.stroke()
      texto(g, nombre, 34, 74, 44, '#fff', 600)
      texto(g, fuente ? T('e.scraper') : T('e.formularios'), 34, 132, 32, fuente ? '#7aa5f8' : ORO, 500)
    }
    redibuja(m.userData.tex, m.userData.dibujo)
    m.material.opacity = 0
    kanban.add(m)
    return { m, fuente, hasta, llega: 4.0 + i * 0.12 }
  })
  const PORTALES = [V3(-70, 9, -4), V3(-50, 9, -12)]
  const portales = PORTALES.map((p, i) => {
    const g = new THREE.Group()
    const anillo = new THREE.Mesh(new THREE.TorusGeometry(5, 0.35, 16, 80), new THREE.MeshBasicMaterial({ color: i ? '#7aa5f8' : '#f6d48e', toneMapped: false }))
    const disco = new THREE.Mesh(new THREE.CircleGeometry(4.8, 64), new THREE.MeshBasicMaterial({ color: i ? '#22355e' : '#4a3a1c', transparent: true, opacity: 0.55, toneMapped: false, side: THREE.DoubleSide }))
    g.add(anillo, disco)
    g.position.copy(p)
    g.lookAt(CRM.x, p.y, CRM.z)
    scene.add(g)
    return g
  })
  const orbeGeo = new THREE.SphereGeometry(0.55, 16, 12)
  const orbes = leads.map((l) => {
    const o = new THREE.Mesh(orbeGeo, new THREE.MeshBasicMaterial({ color: l.fuente ? '#9cc0ff' : '#ffd796', toneMapped: false, transparent: true }))
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: l.fuente ? '#7aa5f8' : '#ffcf85', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }))
    s.scale.setScalar(4)
    o.add(s)
    o.visible = false
    scene.add(o)
    const ini = PORTALES[l.fuente].clone()
    const fin = kanban.localToWorld(V3(COLX[0], 2.35, 0.2))
    const med = ini.clone().lerp(fin, 0.5).setY(ini.y + 14)
    return { o, curva: new THREE.QuadraticBezierCurve3(ini, med, fin) }
  })

  // ── Capítulo 04: la mesa de los siete agentes ──────────────────────────
  const MESA = V3(50, 0, 30)
  const bots = []
  const memoria = new THREE.Group()
  {
    const mesa = new THREE.Mesh(new THREE.CylinderGeometry(6.4, 6.4, 0.4, 72), MAT.grafito)
    mesa.position.set(MESA.x, 2.6, MESA.z); mesa.castShadow = true; mesa.receiveShadow = true
    const pie = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.6, 2.4, 24), MAT.oscuro)
    pie.position.set(MESA.x, 1.2, MESA.z)
    const borde = new THREE.Mesh(new THREE.TorusGeometry(6.4, 0.09, 8, 120), MAT.brillo)
    borde.rotation.x = Math.PI / 2; borde.position.set(MESA.x, 2.82, MESA.z)
    const suelo = new THREE.Mesh(new THREE.CircleGeometry(13, 80), new THREE.MeshStandardMaterial({ color: '#14141b', roughness: 0.4, metalness: 0.6 }))
    suelo.rotation.x = -Math.PI / 2; suelo.position.set(MESA.x, 0.06, MESA.z); suelo.receiveShadow = true
    const aroSuelo = new THREE.Mesh(new THREE.TorusGeometry(13, 0.1, 6, 120), MAT.brillo)
    aroSuelo.rotation.x = Math.PI / 2; aroSuelo.position.set(MESA.x, 0.1, MESA.z)
    scene.add(mesa, pie, borde, suelo, aroSuelo)

    const nucleo = new THREE.Mesh(new THREE.IcosahedronGeometry(1.5, 3), new THREE.MeshStandardMaterial({ color: '#2a2010', emissive: new THREE.Color('#ffc66e'), emissiveIntensity: 1.6, roughness: 0.3, metalness: 0.2 }))
    const red = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(2.6, 1)), new THREE.LineBasicMaterial({ color: '#f6d48e', transparent: true, opacity: 0.7, toneMapped: false }))
    const aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#ffcf85', transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }))
    aura.scale.setScalar(12)
    memoria.add(nucleo, red, aura)
    memoria.position.set(MESA.x, 6.4, MESA.z)
    memoria.userData = { red, nucleo }
    scene.add(memoria)

    const cuerpo = new THREE.CapsuleGeometry(0.8, 1.6, 6, 16)
    const cabeza = new THREE.SphereGeometry(0.72, 24, 16)
    const visor = new THREE.BoxGeometry(1.0, 0.24, 0.3)
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * Math.PI * 2 + 0.25
      const b = new THREE.Group()
      const c = new THREE.Mesh(cuerpo, MAT.grafito); c.position.y = 1.9
      const h = new THREE.Mesh(cabeza, MAT.platino); h.position.y = 3.75
      const v = new THREE.Mesh(visor, MAT.brillo); v.position.set(0, 3.8, 0.62)
      const pantalla = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.0, 0.08), MAT.oscuro)
      pantalla.position.set(0, 3.35, 1.7); pantalla.rotation.x = -0.25
      const luz = new THREE.Mesh(new THREE.PlaneGeometry(1.45, 0.85), new THREE.MeshBasicMaterial({ color: '#f6d48e', transparent: true, opacity: 0.35, toneMapped: false }))
      luz.position.set(0, 3.35, 1.65); luz.rotation.x = -0.25; luz.rotation.y = Math.PI
      b.add(c, h, v, pantalla, luz)
      b.traverse((o) => { if (o.isMesh) o.castShadow = true })
      b.position.set(MESA.x + Math.cos(a) * 8.6, 0, MESA.z + Math.sin(a) * 8.6)
      b.lookAt(MESA.x, 0, MESA.z)
      scene.add(b)
      bots.push({ g: b, cabeza: h, fase: i * 0.9, ancla: V3(b.position.x, 5.6, b.position.z), key: 'e.ag' + (i + 1) })
    }
  }
  const rayosGeo = new THREE.BufferGeometry()
  {
    const p = []
    bots.forEach((b) => { p.push(b.g.position.x, 3.8, b.g.position.z, MESA.x, 6.4, MESA.z) })
    rayosGeo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3))
  }
  const rayos = new THREE.LineSegments(rayosGeo, new THREE.LineBasicMaterial({ color: '#ffd796', transparent: true, opacity: 0, toneMapped: false }))
  scene.add(rayos)
  const guion = panel(1.9, 380, 480, (g, w, h) => {
    rr(g, 6, 6, w - 12, h - 12, 22); g.fillStyle = '#f6f2e8'; g.fill()
    g.fillStyle = ORO; g.fillRect(36, 44, 160, 22)
    for (let i = 0; i < 9; i++) { g.fillStyle = 'rgba(30,30,36,.55)'; g.fillRect(36, 104 + i * 38, i % 3 === 2 ? 200 : 300, 14) }
  })
  guion.visible = false
  scene.add(guion)

  // ── Capítulo 05: roadmap y vídeos que se ordenan en Drive ──────────────
  const ROAD = V3(60, 9, -36)
  const roadmap = panel(24, 1600, 1000, (g, w, h) => {
    fondo(g, w, h)
    texto(g, T('e.roadmap'), 64, 104, 56, '#fff', 600)
    texto(g, '· Estudio Nova · ' + T('e.semanas'), 64 + g.measureText(T('e.roadmap')).width + 24, 104, 36, '#8d8d95', 400)
    T('e.dias').split(',').forEach((d, i) => texto(g, d, 120 + i * 206, 186, 30, '#a3a3ad', 600, 'center'))
    for (let r = 0; r < 6; r++) for (let c = 0; c < 7; c++) {
      rr(g, 30 + c * 206, 214 + r * 126, 180, 104, 18)
      g.fillStyle = 'rgba(255,255,255,.035)'; g.fill(); g.lineWidth = 2; g.strokeStyle = 'rgba(255,255,255,.07)'; g.stroke()
    }
  })
  roadmap.position.copy(ROAD)
  roadmap.lookAt(88, 13, 6)
  scene.add(roadmap)
  const celdas = new THREE.InstancedMesh(new THREE.PlaneGeometry(2.4, 1.38), new THREE.MeshBasicMaterial({ color: '#e7c47f', transparent: true, opacity: 0.92, toneMapped: false }), 42)
  celdas.renderOrder = 3
  roadmap.add(celdas)
  const celdaPos = []
  for (let r = 0; r < 6; r++) for (let c = 0; c < 7; c++) {
    const x = (30 + c * 206 + 90) / 1600 * 24 - 12
    const y = 7.5 - (214 + r * 126 + 52) / 1000 * 15
    celdaPos.push([x, y])
  }
  const movil = new THREE.Group()
  {
    const cuerpo = new THREE.Mesh(new THREE.BoxGeometry(2.6, 5.2, 0.3), MAT.grafito)
    const pantalla = panel(2.3, 300, 560, (g, w, h) => {
      g.fillStyle = '#0d0d10'; g.fillRect(0, 0, w, h)
      const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#3a2c18'); gr.addColorStop(1, '#14141a')
      g.fillStyle = gr; rr(g, 20, 70, w - 40, h - 160, 20); g.fill()
      g.fillStyle = '#fff'; g.beginPath(); g.moveTo(120, 230); g.lineTo(200, 280); g.lineTo(120, 330); g.fill()
      g.fillStyle = '#e0525a'; g.beginPath(); g.arc(w / 2, h - 50, 22, 0, Math.PI * 2); g.fill()
    })
    pantalla.position.z = 0.16
    movil.add(cuerpo, pantalla)
    movil.position.set(64, 5.5, -11)
    movil.lookAt(88, 5.5, 6)
    scene.add(movil)
  }
  const CARPETAS = []
  {
    const tapa = new THREE.MeshStandardMaterial({ color: '#2a2416', roughness: 0.5, metalness: 0.4, emissive: new THREE.Color('#d9b66b'), emissiveIntensity: 0.12 })
    for (let i = 0; i < 4; i++) {
      const g = new THREE.Group()
      const caja = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.2, 0.5), tapa)
      const pest = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.4, 0.5), tapa)
      pest.position.set(-0.95, 1.3, 0)
      g.add(caja, pest)
      g.position.set(66 + i * 3.4, 1.6, -22 - i * 2.8)
      g.lookAt(88, 1.6, 6)
      g.traverse((o) => { if (o.isMesh) o.castShadow = true })
      scene.add(g)
      CARPETAS.push({ g, ancla: V3(g.position.x, 4.1, g.position.z), key: ['e.entrada', 'e.grabado', 'e.editado', 'e.publicado'][i] })
    }
  }
  const video = panel(2.4, 400, 260, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#5a4220'); gr.addColorStop(1, '#1b1b22')
    rr(g, 6, 6, w - 12, h - 12, 22); g.fillStyle = gr; g.fill(); g.lineWidth = 4; g.strokeStyle = ORO; g.stroke()
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(170, 85); g.lineTo(240, 130); g.lineTo(170, 175); g.fill()
  })
  video.visible = false
  scene.add(video)

  // ── Capítulo 06: el informe ────────────────────────────────────────────
  const INF = V3(2, 12, -62)
  const KPIS = [['e.facturado', 8810, ' €'], ['e.cobrado', 6870, ' €'], ['e.ventas', 8, ''], ['e.ticket', 1101, ' €']]
  let kpiK = -1
  const fmt = (n) => Math.round(n).toLocaleString('es-ES', { useGrouping: 'always' })
  const informe = panel(17, 1400, 860, () => {})
  const dibujaInforme = (k) => (g, w, h) => {
    fondo(g, w, h)
    texto(g, T('e.informe'), 64, 104, 56, '#fff', 600)
    texto(g, '· ' + T('e.mes'), 64 + g.measureText(T('e.informe')).width + 24, 104, 36, '#8d8d95', 400)
    rr(g, w - 280, 58, 216, 60, 30); g.fillStyle = 'rgba(217,182,107,.16)'; g.fill()
    texto(g, T('e.ejemplo'), w - 172, 99, 28, ORO, 600, 'center')
    KPIS.forEach(([key, v, suf], i) => {
      const x = 48 + (i % 2) * 660, y = 160 + Math.floor(i / 2) * 330
      rr(g, x, y, 636, 300, 30); g.fillStyle = 'rgba(255,255,255,.035)'; g.fill(); g.lineWidth = 2; g.strokeStyle = 'rgba(255,255,255,.08)'; g.stroke()
      texto(g, T(key), x + 40, y + 70, 34, '#c9c9ce', 500)
      texto(g, fmt(v * k) + suf, x + 40, y + 210, 120, i === 0 ? ORO : '#fff', 800, 'left', DISPLAY)
    })
  }
  informe.position.copy(INF)
  informe.lookAt(24, 15, -16)
  scene.add(informe)
  const barras = []
  {
    const ALT = [3, 4.2, 3.6, 5.4, 4.8, 6.6, 6, 8.2, 7.4, 9.6]
    const mat = new THREE.MeshStandardMaterial({ color: '#c9a15a', roughness: 0.3, metalness: 0.9, emissive: new THREE.Color('#d9a04a'), emissiveIntensity: 0.25 })
    const geo = new THREE.BoxGeometry(1.5, 1, 1.5).translate(0, 0.5, 0)
    ALT.forEach((a, i) => {
      const b = new THREE.Mesh(geo, mat)
      b.position.set(-12 + i * 2.7 + 2, 0, -46 + i * 0.25)
      b.castShadow = true
      b.userData.alt = a
      b.scale.y = 0.001
      scene.add(b)
      barras.push(b)
    })
  }

  // ── Capítulo 07: Claude ────────────────────────────────────────────────
  const CLAUDE = V3(0, 36, 12)
  const HERR = ['perfiles', 'calendario', 'metricas', 'programar_guiones', 'ordenar_video']
  let claudeN = -1
  const terminal = panel(17, 1400, 980, () => {})
  const dibujaTerminal = (n) => (g, w, h) => {
    fondo(g, w, h)
    ;['#e0525a', '#f0943a', '#4cc38a'].forEach((c, i) => { g.fillStyle = c; g.beginPath(); g.arc(70 + i * 40, 76, 12, 0, Math.PI * 2); g.fill() })
    texto(g, T('e.claude'), 200, 88, 34, '#a3a3ad', 500)
    g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(40, 130, w - 80, 2)
    rr(g, w - 64 - 820, 170, 820, 92, 30); g.fillStyle = 'rgba(217,182,107,.16)'; g.fill()
    texto(g, T('e.claude.l1'), w - 104, 230, 38, '#fff', 500, 'right')
    HERR.slice(0, n).forEach((hh, i) => {
      const y = 340 + i * 112
      texto(g, '›', 72, y, 46, ORO, 600, 'left', 'ui-monospace, Menlo, monospace')
      texto(g, hh, 120, y, 42, '#fff', 500, 'left', 'ui-monospace, Menlo, monospace')
      texto(g, '✓ ' + T('e.claude.ok'), w - 80, y, 34, '#4cc38a', 600, 'right')
    })
  }
  terminal.position.copy(CLAUDE)
  terminal.lookAt(23, 43, 52)
  scene.add(terminal)
  const haz = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1, 16, 1, true), new THREE.MeshBasicMaterial({ color: '#ffd796', transparent: true, opacity: 0, toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false }))
  {
    const a = CLAUDE.clone().add(V3(0, -6, 0)), b = TIMON.clone().add(V3(0, 2, 2))
    haz.position.copy(a).lerp(b, 0.5)
    haz.scale.y = a.distanceTo(b)
    haz.lookAt(b); haz.rotateX(Math.PI / 2)
    scene.add(haz)
  }

  scene.updateMatrixWorld(true)

  // Textos de los paneles en el idioma actual.
  function textos() {
    redibuja(menu.userData.tex)
    redibuja(kanban.userData.tex)
    leads.forEach((l) => redibuja(l.m.userData.tex, l.m.userData.dibujo))
    redibuja(roadmap.userData.tex)
    kpiK = -1; claudeN = -1
  }
  textos()

  // ── Etiquetas HTML ─────────────────────────────────────────────────────
  const lbls = []
  function etiqueta(clase, html, ancla, ventana) {
    const el = document.createElement('div')
    el.className = 'hx-lbl ' + clase
    etiquetas.appendChild(el)
    const o = { el, html, ancla, ventana, ultimo: '' }
    lbls.push(o)
    return o
  }
  TORRES.forEach((tr) => etiqueta('', () => `<b>${esc(tr.n)}</b><span>${esc(T('e.perfil'))}</span>`, tr.ancla, (t) => smooth(1.95, 2.25, t) * (1 - smooth(3.85, 4.1, t))))
  bots.forEach((b) => etiqueta('hx-lbl--bot', () => `<b>${esc(T(b.key))}</b>`, b.ancla, (t) => smooth(4.95, 5.2, t) * (1 - smooth(5.9, 6.1, t))))
  etiqueta('hx-lbl--oro', () => `<b>${esc(T('e.memoria'))}</b>`, V3(MESA.x, 9.6, MESA.z), (t) => smooth(5.05, 5.3, t) * (1 - smooth(5.9, 6.1, t)))
  CARPETAS.forEach((c) => etiqueta('', () => `<b>${esc(T(c.key))}</b>`, c.ancla, (t) => smooth(5.95, 6.2, t) * (1 - smooth(6.85, 7.1, t))))

  // ── Cámara ─────────────────────────────────────────────────────────────
  const PLANOS = [
    [0.00, [0, 7, 122], [0, 14, 0]],
    [0.85, [0, 9, 100], [0, 14, 0]],
    [1.60, [16, 22, 92], [0, 12, 0]],
    [2.35, [0, 150, 158], [0, 0, -18]],
    [2.85, [24, 142, 150], [2, 0, -18]],
    [3.35, [-16, 24, 18], [-36, 15, -24]],
    [3.85, [-19, 22, 22], [-36, 14, -24]],
    [4.35, [-24, 14, 46], [-56, 8.5, 18]],
    [4.85, [-27, 13, 49], [-57, 8.5, 18]],
    [5.35, [74, 20, 62], [50, 3.5, 30]],
    [5.85, [78, 16, 56], [50, 3.5, 30]],
    [6.35, [88, 14, 4], [58, 7, -32]],
    [6.85, [85, 13, 8], [58, 7, -32]],
    [7.35, [26, 16, -16], [2, 8, -58]],
    [7.85, [22, 15, -12], [2, 8, -58]],
    [8.35, [22, 43, 50], [0, 34, 10]],
    [8.85, [30, 50, 64], [0, 30, 6]],
    [9.40, [-48, 30, 150], [0, 14, 0]],
    [10.0, [-60, 36, 168], [0, 14, 0]],
  ].map(([t, p, q]) => ({ t, p: V3(...p), q: V3(...q) }))
  const camPos = V3(), camTgt = V3()
  function plano(t) {
    let i = 0
    while (i < PLANOS.length - 2 && t > PLANOS[i + 1].t) i++
    const A = PLANOS[i], B = PLANOS[i + 1]
    const k = smooth(A.t, B.t, t)
    camPos.lerpVectors(A.p, B.p, k)
    camTgt.lerpVectors(A.q, B.q, k)
  }

  let W = 0, H = 0
  function tamano() {
    const w = window.innerWidth, h = window.innerHeight
    if (w === W && Math.abs(h - H) < 2) return
    W = w; H = h
    renderer.setSize(w, h, false)
  }
  tamano()
  window.addEventListener('resize', tamano)

  // Con tarjeta de capítulo en pantalla el encuadre se desplaza para dejar la
  // acción fuera del texto: a la derecha en escritorio, arriba en móvil.
  let vertical = false
  function encuadre(t) {
    const s = smooth(1.85, 2.1, t) * (1 - smooth(8.8, 9.05, t))
    vertical = W < 760 || H > W * 1.05
    const base = vertical ? 46 : 32
    if (vertical) {
      const a = 0.55 * s
      const fullH = H * (1 + a)
      camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(base / 2)) * (1 + a)))
      camera.aspect = W / fullH
      camera.setViewOffset(W, fullH, 0, a * H, W, H)
      const f = 1 + clamp(H / W - 1, 0, 1.4) * 0.5
      camPos.sub(camTgt).multiplyScalar(f).add(camTgt)
    } else {
      const a = 0.34 * s
      camera.fov = base
      camera.aspect = (W * (1 + a)) / H
      camera.setViewOffset(W * (1 + a), H, 0, 0, W, H)
    }
    camera.updateProjectionMatrix()
    return s
  }

  // ── Fotograma ──────────────────────────────────────────────────────────
  const tmp = V3(), tmp2 = V3(), m4 = new THREE.Matrix4(), q0 = new THREE.Quaternion(), s3 = V3()
  let reloj = 0
  let listo = false

  function render(t, dt) {
    if (!reduce) reloj += dt

    if (t < 2.3) mezcla(PAL.oro, PAL.noche, smooth(1.3, 2.3, t))
    else mezcla(PAL.noche, PAL.amanecer, smooth(8.9, 9.7, t))
    skyU.top.value.copy(env.top); skyU.mid.value.copy(env.mid); skyU.bot.value.copy(env.bot)
    skyU.sunDir.value.copy(env.dir); skyU.sunCol.value.copy(env.sun); skyU.sunAmt.value = env.glow
    scene.fog.color.copy(env.fog)
    hemi.color.copy(env.hs); hemi.groundColor.copy(env.hg); hemi.intensity = env.hI
    sun.color.copy(env.sun); sun.intensity = env.sunI
    torreMats.forEach((m) => { m.emissiveIntensity = 0.25 + env.luz * 0.9 })
    luzTimon.intensity = 60 + env.luz * 260
    halo.material.opacity = 0.22 + env.glow * 0.3

    // timón
    rueda.rotation.z = -t * 0.55 - reloj * 0.04

    // datos por los caminos
    const pa = partGeo.attributes.position.array
    particulas.forEach((p, i) => {
      let f = (p.f + p.v * (t * 0.9 + reloj * 0.35)) % 1
      if (p.dentro) f = 1 - f
      const r = lerp(p.r0, p.r1, f)
      pa[i * 3] = Math.cos(p.ang) * r; pa[i * 3 + 1] = 0.5; pa[i * 3 + 2] = Math.sin(p.ang) * r
    })
    partGeo.attributes.position.needsUpdate = true

    // capítulo 02: el menú flota
    menu.position.y = 15 + Math.sin(reloj * 0.8) * 0.3

    // capítulo 03: los portales solo se abren mientras entran leads
    const abiertos = smooth(3.6, 3.9, t) * (1 - smooth(5.0, 5.3, t))
    portales.forEach((pg) => { pg.visible = abiertos > 0.001; pg.scale.setScalar(Math.max(0.001, abiertos)) })

    // capítulo 03: orbes y tarjetas de lead
    leads.forEach((l, i) => {
      const vuelo = smooth(l.llega - 0.4, l.llega, t)
      const ob = orbes[i]
      ob.o.visible = vuelo > 0 && vuelo < 1
      if (ob.o.visible) ob.curva.getPoint(vuelo, ob.o.position)
      const llegado = smooth(l.llega - 0.04, l.llega + 0.06, t)
      l.m.material.opacity = llegado
      let col = 0
      for (let c = 1; c <= l.hasta; c++) col += smooth(l.llega + 0.08 + c * 0.16, l.llega + 0.2 + c * 0.16, t)
      const x = lerp(COLX[Math.floor(col)], COLX[Math.min(3, Math.floor(col) + 1)], col - Math.floor(col))
      // posición en la columna: los que van por delante en la misma columna
      const fila = leads.filter((o, j) => j < i && Math.round(o.colActual ?? 0) === Math.round(col)).length
      l.colActual = col
      l.m.position.set(x, 2.35 - fila * 1.5, 0.05 + i * 0.002)
    })

    // capítulo 04: agentes y memoria
    const enMesa = smooth(4.95, 5.3, t)
    rayos.material.opacity = enMesa * (1 - smooth(5.95, 6.2, t)) * 0.85
    memoria.rotation.y = reloj * 0.4 + t * 0.6
    memoria.userData.red.rotation.x = reloj * 0.25
    memoria.position.y = 6.4 + Math.sin(reloj * 1.3) * 0.25
    luzMesa.intensity = 40 + enMesa * 160
    bots.forEach((b) => { b.cabeza.position.y = 3.75 + Math.sin(reloj * 2 + b.fase) * 0.06 })
    // el guion vuela de la mesa al roadmap
    const vg = smooth(5.8, 6.25, t)
    guion.visible = vg > 0.001 && vg < 0.999
    if (guion.visible) {
      const a = bots[0].g.position.clone().setY(4.5)
      roadmap.localToWorld(tmp2.set(celdaPos[0][0], celdaPos[0][1], 0.3))
      tmp.lerpVectors(a, tmp2, vg)
      tmp.y += Math.sin(vg * Math.PI) * 14
      guion.position.copy(tmp)
      guion.lookAt(camera.position)
      guion.rotateZ(vg * 6)
    }

    // capítulo 05: celdas del roadmap y el vídeo que se ordena
    const llenas = Math.floor(42 * smooth(6.0, 6.6, t) + 0.0001)
    celdaPos.forEach(([x, y], i) => {
      const k = i < llenas ? 1 : (i === llenas ? (42 * smooth(6.0, 6.6, t)) % 1 : 0)
      s3.set(Math.max(k, 0.0001), Math.max(k, 0.0001), 1)
      m4.compose(tmp.set(x, y, 0.06), q0, s3)
      celdas.setMatrixAt(i, m4)
    })
    celdas.instanceMatrix.needsUpdate = true
    const v1 = smooth(6.3, 6.55, t), v2 = smooth(6.6, 6.85, t)
    video.visible = v1 > 0.001 && t < 7.2
    if (video.visible) {
      const a = movil.position.clone().setY(7)
      const b = CARPETAS[0].ancla.clone().setY(3.4)
      const c = CARPETAS[1].ancla.clone().setY(3.4)
      tmp.lerpVectors(a, b, v1); tmp.y += Math.sin(v1 * Math.PI) * 5
      if (v2 > 0) { tmp.lerpVectors(b, c, v2); tmp.y += Math.sin(v2 * Math.PI) * 3 }
      video.position.copy(tmp)
      video.lookAt(camera.position)
    }

    // capítulo 06: barras y cifras del informe
    barras.forEach((b, i) => { b.scale.y = Math.max(0.001, b.userData.alt * smooth(6.95 + i * 0.035, 7.35 + i * 0.035, t)) })
    // Cifras fijas: el panel se ve de fondo en otros planos y un «0 €» parecería
    // un fallo; el movimiento lo ponen las barras.
    if (kpiK !== 1) { kpiK = 1; redibuja(informe.userData.tex, dibujaInforme(1)) }

    // capítulo 07: Claude
    const n = Math.floor(smooth(7.95, 8.6, t) * HERR.length + 0.0001)
    if (n !== claudeN) { claudeN = n; redibuja(terminal.userData.tex, dibujaTerminal(n)) }
    haz.material.opacity = smooth(8.0, 8.3, t) * (1 - smooth(8.9, 9.2, t)) * 0.55

    // cámara
    plano(t)
    const zona = encuadre(t)
    camera.position.copy(camPos)
    camera.lookAt(camTgt)
    sky.position.copy(camera.position)

    // sombras centradas en lo que se mira
    tmp.copy(camTgt).setY(0)
    tmp.x = Math.round(tmp.x / 4) * 4; tmp.z = Math.round(tmp.z / 4) * 4
    sun.target.position.copy(tmp)
    sun.position.copy(tmp).addScaledVector(env.dir, 400)

    renderer.render(scene, camera)
    pintaEtiquetas(t, zona)
    if (!listo) { listo = true; canvas.classList.add('is-lista') }
  }

  function pintaEtiquetas(t, zona) {
    lbls.forEach((l) => {
      let a = l.ventana(t)
      const html = a > 0.01 ? l.html() : l.ultimo
      if (html !== l.ultimo) { l.el.innerHTML = html; l.ultimo = html }
      tmp.copy(l.ancla).project(camera)
      let vis = a > 0.01 && tmp.z < 1 && Math.abs(tmp.x) < 1.15 && Math.abs(tmp.y) < 1.15
      const x = (tmp.x + 1) / 2 * W, y = (1 - tmp.y) / 2 * H
      if (vis && zona > 0) {
        const fuera = vertical ? 1 - smooth(H * 0.36, H * 0.46, y) : smooth(W * 0.42, W * 0.5, x)
        a *= 1 - zona * (1 - fuera)
        vis = a > 0.01
      }
      if (!vis) { if (l.el.style.opacity !== '0') l.el.style.opacity = '0'; return }
      l.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`
      l.el.style.opacity = a.toFixed(3)
    })
  }

  return {
    render,
    // Mismo contrato que montarEscena: una función que devuelve el traductor.
    idioma(nuevoGetT) { T = nuevoGetT(); textos(); lbls.forEach((l) => { l.ultimo = '' }) },
    dispose() {
      window.removeEventListener('resize', tamano)
      lbls.forEach((l) => l.el.remove())
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose()
        const ms = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : [])
        ms.forEach((m) => { m.map?.dispose?.(); m.emissiveMap?.dispose?.(); m.dispose() })
      })
      scene.environment?.dispose()
      renderer.dispose()
    },
  }
}
