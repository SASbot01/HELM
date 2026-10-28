// HELM — prueba local del montaje de Trial reels (api/_lib/variantes.js).
//
//   node scripts/prueba-variantes.mjs [ruta-de-un-mp4] [--conservar]
//
// Monta tres variantes (normal · avance + gancho · espejo + velocidad 1,06)
// de dos fuentes: el vídeo de muestra (1080×1920 con audio) y una copia a
// 720×1280 sin audio. Comprueba con ffprobe que salen a 1080×1920, 30 fps,
// H.264 high yuv420p, con audio AAC 48 kHz si la fuente lo tenía, sin
// metadatos y con la duración que toca (el avance suma su trozo y la
// velocidad acorta). Además mira un píxel del gancho al principio y cuando ya
// se ha ido.
//
// Si no hay vídeo de muestra, genera uno sintético con ffmpeg. Todo va en
// .prueba-variantes/ dentro del repo y se borra al acabar (salvo --conservar).
// No toca la base de datos ni Instagram.
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { procesaVariante, sondea, normalizaAjustes, tramos } from '../api/_lib/variantes.js'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIR = path.join(RAIZ, '.prueba-variantes')
const argv = process.argv.slice(2)
const conservar = argv.includes('--conservar')
const MUESTRA = argv.find(a => !a.startsWith('--')) || '/Volumes/reels-helm/proyecto/out/V1.mp4'
const FFMPEG = process.env.HELM_FFMPEG || 'ffmpeg'
const FFPROBE = process.env.HELM_FFPROBE || 'ffprobe'

function corre(bin, args) {
  const r = spawnSync(bin, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (r.status !== 0) throw new Error(`${bin} ${args.slice(0, 6).join(' ')}…: ${String(r.stderr).slice(-600)}`)
  return r.stdout
}
const ffprobeJson = (ruta) => JSON.parse(corre(FFPROBE, ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', ruta]))

/** Un píxel (x, y) del fotograma en el instante t, como [r, g, b]. */
function pixel(ruta, t, x, y) {
  const r = spawnSync(FFMPEG, ['-v', 'error', '-ss', String(t), '-i', ruta, '-frames:v', '1',
    '-vf', `crop=2:2:${x}:${y},scale=1:1`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1024 })
  if (r.status !== 0) throw new Error(String(r.stderr))
  return [...r.stdout.subarray(0, 3)]
}

async function main() {
  await fsp.rm(DIR, { recursive: true, force: true })
  await fsp.mkdir(DIR, { recursive: true })

  // ── Las fuentes ──
  let fuente = MUESTRA
  let sintetica = false
  if (!fs.existsSync(fuente)) {
    sintetica = true
    fuente = path.join(DIR, 'muestra-1080x1920.mp4')
    // 12 s, 29,97 fps, audio a 44,1 kHz: así se prueba también el paso a 30 fps y 48 kHz.
    corre(FFMPEG, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=1080x1920:rate=30000/1001:duration=12',
      '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100:duration=12',
      '-metadata', 'title=fuente con metadatos', '-metadata', 'comment=esto no debe salir',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ac', '2', '-shortest', fuente])
  }
  const sinAudio = path.join(DIR, 'muestra-720x1280-sin-audio.mp4')
  corre(FFMPEG, ['-v', 'error', '-y', '-i', fuente, '-vf', 'scale=720:1280', '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', sinAudio])
  // Como graba un móvil: la imagen apaisada (1280×720) con la rotación en los
  // metadatos, y audio mono a 44,1 kHz. Tiene que verse en vertical (720×1280).
  const apaisada = path.join(DIR, 'apaisada.mp4')
  const rotada = path.join(DIR, 'muestra-rotada.mp4')
  corre(FFMPEG, ['-v', 'error', '-y', '-i', fuente, '-vf', 'transpose=2,scale=1280:720', '-ac', '1', '-ar', '44100',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-c:a', 'aac', apaisada])
  let hayRotada = true
  try { corre(FFMPEG, ['-v', 'error', '-y', '-display_rotation:v:0', '90', '-i', apaisada, '-c', 'copy', rotada]) }
  catch { hayRotada = false; console.warn('Este ffmpeg no tiene -display_rotation: me salto la fuente rotada') }

  // El gancho de mentira: una caja verde opaca en el tercio de arriba, el resto transparente.
  const gancho = path.join(DIR, 'gancho.png')
  corre(FFMPEG, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=black:s=1080x1920',
    '-vf', "format=rgba,geq=r=0:g=255:b=0:a='255*between(X,140,940)*between(Y,320,580)'", '-frames:v', '1', gancho])

  const casos = [
    { nombre: 'normal', ajustes: { arranque: 'normal', recorte: 0, zoom: 1.03, desplX: 0, desplY: 0, velocidad: 1, color: 'neutro' } },
    { nombre: 'avance+gancho', gancho, ajustes: { arranque: 'avance', avanceEn: 6, avanceDur: 2.5, recorte: 0.5, zoom: 1.06, desplX: 0.4, desplY: -0.3, velocidad: 1.02, color: 'calido', ganchoDur: 2.5, conGancho: true } },
    { nombre: 'espejo+vel1.06', ajustes: { arranque: 'normal', recorte: 1, zoom: 1.1, desplX: -1, desplY: 1, velocidad: 1.06, color: 'contraste', espejo: true } },
  ]
  const fuentes = [
    { nombre: sintetica ? 'sintética 1080×1920 + audio' : path.basename(fuente), ruta: fuente, letra: 'a' },
    { nombre: '720×1280 sin audio', ruta: sinAudio, letra: 'b' },
    ...(hayRotada ? [{ nombre: 'móvil rotada, mono', ruta: rotada, letra: 'c', solo: ['normal'], tamano: [720, 1280] }] : []),
  ]

  let fallos = 0
  const filas = []
  for (const f of fuentes) {
    const infoFuente = await sondea(f.ruta)
    if (f.tamano && (infoFuente.ancho !== f.tamano[0] || infoFuente.alto !== f.tamano[1])) {
      fallos++
      console.error(`${f.nombre}: ffprobe dice ${infoFuente.ancho}×${infoFuente.alto} y debería ser ${f.tamano.join('×')}`)
    }
    for (const c of casos.filter(x => !f.solo || f.solo.includes(x.nombre))) {
      const ajustes = normalizaAjustes(c.ajustes, 'prueba')
      const salida = path.join(DIR, `${f.letra}-${c.nombre.replace(/[^a-z0-9]+/gi, '-')}.mp4`)
      const t0 = Date.now()
      const r = await procesaVariante({ entrada: f.ruta, salida, gancho: c.gancho || null, ajustes })
      const seg = ((Date.now() - t0) / 1000).toFixed(1)
      const j = ffprobeJson(salida)
      const v = j.streams.find(x => x.codec_type === 'video')
      const a = j.streams.find(x => x.codec_type === 'audio')
      const esperada = tramos(ajustes, infoFuente.duracion).salida
      const dur = Number(j.format.duration)
      const etiquetas = [
        ...Object.keys(j.format.tags || {}).filter(k => !['major_brand', 'minor_version', 'compatible_brands'].includes(k)),
        // ffmpeg 6.1 (el del servidor) escribe siempre «Lavc libx264» en el
        // vídeo aunque se le pida vacío. Sin versión es genérico (lo pone
        // cualquier programa con ffmpeg) y no dice nada: solo falla si queda
        // algo de la fuente o la marca con versión del codificador.
        ...j.streams.flatMap(x => Object.entries(x.tags || {})
          .filter(([k, val]) => ['title', 'comment', 'creation_time', 'location'].includes(k) || (k === 'encoder' && /\d+\.\d+/.test(val)))
          .map(([k]) => k)),
      ]
      const checks = {
        '1080×1920': v.width === 1080 && v.height === 1920,
        '30 fps': v.r_frame_rate === '30/1' && v.avg_frame_rate === '30/1',
        'h264 high yuv420p': v.codec_name === 'h264' && v.profile === 'High' && v.pix_fmt === 'yuv420p',
        audio: infoFuente.audio ? Boolean(a && a.codec_name === 'aac' && a.sample_rate === '48000' && a.channels === 2) : !a,
        duración: Math.abs(dur - esperada) < 0.15,
        'sin metadatos': etiquetas.length === 0,
      }
      if (c.gancho) {
        const al = pixel(salida, 0.3, 540, 450)
        const luego = pixel(salida, Math.min(dur - 0.2, 3.5), 540, 450)
        checks['gancho visible'] = al[1] > 200 && al[0] < 60 && al[2] < 60
        checks['gancho se va'] = !(luego[1] > 200 && luego[0] < 60 && luego[2] < 60)
      }
      const mal = Object.entries(checks).filter(([, ok]) => !ok).map(([k]) => k)
      fallos += mal.length
      filas.push({
        fuente: f.nombre, caso: c.nombre,
        'fuente s': infoFuente.duracion.toFixed(2), 'esperada s': esperada.toFixed(2), 'sale s': dur.toFixed(2),
        tamaño: `${v.width}×${v.height}`, fps: v.avg_frame_rate, audio: a ? `${a.codec_name} ${a.sample_rate} Hz ${a.channels}ch` : 'no',
        MB: (r.bytes / 1048576).toFixed(1), 'tarda s': seg, resultado: mal.length ? `FALLA: ${mal.join(', ')}${etiquetas.length ? ` (${etiquetas.join(', ')})` : ''}` : 'ok',
      })
    }
  }
  console.table(filas)
  if (!conservar) await fsp.rm(DIR, { recursive: true, force: true })
  else console.log(`Archivos en ${DIR}`)
  if (fallos) { console.error(`${fallos} comprobaciones fallidas`); process.exit(1) }
  console.log('Todo bien.')
}

main().catch(async (e) => {
  console.error(e)
  if (!conservar) await fsp.rm(DIR, { recursive: true, force: true })
  process.exit(1)
})
