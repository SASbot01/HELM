// api/_lib/imagen.js: el cliente de Ideogram vía Replicate. Sin clave avisa y
// no inventa; con clave, la red se simula (aquí no sale ninguna petición).
import { describe, it, expect, vi, afterEach } from 'vitest'

const { hayClaveImagen, generaFondo } = await import('../api/_lib/imagen.js')

afterEach(() => { delete process.env.REPLICATE_API_TOKEN; vi.restoreAllMocks() })

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
        // Prefer: wait → vuelve ya terminal
        expect(opts.headers.Prefer).toBe('wait')
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
