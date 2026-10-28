// Las comisiones de Finanzas (api/_lib/departamentos/comisiones.js): que pague
// a cada setter/closer sobre lo COBRADO (no lo vendido) del mes anterior, con su
// porcentaje (el de helm_team o el de config), una propuesta por persona con
// finanzas_apunte; que no duplique (clave por mes y persona) y que el mes sea el
// de Madrid. Base simulada a mano.
import { describe, it, expect, beforeEach } from 'vitest'
import comisiones from '../api/_lib/departamentos/comisiones.js'

function fakeDb(tablas) {
  return {
    from(tabla) {
      let rows = (tablas[tabla] || []).slice()
      const q = {
        select() { return q },
        eq(c, v) { rows = rows.filter(r => r[c] === v); return q },
        gte(c, v) { rows = rows.filter(r => String(r[c]) >= v); return q },
        lte(c, v) { rows = rows.filter(r => String(r[c]) <= v); return q },
        in(c, vs) { rows = rows.filter(r => vs.includes(r[c])); return q },
        ilike(c, v) { const re = new RegExp(`^${String(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*')}$`, 'i'); rows = rows.filter(r => re.test(String(r[c] ?? ''))); return q },
        range(a, b) { rows = rows.slice(a, b + 1); return q },
        order(c, o = {}) { rows = [...rows].sort((a, b) => (a[c] < b[c] ? -1 : a[c] > b[c] ? 1 : 0) * (o.ascending === false ? -1 : 1)); return q },
        limit(n) { rows = rows.slice(0, n); return q },
        then(res, rej) { return Promise.resolve({ data: rows, error: null }).then(res, rej) },
      }
      return q
    },
  }
}

function hazCtx(tablas, { hoy = new Date('2026-10-05T06:00:00Z'), config = {} } = {}) {
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

// Hoy = 5-oct → el mes que se liquida es septiembre.
const persona = (o) => ({ id: o.id, client_id: 'c1', name: o.name, role: o.role, commission_pct: o.pct ?? 0, active: o.active !== false })
const venta = (o) => ({
  id: o.id, client_id: 'c1', date: o.date, client_name: o.client_name || 'X', revenue: o.revenue,
  cash_collected: o.cash_collected ?? o.revenue, status: o.status || 'won', closer: o.closer || '', setter: o.setter || '',
})

let tablas
beforeEach(() => {
  tablas = {
    helm_team: [
      persona({ id: 'juan', name: 'Juan', role: 'closer', pct: 10 }),   // % propio
      persona({ id: 'eva', name: 'Eva', role: 'setter' }),               // sin % propio → del config
      persona({ id: 'ceo', name: 'Jefe', role: 'dueno', pct: 50 }),      // no cobra comisión
      persona({ id: 'baja', name: 'Antiguo', role: 'closer', pct: 10, active: false }),
    ],
    sales: [
      // Septiembre: Juan cierra 2 ventas, cobradas 1.000 y 500 (de 2.000 facturados).
      venta({ id: 's1', date: '2026-09-10', closer: 'Juan', revenue: 2000, cash_collected: 1000 }),
      venta({ id: 's2', date: '2026-09-20', closer: 'Juan', revenue: 500, cash_collected: 500 }),
      // Septiembre: Eva como setter, cobrado 800.
      venta({ id: 's3', date: '2026-09-15', setter: 'Eva', revenue: 800, cash_collected: 800 }),
      // Cancelada: no cuenta.
      venta({ id: 's4', date: '2026-09-18', closer: 'Juan', revenue: 1000, cash_collected: 1000, status: 'cancelada' }),
      // Octubre (otro mes): no cuenta para septiembre.
      venta({ id: 's5', date: '2026-10-02', closer: 'Juan', revenue: 1000, cash_collected: 1000 }),
    ],
  }
})

describe('comisiones · qué calcula', () => {
  it('una propuesta por persona, sobre lo COBRADO del mes, con su % y finanzas_apunte', async () => {
    const { ctx, llamadas } = hazCtx(tablas, { config: { porcentajes: { setter: 5 } } })
    const r = await comisiones.corre(ctx)
    expect(r.propuestas).toBe(2)
    const juan = llamadas.find(p => p.datos.persona === 'juan')
    // Base = 1.000 + 500 = 1.500 cobrados (no 2.500 facturados). 10 % = 150 €.
    expect(juan.datos.base).toBe(1500)
    expect(juan.datos.comision).toBe(150)
    expect(juan.herramienta).toBe('finanzas_apunte')
    expect(juan.input).toMatchObject({ tipo: 'comision', importe: 150, persona: 'Juan', fecha: '2026-09-30' })
    expect(juan.input.concepto).toContain('2026-09')
    expect(juan.clave).toBe('comisiones:2026-09:juan')
    // Eva: 5 % (del config) sobre 800 = 40 €.
    const eva = llamadas.find(p => p.datos.persona === 'eva')
    expect(eva.datos.comision).toBe(40)
    expect(r.resumen).toContain('190 €')
  })

  it('el dueño y los inactivos no entran; sin % definido se dice en el resumen', async () => {
    const { ctx, llamadas } = hazCtx(tablas)   // sin config.porcentajes → Eva se queda sin %
    const r = await comisiones.corre(ctx)
    expect(llamadas.map(p => p.datos.persona)).toEqual(['juan'])
    expect(r.resumen).toMatch(/Sin % definido.*Eva/)
    expect(llamadas.some(p => p.datos.persona === 'ceo' || p.datos.persona === 'baja')).toBe(false)
  })

  it('sin setters ni closers en el equipo, no propone nada', async () => {
    tablas.helm_team = [persona({ id: 'ceo', name: 'Jefe', role: 'dueno', pct: 50 })]
    const { ctx } = hazCtx(tablas)
    const r = await comisiones.corre(ctx)
    expect(r.propuestas).toBe(0)
    expect(r.resumen).toMatch(/sin setters ni closers/)
  })
})

describe('comisiones · mes de Madrid y sin duplicar', () => {
  it('liquida el mes ANTERIOR cerrado (hoy 5-oct → septiembre)', async () => {
    const { ctx, llamadas } = hazCtx(tablas, { config: { porcentajes: { setter: 5 } } })
    await comisiones.corre(ctx)
    expect(llamadas.every(p => p.datos.mes === '2026-09')).toBe(true)
  })

  it('config.mes fuerza el mes a liquidar', async () => {
    // En octubre pedimos explícitamente octubre: solo cuenta s5 (Juan, 1.000).
    const { ctx, llamadas } = hazCtx(tablas, { hoy: new Date('2026-11-02T06:00:00Z'), config: { mes: '2026-10' } })
    await comisiones.corre(ctx)
    const juan = llamadas.find(p => p.datos.persona === 'juan')
    expect(juan.datos.mes).toBe('2026-10')
    expect(juan.datos.base).toBe(1000)
    expect(juan.datos.comision).toBe(100)
  })

  it('a la segunda pasada no vuelve a proponer la comisión del mismo mes', async () => {
    const { ctx } = hazCtx(tablas, { config: { porcentajes: { setter: 5 } } })
    expect((await comisiones.corre(ctx)).propuestas).toBe(2)
    expect((await comisiones.corre(ctx)).propuestas).toBe(0)
  })

  it('el día de Madrid decide el mes: a las 23:30 UTC del 30-sep ya es 1-oct en Madrid → liquida septiembre', async () => {
    const { ctx, llamadas } = hazCtx(tablas, { hoy: new Date('2026-09-30T23:30:00Z'), config: { porcentajes: { setter: 5 } } })
    await comisiones.corre(ctx)
    // En Madrid es el 1-oct → el mes anterior es septiembre (no agosto).
    expect(llamadas.length).toBeGreaterThan(0)
    expect(llamadas.every(p => p.datos.mes === '2026-09')).toBe(true)
  })
})

describe('comisiones · las cuotas de planes de antes', () => {
  it('una cuota cobrada en el mes de un plan vendido antes lleva su comisión; la que se cobró después, no cuenta en su venta', async () => {
    tablas.sales.push(venta({ id: 'plan', date: '2026-06-10', closer: 'Juan', revenue: 1200, cash_collected: 600 }))
    // s1 (sept): 1.000 cobrados, pero 200 de ellos son una cuota cobrada en octubre.
    tablas.ceo_finance_entries = [
      { id: 'e1', client_id: 'c1', date: '2026-09-28', category: 'Ingreso', amount: 200, notes: 'telegram:plan:2026-09' },
      { id: 'e2', client_id: 'c1', date: '2026-10-02', category: 'Ingreso', amount: 200, notes: 'telegram:s1:2026-10' },
      { id: 'e3', client_id: 'c1', date: '2026-09-12', category: 'Ingreso', amount: 999, notes: 'manual' },
    ]
    const { ctx, llamadas } = hazCtx(tablas)
    await comisiones.corre(ctx)
    const juan = llamadas.find(p => p.clave === 'comisiones:2026-09:juan')
    // 1.000 − 200 (cuota de octubre) + 500 (s2) + 200 (cuota de septiembre del plan de junio) = 1.500 → 10 % = 150.
    expect(juan.datos.base).toBe(1500)
    expect(juan.input.importe).toBe(150)
    expect(juan.porque).toMatch(/1 cuota\(s\) de planes de antes/)
  })
})
