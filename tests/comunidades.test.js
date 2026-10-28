// Las comunidades públicas: que cada una lea SOLO su perfil, que salga de la
// lista cerrada del servidor, y que lo que dice el navegador (?c=, ?perfil=)
// no pueda llevar a otro. Sin red ni base: Supabase va simulado.
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Lo que se le pide a la base en cada prueba.
const llamadas = []
function consulta(tabla) {
  const q = {
    tabla, filtros: [],
    select() { return q },
    eq(c, v) { q.filtros.push([c, v]); return q },
    gte() { return q },
    order() { return q },
    limit() { return q },
    maybeSingle() { return Promise.resolve({ data: tabla === 'clients' ? { id: `id-de-${q.filtros[0]?.[1]}` } : null, error: null }) },
    then(ok) { return Promise.resolve({ data: [], error: null }).then(ok) },
  }
  llamadas.push(q)
  return q
}
vi.mock('../api/lib/supabase.js', () => ({ supabase: { from: (t) => consulta(t) } }))

const { COMUNIDADES, comunidadPorClave } = await import('../api/_lib/comunidades.js')
const { default: apiComunidad } = await import('../api/comunidad.js')
const { default: apiAiparatodo } = await import('../api/aiparatodo.js')

function respuesta() {
  return {
    statusCode: 0, body: null, cabeceras: {},
    status(c) { this.statusCode = c; return this },
    json(b) { this.body = b; return this },
    end() { return this },
    setHeader(k, v) { this.cabeceras[k] = v },
  }
}
const pide = async (api, query) => {
  const res = respuesta()
  await api({ method: 'GET', query, headers: {}, socket: {} }, res)
  return res
}
const perfilesPedidos = () => llamadas.filter(q => q.tabla === 'clients').map(q => q.filtros.find(([c]) => c === 'slug')?.[1])

beforeEach(() => { llamadas.length = 0 })

describe('la lista cerrada de comunidades', () => {
  it('cada comunidad tiene su perfil fijo', () => {
    expect(comunidadPorClave('aiparatodo')?.perfil).toBe('silvestre')
    // La errata del slug es la real del perfil de Detrás de Cámara.
    expect(comunidadPorClave('filmmakingparatodo')?.perfil).toBe('detras-de-camra')
  })

  it('no reconoce nada que no esté en la lista, tampoco lo heredado', () => {
    for (const k of ['', 'silvestre', 'detras-de-camra', '__proto__', 'constructor', 'toString', 'hasOwnProperty', undefined, null, 42]) {
      expect(comunidadPorClave(k)).toBeNull()
    }
  })

  it('cada comunidad acepta sus tramos de ingresos (o no los pide) y nada más', () => {
    for (const c of Object.values(COMUNIDADES)) {
      if (c.ingresos !== null) expect(Object.keys(c.ingresos).length).toBeGreaterThan(1)
      expect(Array.isArray(c.notas)).toBe(true)
    }
  })
})

describe('/api/comunidad y /api/aiparatodo', () => {
  it('una comunidad desconocida da 404 sin tocar la base', async () => {
    const r = await pide(apiComunidad, { c: 'otra', action: 'noticias' })
    expect(r.statusCode).toBe(404)
    expect(llamadas).toHaveLength(0)
  })

  it('el perfil sale de la lista, aunque la URL traiga otro', async () => {
    const r = await pide(apiComunidad, { c: 'filmmakingparatodo', action: 'noticias', perfil: 'silvestre', slug: 'silvestre', clientId: 'x' })
    expect(r.statusCode).toBe(200)
    expect(perfilesPedidos()).toEqual(['detras-de-camra'])
    const noticias = llamadas.find(q => q.tabla === 'helm_noticias')
    expect(noticias.filtros).toContainEqual(['client_id', 'id-de-detras-de-camra'])
  })

  it('/api/aiparatodo sigue leyendo silvestre', async () => {
    const r = await pide(apiAiparatodo, { action: 'articulos', c: 'filmmakingparatodo' })
    expect(r.statusCode).toBe(200)
    expect(perfilesPedidos()).toEqual(['silvestre'])
    expect(r.body).toEqual({ hoy: expect.any(String), articulos: [] })
    expect(r.cabeceras['Cache-Control']).toBe('public, max-age=120')
  })

  it('las acciones son las de siempre', async () => {
    expect((await pide(apiAiparatodo, { action: 'borrar' })).statusCode).toBe(400)
    expect((await pide(apiComunidad, { c: 'aiparatodo', action: 'articulo', slug: '../x' })).statusCode).toBe(404)
    const r = respuesta()
    await apiComunidad({ method: 'POST', query: { c: 'aiparatodo' }, headers: {}, socket: {} }, r)
    expect(r.statusCode).toBe(405)
  })
})

describe('la puerta del navegador y la del servidor piden lo mismo', () => {
  it('ingresos y profesiones de cada comunidad, iguales en los dos lados', async () => {
    const configs = {
      aiparatodo: (await import('../src/pages/aiparatodo/config.jsx')).default,
      filmmakingparatodo: (await import('../src/pages/filmmakingparatodo/config.jsx')).default,
    }
    expect(Object.keys(configs).sort()).toEqual(Object.keys(COMUNIDADES).sort())
    for (const [clave, cfg] of Object.entries(configs)) {
      expect(cfg.clave).toBe(clave)
      const servidor = COMUNIDADES[clave]
      // Una comunidad solo de pago no pide datos (hoy ninguna).
      if (!cfg.puerta.datos) continue
      expect(cfg.puerta.datos.ingresos).toEqual(servidor.ingresos)
      expect(cfg.puerta.datos.profesiones ?? null).toEqual(servidor.profesiones)
    }
  })
})
