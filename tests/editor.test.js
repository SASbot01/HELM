// Editor de reels: qué se corta (api/_lib/editor/tomas.js), los subtítulos
// (subtitulos.js), el plan (plan.js), los argumentos de ffmpeg (render.js,
// sin lanzar nada), la API (api/editor.js) con Supabase simulado y el trabajo
// del worker (trabajo.js) con ffmpeg de verdad y Whisper simulado. El montaje
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
const { planDeEdicion, saltosDeZoom, tramosDe, resumenDePlan } = await import('../api/_lib/editor/plan.js')
const { grafoRender, argumentosRender, valorFiltro, segundosDeProgreso, DIR_FUENTES, presetPara } = await import('../api/_lib/editor/render.js')
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

// ── api/editor.js ───────────────────────────────────────────────────────────
const PERFIL = 'c0000000-0000-4000-8000-0000000000c1'
const OTRO = 'c0000000-0000-4000-8000-0000000000c2'
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
          .map(r => ({ id: nuevoId(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...r }))
        filas().push(...nuevas)
        data = structuredClone(nuevas)
      } else if (op === 'update') {
        const tocadas = filas().filter(encaja)
        tocadas.forEach(f => Object.assign(f, datos))
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

vi.mock('../api/lib/supabase.js', () => ({ supabase: { from: (t) => consulta(t) } }))
vi.mock('../api/_lib/access.js', () => ({ requireProfileAccess: vi.fn(async () => ({ userId: 'b0000000-0000-4000-8000-000000000001' })) }))
vi.mock('../api/_lib/variantes.js', async (original) => ({
  ...(await original()),
  sondea: vi.fn(async () => ({ ancho: 1080, alto: 1920, duracion: 12.5, audio: true })),
}))

const { default: editor } = await import('../api/editor.js')
const { sondea } = await import('../api/_lib/variantes.js')
const { rutaEditado, dirEdicion } = await import('../api/_lib/editor/archivos.js')

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
  const req = crudo ? Readable.from(crudo) : Readable.from([])
  Object.assign(req, {
    method, query: { action, clientId: PERFIL, ...query }, body,
    headers: { 'x-forwarded-for': `10.8.0.${++ip}`, ...headers }, socket: {},
  })
  await editor(req, res)
  res.descargado = Buffer.concat(trozos)
  return res
}
const video = (bytes = 64 * 1024) => [Buffer.alloc(bytes / 2, 1), Buffer.alloc(bytes / 2, 2)]

beforeEach(() => {
  db.helm_ediciones = []
  db.helm_estilos_edicion = [{ id: nuevoId(), client_id: null, nombre: 'Estilo HELM', params: { ...ESTILO_POR_DEFECTO }, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }]
  db.agent_jobs = []
  sondea.mockClear()
  delete process.env.HELM_EDITOR_MAX_MB
})

describe('api/editor', () => {
  it('subir: lo escribe a disco según llega, crea la fila con el estilo y encola el trabajo', async () => {
    const r = await llama({ method: 'POST', action: 'subir', crudo: video(), headers: { 'content-type': 'video/quicktime', 'x-nombre': encodeURIComponent('Mi vídeo «uno».MOV'), 'content-length': String(64 * 1024) } })
    expect(r.statusCode).toBe(200)
    const { id } = r.body
    expect(Object.keys(r.body)).toEqual(['id'])
    const original = path.join(dirEdicion(id), 'original.mov')
    expect(fs.statSync(original).size).toBe(64 * 1024)
    expect(fs.existsSync(`${original}.part`)).toBe(false)
    expect(db.helm_ediciones[0]).toMatchObject({ id, client_id: PERFIL, nombre_original: 'Mi vídeo «uno».MOV', estado: 'en_cola', duracion_original: 12.5 })
    expect(db.helm_ediciones[0].estilo).toEqual(normalizaEstilo(ESTILO_POR_DEFECTO))
    expect(db.agent_jobs).toHaveLength(1)
    expect(db.agent_jobs[0]).toMatchObject({ tipo: 'editor-render', clave: `editor-render:${id}`, payload: { clientId: PERFIL, edicionId: id }, estado: 'pendiente', max_intentos: 1 })
  })

  it('subir: no es vídeo (415), pesa demasiado (413, con o sin Content-Length) o no se puede leer (422)', async () => {
    const carpetas = () => (fs.existsSync(path.join(DATOS, 'editor')) ? fs.readdirSync(path.join(DATOS, 'editor')).sort() : [])
    const antes = carpetas()
    expect((await llama({ method: 'POST', action: 'subir', crudo: video(), headers: { 'content-type': 'application/json' } })).statusCode).toBe(415)
    process.env.HELM_EDITOR_MAX_MB = '0.01' // ~10 KB
    expect((await llama({ method: 'POST', action: 'subir', crudo: video(), headers: { 'content-type': 'video/mp4', 'content-length': String(64 * 1024) } })).statusCode).toBe(413)
    const sinLargo = await llama({ method: 'POST', action: 'subir', crudo: video(), headers: { 'content-type': 'video/mp4' } })
    expect(sinLargo.statusCode).toBe(413)
    delete process.env.HELM_EDITOR_MAX_MB
    sondea.mockRejectedValueOnce(new Error('ffprobe'))
    expect((await llama({ method: 'POST', action: 'subir', crudo: video(), headers: { 'content-type': 'video/mp4' } })).statusCode).toBe(422)
    sondea.mockResolvedValueOnce({ ancho: 1080, alto: 1920, duracion: 3600, audio: true })
    expect((await llama({ method: 'POST', action: 'subir', crudo: video(), headers: { 'content-type': 'video/mp4' } })).statusCode).toBe(422)
    // Nada a medias: ni filas, ni trabajos, ni carpetas.
    expect(db.helm_ediciones).toHaveLength(0)
    expect(db.agent_jobs).toHaveLength(0)
    expect(carpetas()).toEqual(antes)
  })

  it('subir: con 3 a medias en el perfil, no deja más; y un perfil que no es uuid, 400', async () => {
    db.helm_ediciones = ['en_cola', 'transcribiendo', 'montando'].map(estado => ({ id: nuevoId(), client_id: PERFIL, estado }))
    expect((await llama({ method: 'POST', action: 'subir', crudo: video(), headers: { 'content-type': 'video/mp4' } })).statusCode).toBe(429)
    expect((await llama({ method: 'POST', action: 'subir', query: { clientId: 'x' }, crudo: video(), headers: { 'content-type': 'video/mp4' } })).statusCode).toBe(400)
  })

  it('lista: solo las del perfil, con los campos del contrato y nada más', async () => {
    const viejo = new Date(Date.now() - 5 * 3600_000).toISOString()
    db.helm_ediciones = [
      { id: nuevoId(), client_id: PERFIL, nombre_original: 'a.mp4', estado: 'listo', progreso: 100, paso: 'Listo', duracion_original: '60.50', duracion_final: '41.20', bytes: 10, plan: {}, error: null, created_at: '2026-10-18T10:00:00Z', updated_at: '2026-10-18T10:05:00Z' },
      { id: nuevoId(), client_id: PERFIL, nombre_original: 'b.mp4', estado: 'subiendo', progreso: 0, created_at: viejo, updated_at: viejo },
      { id: nuevoId(), client_id: OTRO, nombre_original: 'c.mp4', estado: 'listo', created_at: viejo, updated_at: viejo },
    ]
    const r = await llama({ action: 'lista' })
    expect(r.body.ediciones).toHaveLength(2)
    const a = r.body.ediciones.find(x => x.nombre_original === 'a.mp4')
    const b = r.body.ediciones.find(x => x.nombre_original === 'b.mp4')
    // De la más nueva a la más vieja.
    expect(r.body.ediciones.map(x => x.nombre_original)).toEqual(['b.mp4', 'a.mp4'])
    expect(Object.keys(a).sort()).toEqual(['created_at', 'duracion_final', 'duracion_original', 'error', 'estado', 'id', 'nombre_original', 'paso', 'progreso'].sort())
    expect(a).toMatchObject({ estado: 'listo', progreso: 100, duracion_original: 60.5, duracion_final: 41.2 })
    // Una subida de hace horas que no acabó sale como error.
    expect(b).toMatchObject({ estado: 'error', error: expect.stringContaining('subida') })
  })

  it('estado, descarga (404 / 409 / 410 / adjunto) y borrar', async () => {
    const plan = planDeEdicion({ info: { ancho: 1080, alto: 1920, duracion: 10, audio: true }, palabras: [...dice('Hola hola que tal.', 0.5), ...dice('Hola hola que tal estás hoy.', 3)], estilo: {} })
    const mia = { id: nuevoId(), client_id: PERFIL, nombre_original: 'Toma «buena».mov', estado: 'listo', progreso: 100, plan, created_at: '2026-10-18T10:00:00Z', updated_at: '2026-10-18T10:00:00Z' }
    const ajena = { ...mia, id: nuevoId(), client_id: OTRO }
    const aMedias = { ...mia, id: nuevoId(), estado: 'montando' }
    db.helm_ediciones = [mia, ajena, aMedias]
    db.agent_jobs = [{ id: nuevoId(), clave: `editor-render:${mia.id}`, estado: 'pendiente' }]

    const e = await llama({ action: 'estado', query: { id: mia.id } })
    expect(e.body.edicion).toMatchObject({ id: mia.id, estado: 'listo', plan: { cortes: plan.segmentos.length - 1, resumen: { tomas: 1 } } })
    expect(e.body.edicion.plan.quitado[0]).toMatchObject({ motivo: 'toma' })

    expect((await llama({ action: 'descarga', query: { id: ajena.id } })).statusCode).toBe(404)
    expect((await llama({ action: 'descarga', query: { id: '../../etc/passwd' } })).statusCode).toBe(400)
    expect((await llama({ action: 'descarga', query: { id: aMedias.id } })).statusCode).toBe(409)
    expect((await llama({ action: 'descarga', query: { id: mia.id } })).statusCode).toBe(410)
    fs.mkdirSync(dirEdicion(mia.id), { recursive: true })
    fs.writeFileSync(rutaEditado(mia.id), 'mp4 de mentira')
    const d = await llama({ action: 'descarga', query: { id: mia.id } })
    expect(d.headers['Content-Type']).toBe('video/mp4')
    expect(d.headers['Content-Disposition']).toBe(`attachment; filename="Toma buena-editado.mp4"; filename*=UTF-8''Toma%20%C2%ABbuena%C2%BB-editado.mp4`)
    expect(d.descargado.toString()).toBe('mp4 de mentira')

    expect((await llama({ method: 'POST', action: 'borrar', body: { id: ajena.id } })).statusCode).toBe(404)
    const b = await llama({ method: 'POST', action: 'borrar', body: { id: mia.id } })
    expect(b.statusCode).toBe(200)
    expect(db.helm_ediciones.map(f => f.id)).toEqual([ajena.id, aMedias.id])
    expect(db.agent_jobs).toHaveLength(0)
    expect(fs.existsSync(dirEdicion(mia.id))).toBe(false)
  })

  it('estilos: el global por defecto; guardar uno del perfil lo normaliza y pasa a ser el suyo', async () => {
    const a = await llama({ action: 'estilos' })
    expect(a.body.porDefecto).toMatchObject({ nombre: 'Estilo HELM', global: true, params: normalizaEstilo({}) })
    expect(a.body.estilos).toHaveLength(1)

    const g = await llama({ method: 'POST', action: 'estilo', body: { params: { palabrasPorBloque: 9, colorResalte: '#00ff88', zoom: false, tamano: 'enorme' } } })
    expect(g.statusCode).toBe(200)
    expect(g.body.porDefecto).toMatchObject({ global: false, params: { palabrasPorBloque: 5, colorResalte: '#00FF88', zoom: false, tamano: 72 } })
    const propias = db.helm_estilos_edicion.filter(f => f.client_id === PERFIL)
    expect(propias).toHaveLength(1)
    // Guardar otra vez actualiza la misma fila.
    await llama({ method: 'POST', action: 'estilo', body: { params: { mayusculas: false } } })
    expect(db.helm_estilos_edicion.filter(f => f.client_id === PERFIL)).toHaveLength(1)
    const b = await llama({ action: 'estilos' })
    expect(b.body.porDefecto).toMatchObject({ global: false, params: { mayusculas: false } })
    expect(b.body.estilos.map(x => x.global)).toEqual([false, true])
    // Y lo que se suba a partir de ahora usa ese.
    const s = await llama({ method: 'POST', action: 'subir', crudo: video(), headers: { 'content-type': 'video/mp4' } })
    expect(db.helm_ediciones.find(f => f.id === s.body.id).estilo.mayusculas).toBe(false)
    expect((await llama({ method: 'POST', action: 'estilo', body: { params: 'x' } })).statusCode).toBe(400)
  })
})

// ── El trabajo del worker, con ffmpeg de verdad ─────────────────────────────
const FFMPEG = process.env.HELM_FFMPEG || 'ffmpeg'
const hayFfmpeg = spawnSync(FFMPEG, ['-version']).status === 0
const hayLibass = hayFfmpeg && / ass +V->V/.test(spawnSync(FFMPEG, ['-hide_banner', '-filters'], { encoding: 'utf8' }).stdout)

describe('trabajo editor-render', () => {
  it.skipIf(!hayFfmpeg)('transcribe (simulado), planifica, monta y deja la fila en «listo»', async () => {
    const { editorRender } = await import('../api/_lib/editor/trabajo.js')
    const { sondea: sondeaReal } = await vi.importActual('../api/_lib/variantes.js')
    sondea.mockImplementation(sondeaReal)
    const id = nuevoId()
    fs.mkdirSync(dirEdicion(id), { recursive: true })
    const gen = spawnSync(FFMPEG, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=360x640:rate=30:duration=9',
      '-f', 'lavfi', '-i', 'sine=frequency=300:sample_rate=44100:duration=9', '-c:v', 'libx264', '-preset', 'ultrafast',
      '-c:a', 'aac', '-shortest', path.join(dirEdicion(id), 'original.mp4')])
    expect(gen.status).toBe(0)
    db.helm_ediciones = [{ id, client_id: PERFIL, estado: 'en_cola', estilo: { subtitulos: hayLibass, zoomCada: 2 }, created_at: new Date().toISOString() }]
    const transcribe = vi.fn(async () => ({
      palabras: [...dice('Esta IA hace que tu negocio venda más.', 0.4), ...dice('Esta IA hace que tu negocio venda más porque sí.', 3.4)],
    }))
    const { supabase } = await import('../api/lib/supabase.js')
    await editorRender({ payload: { clientId: PERFIL, edicionId: id } }, { db: supabase, transcribe })

    const fila = db.helm_ediciones[0]
    expect(fila).toMatchObject({ estado: 'listo', progreso: 100, error: null })
    expect(transcribe).toHaveBeenCalledTimes(1)
    expect(fila.plan.resumen.tomas).toBe(1)
    // El editado dura lo que dice el plan (el AAC redondea a tramas de 21 ms).
    expect(Math.abs(fila.duracion_final - fila.plan.duracionFinal)).toBeLessThan(0.05)
    expect(fila.bytes).toBe(fs.statSync(rutaEditado(id)).size)
    // Ni el audio para Whisper ni los subtítulos se quedan en la carpeta.
    expect(fs.readdirSync(dirEdicion(id)).sort()).toEqual(['editado.mp4', 'original.mp4'])

    // Si la fila ya no está (la borraron), no hace nada.
    db.helm_ediciones = []
    await expect(editorRender({ payload: { clientId: PERFIL, edicionId: id } }, { db: supabase, transcribe })).resolves.toBeUndefined()
    expect(transcribe).toHaveBeenCalledTimes(1)
  }, 120_000)
})
