// @vitest-environment jsdom
// Informe → «Pagos fraccionados y mensualidades»: salen los planes vivos
// (aunque empezaran antes del periodo) y las mensualidades de 197 € con sus
// pagos y el siguiente cobro.
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'

process.env.TZ = 'America/Bogota'
vi.useFakeTimers({ toFake: ['Date'] })
vi.setSystemTime(new Date('2026-10-20T15:00:00Z'))

const VENTAS = [
  { id: 'david', client_name: 'David Villasmil', product: 'Detrás de Cámara · mensualidad', payment_type: 'Suscripción', status: 'won',
    revenue: 985, cash_collected: 985, installments_total: null, installments_paid: 5, installment_amount: 197, plan_start: '2026-05-04', date: '2026-05-04',
    notes: 'Mensualidad de 197 €: 5 cuotas cobradas (04/05, 04/06, 04/07, 04/08, 04/09). La suscripción sub_1 está impagada (último cobro el 04/09).\n[20/10] Sigue pagando la mensualidad de 197 €.' },
  { id: 'alexander', client_name: 'Alexander Salgado', product: 'Detrás de Cámara · mensualidad', payment_type: 'Suscripción', status: 'won',
    revenue: 1182, cash_collected: 1182, installments_total: null, installments_paid: 6, installment_amount: 197, plan_start: '2026-05-05', date: '2026-05-05',
    notes: 'Mensualidad de 197 €: 6 cuotas cobradas (05/05, 05/06, 05/07, 08/08, 05/09, 05/10).' },
  { id: 'michele', client_name: 'Michele Toledo Jara', product: 'Año formativo', payment_type: 'Fraccionado', status: 'won',
    revenue: 1987, cash_collected: 331.17, installments_total: 6, installments_paid: 1, installment_amount: 331.17, plan_start: '2026-10-04', plan_end: '2027-03-04', date: '2026-10-04' },
  // Un plan de septiembre con cuotas pendientes: tiene que salir aunque el periodo sea «Este mes».
  { id: 'viejo', client_name: 'Plan de septiembre', product: 'Año formativo', payment_type: 'Fraccionado', status: 'won',
    revenue: 600, cash_collected: 200, installments_total: 3, installments_paid: 1, installment_amount: 200, plan_start: '2026-09-10', plan_end: '2026-11-10', date: '2026-09-10' },
]

const consulta = (data) => {
  const q = { select: () => q, eq: () => q, order: () => q, limit: () => Promise.resolve({ data, error: null }) }
  return q
}
vi.mock('../src/helm/lib', () => ({
  supabase: {
    from: (t) => (t === 'sales' ? consulta(VENTAS)
      : t === 'crm_contacts' ? { select: () => ({ eq: () => Promise.resolve({ count: 0 }) }) }
        : consulta([])),
  },
  money: (n) => `${Math.round(Number(n) || 0)} €`,
  fmtDate: (d) => d,
  getOnboarding: vi.fn(async () => null),
  onboardingApi: { biblia: vi.fn(async () => null) },
  isSaleCancelled: (r) => String(r?.status || '').toLowerCase() === 'cancelada',
  cuotasPendientes: (v) => (Number(v?.installments_total) ? Math.max(0, v.installments_total - (v.installments_paid || 0)) : null),
}))
vi.mock('../src/helm/views/informe/Graficas', () => ({ Evolucion: () => null, PorPrograma: () => null }))

const { default: Informe } = await import('../src/helm/views/Informe.jsx')

describe('Informe · pagos fraccionados y mensualidades', () => {
  it('salen las mensualidades con sus pagos y el siguiente cobro', async () => {
    render(<Informe clientId="ddc" onNavigate={() => {}} />)
    const titulo = await screen.findByText('Pagos fraccionados y mensualidades')
    const tabla = within(titulo.closest('section, div').parentElement)
    expect(tabla.getByText('David Villasmil')).toBeTruthy()
    expect(tabla.getByText('5 pagos')).toBeTruthy()
    expect(tabla.getByText('Vencida la 6ª (04 oct)')).toBeTruthy()
    expect(tabla.getByText('6 pagos')).toBeTruthy()
    expect(tabla.getByText('La 7ª el 05 nov')).toBeTruthy()
    expect(tabla.getAllByText('Mensual').length).toBe(2)
    expect(tabla.getByText('Plan de septiembre')).toBeTruthy()
    expect(screen.getByText('394 €/mes')).toBeTruthy()
  })

  it('«Este mes» cuenta la cuota de octubre de Alexander (y no su mensualidad entera de mayo)', async () => {
    render(<Informe clientId="ddc" onNavigate={() => {}} />)
    await screen.findByText('Pagos fraccionados y mensualidades')
    expect(screen.getAllByText('Detrás de Cámara · mensualidad · 6ª').length).toBeGreaterThan(0)   // la del 05/10
    expect(screen.queryByText('2026-05-05')).toBeNull()
  })
})
