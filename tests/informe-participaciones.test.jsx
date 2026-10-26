// @vitest-environment jsdom
// Informe de Silvestre AI con participaciones: el 35 % de lo que pagan los
// clientes de Detrás de Cámara y el 50 % de lo que vende web-seller suman en
// lo cobrado, cada cobro en su mes y cliente a cliente, pero no son ventas
// propias. La API devuelve las ventas del origen tal cual y el panel les aplica
// el porcentaje después de repartirlas en cobros (src/helm/participaciones.js).
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, within, cleanup } from '@testing-library/react'

globalThis.process.env.TZ = 'Europe/Madrid'
vi.useFakeTimers({ toFake: ['Date'] })
vi.setSystemTime(new Date('2026-10-20T15:00:00Z'))

const { parteDe, partesDe, movimientosDe } = await import('../src/helm/participaciones.js')

const PROPIAS = [
  { id: 'propia', client_name: 'Cliente de Silvestre', product: 'Consultoría', payment_type: 'Pago único', status: 'won', revenue: 500, cash_collected: 500, date: '2026-10-10' },
]
const DDC = { slug: 'detras-de-camra', name: 'detras de camra' }
const WEB = { slug: 'web-seller', name: 'web-seller' }
const DE_DDC = [
  { id: 'alexander', client_name: 'Alexander Salgado', product: 'Detrás de Cámara · mensualidad', payment_type: 'Suscripción', status: 'won',
    revenue: 1182, cash_collected: 1182, installments_total: null, installments_paid: 6, installment_amount: 197, plan_start: '2026-05-05', date: '2026-05-05',
    notes: 'Mensualidad de 197 €: 6 cuotas cobradas (05/05, 05/06, 05/07, 08/08, 05/09, 05/10).' },
  { id: 'michele', client_name: 'Michele Toledo Jara', product: 'Año formativo', payment_type: 'Fraccionado', status: 'won',
    revenue: 1987, cash_collected: 331.17, installments_total: 6, installments_paid: 1, installment_amount: 331.17, plan_start: '2026-10-04', plan_end: '2027-03-04', date: '2026-10-04' },
  // El mismo cliente con otras mayúsculas: una sola fila.
  { id: 'nico-reserva', client_name: 'Nicolas salas', product: 'Reserva', payment_type: 'Pago único', status: 'Completada', revenue: 115, cash_collected: 115, date: '2026-10-06' },
  { id: 'nico-plan', client_name: 'Nicolas Salas', product: 'Año formativo', payment_type: 'Fraccionado', status: 'won', revenue: 1872.02, cash_collected: 0, installments_total: 6, installments_paid: 0, installment_amount: 331.17, plan_start: '2026-10-07', date: '2026-10-07' },
  { id: 'cancelada', client_name: 'Anulada', product: 'Año formativo', payment_type: 'Suscripción', status: 'cancelada', revenue: 331.17, cash_collected: 331.17, date: '2026-10-04' },
]
const DE_WEB = [{ id: 'isabel', client_name: 'Isabel Lozano', product: 'web y ficha de Google', payment_type: 'Pago único', status: 'won', revenue: 325, cash_collected: 250, date: '2026-10-19' }]
const PARTICIPACIONES = [{ origen: DDC, porcentaje: 35, ventas: DE_DDC }, { origen: WEB, porcentaje: 50, ventas: DE_WEB }]
const esCancelada = (r) => String(r?.status || '').toLowerCase() === 'cancelada'

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
  participacionesApi: { de: vi.fn(async () => ({ participaciones: PARTICIPACIONES })) },
  isSaleCancelled: (r) => String(r?.status || '').toLowerCase() === 'cancelada',
  cuotasPendientes: (v) => (Number(v?.installments_total) ? Math.max(0, v.installments_total - (v.installments_paid || 0)) : null),
}))
vi.mock('../src/helm/views/informe/Graficas', () => ({ Evolucion: () => null, PorPrograma: () => null }))

const { default: Informe } = await import('../src/helm/views/Informe.jsx')

// El valor de un KPI (la tarjeta .helm-kpi con esa etiqueta).
const kpi = (label) => [...document.querySelectorAll('.helm-kpi')].find(k => k.querySelector('.lbl')?.textContent === label)?.querySelector('.val')?.textContent

afterEach(cleanup)

describe('src/helm/participaciones', () => {
  it('parteDe multiplica los importes por el porcentaje y marca de dónde sale', () => {
    const p = parteDe({ id: 'x', revenue: 1987, cash_collected: 331.17, installment_amount: 331.17, product: 'Año formativo' }, 35, DDC)
    expect(p).toMatchObject({ id: 'part:detras-de-camra:x', revenue: 695.45, cash_collected: 115.91, installment_amount: 115.91,
      product: 'detras de camra · 35 %', producto_origen: 'Año formativo', participacion: { origen: 'detras-de-camra', nombre: 'detras de camra', porcentaje: 35 } })
  })

  it('reparte cada mensualidad en sus cobros con los importes del origen y luego aplica el porcentaje', () => {
    const { cobros, ventas } = partesDe(PARTICIPACIONES, { esCancelada })
    const deAlexander = cobros.filter(c => c.client_name === 'Alexander Salgado')
    expect(deAlexander).toHaveLength(6)
    expect(deAlexander.every(c => c.cash_collected === 68.95)).toBe(true)
    expect(cobros.some(c => c.client_name === 'Anulada')).toBe(false)
    expect(ventas.find(v => v.client_name === 'Alexander Salgado').installment_amount).toBe(68.95)
  })

  it('movimientosDe: un ingreso por cada pago, con lo cobrado y quién lo pagó', () => {
    const movs = movimientosDe(partesDe(PARTICIPACIONES, { esCancelada }).cobros)
    const octubre = movs.filter(m => m.date.startsWith('2026-10'))
    expect(octubre.find(m => m.description.includes('Isabel Lozano'))).toMatchObject({ amount: 125, category: 'Ingreso', date: '2026-10-19' })
    expect(octubre.find(m => m.description.includes('Michele'))?.description).toBe('Tu parte (35 %) · detras de camra · Año formativo · Michele Toledo Jara')
    // El plan de Nicolas sin nada cobrado no es un ingreso.
    expect(movs.some(m => m.amount === 0)).toBe(false)
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
    // Nicolas, con sus dos mayúsculas, en una sola fila: el 35 % de la reserva.
    expect(t.getAllByText(/^Nicolas salas$/i)).toHaveLength(1)
    // Isabel: el 50 % de lo cobrado (250 €).
    expect(within(t.getByText('Isabel Lozano').closest('tr')).getByText('125 €')).toBeTruthy()
    // Cobrado = 500 propios + 68,95 + 115,91 + 40,25 + 125.
    expect(kpi('Cobrado')).toBe('850 €')
    expect(kpi('Tu parte de otros perfiles')).toBe('350 €')
    // Ventas: solo la propia. Balance de finanzas: la parte cobrada cuenta como ingreso.
    expect(kpi('Ventas')).toBe('1')
    expect(kpi('Balance finanzas')).toBe('350 €')
  })

  it('las mensualidades de otro perfil suman tu parte al mes', async () => {
    render(<Informe clientId="silvestre" onNavigate={() => {}} />)
    await screen.findByText('Tu parte de otros perfiles · este mes')
    // 35 % de los 197 € de Alexander.
    expect(kpi('Mensualidades')).toBe('69 €/mes')
  })
})
