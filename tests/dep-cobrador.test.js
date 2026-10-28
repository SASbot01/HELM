// El cobrador de Finanzas (api/_lib/departamentos/cobrador.js): que proponga la
// cuota que toca hoy, la que cae dentro de la ventana y la vencida, con su
// título, su mensaje (con el enlace de pago) y la escritura registrar_cuota;
// que no repita (la clave) y que el día sea el de Madrid. El agente solo lee por
// ctx.supabase y propone por ctx.proponer, así que la base va simulada a mano y
// no hace falta mockear nada (solo importa renovaciones.js, que es cálculo puro).
import { describe, it, expect, beforeEach } from 'vitest'
import cobrador from '../api/_lib/departamentos/cobrador.js'

// ── Supabase en memoria: lo justo de PostgREST que usa el agente ────────────
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
        gt(c, v) { rows = rows.filter(r => r[c] > v); return q },
        lt(c, v) { rows = rows.filter(r => r[c] < v); return q },
        order(c, o = {}) { rows = [...rows].sort((a, b) => (a[c] < b[c] ? -1 : a[c] > b[c] ? 1 : 0) * (o.ascending === false ? -1 : 1)); return q },
        limit(n) { rows = rows.slice(0, n); return q },
        maybeSingle() { return Promise.resolve({ data: rows[0] ?? null, error: null }) },
        single() { return Promise.resolve({ data: rows[0] ?? null, error: null }) },
        then(res, rej) { return Promise.resolve({ data: rows, error: null }).then(res, rej) },
      }
      return q
    },
  }
}

// Un ctx como el de api/_lib/departamentos/index.js, con proponer que deduplica
// por clave (como la bandeja de verdad: la misma clave no se crea dos veces).
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

// Un plan fraccionado: la próxima cuota es masMeses(plan_start, installments_paid).
const plan = (o) => ({
  id: o.id, client_id: 'c1', status: o.status || 'won', client_name: o.client_name, client_phone: o.client_phone || '',
  product: o.product || 'Mentoría', revenue: o.revenue, cash_collected: o.cash_collected ?? 0,
  installments_total: o.total, installments_paid: o.paid ?? 0, installment_amount: o.cuota, plan_start: o.plan_start, date: o.plan_start,
  service_end: null,
})
const unico = (o) => ({
  id: o.id, client_id: 'c1', status: o.status || 'won', client_name: o.client_name, client_phone: o.client_phone || '',
  product: o.product || 'Programa', revenue: o.revenue, cash_collected: o.cash_collected ?? o.revenue,
  installments_total: null, installments_paid: 0, installment_amount: null, plan_start: null, date: o.date || '2026-05-01', service_end: o.service_end,
})

let tablas
beforeEach(() => {
  tablas = {
    sales: [
      // Cuota que vence HOY (paid 2 → próxima la 3/6, masMeses(ago-28, 2) = oct-28).
      plan({ id: 'ana', client_name: 'Ana López', client_phone: '600111222', total: 6, paid: 2, cuota: 331.17, revenue: 1987.02, cash_collected: 662.34, plan_start: '2026-08-28' }),
      // Cuota vencida (paid 1 → próxima 2, masMeses(jul-15,1)=ago-15).
      plan({ id: 'luis', client_name: 'Luis Soler', client_phone: '600333444', total: 4, paid: 1, cuota: 250, revenue: 1000, cash_collected: 250, plan_start: '2026-07-15' }),
      // Cuota dentro de la ventana de 3 días (paid 0 → próxima el 30-oct).
      plan({ id: 'eva', client_name: 'Eva Ruiz', total: 3, paid: 0, cuota: 100, revenue: 300, cash_collected: 0, plan_start: '2026-10-30' }),
      // Cuota demasiado lejos (próxima el 28-nov): fuera.
      plan({ id: 'lejos', client_name: 'Futuro', total: 3, paid: 0, cuota: 100, revenue: 300, cash_collected: 0, plan_start: '2026-11-28' }),
      // Plan ya cobrado entero: fuera.
      plan({ id: 'pagado', client_name: 'Saldado', total: 2, paid: 2, cuota: 100, revenue: 200, cash_collected: 200, plan_start: '2026-06-01' }),
      // Cancelado: fuera.
      { ...plan({ id: 'cancel', client_name: 'Baja', total: 3, paid: 0, cuota: 100, revenue: 300, plan_start: '2026-10-28' }), status: 'cancelada' },
      // Renovación de pago único dentro de la ventana.
      unico({ id: 'renov', client_name: 'Marta Gil', client_phone: '600555666', product: 'Anual', revenue: 500, service_end: '2026-10-29' }),
      // Renovación vieja (> 60 días): fuera.
      unico({ id: 'renovvieja', client_name: 'Antiguo', revenue: 500, service_end: '2026-01-01' }),
    ],
    helm_links: [
      { client_id: 'c1', title: 'Pagar cuota', url: 'https://pay.me/ana', category: 'Ventas' },
      { client_id: 'c1', title: 'Instagram', url: 'https://instagram.com/x', category: 'General' },
    ],
  }
})

describe('cobrador · qué detecta', () => {
  it('propone las cuotas de hoy, de la ventana y las vencidas, y la renovación; deja fuera lo demás', async () => {
    const { ctx, llamadas } = hazCtx(tablas)
    const r = await cobrador.corre(ctx)
    const claves = llamadas.map(p => p.clave).sort()
    expect(claves).toEqual([
      'cobrador:ana:3', 'cobrador:eva:1', 'cobrador:luis:2', 'cobrador:renov:renov:2026-10-29',
    ])
    expect(r.propuestas).toBe(4)
    expect(r.resumen).toMatch(/3 cuotas, 1 renovación/)
    expect(r.resumen).toMatch(/1 vencida/)
  })

  it('la cuota de hoy lleva título, importe, mensaje con enlace de pago y la escritura registrar_cuota', async () => {
    const { ctx, llamadas } = hazCtx(tablas)
    await cobrador.corre(ctx)
    const ana = llamadas.find(p => p.clave === 'cobrador:ana:3')
    expect(ana.titulo).toBe('Cuota 3/6 de Ana López — 331,17 € — vence hoy')
    expect(ana.herramienta).toBe('registrar_cuota')
    expect(ana.input).toEqual({ venta: 'ana', cuota: 3 })
    expect(ana.telefono).toBe('600111222')
    expect(ana.mensaje).toContain('331,17 €')
    expect(ana.mensaje).toContain('https://pay.me/ana')   // el enlace de pago guardado en Enlaces
    expect(ana.mensaje.startsWith('Hola Ana,')).toBe(true)
  })

  it('la renovación no lleva escritura (no se «marca cobrada»): se avisa y la gestiona el dueño', async () => {
    const { ctx, llamadas } = hazCtx(tablas)
    await cobrador.corre(ctx)
    const renov = llamadas.find(p => p.clave === 'cobrador:renov:renov:2026-10-29')
    expect(renov.herramienta).toBeUndefined()
    expect(renov.titulo).toContain('Renovación de Anual de Marta Gil')
    expect(renov.mensaje).toContain('Marta')
  })

  it('la vencida se marca como tal en el título y en los datos', async () => {
    const { ctx, llamadas } = hazCtx(tablas)
    await cobrador.corre(ctx)
    const luis = llamadas.find(p => p.clave === 'cobrador:luis:2')
    expect(luis.titulo).toMatch(/vencida \(hace \d+ días\)/)
    expect(luis.datos.vencida).toBe(true)
  })
})

describe('cobrador · no duplica (clave estable)', () => {
  it('a la segunda pasada no vuelve a proponer lo mismo', async () => {
    const { ctx } = hazCtx(tablas)
    const primera = await cobrador.corre(ctx)
    expect(primera.propuestas).toBe(4)
    const segunda = await cobrador.corre(ctx)   // mismas claves → la bandeja las rechaza
    expect(segunda.propuestas).toBe(0)
  })

  it('cuando se cobra una cuota (sube installments_paid), la siguiente tiene otra clave', async () => {
    const { ctx, llamadas } = hazCtx(tablas)
    await cobrador.corre(ctx)
    // Ana paga la 3: ahora la próxima es la 4/6, clave cobrador:ana:4.
    const ana = tablas.sales.find(s => s.id === 'ana')
    ana.installments_paid = 3; ana.cash_collected = 993.51; ana.plan_start = '2026-07-28'  // próxima 4 → masMeses(jul-28,3)=oct-28
    await cobrador.corre(ctx)
    expect(llamadas.some(p => p.clave === 'cobrador:ana:4')).toBe(true)
  })
})

describe('cobrador · el día es el de Madrid', () => {
  it('a las 23:30 UTC ya es el día siguiente en Madrid: una cuota de ese día «vence hoy»', async () => {
    tablas.sales = [plan({ id: 'noche', client_name: 'Noa', total: 3, paid: 0, cuota: 90, revenue: 270, cash_collected: 0, plan_start: '2026-10-29' })]
    tablas.helm_links = []
    const { ctx, llamadas } = hazCtx(tablas, { hoy: new Date('2026-10-28T23:30:00Z') })   // en Madrid, 00:30 del 29
    await cobrador.corre(ctx)
    const noa = llamadas.find(p => p.clave === 'cobrador:noche:1')
    expect(noa).toBeTruthy()
    expect(noa.titulo).toContain('vence hoy')
  })
})
