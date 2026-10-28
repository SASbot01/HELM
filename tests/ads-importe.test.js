// El test de 5 días de anuncios (api/_lib/ads.js) cuenta las ventas con su
// importe real: lo cobrado y, si aún no consta, el importe de la venta. Antes
// pedía columnas que no existen y la consulta fallaba (0 ventas siempre).
import { describe, it, expect, vi } from 'vitest'

const pedidas = []
vi.mock('../api/lib/supabase.js', () => ({
  supabase: {
    from: (tabla) => {
      const q = {
        select(cols) { pedidas.push({ tabla, cols }); return q },
        eq() { return q }, gte() { return q },
        lt() {
          return Promise.resolve(tabla === 'sales'
            ? { data: [{ created_at: '2026-10-21T10:00:00Z', revenue: 497, cash_collected: 197 }, { created_at: '2026-10-22T10:00:00Z', revenue: 300, cash_collected: null }], error: null }
            : { data: [{ created_at: '2026-10-21T09:00:00Z' }], error: null })
        },
      }
      return q
    },
  },
}))

const { conversionesDe, importeDe } = await import('../api/_lib/ads.js')

describe('ads · importe de las ventas del test', () => {
  it('pide columnas que existen y suma lo cobrado (o el importe si no hay cobro)', async () => {
    const r = await conversionesDe('c1', 'ad-x', '2026-10-20', '2026-10-25')
    expect(pedidas.find(p => p.tabla === 'sales').cols).toBe('created_at, revenue, cash_collected')
    expect(r).toMatchObject({ leads: 1, ventas: 2, ingresos: 497 })
  })
  it('importeDe no confunde el número de cuotas con el importe', () => {
    expect(importeDe({ installments_total: 6, revenue: 1987 })).toBe(1987)
    expect(importeDe({ revenue: 100, cash_collected: 0 })).toBe(100)
    expect(importeDe({})).toBe(0)
  })
})
