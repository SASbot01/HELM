// @vitest-environment jsdom
// Informe en la hora de España: «Este mes» empieza el día 1 (no el 30 del mes
// anterior), y «Ventas» no cuenta como venta nueva la renovación de una
// mensualidad.
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

process.env.TZ = 'Europe/Madrid'
vi.useFakeTimers({ toFake: ['Date'] })
vi.setSystemTime(new Date('2026-10-20T10:00:00Z'))

const VENTAS = [
  { id: 'fin', client_name: 'Cobro del 30', product: 'P', payment_type: 'Pago único', status: 'won', revenue: 50, cash_collected: 50, date: '2026-09-30' },
  { id: 'nueva', client_name: 'Venta nueva', product: 'P', payment_type: 'Pago único', status: 'won', revenue: 100, cash_collected: 100, date: '2026-10-10' },
  { id: 'alex', client_name: 'Alexander Salgado', product: 'Mensualidad', payment_type: 'Suscripción', status: 'won', revenue: 1182, cash_collected: 1182,
    installments_total: null, installments_paid: 6, installment_amount: 197, plan_start: '2026-05-05', date: '2026-05-05',
    notes: 'Mensualidad de 197 €: 6 cuotas cobradas (05/05, 05/06, 05/07, 08/08, 05/09, 05/10).' },
]
const consulta = (data) => { const q = { select: () => q, eq: () => q, order: () => q, limit: () => Promise.resolve({ data, error: null }) }; return q }
vi.mock('../src/helm/lib', () => ({
  supabase: { from: (t) => (t === 'sales' ? consulta(VENTAS) : t === 'crm_contacts' ? { select: () => ({ eq: () => Promise.resolve({ count: 0 }) }) } : consulta([])) },
  money: (n) => `${Math.round(Number(n) || 0)} €`,
  fmtDate: (d) => d,
  getOnboarding: vi.fn(async () => null),
  onboardingApi: { biblia: vi.fn(async () => null) },
  isSaleCancelled: (r) => String(r?.status || '').toLowerCase() === 'cancelada',
  cuotasPendientes: (v) => (Number(v?.installments_total) ? Math.max(0, v.installments_total - (v.installments_paid || 0)) : null),
}))
vi.mock('../src/helm/views/informe/Graficas', () => ({ Evolucion: () => null, PorPrograma: () => null }))
const { default: Informe } = await import('../src/helm/views/Informe.jsx')

describe('Informe · Este mes en España', () => {
  it('no cuenta el 30/09, sí la cuota de octubre, y la renovación no es una venta', async () => {
    render(<Informe clientId="ddc" onNavigate={() => {}} />)
    await screen.findAllByText('Facturado')
    const kpi = (lbl) => [...document.querySelectorAll('.helm-kpi')].find(k => k.querySelector('.lbl')?.textContent === lbl)?.querySelector('.val')?.textContent
    expect(kpi('Facturado')).toBe('297 €')          // 100 de la venta nueva + 197 de la 6ª de Alexander; nada del 30/09
    expect(kpi('Ventas')).toBe('1')                 // solo la venta nueva
    expect(screen.queryByText('Cobro del 30')).toBeNull()
  })
})
