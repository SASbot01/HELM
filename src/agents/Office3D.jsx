// HELM — La oficina del equipo de agentes, en 3D (Three.js).
//
// Una sala cálida low-poly: cada agente es un personaje en su escritorio, con su
// chapa de nombre y una burbuja de estado (trabajando · hecho · reposo · error).
// Se construye una sola vez al montar; los estados se actualizan en caliente
// (sin reconstruir la escena ni mover la cámara) cuando cambian los datos.
//
// La disposición (posiciones, colores, pelo) es fija por agente; el estado y lo
// que hace vienen de arriba. Se pinta en vivo la pantalla del monitor y la luz
// que tiñe al personaje con el color de su estado. Pinchar un agente lo elige.
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

// Plantilla de la oficina. El orden lee el flujo: director al fondo, los cinco
// que miran en medio, el guionista delante y la pareja de los lunes a su lado.
export const ROSTER = [
  { k: 'director', nombre: 'Director', color: 0xd9b66b, pelo: 0x2a2320, pos: [0, -3], rot: 0 },
  { k: 'investigador', nombre: 'Investigador', color: 0x7aa5f8, pelo: 0x3a2a1d, pos: [-6, 0.2], rot: 0 },
  { k: 'analista', nombre: 'Analista', color: 0x4ade80, pelo: 0x1d1915, pos: [-3, -0.1], rot: 0 },
  { k: 'productor', nombre: 'Productor', color: 0xe0894a, pelo: 0x4a3520, pos: [0, 0.2], rot: 0 },
  { k: 'comercial', nombre: 'Comercial', color: 0xe86fa6, pelo: 0x2a2320, pos: [3, -0.1], rot: 0 },
  { k: 'informe', nombre: 'Informe', color: 0xb08bdd, pelo: 0x161310, pos: [6, 0.2], rot: 0 },
  { k: 'guionista', nombre: 'Guionista', color: 0xd9b66b, pelo: 0x4a3520, pos: [-3, 3.4], rot: Math.PI },
  { k: 'programador', nombre: 'Programador', color: 0x7aa5f8, pelo: 0x2a2320, pos: [3, 3.4], rot: Math.PI, lunes: true },
  { k: 'virales', nombre: 'Virales', color: 0x4ade80, pelo: 0x3a2a1d, pos: [6, 3.4], rot: Math.PI, lunes: true },
]

const EST_COLOR = { working: 0x7aa5f8, done: 0x4ade80, idle: 0x4b4b55, error: 0xe4362b }
const EST_CSS = { working: '#7aa5f8', done: '#4ade80', idle: '#6b6b73', error: '#e4362b' }

const roundRect = (g, x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath() }

function etiquetaTex(nombre, estado) {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 96
  const g = cv.getContext('2d')
  g.font = 'bold 30px ui-sans-serif,system-ui,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'
  const w = Math.min(236, g.measureText(nombre).width + 44)
  g.fillStyle = 'rgba(20,20,26,.92)'; roundRect(g, (256 - w) / 2, 30, w, 46, 10); g.fill()
  g.strokeStyle = 'rgba(255,255,255,.14)'; g.lineWidth = 2; g.stroke()
  g.fillStyle = EST_CSS[estado] || '#6b6b73'; g.beginPath(); g.arc((256 - w) / 2 + 18, 53, 7, 0, 7); g.fill()
  g.fillStyle = '#eaeaec'; g.fillText(nombre, 138, 54)
  const tex = new THREE.CanvasTexture(cv); tex.anisotropy = 4
  return tex
}
function iconoTex(estado) {
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 128
  const g = cv.getContext('2d')
  g.fillStyle = EST_CSS[estado] || '#6b6b73'; g.beginPath(); g.arc(64, 64, 38, 0, 7); g.fill()
  g.strokeStyle = 'rgba(13,13,14,.9)'; g.lineWidth = 7; g.stroke()
  g.fillStyle = '#0d0d0e'; g.textAlign = 'center'; g.textBaseline = 'middle'
  if (estado === 'done') { g.strokeStyle = '#0d0d0e'; g.lineWidth = 9; g.lineCap = 'round'; g.beginPath(); g.moveTo(45, 66); g.lineTo(58, 80); g.lineTo(84, 48); g.stroke() }
  else if (estado === 'error') { g.font = 'bold 70px sans-serif'; g.fillText('!', 64, 62) }
  else if (estado === 'working') { g.font = 'bold 60px sans-serif'; g.fillText('•••', 64, 50) }
  else { g.font = 'bold 58px sans-serif'; g.fillText('z', 64, 64) }
  const tex = new THREE.CanvasTexture(cv); tex.anisotropy = 4
  return tex
}

// Construye la escena en el contenedor y devuelve { setEstados, dispose }.
function construir(container, onPick, estadosIniciales) {
  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.25
  container.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x14110f)
  scene.fog = new THREE.Fog(0x14110f, 26, 52)

  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200)
  camera.position.set(13, 10, 16)

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true; controls.dampingFactor = 0.08
  controls.target.set(0, 1.8, 0.3)
  controls.minDistance = 11; controls.maxDistance = 32
  controls.maxPolarAngle = Math.PI * 0.49; controls.minPolarAngle = Math.PI * 0.22
  controls.autoRotate = true; controls.autoRotateSpeed = 0.22
  controls.enablePan = false

  scene.add(new THREE.HemisphereLight(0xffe8c6, 0x241f1a, 0.9))
  scene.add(new THREE.AmbientLight(0xffffff, 0.18))
  const sun = new THREE.DirectionalLight(0xffd59a, 2.3)
  sun.position.set(-12, 18, 9); sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.camera.left = -16; sun.shadow.camera.right = 16; sun.shadow.camera.top = 16; sun.shadow.camera.bottom = -16
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 50; sun.shadow.bias = -0.0004; sun.shadow.radius = 4
  scene.add(sun)
  const fill = new THREE.DirectionalLight(0x9ab6f8, 0.5); fill.position.set(13, 7, -9); scene.add(fill)
  const rim = new THREE.DirectionalLight(0xffb060, 0.7); rim.position.set(2, 6, -14); scene.add(rim)
  const amb = new THREE.PointLight(0xffcf95, 0.6, 30); amb.position.set(0, 7, 2); scene.add(amb)

  const disposables = []
  const mat = (c, o = {}) => { const m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, metalness: 0, ...o }); disposables.push(m); return m }
  const geo = (g) => { disposables.push(g); return g }

  // Suelo, alfombra y paredes
  const floor = new THREE.Mesh(geo(new THREE.PlaneGeometry(40, 32)), mat(0x6a4e30, { roughness: 0.88 }))
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor)
  for (let i = -9; i <= 9; i++) { const l = new THREE.Mesh(geo(new THREE.BoxGeometry(0.05, 0.01, 30)), mat(0x4a3420)); l.position.set(i * 2, 0.011, 0); scene.add(l) }
  const rug = new THREE.Mesh(geo(new THREE.PlaneGeometry(16, 11)), mat(0x5a3f52, { roughness: 1 }))
  rug.rotation.x = -Math.PI / 2; rug.position.set(0, 0.02, 0.8); rug.receiveShadow = true; scene.add(rug)
  const rug2 = new THREE.Mesh(geo(new THREE.PlaneGeometry(14.4, 9.6)), mat(0x4a3244, { roughness: 1 }))
  rug2.rotation.x = -Math.PI / 2; rug2.position.set(0, 0.025, 0.8); scene.add(rug2)
  const wallMat = mat(0x262129, { roughness: 1 })
  const backW = new THREE.Mesh(geo(new THREE.BoxGeometry(40, 16, 0.4)), wallMat); backW.position.set(0, 8, -10); backW.receiveShadow = true; scene.add(backW)
  const leftW = new THREE.Mesh(geo(new THREE.BoxGeometry(0.4, 16, 32)), wallMat); leftW.position.set(-14, 8, 0); leftW.receiveShadow = true; scene.add(leftW)
  const win = new THREE.Mesh(geo(new THREE.BoxGeometry(8, 5, 0.2)), mat(0xffdca6, { emissive: 0xffcf8a, emissiveIntensity: 0.9, roughness: 0.6 }))
  win.position.set(-4, 9, -9.78); scene.add(win)
  const winFrame = new THREE.Mesh(geo(new THREE.BoxGeometry(8.6, 5.6, 0.2)), mat(0x0f0f13)); winFrame.position.set(-4, 9, -9.85); scene.add(winFrame)
  const clock = new THREE.Mesh(geo(new THREE.CircleGeometry(1, 24)), mat(0xf0ead6)); clock.position.set(7, 10, -9.77); scene.add(clock)
  const board = new THREE.Mesh(geo(new THREE.BoxGeometry(4, 2.4, 0.1)), mat(0xf0ead6)); board.position.set(0, 3.4, -9.7); scene.add(board)
  const boardFr = new THREE.Mesh(geo(new THREE.BoxGeometry(4.3, 2.7, 0.08)), mat(0x3a2b1b)); boardFr.position.set(0, 3.4, -9.76); scene.add(boardFr)

  function planta(x, z) {
    const grp = new THREE.Group()
    const pot = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.5, 0.38, 0.8, 10)), mat(0x8a4a33)); pot.position.y = 0.4; pot.castShadow = true; grp.add(pot)
    for (let i = 0; i < 5; i++) { const leaf = new THREE.Mesh(geo(new THREE.ConeGeometry(0.28, 1.6, 6)), mat(0x3f7d4a)); leaf.position.set((Math.random() - 0.5) * 0.5, 1.3, (Math.random() - 0.5) * 0.5); leaf.rotation.set((Math.random() - 0.5) * 0.6, 0, (Math.random() - 0.5) * 0.6); leaf.castShadow = true; grp.add(leaf) }
    grp.position.set(x, 0, z); scene.add(grp)
  }
  planta(-12.5, -8); planta(12.5, 6); planta(12.5, -8)

  // Un puesto de trabajo con su personaje
  const picables = []
  const estaciones = []
  const piel = () => mat(0xd7a98a, { roughness: 0.7 })
  for (const a of ROSTER) {
    const estado = estadosIniciales[a.k] || 'idle'
    const g = new THREE.Group()
    g.position.set(a.pos[0], 0, a.pos[1]); g.rotation.y = a.rot || 0

    const top = new THREE.Mesh(geo(new THREE.BoxGeometry(2.6, 0.16, 1.4)), mat(0x6b4d2e, { roughness: 0.55 })); top.position.y = 1.5; top.castShadow = top.receiveShadow = true; g.add(top)
    for (const sx of [-1.1, 1.1]) for (const sz of [-0.55, 0.55]) { const leg = new THREE.Mesh(geo(new THREE.BoxGeometry(0.14, 1.5, 0.14)), mat(0x3f2d1a)); leg.position.set(sx, 0.75, sz); leg.castShadow = true; g.add(leg) }

    const screenMat = new THREE.MeshStandardMaterial({ color: 0x0b0b0d, emissive: EST_COLOR[estado], emissiveIntensity: estado === 'idle' ? 0.3 : 1.4, roughness: 0.35 })
    disposables.push(screenMat)
    const monitor = new THREE.Group()
    monitor.add(new THREE.Mesh(geo(new THREE.BoxGeometry(1.5, 0.95, 0.07)), mat(0x0d0d10)))
    const screen = new THREE.Mesh(geo(new THREE.PlaneGeometry(1.34, 0.8)), screenMat); screen.position.z = 0.045; monitor.add(screen)
    const stand = new THREE.Mesh(geo(new THREE.BoxGeometry(0.12, 0.4, 0.12)), mat(0x222228)); stand.position.y = -0.63; monitor.add(stand)
    const standBase = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.28, 0.3, 0.06, 12)), mat(0x1a1a20)); standBase.position.y = -0.83; monitor.add(standBase)
    monitor.position.set(0, 2.2, -0.3); monitor.rotation.x = 0.06; monitor.rotation.y = a.rot ? 0.5 : -0.5; g.add(monitor)

    const glow = new THREE.PointLight(EST_COLOR[estado], estado === 'idle' ? 0.2 : 1.1, 5.5); glow.position.set(0, 2.3, 0.35); g.add(glow)
    const kb = new THREE.Mesh(geo(new THREE.BoxGeometry(1.1, 0.06, 0.42)), mat(0x1a1a1f)); kb.position.set(0, 1.62, 0.35); g.add(kb)
    const seat = new THREE.Mesh(geo(new THREE.BoxGeometry(0.95, 0.16, 0.9)), mat(0x26262c)); seat.position.set(0, 1.0, 1.15); seat.castShadow = true; g.add(seat)
    const back = new THREE.Mesh(geo(new THREE.BoxGeometry(0.95, 1.0, 0.14)), mat(0x26262c)); back.position.set(0, 1.5, 1.55); g.add(back)

    const per = new THREE.Group(); per.position.set(0, 0, 0.95)
    const torso = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.42, 0.5, 1.0, 8)), mat(a.color, { roughness: 0.6 })); torso.position.y = 1.85; torso.castShadow = true; per.add(torso)
    const head = new THREE.Mesh(geo(new THREE.SphereGeometry(0.36, 16, 16)), piel()); head.position.y = 2.6; head.castShadow = true; per.add(head)
    const hair = new THREE.Mesh(geo(new THREE.SphereGeometry(0.385, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.62)), mat(a.pelo || 0x2a2320)); hair.position.y = 2.64; per.add(hair)
    const armL = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.12, 0.12, 0.9, 6)), mat(a.color, { roughness: 0.6 })); armL.position.set(-0.4, 1.75, -0.35); armL.rotation.set(1.15, 0, 0.15); armL.castShadow = true; per.add(armL)
    const armR = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.12, 0.12, 0.9, 6)), mat(a.color, { roughness: 0.6 })); armR.position.set(0.4, 1.75, -0.35); armR.rotation.set(1.15, 0, -0.15); armR.castShadow = true; per.add(armR)
    g.add(per)

    const etTex = etiquetaTex(a.nombre, estado); disposables.push(etTex)
    const etMat = new THREE.SpriteMaterial({ map: etTex, transparent: true, depthTest: false }); disposables.push(etMat)
    const et = new THREE.Sprite(etMat); et.scale.set(3.4, 1.28, 1); et.position.set(0, 4.0, 0.7); et.renderOrder = 10; g.add(et)

    const icTex = iconoTex(estado); disposables.push(icTex)
    const icMat = new THREE.SpriteMaterial({ map: icTex, transparent: true, depthTest: false }); disposables.push(icMat)
    const icono = new THREE.Sprite(icMat); icono.scale.set(0.82, 0.82, 1); icono.position.set(0.55, 3.45, 0.7); icono.renderOrder = 11; g.add(icono)

    const st = { a, estado, screenMat, glow, per, armL, armR, head, etMat, icMat, seed: Math.random() * 6 }
    g.userData.st = st
    g.traverse(o => { if (o.isMesh) { o.userData.st = st; picables.push(o) } })
    scene.add(g); estaciones.push(st)
  }

  // Interacción: pinchar (no arrastrar) elige un agente
  const ray = new THREE.Raycaster(), mouse = new THREE.Vector2()
  let down = null
  const onDown = (e) => { down = { x: e.clientX, y: e.clientY } }
  const onUp = (e) => {
    if (!down) return
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y); down = null
    if (moved > 6) return
    const r = renderer.domElement.getBoundingClientRect()
    mouse.x = ((e.clientX - r.left) / r.width) * 2 - 1
    mouse.y = -((e.clientY - r.top) / r.height) * 2 + 1
    ray.setFromCamera(mouse, camera)
    const hit = ray.intersectObjects(picables, false)[0]
    if (hit) onPick(hit.object.userData.st.a.k)
  }
  renderer.domElement.addEventListener('pointerdown', onDown)
  renderer.domElement.addEventListener('pointerup', onUp)

  function setEstado(st, estado) {
    if (st.estado === estado) return
    st.estado = estado
    st.screenMat.emissive.setHex(EST_COLOR[estado]); st.screenMat.emissiveIntensity = estado === 'idle' ? 0.3 : 1.4
    st.glow.color.setHex(EST_COLOR[estado]); st.glow.intensity = estado === 'idle' ? 0.2 : 1.1
    st.etMat.map.dispose(); st.etMat.map = etiquetaTex(st.a.nombre, estado); st.etMat.needsUpdate = true
    st.icMat.map.dispose(); st.icMat.map = iconoTex(estado); st.icMat.needsUpdate = true
    // vuelve a su sitio por si venía de un estado con animación
    st.per.position.set(0, 0, 0.95)
  }

  // Bucle
  const clock3 = new THREE.Clock()
  function resize() {
    const w = container.clientWidth, h = container.clientHeight || 1
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix()
  }
  const ro = new ResizeObserver(resize); ro.observe(container); resize()

  let raf = 0
  function tick() {
    const t = clock3.getElapsedTime()
    for (const st of estaciones) {
      if (st.estado === 'working') {
        st.armL.rotation.x = 1.15 + Math.sin(t * 9 + st.seed) * 0.12
        st.armR.rotation.x = 1.15 + Math.sin(t * 9 + st.seed + 1) * 0.12
        st.head.position.y = 2.6 + Math.sin(t * 7 + st.seed) * 0.04
        st.screenMat.emissiveIntensity = 1.1 + Math.sin(t * 5 + st.seed) * 0.3
        st.glow.intensity = 0.95 + Math.sin(t * 5 + st.seed) * 0.25
      } else if (st.estado === 'error') {
        st.per.position.x = Math.sin(t * 22) * 0.03
        st.screenMat.emissiveIntensity = 1.0 + Math.sin(t * 12) * 0.4
      } else if (st.estado === 'idle') {
        st.per.position.y = Math.sin(t * 1.6 + st.seed) * 0.03
      }
    }
    controls.update(); renderer.render(scene, camera)
    raf = requestAnimationFrame(tick)
  }
  tick()

  return {
    setEstados(map) { for (const st of estaciones) setEstado(st, map[st.a.k] || 'idle') },
    dispose() {
      cancelAnimationFrame(raf); ro.disconnect(); controls.dispose()
      renderer.domElement.removeEventListener('pointerdown', onDown)
      renderer.domElement.removeEventListener('pointerup', onUp)
      for (const d of disposables) d.dispose?.()
      for (const st of estaciones) { st.etMat.map?.dispose?.(); st.icMat.map?.dispose?.() }
      renderer.dispose()
      if (renderer.domElement.parentNode === container) container.removeChild(renderer.domElement)
    },
  }
}

export default function Office3D({ estados = {}, onSelect }) {
  const ref = useRef(null)
  const apiRef = useRef(null)
  const pickRef = useRef(onSelect); pickRef.current = onSelect
  const estRef = useRef(estados); estRef.current = estados

  useEffect(() => {
    if (!ref.current) return undefined
    let api
    try { api = construir(ref.current, k => pickRef.current?.(k), estRef.current) }
    catch (e) { console.error('[Office3D]', e); return undefined }
    apiRef.current = api
    return () => { api.dispose(); apiRef.current = null }
  }, [])

  useEffect(() => { apiRef.current?.setEstados(estados) }, [estados])

  return <div className="of3d" ref={ref} aria-label="La oficina del equipo de agentes" />
}
