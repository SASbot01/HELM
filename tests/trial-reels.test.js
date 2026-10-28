// Trial reels: las reglas de las variantes (src/agents/trialreels/reglas.js),
// los argumentos de ffmpeg (api/_lib/variantes.js, sin lanzar nada) y el
// servidor (api/trial-reels.js) con Supabase, la IA e Instagram simulados. El
// cobro va con el api/_lib/creditos.js de verdad sobre la base simulada
// (mover_saldo incluido), y los vídeos subidos, con la subida por trozos de
// verdad. Con ffmpeg instalado, también el montaje de principio a fin
// (scripts/prueba-variantes.mjs lo prueba aparte).
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Readable, Writable } from 'node:stream'
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
// Otro perfil de la MISMA agencia que PERFIL (lo que tiene en cola cuenta).
const HERMANO = 'c0000000-0000-4000-8000-0000000000c3'
const AGENCIA = 'e0000000-0000-4000-8000-0000000000a1'
const AGENCIA_OTRA = 'e0000000-0000-4000-8000-0000000000a2'
const REEL = '17900000000000001'
const db = {}
// Para simular que la base falla: fallos.update(tabla, cambios) → true y ese update da error.
const fallos = { update: null }
let siguiente = 0
const nuevoId = () => `a0000000-0000-4000-8000-${String(++siguiente).padStart(12, '0')}`
// mover_saldo como en la base: no apunta dos veces la misma referencia.
const rpc = vi.fn(async (fn, a) => {
  if (fn !== 'mover_saldo') return { data: null, error: { message: 'no existe' } }
  if (a.p_referencia && db.agencia_movimientos.some(m => m.referencia === a.p_referencia)) return { data: null, error: null }
  db.agencia_movimientos.push({ agencia_id: a.p_agencia, client_id: a.p_client, importe: a.p_importe, modelo: a.p_modelo, origen: a.p_origen, referencia: a.p_referencia })
  const ag = db.agencias.find(x => x.id === a.p_agencia)
  ag.saldo = Math.round((Number(ag.saldo) + a.p_importe) * 10000) / 10000
  return { data: ag.saldo, error: null }
})

function consulta(tabla) {
  const filtros = []
  let op = 'select', datos = null, cabeza = false, tope = Infinity, orden = null
  const filas = () => (db[tabla] ||= [])
  const encaja = (f) => filtros.every(fn => fn(f))
  const q = {
    select(_c, opts) { if (opts?.head) cabeza = true; if (op === 'select') op = 'select'; return q },
    eq(c, v) { filtros.push(f => f[c] === v); return q },
    in(c, vs) { filtros.push(f => vs.includes(f[c])); return q },
    is(c, v) { filtros.push(f => (f[c] ?? null) === v); return q },
    gt(c, v) { filtros.push(f => Number(f[c]) > v); return q },
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
        if (fallos.update?.(tabla, datos)) return Promise.resolve({ data: null, error: { message: 'se cayó la base' } }).then(ok, mal)
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

vi.mock('../api/lib/supabase.js', () => ({ supabase: { from: (t) => consulta(t), rpc: (...a) => rpc(...a) } }))
vi.mock('../api/_lib/access.js', () => ({
  requireProfileAccess: vi.fn(async () => ({ userId: 'b0000000-0000-4000-8000-000000000001' })),
  agenciaDe: async (clientId) => (db.clients || []).find(c => c.id === clientId)?.agencia_id || null,
}))
vi.mock('../api/_lib/llm.js', () => ({ llmChat: vi.fn() }))
vi.mock('../api/_lib/instagram.js', () => ({ getToken: vi.fn(async () => ({ token: 't' })), getMediaUrls: vi.fn() }))
vi.mock('../api/_lib/web.js', () => ({ fetchPublico: vi.fn() }))
// procesaVariante, el de verdad salvo que el test diga otra cosa (mockImplementationOnce).
vi.mock('../api/_lib/variantes.js', async (original) => {
  const o = await original()
  return { ...o, encola: vi.fn(() => true), quitaDeCola: vi.fn(), procesaVariante: vi.fn(o.procesaVariante) }
})

const { default: trialReels, cobraVariante, pendienteTrial, nombreSeguro, mantenimiento } = await import('../api/trial-reels.js')
const { llmChat } = await import('../api/_lib/llm.js')
const { getMediaUrls } = await import('../api/_lib/instagram.js')
const { fetchPublico } = await import('../api/_lib/web.js')
const hayFfmpeg = spawnSync(process.env.HELM_FFMPEG || 'ffmpeg', ['-version']).status === 0
const { encola, quitaDeCola, procesaVariante, rutaGancho, rutaSalida, rutaFuenteSubida, dirSubidaFuente, esVideoIsoBmff, guardadoDelPerfil } = await import('../api/_lib/variantes.js')

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

/** Un trozo de subida en crudo: la petición es el stream, como la deja pasar api-server. */
async function trozo({ id, offset = 0, cuerpo = Buffer.alloc(0), method = 'POST', clientId = PERFIL }) {
  const req = Readable.from(method === 'POST' ? [cuerpo] : [])
  Object.assign(req, {
    method,
    query: { action: 'trozo', clientId, id, ...(method === 'POST' ? { offset: String(offset) } : {}) },
    headers: { 'x-forwarded-for': `10.9.1.${++ip}`, 'content-length': String(cuerpo.length), 'content-type': 'application/octet-stream' },
    socket: {},
  })
  const res = new Writable({ write(_c, _e, cb) { cb() } })
  Object.assign(res, {
    statusCode: 200, body: null, headers: {}, headersSent: false,
    status(c) { this.statusCode = c; return this },
    json(b) { this.body = b; this.headersSent = true; return this },
    setHeader(k, v) { this.headers[k] = v },
  })
  await trialReels(req, res)
  return res
}

// Lo que empieza como un MP4 de verdad (la caja ftyp) y lo que no.
const CABEZA_MP4 = Buffer.from('0000001c6674797069736f6d0000020069736f6d69736f32', 'hex')
const MOVIMIENTOS = () => db.agencia_movimientos

beforeEach(() => {
  db.clients = [{ id: PERFIL, agencia_id: AGENCIA }, { id: HERMANO, agencia_id: AGENCIA }, { id: OTRO, agencia_id: AGENCIA_OTRA }]
  db.agencias = [{ id: AGENCIA, saldo: 10, sin_cobro: false }, { id: AGENCIA_OTRA, saldo: 10, sin_cobro: false }]
  db.agencia_movimientos = []
  db.helm_trial_fuentes = []
  rpc.mockClear()
  db.helm_ig_media = [
    { client_id: PERFIL, media_id: REEL, tipo: 'VIDEO', producto: 'REELS', caption: '3 errores al grabar reels\nY cómo evitarlos', visitas: 900 },
    { client_id: OTRO, media_id: '17900000000000002', tipo: 'VIDEO', producto: 'REELS', caption: 'de otro' },
  ]
  db.helm_biblia = [{ client_id: PERFIL, kind: 'contenido', content: 'Tono cercano.' }]
  db.helm_trial_reels = []
  fallos.update = null
  encola.mockClear(); quitaDeCola.mockClear(); llmChat.mockReset()
  // Los vídeos subidos de cada test, fuera (cuentan para el tope de lo guardado).
  fs.rmSync(path.join(DATOS, 'trial-reels', 'fuentes'), { recursive: true, force: true })
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

// ── Cobro: 0,30 € por variante, solo si sale bien ──────────────────────────
describe('trial-reels · cobro', () => {
  it('crear: sin saldo para todas, 402 con el precio en créditos y no se crea ninguna', async () => {
    db.agencias[0].saldo = 0.5
    const r = await llama({ method: 'POST', action: 'crear', body: { mediaId: REEL, variantes: [{}, {}] } })
    expect(r.statusCode).toBe(402)
    expect(r.body.error).toBe('No tienes saldo suficiente: esto cuesta 60 créditos y te quedan 50. Recarga en Créditos.')
    expect(db.helm_trial_reels).toHaveLength(0)
    expect(encola).not.toHaveBeenCalled()
    // Con una sí llega, y la fila lleva su precio.
    const una = await llama({ method: 'POST', action: 'crear', body: { mediaId: REEL, variantes: [{}] } })
    expect(una.statusCode).toBe(200)
    expect(db.helm_trial_reels[0]).toMatchObject({ precio_eur: 0.3, fuente_id: null, media_id: REEL })
    expect(una.body.trabajos[0]).toMatchObject({ precio: 0.3, cobrado: null })
    // Crear no cobra: se cobra al terminar.
    expect(rpc).not.toHaveBeenCalled()
  })

  it('lo que la agencia ya tiene en cola sin cobrar (de cualquier perfil suyo) cuenta como apartado', async () => {
    db.agencias[0].saldo = 1
    const ahora = new Date().toISOString()
    db.helm_trial_reels = [
      { id: nuevoId(), client_id: HERMANO, estado: 'en_cola', precio_eur: 0.3, cobrado_eur: null, updated_at: ahora },
      { id: nuevoId(), client_id: HERMANO, estado: 'procesando', precio_eur: 0.3, cobrado_eur: null, updated_at: ahora },
      // Ya cobrada, colgada de un reinicio, terminada o de otra agencia: no cuentan.
      { id: nuevoId(), client_id: PERFIL, estado: 'procesando', precio_eur: 0.3, cobrado_eur: 0.3, updated_at: ahora },
      { id: nuevoId(), client_id: PERFIL, estado: 'procesando', precio_eur: 0.3, cobrado_eur: null, updated_at: new Date(Date.now() - 60 * 60_000).toISOString() },
      { id: nuevoId(), client_id: PERFIL, estado: 'listo', precio_eur: 0.3, cobrado_eur: null, updated_at: ahora },
      { id: nuevoId(), client_id: OTRO, estado: 'en_cola', precio_eur: 0.3, cobrado_eur: null, updated_at: ahora },
    ]
    expect(await pendienteTrial(AGENCIA)).toBeCloseTo(0.6)
    const r = await llama({ method: 'POST', action: 'crear', body: { mediaId: REEL, variantes: [{}, {}] } })
    expect(r.statusCode).toBe(402)
    expect(r.body.error).toMatch(/te quedan 40 \(otros 60 ya están apartados/)
    expect((await llama({ method: 'POST', action: 'crear', body: { mediaId: REEL, variantes: [{}] } })).statusCode).toBe(200)
  })

  it('la agencia de la casa (sin_cobro) y un perfil sin agencia no pagan', async () => {
    db.agencias[0] = { id: AGENCIA, saldo: 0, sin_cobro: true }
    expect((await llama({ method: 'POST', action: 'crear', body: { mediaId: REEL, variantes: [{}, {}, {}] } })).statusCode).toBe(200)
    const [f] = db.helm_trial_reels
    expect(await cobraVariante({ id: f.id, clientId: PERFIL, precio: 0.3 })).toBe(0)
    expect(f.cobrado_eur).toBe(0)
    db.clients[0].agencia_id = null
    expect((await llama({ method: 'POST', action: 'crear', body: { mediaId: REEL, variantes: [{}] } })).statusCode).toBe(200)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('cobraVariante: cobra una vez con su referencia, y un reintento apunta lo ya cobrado', async () => {
    const f = { id: nuevoId(), client_id: PERFIL, estado: 'listo', precio_eur: 0.3, cobrado_eur: null }
    db.helm_trial_reels = [f]
    expect(await cobraVariante({ id: f.id, clientId: PERFIL, precio: 0.3 })).toBe(0.3)
    expect(MOVIMIENTOS()).toEqual([expect.objectContaining({ importe: -0.3, modelo: 'trial-reel', origen: 'auto', referencia: `trial:${f.id}`, client_id: PERFIL })])
    expect(db.agencias[0].saldo).toBe(9.7)
    expect(f.cobrado_eur).toBe(0.3)
    // El worker se cayó antes de apuntarlo: al repetir, no se cobra otra vez.
    f.cobrado_eur = null
    expect(await cobraVariante({ id: f.id, clientId: PERFIL, precio: 0.3 })).toBe(0.3)
    expect(MOVIMIENTOS()).toHaveLength(1)
    expect(db.agencias[0].saldo).toBe(9.7)
    expect(f.cobrado_eur).toBe(0.3)
    // Sin precio (las de antes del cobro), nada.
    expect(await cobraVariante({ id: f.id, clientId: PERFIL, precio: null })).toBeNull()
    // Si el apunte falla (la agencia paga y no consta el cobro), no lanza y se
    // deja en null para que la lista lo vuelva a probar.
    rpc.mockRejectedValueOnce(new Error('se fue la red'))
    const g = { id: nuevoId(), client_id: PERFIL, estado: 'listo', precio_eur: 0.3, cobrado_eur: null }
    db.helm_trial_reels.push(g)
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await cobraVariante({ id: g.id, clientId: PERFIL, precio: 0.3 })).toBeNull()
    expect(g.cobrado_eur).toBeNull()
    expect(MOVIMIENTOS()).toHaveLength(1)
    log.mockRestore()
  })

  it('lista: lo que salió bien sin apuntar el cobro se vuelve a cobrar (una vez)', async () => {
    const viejo = new Date(Date.now() - 5 * 60_000).toISOString()
    const f = { id: nuevoId(), client_id: PERFIL, media_id: REEL, variante: 1, estado: 'listo', precio_eur: 0.3, cobrado_eur: null, created_at: viejo, updated_at: viejo }
    db.helm_trial_reels = [f]
    await llama({ action: 'lista' })
    await vi.waitFor(() => expect(f.cobrado_eur).toBe(0.3))
    await llama({ action: 'lista' })
    expect(MOVIMIENTOS()).toHaveLength(1)
  })
})

// ── Vídeos subidos ─────────────────────────────────────────────────────────
describe('trial-reels · subir un vídeo propio', () => {
  it('fuente: comprueba peso, tipo y duración; sin saldo ni para una variante, 402', async () => {
    const casos = [
      [{ nombre: 'a.mp4', bytes: 0, tipo: 'video/mp4' }, 400],
      [{ nombre: 'a.mp4', bytes: 201 * 1024 * 1024, tipo: 'video/mp4' }, 413],
      [{ nombre: 'a.webm', bytes: 1000, tipo: 'video/webm' }, 415],
      [{ nombre: 'a.txt', bytes: 1000, tipo: '' }, 415],
      [{ nombre: 'a.mp4', bytes: 1000, tipo: 'video/mp4', duracion: 301 }, 400],
      [{ nombre: 'a.mp4', bytes: 1000, tipo: 'video/mp4', duracion: -1 }, 400],
    ]
    for (const [body, code] of casos) expect((await llama({ method: 'POST', action: 'fuente', body })).statusCode, JSON.stringify(body)).toBe(code)
    expect(db.helm_trial_fuentes).toHaveLength(0)
    db.agencias[0].saldo = 0.2
    const r = await llama({ method: 'POST', action: 'fuente', body: { nombre: 'a.mp4', bytes: 1000, tipo: 'video/mp4' } })
    expect(r.statusCode).toBe(402)
    expect(db.helm_trial_fuentes).toHaveLength(0)
  })

  it('fuente: apunta la subida con el nombre sin carpetas, y como mucho 3 a la vez', async () => {
    expect(nombreSeguro('../../etc/passwd')).toBe('passwd')
    expect(nombreSeguro('C:\\Users\\yo\\mi vídeo.mov')).toBe('mi vídeo.mov')
    expect(nombreSeguro('')).toBe('video.mp4')
    const r = await llama({ method: 'POST', action: 'fuente', body: { nombre: '../../mi\u0000reel.mp4', bytes: 1000, tipo: 'video/mp4', duracion: 12.345 } })
    expect(r.statusCode).toBe(200)
    expect(db.helm_trial_fuentes[0]).toMatchObject({ id: r.body.fuenteId, client_id: PERFIL, nombre: 'mireel.mp4', bytes: 1000, duracion: 12.35, estado: 'subiendo' })
    expect(r.body.fuente).toMatchObject({ id: r.body.fuenteId, estado: 'subiendo', disponible: false })
    await llama({ method: 'POST', action: 'fuente', body: { nombre: 'b.mov', bytes: 1000, tipo: 'video/quicktime' } })
    await llama({ method: 'POST', action: 'fuente', body: { nombre: 'c.MP4', bytes: 1000, tipo: '' } })
    expect((await llama({ method: 'POST', action: 'fuente', body: { nombre: 'd.mp4', bytes: 1000, tipo: 'video/mp4' } })).statusCode).toBe(429)
  })

  it('trozo: solo del perfil, por orden, y lo que no empieza como un MP4 se tira (415)', async () => {
    const { body: { fuenteId } } = await llama({ method: 'POST', action: 'fuente', body: { nombre: 'a.mp4', bytes: 40, tipo: 'video/mp4' } })
    expect((await trozo({ id: 'nada' })).statusCode).toBe(400)
    db.helm_trial_fuentes.push({ id: nuevoId(), client_id: OTRO, bytes: 10, estado: 'subiendo' })
    expect((await trozo({ id: db.helm_trial_fuentes.at(-1).id, cuerpo: CABEZA_MP4 })).statusCode).toBe(404)

    const primero = await trozo({ id: fuenteId, offset: 0, cuerpo: CABEZA_MP4.subarray(0, 20) })
    expect(primero.body).toEqual({ recibidos: 20, completo: false })
    // Un trozo repetido o fuera de sitio: 409 con lo que hay, y se sigue desde ahí.
    const fuera = await trozo({ id: fuenteId, offset: 0, cuerpo: Buffer.alloc(20) })
    expect(fuera.statusCode).toBe(409)
    expect(fuera.body.recibidos).toBe(20)
    expect((await trozo({ id: fuenteId, method: 'GET' })).body).toEqual({ recibidos: 20, estado: 'subiendo' })

    // Un archivo que no es vídeo: fuera en el primer trozo.
    const { body: { fuenteId: otro } } = await llama({ method: 'POST', action: 'fuente', body: { nombre: 'b.mp4', bytes: 40, tipo: 'video/mp4' } })
    const malo = await trozo({ id: otro, offset: 0, cuerpo: Buffer.from('#EXTM3U\n#EXT-X-VERSION:3\nfile:///etc/passwd\n') .subarray(0, 40) })
    expect(malo.statusCode).toBe(415)
    expect(fs.existsSync(dirSubidaFuente(otro))).toBe(false)
    expect(db.helm_trial_fuentes.find(f => f.id === otro)).toMatchObject({ estado: 'error' })
    expect((await trozo({ id: otro, offset: 0, cuerpo: CABEZA_MP4 })).statusCode).toBe(410)
  })

  it('esVideoIsoBmff: la caja ftyp al principio y de un tamaño razonable', () => {
    expect(esVideoIsoBmff(CABEZA_MP4)).toBe(true)
    expect(esVideoIsoBmff(Buffer.from('#EXTM3U\n#EXT-X-TARGETDURATION'))).toBe(false)
    expect(esVideoIsoBmff(Buffer.from('000000006674797069736f6d00000200', 'hex'))).toBe(false)
    expect(esVideoIsoBmff(Buffer.alloc(4))).toBe(false)
  })

  it('crear con fuenteId: solo un vídeo del perfil, entero y que siga en disco', async () => {
    const f = { id: nuevoId(), client_id: PERFIL, nombre: 'a.mp4', bytes: 10, estado: 'subiendo', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
    const ajena = { ...f, id: nuevoId(), client_id: OTRO, estado: 'lista' }
    db.helm_trial_fuentes = [f, ajena]
    const crea = (body) => llama({ method: 'POST', action: 'crear', body: { variantes: [{}], ...body } })
    expect((await crea({ fuenteId: 'x' })).statusCode).toBe(400)
    expect((await crea({ fuenteId: f.id, mediaId: REEL })).statusCode).toBe(400)
    expect((await crea({ fuenteId: ajena.id })).statusCode).toBe(404)
    expect((await crea({ fuenteId: f.id })).statusCode).toBe(409)
    f.estado = 'lista'
    expect((await crea({ fuenteId: f.id })).statusCode).toBe(410)
    fs.mkdirSync(path.dirname(rutaFuenteSubida(PERFIL, f.id)), { recursive: true })
    fs.writeFileSync(rutaFuenteSubida(PERFIL, f.id), 'mp4')
    const r = await crea({ fuenteId: f.id, variantes: [{ ajustes: { zoom: 9 } }, {}] })
    expect(r.statusCode).toBe(200)
    expect(db.helm_trial_reels.map(x => [x.media_id, x.fuente_id, x.precio_eur, x.ajustes.zoom <= 1.1])).toEqual([[null, f.id, 0.3, true], [null, f.id, 0.3, true]])
    expect(r.body.trabajos[0]).toMatchObject({ mediaId: null, fuenteId: f.id })
    // El trabajo lee el vídeo subido, no Instagram.
    expect(encola.mock.calls[0][0].fuente).toBe(rutaFuenteSubida(PERFIL, f.id))
    expect((await llama({ action: 'lista' })).body.fuentes).toEqual([expect.objectContaining({ id: f.id, estado: 'lista', disponible: true })])
    // Mientras se monta, no se puede borrar el vídeo.
    expect((await llama({ method: 'POST', action: 'borrar-fuente', body: { id: f.id } })).statusCode).toBe(409)
  })

  it('ganchos sin reel: con lo que cuenta el usuario; sin texto, 400 sin gastar', async () => {
    expect((await llama({ method: 'POST', action: 'ganchos', body: { texto: '  ' } })).statusCode).toBe(400)
    expect(llmChat).not.toHaveBeenCalled()
    llmChat.mockResolvedValue('{"opciones":[{"texto":"Tu móvil graba mejor así","resaltada":"móvil","angulo":"B"}]}')
    const r = await llama({ method: 'POST', action: 'ganchos', body: { texto: 'Cómo grabar con el móvil sin que se vea casero' } })
    expect(r.statusCode).toBe(200)
    expect(llmChat.mock.calls[0][0].messages[0].content).toContain('DE QUÉ VA EL VÍDEO')
    expect(llmChat.mock.calls[0][0].messages[0].content).toContain('sin que se vea casero')
  })

  // De principio a fin con ffmpeg de verdad: se sube un MP4 en dos trozos,
  // queda «lista», se crea una variante, se monta, se cobra una vez y el vídeo
  // subido se queda (para sacar más). La que falla no se cobra.
  it.skipIf(!hayFfmpeg)('sube, sondea, monta desde el vídeo subido y cobra solo lo que sale bien', async () => {
    const muestra = path.join(DATOS, 'subido.mp4')
    const gen = spawnSync(process.env.HELM_FFMPEG || 'ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=360x640:rate=25:duration=4',
      '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100:duration=4', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-shortest', muestra])
    expect(gen.status).toBe(0)
    const bytes = fs.readFileSync(muestra)
    const { body: { fuenteId } } = await llama({ method: 'POST', action: 'fuente', body: { nombre: 'subido.mp4', bytes: bytes.length, tipo: 'video/mp4', duracion: 4 } })
    const mitad = Math.floor(bytes.length / 2)
    expect((await trozo({ id: fuenteId, offset: 0, cuerpo: bytes.subarray(0, mitad) })).body).toEqual({ recibidos: mitad, completo: false })
    const fin = await trozo({ id: fuenteId, offset: mitad, cuerpo: bytes.subarray(mitad) })
    expect(fin.statusCode).toBe(200)
    expect(fin.body).toMatchObject({ recibidos: bytes.length, completo: true, fuente: { id: fuenteId, estado: 'lista', disponible: true } })
    expect(fin.body.fuente.duracion).toBeCloseTo(4, 0)
    expect(fs.readFileSync(rutaFuenteSubida(PERFIL, fuenteId)).equals(bytes)).toBe(true)
    expect(fs.existsSync(dirSubidaFuente(fuenteId))).toBe(false)
    // Un reintento del último trozo ya no empieza otra subida.
    expect((await trozo({ id: fuenteId, offset: mitad, cuerpo: bytes.subarray(mitad) })).body).toMatchObject({ recibidos: bytes.length })

    const r = await llama({ method: 'POST', action: 'crear', body: { fuenteId, variantes: [{ ajustes: { recorte: 0.5 } }] } })
    expect(r.statusCode).toBe(200)
    await encola.mock.calls[0][0].ejecuta()
    const fila = db.helm_trial_reels[0]
    expect(fila).toMatchObject({ estado: 'listo', cobrado_eur: 0.3 })
    expect(MOVIMIENTOS()).toEqual([expect.objectContaining({ importe: -0.3, modelo: 'trial-reel', referencia: `trial:${fila.id}` })])
    expect(fs.existsSync(rutaFuenteSubida(PERFIL, fuenteId))).toBe(true)
    // El vídeo subido se puede volver a ver (vista previa) y descargar la variante.
    expect((await llama({ action: 'fuente-video', query: { id: fuenteId } })).descargado.equals(bytes)).toBe(true)

    // Una que falla (el vídeo ya no está) no se cobra.
    await llama({ method: 'POST', action: 'crear', body: { fuenteId, variantes: [{}] } })
    fs.rmSync(rutaFuenteSubida(PERFIL, fuenteId))
    await encola.mock.calls[1][0].ejecuta()
    expect(db.helm_trial_reels[1].estado).toBe('error')
    expect(db.helm_trial_reels[1].cobrado_eur).toBeUndefined()
    expect(db.helm_trial_reels[1].error).toMatch(/ya no está/)
    expect(MOVIMIENTOS()).toHaveLength(1)
  }, 60_000)

  it.skipIf(!hayFfmpeg)('un archivo con cabecera de MP4 que ffprobe no lee: error y fuera del disco', async () => {
    const basura = Buffer.concat([CABEZA_MP4, Buffer.alloc(200, 7)])
    const { body: { fuenteId } } = await llama({ method: 'POST', action: 'fuente', body: { nombre: 'roto.mp4', bytes: basura.length, tipo: 'video/mp4' } })
    const r = await trozo({ id: fuenteId, offset: 0, cuerpo: basura })
    expect(r.statusCode).toBe(422)
    expect(fs.existsSync(rutaFuenteSubida(PERFIL, fuenteId))).toBe(false)
    expect(db.helm_trial_fuentes.find(f => f.id === fuenteId)).toMatchObject({ estado: 'error' })
  }, 30_000)
})

// ── Lo que arregló la revisión ─────────────────────────────────────────────
describe('trial-reels · ciclo de vida de las subidas', () => {
  const hace = (min) => new Date(Date.now() - min * 60_000).toISOString()
  const fuente = (extra = {}) => ({ id: nuevoId(), client_id: PERFIL, nombre: 'v.mp4', bytes: 1000, estado: 'subiendo', created_at: hace(0), updated_at: hace(0), ...extra })

  it('una subida parada (sin un byte en 15 min) sale «cortada» y no tapa el hueco de otra', async () => {
    // Tres cortadas (pestaña cerrada, red caída): antes daban 429 durante 6 horas.
    db.helm_trial_fuentes = [fuente({ updated_at: hace(20) }), fuente({ updated_at: hace(30) }), fuente({ updated_at: hace(16) })]
    const r = await llama({ method: 'POST', action: 'fuente', body: { nombre: 'nuevo.mp4', bytes: 1000, tipo: 'video/mp4' } })
    expect(r.statusCode).toBe(200)
    const lista = (await llama({ action: 'lista' })).body.fuentes
    expect(lista.filter(f => f.estado === 'cortada')).toHaveLength(3)
    expect(lista.find(f => f.estado === 'cortada').error).toMatch(/se cortó a medias/)
    expect(lista.find(f => f.id === r.body.fuenteId).estado).toBe('subiendo')
    // Las vivas sí cuentan: con tres de verdad, la cuarta espera.
    db.helm_trial_fuentes.push(fuente(), fuente())
    expect((await llama({ method: 'POST', action: 'fuente', body: { nombre: 'otro.mp4', bytes: 1000, tipo: 'video/mp4' } })).statusCode).toBe(429)
  })

  it('cada trozo la mantiene viva (toca la fila), y un trozo entrando también cuenta (su subida.part)', async () => {
    const { body: { fuenteId } } = await llama({ method: 'POST', action: 'fuente', body: { nombre: 'a.mp4', bytes: 60, tipo: 'video/mp4' } })
    const fila = db.helm_trial_fuentes.find(f => f.id === fuenteId)
    fila.updated_at = hace(40)
    expect((await trozo({ id: fuenteId, offset: 0, cuerpo: CABEZA_MP4.subarray(0, 20) })).statusCode).toBe(200)
    expect(Date.now() - new Date(fila.updated_at).getTime()).toBeLessThan(5000)
    // La fila vieja pero la parte recién escrita (un trozo largo entrando): viva.
    fila.updated_at = hace(40)
    expect((await llama({ action: 'lista' })).body.fuentes[0]).toMatchObject({ id: fuenteId, estado: 'subiendo' })
    // Y parada de verdad (ni la fila ni la parte se mueven): cortada.
    const viejo = new Date(Date.now() - 40 * 60_000)
    fs.utimesSync(path.join(dirSubidaFuente(fuenteId), 'subida.part'), viejo, viejo)
    expect((await llama({ action: 'lista' })).body.fuentes[0]).toMatchObject({ id: fuenteId, estado: 'cortada' })
    // Se puede seguir con el mismo id desde lo que tiene el servidor.
    expect((await trozo({ id: fuenteId, method: 'GET' })).body).toEqual({ recibidos: 20, estado: 'subiendo' })
    expect((await trozo({ id: fuenteId, offset: 20, cuerpo: Buffer.alloc(20) })).body).toEqual({ recibidos: 40, completo: false })
  })

  it('cancelar una subida (borrar-fuente) quita la fila y lo que había llegado', async () => {
    const { body: { fuenteId } } = await llama({ method: 'POST', action: 'fuente', body: { nombre: 'a.mp4', bytes: 40, tipo: 'video/mp4' } })
    await trozo({ id: fuenteId, offset: 0, cuerpo: CABEZA_MP4.subarray(0, 20) })
    expect(fs.existsSync(dirSubidaFuente(fuenteId))).toBe(true)
    expect((await llama({ method: 'POST', action: 'borrar-fuente', body: { id: fuenteId } })).statusCode).toBe(200)
    expect(fs.existsSync(dirSubidaFuente(fuenteId))).toBe(false)
    expect(db.helm_trial_fuentes.find(f => f.id === fuenteId)).toBeUndefined()
    expect((await trozo({ id: fuenteId, offset: 20, cuerpo: Buffer.alloc(20) })).statusCode).toBe(404)
  })
})

describe('trial-reels · tope de lo guardado por perfil', () => {
  const guarda = (clientId, bytes = 10) => {
    const ruta = rutaFuenteSubida(clientId, nuevoId())
    fs.mkdirSync(path.dirname(ruta), { recursive: true })
    fs.writeFileSync(ruta, Buffer.alloc(bytes))
    return ruta
  }

  it('guardadoDelPerfil cuenta solo los suyos de los últimos 7 días', async () => {
    guarda(PERFIL, 100); guarda(PERFIL, 50); guarda(OTRO, 999)
    const viejo = guarda(PERFIL, 70)
    const hace8 = new Date(Date.now() - 8 * 86_400_000)
    fs.utimesSync(viejo, hace8, hace8)
    expect(await guardadoDelPerfil(PERFIL)).toEqual({ videos: 2, bytes: 150 })
    expect(await guardadoDelPerfil(HERMANO)).toEqual({ videos: 0, bytes: 0 })
  })

  it('con 10 vídeos guardados, o pasando de 2 GB, no deja subir otro (429 con qué hacer)', async () => {
    for (let i = 0; i < 9; i++) guarda(PERFIL)
    expect((await llama({ method: 'POST', action: 'fuente', body: { nombre: 'a.mp4', bytes: 1000, tipo: 'video/mp4' } })).statusCode).toBe(200)
    // 9 en el disco y 1 llegando: el décimo ya no.
    const r = await llama({ method: 'POST', action: 'fuente', body: { nombre: 'b.mp4', bytes: 1000, tipo: 'video/mp4' } })
    expect(r.statusCode).toBe(429)
    expect(r.body.error).toMatch(/Ya tienes 10 vídeos subidos guardados\. Quita alguno/)
    // Otro perfil no se ve afectado.
    expect((await llama({ method: 'POST', action: 'fuente', query: { clientId: OTRO }, body: { nombre: 'c.mp4', bytes: 1000, tipo: 'video/mp4' } })).statusCode).toBe(200)

    // Por peso: 1,9 GB en el disco (un archivo disperso, no ocupa de verdad) + 200 MB nuevos.
    fs.rmSync(path.join(DATOS, 'trial-reels', 'fuentes'), { recursive: true, force: true })
    db.helm_trial_fuentes = []
    const grande = guarda(PERFIL, 1)
    fs.truncateSync(grande, Math.round(1.9 * 1024 ** 3))
    const pesa = await llama({ method: 'POST', action: 'fuente', body: { nombre: 'd.mp4', bytes: 200 * 1024 * 1024, tipo: 'video/mp4' } })
    expect(pesa.statusCode).toBe(429)
    expect(pesa.body.error).toMatch(/ya ocupan 1,9 GB y el tope es de 2 GB por perfil/)
    expect((await llama({ method: 'POST', action: 'fuente', body: { nombre: 'e.mp4', bytes: 50 * 1024 * 1024, tipo: 'video/mp4' } })).statusCode).toBe(200)
  })
})

describe('trial-reels · cobro seguro', () => {
  /** Una variante en cola desde un vídeo subido (en disco), con el montaje simulado. */
  async function enCola() {
    const f = { id: nuevoId(), client_id: PERFIL, nombre: 'a.mp4', bytes: 10, estado: 'lista', created_at: new Date().toISOString() }
    db.helm_trial_fuentes = [f]
    fs.mkdirSync(path.dirname(rutaFuenteSubida(PERFIL, f.id)), { recursive: true })
    fs.writeFileSync(rutaFuenteSubida(PERFIL, f.id), 'mp4')
    const r = await llama({ method: 'POST', action: 'crear', body: { fuenteId: f.id, variantes: [{}] } })
    expect(r.statusCode).toBe(200)
    procesaVariante.mockImplementationOnce(async ({ salida }) => { fs.writeFileSync(salida, 'mp4 montado'); return { bytes: 11, duracion: 4 } })
    return { trabajo: encola.mock.calls.at(-1)[0], id: r.body.ids[0] }
  }

  it('si la base no apunta «listo», la variante no se cobra ni se queda en el disco', async () => {
    const { trabajo, id } = await enCola()
    fallos.update = (tabla, cambios) => tabla === 'helm_trial_reels' && cambios.estado === 'listo'
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    await trabajo.ejecuta()
    log.mockRestore()
    expect(db.helm_trial_reels[0]).toMatchObject({ id, estado: 'error' })
    expect(db.helm_trial_reels[0].cobrado_eur).toBeUndefined()
    expect(MOVIMIENTOS()).toHaveLength(0)
    expect(fs.existsSync(rutaSalida(id))).toBe(false)
  })

  it('y si la apunta, se cobra una vez', async () => {
    const { trabajo, id } = await enCola()
    await trabajo.ejecuta()
    expect(db.helm_trial_reels[0]).toMatchObject({ id, estado: 'listo', cobrado_eur: 0.3 })
    expect(MOVIMIENTOS()).toEqual([expect.objectContaining({ importe: -0.3, referencia: `trial:${id}` })])
  })

  it('dos «crear» a la vez con saldo para uno: pasa uno y el otro da 402', async () => {
    db.agencias[0].saldo = 0.3
    const [a, b] = await Promise.all([
      llama({ method: 'POST', action: 'crear', body: { mediaId: REEL, variantes: [{}] } }),
      llama({ method: 'POST', action: 'crear', body: { mediaId: REEL, variantes: [{}] } }),
    ])
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 402])
    expect(db.helm_trial_reels).toHaveLength(1)
    // Y también entre perfiles de la misma agencia.
    db.helm_ig_media.push({ client_id: HERMANO, media_id: '17900000000000003', tipo: 'VIDEO', producto: 'REELS' })
    db.agencias[0].saldo = 0.6
    const [c, d] = await Promise.all([
      llama({ method: 'POST', action: 'crear', body: { mediaId: REEL, variantes: [{}] } }),
      llama({ method: 'POST', action: 'crear', query: { clientId: HERMANO }, body: { mediaId: '17900000000000003', variantes: [{}] } }),
    ])
    expect([c.statusCode, d.statusCode].sort()).toEqual([200, 402])
  })

  it('mantenimiento: cobra lo que salió bien sin apuntarlo (una vez) y limpia lo de más de 7 días', async () => {
    const viejo = new Date(Date.now() - 5 * 60_000).toISOString()
    const fila = (extra) => ({ id: nuevoId(), client_id: PERFIL, estado: 'listo', precio_eur: 0.3, cobrado_eur: null, created_at: viejo, updated_at: viejo, ...extra })
    const pendiente = fila()
    const hermana = fila({ client_id: HERMANO })
    const reciente = fila({ updated_at: new Date().toISOString() })
    const antigua = fila({ precio_eur: null })
    const cobrada = fila({ cobrado_eur: 0.3 })
    const fallida = fila({ estado: 'error' })
    db.helm_trial_reels = [pendiente, hermana, reciente, antigua, cobrada, fallida]
    const caducado = rutaFuenteSubida(PERFIL, nuevoId())
    fs.mkdirSync(path.dirname(caducado), { recursive: true })
    fs.writeFileSync(caducado, 'mp4')
    const hace8 = new Date(Date.now() - 8 * 86_400_000)
    fs.utimesSync(caducado, hace8, hace8)

    expect(await mantenimiento()).toBe(2)
    expect(MOVIMIENTOS().map(m => m.referencia).sort()).toEqual([`trial:${hermana.id}`, `trial:${pendiente.id}`].sort())
    expect([pendiente.cobrado_eur, hermana.cobrado_eur, reciente.cobrado_eur, antigua.cobrado_eur, fallida.cobrado_eur]).toEqual([0.3, 0.3, null, null, null])
    expect(fs.existsSync(caducado)).toBe(false)
    // Otra vuelta no cobra nada más.
    expect(await mantenimiento()).toBe(0)
    expect(MOVIMIENTOS()).toHaveLength(2)
  })
})

describe('trial-reels · más vídeos que se aceptan', () => {
  const caja = (tam, tipo, resto = 'qt  ') => Buffer.concat([Buffer.from([tam >>> 24, (tam >>> 16) & 255, (tam >>> 8) & 255, tam & 255]), Buffer.from(tipo + resto, 'latin1')])

  it('esVideoIsoBmff: también los MOV que empiezan por moov, mdat, wide o free (no las listas)', () => {
    expect(esVideoIsoBmff(caja(8, 'wide'))).toBe(true)
    expect(esVideoIsoBmff(caja(1024, 'moov'))).toBe(true)
    expect(esVideoIsoBmff(caja(0, 'mdat'))).toBe(true)
    expect(esVideoIsoBmff(caja(1, 'mdat'))).toBe(true)
    expect(esVideoIsoBmff(caja(16, 'free'))).toBe(true)
    // Tamaños imposibles o cajas que no son de vídeo: no.
    expect(esVideoIsoBmff(caja(0, 'wide'))).toBe(false)
    expect(esVideoIsoBmff(caja(4, 'moov'))).toBe(false)
    expect(esVideoIsoBmff(caja(32, 'abcd'))).toBe(false)
    expect(esVideoIsoBmff(Buffer.from('ffconcat version 1.0\nfile /etc/passwd'))).toBe(false)
  })

  it('fuente: acepta el 3GP de Android; el tipo raro, con la pista de exportarlo a MP4', async () => {
    expect((await llama({ method: 'POST', action: 'fuente', body: { nombre: 'a.3gp', bytes: 1000, tipo: 'video/3gpp' } })).statusCode).toBe(200)
    expect((await llama({ method: 'POST', action: 'fuente', body: { nombre: 'b.3gp', bytes: 1000, tipo: '' } })).statusCode).toBe(200)
    const r = await llama({ method: 'POST', action: 'fuente', body: { nombre: 'c.avi', bytes: 1000, tipo: 'video/x-msvideo' } })
    expect(r.statusCode).toBe(415)
    expect(r.body.error).toMatch(/expórtalo como MP4/)
  })

  it('un MOV antiguo (empieza por «wide») pasa el primer trozo; lo que no es vídeo dice cómo arreglarlo', async () => {
    const { body: { fuenteId } } = await llama({ method: 'POST', action: 'fuente', body: { nombre: 'viejo.mov', bytes: 40, tipo: 'video/quicktime' } })
    expect((await trozo({ id: fuenteId, offset: 0, cuerpo: Buffer.concat([caja(8, 'wide', ''), caja(1000, 'mdat')]).subarray(0, 16) })).statusCode).toBe(200)
    const { body: { fuenteId: otro } } = await llama({ method: 'POST', action: 'fuente', body: { nombre: 'falso.mov', bytes: 40, tipo: 'video/quicktime' } })
    const malo = await trozo({ id: otro, offset: 0, cuerpo: Buffer.from('RIFF....AVI LIST'.padEnd(40, ' ')) })
    expect(malo.statusCode).toBe(415)
    expect(malo.body.error).toMatch(/expórtalo otra vez como MP4/)
  })
})
