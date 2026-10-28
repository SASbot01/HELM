// Portadas con IA (2026-10-22): los estilos y su prompt (src/agents/portadas/
// estilosIa.js), las acciones del servidor (api/portadas.js · portada-ia,
// fondo-ia, ejemplos) y la generación con nano-banana-pro (api/_lib/imagen.js).
// Sin red ni base: Supabase, el almacén y Replicate van simulados; el cobro (40
// créditos por imagen, desde el 27-oct) va con el api/_lib/creditos.js de
// verdad sobre esa base (mover_saldo incluido).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { existsSync } from 'node:fs'
import { ESTILOS_IA, estiloIaPorClave, ejemploDe, referenciaDe, promptPortadaIa, vistaDe } from '../src/agents/portadas/estilosIa.js'
import { contraste } from '../src/agents/portadas/reglas.js'

const PERFIL = 'perfil-1'
// Un JPEG de verdad empieza por FF D8 FF; imagenDeDataUrl comprueba la cabecera.
const JPG = `data:image/jpeg;base64,${Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('fotograma-de-prueba')]).toString('base64')}`
// Bytes que NO son imagen aunque la etiqueta diga png.
const FALSO_PNG = `data:image/png;base64,${Buffer.from('esto no es un png').toString('base64')}`

// Los de la investigación de miniaturas: los que dicen quién los usa.
const DE_LA_INVESTIGACION = ESTILOS_IA.filter(e => e.para)

describe('estilos', () => {
  it('claves únicas; la imagen de tarjeta y la referencia, si las hay, existen en public/', () => {
    expect(new Set(ESTILOS_IA.map(e => e.clave)).size).toBe(ESTILOS_IA.length)
    for (const e of ESTILOS_IA) {
      const img = ejemploDe(e)
      if (img) expect(existsSync(`public${img}`), img).toBe(true)
      const ref = referenciaDe(e)
      if (e.referencia) expect(existsSync(ref), ref).toBe(true)
      else expect(ref).toBeNull()
    }
    // Los de siempre conservan su imagen; «A tu manera», su icono.
    expect(['oro', 'neon', 'noticia', 'arco', 'collage', 'datos'].map(k => Boolean(ejemploDe(estiloIaPorClave(k))))).toEqual(Array(6).fill(true))
    expect(ejemploDe(estiloIaPorClave('libre'))).toBeNull()
    expect(ESTILOS_IA.at(-1).clave).toBe('libre')
  })

  it('la investigación, agrupada: 12–15 estilos distintos, con quién los usa y sin imagen', () => {
    expect(DE_LA_INVESTIGACION.length).toBeGreaterThanOrEqual(12)
    expect(DE_LA_INVESTIGACION.length).toBeLessThanOrEqual(15)
    expect(new Set(DE_LA_INVESTIGACION.map(e => e.nombre)).size).toBe(DE_LA_INVESTIGACION.length)
    for (const e of DE_LA_INVESTIGACION) {
      expect(e.desc.length, e.clave).toBeGreaterThan(30)
      expect(e.para.length, e.clave).toBeGreaterThan(0)
      for (const p of e.para) {
        expect(p.nombre).toBeTruthy()
        expect(p.enlace, p.nombre).toMatch(/^https:\/\/(www\.)?(youtube\.com|instagram\.com|x\.com|linkedin\.com|lauraribas\.com|oscarfeito\.gumroad\.com)(\/|$)/)
      }
      expect(ejemploDe(e), e.clave).toBeNull()
      expect(referenciaDe(e), e.clave).toBeNull()
      // El nombre es genérico: no es el de ninguno de los creadores.
      for (const p of e.para) expect(e.nombre.toLowerCase()).not.toContain(p.nombre.toLowerCase().split(' ')[0])
    }
    // Ali Abdaal solo una vez en la lista de creadores (estaba repetido en la investigación).
    const enlaces = new Set(DE_LA_INVESTIGACION.flatMap(e => e.para.map(p => p.enlace)))
    expect([...enlaces].filter(u => u.includes('aliabdaal'))).toHaveLength(1)
  })

  it('el prompt de cada estilo nuevo nunca pide la cara, el logo ni la marca de nadie', () => {
    const todos = DE_LA_INVESTIGACION.flatMap(e => e.para.map(p => p.nombre))
    for (const e of DE_LA_INVESTIGACION) {
      expect(e.estilo, e.clave).toMatch(/^Style: /)
      // Ni un nombre de creador en lo que se manda a la IA.
      for (const n of todos) expect(e.estilo.toLowerCase(), `${e.clave} · ${n}`).not.toContain(n.toLowerCase())
      // La persona es la del fotograma (image 1) o no sale ninguna nueva.
      expect(e.estilo, e.clave).toMatch(/image 1|the person/i)
      // Si habla de logos o marcas, es para prohibirlos o pedirlos genéricos.
      for (const frase of e.estilo.match(/[^.]*\b(logos?|brand|branded)\b[^.]*/gi) || []) {
        expect(frase, e.clave).toMatch(/\bno\b|unbranded|never|generic|brand main color|brand accent color|personal-brand/i)
      }
      expect(e.estilo, e.clave).not.toMatch(/\b(face|logo|brand) of\b/i)
    }
  })

  it('vista previa sin imagen: degradado, silueta neutra, titular con su resaltada y contraste que se lee', () => {
    for (const e of ESTILOS_IA) {
      const v = vistaDe(e)
      if (ejemploDe(e) || e.clave === 'libre') { expect(v, e.clave).toBeNull(); continue }
      expect(v, e.clave).not.toBeNull()
      expect(v.degradado).toMatch(/^linear-gradient\(/)
      for (const c of [v.tinta, v.resalte, ...v.fondo]) expect(c, e.clave).toMatch(/^#[0-9A-F]{6}$/)
      expect(v.palabras.length, e.clave).toBeGreaterThan(1)
      expect(v.palabras.filter(p => p.resaltada).length, e.clave).toBe(1)
      expect(v.silueta).toMatch(/^rgba\(/)
      // El titular se lee (AA para letra grande) y la resaltada se distingue.
      for (const d of v.detras) {
        expect(contraste(v.tinta, d), `${e.clave} tinta`).toBeGreaterThanOrEqual(3)
        expect(contraste(v.resalte, d), `${e.clave} resalte`).toBeGreaterThanOrEqual(2)
      }
    }
    const verdad = vistaDe(estiloIaPorClave('verdad'))
    expect(verdad.palabras.map(p => p.texto).join(' ')).toBe('NADIE TE LO DICE')
    expect(verdad.palabras[0].resaltada).toBe(true)
    // Los de marca se enseñan con los colores del kit.
    const marca = vistaDe(estiloIaPorClave('marca'), { colorPrincipal: '#1d4ed8', colorResalte: '#facc15' })
    expect(marca).toMatchObject({ fondo: ['#1D4ED8', '#1D4ED8'], resalte: '#FACC15', tinta: '#FFFFFF' })
    expect(vistaDe(estiloIaPorClave('verdad'), { colorPrincipal: '#1d4ed8', colorResalte: '#facc15' }).fondo).toEqual(verdad.fondo)
    expect(vistaDe(estiloIaPorClave('antes')).degradado).toContain('50%')
    expect(vistaDe(null)).toBeNull()
  })

  it('mayúsculas con tilde en el titular y los colores del kit en los estilos de marca', () => {
    const p = promptPortadaIa({ estilo: estiloIaPorClave('verdad'), titulo: 'Deja de ahorrar así, campeón', imagenes: 1 })
    expect(p).toContain('«DEJA DE AHORRAR ASÍ, CAMPEÓN»')
    expect(p).toMatch(/Never add any other real person/)
    const m = promptPortadaIa({ estilo: estiloIaPorClave('marca'), titulo: '5 formas de vender', colores: ['#E4362B', '#E8B93A'] })
    expect(m).toContain('«5 formas de vender»')
    expect(m).toContain('#E4362B, #E8B93A')
    expect(promptPortadaIa({ estilo: estiloIaPorClave('verdad'), titulo: 'x', colores: ['#E4362B'] })).not.toContain('#E4362B')
  })

  it('el prompt lleva el título tal cual, conserva a la persona y solo habla de referencia si la hay', () => {
    const solo = promptPortadaIa({ estilo: estiloIaPorClave('oro'), titulo: 'El mayor truco', imagenes: 1 })
    expect(solo).toContain('«El mayor truco»')
    expect(solo).toMatch(/THIS SAME PERSON exactly/)
    expect(solo).not.toMatch(/STYLE REFERENCE/)
    const conRef = promptPortadaIa({ estilo: estiloIaPorClave('neon'), titulo: 'Diseña así', tema: 'webs con IA', detalle: 'que salga un portátil', imagenes: 2 })
    expect(conRef).toMatch(/Image 2 is a STYLE REFERENCE ONLY/)
    expect(conRef).toMatch(/play button/)
    expect(conRef).toContain('que salga un portátil')
    expect(conRef).toContain('webs con IA')
  })
})

// ── El servidor ──────────────────────────────────────────────────────────────
const AGENCIA = 'e0000000-0000-4000-8000-0000000000a1'
const db = { agent_memory: [], helm_ig_media: [], agencias: [], clients: [], agencia_movimientos: [] }
// mover_saldo como en la base: no apunta dos veces la misma referencia.
const rpc = vi.hoisted(() => vi.fn())
function moverSaldo(fn, a) {
  if (a.p_referencia && db.agencia_movimientos.some(m => m.referencia === a.p_referencia)) return { data: null, error: null }
  db.agencia_movimientos.push({ importe: a.p_importe, modelo: a.p_modelo, referencia: a.p_referencia, coste: a.p_coste_usd, origen: a.p_origen, client: a.p_client })
  const ag = db.agencias.find(x => x.id === a.p_agencia)
  ag.saldo = Math.round((ag.saldo + a.p_importe) * 10000) / 10000
  return { data: ag.saldo, error: null }
}
const almacen = new Map()
const subidas = []
function consulta(tabla) {
  const f = {}
  const q = {
    select: () => q, order: () => q, limit: () => q,
    eq: (c, v) => { f[c] = v; return q },
    maybeSingle: () => Promise.resolve({ data: (db[tabla] || []).find(r => Object.entries(f).every(([k, v]) => r[k] === v)) || null, error: null }),
    insert: (fila) => { db[tabla].push({ id: `m-${db[tabla].length + 1}`, ...fila }); return Promise.resolve({ error: null }) },
    update: (cambios) => ({ eq: (c, v) => ({ eq: () => { const r = db[tabla].find(x => x[c] === v); Object.assign(r, cambios); return Promise.resolve({ error: null }) } }) }),
  }
  return q
}
vi.mock('../api/lib/supabase.js', () => ({
  supabase: {
    from: (t) => consulta(t),
    rpc: (...a) => rpc(...a),
    storage: {
      from: () => ({
        upload: async (ruta, buf, opts) => { subidas.push({ ruta, opts }); almacen.set(ruta, buf); return { error: null } },
        getPublicUrl: (ruta) => ({ data: { publicUrl: `https://almacen/${ruta}` } }),
        download: async (ruta) => (almacen.has(ruta) ? { data: new Blob([almacen.get(ruta)], { type: 'image/jpeg' }), error: null } : { data: null, error: { message: 'no' } }),
        remove: async (rutas) => { rutas.forEach(r => almacen.delete(r)); return { error: null } },
      }),
    },
  },
}))
vi.mock('../api/_lib/access.js', () => ({
  requireProfileAccess: vi.fn(async () => ({ sub: 'u-1' })),
  agenciaDe: async (clientId) => (db.clients || []).find(c => c.id === clientId)?.agencia_id || null,
}))
vi.mock('../api/_lib/llm.js', () => ({ llmChat: vi.fn() }))
vi.mock('../api/_lib/instagram.js', () => ({ getToken: vi.fn(), getMediaUrls: vi.fn() }))
vi.mock('../api/_lib/web.js', () => ({ fetchPublico: vi.fn() }))
const imagen = vi.hoisted(() => ({
  hayClaveImagen: vi.fn(() => true),
  generaFondo: vi.fn(),
  generaPortadaIa: vi.fn(async () => ({ dataUrl: 'data:image/jpeg;base64,UE9SVEFEQQ==', bytes: 7 })),
}))
vi.mock('../api/_lib/imagen.js', () => imagen)

const { default: portadas } = await import('../api/portadas.js')

let ip = 0
async function llama({ method = 'POST', action, body = {}, query = {} }) {
  const res = {
    statusCode: 0, body: null, headers: {},
    status(c) { this.statusCode = c; return this }, json(b) { this.body = b; return this }, end() { return this }, setHeader(k, v) { this.headers[k] = v },
  }
  await portadas({ method, query: { action, clientId: PERFIL, ...query }, body: method === 'POST' ? { clientId: PERFIL, ...body } : undefined, headers: { 'x-forwarded-for': `10.9.1.${++ip}` }, socket: {} }, res)
  return res
}

beforeEach(() => {
  db.agent_memory = []
  db.helm_ig_media = [{ client_id: PERFIL, media_id: 'm1', caption: 'El mayor truco para diseñar webs con IA\nmás texto' }]
  db.agencias = [{ id: AGENCIA, saldo: 5, sin_cobro: false }]
  db.clients = [{ id: PERFIL, agencia_id: AGENCIA }]
  db.agencia_movimientos = []
  rpc.mockReset(); rpc.mockImplementation(async (...a) => moverSaldo(...a))
  almacen.clear(); subidas.length = 0
  imagen.generaPortadaIa.mockClear(); imagen.generaFondo.mockReset(); imagen.hayClaveImagen.mockReturnValue(true)
})
afterEach(() => vi.clearAllTimers())

describe('portada-ia', () => {
  it('genera con el fotograma y la referencia del estilo, y el tema del reel', async () => {
    const r = await llama({ action: 'portada-ia', body: { fotograma: JPG, titulo: 'El mayor truco', estilo: 'neon', mediaId: 'm1' } })
    expect(r.statusCode).toBe(200)
    expect(r.body).toMatchObject({ imagen: 'data:image/jpeg;base64,UE9SVEFEQQ==', ia: true })
    const { prompt, imagenes } = imagen.generaPortadaIa.mock.calls[0][0]
    expect(imagenes).toHaveLength(2)
    expect(imagenes[0]).toBe(JPG)
    expect(imagenes[1].startsWith('data:image/jpeg;base64,')).toBe(true)
    expect(prompt).toContain('«El mayor truco»')
    expect(prompt).toContain('El mayor truco para diseñar webs con IA')
    expect(prompt).not.toContain('más texto')
  })

  it('un estilo sin referencia manda solo el fotograma', async () => {
    const r = await llama({ action: 'portada-ia', body: { fotograma: JPG, titulo: 'Hola', estilo: 'oro' } })
    expect(r.statusCode).toBe(200)
    expect(imagen.generaPortadaIa.mock.calls[0][0].imagenes).toHaveLength(1)
  })

  it('lo que falta o no vale, 400 sin gastar nada', async () => {
    const casos = [
      [{ titulo: 'Hola', estilo: 'oro' }, /fotograma/],
      [{ fotograma: 'data:text/html;base64,PHNjcmlwdD4=', titulo: 'Hola', estilo: 'oro' }, /fotograma/],
      [{ fotograma: FALSO_PNG, titulo: 'Hola', estilo: 'oro' }, /fotograma/],
      [{ fotograma: JPG, estilo: 'oro' }, /titular/],
      [{ fotograma: JPG, titulo: 'x'.repeat(61), estilo: 'oro' }, /60/],
      [{ fotograma: JPG, titulo: 'Hola', estilo: 'inventado' }, /estilo/],
      [{ fotograma: JPG, titulo: 'Hola', estilo: '__proto__' }, /estilo/],
      [{ fotograma: JPG, titulo: 'Hola', estilo: 'libre' }, /Describe/],
    ]
    for (const [body, error] of casos) {
      const r = await llama({ action: 'portada-ia', body })
      expect(r.statusCode, JSON.stringify(body)).toBe(400)
      expect(r.body.error).toMatch(error)
    }
    expect(imagen.generaPortadaIa).not.toHaveBeenCalled()
  })

  it('sin clave de imagen, 503', async () => {
    imagen.hayClaveImagen.mockReturnValue(false)
    const r = await llama({ action: 'portada-ia', body: { fotograma: JPG, titulo: 'Hola', estilo: 'oro' } })
    expect(r.statusCode).toBe(503)
  })

  it('el error de Replicate (sin saldo) llega tal cual al panel', async () => {
    imagen.generaPortadaIa.mockRejectedValueOnce(Object.assign(new Error('Replicate se ha quedado sin saldo.'), { statusCode: 503 }))
    const r = await llama({ action: 'portada-ia', body: { fotograma: JPG, titulo: 'Hola', estilo: 'oro' } })
    expect(r.statusCode).toBe(503)
    expect(r.body.error).toMatch(/sin saldo/)
  })
})

describe('cobro: 40 créditos por imagen generada', () => {
  const pide = (extra = {}) => llama({ action: 'portada-ia', body: { fotograma: JPG, titulo: 'Hola', estilo: 'oro', ...extra } })

  it('portada-ia: se cobra solo cuando Replicate devuelve la imagen, con una referencia nueva cada vez', async () => {
    const r = await pide()
    expect(r.statusCode).toBe(200)
    expect(r.body).toMatchObject({ ia: true, cobrado: 0.4, saldo: 4.6 })
    expect(db.agencia_movimientos).toEqual([expect.objectContaining({ importe: -0.4, modelo: 'portada-ia', origen: 'panel', client: PERFIL, coste: 0.15 })])
    expect(db.agencia_movimientos[0].referencia).toMatch(/^portada:[0-9a-f-]{36}$/)
    await pide()
    expect(db.agencia_movimientos).toHaveLength(2)
    expect(db.agencia_movimientos[1].referencia).not.toBe(db.agencia_movimientos[0].referencia)
    expect(db.agencias[0].saldo).toBe(4.2)
  })

  it('si Replicate falla, no se cobra nada', async () => {
    imagen.generaPortadaIa.mockRejectedValueOnce(Object.assign(new Error('La generación ha fallado: NSFW'), { statusCode: 502 }))
    const r = await pide()
    expect(r.statusCode).toBe(502)
    expect(rpc).not.toHaveBeenCalled()
    expect(db.agencias[0].saldo).toBe(5)
  })

  it('sin saldo, 402 con el precio y sin llamar a Replicate', async () => {
    db.agencias[0].saldo = 0.3
    const r = await pide()
    expect(r.statusCode).toBe(402)
    expect(r.body.error).toBe('No tienes saldo suficiente: esto cuesta 40 créditos y te quedan 30. Recarga en Créditos.')
    expect(imagen.generaPortadaIa).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('lo que se está generando ya está apartado: con 50 créditos no salen dos a la vez', async () => {
    db.agencias[0].saldo = 0.5
    let suelta
    imagen.generaPortadaIa.mockImplementationOnce(() => new Promise(ok => { suelta = () => ok({ dataUrl: 'data:image/jpeg;base64,UE9SVEFEQQ==' }) }))
    const primera = pide()
    await vi.waitFor(() => expect(suelta).toBeTypeOf('function'))
    const segunda = await pide()
    expect(segunda.statusCode).toBe(402)
    expect(segunda.body.error).toMatch(/otros 40 ya están apartados/)
    suelta()
    expect((await primera).statusCode).toBe(200)
    expect(db.agencias[0].saldo).toBe(0.1)
    // Terminada, ya no hay nada apartado: con 10 créditos, no llega (y lo dice sin apartados).
    expect((await pide()).body.error).toBe('No tienes saldo suficiente: esto cuesta 40 créditos y te quedan 10. Recarga en Créditos.')
  })

  it('la agencia de la casa (sin_cobro) y un perfil sin agencia no pagan', async () => {
    db.agencias[0] = { id: AGENCIA, saldo: 0, sin_cobro: true }
    expect((await pide()).body).toMatchObject({ cobrado: 0, saldo: null })
    db.clients = []
    expect((await pide()).statusCode).toBe(200)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('fondo-ia: lo mismo, con su concepto; y sin clave de imagen, 503 sin mirar el saldo', async () => {
    imagen.generaFondo.mockResolvedValue({ dataUrl: 'data:image/png;base64,Rk9ORE8=' })
    const r = await llama({ action: 'fondo-ia', body: { prompt: 'a gym at dawn, vertical 9:16, no text' } })
    expect(r.statusCode).toBe(200)
    expect(r.body).toMatchObject({ imagen: 'data:image/png;base64,Rk9ORE8=', ia: true, cobrado: 0.4 })
    expect(db.agencia_movimientos).toEqual([expect.objectContaining({ importe: -0.4, modelo: 'fondo-ia', coste: 0.03 })])
    expect(db.agencia_movimientos[0].referencia).toMatch(/^portada:/)
    imagen.generaFondo.mockRejectedValueOnce(Object.assign(new Error('Replicate se ha quedado sin saldo.'), { statusCode: 503 }))
    expect((await llama({ action: 'fondo-ia', body: { prompt: 'otro' } })).statusCode).toBe(503)
    expect(db.agencia_movimientos).toHaveLength(1)
    expect((await llama({ action: 'fondo-ia', body: { prompt: '' } })).statusCode).toBe(400)
    imagen.hayClaveImagen.mockReturnValue(false)
    rpc.mockClear()
    expect((await llama({ action: 'fondo-ia', body: { prompt: 'x' } })).statusCode).toBe(503)
    db.agencias[0].saldo = 0
    imagen.hayClaveImagen.mockReturnValue(true)
    expect((await llama({ action: 'fondo-ia', body: { prompt: 'x' } })).statusCode).toBe(402)
  })

  it('los estilos de marca llevan los colores del kit; los demás, no', async () => {
    db.agent_memory = [{ id: 'k', client_id: PERFIL, clave: 'portadas-marca', contenido: JSON.stringify({ colorPrincipal: '#123456', colorResalte: '#ABCDEF' }) }]
    await pide({ estilo: 'marca' })
    expect(imagen.generaPortadaIa.mock.calls[0][0].prompt).toContain('#123456, #ABCDEF')
    await pide({ estilo: 'verdad', titulo: 'Deja de ahorrar' })
    const { prompt, imagenes } = imagen.generaPortadaIa.mock.calls[1][0]
    expect(prompt).not.toContain('#123456')
    expect(prompt).toContain('«DEJA DE AHORRAR»')
    // Sin imagen de referencia: solo el fotograma.
    expect(imagenes).toHaveLength(1)
  })
})

describe('ejemplos subidos a mano', () => {
  it('subir, listar, usarlo como estilo y quitarlo', async () => {
    const sub = await llama({ action: 'ejemplo', body: { nombre: 'Dorado Mercury', imagen: JPG } })
    expect(sub.statusCode).toBe(200)
    const ej = sub.body.ejemplo
    expect(ej).toMatchObject({ nombre: 'Dorado Mercury' })
    expect(ej.url).toMatch(new RegExp(`^https://almacen/${PERFIL}/portadas/ejemplos/.+\\.jpg$`))
    expect(subidas[0].opts.contentType).toBe('image/jpeg')
    expect(ej).not.toHaveProperty('ruta')

    const lista = await llama({ method: 'GET', action: 'ejemplos' })
    expect(lista.body.ejemplos.map(e => e.nombre)).toEqual(['Dorado Mercury'])

    const gen = await llama({ action: 'portada-ia', body: { fotograma: JPG, titulo: 'Hola', estilo: `ej:${ej.id}` } })
    expect(gen.statusCode).toBe(200)
    const { imagenes, prompt } = imagen.generaPortadaIa.mock.calls[0][0]
    expect(imagenes).toHaveLength(2)
    expect(prompt).toMatch(/STYLE REFERENCE/)

    const fuera = await llama({ action: 'ejemplo-borrar', body: { id: ej.id } })
    expect(fuera.statusCode).toBe(200)
    expect(fuera.body.ejemplos).toEqual([])
    expect(almacen.size).toBe(0)
    const otra = await llama({ action: 'portada-ia', body: { fotograma: JPG, titulo: 'Hola', estilo: `ej:${ej.id}` } })
    expect(otra.statusCode).toBe(404)
  })

  it('sin nombre o sin una imagen de verdad, 400 y no se sube nada', async () => {
    expect((await llama({ action: 'ejemplo', body: { nombre: '', imagen: JPG } })).statusCode).toBe(400)
    expect((await llama({ action: 'ejemplo', body: { nombre: 'X', imagen: 'data:image/svg+xml;base64,PHN2Zz4=' } })).statusCode).toBe(400)
    expect((await llama({ action: 'ejemplo', body: { nombre: 'X', imagen: FALSO_PNG } })).statusCode).toBe(400)
    expect(subidas).toHaveLength(0)
  })
})

// ── La generación (api/_lib/imagen.js de verdad, con la red simulada) ───────
describe('generaPortadaIa', () => {
  it('manda las imágenes a nano-banana-pro en 9:16 y reintenta si Replicate frena', async () => {
    vi.resetModules()
    vi.doUnmock('../api/_lib/imagen.js')
    const { generaPortadaIa } = await import('../api/_lib/imagen.js')
    process.env.REPLICATE_API_TOKEN = 'r8_test'
    vi.useFakeTimers()
    let creadas = 0
    vi.stubGlobal('fetch', vi.fn(async (url, opts) => {
      if (String(url).includes('/models/google/nano-banana-pro/predictions')) {
        creadas++
        const input = JSON.parse(opts.body).input
        expect(input).toMatchObject({ aspect_ratio: '9:16', image_input: ['data:image/jpeg;base64,QQ=='] })
        if (creadas === 1) return { ok: false, status: 429, headers: { get: (h) => (h.toLowerCase() === 'retry-after' ? '1' : null) }, json: async () => ({ detail: 'throttled' }) }
        return { ok: true, status: 201, json: async () => ({ id: 'p1', status: 'succeeded', output: 'https://cdn/x.jpg' }) }
      }
      return { ok: true, headers: { get: () => 'image/jpeg' }, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer }
    }))
    const p = generaPortadaIa({ prompt: 'x', imagenes: ['data:image/jpeg;base64,QQ=='] })
    await vi.advanceTimersByTimeAsync(3000)
    const r = await p
    expect(creadas).toBe(2)
    expect(r.dataUrl.startsWith('data:image/jpeg;base64,')).toBe(true)
    vi.useRealTimers(); vi.unstubAllGlobals(); delete process.env.REPLICATE_API_TOKEN
  })

  it('sin saldo en Replicate, un mensaje claro (503)', async () => {
    vi.resetModules()
    vi.doUnmock('../api/_lib/imagen.js')
    const { generaPortadaIa } = await import('../api/_lib/imagen.js')
    process.env.REPLICATE_API_TOKEN = 'r8_test'
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 402, json: async () => ({ title: 'Insufficient credit', detail: 'You have insufficient credit to run this model.' }) })))
    await expect(generaPortadaIa({ prompt: 'x', imagenes: ['data:image/jpeg;base64,QQ=='] })).rejects.toMatchObject({ statusCode: 503, message: expect.stringMatching(/sin saldo/) })
    vi.unstubAllGlobals(); delete process.env.REPLICATE_API_TOKEN
  })
})
