// Trial reels: las reglas de las variantes (src/agents/trialreels/reglas.js),
// los argumentos de ffmpeg (api/_lib/variantes.js, sin lanzar nada) y el
// servidor (api/trial-reels.js) con Supabase, la IA e Instagram simulados. El
// montaje de verdad con ffmpeg se prueba aparte: scripts/prueba-variantes.mjs.
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Writable } from 'node:stream'
import { spawnSync } from 'node:child_process'
import {
  normalizaAjustes, ajustesDeVariante, tramos, reencuadre, normalizaGanchos, RANGOS,
} from '../src/agents/trialreels/reglas.js'
import { planGancho } from '../src/agents/trialreels/gancho.js'
import { MARCA_POR_DEFECTO } from '../src/agents/portadas/reglas.js'

const DATOS = fs.mkdtempSync(path.join(os.tmpdir(), 'helm-trial-reels-'))
process.env.HELM_DATA_DIR = DATOS
afterAll(() => fs.rmSync(DATOS, { recursive: true, force: true }))

describe('reglas', () => {
  it('normalizaAjustes recorta cada valor y no se inventa el espejo', () => {
    const a = normalizaAjustes({ zoom: 3, velocidad: 0.5, recorte: 9, avanceDur: 10, avanceEn: -4, ganchoDur: 99, desplX: 7, color: 'rojo', arranque: 'x', espejo: 'sí', ganchoEstilo: 'neón' }, 's')
    expect(a).toMatchObject({ zoom: RANGOS.zoom.max, velocidad: 1, recorte: 2, avanceDur: 3, avanceEn: 0, ganchoDur: 4, desplX: 1, arranque: 'normal', espejo: false, ganchoEstilo: 'caja' })
    expect(['neutro', 'calido', 'frio', 'contraste']).toContain(a.color)
    expect(normalizaAjustes({}, 's').avanceEn).toBeNull()
  })

  it('la misma semilla da lo mismo; las tres de partida son distintas', () => {
    expect(normalizaAjustes({}, '179:1')).toEqual(normalizaAjustes({}, '179:1'))
    expect(normalizaAjustes({}, '179:1')).not.toEqual(normalizaAjustes({}, '179:2'))
    const vs = [0, 1, 2].map(i => ajustesDeVariante('17900000000000001', i))
    expect(new Set(vs.map(v => `${v.arranque}-${v.color}-${v.recorte}`)).size).toBe(3)
    for (const v of vs) {
      expect(v.zoom).toBeGreaterThanOrEqual(1.03); expect(v.zoom).toBeLessThanOrEqual(1.1)
      expect(v.velocidad).toBeGreaterThanOrEqual(1); expect(v.velocidad).toBeLessThanOrEqual(1.06)
      expect(v.espejo).toBe(false)
    }
  })

  it('tramos: el avance suma, el recorte resta, la velocidad acorta', () => {
    const base = normalizaAjustes({ recorte: 0, velocidad: 1 })
    expect(tramos(base, 20)).toMatchObject({ avance: null, principal: { desde: 0, dur: 20 }, salida: 20 })
    const av = normalizaAjustes({ arranque: 'avance', avanceEn: 8, avanceDur: 2.5, recorte: 1, velocidad: 1.05 })
    const t = tramos(av, 20)
    expect(t.avance).toEqual({ desde: 8, dur: 2.5 })
    expect(t.total).toBeCloseTo(21.5)
    expect(t.salida).toBeCloseTo(21.5 / 1.05, 2)
    // El avance no se sale del vídeo, y en uno muy corto no hay avance.
    expect(tramos({ ...av, avanceEn: 19 }, 20).avance.desde).toBe(17.5)
    expect(tramos(av, 3).avance).toBeNull()
    expect(tramos({ ...av, avanceEn: null }, 20).avance.desde).toBe(9)
  })

  it('reencuadre: cubre 1080×1920 con tamaños y cortes pares', () => {
    for (const info of [{ ancho: 720, alto: 1280 }, { ancho: 1920, alto: 1080 }, { ancho: 1081, alto: 1921 }]) {
      for (const d of [-1, 0, 0.37, 1]) {
        const r = reencuadre(info, normalizaAjustes({ zoom: 1.07, desplX: d, desplY: -d }))
        expect(r.ew).toBeGreaterThanOrEqual(1080); expect(r.eh).toBeGreaterThanOrEqual(1920)
        for (const n of [r.ew, r.eh, r.x, r.y]) expect(n % 2).toBe(0)
        expect(r.x).toBeLessThanOrEqual(r.ew - 1080); expect(r.y).toBeLessThanOrEqual(r.eh - 1920)
      }
    }
  })

  it('normalizaGanchos: 2–7 palabras, la resaltada dentro y tope de 3', () => {
    const o = normalizaGanchos([
      { texto: 'Nadie te avisa de esto', resaltada: 'nadie' },
      { texto: 'Uno' },
      { texto: 'Esto es demasiado largo para leerlo de un vistazo', resaltada: 'largo' },
      { texto: 'Tu web pierde clientes', resaltada: 'inventada' },
      { texto: '3 errores al grabar', resaltada: '3' },
      { texto: 'La cuarta sobra', resaltada: 'cuarta' },
    ])
    expect(o.map(x => x.texto)).toEqual(['Nadie te avisa de esto', 'Tu web pierde clientes', '3 errores al grabar'])
    expect(o[1].resaltada).toBe('')
  })

  it('planGancho: arriba, dentro de la zona segura y en mayúsculas si toca', () => {
    const medir = (t, tam) => String(t).length * tam * 0.5
    const p = planGancho({ texto: 'Esto no te lo cuenta nadie hoy', resaltada: 'nadie', marca: MARCA_POR_DEFECTO, medir })
    expect(p.resaltada).toBe('NADIE')
    expect(p.lineas[0].palabras[0]).toBe('ESTO')
    for (const l of p.lineas) {
      expect(l.caja.x0).toBeGreaterThanOrEqual(100); expect(l.caja.x1).toBeLessThanOrEqual(980)
      expect(l.caja.y0).toBeGreaterThanOrEqual(290); expect(l.caja.y1).toBeLessThanOrEqual(760)
    }
    expect(planGancho({ texto: '  ', marca: MARCA_POR_DEFECTO, medir })).toBeNull()
  })
})

// ── ffmpeg (sin lanzarlo) ───────────────────────────────────────────────────
const { argumentosFfmpeg, infoDeSonda } = await import('../api/_lib/variantes.js')

describe('argumentosFfmpeg', () => {
  const info = { ancho: 1080, alto: 1920, duracion: 20, audio: true }
  const fc = (args) => args[args.indexOf('-filter_complex') + 1]

  it('normal: una entrada, sin metadatos, 30 fps y AAC', () => {
    const args = argumentosFfmpeg({ entrada: '/e.mp4', salida: '/s.mp4', ajustes: normalizaAjustes({ velocidad: 1, recorte: 0, color: 'neutro' }), info })
    expect(args.filter(x => x === '-i')).toHaveLength(1)
    expect(args).toEqual(expect.arrayContaining(['-map_metadata', '-1', '-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac', '-ar', '48000', '-movflags', '+faststart']))
    expect(fc(args)).toContain('fps=30')
    expect(fc(args)).not.toMatch(/setpts|atempo|hflip|concat|overlay|eq=/)
    expect(args.at(-1)).toBe('/s.mp4')
  })

  it('avance + gancho: la fuente dos veces, concat y el PNG con fundido', () => {
    const a = normalizaAjustes({ arranque: 'avance', avanceEn: 6, avanceDur: 2, recorte: 0.5, ganchoDur: 2.5, velocidad: 1.04, espejo: true, color: 'calido' })
    const args = argumentosFfmpeg({ entrada: '/e.mp4', salida: '/s.mp4', gancho: '/g.png', ajustes: a, info })
    expect(args.slice(0, args.indexOf('-filter_complex')).join(' ')).toContain('-ss 6 -t 2 -i /e.mp4 -ss 0.5 -i /e.mp4 -loop 1 -framerate 30 -t 2.5 -i /g.png')
    const f = fc(args)
    expect(f).toContain('concat=n=2:v=1:a=1')
    expect(f).toContain('setpts=PTS/1.04'); expect(f).toContain('atempo=1.04')
    expect(f).toContain('hflip'); expect(f).toContain('eq=')
    expect(f).toContain('fade=t=out:st=2.1:d=0.4:alpha=1')
    expect(f).toContain('overlay=0:0:eof_action=pass')
  })

  it('sin audio: ni sonido en el grafo ni pista de salida', () => {
    const a = normalizaAjustes({ arranque: 'avance', avanceDur: 2 })
    const args = argumentosFfmpeg({ entrada: '/e.mp4', salida: '/s.mp4', ajustes: a, info: { ...info, audio: false } })
    expect(fc(args)).toContain('concat=n=2:v=1:a=0')
    expect(fc(args)).not.toContain('[aout]')
    expect(args).toContain('-an')
  })

  it('infoDeSonda: rotación del móvil, portada incrustada y audio', () => {
    const j = {
      streams: [
        { codec_type: 'video', width: 600, height: 600, disposition: { attached_pic: 1 } },
        { codec_type: 'video', width: 1920, height: 1080, side_data_list: [{ rotation: -90 }] },
        { codec_type: 'audio' },
      ],
      format: { duration: '12.5' },
    }
    expect(infoDeSonda(j)).toEqual({ ancho: 1080, alto: 1920, duracion: 12.5, audio: true })
    expect(() => infoDeSonda({ streams: [{ codec_type: 'audio' }] })).toThrow()
  })
})

// ── Servidor ────────────────────────────────────────────────────────────────
const PERFIL = 'c0000000-0000-4000-8000-0000000000c1'
const OTRO = 'c0000000-0000-4000-8000-0000000000c2'
const REEL = '17900000000000001'
const db = {}
let siguiente = 0
const nuevoId = () => `a0000000-0000-4000-8000-${String(++siguiente).padStart(12, '0')}`

function consulta(tabla) {
  const filtros = []
  let op = 'select', datos = null, cabeza = false, tope = Infinity, orden = null
  const filas = () => (db[tabla] ||= [])
  const encaja = (f) => filtros.every(fn => fn(f))
  const q = {
    select(_c, opts) { if (opts?.head) cabeza = true; if (op === 'select') op = 'select'; return q },
    eq(c, v) { filtros.push(f => f[c] === v); return q },
    in(c, vs) { filtros.push(f => vs.includes(f[c])); return q },
    order(c, { ascending } = {}) { orden = [c, ascending]; return q },
    limit(n) { tope = n; return q },
    update(row) { op = 'update'; datos = row; return q },
    insert(rows) { op = 'insert'; datos = rows; return q },
    delete() { op = 'delete'; return q },
    maybeSingle() { return Promise.resolve({ data: structuredClone(filas().find(encaja) || null), error: null }) },
    then(ok, mal) {
      let data
      if (op === 'insert') {
        const nuevas = (Array.isArray(datos) ? datos : [datos]).map(r => ({ id: nuevoId(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...r }))
        filas().push(...nuevas)
        data = structuredClone(nuevas)
      } else if (op === 'update') {
        filas().filter(encaja).forEach(f => Object.assign(f, datos)); data = null
      } else if (op === 'delete') {
        db[tabla] = filas().filter(f => !encaja(f)); data = null
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
vi.mock('../api/_lib/llm.js', () => ({ llmChat: vi.fn() }))
vi.mock('../api/_lib/instagram.js', () => ({ getToken: vi.fn(async () => ({ token: 't' })), getMediaUrls: vi.fn() }))
vi.mock('../api/_lib/web.js', () => ({ fetchPublico: vi.fn() }))
vi.mock('../api/_lib/variantes.js', async (original) => ({ ...(await original()), encola: vi.fn(() => true), quitaDeCola: vi.fn() }))

const { default: trialReels } = await import('../api/trial-reels.js')
const { llmChat } = await import('../api/_lib/llm.js')
const { getMediaUrls } = await import('../api/_lib/instagram.js')
const { fetchPublico } = await import('../api/_lib/web.js')
const hayFfmpeg = spawnSync(process.env.HELM_FFMPEG || 'ffmpeg', ['-version']).status === 0
const { encola, quitaDeCola, rutaGancho, rutaSalida } = await import('../api/_lib/variantes.js')

/** Un PNG mínimo con la cabecera de verdad y el tamaño que se diga. */
function png(ancho = 1080, alto = 1920) {
  const b = Buffer.alloc(33)
  Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex').copy(b, 0)
  b.writeUInt32BE(ancho, 16); b.writeUInt32BE(alto, 20)
  return 'data:image/png;base64,' + b.toString('base64')
}

let ip = 0
async function llama({ method = 'GET', action, query = {}, body }) {
  const trozos = []
  const res = new Writable({ write(c, _e, cb) { trozos.push(c); cb() } })
  Object.assign(res, {
    statusCode: 200, body: null, headers: {}, headersSent: false,
    status(c) { this.statusCode = c; return this },
    json(b) { this.body = b; this.headersSent = true; return this },
    setHeader(k, v) { this.headers[k] = v },
  })
  await trialReels({ method, query: { action, clientId: PERFIL, ...query }, body, headers: { 'x-forwarded-for': `10.9.0.${++ip}` }, socket: {} }, res)
  res.descargado = Buffer.concat(trozos)
  return res
}

beforeEach(() => {
  db.helm_ig_media = [
    { client_id: PERFIL, media_id: REEL, tipo: 'VIDEO', producto: 'REELS', caption: '3 errores al grabar reels\nY cómo evitarlos', visitas: 900 },
    { client_id: OTRO, media_id: '17900000000000002', tipo: 'VIDEO', producto: 'REELS', caption: 'de otro' },
  ]
  db.helm_biblia = [{ client_id: PERFIL, kind: 'contenido', content: 'Tono cercano.' }]
  db.helm_trial_reels = []
  encola.mockClear(); quitaDeCola.mockClear(); llmChat.mockReset()
})

describe('api/trial-reels', () => {
  it('perfil distinto en URL y cuerpo → 400', async () => {
    const r = await llama({ method: 'POST', action: 'crear', body: { clientId: OTRO, mediaId: REEL, variantes: [{}] } })
    expect(r.statusCode).toBe(400)
  })

  it('crear: valida el reel, el número de variantes y el PNG', async () => {
    expect((await llama({ method: 'POST', action: 'crear', body: { mediaId: '17900000000000002', variantes: [{}] } })).statusCode).toBe(404)
    expect((await llama({ method: 'POST', action: 'crear', body: { mediaId: REEL, variantes: [{}, {}, {}, {}] } })).statusCode).toBe(400)
    expect((await llama({ method: 'POST', action: 'crear', body: { mediaId: REEL, variantes: [{ ganchoPng: 'aG9sYQ==' }] } })).statusCode).toBe(400)
    expect((await llama({ method: 'POST', action: 'crear', body: { mediaId: REEL, variantes: [{ ganchoPng: png(1080, 1080) }] } })).statusCode).toBe(400)
    expect(db.helm_trial_reels).toHaveLength(0)
    expect(encola).not.toHaveBeenCalled()
  })

  it('crear: mete las variantes en cola, guarda el gancho y recorta los ajustes', async () => {
    const r = await llama({ method: 'POST', action: 'crear', body: { mediaId: REEL, variantes: [{ ajustes: { zoom: 5, ganchoTexto: 'Hola mundo' }, ganchoPng: png() }, { ajustes: { arranque: 'avance' } }] } })
    expect(r.statusCode).toBe(200)
    expect(r.body.ids).toHaveLength(2)
    expect(db.helm_trial_reels.map(f => [f.variante, f.estado, f.ajustes.conGancho])).toEqual([[1, 'en_cola', true], [2, 'en_cola', false]])
    expect(db.helm_trial_reels[0].ajustes.zoom).toBe(1.1)
    expect(fs.existsSync(rutaGancho(r.body.ids[0]))).toBe(true)
    expect(encola).toHaveBeenCalledTimes(2)
    // Con 6 en marcha, no caben más.
    db.helm_trial_reels.push(...Array.from({ length: 4 }, () => ({ id: nuevoId(), client_id: PERFIL, estado: 'procesando' })))
    expect((await llama({ method: 'POST', action: 'crear', body: { mediaId: REEL, variantes: [{}] } })).statusCode).toBe(429)
  })

  it('lista: solo las del perfil, y un «procesando» viejo sale como error', async () => {
    const viejo = new Date(Date.now() - 20 * 60_000).toISOString()
    db.helm_trial_reels = [
      { id: nuevoId(), client_id: PERFIL, media_id: REEL, variante: 1, estado: 'procesando', created_at: viejo, updated_at: viejo },
      { id: nuevoId(), client_id: OTRO, media_id: REEL, variante: 1, estado: 'listo', created_at: viejo, updated_at: viejo },
    ]
    const r = await llama({ action: 'lista' })
    expect(r.body.trabajos).toHaveLength(1)
    expect(r.body.trabajos[0]).toMatchObject({ estado: 'error', disponible: false })
  })

  it('descarga: solo del perfil, 410 si ya no está y el MP4 como adjunto', async () => {
    const mio = { id: nuevoId(), client_id: PERFIL, media_id: REEL, variante: 2, estado: 'listo', created_at: '2026-10-18T10:00:00Z' }
    const ajeno = { ...mio, id: nuevoId(), client_id: OTRO }
    db.helm_trial_reels = [mio, ajeno]
    expect((await llama({ action: 'descarga', query: { id: ajeno.id } })).statusCode).toBe(404)
    expect((await llama({ action: 'descarga', query: { id: '../../etc/passwd' } })).statusCode).toBe(400)
    expect((await llama({ action: 'descarga', query: { id: mio.id } })).statusCode).toBe(410)
    fs.mkdirSync(path.dirname(rutaSalida(mio.id)), { recursive: true })
    fs.writeFileSync(rutaSalida(mio.id), 'mp4 de mentira')
    const r = await llama({ action: 'descarga', query: { id: mio.id } })
    expect(r.headers['Content-Disposition']).toBe('attachment; filename="trial-reel-2026-10-18-v2.mp4"')
    expect(r.descargado.toString()).toBe('mp4 de mentira')
  })

  it('ganchos: lee caption y Biblia y devuelve solo los válidos', async () => {
    llmChat.mockResolvedValue('Toma: {"opciones":[{"texto":"3 errores que hunden tus reels","resaltada":"errores","angulo":"C"},{"texto":"x"}]}')
    const r = await llama({ method: 'POST', action: 'ganchos', body: { mediaId: REEL } })
    expect(r.statusCode).toBe(200)
    expect(r.body.opciones).toEqual([{ texto: '3 errores que hunden tus reels', resaltada: 'errores', angulo: 'C', porque: '' }])
    expect(llmChat.mock.calls[0][0].messages[0].content).toContain('Tono cercano.')
  })

  it('borrar: quita la fila y su trabajo de la cola', async () => {
    const f = { id: nuevoId(), client_id: PERFIL, media_id: REEL, variante: 1, estado: 'en_cola' }
    db.helm_trial_reels = [f]
    const r = await llama({ method: 'POST', action: 'borrar', body: { id: f.id } })
    expect(r.statusCode).toBe(200)
    expect(db.helm_trial_reels).toHaveLength(0)
    expect(quitaDeCola).toHaveBeenCalledWith(f.id)
  })

  // El trabajo de la cola de principio a fin, con ffmpeg de verdad: Instagram
  // y su CDN simulados con un vídeo pequeño generado aquí.
  it.skipIf(!hayFfmpeg)('el trabajo baja la fuente, monta, marca «listo» y limpia', async () => {
    const fuente = path.join(DATOS, 'muestra.mp4')
    const gen = spawnSync(process.env.HELM_FFMPEG || 'ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=360x640:rate=25:duration=6',
      '-f', 'lavfi', '-i', 'sine=frequency=330:sample_rate=44100:duration=6', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-shortest', fuente])
    expect(gen.status).toBe(0)
    getMediaUrls.mockResolvedValue({ video: 'https://scontent-mad1-1.cdninstagram.com/v/t50/reel.mp4', imagen: '' })
    fetchPublico.mockImplementation(async () => new Response(fs.readFileSync(fuente), { headers: { 'content-type': 'video/mp4' } }))

    const r = await llama({ method: 'POST', action: 'crear', body: { mediaId: REEL, variantes: [{ ajustes: { arranque: 'avance', avanceEn: 3, avanceDur: 1.5, recorte: 0.5, velocidad: 1.05 } }] } })
    expect(r.statusCode).toBe(200)
    const trabajo = encola.mock.calls[0][0]
    await trabajo.ejecuta()

    const fila = db.helm_trial_reels[0]
    expect(fila).toMatchObject({ estado: 'listo', error: null, archivo: `trial-reels/${fila.id}.mp4` })
    expect(fila.bytes).toBeGreaterThan(10_000)
    expect(fila.duracion).toBeCloseTo((1.5 + 5.5) / 1.05, 0)
    expect(fs.existsSync(rutaSalida(fila.id))).toBe(true)
    expect(fs.existsSync(trabajo.fuente)).toBe(false)
    const d = await llama({ action: 'descarga', query: { id: fila.id } })
    expect(d.descargado.length).toBe(fila.bytes)

    // Un CDN que no es el de Meta: error, y sin descargar nada.
    getMediaUrls.mockResolvedValue({ video: 'https://ejemplo.com/reel.mp4' })
    fetchPublico.mockClear()
    await llama({ method: 'POST', action: 'crear', body: { mediaId: REEL, variantes: [{}] } })
    await encola.mock.calls[1][0].ejecuta()
    expect(db.helm_trial_reels[1]).toMatchObject({ estado: 'error', error: 'Instagram ha devuelto una dirección inesperada' })
    expect(fetchPublico).not.toHaveBeenCalled()
  }, 60_000)
})
