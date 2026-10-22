// Portadas con IA (2026-10-22): los estilos y su prompt (src/agents/portadas/
// estilosIa.js), las acciones del servidor (api/portadas.js · portada-ia,
// ejemplos) y la generación con nano-banana-pro (api/_lib/imagen.js). Sin red
// ni base: Supabase, el almacén y Replicate van simulados.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { existsSync } from 'node:fs'
import { ESTILOS_IA, estiloIaPorClave, ejemploDe, referenciaDe, promptPortadaIa } from '../src/agents/portadas/estilosIa.js'

const PERFIL = 'perfil-1'
const JPG = `data:image/jpeg;base64,${Buffer.from('fotograma-de-prueba').toString('base64')}`

describe('estilos', () => {
  it('claves únicas y cada estilo con su imagen de tarjeta y su referencia en public/', () => {
    expect(new Set(ESTILOS_IA.map(e => e.clave)).size).toBe(ESTILOS_IA.length)
    for (const e of ESTILOS_IA) {
      if (e.clave !== 'libre') expect(existsSync(`public${ejemploDe(e)}`), ejemploDe(e)).toBe(true)
      const ref = referenciaDe(e)
      if (e.referencia) expect(existsSync(ref), ref).toBe(true)
      else expect(ref).toBeNull()
    }
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
const db = { agent_memory: [], helm_ig_media: [] }
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
vi.mock('../api/_lib/access.js', () => ({ requireProfileAccess: vi.fn(async () => ({ sub: 'u-1' })) }))
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
  almacen.clear(); subidas.length = 0
  imagen.generaPortadaIa.mockClear(); imagen.hayClaveImagen.mockReturnValue(true)
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
        if (creadas === 1) return { ok: false, status: 429, json: async () => ({ detail: 'throttled', retry_after: 1 }) }
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
