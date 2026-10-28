// El agente de Postventa (api/_lib/departamentos/postventa.js): a los días
// configurados (por defecto 7 y 30) propone seguimiento; en el último día, a
// quien da buenas señales (pago completo o repite), pide testimonio.
// Supabase simulado. Fechas fijas en Europe/Madrid (28-oct-2026, CET).
import { describe, it, expect, beforeEach } from 'vitest'
import postventa from '../api/_lib/departamentos/postventa.js'

function mkSupabase(tablas) {
  function from(tabla) {
    const rows = () => (tablas[tabla] ||= [])
    const filtros = []
    let orden = null, tope = null
    const likeRe = (p) => new RegExp('^' + String(p).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*') + '$', 'i')
    const sel = () => {
      let out = rows().filter(r => filtros.every(f => f(r)))
      if (orden) out = [...out].sort((a, b) => (a[orden.c] < b[orden.c] ? -1 : a[orden.c] > b[orden.c] ? 1 : 0) * (orden.asc ? 1 : -1))
      if (tope != null) out = out.slice(0, tope)
      return out
    }
    const run = (uno) => { const s = sel(); return Promise.resolve({ data: uno ? (s[0] || null) : s, error: null }) }
    const q = {
      select() { return q },
      eq(c, v) { filtros.push(r => r[c] === v); return q },
      ilike(c, p) { const re = likeRe(p); filtros.push(r => re.test(String(r[c] ?? ''))); return q },
      gte(c, v) { filtros.push(r => r[c] >= v); return q },
      lte(c, v) { filtros.push(r => r[c] <= v); return q },
      order(c, o = {}) { orden = { c, asc: o.ascending !== false }; return q },
      limit(n) { tope = n; return q },
      maybeSingle() { return run(true) }, single() { return run(true) },
      then(res, rej) { return run(false).then(res, rej) },
    }
    return q
  }
  return { from }
}

function mkProponer() {
  const claves = new Set(), todas = [], creadas = []
  const fn = async (p) => {
    todas.push(p)
    if (claves.has(p.clave)) return null
    claves.add(p.clave); creadas.push(p)
    return { id: `prop-${claves.size}`, ...p }
  }
  fn.todas = todas; fn.creadas = creadas
  return fn
}

const HOY = new Date('2026-10-28T10:00:00Z')

function escenario({ config = {}, ventas } = {}) {
  const tablas = {
    sales: ventas || [
      { id: 'd7', client_id: 'c1', date: '2026-10-21', client_name: 'Nuevo Cliente', client_phone: '600000007', client_email: 'new@x.com', product: 'Programa', revenue: 100, cash_collected: 100 },
      { id: 'fp', client_id: 'c1', date: '2026-09-28', client_name: 'Feliz Pagador', client_phone: '600000030', client_email: 'fp@x.com', product: 'Mentoría', revenue: 100, cash_collected: 100 },
      { id: 'np', client_id: 'c1', date: '2026-09-28', client_name: 'Aún Debe', client_phone: '600000031', client_email: 'np@x.com', product: 'Servicio', revenue: 200, cash_collected: 50 },
      { id: 'rep', client_id: 'c1', date: '2026-09-28', client_name: 'Repite Siempre', client_phone: '600000032', client_email: 'rep@x.com', product: 'Pack', revenue: 300, cash_collected: 0 },
      { id: 'rep2', client_id: 'c1', date: '2026-10-01', client_name: 'Repite Siempre', client_phone: '600000032', client_email: 'rep@x.com', product: 'Extra', revenue: 50, cash_collected: 50 },
      { id: 'too', client_id: 'c1', date: '2026-10-25', client_name: 'Muy Reciente', client_phone: '600000003', client_email: 'too@x.com', product: 'Curso', revenue: 60, cash_collected: 60 },
    ],
  }
  const proponer = mkProponer()
  const ctx = {
    supabase: mkSupabase(tablas), clientId: 'c1',
    perfil: { id: 'c1', slug: 'silvestre', name: 'Silvestre AI' },
    agenciaId: 'casa', hoy: HOY, config, autonomia: 'proponer', proponer, avisar: async () => {}, log: () => {},
  }
  return { tablas, ctx, proponer }
}

describe('postventa · seguimiento y testimonio', () => {
  let esc
  beforeEach(() => { esc = escenario() })

  it('seguimiento a los 7 días; a los 30, testimonio si hay buenas señales y seguimiento si no', async () => {
    const r = await postventa.corre(esc.ctx)
    expect(r.propuestas).toBe(4)
    const claves = esc.proponer.creadas.map(p => p.clave).sort()
    expect(claves).toEqual([
      'postventa-testimonio:fp',      // pago completo a los 30
      'postventa-testimonio:rep',     // repite a los 30
      'postventa:d7:7',               // seguimiento a los 7
      'postventa:np:30',              // debe dinero: seguimiento, no testimonio
    ])
    const seg = esc.proponer.creadas.find(p => p.clave === 'postventa:d7:7')
    expect(seg.telefono).toBe('600000007')
    expect(seg.mensaje).toContain('¿Qué tal')
    const tes = esc.proponer.creadas.find(p => p.clave === 'postventa-testimonio:fp')
    expect(tes.mensaje).toContain('testimonio')
    // La venta de hace 3 días (ni 7 ni 30) y la segunda compra de 27 días no entran.
    expect(esc.proponer.todas.some(p => p.clave.includes('too') || p.clave.includes('rep2'))).toBe(false)
  })

  it('no duplica: a la segunda pasada no propone nada nuevo', async () => {
    await postventa.corre(esc.ctx)
    const r2 = await postventa.corre(esc.ctx)
    expect(r2.propuestas).toBe(0)
  })

  it('respeta los días del perfil (ctx.config.dias)', async () => {
    const e = escenario({ config: { dias: [3] }, ventas: [
      { id: 't3', client_id: 'c1', date: '2026-10-25', client_name: 'Tres Días', client_phone: '600000013', client_email: 't3@x.com', product: 'Curso', revenue: 200, cash_collected: 50 },
      { id: 't7', client_id: 'c1', date: '2026-10-21', client_name: 'Siete Días', client_phone: '600000017', client_email: 't7@x.com', product: 'Curso', revenue: 100, cash_collected: 100 },
    ] })
    const r = await postventa.corre(e.ctx)
    expect(r.propuestas).toBe(1)
    expect(e.proponer.creadas[0].clave).toBe('postventa:t3:3')   // solo la de hace 3 días (pago incompleto → seguimiento)
  })

  it('sin ventas en la ventana, no hace nada', async () => {
    const e = escenario({ ventas: [] })
    expect(await postventa.corre(e.ctx)).toEqual({ propuestas: 0, resumen: '' })
  })
})
