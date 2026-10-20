// La tarea diaria (stripe-historico.js · historicoPorEnlaces) con `alias`: el
// pago de la mensualidad hecho desde otro correo (otra persona con la tarjeta
// del cliente) va a la mensualidad del cliente, no a una nueva. En modo prueba,
// sin red ni base: Stripe y Supabase simulados.
import { describe, it, expect, vi } from 'vitest'

const DAVID = 'david@example.com'
const ALICIA = 'alicia@example.com'
const t = (iso) => Math.floor(Date.parse(`${iso}T20:00:00Z`) / 1000)

const STRIPE = {
  '/payment_links/plink_suelto': { url: 'https://buy.stripe.com/suelto', active: false },
  '/payment_links/plink_suelto/line_items': { data: [{ description: 'DDC', price: { recurring: null } }] },
  '/payment_links/plink_sub': { url: 'https://buy.stripe.com/sub', active: false },
  '/payment_links/plink_sub/line_items': { data: [{ description: 'DDC', price: { recurring: { interval: 'month' } } }] },
  '/subscriptions/sub_D': { id: 'sub_D', status: 'canceled' },
}
const sesiones = {
  plink_suelto: [{ id: 'cs_alicia', payment_status: 'paid', mode: 'payment', created: t('2026-10-08'), amount_total: 19700, customer_details: { email: ALICIA, name: 'Alicia Gil' } }],
  plink_sub: [{ id: 'cs_david', payment_status: 'paid', mode: 'subscription', subscription: 'sub_D', created: t('2026-05-04'), amount_total: 19700, customer_details: { email: DAVID, name: 'David Villasmil' } }],
}
const facturas = ['2026-05-04', '2026-06-04', '2026-07-04', '2026-08-04', '2026-09-04']
  .map((f, i) => ({ id: `in_${i}`, status: 'paid', amount_paid: 19700, created: t(f), status_transitions: { paid_at: t(f) } }))

vi.mock('../api/_lib/stripe.js', () => ({
  stripeRequest: vi.fn(async (_k, ruta, { body } = {}) => {
    if (ruta === '/checkout/sessions') return { data: sesiones[body.payment_link] || [], has_more: false }
    if (ruta === '/invoices') return { data: facturas, has_more: false }
    if (STRIPE[ruta]) return STRIPE[ruta]
    throw new Error(`ruta no simulada ${ruta}`)
  }),
}))
vi.mock('../api/_lib/pagos.js', () => ({ registrarPago: vi.fn(), buscarOCrearContacto: vi.fn(), registrarActividad: vi.fn(), asegurarProducto: vi.fn() }))
vi.mock('../api/_lib/stripe-import.js', () => ({ addFinanceEntry: vi.fn(), upsertLead: vi.fn() }))

// Supabase de solo lectura que no encuentra nada: todo sale como «nuevo».
const q = () => { const o = { select: () => o, eq: () => o, in: () => o, ilike: () => o, not: () => o, limit: () => Promise.resolve({ data: [], error: null }), then: (ok) => Promise.resolve({ data: [], error: null }).then(ok) }; return o }
const supabase = { from: () => q() }

const { historicoPorEnlaces } = await import('../api/_lib/stripe-historico.js')
const ENLACES = [{ id: 'plink_suelto', mensual: true }, { id: 'plink_sub', mensual: true }]

describe('historicoPorEnlaces · alias', () => {
  it('sin alias, el pago desde otro correo abre otra mensualidad', async () => {
    const r = await historicoPorEnlaces({ supabase, clientId: 'c', apiKey: 'k', enlaces: ENLACES, mensualidad: 'M', prueba: true })
    expect(r.ops.filter(o => o.startsWith('Mensualidad:'))).toEqual([
      'Mensualidad: Alicia Gil · 1 cuota de 197 €, 197 €',
      'Mensualidad: David Villasmil · 5 cuotas de 197 €, 985 €',
    ])
  })

  it('con alias, va a la del cliente: David lleva 6, con su nombre', async () => {
    const r = await historicoPorEnlaces({ supabase, clientId: 'c', apiKey: 'k', enlaces: ENLACES, mensualidad: 'M', alias: { [ALICIA.toUpperCase()]: DAVID }, prueba: true })
    expect(r.ops.filter(o => o.startsWith('Mensualidad:'))).toEqual(['Mensualidad: David Villasmil · 6 cuotas de 197 €, 1182 €'])
  })
})
