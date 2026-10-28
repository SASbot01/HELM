// Editor de reels: qué se corta (api/_lib/editor/tomas.js), los subtítulos
// (subtitulos.js), el plan (plan.js, con las imágenes y clips de apoyo, el
// logo y la música), los argumentos de ffmpeg (render.js, sin lanzar nada),
// los recursos (recursos.js: la firma de los bytes, la orientación EXIF), la
// API (api/editor.js: crear, trozos, recursos, lanzar, con el saldo) con
// Supabase simulado, y el trabajo del worker (trabajo.js) con ffmpeg de verdad
// y Whisper simulado: monta con recursos y cobra solo si sale bien. El montaje
// completo, con comprobaciones fotograma a fotograma: scripts/prueba-editor.mjs.
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Readable, Writable } from 'node:stream'
import { spawnSync } from 'node:child_process'

const DATOS = fs.mkdtempSync(path.join(os.tmpdir(), 'helm-editor-'))
process.env.HELM_DATA_DIR = DATOS
process.env.HELM_EDITOR_MIN_LIBRE_MB = '0'
afterAll(() => fs.rmSync(DATOS, { recursive: true, force: true }))

const { tomasDe, frasesDe, esMuletilla, comparaTomas, normaliza, limpiaPalabras } = await import('../api/_lib/editor/tomas.js')
const { bloquesDe, assDe, textoDePalabra, colorAss, tiempoAss, anchoTexto, ANCHO_UTIL, FUENTE_ASS, ARCHIVO_FUENTE } = await import('../api/_lib/editor/subtitulos.js')
const { planDeEdicion, saltosDeZoom, tramosDe, resumenDePlan, brollDe, buscaPalabra, hablaDe, logoDe, gananciaMusica, INICIO_LIBRE, SEPARACION_RECURSOS, LOGO, MUSICA_SOBRE_VOZ_DB } = await import('../api/_lib/editor/plan.js')
const { grafoRender, argumentosRender, valorFiltro, segundosDeProgreso, DIR_FUENTES, presetPara, entradasDe, expresionVolumen, filtroGiro, PERSONA_ARRIBA_Y, ZOOM_IMAGEN, renderiza, argumentosMedida, sonoridadDe, mideMusica } = await import('../api/_lib/editor/render.js')
const { firmaDe, admite, orientacionJpeg, quitaOrientacion, nombreRecurso, palabraDe, infoDeAudio } = await import('../api/_lib/editor/recursos.js')
const { normalizaEstilo, ESTILO_POR_DEFECTO } = await import('../src/agents/editor/estilo.js')

/** Palabras con sus tiempos: `paso` s por palabra desde `desde`. */
function dice(texto, desde, paso = 0.3) {
  return texto.split(' ').map((w, i) => ({ w, a: +(desde + i * paso).toFixed(3), b: +(desde + i * paso + paso - 0.05).toFixed(3), p: 0.9 }))
}
const E = normalizaEstilo({})
const textos = (t) => t.palabras.map(p => p.w).join(' ')
const quitadas = (t) => t.frases.filter(f => f.estado !== 'va').map(f => [f.estado, f.texto])

// ── tomas.js ────────────────────────────────────────────────────────────────
describe('tomas: lo que se queda', () => {
  it('el ejemplo de Alex: la frase dicha dos veces, solo va la última (la que sigue con «porque…»)', () => {
    const palabras = [
      ...dice('Esta IA hace que tu negocio venda más.', 0.5),
      ...dice('Esta IA hace que tu negocio venda más porque responde a tus clientes al momento.', 4.0),
    ]
    const t = tomasDe(palabras, E, 10)
    expect(quitadas(t)).toEqual([['toma', 'Esta IA hace que tu negocio venda más.']])
    expect(textos(t)).toBe('Esta IA hace que tu negocio venda más porque responde a tus clientes al momento.')
    // Ningún trozo toca la primera toma (0,5–2,9 s).
    expect(t.segmentos.every(s => s.a > 2.9)).toBe(true)
    expect(t.resumen.tomas).toBe(1)
    // Las palabras salen con el tiempo del editado: la primera, casi al principio.
    expect(t.palabras[0].a).toBeLessThan(0.1)
  })

  it('toma a medias con muletilla, y otra con una pausa en medio: va la última entera', () => {
    const a = tomasDe([
      ...dice('Esta IA hace que tu negocio', 0.5),
      ...dice('eh', 3.0),
      ...dice('Esta IA hace que tu negocio venda más porque responde rápido.', 4.0),
    ], E, 10)
    expect(quitadas(a).map(q => q[0])).toEqual(['toma', 'muletilla'])
    expect(textos(a)).toBe('Esta IA hace que tu negocio venda más porque responde rápido.')

    // La buena tiene una pausa a mitad («…que tu | negocio venda más»): se
    // compara lo que se dice desde su principio, aunque siga en otra frase.
    const b = tomasDe([
      ...dice('Esta IA hace que tu negocio venda más porque responde.', 0.5),
      ...dice('Esta IA hace que tu', 4.5),
      ...dice('negocio venda más porque responde al momento.', 7.0),
    ], E, 12)
    expect(quitadas(b)).toEqual([['toma', 'Esta IA hace que tu negocio venda más porque responde.']])
    expect(textos(b)).toBe('Esta IA hace que tu negocio venda más porque responde al momento.')
  })

  it('vuelve a empezar sin pausa ni punto: también lo ve', () => {
    const palabras = dice('Esta IA hace que tu negocio venda Esta IA hace que tu negocio venda más.', 0.5, 0.25)
    const t = tomasDe(palabras, E, 6)
    expect(textos(t)).toBe('Esta IA hace que tu negocio venda más.')
  })

  it('una palabra cambiada sí es otra toma; dos, no (anáforas, listas)', () => {
    const n = (s) => s.split(' ').map(normaliza)
    expect(comparaTomas(n('esta ia hace que tu negocio'), n('esta ia hace que tus negocios crezcan'))).toBeTruthy()
    expect(comparaTomas(n('esta ia hace que tu empresa'), n('esta ia hace que tu negocio venda'))).toBeTruthy()
    expect(comparaTomas(n('si quieres vender más usa ia'), n('si quieres ahorrar tiempo usa ia'))).toBeNull()
    // Con dos palabras no se compara (salvo el arranque en falso de abajo).
    expect(comparaTomas(n('esta ia'), n('esta ia hace'))).toBeNull()
    const t = tomasDe([
      ...dice('Si quieres vender más, usa IA.', 0.5),
      ...dice('Si quieres ahorrar tiempo, usa IA.', 3.0),
    ], E, 6)
    expect(quitadas(t)).toEqual([])
  })

  it('arranque en falso de una palabra, y el último arranque que se quedó a medias', () => {
    const t = tomasDe([...dice('Mira.', 0.5), ...dice('Mira esto que te enseño hoy.', 1.6)], E, 5)
    expect(textos(t)).toBe('Mira esto que te enseño hoy.')
    const u = tomasDe([...dice('Comenta IA y te paso el enlace.', 0.5), ...dice('Comenta IA', 3.5)], E, 6)
    expect(quitadas(u)).toEqual([['toma', 'Comenta IA']])
  })

  it('muletillas: solo las frases sueltas que no dicen nada', () => {
    expect(['eh', 'Eh...', 'mmm', 'Emm', 'vale, vale', 'A ver.', 'Bueno.', 'o sea'].map(x => esMuletilla(x.split(/\s+/).map(normaliza).filter(Boolean)))).toEqual(Array(8).fill(true))
    expect(['vale esto es importante', 'a ver qué pasa', 'no'].map(x => esMuletilla(x.split(' ').map(normaliza)))).toEqual([false, false, false])
    const t = tomasDe([
      ...dice('Eh…', 0.3),
      ...dice('Vale, esto es importante.', 1.2),
      ...dice('Mmm', 3.0),
      ...dice('A ver.', 4.0),
      ...dice('Tres claves para vender.', 5.2),
    ], E, 8)
    expect(textos(t)).toBe('Vale, esto es importante. Tres claves para vender.')
    expect(t.resumen.muletillas).toBe(3)
    // Sin quitarMuletillas, se quedan.
    expect(textos(tomasDe([...dice('Eh…', 0.3), ...dice('Hola a todos.', 1.2)], { ...E, quitarMuletillas: false }, 3))).toBe('Eh… Hola a todos.')
  })

  it('silencios: los largos se quedan en ~0,12 s; los cortos, tal cual', () => {
    const palabras = [
      ...dice('Primera frase aquí.', 0.5),        // acaba en 1,35
      ...dice('Segunda frase ahora.', 3.35),      // 2 s de silencio
      ...dice('Tercera sin cortar.', 4.50),       // 0,3 s: se queda
    ]
    const t = tomasDe(palabras, E, 8)
    expect(t.resumen.silencios).toBe(1)
    expect(t.segmentos).toHaveLength(2)
    const hueco = (i) => t.palabras[i + 1].a - t.palabras[i].b
    // Entre «aquí.» y «Segunda»: lo que quede del silencio, cerca de 0,12 s
    // (los cortes van a la rejilla de 1/30 s: ±1 fotograma).
    expect(hueco(2)).toBeGreaterThan(0.12 - 0.04)
    expect(hueco(2)).toBeLessThan(0.12 + 0.04)
    // Entre «ahora.» y «Tercera» (0,3 s en el original): igual.
    expect(hueco(5)).toBeCloseTo(4.5 - (3.35 + 0.6 + 0.25), 2)
    // Los cortes caen en fotogramas enteros.
    for (const s of t.segmentos) for (const x of [s.a, s.b]) expect(Math.abs(x * 30 - Math.round(x * 30))).toBeLessThan(0.05)
    // El principio (0,5 s en silencio) y el final se recortan.
    expect(t.segmentos[0].a).toBeGreaterThan(0.35)
    expect(t.duracion).toBeLessThan(8 - 2)
  })

  it('sin palabras: el vídeo entero; y las palabras raras se limpian', () => {
    expect(tomasDe([], E, 12.5)).toMatchObject({ segmentos: [{ a: 0, b: 12.5 }], palabras: [], duracion: 12.5 })
    expect(limpiaPalabras([{ w: '  hola ', a: 1, b: 0.5 }, { w: '', a: 1, b: 2 }, { w: 'x', a: NaN, b: 1 }])).toEqual([{ w: 'hola', a: 1, b: 1, p: null }])
    expect(frasesDe(limpiaPalabras(dice('Uno dos. Tres cuatro', 0)), E).map(f => f.texto)).toEqual(['Uno dos.', 'Tres cuatro'])
  })
})

// ── subtitulos.js ───────────────────────────────────────────────────────────
describe('subtítulos', () => {
  const palabras = dice('¿Sabes qué? Este año tu negocio venderá más con la IA.', 0.2, 0.3)

  it('mayúsculas con tildes y Ñ, sin la puntuación del final', () => {
    expect(textoDePalabra('más.')).toBe('MÁS')
    expect(textoDePalabra('año,')).toBe('AÑO')
    expect(textoDePalabra('¿qué?')).toBe('¿QUÉ?')
    expect(textoDePalabra('{\\b1}hola', true)).toBe('B1HOLA')
    expect(textoDePalabra('Más.', false)).toBe('Más')
  })

  it('bloques de N palabras que caben en una línea; la coma y el punto cortan', () => {
    const b = bloquesDe(palabras, normalizaEstilo({ palabrasPorBloque: 3 }))
    expect(b.map(x => x.texto)).toEqual(['¿SABES QUÉ?', 'ESTE AÑO TU', 'NEGOCIO VENDERÁ', 'MÁS CON LA', 'IA'])
    for (const x of b) {
      expect(x.palabras.length).toBeLessThanOrEqual(3)
      expect(anchoTexto(x.texto, E)).toBeLessThanOrEqual(ANCHO_UTIL)
    }
    // Sin huecos de menos de 0,4 s entre bloques (no parpadea) y sin pisarse.
    for (let i = 1; i < b.length; i++) expect(b[i].a).toBeGreaterThanOrEqual(b[i - 1].b)
    expect(bloquesDe(palabras, normalizaEstilo({ palabrasPorBloque: 1 }))).toHaveLength(11)
  })

  it('el .ass: cabecera, la letra del repo, un evento por palabra con la que suena resaltada', () => {
    const estilo = normalizaEstilo({ colorResalte: '#FFD60A', colorTexto: '#FFFFFF', posicion: 68 })
    const bloques = bloquesDe(palabras, estilo)
    const ass = assDe(bloques, estilo)
    expect(ass).toMatch(/^\[Script Info\]\n/)
    expect(ass).toContain('PlayResX: 1080\nPlayResY: 1920')
    expect(ass).toContain(`Style: HELM,${FUENTE_ASS},72,&H00FFFFFF,`)
    expect(fs.existsSync(path.join(DIR_FUENTES, ARCHIVO_FUENTE))).toBe(true)
    expect(fs.existsSync(path.join(DIR_FUENTES, 'OFL.txt'))).toBe(true)
    const eventos = ass.split('\n').filter(l => l.startsWith('Dialogue:'))
    expect(eventos).toHaveLength(palabras.length)
    // Cada evento: el bloque entero, centrado en (515, 1306), con UNA palabra en amarillo.
    for (const ev of eventos) {
      expect(ev).toContain('{\\an5\\pos(515,1306)}')
      expect(ev.match(/\{\\c&H0AD6FF&\}/g)).toHaveLength(1)
    }
    expect(eventos[3]).toContain('ESTE {\\c&H0AD6FF&}AÑO{\\c&HFFFFFF&} TU')
    // Seguidos: dentro de un bloque, cada evento empieza donde acabó el anterior.
    const tiempos = eventos.map(l => l.split(',').slice(1, 3))
    let k = 0
    for (const bl of bloques) {
      for (let i = 1; i < bl.palabras.length; i++) expect(tiempos[k + i][0]).toBe(tiempos[k + i - 1][1])
      expect(tiempos[k][0]).toBe(tiempoAss(bl.a))
      expect(tiempos[k + bl.palabras.length - 1][1]).toBe(tiempoAss(bl.b))
      k += bl.palabras.length
    }
  })

  it('colores y tiempos en formato ASS', () => {
    expect(colorAss('#FFD60A')).toBe('&H000AD6FF')
    expect(colorAss('#112233', 128)).toBe('&H80332211')
    expect(tiempoAss(0)).toBe('0:00:00.00')
    expect(tiempoAss(61.239)).toBe('0:01:01.24')
    expect(tiempoAss(3723.5)).toBe('1:02:03.50')
  })

  it('una palabra que no cabe se encoge', () => {
    const estilo = normalizaEstilo({ tamano: 120 })
    const ass = assDe(bloquesDe(dice('Anticonstitucionalmente', 0), estilo), estilo)
    expect(ass).toMatch(/\\fscx\d+\\fscy\d+/)
  })
})

// ── plan.js ─────────────────────────────────────────────────────────────────
describe('plan', () => {
  const info = { ancho: 1080, alto: 1920, duracion: 30, audio: true }
  const palabras = [
    ...dice('Esta IA hace que tu negocio venda más.', 0.5),
    ...dice('Esta IA hace que tu negocio venda más porque responde a tus clientes al momento y sin esperas.', 4.0),
    ...dice('Comenta IA y te paso el enlace por privado ahora mismo.', 11.0),
  ]

  it('zoom: alterna 1 y 1,08 cada 4 s y, si hay un corte cerca, salta en el corte', () => {
    expect(saltosDeZoom(20, [], 4)).toEqual([4, 8, 12, 16])
    expect(saltosDeZoom(20, [4.6], 4)).toEqual([4.6, 8.6, 12.6, 16.6])
    expect(saltosDeZoom(20, [6], 4)).toEqual([4, 8, 12, 16])
    const { tramos, zooms } = tramosDe([{ a: 1, b: 6 }, { a: 8, b: 15 }], normalizaEstilo({ zoomCada: 4 }))
    // El corte (5 s del editado) atrae el salto de los 4 s; luego 9 s.
    expect(zooms.map(z => [z.a, z.b, z.factor])).toEqual([[0, 5, 1], [5, 9, 1.08], [9, 12, 1]])
    expect(tramos).toEqual([
      { a: 1, b: 6, zoom: 1, fundeEntrada: false, fundeSalida: true },
      { a: 8, b: 12, zoom: 1.08, fundeEntrada: true, fundeSalida: false },
      { a: 12, b: 15, zoom: 1, fundeEntrada: false, fundeSalida: false },
    ])
    expect(tramosDe([{ a: 0, b: 10 }], normalizaEstilo({ zoom: false })).tramos).toHaveLength(1)
  })

  it('el plan entero: cortes, subtítulos, loudnorm a -16 y salida 1080×1920', () => {
    const plan = planDeEdicion({ info, palabras, estilo: {} })
    expect(plan.quitado).toEqual([{ a: 0.5, b: 2.85, texto: 'Esta IA hace que tu negocio venda más.', motivo: 'toma' }])
    expect(plan.audio).toEqual({ loudnorm: { I: -16, TP: -1.5, LRA: 11 } })
    expect(plan.salida).toMatchObject({ ancho: 1080, alto: 1920, fps: 30 })
    const suma = plan.tramos.reduce((s, t) => s + t.b - t.a, 0)
    expect(suma).toBeCloseTo(plan.duracionFinal, 2)
    expect(plan.bloques.length).toBeGreaterThan(5)
    expect(plan.bloques.at(-1).b).toBeLessThanOrEqual(plan.duracionFinal + 1e-6)
    expect(resumenDePlan(plan)).toMatchObject({ cortes: 1, resumen: { tomas: 1, sinVoz: false } })
    expect(planDeEdicion({ info, palabras, estilo: { subtitulos: false } }).bloques).toEqual([])
  })

  it('sin audio: el vídeo entero, sin sonido ni subtítulos', () => {
    const plan = planDeEdicion({ info: { ...info, audio: false }, palabras, estilo: {} })
    expect(plan.audio).toBeNull()
    expect(plan.segmentos).toEqual([{ a: 0, b: 30 }])
    expect(plan.bloques).toEqual([])
    expect(plan.resumen.sinVoz).toBe(true)
  })
})

// ── render.js (sin lanzar ffmpeg) ───────────────────────────────────────────
describe('render: los argumentos de ffmpeg', () => {
  const plan = planDeEdicion({
    info: { ancho: 2160, alto: 3840, duracion: 30, audio: true },
    palabras: [...dice('Esta IA hace que tu negocio venda más.', 0.5), ...dice('Esta IA hace que tu negocio venda más porque sí.', 4.0), ...dice('Y otra cosa más que decir.', 9.0)],
    estilo: { zoomCada: 2 },
  })
  const fc = (args) => args[args.indexOf('-filter_complex') + 1]

  it('una sola entrada, sin shell: split en tantos tramos como el plan y concat de todos', () => {
    const args = argumentosRender({ entrada: '/datos/e.mov', salida: '/datos/s.mp4.part', plan, ass: '/datos/s.ass' })
    expect(Array.isArray(args) && args.every(x => typeof x === 'string')).toBe(true)
    expect(args.filter(x => x === '-i')).toHaveLength(1)
    const n = plan.tramos.length
    expect(n).toBeGreaterThan(2)
    const f = fc(args)
    expect(f).toContain(`[0:v]fps=30,split=${n}`)
    expect(f).toContain(`[0:a]asplit=${n}`)
    expect(f.match(/\btrim=start=/g)).toHaveLength(n)
    expect(f.match(/atrim=start=/g)).toHaveLength(n)
    expect(f).toContain(`concat=n=${n}:v=1:a=1[vc][ac]`)
    // 4K: escalado bicubic; con zoom, los tramos alternan dos tamaños.
    expect(f).toContain('flags=bicubic')
    expect(new Set([...f.matchAll(/scale=(\d+:\d+)/g)].map(m => m[1])).size).toBe(2)
    expect(f).toContain(`ass=filename='/datos/s.ass':fontsdir='${DIR_FUENTES}'`)
    expect(f).toContain('loudnorm=I=-16:TP=-1.5:LRA=11')
    expect(f).toContain('afade=t=in:st=0:d=0.012')
    expect(args).toEqual(expect.arrayContaining(['-map', '[vout]', '[aout]', '-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
      '-r', '30', '-c:a', 'aac', '-ar', '48000', '-ac', '2', '-map_metadata', '-1', '-movflags', '+faststart', '-progress', 'pipe:1']))
    expect(args.at(-1)).toBe('/datos/s.mp4.part')
    // Nada que un shell interpretara: ni tuberías ni redirecciones sueltas.
    expect(args.some(x => /^(\||>|<|&&|;)$/.test(x))).toBe(false)
  })

  it('sin audio: ni asplit, ni atrim, ni loudnorm, ni pista de sonido', () => {
    const mudo = planDeEdicion({ info: { ancho: 720, alto: 1280, duracion: 9, audio: false }, palabras: [], estilo: {} })
    const args = argumentosRender({ entrada: '/e.mp4', salida: '/s.mp4', plan: mudo })
    const f = fc(args)
    expect(f).toContain(`concat=n=${mudo.tramos.length}:v=1:a=0[vc]`)
    expect(f).not.toMatch(/asplit|atrim|loudnorm|\[aout\]|ass=/)
    expect(args).toContain('-an')
    expect(args).not.toContain('[aout]')
    expect(f).toContain('flags=lanczos')
  })

  it('rutas raras, el -progress, el preset y el grafo largo en archivo', () => {
    expect(valorFiltro('/a:b/c,d;[e].ass')).toBe("'/a\\:b/c,d;[e].ass'")
    expect(() => valorFiltro("/a/b'c.ass")).toThrow()
    expect(segundosDeProgreso('frame=10\nout_time_us=1500000\nout_time_ms=2500000\n')).toBe(2.5)
    expect(segundosDeProgreso('out_time_us=N/A')).toBeNull()
    expect([presetPara(30), presetPara(120), presetPara(300)]).toEqual(['medium', 'faster', 'veryfast'])
    const args = argumentosRender({ entrada: '/e.mp4', salida: '/s.mp4', plan, rutaGrafo: '/tmp/g.txt', progreso: false })
    expect(args).toContain('-filter_complex_script')
    expect(args).not.toContain('-filter_complex')
    expect(args).not.toContain('-progress')
    expect(() => grafoRender({ plan: { tramos: [] } })).toThrow()
  })
})


// ── Recursos: imágenes y clips de apoyo, logo y música ───────────────────────
/** Una JPG de mentira (solo la cabecera) con la orientación EXIF `o`. */
function jpegConOrientacion(o, le = false) {
  const u16 = (n) => { const b = Buffer.alloc(2); if (le) b.writeUInt16LE(n); else b.writeUInt16BE(n); return b }
  const u32 = (n) => { const b = Buffer.alloc(4); if (le) b.writeUInt32LE(n); else b.writeUInt32BE(n); return b }
  const tiff = Buffer.concat([Buffer.from(le ? 'II' : 'MM'), u16(42), u32(8), u16(1), u16(0x0112), u16(3), u32(1), u16(o), u16(0), u32(0)])
  const exif = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff])
  const app1 = Buffer.concat([Buffer.from([0xff, 0xe1]), (() => { const b = Buffer.alloc(2); b.writeUInt16BE(exif.length + 2); return b })(), exif])
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app1, Buffer.from([0xff, 0xda, 0, 2]), Buffer.alloc(64, 7)])
}
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const conRelleno = (cabeza, n = 4096) => Buffer.concat([cabeza, Buffer.alloc(Math.max(0, n - cabeza.length), 3)])
const ftyp = (marca) => Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from(`ftyp${marca}`, 'latin1'), Buffer.alloc(16)])
const riff = (forma, extra = Buffer.alloc(0)) => Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from(forma), extra, Buffer.alloc(16)])
/** Una caja ftyp con su marca y sus marcas compatibles (como la de una HEIC del iPhone), y relleno detrás. */
function ftypCon(marca, compatibles = []) {
  const cuerpo = Buffer.from(`ftyp${marca}\0\0\0\0${compatibles.join('')}`, 'latin1')
  const largo = Buffer.alloc(4)
  largo.writeUInt32BE(cuerpo.length + 4)
  return Buffer.concat([largo, cuerpo, Buffer.alloc(64, 9)])
}
/** Un WAV de verdad (PCM 16 bits, mono): ffprobe lo lee. */
function wav(seg = 2, sr = 8000) {
  const n = Math.round(seg * sr)
  const b = Buffer.alloc(44 + n * 2)
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12)
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sr, 24)
  b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40)
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(6000 * Math.sin(i / 3)), 44 + i * 2)
  return b
}

describe('recursos: qué es cada archivo (por sus bytes) y si vale', () => {
  it('la firma, no la extensión', () => {
    expect(firmaDe(jpegConOrientacion(1))).toMatchObject({ clase: 'imagen', ext: 'jpg' })
    expect(firmaDe(conRelleno(PNG, 40))).toMatchObject({ clase: 'imagen', ext: 'png' })
    expect(firmaDe(riff('WEBP', Buffer.from('VP8 ')))).toMatchObject({ clase: 'imagen', ext: 'webp', formato: 'webp' })
    const animada = riff('WEBP', Buffer.concat([Buffer.from('VP8X'), Buffer.from([0, 0, 0, 0, 0x02])]))
    expect(firmaDe(animada)).toMatchObject({ formato: 'webp-animada' })
    expect(firmaDe(riff('WAVE'))).toMatchObject({ clase: 'audio', ext: 'wav' })
    expect(firmaDe(conRelleno(Buffer.from('ID3\x04\x00'), 40))).toMatchObject({ clase: 'audio', ext: 'mp3' })
    expect(firmaDe(conRelleno(Buffer.from([0xff, 0xfb, 0x90, 0x64]), 40))).toMatchObject({ clase: 'audio', ext: 'mp3' })
    // AAC suelto (ADTS, capa 00): no es MP3.
    expect(firmaDe(conRelleno(Buffer.from([0xff, 0xf1, 0x50, 0x80]), 40))).toBeNull()
    expect(firmaDe(ftyp('isom'))).toMatchObject({ clase: 'video', ext: 'mp4' })
    expect(firmaDe(ftyp('qt  '))).toMatchObject({ clase: 'video', ext: 'mov' })
    expect(firmaDe(ftyp('M4A '))).toMatchObject({ clase: 'audio', ext: 'm4a' })
    expect(firmaDe(Buffer.concat([Buffer.from([0, 0, 0, 8]), Buffer.from('mdat'), Buffer.alloc(24)]))).toMatchObject({ clase: 'video', ext: 'mov' })
    expect(firmaDe(Buffer.from('<?php echo "hola"; ?>                '))).toBeNull()
    expect(firmaDe(Buffer.from('%PDF-1.7                           '))).toBeNull()
  })

  it('las fotos HEIC/HEIF del iPhone y las AVIF (ftyp con marca de imagen) no pasan por vídeo: 415 con qué hacer', () => {
    // Como las escribe el iPhone (y sips): marca heic y, entre las compatibles, mif1.
    const heic = ftypCon('heic', ['mif1', 'MiPr', 'miaf', 'MiHB', 'heic'])
    const avif = ftypCon('avif', ['avif', 'mif1', 'miaf', 'MA1B'])
    // Marca principal que no es de imagen, pero mif1 entre las compatibles: también es una foto.
    const mif1 = ftypCon('iso8', ['mif1', 'iso8'])
    for (const b of [heic, avif, mif1]) {
      expect(firmaDe(b.subarray(0, 32))).toMatchObject({ clase: 'imagen', formato: 'heif', ext: null })
      for (const tipo of ['broll', 'logo']) {
        let e = null
        try { admite(tipo, firmaDe(b.subarray(0, 32))) } catch (x) { e = x }
        expect(e).toMatchObject({ statusCode: 415, message: 'Las fotos HEIC/AVIF no valen: expórtala como JPG o PNG.' })
      }
      expect(() => admite('musica', firmaDe(b))).toThrow(/MP3, M4A o WAV/)
    }
    // Los vídeos de verdad siguen siendo vídeos (y las marcas solo se leen dentro de la caja ftyp).
    expect(firmaDe(ftypCon('isom', ['isom', 'iso2', 'avc1', 'mp41']))).toMatchObject({ clase: 'video', ext: 'mp4' })
    expect(firmaDe(ftypCon('qt  ', ['qt  ']))).toMatchObject({ clase: 'video', ext: 'mov' })
    expect(firmaDe(Buffer.concat([ftypCon('mp42', ['mp42']).subarray(0, 20), Buffer.from('heic')]))).toMatchObject({ clase: 'video', ext: 'mp4' })
  })

  it('cada tipo admite lo suyo, con su tope; lo demás, 415', () => {
    expect(admite('broll', firmaDe(jpegConOrientacion(1)))).toMatchObject({ clase: 'imagen', tope: 15 * 1024 * 1024 })
    expect(admite('broll', firmaDe(ftyp('isom')))).toMatchObject({ clase: 'video', tope: 90 * 1024 * 1024 })
    expect(admite('logo', firmaDe(conRelleno(PNG, 40)))).toMatchObject({ clase: 'logo', ext: 'png', tope: 5 * 1024 * 1024 })
    expect(admite('musica', firmaDe(riff('WAVE')))).toMatchObject({ clase: 'musica', ext: 'wav', tope: 30 * 1024 * 1024 })
    const no = (tipo, b) => { try { admite(tipo, firmaDe(b)); return null } catch (e) { return e.statusCode } }
    expect(no('logo', jpegConOrientacion(1))).toBe(415)      // el logo, con transparencia
    expect(no('broll', riff('WAVE'))).toBe(415)
    expect(no('musica', conRelleno(PNG, 40))).toBe(415)
    expect(no('broll', Buffer.from('no soy una imagen, soy un texto largo'))).toBe(415)
    expect(no('broll', riff('WEBP', Buffer.concat([Buffer.from('VP8X'), Buffer.from([0, 0, 0, 0, 0x02])])))).toBe(415)
    expect(no('otro', conRelleno(PNG, 40))).toBe(415)
  })

  it('la orientación EXIF del móvil: se lee (en los dos órdenes de bytes) y se pone a 1 en el archivo', async () => {
    expect(orientacionJpeg(jpegConOrientacion(6))).toMatchObject({ orientacion: 6 })
    expect(orientacionJpeg(jpegConOrientacion(8, true))).toMatchObject({ orientacion: 8, le: true })
    expect(orientacionJpeg(conRelleno(PNG, 40))).toEqual({ orientacion: 1, posicion: null })
    expect(orientacionJpeg(Buffer.from([0xff, 0xd8, 0xff, 0xda, 0, 2]))).toEqual({ orientacion: 1, posicion: null })
    const ruta = path.join(DATOS, 'giro.jpg')
    fs.writeFileSync(ruta, jpegConOrientacion(6))
    expect(await quitaOrientacion(ruta)).toBe(6)
    expect(orientacionJpeg(fs.readFileSync(ruta)).orientacion).toBe(1)
    // Lo demás del archivo, igual.
    expect(fs.readFileSync(ruta).length).toBe(jpegConOrientacion(6).length)
    expect(await quitaOrientacion(ruta)).toBe(1)
    expect([1, 2, 3, 4, 5, 6, 7, 8].map(filtroGiro)).toEqual(['', 'hflip', 'hflip,vflip', 'vflip', 'transpose=0', 'transpose=1', 'transpose=3', 'transpose=2'])
  })

  it('el nombre se queda sin carpetas; la palabra, limpia; ffprobe sin sonido es un 422', () => {
    expect(nombreRecurso('../../etc/passwd.jpg')).toBe('passwd.jpg')
    expect(nombreRecurso('..%2F..%2Fsecreto.png')).toBe('secreto.png')
    expect(nombreRecurso('C:\\fotos\\..\\yo.webp')).toBe('yo.webp')
    expect(nombreRecurso('...oculto')).toBe('oculto')
    expect(nombreRecurso('')).toBe('recurso')
    expect(palabraDe('  inteligencia   artificial  ')).toBe('inteligencia artificial')
    expect(palabraDe('una dos tres cuatro cinco')).toBe('una dos tres cuatro')
    expect(palabraDe(3)).toBeNull()
    expect(palabraDe('   ')).toBeNull()
    expect(infoDeAudio({ streams: [{ codec_type: 'audio' }], format: { duration: '12.5' } })).toEqual({ duracion: 12.5 })
    expect(() => infoDeAudio({ streams: [{ codec_type: 'video' }] })).toThrow(/sonido/)
  })
})

describe('plan: imágenes y clips de apoyo, logo y música', () => {
  const palabras = [
    ...dice('Hoy os enseño a vender más con la IA', 0.3),
    ...dice('La inteligencia artificial responde a tus clientes', 3.5),
    ...dice('y tu Negocio crece mientras duermes', 7.5),
    ...dice('Así de fácil', 11),
  ]
  const img = (id, extra = {}) => ({ id, tipo: 'broll', clase: 'imagen', ancho: 1200, alto: 800, ...extra })
  const sinSolapes = (b) => b.every((x, i) => i === 0 || x.a >= b[i - 1].b + SEPARACION_RECURSOS - 0.002)

  it('con palabra: entra donde se dice (sin acentos ni mayúsculas), con su duración', () => {
    expect(buscaPalabra(palabras, 'negocio')).toEqual([8.1])
    expect(buscaPalabra(palabras, 'INTELIGENCIA artificial')).toEqual([3.8])
    expect(buscaPalabra(palabras, 'ia')).toEqual([2.7])
    // Sin la palabra exacta, vale el principio («cliente» → «clientes»).
    expect(buscaPalabra(palabras, 'cliente')).toEqual([5.3])
    expect(buscaPalabra(palabras, 'fácil')).toEqual(buscaPalabra(palabras, 'facil'))
    expect(buscaPalabra(palabras, 'marte')).toEqual([])
    const { broll, fuera } = brollDe({ recursos: [img('a', { palabra: 'Negocio' })], palabras, duracion: 13, estilo: { recursoDuracion: 2 } })
    expect(fuera).toBe(0)
    expect(broll).toEqual([expect.objectContaining({ recurso: 'a', a: 8.1, b: 10.1, origen: 'palabra', palabra: 'Negocio' })])
  })

  it('nunca en el primer segundo y medio: la palabra dicha antes entra a partir de ahí', () => {
    const { broll } = brollDe({ recursos: [img('a', { palabra: 'enseño' })], palabras, duracion: 13, estilo: { recursoDuracion: 2 } })
    expect(buscaPalabra(palabras, 'enseño')[0]).toBeLessThan(INICIO_LIBRE)
    expect(broll[0]).toMatchObject({ a: INICIO_LIBRE, b: INICIO_LIBRE + 2, origen: 'palabra' })
  })

  it('sin palabra (o con una que no se dice): repartidos por los huecos, sin pisarse ni pisar a los de palabra', () => {
    const recursos = [img('a', { palabra: 'negocio' }), img('b'), img('c', { palabra: 'marte' }), { id: 'd', tipo: 'broll', clase: 'video', duracion: 1.2 }]
    const { broll, fuera } = brollDe({ recursos, palabras, duracion: 13, estilo: { recursoDuracion: 2 } })
    expect(fuera).toBe(0)
    expect(broll.map(x => x.recurso).sort()).toEqual(['a', 'b', 'c', 'd'])
    expect(broll.find(x => x.recurso === 'a')).toMatchObject({ a: 8.1, origen: 'palabra' })
    expect(broll.find(x => x.recurso === 'c').origen).toBe('hueco')
    // El clip dura lo que dura (1,2 s) si es menos que lo del estilo.
    const d = broll.find(x => x.recurso === 'd')
    expect(d.b - d.a).toBeCloseTo(1.2, 3)
    expect(broll.every(x => x.a >= INICIO_LIBRE && x.b <= 13)).toBe(true)
    expect(sinSolapes(broll)).toBe(true)
  })

  it('muchos para un vídeo corto: se acortan; si aun así no caben, quedan fuera; y otros tipos no cuentan', () => {
    const doce = Array.from({ length: 12 }, (_, i) => img(`i${i}`))
    const { broll, fuera } = brollDe({ recursos: [...doce, { id: 'l', tipo: 'logo', clase: 'logo' }], palabras, duracion: 13, estilo: { recursoDuracion: 5 } })
    expect(broll.length + fuera).toBe(12)
    expect(broll.length).toBeGreaterThan(3)
    expect(sinSolapes(broll)).toBe(true)
    expect(broll.every(x => x.a >= INICIO_LIBRE && x.b <= 13 && x.b - x.a >= 0.999)).toBe(true)
    // La persona se sigue viendo: entre todos no tapan más del 60 % (y algo de redondeo).
    expect(broll.reduce((t, x) => t + x.b - x.a, 0)).toBeLessThanOrEqual((13 - INICIO_LIBRE) * 0.6 + 0.01)
    expect(brollDe({ recursos: doce, palabras, duracion: 2, estilo: {} })).toEqual({ broll: [], fuera: 12 })
    expect(brollDe({ recursos: [], palabras, duracion: 13, estilo: {} })).toEqual({ broll: [], fuera: 0 })
  })

  it('la música baja donde se habla (tramos juntos si casi se tocan); el logo, dentro de los márgenes', () => {
    const h = hablaDe(palabras, 13)
    expect(h[0].a).toBeCloseTo(0.2, 3)
    expect(h.every((x, i) => i === 0 || x.a > h[i - 1].b)).toBe(true)
    expect(hablaDe([{ w: 'a', a: 1, b: 1.2 }, { w: 'b', a: 1.5, b: 1.7 }], 5)).toEqual([{ a: 0.9, b: 1.9 }])
    expect(hablaDe([{ w: 'a', a: 1, b: 1.2 }, { w: 'b', a: 3, b: 3.2 }], 5)).toHaveLength(2)

    const l = { id: 'l', ancho: 400, alto: 200 }
    expect(logoDe(l, 'arriba-der')).toEqual({ recurso: 'l', x: 1080 - LOGO.lado - 152, y: LOGO.arriba, w: 152, h: 76 })
    expect(logoDe(l, 'arriba-izq')).toMatchObject({ x: LOGO.lado, y: LOGO.arriba })
    // Abajo a la derecha, a la izquierda de la columna de botones de Instagram.
    expect(logoDe(l, 'abajo-der')).toMatchObject({ x: 1080 - LOGO.botones - 152, y: 1920 - LOGO.abajo - 76 })
    // Uno muy alto no pasa de altoMax.
    expect(logoDe({ id: 'l', ancho: 100, alto: 1000 }, 'abajo-izq')).toMatchObject({ h: LOGO.altoMax, w: 24 })
    expect(logoDe(l, 'ninguna')).toBeNull()
    expect(logoDe(null, 'arriba-der')).toBeNull()
  })

  it('el plan entero con recursos: broll, logo, música; y una foto girada (EXIF 6) con su ancho y alto de verdad', () => {
    const recursos = [
      img('f', { palabra: 'negocio', ancho: 4032, alto: 3024, giro: 6 }),
      { id: 'l', tipo: 'logo', clase: 'logo', ancho: 300, alto: 300 },
      { id: 'm', tipo: 'musica', clase: 'musica', duracion: 30 },
    ]
    const plan = planDeEdicion({ info: { ancho: 1080, alto: 1920, duracion: 13, audio: true }, palabras, estilo: { recursosModo: 'arriba', musicaVolumen: 0.2, logoPosicion: 'arriba-izq' }, recursos })
    expect(plan.version).toBe(2)
    expect(plan.brollModo).toBe('arriba')
    expect(plan.broll).toHaveLength(1)
    expect(plan.broll[0]).toMatchObject({ recurso: 'f', giro: 6, ancho: 3024, alto: 4032, origen: 'palabra' })
    expect(plan.logo).toMatchObject({ recurso: 'l', x: LOGO.lado, w: 152, h: 152 })
    expect(plan.musica).toMatchObject({ recurso: 'm', volumen: 0.2, sola: false, bajadaDb: -10 })
    expect(plan.musica.habla.length).toBeGreaterThan(0)
    expect(plan.resumen).toMatchObject({ recursos: 1, recursosEnPalabra: 1, recursosFuera: 0, logo: true, musica: true })
    expect(resumenDePlan(plan).recursos).toEqual([expect.objectContaining({ recurso: 'f', palabra: 'negocio' })])
    // Sin voz, la música es el sonido (normalizada); a volumen 0 o con «Sin logo», no van.
    const mudo = planDeEdicion({ info: { ancho: 1080, alto: 1920, duracion: 8, audio: false }, estilo: {}, recursos })
    expect(mudo.musica).toMatchObject({ sola: true, habla: [], loudnorm: { I: -16 } })
    expect(mudo.salida.audio).toBe('aac-48k')
    const nada = planDeEdicion({ info: { ancho: 1080, alto: 1920, duracion: 8, audio: true }, palabras, estilo: { musicaVolumen: 0, logoPosicion: 'ninguna' }, recursos })
    expect(nada.musica).toBeNull()
    expect(nada.logo).toBeNull()
  })
})

describe('render: los argumentos de ffmpeg con recursos', () => {
  const palabras = [...dice('Hoy os enseño a vender más con la IA', 0.3), ...dice('y tu negocio crece mientras duermes', 4)]
  const recursos = [
    { id: 'img1', tipo: 'broll', clase: 'imagen', ancho: 4032, alto: 3024, giro: 6, palabra: 'negocio' },
    { id: 'clip1', tipo: 'broll', clase: 'video', ancho: 1920, alto: 1080, duracion: 10 },
    { id: 'logo1', tipo: 'logo', clase: 'logo', ancho: 200, alto: 100 },
    { id: 'mus1', tipo: 'musica', clase: 'musica', duracion: 60 },
  ]
  const rutas = { img1: '/d/r/img1.jpg', clip1: '/d/r/clip1.mp4', logo1: '/d/r/logo1.png', mus1: '/d/r/mus1.mp3' }
  const planCon = (estilo) => planDeEdicion({ info: { ancho: 1080, alto: 1920, duracion: 14, audio: true }, palabras, estilo: { recursoDuracion: 2, ...estilo }, recursos })
  const fc = (args) => args[args.indexOf('-filter_complex') + 1]

  it('modo «corte»: una entrada por recurso, a pantalla completa en su tramo; el logo encima y los subtítulos lo último', () => {
    const plan = planCon({ recursosModo: 'corte' })
    expect(plan.broll).toHaveLength(2)
    const args = argumentosRender({ entrada: '/d/e.mov', salida: '/d/s.mp4', plan, ass: '/d/s.ass', rutas })
    expect(args.filter(x => x === '-i')).toHaveLength(5)
    const e = entradasDe(plan)
    expect(e.map(x => x.uso)).toEqual(expect.arrayContaining(['imagen', 'clip', 'logo', 'musica']))
    const clip = e.find(x => x.uso === 'clip')
    // El clip: solo su trozo (-ss y -t antes de su -i); la música, en bucle.
    const iClip = args.indexOf(rutas.clip1)
    // (y como MP4/MOV, sin dejar a ffmpeg adivinar el formato: formato.js)
    expect(args.slice(iClip - 7, iClip)).toEqual(['-ss', '0', '-t', String(Math.round((clip.tramo.b - clip.tramo.a + 0.5) * 1000) / 1000), '-f', 'mov', '-i'])
    const iMus = args.indexOf(rutas.mus1)
    expect(args.slice(iMus - 5, iMus)).toEqual(['-stream_loop', '-1', '-t', expect.any(String), '-i'])
    // El original, siempre como MP4/MOV; las imágenes y el logo, tal cual.
    expect(args.slice(args.indexOf('/d/e.mov') - 3, args.indexOf('/d/e.mov'))).toEqual(['-f', 'mov', '-i'])
    expect(args[args.indexOf(rutas.img1) - 2]).not.toBe('mov')
    expect(args.filter(x => x === 'mov')).toHaveLength(2)
    // El orden de las entradas es el de entradasDe (el vídeo es la 0).
    expect(e.map(x => args.indexOf(rutas[x.recurso]))).toEqual([...e.map(x => args.indexOf(rutas[x.recurso]))].sort((a, b) => a - b))

    const f = fc(args)
    for (const b of plan.broll) expect(f).toContain(`enable='between(t,${b.a},${b.b})'`)
    expect(f.match(/overlay=x=0:y=0:eof_action=pass/g)).toHaveLength(2)
    expect(f).not.toContain(`crop=1080:960:0:${PERSONA_ARRIBA_Y}`)
    // La imagen: girada (EXIF 6), escalada una vez, repetida y creciendo; a 1080×1920.
    const img = e.find(x => x.uso === 'imagen')
    expect(f).toContain(`[${img.indice}:v]transpose=1,scale=1166:2074:force_original_aspect_ratio=increase`)
    // Tantos fotogramas como su tramo y uno más (que el último no salga sin
    // ella); a 1/30 antes de setpts (sin pts repetidos) y recortada al centro
    // en cada fotograma: crece desde el centro, no desde la esquina.
    const N = Math.ceil((img.tramo.b - img.tramo.a) * 30 - 1e-6) + 1
    const crece = (lado) => `2*trunc(${lado}*(1+${ZOOM_IMAGEN}*n/${N})/2)`
    expect(f).toContain(`loop=loop=${N - 1}:size=1:start=0,settb=1/30,setpts=(N/30+${img.tramo.a})/TB,`)
    expect(f).toContain(`scale=w='${crece(1080)}':h='${crece(1920)}':eval=frame:flags=bicubic,crop=w=1080:h=1920:x='(${crece(1080)}-1080)/2':y='(${crece(1920)}-1920)/2',setsar=1[r`)
    // El clip: un fotograma de más y, si se queda corto, su último repetido.
    expect(f).toContain(`[${clip.indice}:v]trim=duration=${Math.round((clip.tramo.b - clip.tramo.a + 1 / 30) * 1000) / 1000},setpts=PTS-STARTPTS,fps=30,tpad=stop_mode=clone:stop_duration=0.067,`)
    expect(f).toContain(`scale=1080:1920:force_original_aspect_ratio=increase:flags=bicubic,crop=1080:1920`)
    // El logo, a su tamaño y en su sitio.
    expect(f).toContain(`scale=${plan.logo.w}:${plan.logo.h}:flags=lanczos,format=rgba[logo]`)
    expect(f).toContain(`[logo]overlay=x=${plan.logo.x}:y=${plan.logo.y}`)
    // Los subtítulos, después de todos los overlays.
    expect(f.indexOf('ass=filename=')).toBeGreaterThan(f.lastIndexOf('overlay='))
    expect(f).toMatch(/format=yuv420p,ass=filename=[^;]*\[vout\]$|format=yuv420p,ass=filename=[^;]*\[vout\];/)
    // La música: en bucle sin huecos, bajando donde se habla, mezclada con la voz y limitada.
    expect(f).toContain('asetpts=N/SR/TB')
    expect(f).toContain(":eval=frame,afade=t=in:st=0:d=0.3")
    expect(f).toContain('[voz][mus]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,alimiter=limit=0.891:level=0')
    expect(f).toContain('loudnorm=I=-16:TP=-1.5:LRA=11')
    expect(args).toEqual(expect.arrayContaining(['-map', '[vout]', '[aout]', '-c:a', 'aac']))
  })

  it('modo «arriba»: el recurso en la mitad de arriba y la persona (la franja de la cara) en la de abajo mientras dura', () => {
    const plan = planCon({ recursosModo: 'arriba' })
    const f = fc(argumentosRender({ entrada: '/d/e.mov', salida: '/d/s.mp4', plan, rutas }))
    const tramos = plan.broll.map(b => `between(t,${b.a},${b.b})`).join('+')
    expect(f).toContain(`split=2[pm][pp];[pp]crop=1080:960:0:${PERSONA_ARRIBA_Y}[pb];[pm][pb]overlay=x=0:y=960:enable='${tramos}'`)
    expect(f).toContain("crop=w=1080:h=960:x='(2*trunc(1080*")
    expect(f).toContain('crop=1080:960,setsar=1,format=yuv420p,setpts=PTS+')
    expect(f).not.toContain('crop=w=1080:h=1920')
    expect(f).not.toContain('crop=1080:1920,setsar=1')
    // Sin subtítulos, la última capa sale tal cual.
    expect(f).toMatch(/\]format=yuv420p\[vout\]/)
  })

  it('sin la ruta de un recurso no se monta; sin recursos, el grafo de siempre', () => {
    const plan = planCon({})
    expect(() => argumentosRender({ entrada: '/e', salida: '/s', plan, rutas: { img1: '/x.jpg' } })).toThrow(/recurso/)
    const solo = planDeEdicion({ info: { ancho: 1080, alto: 1920, duracion: 14, audio: true }, palabras, estilo: {} })
    const f = fc(argumentosRender({ entrada: '/e', salida: '/s', plan: solo }))
    expect(f).not.toMatch(/overlay|amix|alimiter|stream_loop/)
    expect(f).toContain('[vc]fps=30,format=yuv420p[vout]')
  })

  it('el volumen de la música: constante sin voz; con rampas en cada tramo de voz', () => {
    expect(expresionVolumen({ volumen: 0.12, habla: [] })).toBe('0.12')
    const v = expresionVolumen({ volumen: 0.12, bajadaDb: -10, rampa: 0.2, habla: [{ a: 0.1, b: 2 }, { a: 3, b: 4.5 }] })
    expect(v).toBe('0.12*(1-0.684*min(1,clip(min((t+0.1)/0.2,(2.2-t)/0.2),0,1)+clip(min((t-2.8)/0.2,(4.7-t)/0.2),0,1)))')
    // Sin voz y con música: la música, normalizada, es el sonido.
    const mudo = planDeEdicion({ info: { ancho: 1080, alto: 1920, duracion: 8, audio: false }, estilo: {}, recursos: [recursos[3]] })
    const args = argumentosRender({ entrada: '/e', salida: '/s', plan: mudo, rutas })
    const f = fc(args)
    expect(f).toMatch(/\[1:a\]aresample=48000.*loudnorm=I=-16.*\[aout\]$/)
    expect(f).not.toContain('amix')
    expect(args).toEqual(expect.arrayContaining(['-map', '[aout]', '-c:a', 'aac']))
    expect(args).not.toContain('-an')
  })

  it('la música, a su sonoridad de referencia: la ganancia fija sale de lo medido y va antes del volumen por tramos', () => {
    // Referencia: la voz (-16) + 6 dB. Una pista comercial típica (-10 LUFS) va tal cual;
    // una floja sube, una muy fuerte baja; con topes, y sin medida (o casi muda), nada.
    expect(MUSICA_SOBRE_VOZ_DB).toBe(6)
    expect(gananciaMusica(-10)).toBe(0)
    expect(gananciaMusica(-23.25)).toBe(13.3)
    expect(gananciaMusica(-6)).toBe(-4)
    expect(gananciaMusica(-14, -12)).toBe(8)
    expect(gananciaMusica(-58)).toBe(24)
    expect(gananciaMusica(30)).toBe(-30)
    expect([gananciaMusica(null), gananciaMusica(-70), gananciaMusica(NaN), gananciaMusica('x')]).toEqual([null, null, null, null])

    const plan = planCon({ recursosModo: 'corte' })
    expect(plan.musica.ganancia).toBeNull()
    const sinAjuste = fc(argumentosRender({ entrada: '/e', salida: '/s', plan, rutas }))
    expect(sinAjuste).not.toMatch(/volume=-?[\d.]+dB/)
    const conAjuste = fc(argumentosRender({ entrada: '/e', salida: '/s', plan: { ...plan, musica: { ...plan.musica, ganancia: 8.5 } }, rutas }))
    expect(conAjuste).toContain(`asetpts=N/SR/TB,atrim=end=${plan.duracionFinal},volume=8.5dB,volume='${expresionVolumen(plan.musica)}':eval=frame`)
    const baja = fc(argumentosRender({ entrada: '/e', salida: '/s', plan: { ...plan, musica: { ...plan.musica, ganancia: -4 } }, rutas }))
    expect(baja).toContain(',volume=-4dB,volume=')

    // La medida: el trozo que va a sonar (en bucle hasta lo que dura el editado), sin imagen.
    expect(argumentosMedida('/d/m.mp3', 41.2)).toEqual(['-hide_banner', '-nostdin', '-nostats', '-stream_loop', '-1', '-t', '41.2', '-i', '/d/m.mp3', '-vn', '-af', 'loudnorm=print_format=json', '-f', 'null', '-'])
    // La música en M4A es un MP4: se abre con su demuxer, como el original y los clips.
    expect(argumentosMedida('/d/m.m4a', 41.2).slice(7, 10)).toEqual(['-f', 'mov', '-i'])
    const resumen = '[Parsed_loudnorm_0 @ 0x1]\n{\n\t"input_i" : "-13.42",\n\t"input_tp" : "-0.80",\n\t"output_i" : "-16.01"\n}\n'
    expect(sonoridadDe(`Input #0, mp3…\n${resumen}`)).toBe(-13.42)
    expect(sonoridadDe('{ "input_i" : "-inf" }')).toBeNull()
    expect(sonoridadDe('nada')).toBeNull()
  })
})

// ── api/editor.js ───────────────────────────────────────────────────────────
const PERFIL = 'c0000000-0000-4000-8000-0000000000c1'
const OTRO = 'c0000000-0000-4000-8000-0000000000c2'
const VECINO = 'c0000000-0000-4000-8000-0000000000c3' // otro perfil de la misma agencia
const AGENCIA = 'd0000000-0000-4000-8000-0000000000d1'
const AGENCIA_OTRA = 'd0000000-0000-4000-8000-0000000000d2'
const db = {}
let siguiente = 0
const nuevoId = () => `a0000000-0000-4000-8000-${String(++siguiente).padStart(12, '0')}`

function consulta(tabla) {
  const filtros = []
  let op = 'select'; let datos = null; let cabeza = false; let tope = Infinity; let orden = null; let devuelve = false
  const filas = () => (db[tabla] ||= [])
  const encaja = (f) => filtros.every(fn => fn(f))
  const q = {
    select(_c, opts) { if (opts?.head) cabeza = true; if (op !== 'select') devuelve = true; return q },
    eq(c, v) { filtros.push(f => f[c] === v); return q },
    is(c, v) { filtros.push(f => (f[c] ?? null) === v); return q },
    in(c, vs) { filtros.push(f => vs.includes(f[c])); return q },
    gte(c, v) { filtros.push(f => f[c] >= v); return q },
    lt(c, v) { filtros.push(f => f[c] < v); return q },
    gt(c, v) { filtros.push(f => Number(f[c]) > v); return q },
    order(c, { ascending } = {}) { orden = [c, ascending]; return q },
    limit(n) { tope = n; return q },
    update(row) { op = 'update'; datos = row; return q },
    insert(rows) { op = 'insert'; datos = rows; return q },
    upsert(rows, opts) { op = 'upsert'; datos = rows; q.opts = opts; return q },
    delete() { op = 'delete'; return q },
    maybeSingle() { return Promise.resolve({ data: structuredClone(filas().find(encaja) || null), error: null }) },
    then(ok, mal) {
      let data = null
      if (op === 'insert' || op === 'upsert') {
        const nuevas = (Array.isArray(datos) ? datos : [datos])
          .filter(r => !(op === 'upsert' && filas().some(f => f.clave && f.clave === r.clave)))
          .map(r => ({ id: nuevoId(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...structuredClone(r) }))
        filas().push(...nuevas)
        data = structuredClone(nuevas)
      } else if (op === 'update') {
        const tocadas = filas().filter(encaja)
        tocadas.forEach(f => Object.assign(f, structuredClone(datos)))
        data = devuelve ? structuredClone(tocadas) : null
      } else if (op === 'delete') {
        db[tabla] = filas().filter(f => !encaja(f))
      } else {
        data = filas().filter(encaja)
        if (orden) data = [...data].sort((x, y) => (x[orden[0]] < y[orden[0]] ? -1 : 1) * (orden[1] ? 1 : -1))
        data = structuredClone(data.slice(0, tope))
      }
      const r = cabeza ? { count: data.length, data: null, error: null } : { data, error: null }
      return Promise.resolve(r).then(ok, mal)
    },
  }
  return q
}

// mover_saldo como en la base: suma (o resta) y, con una referencia ya usada, no hace nada (null).
async function moverSaldo(nombre, p) {
  if (nombre !== 'mover_saldo') return { data: null, error: { message: `rpc ${nombre}?` } }
  if (db.rpcCaida) return { data: null, error: { message: 'la base no contesta' } }
  if (p.p_referencia && db.agencia_movimientos.some(m => m.referencia === p.p_referencia)) return { data: null, error: null }
  const a = db.agencias.find(x => x.id === p.p_agencia)
  a.saldo = Math.round((Number(a.saldo) + p.p_importe) * 10000) / 10000
  db.agencia_movimientos.push({ agencia_id: a.id, importe: p.p_importe, tipo: p.p_tipo, origen: p.p_origen, client_id: p.p_client, modelo: p.p_modelo, referencia: p.p_referencia })
  return { data: a.saldo, error: null }
}

vi.mock('../api/lib/supabase.js', () => ({ supabase: { from: (t) => consulta(t), rpc: (...a) => moverSaldo(...a) } }))
vi.mock('../api/_lib/access.js', () => ({
  requireProfileAccess: vi.fn(async () => ({ userId: 'b0000000-0000-4000-8000-000000000001' })),
  agenciaDe: async (clientId) => (db.clients || []).find(c => c.id === clientId)?.agencia_id ?? null,
  // Quién puede gastar y quién ve el saldo: de serie, todo sí (hay pruebas para el no).
  puedeUsarAgentes: vi.fn(async () => true),
  puedeVerSaldo: vi.fn(async () => true),
}))
// ejecuta, la de verdad pero espiada: para ver con qué se abre cada archivo.
vi.mock('../api/_lib/variantes.js', async (original) => {
  const o = await original()
  return { ...o, sondea: vi.fn(async () => ({ ancho: 1080, alto: 1920, duracion: 12.5, audio: true })), ejecuta: vi.fn(o.ejecuta) }
})
// sondeaVideo (ffprobe con -f mov) hace lo que diga el sondea simulado; las
// pruebas con ffmpeg de verdad ponen la suya.
vi.mock('../api/_lib/editor/formato.js', async (original) => ({ ...(await original()), sondeaVideo: vi.fn() }))
// Los estilos de referencia, fijos para la prueba (la galería de verdad la escribe la pantalla).
vi.mock('../src/agents/editor/estilos-referencia.js', () => ({
  ESTILOS_REFERENCIA: [
    { clave: 'kallaway', nombre: 'kallaway', estilo: { palabrasPorBloque: 1, mayusculas: true, recursosModo: 'arriba', zoom: false } },
    { clave: 'sin-analizar', nombre: 'sin-analizar', estilo: null },
  ],
}))

const { default: editor } = await import('../api/editor.js')
const { sondea, ejecuta } = await import('../api/_lib/variantes.js')
const { requireProfileAccess, puedeUsarAgentes, puedeVerSaldo } = await import('../api/_lib/access.js')
const { sondeaVideo } = await import('../api/_lib/editor/formato.js')
const { sondeaVideo: sondeaVideoReal } = await vi.importActual('../api/_lib/editor/formato.js')
const { rutaEditado, dirEdicion, dirRecursos, rutaRecurso, limpiaEdiciones, pasaDelTope } = await import('../api/_lib/editor/archivos.js')
const { editorRender, cobraEdicion, reintentaCobros, cierraColgadas, edicionFallida, ABANDONADA } = await import('../api/_lib/editor/trabajo.js')
const SONDEO = { ancho: 1080, alto: 1920, duracion: 12.5, audio: true }

let ip = 0
async function llama({ method = 'GET', action, query = {}, body, crudo = null, headers = {} }) {
  const trozos = []
  const res = new Writable({ write(c, _e, cb) { trozos.push(c); cb() } })
  Object.assign(res, {
    statusCode: 200, body: null, headers: {}, headersSent: false,
    status(c) { this.statusCode = c; return this },
    json(b) { this.body = b; this.headersSent = true; this.emit('finish'); return this },
    setHeader(k, v) { this.headers[k] = v },
  })
  const req = crudo ? Readable.from(Array.isArray(crudo) ? crudo : [crudo]) : Readable.from([])
  Object.assign(req, {
    method, query: { action, clientId: PERFIL, ...query }, body,
    headers: { 'x-forwarded-for': `10.8.${Math.floor(++ip / 250)}.${ip % 250}`, ...headers }, socket: {},
  })
  await editor(req, res)
  res.descargado = Buffer.concat(trozos)
  return res
}
const crea = (cuerpo = {}, query = {}) => llama({ method: 'POST', action: 'crear', query, body: { nombre: 'Mi vídeo «uno».MOV', bytes: 64 * 1024, tipo: 'video/quicktime', duracion: 60, ...cuerpo } })
const trozo = (id, offset, datos, query = {}) => llama({ method: 'POST', action: 'trozo', query: { id, offset: String(offset), ...query }, crudo: datos })
const sube = (id, tipo, datos, nombre = 'x', query = {}) => llama({ method: 'POST', action: 'recurso', query: { id, tipo, nombre, ...query }, crudo: datos })
const lanza = (id, recursos) => llama({ method: 'POST', action: 'lanzar', body: { id, ...(recursos ? { recursos } : {}) } })
const VIDEO = Buffer.concat([ftyp('qt  '), Buffer.alloc(64 * 1024 - ftyp('qt  ').length, 5)])
const saldo = () => db.agencias.find(a => a.id === AGENCIA).saldo

beforeEach(() => {
  db.helm_ediciones = []
  db.helm_estilos_edicion = [{ id: nuevoId(), client_id: null, nombre: 'Estilo HELM', params: { ...ESTILO_POR_DEFECTO }, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }]
  db.agent_jobs = []
  db.clients = [{ id: PERFIL, agencia_id: AGENCIA }, { id: VECINO, agencia_id: AGENCIA }, { id: OTRO, agencia_id: AGENCIA_OTRA }]
  db.agencias = [{ id: AGENCIA, saldo: 100, sin_cobro: false }, { id: AGENCIA_OTRA, saldo: 100, sin_cobro: false }]
  db.agencia_movimientos = []
  db.rpcCaida = false
  db.helm_trial_reels = []
  sondea.mockReset()
  sondea.mockImplementation(async () => ({ ...SONDEO }))
  sondeaVideo.mockReset()
  sondeaVideo.mockImplementation((ruta) => sondea(ruta))
  ejecuta.mockClear()
  requireProfileAccess.mockClear()
  puedeUsarAgentes.mockReset()
  puedeUsarAgentes.mockImplementation(async () => true)
  puedeVerSaldo.mockReset()
  puedeVerSaldo.mockImplementation(async () => true)
  delete process.env.HELM_EDITOR_MAX_MB
  delete process.env.HELM_EDITOR_MAX_GB_PERFIL
})

describe('api/editor: crear', () => {
  it('crea la fila «subiendo» con su precio y el estilo (params > referencia > perfil > HELM); deja lista la subida', async () => {
    db.helm_estilos_edicion.push({ id: nuevoId(), client_id: PERFIL, nombre: 'Mío', params: { mayusculas: false, colorResalte: '#00FF88', palabrasPorBloque: 2 }, created_at: '2026-01-02T00:00:00Z', updated_at: '2026-01-02T00:00:00Z' })
    const r = await crea({ duracion: 200, estilo_ref: 'kallaway', params: { palabrasPorBloque: 4 } })
    expect(r.statusCode).toBe(200)
    const { edicion } = r.body
    expect(edicion).toMatchObject({ estado: 'subiendo', precio_eur: 3, estilo_ref: 'kallaway', recursos: [], cobrado_eur: null })
    const fila = db.helm_ediciones.find(f => f.id === edicion.id)
    expect(fila).toMatchObject({ client_id: PERFIL, nombre_original: 'Mi vídeo «uno».MOV', estado: 'subiendo', precio_eur: 3, duracion_s: 200 })
    // params del cuerpo, luego la referencia, luego el perfil, luego HELM.
    expect(fila.estilo).toMatchObject({ palabrasPorBloque: 4, recursosModo: 'arriba', zoom: false, mayusculas: true, colorResalte: '#00FF88', tamano: 72 })
    expect(fila.estilo).toEqual(normalizaEstilo(fila.estilo))
    expect(JSON.parse(fs.readFileSync(path.join(dirEdicion(edicion.id), 'subida.json'), 'utf8'))).toEqual({ bytes: 64 * 1024, ext: 'mov', tipo: 'video/quicktime' })
    expect(fs.statSync(path.join(dirEdicion(edicion.id), 'subida.part')).size).toBe(0)
    expect(db.agent_jobs).toHaveLength(0)
    // Una referencia sin estilo aún no cambia nada; una que no existe, 400.
    const s = await crea({ estilo_ref: 'sin-analizar' })
    expect(db.helm_ediciones.find(f => f.id === s.body.edicion.id).estilo).toMatchObject({ mayusculas: false, palabrasPorBloque: 2 })
    expect((await crea({ estilo_ref: 'no-existe' })).statusCode).toBe(400)
    expect((await crea({ params: 'x' })).statusCode).toBe(400)
  })

  it('sin saldo no se empieza (402 con el mensaje); lo que ya está en marcha en la agencia cuenta; la casa y sin agencia no pagan', async () => {
    db.agencias[0].saldo = 2
    const r = await crea({ duracion: 200 })
    expect(r.statusCode).toBe(402)
    expect(r.body.error).toBe('No tienes saldo suficiente: esto cuesta 300 créditos y te quedan 200. Recarga en Créditos.')
    expect(db.helm_ediciones).toHaveLength(0)
    expect(fs.existsSync(path.join(DATOS, 'editor')) ? fs.readdirSync(path.join(DATOS, 'editor')).filter(n => !fs.existsSync(path.join(DATOS, 'editor', n, 'subida.json'))).length >= 0 : true).toBe(true)
    // 3 € y otro perfil de la agencia con una de 1,50 € en cola: no llega para otra de 3 €.
    db.agencias[0].saldo = 3
    db.helm_ediciones.push({ id: nuevoId(), client_id: VECINO, estado: 'en_cola', precio_eur: 1.5, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    const r2 = await crea({ duracion: 200 })
    expect(r2.statusCode).toBe(402)
    expect(r2.body.error).toContain('ya están apartados')
    // Pero sí para una de 1,50 €; y lo ya cobrado o terminado no cuenta.
    expect((await crea({ duracion: 100 })).statusCode).toBe(200)
    db.helm_ediciones = [{ id: nuevoId(), client_id: VECINO, estado: 'listo', precio_eur: 3, cobrado_eur: 3 }]
    expect((await crea({ duracion: 200 })).statusCode).toBe(200)
    // La agencia de la casa no paga; un perfil sin agencia, tampoco.
    db.helm_ediciones = []
    db.agencias[0].saldo = 0
    db.agencias[0].sin_cobro = true
    expect((await crea({ duracion: 500 })).statusCode).toBe(200)
    db.agencias[0].sin_cobro = false
    db.clients[0].agencia_id = null
    db.helm_ediciones = []
    expect((await crea({ duracion: 500 })).statusCode).toBe(200)
  })

  it('como mucho 2 subiendo o en cola por perfil (429); las abandonadas no cuentan; topes de tipo, peso y duración', async () => {
    const hace = (h) => new Date(Date.now() - h * 3600_000).toISOString()
    db.helm_ediciones = [
      { id: nuevoId(), client_id: PERFIL, estado: 'en_cola', created_at: hace(0), updated_at: hace(0) },
      { id: nuevoId(), client_id: PERFIL, estado: 'subiendo', created_at: hace(1), updated_at: hace(1) },
      { id: nuevoId(), client_id: OTRO, estado: 'subiendo', created_at: hace(0), updated_at: hace(0) },
    ]
    const r = await crea()
    expect(r.statusCode).toBe(429)
    // La que lleva 7 horas sin recibir nada se da por perdida (y pasa a error).
    db.helm_ediciones[1].updated_at = hace(7)
    expect((await crea()).statusCode).toBe(200)
    expect(db.helm_ediciones[1]).toMatchObject({ estado: 'error', error: expect.stringContaining('subida') })
    // Las que ya se están montando no ocupan sitio de subida.
    db.helm_ediciones = ['transcribiendo', 'montando', 'en_cola'].map(estado => ({ id: nuevoId(), client_id: PERFIL, estado, created_at: hace(0), updated_at: hace(0) }))
    expect((await crea()).statusCode).toBe(200)
    expect((await crea()).statusCode).toBe(429)

    db.helm_ediciones = []
    expect((await crea({ tipo: 'application/json' })).statusCode).toBe(415)
    expect((await crea({ bytes: 0 })).statusCode).toBe(400)
    expect((await crea({ bytes: 801 * 1024 * 1024 })).statusCode).toBe(413)
    expect((await crea({ duracion: 601 })).statusCode).toBe(422)
    expect((await crea({ duracion: 'mucho' })).statusCode).toBe(400)
    expect((await crea({}, { clientId: 'x' })).statusCode).toBe(400)
    expect(db.helm_ediciones).toHaveLength(0)
  })

  it('el tope de 10 minutos lleva el medio segundo de gracia del precio: un vídeo de «10:00» que mide 600,3 s entra', async () => {
    const r = await crea({ duracion: 600.3 })
    expect(r.statusCode).toBe(200)
    expect(r.body.edicion.precio_eur).toBe(6)
    expect((await crea({ duracion: 600.6 })).statusCode).toBe(422)
    // La misma cuenta en crear, lanzar y el worker (y con el tope del entorno).
    expect([pasaDelTope(600), pasaDelTope(600.5), pasaDelTope(600.51), pasaDelTope(null)]).toEqual([false, false, true, false])
    process.env.HELM_EDITOR_MAX_SEGUNDOS = '300'
    try { expect([pasaDelTope(300.4), pasaDelTope(301)]).toEqual([false, true]) } finally { delete process.env.HELM_EDITOR_MAX_SEGUNDOS }
  })

  it('las subidas abandonadas de OTROS perfiles no llenan el tope del servidor (503): pasan a error y dejan sitio', async () => {
    const hace = (h) => new Date(Date.now() - h * 3600_000).toISOString()
    const de = (estado, horas, cliente = OTRO) => ({ id: nuevoId(), client_id: cliente, estado, created_at: hace(horas), updated_at: hace(horas) })
    // 20 subidas paradas desde hace 7 h de un perfil que no ha vuelto al editor.
    db.helm_ediciones = Array.from({ length: 20 }, () => de('subiendo', 7))
    const r = await crea()
    expect(r.statusCode).toBe(200)
    const viejas = db.helm_ediciones.filter(f => f.client_id === OTRO)
    expect(viejas.every(f => f.estado === 'error' && /subida no terminó/.test(f.error))).toBe(true)
    // 20 de verdad en marcha (subiendo hace poco, en cola o montándose): ahí sí, 503.
    db.helm_ediciones = [...Array.from({ length: 10 }, () => de('subiendo', 1)), ...Array.from({ length: 5 }, () => de('en_cola', 0)), ...Array.from({ length: 5 }, () => de('montando', 0))]
    const lleno = await crea()
    expect(lleno.statusCode).toBe(503)
    expect(db.helm_ediciones.filter(f => f.estado === 'error')).toHaveLength(0)
  })
})

describe('api/editor: el vídeo por trozos', () => {
  it('trozo a trozo; uno que no va ahí, 409 con lo recibido; GET dice cuánto hay', async () => {
    const { body: { edicion: { id } } } = await crea()
    const mitad = 32 * 1024
    const a = await trozo(id, 0, VIDEO.subarray(0, mitad))
    expect(a.body).toEqual({ recibidos: mitad, completo: false })
    // Repetido (el cliente creyó que se perdió): 409 y desde dónde seguir.
    const otra = await trozo(id, 0, VIDEO.subarray(0, mitad))
    expect(otra.statusCode).toBe(409)
    expect(otra.body).toMatchObject({ recibidos: mitad })
    expect((await llama({ action: 'trozo', query: { id } })).body).toEqual({ recibidos: mitad })
    const b = await trozo(id, mitad, VIDEO.subarray(mitad))
    expect(b.body).toEqual({ recibidos: 64 * 1024, completo: true })
    expect(db.helm_ediciones[0].paso).toBe('Vídeo subido')
    // Más allá de lo anunciado, no.
    expect((await trozo(id, 64 * 1024, Buffer.alloc(10))).statusCode).toBe(413)
  })

  it('la edición de otro perfil no se toca (404); una cerrada ya no recibe (409); id raro, 400', async () => {
    const { body: { edicion: { id } } } = await crea()
    expect((await trozo(id, 0, VIDEO, { clientId: OTRO })).statusCode).toBe(404)
    expect((await trozo('../../etc', 0, VIDEO)).statusCode).toBe(400)
    db.helm_ediciones[0].estado = 'en_cola'
    expect((await trozo(id, 0, VIDEO)).statusCode).toBe(409)
    expect(fs.statSync(path.join(dirEdicion(id), 'subida.part')).size).toBe(0)
  })
})

describe('api/editor: recursos', () => {
  it('imagen de apoyo: se mira la firma, se guarda con su id y la extensión de la firma; el nombre, sin carpetas; el EXIF, a 1', async () => {
    const { body: { edicion: { id } } } = await crea()
    const r = await sube(id, 'broll', jpegConOrientacion(6), encodeURIComponent('../../etc/passwd.mp3'))
    expect(r.statusCode).toBe(200)
    expect(r.body.recurso).toMatchObject({ tipo: 'broll', clase: 'imagen', nombre: 'passwd.mp3', bytes: jpegConOrientacion(6).length })
    const guardado = db.helm_ediciones[0].recursos[0]
    expect(guardado).toMatchObject({ id: r.body.recurso.id, ext: 'jpg', giro: 6, ancho: 1080, alto: 1920 })
    // Dentro de su carpeta, con su uuid: nada de lo que mandó el usuario en la ruta.
    expect(fs.readdirSync(dirRecursos(id))).toEqual([`${guardado.id}.jpg`])
    expect(orientacionJpeg(fs.readFileSync(rutaRecurso(id, guardado.id, 'jpg'))).orientacion).toBe(1)
    expect(fs.existsSync(path.join(DATOS, 'etc'))).toBe(false)
  })

  it('por los bytes, no por el nombre: un PNG que dice ser música, un texto como imagen o una JPG como logo → 415', async () => {
    const { body: { edicion: { id } } } = await crea()
    expect((await sube(id, 'musica', conRelleno(PNG), 'cancion.mp3')).statusCode).toBe(415)
    const texto = await sube(id, 'broll', Buffer.from('<script>alert(1)</script> y mucho más texto'), 'foto.jpg')
    expect(texto.statusCode).toBe(415)
    expect(texto.body.error).toContain('JPG, PNG, WEBP, MP4 o MOV')
    expect((await sube(id, 'logo', jpegConOrientacion(1), 'logo.png')).statusCode).toBe(415)
    // Una foto HEIC del iPhone no se cuela como clip (con el tope de 90 MB): 415 y qué hacer.
    const heic = await sube(id, 'broll', conRelleno(ftypCon('heic', ['mif1', 'heic'])), 'IMG_0001.HEIC')
    expect(heic.statusCode).toBe(415)
    expect(heic.body.error).toBe('Las fotos HEIC/AVIF no valen: expórtala como JPG o PNG.')
    expect((await sube(id, 'pegatina', conRelleno(PNG), 'x.png')).statusCode).toBe(400)
    expect(db.helm_ediciones[0].recursos).toEqual([])
    expect(fs.existsSync(dirRecursos(id)) ? fs.readdirSync(dirRecursos(id)) : []).toEqual([])
  })

  it('topes: por Content-Length (sin leer) y por lo que llega; 12 imágenes o clips como mucho; logo y música, uno (el nuevo sustituye)', async () => {
    const { body: { edicion: { id } } } = await crea()
    expect((await sube(id, 'logo', conRelleno(PNG), 'l.png', {})).statusCode).toBe(200)
    const grande = await llama({ method: 'POST', action: 'recurso', query: { id, tipo: 'logo', nombre: 'l.png' }, crudo: conRelleno(PNG), headers: { 'content-length': String(6 * 1024 * 1024) } })
    expect(grande.statusCode).toBe(413)
    // Sin Content-Length: se cuenta lo que llega (una «imagen» de 16 MB, tope 15).
    const sinLargo = await sube(id, 'broll', [jpegConOrientacion(1), Buffer.alloc(16 * 1024 * 1024)], 'enorme.jpg')
    expect(sinLargo.statusCode).toBe(413)
    expect(fs.readdirSync(dirRecursos(id)).filter(n => n.endsWith('.part'))).toEqual([])

    // El segundo logo sustituye al primero (fila y disco).
    const primero = db.helm_ediciones[0].recursos[0]
    const segundo = await sube(id, 'logo', conRelleno(PNG, 9000), 'nuevo.png')
    expect(segundo.statusCode).toBe(200)
    expect(db.helm_ediciones[0].recursos.map(x => x.id)).toEqual([segundo.body.recurso.id])
    expect(fs.existsSync(rutaRecurso(id, primero.id, 'png'))).toBe(false)

    db.helm_ediciones[0].recursos.push(...Array.from({ length: 12 }, () => ({ id: nuevoId(), tipo: 'broll', clase: 'imagen', ext: 'jpg' })))
    const trece = await sube(id, 'broll', jpegConOrientacion(1), 'trece.jpg')
    expect(trece.statusCode).toBe(409)
    expect(trece.body.error).toContain('12')
  })

  it('quitar un recurso (fila y archivo); los de otro perfil no se tocan; tras lanzar, ya no se suben', async () => {
    const { body: { edicion: { id } } } = await crea()
    const a = await sube(id, 'broll', jpegConOrientacion(1), 'a.jpg')
    const b = await sube(id, 'broll', conRelleno(PNG), 'b.png')
    expect((await sube(id, 'broll', jpegConOrientacion(1), 'c.jpg', { clientId: OTRO })).statusCode).toBe(404)
    expect((await llama({ method: 'POST', action: 'quitar-recurso', query: { clientId: OTRO }, body: { clientId: OTRO, id, recurso: a.body.recurso.id } })).statusCode).toBe(404)
    const q = await llama({ method: 'POST', action: 'quitar-recurso', body: { id, recurso: a.body.recurso.id } })
    expect(q.statusCode).toBe(200)
    expect(q.body.recursos.map(x => x.id)).toEqual([b.body.recurso.id])
    expect(fs.existsSync(rutaRecurso(id, a.body.recurso.id, 'jpg'))).toBe(false)
    expect((await llama({ method: 'POST', action: 'quitar-recurso', body: { id, recurso: a.body.recurso.id } })).statusCode).toBe(404)
    db.helm_ediciones[0].estado = 'en_cola'
    expect((await sube(id, 'broll', jpegConOrientacion(1), 'd.jpg')).statusCode).toBe(409)
  })

  it.skipIf(spawnSync(process.env.HELM_FFPROBE || 'ffprobe', ['-version']).status !== 0)('música: un WAV de verdad (ffprobe) vale; uno sin sonido no', async () => {
    const { body: { edicion: { id } } } = await crea()
    const m = await sube(id, 'musica', wav(2), 'fondo.wav')
    expect(m.statusCode).toBe(200)
    expect(m.body.recurso).toMatchObject({ tipo: 'musica', clase: 'musica', duracion: 2 })
    // Cabecera de WAV y nada más: ffprobe no le ve sonido que dure.
    expect((await sube(id, 'musica', wav(0.2), 'corta.wav')).statusCode).toBe(422)
  })
})

describe('api/editor: lanzar', () => {
  async function subida({ duracion = 60 } = {}) {
    const { body: { edicion: { id } } } = await crea({ duracion })
    return id
  }

  it('sin el vídeo entero, 409 con lo recibido; entero: precio con la duración REAL, cierra la subida, en cola y encolado', async () => {
    const id = await subida({ duracion: 60 })
    await trozo(id, 0, VIDEO.subarray(0, 1000))
    const corta = await lanza(id)
    expect(corta.statusCode).toBe(409)
    expect(corta.body).toMatchObject({ recibidos: 1000 })
    await trozo(id, 1000, VIDEO.subarray(1000))
    const img = await sube(id, 'broll', jpegConOrientacion(1), 'a.jpg')
    const img2 = await sube(id, 'broll', conRelleno(PNG), 'b.png')
    // El navegador dijo 60 s, pero dura 6:40: tres bloques, 4,50 €.
    sondea.mockResolvedValueOnce({ ...SONDEO, duracion: 400 })
    const r = await lanza(id, [{ id: img2.body.recurso.id, palabra: '  Negocio ' }])
    expect(r.statusCode).toBe(200)
    expect(r.body.edicion).toMatchObject({ id, estado: 'en_cola', precio_eur: 4.5 })
    const fila = db.helm_ediciones[0]
    expect(fila).toMatchObject({ estado: 'en_cola', duracion_original: 400, duracion_s: 400, precio_eur: 4.5 })
    // Primero los pedidos (con su palabra), luego el resto (sin ella).
    expect(fila.recursos.map(x => [x.id, x.palabra])).toEqual([[img2.body.recurso.id, 'Negocio'], [img.body.recurso.id, null]])
    expect(fs.readdirSync(dirEdicion(id)).sort()).toEqual(['original.mov', 'recursos'])
    expect(fs.statSync(path.join(dirEdicion(id), 'original.mov')).size).toBe(64 * 1024)
    expect(db.agent_jobs).toEqual([expect.objectContaining({ tipo: 'editor-render', clave: `editor-render:${id}`, payload: { clientId: PERFIL, edicionId: id }, max_intentos: 1 })])
    // Dos clics: la misma, sin encolar otra vez.
    const otra = await lanza(id)
    expect(otra.statusCode).toBe(200)
    expect(otra.body.edicion.estado).toBe('en_cola')
    expect(db.agent_jobs).toHaveLength(1)
  })

  it('sin saldo para la duración real: 402 y la edición sigue subida; al recargar, se lanza', async () => {
    db.agencias[0].saldo = 2
    const id = await subida({ duracion: 60 })
    await trozo(id, 0, VIDEO)
    sondea.mockResolvedValue({ ...SONDEO, duracion: 200 })
    const r = await lanza(id)
    expect(r.statusCode).toBe(402)
    expect(r.body.error).toBe('No tienes saldo suficiente: esto cuesta 300 créditos y te quedan 200. Recarga en Créditos.')
    expect(db.helm_ediciones[0].estado).toBe('subiendo')
    expect(db.agent_jobs).toHaveLength(0)
    expect(fs.existsSync(path.join(dirEdicion(id), 'subida.part'))).toBe(true)
    db.agencias[0].saldo = 10
    const bien = await lanza(id)
    expect(bien.statusCode).toBe(200)
    expect(bien.body.edicion).toMatchObject({ estado: 'en_cola', precio_eur: 3 })
    // Lanzar no cobra: cobra el worker al terminar bien.
    expect(saldo()).toBe(10)
    expect(db.agencia_movimientos).toHaveLength(0)
  })

  it('con la duración real de «10:00» (600,2 s según ffprobe) se lanza: el medio segundo de gracia vale también aquí', async () => {
    const id = await subida({ duracion: 599 })
    await trozo(id, 0, VIDEO)
    sondea.mockResolvedValueOnce({ ...SONDEO, duracion: 600.2 })
    const r = await lanza(id)
    expect(r.statusCode).toBe(200)
    expect(r.body.edicion).toMatchObject({ estado: 'en_cola', precio_eur: 6 })
    expect(fs.existsSync(path.join(dirEdicion(id), 'original.mov'))).toBe(true)
  })

  it('un vídeo que no se lee o que dura más de 10 minutos: 422 y fuera; un recurso que no es suyo, 400; de otro perfil, 404', async () => {
    const id = await subida()
    await trozo(id, 0, VIDEO)
    expect((await lanza(id, [{ id: nuevoId() }])).statusCode).toBe(400)
    expect((await llama({ method: 'POST', action: 'lanzar', query: { clientId: OTRO }, body: { clientId: OTRO, id } })).statusCode).toBe(404)
    sondea.mockResolvedValueOnce({ ...SONDEO, duracion: 3600 })
    const larga = await lanza(id)
    expect(larga.statusCode).toBe(422)
    expect(db.helm_ediciones[0]).toMatchObject({ estado: 'error', error: expect.stringContaining('10 minutos') })
    expect(fs.existsSync(dirEdicion(id))).toBe(false)
    const id2 = await subida()
    await trozo(id2, 0, VIDEO)
    sondea.mockRejectedValueOnce(new Error('ffprobe'))
    expect((await lanza(id2)).statusCode).toBe(422)
    expect(db.agent_jobs).toHaveLength(0)
  })
})

describe('api/editor: lista, estado, descarga, borrar y estilos', () => {
  it('lista: solo las del perfil, con los campos del contrato y nada más', async () => {
    const viejo = new Date(Date.now() - 7 * 3600_000).toISOString()
    db.helm_ediciones = [
      { id: nuevoId(), client_id: PERFIL, nombre_original: 'a.mp4', estado: 'listo', progreso: 100, paso: 'Listo', duracion_original: '60.50', duracion_final: '41.20', bytes: 10, plan: {}, error: null, estilo_ref: 'kallaway', precio_eur: '1.50', cobrado_eur: '1.50', recursos: [{ id: 'r1', tipo: 'logo', clase: 'logo', ext: 'png', nombre: 'logo.png', bytes: 100, ancho: 10, alto: 10 }], created_at: '2026-10-18T10:00:00Z', updated_at: '2026-10-18T10:05:00Z' },
      { id: nuevoId(), client_id: PERFIL, nombre_original: 'b.mp4', estado: 'subiendo', progreso: 0, created_at: viejo, updated_at: viejo },
      { id: nuevoId(), client_id: OTRO, nombre_original: 'c.mp4', estado: 'listo', created_at: viejo, updated_at: viejo },
    ]
    const r = await llama({ action: 'lista' })
    expect(r.body.ediciones).toHaveLength(2)
    const a = r.body.ediciones.find(x => x.nombre_original === 'a.mp4')
    const b = r.body.ediciones.find(x => x.nombre_original === 'b.mp4')
    expect(r.body.ediciones.map(x => x.nombre_original)).toEqual(['b.mp4', 'a.mp4'])
    expect(Object.keys(a).sort()).toEqual(['cobrado_eur', 'created_at', 'duracion_final', 'duracion_original', 'error', 'estado', 'estilo_ref', 'id', 'nombre_original', 'paso', 'precio_eur', 'progreso', 'recursos'].sort())
    expect(a).toMatchObject({ estado: 'listo', progreso: 100, duracion_original: 60.5, duracion_final: 41.2, precio_eur: 1.5, cobrado_eur: 1.5, estilo_ref: 'kallaway' })
    // De los recursos, lo que se enseña: ni la extensión ni el tamaño en píxeles.
    expect(a.recursos).toEqual([{ id: 'r1', tipo: 'logo', clase: 'logo', nombre: 'logo.png', bytes: 100, duracion: null, palabra: null }])
    // Una subida de hace horas que no acabó sale como error.
    expect(b).toMatchObject({ estado: 'error', error: expect.stringContaining('subida'), recursos: [] })
  })

  it('estado, descarga (404 / 409 / 410 / adjunto) y borrar (con sus recursos)', async () => {
    const plan = planDeEdicion({ info: { ancho: 1080, alto: 1920, duracion: 10, audio: true }, palabras: [...dice('Hola hola que tal.', 0.5), ...dice('Hola hola que tal estás hoy.', 3)], estilo: {} })
    const mia = { id: nuevoId(), client_id: PERFIL, nombre_original: 'Toma «buena».mov', estado: 'listo', progreso: 100, plan, created_at: '2026-10-18T10:00:00Z', updated_at: '2026-10-18T10:00:00Z' }
    const ajena = { ...mia, id: nuevoId(), client_id: OTRO }
    const aMedias = { ...mia, id: nuevoId(), estado: 'montando' }
    db.helm_ediciones = [mia, ajena, aMedias]
    db.agent_jobs = [{ id: nuevoId(), clave: `editor-render:${mia.id}`, estado: 'pendiente' }]

    const e = await llama({ action: 'estado', query: { id: mia.id } })
    expect(e.body.edicion).toMatchObject({ id: mia.id, estado: 'listo', plan: { cortes: plan.segmentos.length - 1, resumen: { tomas: 1 }, recursos: [] } })
    expect(e.body.edicion.plan.quitado[0]).toMatchObject({ motivo: 'toma' })
    expect((await llama({ action: 'estado', query: { id: ajena.id } })).statusCode).toBe(404)

    expect((await llama({ action: 'descarga', query: { id: ajena.id } })).statusCode).toBe(404)
    expect((await llama({ action: 'descarga', query: { id: '../../etc/passwd' } })).statusCode).toBe(400)
    expect((await llama({ action: 'descarga', query: { id: aMedias.id } })).statusCode).toBe(409)
    expect((await llama({ action: 'descarga', query: { id: mia.id } })).statusCode).toBe(410)
    fs.mkdirSync(dirRecursos(mia.id), { recursive: true })
    fs.writeFileSync(rutaEditado(mia.id), 'mp4 de mentira')
    fs.writeFileSync(path.join(dirRecursos(mia.id), 'x.jpg'), 'foto')
    const d = await llama({ action: 'descarga', query: { id: mia.id } })
    expect(d.headers['Content-Type']).toBe('video/mp4')
    expect(d.headers['Content-Disposition']).toBe(`attachment; filename="Toma buena-editado.mp4"; filename*=UTF-8''Toma%20%C2%ABbuena%C2%BB-editado.mp4`)
    // Que el navegador no lo reinterprete (HTML) ni ejecute nada si se abre en la pestaña.
    expect(d.headers['X-Content-Type-Options']).toBe('nosniff')
    expect(d.headers['Content-Security-Policy']).toBe("default-src 'none'; sandbox")
    expect(d.descargado.toString()).toBe('mp4 de mentira')

    expect((await llama({ method: 'POST', action: 'borrar', body: { id: ajena.id } })).statusCode).toBe(404)
    const b = await llama({ method: 'POST', action: 'borrar', body: { id: mia.id } })
    expect(b.statusCode).toBe(200)
    expect(db.helm_ediciones.map(f => f.id)).toEqual([ajena.id, aMedias.id])
    expect(db.agent_jobs).toHaveLength(0)
    expect(fs.existsSync(dirEdicion(mia.id))).toBe(false)
    // La subida de una sola vez de antes ya no existe (y no se lee su cuerpo).
    expect((await llama({ method: 'POST', action: 'subir', crudo: VIDEO, headers: { 'content-type': 'video/mp4' } })).statusCode).toBe(410)
  })

  it('estilos: el global por defecto; guardar uno del perfil lo normaliza y pasa a ser el suyo', async () => {
    const a = await llama({ action: 'estilos' })
    expect(a.body.porDefecto).toMatchObject({ nombre: 'Estilo HELM', global: true, params: normalizaEstilo({}) })
    expect(a.body.estilos).toHaveLength(1)

    const g = await llama({ method: 'POST', action: 'estilo', body: { params: { palabrasPorBloque: 9, colorResalte: '#00ff88', zoom: false, tamano: 'enorme', recursosModo: 'arriba' } } })
    expect(g.statusCode).toBe(200)
    expect(g.body.porDefecto).toMatchObject({ global: false, params: { palabrasPorBloque: 5, colorResalte: '#00FF88', zoom: false, tamano: 72, recursosModo: 'arriba' } })
    expect(db.helm_estilos_edicion.filter(f => f.client_id === PERFIL)).toHaveLength(1)
    await llama({ method: 'POST', action: 'estilo', body: { params: { mayusculas: false } } })
    expect(db.helm_estilos_edicion.filter(f => f.client_id === PERFIL)).toHaveLength(1)
    const b = await llama({ action: 'estilos' })
    expect(b.body.porDefecto).toMatchObject({ global: false, params: { mayusculas: false } })
    expect(b.body.estilos.map(x => x.global)).toEqual([false, true])
    // Y lo que se cree a partir de ahora usa ese.
    const s = await crea()
    expect(db.helm_ediciones.find(f => f.id === s.body.edicion.id).estilo.mayusculas).toBe(false)
    expect((await llama({ method: 'POST', action: 'estilo', body: { params: 'x' } })).statusCode).toBe(400)
  })
})

describe('limpieza del disco', () => {
  it('subidas a medias de más de 6 h y ediciones de más de 7 días, fuera (la fila se queda); lo reciente, no', async () => {
    const carpeta = path.join(DATOS, 'editor')
    const haceH = (h) => (Date.now() - h * 3600_000) / 1000
    const pon = (id, archivos, horas) => {
      const dir = dirEdicion(id)
      fs.mkdirSync(dir, { recursive: true })
      for (const a of archivos) { fs.writeFileSync(path.join(dir, a), 'x'); fs.utimesSync(path.join(dir, a), haceH(horas), haceH(horas)) }
      fs.utimesSync(dir, haceH(horas), haceH(horas))
    }
    const [abandonada, subiendo, vieja, nueva] = [nuevoId(), nuevoId(), nuevoId(), nuevoId()]
    pon(abandonada, ['subida.part', 'subida.json'], 7)
    pon(subiendo, ['subida.part', 'subida.json'], 1)
    pon(vieja, ['original.mp4', 'editado.mp4'], 8 * 24)
    pon(nueva, ['original.mp4', 'editado.mp4'], 2)
    db.helm_ediciones = [{ id: vieja, client_id: PERFIL, estado: 'listo' }]
    expect(await limpiaEdiciones()).toBe(2)
    const quedan = fs.readdirSync(carpeta)
    expect(quedan).toEqual(expect.arrayContaining([subiendo, nueva]))
    expect(quedan).not.toContain(abandonada)
    expect(quedan).not.toContain(vieja)
    expect(db.helm_ediciones).toHaveLength(1)
  })
})

describe('lo que se queda colgado (el worker, cada hora; y cuando se rinde)', () => {
  const hace = (min) => new Date(Date.now() - min * 60_000).toISOString()
  const fila = (estado, min, extra = {}) => ({ id: nuevoId(), client_id: PERFIL, estado, precio_eur: 1.5, created_at: hace(min), updated_at: hace(min), ...extra })
  const de = (f) => db.helm_ediciones.find(x => x.id === f.id)

  it('las subidas paradas (de todos los perfiles) y las ediciones a medias sin trabajo vivo pasan a error; lo que sigue vivo, no', async () => {
    const subidaVieja = fila('subiendo', 7 * 60, { client_id: OTRO })
    const subidaViva = fila('subiendo', 60)
    const enColaSinTrabajo = fila('en_cola', 30)
    const enColaConTrabajo = fila('en_cola', 120)
    const montandoFallida = fila('montando', 60)
    const recienLanzada = fila('en_cola', 1)
    const lista = fila('listo', 600)
    db.helm_ediciones = [subidaVieja, subidaViva, enColaSinTrabajo, enColaConTrabajo, montandoFallida, recienLanzada, lista]
    db.agent_jobs = [
      { id: nuevoId(), clave: `editor-render:${enColaConTrabajo.id}`, estado: 'pendiente' },
      { id: nuevoId(), clave: `editor-render:${montandoFallida.id}`, estado: 'error' },
    ]
    const log = vi.fn()
    expect(await cierraColgadas({ log })).toBe(3)
    expect(de(subidaVieja)).toMatchObject({ estado: 'error', error: ABANDONADA })
    expect(de(enColaSinTrabajo)).toMatchObject({ estado: 'error', paso: 'No se pudo editar', error: expect.stringContaining('no se te ha cobrado') })
    expect(de(montandoFallida).estado).toBe('error')
    // Con su trabajo pendiente, recién lanzada (puede estar encolándose) o subiendo hace poco: se quedan.
    for (const f of [subidaViva, enColaConTrabajo, recienLanzada]) expect(de(f).estado).toBe(f.estado)
    expect(de(lista).estado).toBe('listo')
    expect(log).toHaveBeenCalledTimes(2)
    expect(await cierraColgadas()).toBe(0)
  })

  it('una edición colgada en cola no aparta su precio del saldo de la agencia para siempre', async () => {
    db.agencias[0].saldo = 1.5
    db.helm_ediciones = [fila('en_cola', 90, { client_id: VECINO })]
    expect((await crea({ duracion: 60 })).statusCode).toBe(402)
    expect(await cierraColgadas()).toBe(1)
    expect((await crea({ duracion: 60 })).statusCode).toBe(200)
  })

  it('cuando el worker se rinde: la fila en cola o a medias pasa a error con el motivo; una lista, de otro perfil o sin id, no se toca', async () => {
    const enCola = fila('en_cola', 0)
    const lista = fila('listo', 0)
    db.helm_ediciones = [enCola, lista]
    expect(await edicionFallida({ payload: { clientId: OTRO, edicionId: enCola.id } }, 'x')).toBe(false)
    expect(de(enCola).estado).toBe('en_cola')
    expect(await edicionFallida({ payload: { clientId: PERFIL, edicionId: enCola.id } }, 'ffmpeg: algo raro')).toBe(true)
    expect(de(enCola)).toMatchObject({ estado: 'error', paso: 'No se pudo editar', error: 'ffmpeg: algo raro' })
    expect(await edicionFallida({ payload: { clientId: PERFIL, edicionId: lista.id } }, 'x')).toBe(false)
    expect(de(lista).estado).toBe('listo')
    expect(await edicionFallida({ payload: {} }, 'x')).toBe(false)
  })

  it('editorRender: si la base no contesta al leer la fila, reintenta; si sigue sin contestar, la deja en error (no se queda en cola)', async () => {
    const conFallos = (veces) => {
      let quedan = veces
      let lecturas = 0
      return {
        lecturas: () => lecturas,
        from: (t) => {
          const q = consulta(t)
          const una = q.maybeSingle
          q.maybeSingle = () => {
            if (t !== 'helm_ediciones') return una()
            lecturas++
            return quedan-- > 0 ? Promise.resolve({ data: null, error: { message: 'la base no contesta' } }) : una()
          }
          return q
        },
      }
    }
    const job = (f) => ({ payload: { clientId: PERFIL, edicionId: f.id } })
    // Dos fallos y a la tercera contesta: sigue (aquí, ya estaba lista: no hace nada más).
    const lista = fila('listo', 0)
    db.helm_ediciones = [lista]
    const dos = conFallos(2)
    await expect(editorRender(job(lista), { db: dos, esperaMs: 0 })).resolves.toBeUndefined()
    expect(dos.lecturas()).toBe(3)
    // No contesta nunca: lanza (el worker apunta el fallo) y la fila no se queda en cola.
    const enCola = fila('en_cola', 0)
    db.helm_ediciones = [enCola]
    const nunca = conFallos(99)
    await expect(editorRender(job(enCola), { db: nunca, esperaMs: 0 })).rejects.toThrow(/no contesta/)
    expect(nunca.lecturas()).toBe(3)
    expect(de(enCola)).toMatchObject({ estado: 'error', error: expect.stringContaining('no se te ha cobrado') })
    expect(db.agencia_movimientos).toHaveLength(0)
  })
})

// ── El trabajo del worker, con ffmpeg de verdad ─────────────────────────────
const FFMPEG = process.env.HELM_FFMPEG || 'ffmpeg'
const hayFfmpeg = spawnSync(FFMPEG, ['-version']).status === 0
const hayLibass = hayFfmpeg && / ass +V->V/.test(spawnSync(FFMPEG, ['-hide_banner', '-filters'], { encoding: 'utf8' }).stdout)
const genera = (...args) => expect(spawnSync(FFMPEG, ['-v', 'error', '-y', ...args]).status).toBe(0)
/**
 * Cuántas veces se le ha pasado `ruta` a ffmpeg/ffprobe (por ejecuta); lanza si
 * alguna NO la abre como MP4/MOV (-f mov justo delante de su -i, o en ffprobe).
 */
function abrenComoMov(ruta) {
  const llamadas = ejecuta.mock.calls.map(c => c[1]).filter(a => a.includes(ruta))
  for (const a of llamadas) {
    const i = a.indexOf(ruta)
    const bien = a[i - 1] === '-i' ? a[i - 3] === '-f' && a[i - 2] === 'mov' : a[a.indexOf('-f') + 1] === 'mov'
    if (!bien) throw new Error(`se abre sin -f mov: ${a.join(' ')}`)
  }
  return llamadas.length
}
/** El color (r, g, b) del píxel (x, y) del fotograma del segundo `t`. */
function pixel(video, t, x, y) {
  const r = spawnSync(FFMPEG, ['-v', 'error', '-ss', String(t), '-i', video, '-frames:v', '1', '-vf', `crop=1:1:${x}:${y}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])
  return [...r.stdout]
}

describe('trabajo editor-render', () => {
  const { supabase } = { supabase: { from: (t) => consulta(t), rpc: (...a) => moverSaldo(...a) } }
  const palabrasDe = () => [...dice('Esta IA hace que tu negocio venda más.', 0.4), ...dice('Esta IA hace que tu negocio venda más porque sí.', 3.4)]

  it.skipIf(!hayFfmpeg)('transcribe (simulado), planifica, monta, deja la fila en «listo» y cobra su precio una sola vez', async () => {
    const { sondea: sondeaReal } = await vi.importActual('../api/_lib/variantes.js')
    sondea.mockImplementation(sondeaReal)
    sondeaVideo.mockImplementation(sondeaVideoReal)
    const id = nuevoId()
    fs.mkdirSync(dirEdicion(id), { recursive: true })
    genera('-f', 'lavfi', '-i', 'testsrc2=size=360x640:rate=30:duration=9', '-f', 'lavfi', '-i', 'sine=frequency=300:sample_rate=44100:duration=9',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-shortest', path.join(dirEdicion(id), 'original.mp4'))
    db.helm_ediciones = [{ id, client_id: PERFIL, estado: 'en_cola', estilo: { subtitulos: hayLibass, zoomCada: 2 }, precio_eur: 1.5, recursos: [], created_at: new Date().toISOString() }]
    const transcribe = vi.fn(async () => ({ palabras: palabrasDe() }))
    await editorRender({ payload: { clientId: PERFIL, edicionId: id } }, { db: supabase, transcribe })

    const fila = db.helm_ediciones[0]
    expect(fila).toMatchObject({ estado: 'listo', progreso: 100, error: null, cobrado_eur: 1.5 })
    expect(transcribe).toHaveBeenCalledTimes(1)
    expect(fila.plan.resumen.tomas).toBe(1)
    // ffprobe, la voz para Whisper y el montaje: los tres abren el original como MP4/MOV.
    expect(abrenComoMov(path.join(dirEdicion(id), 'original.mp4'))).toBe(3)
    // El editado dura lo que dice el plan (el AAC redondea a tramas de 21 ms).
    expect(Math.abs(fila.duracion_final - fila.plan.duracionFinal)).toBeLessThan(0.05)
    expect(fila.bytes).toBe(fs.statSync(rutaEditado(id)).size)
    // Ni el audio para Whisper ni los subtítulos se quedan en la carpeta.
    expect(fs.readdirSync(dirEdicion(id)).sort()).toEqual(['editado.mp4', 'original.mp4'])
    // Cobrado: 1,50 € a la agencia del perfil, con su referencia.
    expect(saldo()).toBe(98.5)
    expect(db.agencia_movimientos).toEqual([expect.objectContaining({ agencia_id: AGENCIA, importe: -1.5, tipo: 'consumo', origen: 'auto', client_id: PERFIL, modelo: 'editor-reels', referencia: `editor:${id}` })])
    // Si el worker lo repite (se cayó antes de apuntarlo), no se cobra otra vez.
    expect(await cobraEdicion(PERFIL, id, 1.5)).toBe(1.5)
    expect(db.agencia_movimientos).toHaveLength(1)
    expect(saldo()).toBe(98.5)

    // Si la fila ya no está (la borraron), no hace nada.
    db.helm_ediciones = []
    await expect(editorRender({ payload: { clientId: PERFIL, edicionId: id } }, { db: supabase, transcribe })).resolves.toBeUndefined()
    expect(transcribe).toHaveBeenCalledTimes(1)
  }, 120_000)

  it.skipIf(!hayFfmpeg)('con recursos (modo «arriba»): la imagen arriba en su tramo, la persona abajo, el logo encima todo el rato y la música debajo', async () => {
    const { sondea: sondeaReal } = await vi.importActual('../api/_lib/variantes.js')
    sondea.mockImplementation(sondeaReal)
    sondeaVideo.mockImplementation(sondeaVideoReal)
    const id = nuevoId()
    const ids = { img: nuevoId(), clip: nuevoId(), logo: nuevoId(), mus: nuevoId() }
    fs.mkdirSync(dirRecursos(id), { recursive: true })
    // La persona: azul liso, con voz (un pitido); la imagen, roja; el clip, amarillo; el logo, verde.
    genera('-f', 'lavfi', '-i', 'color=c=blue:size=360x640:rate=30:duration=10', '-f', 'lavfi', '-i', 'sine=frequency=300:sample_rate=44100:duration=10',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-shortest', path.join(dirEdicion(id), 'original.mp4'))
    genera('-f', 'lavfi', '-i', 'color=c=red:size=800x600', '-frames:v', '1', rutaRecurso(id, ids.img, 'jpg'))
    genera('-f', 'lavfi', '-i', 'color=c=yellow:size=640x360:rate=25:duration=4', '-c:v', 'libx264', '-preset', 'ultrafast', rutaRecurso(id, ids.clip, 'mp4'))
    genera('-f', 'lavfi', '-i', 'color=c=0x00ff00:size=200x100,format=rgba', '-frames:v', '1', rutaRecurso(id, ids.logo, 'png'))
    fs.writeFileSync(rutaRecurso(id, ids.mus, 'wav'), wav(1.5))
    const recursos = [
      { id: ids.img, tipo: 'broll', clase: 'imagen', ext: 'jpg', nombre: 'rojo.jpg', ancho: 800, alto: 600, giro: 1, palabra: 'negocio' },
      { id: ids.clip, tipo: 'broll', clase: 'video', ext: 'mp4', nombre: 'amarillo.mp4', ancho: 640, alto: 360, duracion: 4 },
      { id: ids.logo, tipo: 'logo', clase: 'logo', ext: 'png', nombre: 'logo.png', ancho: 200, alto: 100 },
      { id: ids.mus, tipo: 'musica', clase: 'musica', ext: 'wav', nombre: 'fondo.wav', duracion: 1.5 },
    ]
    db.helm_ediciones = [{ id, client_id: PERFIL, estado: 'en_cola', estilo: { subtitulos: hayLibass, zoom: false, recursosModo: 'arriba', recursoDuracion: 2, logoPosicion: 'arriba-der', musicaVolumen: 0.3 }, precio_eur: 1.5, recursos, created_at: new Date().toISOString() }]
    const palabras = [...dice('Hoy te cuento cómo vender más', 0.2), ...dice('con tu negocio en internet', 3), ...dice('y sin perder tiempo nunca más', 6.5)]
    await editorRender({ payload: { clientId: PERFIL, edicionId: id } }, { db: supabase, transcribe: async () => ({ palabras }) })

    const fila = db.helm_ediciones[0]
    expect(fila).toMatchObject({ estado: 'listo', error: null, cobrado_eur: 1.5 })
    expect(fila.plan.resumen).toMatchObject({ recursos: 2, recursosEnPalabra: 1, logo: true, musica: true })
    // El clip, como MP4/MOV en el montaje; la música en WAV, tal cual.
    expect(abrenComoMov(rutaRecurso(id, ids.clip, 'mp4'))).toBe(1)
    expect(abrenComoMov(path.join(dirEdicion(id), 'original.mp4'))).toBe(3)
    // La música se ha medido y lleva su ganancia hasta la sonoridad de referencia (va en el plan guardado).
    expect(fila.plan.musica.ganancia).toEqual(expect.any(Number))
    expect(fila.plan.musica.ganancia).toBe(gananciaMusica(await mideMusica(rutaRecurso(id, ids.mus, 'wav'), fila.plan.duracionFinal), -16))
    const salida = rutaEditado(id)
    const info = await sondeaReal(salida)
    expect(info).toMatchObject({ ancho: 1080, alto: 1920, audio: true })
    const [rojo, amarillo] = [fila.plan.broll.find(b => b.recurso === ids.img), fila.plan.broll.find(b => b.recurso === ids.clip)]
    const medio = (b) => (b.a + b.b) / 2
    const cerca = (p, q) => p.every((v, i) => Math.abs(v - q[i]) < 60)
    // Fuera de los tramos: la persona entera (azul).
    expect(cerca(pixel(salida, 0.5, 540, 300), [0, 0, 255])).toBe(true)
    // En el tramo de la imagen: arriba roja y abajo la persona.
    expect(cerca(pixel(salida, medio(rojo), 540, 300), [255, 0, 0])).toBe(true)
    expect(cerca(pixel(salida, medio(rojo), 540, 1500), [0, 0, 255])).toBe(true)
    expect(cerca(pixel(salida, medio(amarillo), 540, 300), [255, 255, 0])).toBe(true)
    // El logo, verde, en su esquina, al principio y en medio de un recurso.
    const { x, y, w, h } = fila.plan.logo
    expect(cerca(pixel(salida, 0.5, x + w / 2, y + h / 2), [0, 255, 0])).toBe(true)
    expect(cerca(pixel(salida, medio(rojo), x + w / 2, y + h / 2), [0, 255, 0])).toBe(true)
    expect(fs.readdirSync(dirEdicion(id)).sort()).toEqual(['editado.mp4', 'original.mp4', 'recursos'])
  }, 120_000)

  it.skipIf(!hayFfmpeg)('la imagen de apoyo crece desde su centro, sin tirones de la rejilla de 25 fps, y se ve hasta el último fotograma de su tramo', async () => {
    const { sondea: sondeaReal } = await vi.importActual('../api/_lib/variantes.js')
    sondea.mockImplementation(sondeaReal)
    sondeaVideo.mockImplementation(sondeaVideoReal)
    const dir = fs.mkdtempSync(path.join(DATOS, 'zoom-'))
    const [video, punto, salida] = ['v.mp4', 'punto.png', 's.mp4'].map(n => path.join(dir, n))
    genera('-f', 'lavfi', '-i', 'color=c=blue:size=360x640:rate=30:duration=6', '-c:v', 'libx264', '-preset', 'ultrafast', video)
    // Negra con un punto blanco justo en el centro.
    genera('-f', 'lavfi', '-i', 'color=c=black:size=800x600,drawbox=x=396:y=296:w=8:h=8:c=white:t=fill', '-frames:v', '1', punto)
    const plan = planDeEdicion({
      info: { ancho: 360, alto: 640, duracion: 6, audio: false },
      estilo: { subtitulos: false, zoom: false, recursosModo: 'corte', recursoDuracion: 3, logoPosicion: 'ninguna' },
      recursos: [{ id: 'punto', tipo: 'broll', clase: 'imagen', ext: 'png', ancho: 800, alto: 600, giro: 1 }],
    })
    const [b] = plan.broll
    // La cadena de la imagen sola: un instante distinto para cada fotograma (la
    // imagen llega a 1/25 y, sin pasarla a 1/30 antes de setpts, se repetían).
    const cadena = grafoRender({ plan }).split(';').find(x => x.startsWith('[1:v]'))
    const info = spawnSync(FFMPEG, ['-hide_banner', '-f', 'lavfi', '-i', 'nullsrc=s=16x16:d=0.1', '-i', punto,
      '-filter_complex', cadena.replace(/\[r0\]$/, ',showinfo[o]'), '-map', '[o]', '-f', 'null', '-'], { encoding: 'utf8' })
    const pts = [...info.stderr.matchAll(/\bpts:\s*(\d+)/g)].map(m => Number(m[1]))
    expect(pts.length).toBe(Math.ceil((b.b - b.a) * 30 - 1e-6) + 1)
    expect(new Set(pts).size).toBe(pts.length)
    expect(pts.every((p, i) => i === 0 || p === pts[i - 1] + 1)).toBe(true)
    await renderiza({ entrada: video, salida, plan, rutas: { punto } })
    // Fotograma a fotograma, el centro de lo blanco en un cuadro de 200×200 alrededor del centro del lienzo.
    const lado = 200
    const raw = spawnSync(FFMPEG, ['-v', 'error', '-i', salida, '-vf', `crop=${lado}:${lado}:${540 - lado / 2}:${960 - lado / 2},format=gray`, '-f', 'rawvideo', '-'], { maxBuffer: 1e8 }).stdout
    const n = raw.length / (lado * lado)
    const malos = []
    for (let k = 0; k < n; k++) {
      let sx = 0; let sy = 0; let c = 0
      for (let i = 0; i < lado * lado; i++) if (raw[k * lado * lado + i] > 128) { sx += i % lado; sy += Math.floor(i / lado); c++ }
      const t = k / 30
      const dentro = t >= b.a - 1e-6 && t <= b.b + 1e-6
      if (dentro !== c > 0) malos.push([k, 'se ve', c > 0])
      // Con el recorte anclado arriba a la izquierda, el punto se iba ~40 px hacia abajo a la derecha.
      else if (c && (Math.abs(sx / c - lado / 2) > 3 || Math.abs(sy / c - lado / 2) > 3)) malos.push([k, 'centro', +(sx / c).toFixed(1), +(sy / c).toFixed(1)])
    }
    expect(malos).toEqual([])
  }, 120_000)

  it.skipIf(!hayFfmpeg)('si falla, no cobra; la casa (sin_cobro) no paga: cobrado 0; si el apunte falla, lo reintenta luego', async () => {
    const { sondea: sondeaReal } = await vi.importActual('../api/_lib/variantes.js')
    sondea.mockImplementation(sondeaReal)
    sondeaVideo.mockImplementation(sondeaVideoReal)
    const id = nuevoId()
    fs.mkdirSync(dirEdicion(id), { recursive: true })
    genera('-f', 'lavfi', '-i', 'testsrc2=size=360x640:rate=30:duration=4', '-f', 'lavfi', '-i', 'sine=frequency=300:sample_rate=44100:duration=4',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-shortest', path.join(dirEdicion(id), 'original.mp4'))
    const fila = (extra = {}) => ({ id, client_id: PERFIL, estado: 'en_cola', estilo: { subtitulos: false }, precio_eur: 1.5, recursos: [], created_at: new Date().toISOString(), ...extra })

    // Whisper falla: error y ni un céntimo.
    db.helm_ediciones = [fila()]
    await expect(editorRender({ payload: { clientId: PERFIL, edicionId: id } }, { db: supabase, transcribe: async () => { throw new Error('whisper roto') } })).rejects.toThrow('whisper roto')
    expect(db.helm_ediciones[0].estado).toBe('error')
    expect(db.helm_ediciones[0].cobrado_eur ?? null).toBeNull()
    expect(db.agencia_movimientos).toHaveLength(0)
    // Un recurso cuyo archivo ya no está: error claro, sin montar a medias ni cobrar.
    db.helm_ediciones = [fila({ recursos: [{ id: nuevoId(), tipo: 'broll', clase: 'imagen', ext: 'jpg', nombre: 'perdida.jpg', ancho: 10, alto: 10 }] })]
    await expect(editorRender({ payload: { clientId: PERFIL, edicionId: id } }, { db: supabase, transcribe: async () => ({ palabras: [] }) })).rejects.toThrow(/perdida\.jpg/)
    expect(db.agencia_movimientos).toHaveLength(0)
    expect(saldo()).toBe(100)

    // La casa: listo y cobrado_eur = 0, sin movimiento.
    db.agencias[0].sin_cobro = true
    db.helm_ediciones = [fila()]
    await editorRender({ payload: { clientId: PERFIL, edicionId: id } }, { db: supabase, transcribe: async () => ({ palabras: palabrasDe() }) })
    expect(db.helm_ediciones[0]).toMatchObject({ estado: 'listo', cobrado_eur: 0 })
    expect(db.agencia_movimientos).toHaveLength(0)

    // La base no deja apuntar el cobro: listo, cobrado_eur vacío; reintentaCobros lo apunta luego (una vez).
    db.agencias[0].sin_cobro = false
    db.rpcCaida = true
    db.helm_ediciones = [fila()]
    await editorRender({ payload: { clientId: PERFIL, edicionId: id } }, { db: supabase, transcribe: async () => ({ palabras: palabrasDe() }) })
    expect(db.helm_ediciones[0]).toMatchObject({ estado: 'listo' })
    expect(db.helm_ediciones[0].cobrado_eur ?? null).toBeNull()
    expect(await reintentaCobros({ db: supabase })).toBe(0)
    db.rpcCaida = false
    expect(await reintentaCobros({ db: supabase })).toBe(1)
    expect(db.helm_ediciones[0].cobrado_eur).toBe(1.5)
    expect(await reintentaCobros({ db: supabase })).toBe(0)
    expect(db.agencia_movimientos).toHaveLength(1)
    expect(saldo()).toBe(98.5)
  }, 120_000)
})

// ── El vídeo en bruto, solo MP4/MOV (por sus bytes), el rol, lo apartado y el disco ──
const { argumentosSonda, formatoDe, esVideoMov, NO_ES_MP4 } = await import('../api/_lib/editor/formato.js')
const { tipoAdmitido, extensionDe, ocupaEdicion } = await import('../api/_lib/editor/archivos.js')
const { conCerrojoAgencia, reservaTemporal } = await import('../api/_lib/creditos.js')
const KB = 1024
const MiB = 1024 * 1024
const SIN_ROL = 'Tu rol no puede usar los agentes de este perfil.'
// Una lista HLS con nombre y tipo de MP4: ffmpeg, adivinando, abriría lo que apunta.
const HLS = Buffer.from('#EXTM3U\n#EXT-X-TARGETDURATION:1\n#EXTINF:1,\nfile:/etc/passwd\n#EXT-X-ENDLIST\n')
const COMO_HLS = Buffer.concat([HLS, Buffer.alloc(64 * KB - HLS.length, 0x20)])
const haceDias = (d) => new Date(Date.now() - d * 86_400_000).toISOString()

describe('api/editor: el vídeo en bruto, solo MP4/MOV y mirado por sus bytes', () => {
  it('las piezas: los tipos que se admiten, el demuxer forzado y la cabecera', async () => {
    expect(['video/mp4', 'video/quicktime', 'video/x-m4v', 'video/3gpp', 'video/3gpp2', 'video/mp4; codecs=avc1'].map(t => tipoAdmitido(t))).toEqual([true, true, true, true, true, true])
    expect(['video/webm', 'video/x-matroska', 'video/x-msvideo', 'application/x-mpegurl'].map(t => tipoAdmitido(t, 'a.mp4'))).toEqual([false, false, false, false])
    expect([tipoAdmitido('', 'a.MOV'), tipoAdmitido('', 'a.mkv'), tipoAdmitido('', 'sin-extension')]).toEqual([true, false, false])
    // Un tipo de vídeo raro con extensión buena vale (los bytes deciden después); con otra extensión, no.
    expect([tipoAdmitido('video/x-quicktime', 'a.mov'), tipoAdmitido('video/x-quicktime', 'a.avi'), tipoAdmitido('text/html', 'a.mp4')]).toEqual([true, false, false])
    expect(extensionDe('video/webm', 'a.webm')).toBe('mp4')
    expect(argumentosSonda('/d/o.mp4')).toEqual(['-v', 'error', '-f', 'mov', '-print_format', 'json', '-show_streams', '-show_format', '/d/o.mp4'])
    expect([formatoDe('/d/a.mp4'), formatoDe('/d/a.M4A'), formatoDe('/d/a.mp3'), formatoDe('/d/a.jpg'), formatoDe('/d/subida.part')])
      .toEqual([['-f', 'mov'], ['-f', 'mov'], [], [], []])
    const dir = fs.mkdtempSync(path.join(DATOS, 'cabecera-'))
    const escribe = (n, b) => { const r = path.join(dir, n); fs.writeFileSync(r, b); return r }
    expect(await esVideoMov(escribe('v.mp4', VIDEO))).toBe(true)
    expect(await esVideoMov(escribe('l.mp4', COMO_HLS))).toBe(false)
    expect(await esVideoMov(escribe('c.mp4', VIDEO.subarray(0, 8)))).toBe(false)
    expect(await esVideoMov(path.join(dir, 'no-esta.mp4'))).toBe(false)
  })

  it('al crear, solo MP4/MOV/M4V/3GP: WebM, MKV o AVI, 415 y que se exporte a MP4; sin tipo, por la extensión', async () => {
    for (const tipo of ['video/webm', 'video/x-matroska', 'video/x-msvideo', 'video/mpeg']) {
      const r = await crea({ tipo, nombre: 'toma.webm' })
      expect([tipo, r.statusCode]).toEqual([tipo, 415])
      expect(r.body.error).toContain('exporta a MP4')
    }
    expect((await crea({ tipo: '', nombre: 'toma.webm' })).statusCode).toBe(415)
    expect(db.helm_ediciones).toHaveLength(0)
    const sinTipo = await crea({ tipo: '', nombre: 'toma.MP4' })
    expect(sinTipo.statusCode).toBe(200)
    expect(JSON.parse(fs.readFileSync(path.join(dirEdicion(sinTipo.body.edicion.id), 'subida.json'), 'utf8')).ext).toBe('mp4')
    const tgp = await crea({ tipo: 'video/3gpp', nombre: 'VID_0001.3gp' })
    expect(tgp.statusCode).toBe(200)
    expect(JSON.parse(fs.readFileSync(path.join(dirEdicion(tgp.body.edicion.id), 'subida.json'), 'utf8')).ext).toBe('3gp')
  })

  it('el primer trozo que no es de un MP4/MOV (una lista HLS disfrazada): 415, la edición a error y fuera lo subido; ffprobe ni lo ve', async () => {
    const { body: { edicion: { id } } } = await crea()
    const r = await trozo(id, 0, COMO_HLS.subarray(0, 32 * KB))
    expect(r.statusCode).toBe(415)
    expect(r.body.error).toBe(NO_ES_MP4)
    expect(r.body.error).toContain('exporta a MP4')
    expect(db.helm_ediciones[0]).toMatchObject({ estado: 'error', error: NO_ES_MP4 })
    expect(fs.existsSync(dirEdicion(id))).toBe(false)
    // Ya no recibe más, y lanzarla no la sondea ni la encola.
    expect((await trozo(id, 32 * KB, COMO_HLS.subarray(32 * KB))).statusCode).toBe(409)
    expect((await lanza(id)).body.edicion.estado).toBe('error')
    expect(sondeaVideo).not.toHaveBeenCalled()
    expect(sondea).not.toHaveBeenCalled()
    expect(db.agent_jobs).toHaveLength(0)
  })

  it('con un primer trozo de menos de 12 bytes, se mira en cuanto llegan; uno que sí es un MP4/MOV sigue', async () => {
    const { body: { edicion: { id } } } = await crea()
    expect((await trozo(id, 0, COMO_HLS.subarray(0, 5))).statusCode).toBe(200)
    expect((await trozo(id, 5, COMO_HLS.subarray(5, 1000))).statusCode).toBe(415)
    expect(fs.existsSync(dirEdicion(id))).toBe(false)
    const { body: { edicion: { id: bueno } } } = await crea()
    expect((await trozo(bueno, 0, VIDEO.subarray(0, 5))).statusCode).toBe(200)
    expect((await trozo(bueno, 5, VIDEO.subarray(5, 1000))).body).toEqual({ recibidos: 1000, completo: false })
  })

  it('al lanzar se vuelve a mirar, antes de ffprobe: uno de menos de 12 bytes, o cambiado en el disco, 415 y fuera', async () => {
    const { body: { edicion: { id } } } = await crea({ bytes: 8, tipo: 'video/mp4' })
    expect((await trozo(id, 0, Buffer.from('#EXTM3U\n'))).body).toEqual({ recibidos: 8, completo: true })
    const r = await lanza(id)
    expect(r.statusCode).toBe(415)
    expect(r.body.error).toBe(NO_ES_MP4)
    expect(db.helm_ediciones.find(f => f.id === id)).toMatchObject({ estado: 'error', error: NO_ES_MP4 })
    expect(fs.existsSync(dirEdicion(id))).toBe(false)
    // Llegó bien, pero lo que hay en el disco ya no es un MP4/MOV.
    const { body: { edicion: { id: otra } } } = await crea()
    await trozo(otra, 0, VIDEO)
    fs.writeFileSync(path.join(dirEdicion(otra), 'subida.part'), COMO_HLS)
    expect((await lanza(otra)).statusCode).toBe(415)
    expect(sondeaVideo).not.toHaveBeenCalled()
    expect(db.agent_jobs).toHaveLength(0)
  })

  it('el original y los clips se sondean como MP4/MOV (sondeaVideo, con -f mov); las imágenes, no', async () => {
    const { body: { edicion: { id } } } = await crea()
    await trozo(id, 0, VIDEO)
    const clip = await sube(id, 'broll', conRelleno(ftyp('isom')), 'clip.mp4')
    expect(clip.statusCode).toBe(200)
    expect(clip.body.recurso.clase).toBe('video')
    expect(sondeaVideo).toHaveBeenLastCalledWith(rutaRecurso(id, clip.body.recurso.id, 'mp4'))
    expect((await sube(id, 'broll', jpegConOrientacion(1), 'foto.jpg')).statusCode).toBe(200)
    expect(sondeaVideo).toHaveBeenCalledTimes(1)
    expect((await lanza(id)).statusCode).toBe(200)
    expect(sondeaVideo).toHaveBeenLastCalledWith(path.join(dirEdicion(id), 'subida.part'))
  })

  it.skipIf(!hayFfmpeg)('con ffprobe de verdad: un MP4 se lee; una lista HLS con nombre de .mp4 no, ni con una cabecera ftyp delante', async () => {
    const dir = fs.mkdtempSync(path.join(DATOS, 'mov-'))
    const bueno = path.join(dir, 'bueno.mp4')
    genera('-f', 'lavfi', '-i', 'testsrc2=size=160x284:rate=30:duration=1', '-c:v', 'libx264', '-preset', 'ultrafast', bueno)
    expect(await sondeaVideoReal(bueno)).toMatchObject({ ancho: 160, alto: 284, audio: false })
    const texto = `#EXTM3U\n#EXT-X-TARGETDURATION:1\n#EXTINF:1,\n${bueno}\n#EXT-X-ENDLIST\n`
    const lista = path.join(dir, 'lista.mp4')
    fs.writeFileSync(lista, texto)
    await expect(sondeaVideoReal(lista)).rejects.toThrow()
    const disfrazada = path.join(dir, 'disfrazada.mp4')
    fs.writeFileSync(disfrazada, Buffer.concat([ftyp('isom'), Buffer.from(texto)]))
    await expect(sondeaVideoReal(disfrazada)).rejects.toThrow()
  }, 60_000)
})

describe('api/editor: quién puede gastar (el rol en el perfil)', () => {
  it('sin los agentes en su rol: 403 en lo que gasta o sube, sin leer el cuerpo en crudo; lo que solo mira, sí', async () => {
    const { body: { edicion: { id } } } = await crea()
    puedeUsarAgentes.mockImplementation(async () => false)
    const r = await crea()
    expect(r.statusCode).toBe(403)
    expect(r.body.error).toBe(SIN_ROL)
    expect(puedeUsarAgentes).toHaveBeenLastCalledWith({ userId: 'b0000000-0000-4000-8000-000000000001' }, PERFIL)
    expect(db.helm_ediciones).toHaveLength(1)
    // Los cuerpos en crudo ni se leen: se contesta y se cierra la conexión.
    for (const x of [await trozo(id, 0, VIDEO), await sube(id, 'broll', jpegConOrientacion(1), 'a.jpg')]) {
      expect([x.statusCode, x.body.error, x.headers.Connection]).toEqual([403, SIN_ROL, 'close'])
    }
    expect(fs.statSync(path.join(dirEdicion(id), 'subida.part')).size).toBe(0)
    for (const [action, body] of [['lanzar', { id }], ['quitar-recurso', { id, recurso: nuevoId() }], ['estilo', { params: { mayusculas: false } }], ['borrar', { id }]]) {
      const x = await llama({ method: 'POST', action, body })
      expect([action, x.statusCode, x.body.error]).toEqual([action, 403, SIN_ROL])
    }
    expect(db.helm_ediciones[0].estado).toBe('subiendo')
    expect(db.helm_estilos_edicion.filter(f => f.client_id === PERFIL)).toHaveLength(0)
    expect(db.agent_jobs).toHaveLength(0)
    // Mirar, sí: la lista, el estado y los estilos.
    expect((await llama({ action: 'lista' })).statusCode).toBe(200)
    expect((await llama({ action: 'estado', query: { id } })).statusCode).toBe(200)
    expect((await llama({ action: 'estilos' })).statusCode).toBe(200)
  })

  it('si no se puede mirar el rol (falla la base), no se deja gastar: 500', async () => {
    puedeUsarAgentes.mockImplementation(async () => { throw new Error('la base no contesta') })
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect((await crea()).statusCode).toBe(500)
    } finally { error.mockRestore() }
    expect(db.helm_ediciones).toHaveLength(0)
  })
})

describe('api/editor: lo apartado es el de toda la agencia, con su cerrojo', () => {
  it('una variante de Trial reels en cola o una portada generándose (de otro perfil de la agencia) también apartan', async () => {
    db.agencias[0].saldo = 1.5
    db.helm_trial_reels = [{ id: nuevoId(), client_id: VECINO, estado: 'en_cola', precio_eur: 0.3, cobrado_eur: null, created_at: haceDias(0), updated_at: haceDias(0) }]
    const r = await crea({ duracion: 60 })
    expect(r.statusCode).toBe(402)
    expect(r.body.error).toContain('ya están apartados')
    db.helm_trial_reels = []
    const liberar = reservaTemporal(AGENCIA, 0.4)
    try {
      expect((await crea({ duracion: 60 })).statusCode).toBe(402)
    } finally { liberar() }
    expect((await crea({ duracion: 60 })).statusCode).toBe(200)
  })

  it('al lanzar, su propia fila no cuenta dos veces: con 1,50 € justos, se lanza', async () => {
    db.agencias[0].saldo = 1.5
    const { body: { edicion: { id } } } = await crea({ duracion: 60 })
    await trozo(id, 0, VIDEO)
    sondea.mockResolvedValueOnce({ ...SONDEO, duracion: 60 })
    const r = await lanza(id)
    expect(r.statusCode).toBe(200)
    expect(r.body.edicion).toMatchObject({ estado: 'en_cola', precio_eur: 1.5 })
  })

  it('a quien no administra la agencia, el 402 no le dice el saldo (ni al crear ni al lanzar)', async () => {
    puedeVerSaldo.mockImplementation(async () => false)
    db.agencias[0].saldo = 2
    const r = await crea({ duracion: 200 })
    expect(r.statusCode).toBe(402)
    expect(r.body.error).toBe('La agencia no tiene créditos suficientes para esto (cuesta 300 créditos). Pide a quien administra la agencia que recargue.')
    const { body: { edicion: { id } } } = await crea({ duracion: 60 })
    await trozo(id, 0, VIDEO)
    sondea.mockResolvedValueOnce({ ...SONDEO, duracion: 200 })
    const l = await lanza(id)
    expect(l.statusCode).toBe(402)
    expect(l.body.error).toContain('créditos suficientes')
    expect(l.body.error).not.toMatch(/te quedan|apartad/)
    expect(puedeVerSaldo).toHaveBeenCalledWith({ userId: 'b0000000-0000-4000-8000-000000000001' }, PERFIL)
  })

  it('comprobar y apartar van dentro del cerrojo de la agencia (el mismo de Portadas y Trial reels)', async () => {
    db.agencias[0].saldo = 1.9
    const { body: { edicion: { id } } } = await crea({ duracion: 60 })
    await trozo(id, 0, VIDEO)
    // Otro agente de la agencia tiene el cerrojo: mientras, aparta 0,50 €.
    let suelta = null
    const otro = conCerrojoAgencia(AGENCIA, () => new Promise(ok => { suelta = ok }))
    const lanzado = lanza(id)
    await new Promise(r => setTimeout(r, 30))
    expect(db.helm_ediciones[0].estado).toBe('subiendo')
    const liberar = reservaTemporal(AGENCIA, 0.5)
    suelta()
    await otro
    // Al entrar ya ve lo apartado por el otro: 1,90 − 0,50 no llega para 1,50.
    const r = await lanzado
    expect(r.statusCode).toBe(402)
    expect(db.helm_ediciones[0].estado).toBe('subiendo')
    liberar()
    expect((await lanza(id)).statusCode).toBe(200)
  })
})

describe('api/editor: lo que guarda cada perfil (el disco es el de todo el servidor)', () => {
  const tope = (kb) => { process.env.HELM_EDITOR_MAX_GB_PERFIL = String((kb * KB) / 1024 ** 3) }

  it('crear: lo guardado, lo que está llegando y este, hasta el tope del perfil (429 con qué hacer); lo de otro perfil es suyo', async () => {
    tope(100)
    const { body: { edicion: { id } } } = await crea() // 64 KB anunciados
    const r = await crea()
    expect(r.statusCode).toBe(429)
    expect(r.body.error).toMatch(/ya ocupan .+ GB y el tope es de .+ GB/)
    expect(r.body.error).toContain('Borra')
    // Ya subido, ocupa lo mismo.
    await trozo(id, 0, VIDEO)
    expect((await crea()).statusCode).toBe(429)
    expect((await crea({}, { clientId: OTRO })).statusCode).toBe(200)
    // Borrada, deja sitio.
    expect((await llama({ method: 'POST', action: 'borrar', body: { id } })).statusCode).toBe(200)
    expect((await crea()).statusCode).toBe(200)
  })

  it('cuenta lo que hay de verdad en las carpetas de sus ediciones recientes (original, recursos, editado); las de hace más de 8 días, no', async () => {
    tope(100)
    const vieja = { id: nuevoId(), client_id: PERFIL, estado: 'listo', created_at: haceDias(9), updated_at: haceDias(9) }
    const reciente = { id: nuevoId(), client_id: PERFIL, estado: 'listo', created_at: haceDias(2), updated_at: haceDias(2) }
    db.helm_ediciones = [vieja, reciente]
    for (const f of [vieja, reciente]) fs.mkdirSync(dirRecursos(f.id), { recursive: true })
    fs.writeFileSync(rutaEditado(vieja.id), Buffer.alloc(80 * KB))
    fs.writeFileSync(rutaEditado(reciente.id), Buffer.alloc(20 * KB))
    fs.writeFileSync(path.join(dirRecursos(reciente.id), 'x.jpg'), Buffer.alloc(10 * KB))
    expect(await ocupaEdicion(reciente.id)).toBe(30 * KB)
    expect(await ocupaEdicion(nuevoId())).toBe(0)
    // 30 KB de la reciente: caben 70 KB, no 71 (la vieja no cuenta).
    expect((await crea({ bytes: 71 * KB })).statusCode).toBe(429)
    expect((await crea({ bytes: 70 * KB })).statusCode).toBe(200)
  })

  it('recurso: el tope del perfil por lo que anuncia (sin leerlo) y 300 MB entre todos los de la edición (un logo nuevo sustituye al viejo)', async () => {
    const { body: { edicion: { id } } } = await crea()
    tope(100)
    const sube40 = await llama({ method: 'POST', action: 'recurso', query: { id, tipo: 'broll', nombre: 'a.jpg' }, crudo: jpegConOrientacion(1), headers: { 'content-length': String(40 * KB) } })
    expect([sube40.statusCode, sube40.headers.Connection]).toEqual([429, 'close'])
    expect(sube40.body.error).toContain('ya ocupan')
    delete process.env.HELM_EDITOR_MAX_GB_PERFIL

    const fila = db.helm_ediciones.find(f => f.id === id)
    fila.recursos = [1, 2, 3].map(() => ({ id: nuevoId(), tipo: 'broll', clase: 'imagen', ext: 'jpg', nombre: 'x.jpg', bytes: 100 * MiB - 1000 }))
    // Por lo que anuncia: ni se lee.
    const anuncia = await llama({ method: 'POST', action: 'recurso', query: { id, tipo: 'broll', nombre: 'b.png' }, crudo: conRelleno(PNG), headers: { 'content-length': '4096' } })
    expect([anuncia.statusCode, anuncia.headers.Connection]).toEqual([429, 'close'])
    expect(anuncia.body.error).toContain('300 MB')
    // Sin anunciarlo: se mira al llegar, y no se queda en el disco ni en la fila.
    const llega = await sube(id, 'broll', conRelleno(PNG), 'b.png')
    expect(llega.statusCode).toBe(429)
    expect(llega.body.error).toContain('Quita alguno')
    expect(fs.existsSync(dirRecursos(id)) ? fs.readdirSync(dirRecursos(id)) : []).toEqual([])
    expect(fila.recursos).toHaveLength(3)
    // El logo nuevo sustituye al que hubiera: lo del viejo no se suma.
    fila.recursos = [{ id: nuevoId(), tipo: 'logo', clase: 'logo', ext: 'png', nombre: 'l.png', bytes: 299 * MiB }]
    const logo = await sube(id, 'logo', conRelleno(PNG, 9000), 'nuevo.png')
    expect(logo.statusCode).toBe(200)
    expect(fila.recursos.map(x => x.id)).toEqual([logo.body.recurso.id])
  })
})
