// HELM — prueba local del Editor de reels (api/_lib/editor/), con el ffmpeg
// de esta máquina y SIN Whisper: las palabras salen de un JSON.
//
//   node scripts/prueba-editor.mjs                         → vídeo y palabras sintéticos
//   node scripts/prueba-editor.mjs <video> <palabras.json> → los tuyos ([{ w, a, b }])
//   opciones: --conservar (no borra nada) · --dir <carpeta> (por defecto, una temporal)
//
// Sin argumentos genera un vídeo de 20 s (720×1280, 30 fps, con un tono de
// fondo) cuya imagen es un gris que se aclara con el tiempo: la luz de cada
// fotograma dice de qué segundo del original viene. Las palabras de prueba
// tienen una toma repetida («Esta IA hace que tu negocio venda más» dos veces;
// la segunda sigue con «porque…»), una muletilla suelta y silencios largos.
// Monta tres casos —con audio, sin audio y grabado «girado» como un móvil— y
// comprueba con ffprobe y leyendo la luz de los fotogramas:
//   · 1080×1920, 30 fps, H.264 High yuv420p, AAC 48 kHz estéreo, sin metadatos
//   · la duración que dice el plan
//   · cada trozo del editado viene del segundo del original que toca, y NINGÚN
//     fotograma viene de la toma que se quitó
//   · la voz, a -16 LUFS (±1,5)
//   · los subtítulos (solo si este ffmpeg tiene libass: el filtro `ass`)
// No toca la base de datos ni nada del servidor.
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { planDeEdicion } from '../api/_lib/editor/plan.js'
import { assDe } from '../api/_lib/editor/subtitulos.js'
import { renderiza } from '../api/_lib/editor/render.js'
import { sondea } from '../api/_lib/variantes.js'
import { normalizaEstilo } from '../src/agents/editor/estilo.js'

const FFMPEG = process.env.HELM_FFMPEG || 'ffmpeg'
const FFPROBE = process.env.HELM_FFPROBE || 'ffprobe'
const argv = process.argv.slice(2)
const conservar = argv.includes('--conservar')
const iDir = argv.indexOf('--dir')
const sueltos = argv.filter((a, i) => !a.startsWith('--') && i !== iDir + 1)
const DIR = iDir >= 0 ? path.resolve(argv[iDir + 1]) : fs.mkdtempSync(path.join(os.tmpdir(), 'helm-prueba-editor-'))

function corre(bin, args, { binario = false } = {}) {
  const r = spawnSync(bin, args, { encoding: binario ? 'buffer' : 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (r.status !== 0) throw new Error(`${bin} ${args.slice(0, 8).join(' ')}…: ${String(r.stderr).slice(-600)}`)
  return binario ? r.stdout : r.stdout + r.stderr
}
const ffprobeJson = (ruta) => JSON.parse(corre(FFPROBE, ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', ruta]))
const hayLibass = / ass +V->V/.test(corre(FFMPEG, ['-hide_banner', '-filters']))

// ── Lo sintético ────────────────────────────────────────────────────────────
// La luz: Y = 16 + 8·t (t en segundos del original). Se lee arriba, lejos de
// los subtítulos, y se calibra con el propio original (recta por mínimos
// cuadrados): así da igual lo que redondee el códec.
const TOMA_QUITADA = [0.8, 3.5]

function dice(texto, desde, paso = 0.34) {
  return texto.split(' ').map((w, i) => ({ w, a: +(desde + i * paso).toFixed(3), b: +(desde + i * paso + paso - 0.05).toFixed(3), p: 0.9 }))
}
const PALABRAS = [
  ...dice('Esta IA hace que tu negocio venda más.', 0.8),                                                   // toma 1: fuera
  ...dice('Eh…', 4.5, 0.3),                                                                                 // muletilla: fuera
  ...dice('Esta IA hace que tu negocio venda más porque responde a tus clientes al momento.', 5.6),       // toma 2: va
  ...dice('Y lo mejor: trabaja mientras duermes.', 12.5, 0.35),                                            // tras 1,8 s de silencio
  ...dice('Comenta IA y te paso el enlace.', 14.9),                                                        // tras 0,3 s: se queda igual
]

async function genera() {
  const base = path.join(DIR, 'original.mp4')
  corre(FFMPEG, ['-v', 'error', '-y',
    '-f', 'lavfi', '-i', 'color=c=black:s=720x1280:r=30:d=20,format=yuv420p,geq=lum=\'16+8*T\':cb=128:cr=128',
    '-f', 'lavfi', '-i', 'sine=frequency=330:sample_rate=44100:duration=20',
    '-metadata', 'title=fuente con metadatos', '-metadata', 'comment=esto no debe salir',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ac', '1', '-shortest', base])
  const sinAudio = path.join(DIR, 'original-sin-audio.mp4')
  corre(FFMPEG, ['-v', 'error', '-y', '-i', base, '-an', '-c', 'copy', sinAudio])
  // Como graba un móvil: la imagen apaisada con la rotación en los metadatos.
  const apaisada = path.join(DIR, 'apaisada.mp4')
  const girada = path.join(DIR, 'original-girada.mp4')
  corre(FFMPEG, ['-v', 'error', '-y', '-i', base, '-vf', 'transpose=2', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-c:a', 'copy', apaisada])
  let hayGirada = true
  try { corre(FFMPEG, ['-v', 'error', '-y', '-display_rotation:v:0', '90', '-i', apaisada, '-c', 'copy', girada]) }
  catch { hayGirada = false; console.warn('Este ffmpeg no tiene -display_rotation: me salto el caso girado') }
  await fsp.rm(apaisada, { force: true })
  return [
    { nombre: 'con audio', ruta: base, palabras: PALABRAS, sintetico: true },
    { nombre: 'sin audio', ruta: sinAudio, palabras: PALABRAS, sintetico: true },
    ...(hayGirada ? [{ nombre: 'móvil girado', ruta: girada, calibrado: base, palabras: PALABRAS, sintetico: true, tamano: [720, 1280] }] : []),
  ]
}

/**
 * La luz (Y, sin convertir) arriba en el centro, cada 8 fotogramas: [{ t, y }].
 * Se eligen fotogramas por número (no con el filtro fps, que adelanta o
 * atrasa medio intervalo), así t es exacto. `fps` es el del archivo.
 */
function luces(ruta, fps = 30) {
  const { ancho } = { ancho: Number(ffprobeJson(ruta).streams.find(x => x.codec_type === 'video').width) }
  const buf = corre(FFMPEG, ['-v', 'error', '-i', ruta, '-vf', `select='not(mod(n\\,8))',crop=16:16:${Math.round(ancho / 2) - 8}:280,extractplanes=y,scale=1:1:flags=area`,
    '-fps_mode', 'passthrough', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { binario: true })
  return [...buf].map((y, i) => ({ t: (i * 8) / fps, y }))
}

/** La recta luz → segundo, sacada del original. */
function calibra(original) {
  const m = luces(original)
  const n = m.length
  const st = m.reduce((s, x) => s + x.t, 0); const sy = m.reduce((s, x) => s + x.y, 0)
  const stt = m.reduce((s, x) => s + x.t * x.t, 0); const sty = m.reduce((s, x) => s + x.t * x.y, 0)
  const pendiente = (n * sty - st * sy) / (n * stt - st * st)
  const corte = (sy - pendiente * st) / n
  return (y) => (y - corte) / pendiente
}

/** ¿Se ve el color de resalte (amarillo: U bajo) donde van los subtítulos en ese instante? */
function haySubtitulo(ruta, t, y) {
  const buf = corre(FFMPEG, ['-v', 'error', '-ss', String(t), '-i', ruta, '-frames:v', '1',
    '-vf', `crop=830:140:100:${Math.round(y - 70)},format=yuv444p,extractplanes=u`, '-f', 'rawvideo', '-'], { binario: true })
  return Math.min(...buf) < 90
}

function loudness(ruta) {
  const r = spawnSync(FFMPEG, ['-hide_banner', '-nostats', '-i', ruta, '-af', 'ebur128', '-f', 'null', '-'], { encoding: 'utf8' })
  const m = [...String(r.stderr).matchAll(/I:\s+(-?[\d.]+) LUFS/g)].at(-1)
  return m ? Number(m[1]) : null
}

async function prueba(c) {
  const info = await sondea(c.ruta)
  const estilo = normalizaEstilo({ subtitulos: hayLibass })
  const plan = planDeEdicion({ info, palabras: info.audio ? c.palabras : [], estilo })
  const ass = plan.bloques.length ? path.join(DIR, `${c.nombre.replace(/\W+/g, '-')}.ass`) : null
  if (ass) await fsp.writeFile(ass, assDe(plan.bloques, estilo))
  const salida = path.join(DIR, `editado-${c.nombre.replace(/\W+/g, '-')}.mp4`)
  const t0 = Date.now()
  let ultimo = 0
  const r = await renderiza({ entrada: c.ruta, salida, plan, ass, alProgreso: (f) => { ultimo = f } })
  const tarda = (Date.now() - t0) / 1000

  const j = ffprobeJson(salida)
  const v = j.streams.find(x => x.codec_type === 'video')
  const a = j.streams.find(x => x.codec_type === 'audio')
  const dur = Number(j.format.duration)
  const etiquetas = [
    ...Object.keys(j.format.tags || {}).filter(k => !['major_brand', 'minor_version', 'compatible_brands'].includes(k)),
    ...j.streams.flatMap(x => Object.entries(x.tags || {})
      .filter(([k, val]) => ['title', 'comment', 'creation_time', 'location'].includes(k) || (k === 'encoder' && /\d+\.\d+/.test(val))).map(([k]) => k)),
  ]
  const checks = {
    'fuente bien leída': !c.tamano || (info.ancho === c.tamano[0] && info.alto === c.tamano[1]),
    '1080×1920': v.width === 1080 && v.height === 1920,
    '30 fps': v.r_frame_rate === '30/1' && v.avg_frame_rate === '30/1',
    'h264 high yuv420p': v.codec_name === 'h264' && v.profile === 'High' && v.pix_fmt === 'yuv420p',
    audio: info.audio ? Boolean(a && a.codec_name === 'aac' && a.sample_rate === '48000' && a.channels === 2) : !a,
    duración: Math.abs(dur - plan.duracionFinal) < 0.12,
    'sin metadatos': etiquetas.length === 0,
    'faststart (moov delante)': fs.readFileSync(salida).subarray(0, 64 * 1024).includes(Buffer.from('moov')),
    progreso: ultimo > 0.9,
  }
  let lufs = null
  if (info.audio) {
    lufs = loudness(salida)
    checks['-16 LUFS'] = lufs != null && Math.abs(lufs - plan.audio.loudnorm.I) <= 1.5
  }
  if (c.sintetico) {
    // De qué segundo del original viene cada instante del editado.
    const fuente = (t) => {
      let o = 0
      for (const tr of plan.tramos) {
        const d = tr.b - tr.a
        if (t < o + d) return tr.a + (t - o)
        o += d
      }
      return null
    }
    const deLuz = calibra(c.calibrado || c.ruta)
    const medidas = luces(salida).filter(m => m.t < plan.duracionFinal - 0.1)
    const lejos = medidas.filter(m => {
      const esperado = fuente(m.t)
      return esperado != null && Math.abs(deLuz(m.y) - esperado) > 0.25
    })
    checks['cada trozo, de su sitio'] = medidas.length > 10 && lejos.length === 0
    if (lejos.length) console.warn(c.nombre, 'fotogramas fuera de sitio:', lejos.slice(0, 5).map(m => `${m.t.toFixed(2)} s → ${deLuz(m.y).toFixed(2)} (tocaba ${fuente(m.t).toFixed(2)})`).join(' · '))
    if (info.audio) {
      const deLaToma = medidas.filter(m => deLuz(m.y) > TOMA_QUITADA[0] + 0.2 && deLuz(m.y) < TOMA_QUITADA[1] - 0.2)
      checks['la toma quitada no está'] = deLaToma.length === 0
    }
    if (plan.bloques.length) {
      const bl = plan.bloques[Math.floor(plan.bloques.length / 2)]
      checks.subtítulos = haySubtitulo(salida, (bl.a + bl.b) / 2, 1920 * estilo.posicion / 100)
    }
  }
  const mal = Object.entries(checks).filter(([, ok]) => !ok).map(([k]) => k)
  return {
    fila: {
      caso: c.nombre,
      'original s': info.duracion.toFixed(2),
      'plan s': plan.duracionFinal.toFixed(2),
      'sale s': dur.toFixed(2),
      tramos: plan.tramos.length,
      quitado: plan.quitado.map(q => q.motivo).join('+') || '—',
      subtítulos: plan.bloques.length ? `${plan.bloques.length} bloques` : (hayLibass || !info.audio ? 'no' : 'sin libass'),
      LUFS: lufs == null ? '—' : lufs.toFixed(1),
      MB: (r.bytes / 1048576).toFixed(2),
      'tarda s': tarda.toFixed(1),
      resultado: mal.length ? `FALLA: ${mal.join(', ')}${etiquetas.length ? ` (${etiquetas.join(', ')})` : ''}` : 'ok',
    },
    fallos: mal.length,
  }
}

async function main() {
  await fsp.mkdir(DIR, { recursive: true })
  let casos
  if (sueltos.length >= 2) {
    const palabras = JSON.parse(await fsp.readFile(sueltos[1], 'utf8'))
    casos = [{ nombre: path.basename(sueltos[0]), ruta: path.resolve(sueltos[0]), palabras: Array.isArray(palabras) ? palabras : palabras.palabras }]
  } else {
    casos = await genera()
  }
  if (!hayLibass) console.warn('Este ffmpeg no tiene libass (filtro `ass`): monto SIN subtítulos. El servidor sí lo tiene.')
  let fallos = 0
  const filas = []
  for (const c of casos) {
    const r = await prueba(c)
    filas.push(r.fila)
    fallos += r.fallos
  }
  console.table(filas)
  if (!conservar && iDir < 0) await fsp.rm(DIR, { recursive: true, force: true })
  else console.log(`Archivos en ${DIR}`)
  if (fallos) { console.error(`${fallos} comprobaciones fallidas`); process.exit(1) }
  console.log('Todo bien.')
}

main().catch(async (e) => {
  console.error(e)
  if (!conservar && iDir < 0) await fsp.rm(DIR, { recursive: true, force: true })
  process.exit(1)
})
