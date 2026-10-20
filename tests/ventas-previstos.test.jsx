// @vitest-environment jsdom
// Ventas pinta «Próximos cobros» con los planes y las mensualidades.
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'

const VENTAS = [
  { id: 'michele', client_name: 'Michele Toledo Jara', product: 'Año formativo', payment_type: 'Fraccionado', payment_method: 'Stripe (suscripción)',
    revenue: 1987, cash_collected: 331.17, status: 'won', installments_total: 6, installments_paid: 1, installment_amount: 331.17, plan_start: '2026-10-04', plan_end: '2027-03-04', date: '2026-10-04' },
  { id: 'gonzalo', client_name: 'Gonzalo fuselli gopar', product: 'Año formativo', payment_type: 'Fraccionado', payment_method: 'Efectivo',
    revenue: 2000, cash_collected: 1000, status: 'won', installments_total: 2, installments_paid: 1, installment_amount: 1000, plan_start: '2026-10-13', plan_end: '2026-11-26', date: '2026-10-13' },
  { id: 'nicolas', client_name: 'Nicolas Salas', product: 'Año formativo', payment_type: 'Fraccionado', payment_method: 'Stripe',
    revenue: 1872.02, cash_collected: 0, status: 'won', installments_total: 6, installments_paid: 0, installment_amount: 331.17, plan_start: '2026-10-07', plan_end: '2027-03-07', date: '2026-10-07' },
  { id: 'alexander', client_name: 'Alexander Salgado', product: 'Detrás de Cámara · mensualidad', payment_type: 'Suscripción', payment_method: 'Stripe',
    revenue: 1182, cash_collected: 1182, status: 'won', installments_total: null, installments_paid: 6, installment_amount: 197, plan_start: '2026-05-05', date: '2026-05-05',
    notes: 'Mensualidad de 197 €: 6 cuotas cobradas.' },
]

vi.mock('../src/helm/lib', () => ({
  fetchRows: vi.fn(async (t) => (t === 'sales' ? VENTAS : [])),
  fetchRowsOrError: vi.fn(async () => ({ rows: [] })),
  insertRow: vi.fn(), deleteRow: vi.fn(), cancelSale: vi.fn(), restoreSale: vi.fn(),
  money: (n) => `${Math.round(Number(n) || 0)} €`,
  fmtDate: (d) => d,
  todayISO: () => '2026-10-20',
  isSaleCancelled: (r) => String(r?.status || '').toLowerCase() === 'cancelada',
  cuotasPendientes: (v) => (Number(v?.installments_total) ? Math.max(0, v.installments_total - (v.installments_paid || 0)) : null),
}))

const { default: Ventas } = await import('../src/helm/views/Ventas.jsx')

describe('Ventas · Próximos cobros', () => {
  it('pinta los cobros por mes, con el vencido marcado', async () => {
    render(<Ventas clientId="ddc" />)
    const titulo = await screen.findByText('Próximos cobros')
    const panel = titulo.closest('.helm-panel') || titulo.parentElement.parentElement
    const t = within(panel)
    expect(t.getByText('Octubre de 2026')).toBeTruthy()
    expect(t.getByText('Noviembre de 2026')).toBeTruthy()
    expect(t.getByText('vencido')).toBeTruthy()          // la de Nicolás del 07/10
    expect(t.getByText('2026-11-26')).toBeTruthy()       // los 1.000 € de Gonzalo
    expect(t.getAllByText(/cuota \d\/\d/).length).toBe(1 + 6 + 5)
    expect(t.getByText(/mensualidad 7ª/)).toBeTruthy()   // la de Alexander del 05/11
  })

  it('en la lista de ventas, una mensualidad dice cuántos pagos lleva (no «Pago único»)', async () => {
    render(<Ventas clientId="ddc" />)
    expect(await screen.findByText(/mensual · 6 pagos/)).toBeTruthy()
  })
})
