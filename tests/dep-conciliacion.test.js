// La conciliación de Finanzas (api/_lib/departamentos/conciliacion.js): que cace
// ventas duplicadas, apuntes repetidos, ventas de pago único sin cobro y pagos
// (Ingresos) atados a un contacto sin venta; que no repita (la clave) y que el
// corte de «lo reciente» use el día de Madrid. Base simulada a mano.
import { describe, it, expect, beforeEach } from 'vitest'
import conciliacion from '../api/_lib/departamentos/conciliacion.js'

function fakeDb(tablas) {
  return {
    from(tabla) {
      let rows = (tablas[tabla] || []).slice()
      const q = {
        select() { return q },
        eq(c, v) { rows = rows.filter(r => r[c] === v); return q },
        neq(c, v) { rows = rows.filter(r => r[c] !== v); return q },
        in(c, vs) { rows = rows.filter(r => vs.includes(r[c])); return q },
        is(c, v) { rows = rows.filter(r => (r[c] ?? null) === v); return q },
        not(c, op, v) { if (op === 'is' && v === null) rows = rows.filter(r => r[c] != null); return q },
        gte(c, v) { rows = rows.filter(r => String(r[c]) >= v); return q },
        lte(c, v) { rows = rows.filter(r => String(r[c]) <= v); return q },
        order(c, o = {}) { rows = [...rows].sort((a, b) => (a[c] < b[c] ? -1 : a[c] > b[c] ? 1 : 0) * (o.ascending === false ? -1 : 1)); return q },
        limit(n) { rows = rows.slice(0, n); return q },
        maybeSingle() { return Promise.resolve({ data: rows[0] ?? null, error: null }) },
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

const venta = (o) => ({
  id: o.id, client_id: 'c1', date: o.date, client_name: o.client_name, client_email: o.client_email || '',
  product: o.product || 'Curso', revenue: o.revenue, cash_collected: o.cash_collected ?? o.revenue,
  status: o.status || 'won', installments_total: o.total ?? null, contact_id: o.contact_id || null,
})
const apunte = (o) => ({
  id: o.id, client_id: 'c1', date: o.date, category: o.category, description: o.description || '',
  amount: o.amount, notes: o.notes || '', person_name: o.person_name || '', contact_ids: o.contact_ids || [],
})

let tablas
beforeEach(() => {
  tablas = {
    sales: [
      // Dos ventas iguales del mismo cliente a un día: duplicada.
      venta({ id: 'v1', date: '2026-10-20', client_name: 'Ana López', client_email: 'ana@x.com', revenue: 500 }),
      venta({ id: 'v2', date: '2026-10-21', client_name: 'Ana López', client_email: 'ana@x.com', revenue: 500 }),
      // Venta de pago único sin cobro.
      venta({ id: 'v3', date: '2026-10-15', client_name: 'Pedro', revenue: 800, cash_collected: 0 }),
      // Venta normal, con contacto (para el caso 4).
      venta({ id: 'v4', date: '2026-10-10', client_name: 'Clara', revenue: 300, contact_id: 'cClara' }),
    ],
    ceo_finance_entries: [
      // Dos apuntes iguales el mismo día: repetido.
      apunte({ id: 'a1', date: '2026-10-18', category: 'Ingreso', amount: 200, description: 'Taller' }),
      apunte({ id: 'a2', date: '2026-10-18', category: 'Ingreso', amount: 200, description: 'Taller' }),
      // Un Ingreso atado a un contacto que NO tiene ninguna venta: pago sin venta.
      apunte({ id: 'a3', date: '2026-10-22', category: 'Ingreso', amount: 450, description: 'Transferencia', contact_ids: ['cSinVenta'] }),
      // Un Ingreso del contacto Clara, que SÍ tiene venta: no se avisa.
      apunte({ id: 'a4', date: '2026-10-11', category: 'Ingreso', amount: 300, description: 'Curso Clara', contact_ids: ['cClara'] }),
    ],
  }
})

describe('conciliación · qué detecta', () => {
  it('caza la venta duplicada, el apunte repetido, la venta sin cobro y el ingreso sin venta', async () => {
    const { ctx, llamadas } = hazCtx(tablas)
    const r = await conciliacion.corre(ctx)
    const tipos = llamadas.map(p => p.datos.tipo).sort()
    expect(tipos).toEqual(['apunte_duplicado', 'pago_sin_venta', 'venta_duplicada', 'venta_sin_cobro'])
    expect(r.propuestas).toBe(4)
    expect(r.resumen).toMatch(/1 venta\(s\) duplicada/)
  })

  it('la venta duplicada no lleva escritura (solo revisar) y nombra las dos ventas', async () => {
    const { ctx, llamadas } = hazCtx(tablas)
    await conciliacion.corre(ctx)
    const dup = llamadas.find(p => p.datos.tipo === 'venta_duplicada')
    expect(dup.herramienta).toBeUndefined()
    expect(dup.datos.ventas.sort()).toEqual(['v1', 'v2'])
    expect(dup.clave).toBe('conciliacion:venta-dup:v1_v2')
    expect(dup.porque).toContain('500 €')
  })

  it('el ingreso sin venta propone una nota en la ficha del contacto (crm_nota)', async () => {
    const { ctx, llamadas } = hazCtx(tablas)
    await conciliacion.corre(ctx)
    const pago = llamadas.find(p => p.datos.tipo === 'pago_sin_venta')
    expect(pago.herramienta).toBe('crm_nota')
    expect(pago.input.contacto).toBe('cSinVenta')
    expect(pago.input.texto).toContain('450 €')
    expect(pago.clave).toBe('conciliacion:pago-sin-venta:a3')
  })

  it('cuando todo cuadra, no propone nada y lo dice', async () => {
    tablas.sales = [venta({ id: 'solo', date: '2026-10-10', client_name: 'Uno', revenue: 100 })]
    tablas.ceo_finance_entries = []
    const { ctx } = hazCtx(tablas)
    const r = await conciliacion.corre(ctx)
    expect(r.propuestas).toBe(0)
    expect(r.resumen).toMatch(/cuadran/)
  })
})

describe('conciliación · no duplica y mira solo lo reciente (día de Madrid)', () => {
  it('a la segunda pasada no vuelve a proponer lo mismo', async () => {
    const { ctx } = hazCtx(tablas)
    expect((await conciliacion.corre(ctx)).propuestas).toBe(4)
    expect((await conciliacion.corre(ctx)).propuestas).toBe(0)
  })

  it('lo anterior a la ventana (dias_atras) no se mira: con 5 días, la de hace semanas queda fuera', async () => {
    const { ctx, llamadas } = hazCtx(tablas, { config: { dias_atras: 5 } })   // desde 2026-10-23
    await conciliacion.corre(ctx)
    // Todas las ventas y apuntes del fixture son anteriores al 23-oct → nada.
    expect(llamadas.length).toBe(0)
  })
})
