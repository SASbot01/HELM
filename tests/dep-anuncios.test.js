// El agente de anuncios (api/_lib/departamentos/anuncios.js): para cada anuncio
// del test calcula coste por lead y por venta COBRADA con el gasto apuntado, y al
// cerrarse el test propone un veredicto razonado (apagar / subir / probar otro
// gancho) sin herramienta. Si hay un reel orgánico que vende, propone anunciarlo.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import agente from '../api/_lib/departamentos/anuncios.js'

function hazSupabase(tablas) {
  let ids = 0
  function from(tabla) {
    const filtros = []
    let op = 'select', cuerpo = null, orden = null, tope = null
    const rows = () => (tablas[tabla] ||= [])
    const elegidas = () => {
      let out = rows().filter(r => filtros.every(f => f(r)))
      if (orden) out = [...out].sort((a, b) => (a[orden.c] < b[orden.c] ? -1 : a[orden.c] > b[orden.c] ? 1 : 0) * (orden.asc ? 1 : -1))
      if (tope != null) out = out.slice(0, tope)
      return out
    }
    function corre(uno) {
      if (op === 'insert') {
        const nuevas = (Array.isArray(cuerpo) ? cuerpo : [cuerpo]).map(r => ({ id: r.id || `id-${++ids}`, ...r }))
        rows().push(...nuevas)
        return Promise.resolve({ data: uno ? nuevas[0] : nuevas, error: null })
      }
      const picked = elegidas()
      if (op === 'update') for (const r of picked) Object.assign(r, cuerpo)
      return Promise.resolve({ data: uno ? (picked[0] || null) : picked, error: null })
    }
    const q = {
      select() { return q },
      eq(c, v) { filtros.push(r => r[c] === v); return q },
      gte(c, v) { filtros.push(r => r[c] >= v); return q },
      lt(c, v) { filtros.push(r => r[c] < v); return q },
      order(c, o = {}) { orden = { c, asc: o.ascending !== false }; return q },
      limit(n) { tope = n; return q },
      insert(r) { op = 'insert'; cuerpo = r; return q },
      update(r) { op = 'update'; cuerpo = r; return q },
      single() { return corre(true) },
      maybeSingle() { return corre(true) },
      then(res, rej) { return corre(false).then(res, rej) },
    }
    return q
  }
  return { from }
}

let tablas, log, proponer, ctx
function hazCtx() {
  log = []
  proponer = vi.fn(async () => ({ id: `prop-${Math.random()}` }))
  ctx = {
    supabase: hazSupabase(tablas), clientId: 'c1',
    perfil: { id: 'c1', slug: 'silvestre', name: 'Silvestre' }, agenciaId: 'casa',
    hoy: new Date('2026-10-28T10:00:00Z'), config: {}, autonomia: 'proponer',
    proponer, avisar: vi.fn(async () => 0), log: async (...a) => { log.push(a.join(' ')) },
  }
}

const ad = (id, nombre, utm, estado, extra = {}) => ({
  id, client_id: 'c1', nombre, utm, estado, publicado_en: '2026-10-20', created_at: '2026-10-19T00:00:00Z', ...extra,
})
const venta = (utm, date, cash) => ({ client_id: 'c1', utm_content: utm, utm_campaign: '', revenue: cash, cash_collected: cash, product: 'Curso', date, status: 'Completada' })
const lead = (utm, date = '2026-10-21T10:00:00Z') => ({ client_id: 'c1', utm_content: utm, utm_campaign: '', created_at: date, status: 'lead' })

beforeEach(() => {
  tablas = {
    helm_ads: [
      ad('adA', 'Reel testimonio', 'ad-a-1234', 'evaluado', { gasto: 100 }),
      ad('adB', 'Carrusel oferta', 'ad-b-5678', 'evaluado', { gasto: 200 }),
      ad('adC', 'Historia', 'ad-c-9', 'evaluado', {}),   // sin gasto ni presupuesto
      ad('adD', 'Nuevo', 'ad-d-0', 'en_test', { gasto: 50, publicado_en: '2026-10-27' }),
    ],
    sales: [
      venta('ad-a-1234', '2026-10-21', 200), venta('ad-a-1234', '2026-10-21', 200),  // 2 cobradas en ventana
      venta('ad-a-1234', '2026-10-27', 200),                                          // fuera de ventana: no cuenta
      venta('ORGANIC999', '2026-10-22', 250), venta('ORGANIC999', '2026-10-22', 250), // reel orgánico que vende
    ],
    crm_contacts: [
      lead('ad-a-1234'), lead('ad-a-1234'), lead('ad-a-1234'), lead('ad-a-1234'),      // 4 leads a adA
      lead('ad-b-5678'), lead('ad-b-5678'), lead('ad-b-5678'), lead('ad-b-5678'), lead('ad-b-5678'),  // 5 a adB
      lead('ad-c-9'),                                                                  // 1 a adC
    ],
    helm_ig_media: [
      { media_id: 'mo', client_id: 'c1', producto: 'REELS', permalink: 'https://instagram.com/reel/ORGANIC999/', caption: 'Mi mejor reel orgánico', visitas: 3000, publicado_en: '2026-10-15T08:00:00Z' },
    ],
    agent_memory: [],
  }
  hazCtx()
})

const porTitulo = (re) => proponer.mock.calls.map(c => c[0]).find(p => re.test(p.titulo))

describe('anuncios · corre', () => {
  it('propone subir el que convierte, con coste por lead y por venta cobrada', async () => {
    await agente.corre(ctx)
    const p = porTitulo(/Reel testimonio.*subir/)
    expect(p).toBeTruthy()
    expect(p.clave).toBe('anuncios:veredicto:adA:2026-10-20')
    expect(p.porque).toMatch(/4 leads y 2 ventas cobradas \(400 €\)/)
    expect(p.porque).toMatch(/25,00 €\/lead/)
    expect(p.porque).toMatch(/50,00 €\/venta cobrada/)
    expect(p.porque).toMatch(/ROAS 4,0×/)
  })

  it('propone probar otro gancho si trae leads pero no vende', async () => {
    await agente.corre(ctx)
    expect(porTitulo(/Carrusel oferta.*probar otro gancho/)).toBeTruthy()
  })

  it('propone apagar el que apenas trae nada, y pide apuntar el gasto que falta', async () => {
    await agente.corre(ctx)
    const p = porTitulo(/Historia.*apagar/)
    expect(p).toBeTruthy()
    expect(p.porque).toMatch(/apúntalo/)
  })

  it('no propone veredicto para un anuncio que sigue en test', async () => {
    await agente.corre(ctx)
    expect(proponer.mock.calls.some(c => String(c[0].clave).includes('adD'))).toBe(false)
  })

  it('propone convertir en anuncio el reel orgánico que más vende', async () => {
    await agente.corre(ctx)
    const p = porTitulo(/Convierte en anuncio/)
    expect(p).toBeTruthy()
    expect(p.clave).toBe('anuncios:reel-a-anuncio:mo')
    expect(p.porque).toMatch(/Mi mejor reel orgánico/)
    expect(p.porque).toMatch(/2 ventas cobradas \(500 €\)/)
  })

  it('el resumen cuenta evaluados, propuestas y los que no tienen gasto apuntado', async () => {
    const r = await agente.corre(ctx)
    expect(proponer).toHaveBeenCalledTimes(4)   // subir + probar + apagar + reel
    expect(r.propuestas).toBe(4)
    expect(r.resumen).toMatch(/3 evaluados/)
    expect(r.resumen).toMatch(/sin gasto apuntado/)
  })

  it('sin gasto real usa el presupuesto como estimación y lo dice', async () => {
    tablas.helm_ads = [ad('adA', 'Reel testimonio', 'ad-a-1234', 'evaluado', { presupuesto: 100 })]
    hazCtx()
    await agente.corre(ctx)
    const p = porTitulo(/Reel testimonio/)
    expect(p.porque).toMatch(/presupuesto, apunta el real/)
  })

  it('sin anuncios en test ni evaluados, no hace nada', async () => {
    tablas.helm_ads = [ad('adX', 'Borrador', 'ad-x', 'borrador', { publicado_en: null })]
    hazCtx()
    const r = await agente.corre(ctx)
    expect(r.propuestas).toBe(0)
    expect(r.resumen).toMatch(/Sin anuncios/)
    expect(proponer).not.toHaveBeenCalled()
  })
})
