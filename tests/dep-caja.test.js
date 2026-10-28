// La previsión de caja de Finanzas (api/_lib/departamentos/caja.js): que sume
// las cuotas previstas y reste los gastos fijos mes a mes, avise de las semanas
// en descubierto (clave por semana, anclada al lunes de Madrid) y devuelva un
// resumen para el parte del director. Base simulada a mano.
import { describe, it, expect, beforeEach } from 'vitest'
import caja from '../api/_lib/departamentos/caja.js'

function fakeDb(tablas) {
  return {
    from(tabla) {
      let rows = (tablas[tabla] || []).slice()
      const q = {
        select() { return q },
        eq(c, v) { rows = rows.filter(r => r[c] === v); return q },
        is(c, v) { rows = rows.filter(r => (r[c] ?? null) === v); return q },
        not(c, op, v) { if (op === 'is' && v === null) rows = rows.filter(r => r[c] != null); return q },
        gte(c, v) { rows = rows.filter(r => String(r[c]) >= v); return q },
        lte(c, v) { rows = rows.filter(r => String(r[c]) <= v); return q },
        gt(c, v) { rows = rows.filter(r => r[c] != null && r[c] > v); return q },
        lt(c, v) { rows = rows.filter(r => r[c] != null && r[c] < v); return q },
        range(a, b) { rows = rows.slice(a, b + 1); return q },
        order(c, o = {}) { rows = [...rows].sort((a, b) => (a[c] < b[c] ? -1 : a[c] > b[c] ? 1 : 0) * (o.ascending === false ? -1 : 1)); return q },
        limit(n) { rows = rows.slice(0, n); return q },
        then(res, rej) { return Promise.resolve({ data: rows, error: null }).then(res, rej) },
      }
      return q
    },
  }
}

function hazCtx(tablas, { hoy = new Date('2026-10-28T06:00:00Z'), config = {} } = {}) {
  const vistas = new Set()
  const llamadas = []
  const ctx = {
    supabase: fakeDb(tablas), clientId: 'c1', perfil: { id: 'c1', slug: 'ag', name: 'Perfil' },
    agenciaId: 'ag1', hoy, config, autonomia: 'proponer',
    proponer: async (p) => { llamadas.push(p); if (vistas.has(p.clave)) return null; vistas.add(p.clave); return { id: `p${vistas.size}`, ...p } },
    avisar: async () => {}, log: () => {},
  }
  return { ctx, llamadas }
}

const plan = (o) => ({
  id: o.id, client_id: 'c1', status: o.status || 'won', revenue: o.revenue, cash_collected: o.cash_collected ?? 0,
  installments_total: o.total, installments_paid: o.paid ?? 0, installment_amount: o.cuota, plan_start: o.plan_start, date: o.plan_start, service_end: null,
})
const fijo = (o) => ({ id: o.id, client_id: 'c1', date: o.date, category: 'Gasto fijo', description: o.description, amount: -Math.abs(o.amount), recurring: true })

let tablas
beforeEach(() => {
  tablas = {
    sales: [
      // Un plan con cuotas pendientes de 100 € al mes (próximas: nov, dic, ene…).
      plan({ id: 'p1', total: 12, paid: 2, cuota: 100, revenue: 1200, cash_collected: 200, plan_start: '2026-08-15' }),
    ],
    ceo_finance_entries: [
      // Gasto fijo de 1.000 € el día 1 de cada mes → vacía la caja.
      fijo({ id: 'f1', date: '2026-10-01', description: 'Nómina', amount: 1000 }),
    ],
  }
})

describe('caja · previsión y descubiertos', () => {
  it('con los gastos fijos por encima de las cuotas, avisa de semanas en descubierto', async () => {
    const { ctx, llamadas } = hazCtx(tablas, { config: { saldo_inicial: 0, minimo: 0 } })
    const r = await caja.corre(ctx)
    // Un solo aviso (la primera semana en descubierto), aunque haya varias.
    expect(r.propuestas).toBe(1)
    expect(r.descubiertos).toBeGreaterThan(1)
    expect(llamadas.every(p => /^caja:deficit:\d{4}-\d{2}-\d{2}$/.test(p.clave))).toBe(true)
    expect(llamadas[0].herramienta).toBeUndefined()   // aviso informativo, sin escritura
    expect(llamadas[0].porque).toMatch(/semanas por debajo/)
    expect(r.resumen).toMatch(/Caja 90d:.*por debajo del mínimo/)
  })

  it('sin saldo inicial puesto no avisa (desde 0 todo saldría en negativo) y lo dice en el resumen', async () => {
    const { ctx, llamadas } = hazCtx(tablas)
    const r = await caja.corre(ctx)
    expect(llamadas.length).toBe(0)
    expect(r.resumen).toMatch(/sin saldo inicial/)
  })

  it('con saldo inicial de sobra, no hay descubiertos y el resumen lo dice', async () => {
    const { ctx, llamadas } = hazCtx(tablas, { config: { saldo_inicial: 10000, minimo: 0 } })
    const r = await caja.corre(ctx)
    expect(r.propuestas).toBe(0)
    expect(llamadas.length).toBe(0)
    expect(r.resumen).toMatch(/sin descubiertos/)
  })

  it('el aviso lleva lo que entra, lo que sale y el saldo previsto de esa semana', async () => {
    const { ctx, llamadas } = hazCtx(tablas, { config: { saldo_inicial: 0, minimo: 0 } })
    await caja.corre(ctx)
    const a = llamadas[0]
    expect(a.datos.tipo).toBe('deficit_caja')
    expect(a.porque).toMatch(/entran .* y salen /)
    expect(typeof a.datos.saldo).toBe('number')
    expect(a.datos.saldo).toBeLessThan(0)
  })
})

describe('caja · las semanas se anclan al lunes de Madrid y no se duplican', () => {
  it('la clave del aviso es el lunes de la semana, estable aunque corra otro día', async () => {
    // Corriendo el miércoles 28-oct, la semana 0 arranca el lunes 26-oct.
    const { ctx, llamadas } = hazCtx(tablas, { config: { saldo_inicial: 0, minimo: 0 } })
    await caja.corre(ctx)
    expect(llamadas.some(p => p.clave === 'caja:deficit:2026-10-26')).toBe(true)
  })

  it('a la segunda pasada el mismo día no repite avisos', async () => {
    const { ctx } = hazCtx(tablas, { config: { saldo_inicial: 0, minimo: 0 } })
    const primera = await caja.corre(ctx)
    const segunda = await caja.corre(ctx)
    expect(segunda.propuestas).toBe(0)
    expect(primera.propuestas).toBeGreaterThan(0)
  })

  it('respeta el mínimo de ctx.config: con un colchón alto, salta antes', async () => {
    const pocos = { sales: [], ceo_finance_entries: [fijo({ id: 'f1', date: '2026-10-01', description: 'Nómina', amount: 100 })] }
    const sinMin = await caja.corre(hazCtx(pocos, { config: { saldo_inicial: 500, minimo: 0 } }).ctx)
    expect(sinMin.propuestas).toBe(0)
    const conMin = await caja.corre(hazCtx(pocos, { config: { saldo_inicial: 500, minimo: 400 } }).ctx)
    expect(conMin.propuestas).toBeGreaterThan(0)
  })
})
