// Las noticias y el diario por perfil: que AI para todo (y todo perfil sin
// entrada propia) siga exactamente como estaba, y que los temas de cada
// perfil se validen en código. Sin red ni base: Supabase y Claude, simulados.
import crypto from 'node:crypto'
import { describe, it, expect, vi } from 'vitest'

vi.mock('../api/lib/supabase.js', () => ({ supabase: {} }))
const turno = vi.fn()
vi.mock('../api/_lib/anthropic.js', () => ({ claudeTurno: (...a) => turno(...a) }))
process.env.AGENTS_ANTHROPIC_KEY = 'clave-de-prueba'

const { BREVES_POR_DEFECTO, brevesDe, DIARIOS, diarioDe } = await import('../api/_lib/noticias-perfiles.js')
const { elige } = await import('../api/_lib/noticias.js')
const { entregarPara } = await import('../api/_lib/redaccion.js')

const huella = (x) => crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex').slice(0, 16)
const EDICIONES_DE_LA_BASE = ['manana', 'mediodia', 'tarde']   // el CHECK de aip_articulos.edicion

describe('AI para todo y los perfiles sin entrada propia, como estaban', () => {
  // Las huellas son las de las fuentes, el prompt, los temas y las ediciones
  // tal y como estaban en noticias.js y redaccion.js antes de pasar a ir por
  // perfil (13/10/2026). Si cambian, cambia lo que reciben silvestre y
  // estudio-nova: que sea a propósito.
  it('las breves de siempre', () => {
    const b = BREVES_POR_DEFECTO
    expect(huella({ f: b.fuentes, s: b.sistema, t: b.temas })).toBe('614c8cac55ebd204')
    expect(b.temaDelModelo).toBe(false)
    for (const slug of ['silvestre', 'estudio-nova', 'cualquier-otro', '__proto__', undefined]) expect(brevesDe(slug)).toBe(b)
  })

  it('el diario de AI para todo', () => {
    const d = diarioDe('silvestre')
    expect(huella({ f: d.fuentes, s: d.sistema, e: d.ediciones, t: d.temas })).toBe('8b650f23d0b254df')
    expect(d.web).toBe('https://s4sf.net/aiparatodo/news')
    // La herramienta de entrega, idéntica a la de antes.
    expect(huella(entregarPara(d.temas))).toBe('e0a744cac9047a3f')
  })
})

describe('cada perfil, con sus temas', () => {
  it('Detrás de Cámara tiene los suyos y el modelo pone el tema', () => {
    const b = brevesDe('detras-de-camra')
    expect(Object.keys(b.temas)).toEqual(['sony', 'equipo', 'filmmaking', 'postproduccion'])
    expect(b.temaDelModelo).toBe(true)
    expect(diarioDe('detras-de-camra').ediciones).toHaveLength(1)
  })

  it('cada fuente es de un tema de su perfil, y cada edición es una de la base', () => {
    for (const cfg of [BREVES_POR_DEFECTO, brevesDe('detras-de-camra'), ...DIARIOS]) {
      for (const f of cfg.fuentes) {
        expect(Object.keys(cfg.temas)).toContain(f.tema)
        expect(f.url).toMatch(/^https:\/\//)
      }
    }
    for (const d of DIARIOS) for (const e of d.ediciones) expect(EDICIONES_DE_LA_BASE).toContain(e.clave)
  })

  it('el tema que diga el modelo solo vale si es del perfil', async () => {
    const cfg = brevesDe('detras-de-camra')
    const fecha = new Date('2026-10-13T08:00:00Z')
    const entradas = [
      { titulo: 'Sony saca firmware', url: 'https://petapixel.com/a', fuente: 'PetaPixel', tema: 'equipo', fecha, texto: '' },
      { titulo: 'Resolve 21', url: 'https://cined.com/b', fuente: 'CineD', tema: 'equipo', fecha, texto: '' },
      { titulo: 'Otra', url: 'https://nofilmschool.com/c', fuente: 'No Film School', tema: 'filmmaking', fecha, texto: '' },
    ]
    turno.mockResolvedValueOnce({
      toolCalls: [{ name: 'entregar_noticias', args: { noticias: [
        { n: 1, tema: 'sony', titular: 'T1', resumen: 'R', por_que: 'P' },
        { n: 2, tema: 'ciberseguridad', titular: 'T2', resumen: 'R', por_que: 'P' },   // no es suyo
        { n: 3, titular: 'T3', resumen: 'R', por_que: 'P' },                          // sin tema
      ] } }],
      usage: { in: 1, out: 1 },
    })
    const { elegidas } = await elige({ perfil: { name: 'detras de camra' }, hoy: '2026-10-13', entradas, yaDadas: [], biblia: '', cfg })
    expect(elegidas.map(e => e.tema)).toEqual(['sony', 'equipo', 'filmmaking'])
    // El enlace sale de la fuente, no del modelo.
    expect(elegidas.map(e => e.url)).toEqual(entradas.map(e => e.url))
    const [args] = turno.mock.calls.at(-1)
    expect(args.system).toBe(cfg.sistema)
    expect(args.tools[0].input_schema.properties.noticias.items.properties.tema.enum).toEqual(Object.keys(cfg.temas))
  })

  it('en los perfiles de siempre, el tema es el de la fuente y la herramienta no cambia', async () => {
    const fecha = new Date('2026-10-13T08:00:00Z')
    const entradas = [{ titulo: 'Fallo', url: 'https://x.com/a', fuente: 'BleepingComputer', tema: 'ciberseguridad', fecha, texto: '' }]
    turno.mockResolvedValueOnce({ toolCalls: [{ name: 'entregar_noticias', args: { noticias: [{ n: 1, tema: 'ia', titular: 'T', resumen: 'R', por_que: 'P' }] } }], usage: {} })
    const { elegidas } = await elige({ perfil: { name: 'Silvestre AI' }, hoy: '2026-10-13', entradas, yaDadas: [], biblia: '' })
    expect(elegidas[0].tema).toBe('ciberseguridad')
    const [args] = turno.mock.calls.at(-1)
    expect(args.tools[0].input_schema.properties.noticias.items.properties.tema).toBeUndefined()
    expect(args.messages[0].content).toContain('(ciberseguridad · BleepingComputer ·')
  })
})

describe('qué diarios largos corren', () => {
  it('por defecto solo el de AI para todo; el resto, solo si se dice en HELM_DIARIOS', async () => {
    const { diarioActivo } = await import('../api/_lib/noticias-perfiles.js')
    const antes = process.env.HELM_DIARIOS
    delete process.env.HELM_DIARIOS
    expect(diarioActivo('silvestre')).toBe(true)
    expect(diarioActivo('detras-de-camra')).toBe(false)
    process.env.HELM_DIARIOS = 'silvestre, detras-de-camra'
    expect(diarioActivo('detras-de-camra')).toBe(true)
    process.env.HELM_DIARIOS = 'detras-de-camra'
    expect(diarioActivo('silvestre')).toBe(false)
    if (antes === undefined) delete process.env.HELM_DIARIOS
    else process.env.HELM_DIARIOS = antes
  })
})

// Breves y radar a demanda (27/10/2026): el worker ya no los lanza solos cada
// mañana salvo donde hace falta. Detrás de Cámara sigue con su pasada diaria
// porque sus breves son lo único que actualiza su web pública.
describe('qué pasadas lanza solas el worker', () => {
  // Una base mínima: helm_permissions y clients para leer, agent_jobs para
  // encolar. Lo que se encola queda en `encolados`.
  async function baseFalsa({ permisos = [], clientes = [] } = {}) {
    const { supabase } = await import('../api/lib/supabase.js')
    const encolados = [], leidas = []
    supabase.from = (tabla) => {
      leidas.push(tabla)
      const filtros = {}
      const q = {
        select: () => q,
        eq: (c, v) => { filtros[c] = v; return q },
        maybeSingle: async () => ({ data: clientes.find(c => c.slug === filtros.slug) || null, error: null }),
        upsert: async (fila) => { encolados.push(fila); return { error: null } },
        then: (ok, ko) => Promise.resolve({ data: tabla === 'helm_permissions' ? permisos : [], error: null }).then(ok, ko),
      }
      return q
    }
    return { encolados, leidas }
  }
  // Con la variable de entorno como se pida, y devuelta como estaba.
  async function con(nombre, valor, fn) {
    const antes = process.env[nombre]
    if (valor === undefined) delete process.env[nombre]
    else process.env[nombre] = valor
    try { return await fn() } finally {
      if (antes === undefined) delete process.env[nombre]
      else process.env[nombre] = antes
    }
  }
  // Las 10:00 de Madrid: ya han pasado las 5:30 de las breves y las 7:00 del radar.
  async function aLasDiez(fn) {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-27T09:00:00Z'))
    try { return await fn() } finally { vi.useRealTimers() }
  }

  it('por defecto, silvestre y estudio-nova van a demanda; Detrás de Cámara no', async () => {
    const { brevesADemanda } = await import('../api/_lib/noticias-perfiles.js')
    await con('HELM_NOTICIAS_A_DEMANDA', undefined, () => {
      expect(brevesADemanda('silvestre')).toBe(true)
      expect(brevesADemanda('estudio-nova')).toBe(true)
      expect(brevesADemanda('detras-de-camra')).toBe(false)
      expect(brevesADemanda(undefined)).toBe(false)
    })
    await con('HELM_NOTICIAS_A_DEMANDA', ' estudio-nova , detras-de-camra ', () => {
      expect(brevesADemanda('silvestre')).toBe(false)
      expect(brevesADemanda('detras-de-camra')).toBe(true)
    })
    // Vacía: todos vuelven a la pasada diaria.
    await con('HELM_NOTICIAS_A_DEMANDA', '', () => {
      for (const slug of ['silvestre', 'estudio-nova', 'detras-de-camra']) expect(brevesADemanda(slug)).toBe(false)
    })
  })

  it('las breves de cada mañana solo se encolan para los perfiles que no van a demanda', async () => {
    const { miraNoticias } = await import('../api/_lib/noticias.js')
    const { encolados } = await baseFalsa({ permisos: [
      { client_id: 'id-silvestre', sections: { noticias: true }, clients: { slug: 'silvestre' } },
      { client_id: 'id-nova', sections: { noticias: true }, clients: { slug: 'estudio-nova' } },
      { client_id: 'id-ddc', sections: { noticias: true }, clients: { slug: 'detras-de-camra' } },
      { client_id: 'id-apagado', sections: { noticias: false }, clients: { slug: 'otro' } },
    ] })
    await con('HELM_NOTICIAS_A_DEMANDA', undefined, () => aLasDiez(miraNoticias))
    expect(encolados.map(j => j.payload.clientId)).toEqual(['id-ddc'])
    expect(encolados[0]).toMatchObject({ tipo: 'noticias', clave: 'noticias:id-ddc:2026-10-27', payload: { origen: 'horario' } })
  })

  it('el radar no se lanza solo salvo con RADAR_DIARIO=1', async () => {
    const { miraRadar } = await import('../api/_lib/radar.js')
    const clientes = [{ id: 'id-silvestre', slug: 'silvestre' }]

    let base = await baseFalsa({ clientes })
    await con('RADAR_DIARIO', undefined, () => aLasDiez(miraRadar))
    expect(base.leidas).toEqual([])
    expect(base.encolados).toEqual([])

    base = await baseFalsa({ clientes })
    await con('RADAR_DIARIO', '1', () => aLasDiez(miraRadar))
    expect(base.encolados).toHaveLength(1)
    expect(base.encolados[0]).toMatchObject({ tipo: 'radar', clave: 'radar:id-silvestre:2026-10-27', payload: { clientId: 'id-silvestre', origen: 'horario' } })
  })
})
