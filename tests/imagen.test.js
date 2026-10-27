// api/_lib/imagen.js: el cliente de Ideogram vía Replicate. Sin clave avisa y
// no inventa; con clave, la red se simula (aquí no sale ninguna petición).
import { describe, it, expect, vi, afterEach } from 'vitest'

const { hayClaveImagen, generaFondo, generaPortadaIa, TOPE_IMAGEN_MS } = await import('../api/_lib/imagen.js')

afterEach(() => { delete process.env.REPLICATE_API_TOKEN; vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers() })

describe('imagen · clave', () => {
  it('sabe si hay clave de imagen', () => {
    delete process.env.REPLICATE_API_TOKEN
    expect(hayClaveImagen()).toBe(false)
    process.env.REPLICATE_API_TOKEN = 'r8_test'
    expect(hayClaveImagen()).toBe(true)
  })

  it('sin clave, avisa con 503 y no llama a la red', async () => {
    delete process.env.REPLICATE_API_TOKEN
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    await expect(generaFondo({ prompt: 'x' })).rejects.toMatchObject({ statusCode: 503 })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('con clave y un prompt vacío, 400', async () => {
    process.env.REPLICATE_API_TOKEN = 'r8_test'
    await expect(generaFondo({ prompt: '   ' })).rejects.toMatchObject({ statusCode: 400 })
  })
})

describe('imagen · generación simulada', () => {
  it('devuelve un data URL a partir de la imagen de Replicate', async () => {
    process.env.REPLICATE_API_TOKEN = 'r8_test'
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47])
    vi.stubGlobal('fetch', vi.fn(async (url, opts) => {
      if (String(url).includes('/predictions')) {
        // Prefer: wait=60 (lo más que deja Replicate) → vuelve ya terminal
        expect(opts.headers.Prefer).toBe('wait=60')
        expect(JSON.parse(opts.body).input.aspect_ratio).toBe('9:16')
        return { ok: true, json: async () => ({ id: 'p1', status: 'succeeded', output: 'https://cdn/img.png', urls: { get: 'https://api/pred/p1' } }) }
      }
      // descarga de la imagen
      return { ok: true, headers: { get: () => 'image/png' }, arrayBuffer: async () => png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) }
    }))
    const r = await generaFondo({ prompt: 'gym at dawn, vertical 9:16, no text' })
    expect(r.dataUrl.startsWith('data:image/png;base64,')).toBe(true)
    expect(r.bytes).toBe(4)
  })
})

// Cloudflare corta a los 100 s: nada de lo que genera pasa del límite.
describe('imagen · límite de tiempo', () => {
  const procesando = { id: 'p1', status: 'processing', urls: { get: 'https://api/pred/p1', cancel: 'https://api/pred/p1/cancel' } }

  it('el tope por defecto queda por debajo de los 100 s de Cloudflare', () => {
    expect(TOPE_IMAGEN_MS).toBeLessThanOrEqual(90_000)
  })

  it('si la predicción no acaba antes del límite: 504 con tope, y se cancela en Replicate', async () => {
    process.env.REPLICATE_API_TOKEN = 'r8_test'
    vi.useFakeTimers()
    const llamadas = []
    vi.stubGlobal('fetch', vi.fn(async (url, opts = {}) => {
      llamadas.push([String(url), opts.method || 'GET', opts.headers?.Prefer])
      return { ok: true, status: 201, json: async () => procesando }
    }))
    const limite = Date.now() + 20_000
    const p = generaPortadaIa({ prompt: 'x', imagenes: ['data:image/jpeg;base64,QQ=='], limite })
    const fin = expect(p).rejects.toMatchObject({ statusCode: 504, tope: true, message: expect.stringMatching(/tardando demasiado/) })
    await vi.advanceTimersByTimeAsync(25_000)
    await fin
    // Prefer: lo que cabe en el límite, no 60 s.
    expect(llamadas[0][2]).toBe('wait=15')
    expect(llamadas.some(([u, m]) => u === 'https://api/pred/p1/cancel' && m === 'POST')).toBe(true)
    // No se preguntó más allá del límite.
    expect(Date.now()).toBeGreaterThanOrEqual(limite - 2000)
  })

  it('un 429 que pide esperar más de lo que queda: el error ya, sin esperar', async () => {
    process.env.REPLICATE_API_TOKEN = 'r8_test'
    let creadas = 0
    vi.stubGlobal('fetch', vi.fn(async () => {
      creadas++
      return { ok: false, status: 429, headers: { get: (h) => (h.toLowerCase() === 'retry-after' ? '30' : null) }, json: async () => ({ detail: 'throttled' }) }
    }))
    const t0 = Date.now()
    await expect(generaPortadaIa({ prompt: 'x', imagenes: ['data:image/jpeg;base64,QQ=='], limite: Date.now() + 40_000 })).rejects.toMatchObject({ statusCode: 429 })
    expect(creadas).toBe(1)
    expect(Date.now() - t0).toBeLessThan(1000)
  })

  it('una petición a Replicate que no contesta se corta al llegar al límite', async () => {
    process.env.REPLICATE_API_TOKEN = 'r8_test'
    vi.stubGlobal('fetch', vi.fn((_url, opts) => new Promise((_ok, mal) => {
      opts.signal.addEventListener('abort', () => mal(opts.signal.reason))
    })))
    const t0 = Date.now()
    await expect(generaFondo({ prompt: 'x', limite: Date.now() + 80 })).rejects.toMatchObject({ statusCode: 504, tope: true })
    expect(Date.now() - t0).toBeLessThan(2000)
    // Con el límite ya pasado, ni se llama.
    fetch.mockClear()
    await expect(generaPortadaIa({ prompt: 'x', imagenes: ['data:image/jpeg;base64,QQ=='], limite: Date.now() - 1 })).rejects.toMatchObject({ statusCode: 504 })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('un fallo suelto al preguntar no pierde la predicción: se sigue con la misma', async () => {
    process.env.REPLICATE_API_TOKEN = 'r8_test'
    vi.useFakeTimers()
    let vueltas = 0
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      const u = String(url)
      if (u.includes('/models/')) return { ok: true, status: 201, json: async () => procesando }
      if (u === 'https://api/pred/p1') {
        vueltas++
        if (vueltas === 1) return { ok: false, status: 502, json: async () => ({ detail: 'bad gateway' }) }
        return { ok: true, json: async () => ({ ...procesando, status: 'succeeded', output: 'https://cdn/x.jpg' }) }
      }
      return { ok: true, headers: { get: () => 'image/jpeg' }, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer }
    }))
    const p = generaPortadaIa({ prompt: 'x', imagenes: ['data:image/jpeg;base64,QQ=='] })
    await vi.advanceTimersByTimeAsync(5_000)
    const r = await p
    expect(vueltas).toBe(2)
    expect(r.bytes).toBe(3)
  })
})
