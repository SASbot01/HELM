// @vitest-environment jsdom
// fmtDate (src/helm/lib.js): una fecha AAAA-MM-DD sale el mismo día en
// cualquier zona horaria (en Bogotá salía el día anterior).
import { describe, it, expect, vi } from 'vitest'

process.env.TZ = 'America/Bogota'
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: () => ({}), auth: {}, storage: {} }) }))
const { fmtDate } = await import('../src/helm/lib.js')

describe('fmtDate', () => {
  it('no se va un día atrás en zonas con desfase negativo', () => {
    expect(fmtDate('2026-11-26')).toBe('26 nov')
    expect(fmtDate('2026-10-04')).toBe('04 oct')
    expect(fmtDate(null)).toBe('—')
  })
})
