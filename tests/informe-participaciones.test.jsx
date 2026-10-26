// @vitest-environment jsdom
// Informe de Silvestre AI con participaciones: el 35 % de lo que pagan los
// clientes de Detrás de Cámara y el 50 % de lo que vende web-seller suman en
// lo cobrado, cada cobro en su mes y cliente a cliente, pero no son ventas
// propias. Las ventas de la parte las arma parteDe (api/participaciones.js).
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, within, cleanup } from '@testing-library/react'

globalThis.process.env.TZ = 'Europe/Madrid'
vi.useFakeTimers({ toFake: ['Date'] })
vi.setSystemTime(new Date('2026-10-20T15:00:00Z'))

vi.mock('../api/lib/supabase.js', () => ({ supabase: {} }))
vi.mock('../api/_lib/auth.js', () => ({ applyCors: () => {} }))
vi.mock('../api/_lib/access.js', () => ({ requireProfileAccess: async () => ({}), agenciaDe: async () => 'ag' }))
const { parteDe } = await import('../api/participaciones.js')

const PROPIAS = [
  { id: 'propia', client_name: 'Cliente de Silvestre', product: 'Consultoría', payment_type: 'Pago único', status: 'won', revenue: 500, cash_collected: 500, date: '2026-10-10' },
]
const DDC = { slug: 'detras-de-camra', name: 'detras de camra' }
const WEB = { slug: 'web-seller', name: 'web-seller' }
const PARTES = [
  ...[
    { id: 'alexander', client_name: 'Alexander Salgado', product: 'Detrás de Cámara · mensualidad', payment_type: 'Suscripción', status: 'won',
      revenue: 1182, cash_collected: 1182, installments_total: null, installments_paid: 6, installment_amount: 197, plan_start: '2026-05-05', date: '2026-05-05',
      notes: 'Mensualidad de 197 €: 6 cuotas cobradas (05/05, 05/06, 05/07, 08/08, 05/09, 05/10).' },
    { id: 'michele', client_name: 'Michele Toledo Jara', product: 'Año formativo', payment_type: 'Fraccionado', status: 'won',
      revenue: 1987, cash_collected: 331.17, installments_total: 6, installments_paid: 1, installment_amount: 331.17, plan_start: '2026-10-04', plan_end: '2027-03-04', date: '2026-10-04' },
    { id: 'cancelada', client_name: 'Anulada', product: 'Año formativo', payment_type: 'Suscripción', status: 'cancelada', revenue: 331.17, cash_collected: 331.17, date: '2026-10-04' },
  ].map(v => parteDe(v, 35, DDC)),
  parteDe({ id: 'isabel', client_name: 'Isabel Lozano', product: 'web y ficha de Google', payment_type: 'Pago único', status: 'won', revenue: 325, cash_collected: 250, date: '2026-10-19' }, 50, WEB),
]

const consulta = (data) => {
  const q = { select: () => q, eq: () => q, order: () => q, limit: () => Promise.resolve({ data, error: null }) }
  return q
}
vi.mock('../src/helm/lib', () => ({
  supabase: {
    from: (t) => (t === 'sales' ? consulta(PROPIAS)
      : t === 'crm_contacts' ? { select: () => ({ eq: () => Promise.resolve({ count: 0 }) }) }
        : consulta([])),
  },
  money: (n) => `${Math.round(Number(n) || 0)} €`,
  fmtDate: (d) => d,
  getOnboarding: vi.fn(async () => null),
  onboardingApi: { biblia: vi.fn(async () => null) },
  participacionesApi: { de: vi.fn(async () => ({ participaciones: [{ origen: DDC, porcentaje: 35, ventas: PARTES.slice(0, 3) }, { origen: WEB, porcentaje: 50, ventas: PARTES.slice(3) }] })) },
  isSaleCancelled: (r) => String(r?.status || '').toLowerCase() === 'cancelada',
  cuotasPendientes: (v) => (Number(v?.installments_total) ? Math.max(0, v.installments_total - (v.installments_paid || 0)) : null),
}))
vi.mock('../src/helm/views/informe/Graficas', () => ({ Evolucion: () => null, PorPrograma: () => null }))

const { default: Informe } = await import('../src/helm/views/Informe.jsx')

// El valor de un KPI (la tarjeta .helm-kpi con esa etiqueta).
const kpi = (label) => [...document.querySelectorAll('.helm-kpi')].find(k => k.querySelector('.lbl')?.textContent === label)?.querySelector('.val')?.textContent

afterEach(cleanup)

describe('parteDe', () => {
  it('multiplica los importes por el porcentaje y marca de dónde sale', () => {
    const p = parteDe({ id: 'x', revenue: 1987, cash_collected: 331.17, installment_amount: 331.17, product: 'Año formativo' }, 35, DDC)
    expect(p).toMatchObject({ id: 'part:detras-de-camra:x', revenue: 695.45, cash_collected: 115.91, installment_amount: 115.91,
      product: 'detras de camra · 35 %', producto_origen: 'Año formativo', participacion: { origen: 'detras-de-camra', porcentaje: 35 } })
  })
})

describe('Informe · tu parte de otros perfiles', () => {
  it('«Este mes»: suma tu parte de cada cobro de octubre, cliente a cliente, y no la cuenta como venta', async () => {
    render(<Informe clientId="silvestre" onNavigate={() => {}} />)
    const panel = (await screen.findByText('Tu parte de otros perfiles · este mes')).closest('section, div').parentElement
    const t = within(panel)
    // Alexander: el 35 % de su cuota del 05/10 (no de toda la mensualidad de mayo).
    expect(within(t.getByText('Alexander Salgado').closest('tr')).getByText('69 €')).toBeTruthy()
    // Michele: el 35 % de su primera cuota; la venta cancelada no entra.
    expect(within(t.getByText('Michele Toledo Jara').closest('tr')).getByText('116 €')).toBeTruthy()
    expect(t.queryByText('Anulada')).toBeNull()
    // Isabel: el 50 % de lo cobrado (250 €).
    expect(within(t.getByText('Isabel Lozano').closest('tr')).getByText('125 €')).toBeTruthy()
    // Cobrado = 500 propios + 68,95 + 115,91 + 125.
    expect(kpi('Cobrado')).toBe('810 €')
    expect(kpi('Tu parte de otros perfiles')).toBe('310 €')
    // Ventas: solo la propia.
    expect(kpi('Ventas')).toBe('1')
  })

  it('las mensualidades de otro perfil suman tu parte al mes', async () => {
    render(<Informe clientId="silvestre" onNavigate={() => {}} />)
    await screen.findByText('Tu parte de otros perfiles · este mes')
    // 35 % de los 197 € de Alexander.
    expect(kpi('Mensualidades')).toBe('69 €/mes')
  })
})
