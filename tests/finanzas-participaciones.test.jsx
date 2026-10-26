// @vitest-environment jsdom
// Finanzas de Silvestre AI: tu parte de lo que pagan los clientes de Detrás de
// Cámara (35 %) y de lo que vende web-seller (50 %) entra como ingresos, uno por
// cada pago y en su fecha, y suma en Ingresos y en el Balance. Son automáticos:
// sin papelera. Los movimientos guardados siguen igual.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, within, cleanup } from '@testing-library/react'

globalThis.process.env.TZ = 'Europe/Madrid'
vi.useFakeTimers({ toFake: ['Date'] })
vi.setSystemTime(new Date('2026-10-26T10:00:00Z'))

const MOVIMIENTOS = [
  { id: 'm1', date: '2026-10-02', category: 'Gasto fijo', description: 'Servidor', amount: -40, person_name: '', contact_ids: [] },
]
const PARTICIPACIONES = [
  { origen: { slug: 'detras-de-camra', name: 'detras de camra' }, porcentaje: 35, ventas: [
    { id: 'g', client_name: 'Gonzalo', product: 'Año formativo', payment_type: 'Fraccionado', status: 'won', revenue: 2000, cash_collected: 1000, installments_total: 2, installments_paid: 1, installment_amount: 1000, plan_start: '2026-10-13', date: '2026-10-13' },
  ] },
  { origen: { slug: 'web-seller', name: 'web-seller' }, porcentaje: 50, ventas: [
    { id: 'i', client_name: 'Isabel Lozano', product: 'web', payment_type: 'Pago único', status: 'won', revenue: 325, cash_collected: 250, date: '2026-10-19' },
  ] },
  { origen: { slug: 'enformaconhugo', name: 'enformaconhugo' }, importe_mensual: 200, desde: '2026-10-01' },
]

vi.mock('../src/helm/lib', () => ({
  fetchRows: vi.fn(async (tabla) => (tabla === 'ceo_finance_entries' ? MOVIMIENTOS : [])),
  fetchRowsOrError: vi.fn(async () => ({ rows: [] })),
  insertRow: vi.fn(), deleteRow: vi.fn(),
  money: (n) => `${Math.round(Number(n) || 0)} €`,
  fmtDate: (d) => d,
  todayISO: () => '2026-10-26',
  activeSales: (r) => r,
  isSaleCancelled: (r) => String(r?.status || '').toLowerCase() === 'cancelada',
  participacionesApi: { de: vi.fn(async () => ({ participaciones: PARTICIPACIONES })) },
}))
vi.mock('../src/helm/equipo/roles', () => ({ rolesDelProducto: () => [], roleLabel: (r) => r }))
vi.mock('../src/helm/producto', () => ({ productoActual: () => ({ key: 'infoproducto' }) }))

const { default: Finanzas } = await import('../src/helm/views/Finanzas.jsx')
const kpi = (label) => [...document.querySelectorAll('.helm-kpi')].find(k => k.querySelector('.lbl')?.textContent === label)

afterEach(cleanup)

describe('Finanzas · tu parte de otros perfiles', () => {
  it('cada pago entra como ingreso automático y suma en Ingresos y Balance', async () => {
    render(<Finanzas clientId="silvestre" />)
    const gonzalo = (await screen.findByText(/Gonzalo/)).closest('tr')
    expect(within(gonzalo).getByText('+350 €')).toBeTruthy()          // 35 % de 1.000 €
    expect(within(gonzalo).getByText('Participación · automático')).toBeTruthy()
    expect(gonzalo.querySelector('.helm-x')).toBeNull()             // no se borra a mano
    const isabel = screen.getByText(/Isabel Lozano/).closest('tr')
    expect(within(isabel).getByText('+125 €')).toBeTruthy()          // 50 % de 250 €
    // El movimiento guardado sigue con su papelera.
    expect(screen.getByText('Servidor').closest('tr').querySelector('.helm-x')).not.toBeNull()
    // Hugo: 200 € fijos de octubre.
    const hugo = screen.getByText('Tu parte fija · enformaconhugo · 200 € al mes').closest('tr')
    expect(within(hugo).getByText('+200 €')).toBeTruthy()
    expect(kpi('Ingresos').querySelector('.val').textContent).toBe('675 €')
    expect(kpi('Ingresos').querySelector('.sub').textContent).toBe('675 € de tu parte de otros perfiles')
    expect(kpi('Balance').querySelector('.val').textContent).toBe('635 €')
  })
})
