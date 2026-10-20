// Stripe en los perfiles que lleva la tarea diaria (Detrás de Cámara): el
// webhook no apunta nada por su cuenta (lo pasa a la tarea) e ignora los
// cobros de enlaces de otros negocios; «Sincronizar» pone al día con la tarea
// y responde con el resumen de siempre. Sin red ni base.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import crypto from 'node:crypto'

process.env.JWT_SECRET = 'secreto-de-prueba-para-los-tests-de-stripe-0123456789'
const SECRETO = 'whsec_prueba'
const CONFIG = { stripe: { clave: 'HELM_STRIPE_SECRET_KEY', enlaces: [{ id: 'plink_ddc', mensual: true }], alias: {} } }
let conAutomatico = true

vi.mock('../api/lib/supabase.js', () => {
  const q = (data) => { const o = { select: () => o, eq: () => o, is: () => o, limit: () => Promise.resolve({ data, error: null }), maybeSingle: () => Promise.resolve({ data: Array.isArray(data) ? data[0] : data, error: null }), insert: () => Promise.resolve({ error: null }), delete: () => o }; return o }
  return { supabase: { from: (t) => (t === 'clients' ? q({ id: 'c1', name: 'DDC', slug: 'detras-de-camra' })
    : t === 'user_integrations' ? q(conAutomatico ? [{ config: CONFIG }] : [])
      : q(null)) } }
})
vi.mock('../api/_lib/stripe.js', async (orig) => ({ ...(await orig()), getStripeConfig: vi.fn(async () => ({ enabled: true, config: { apiKey: 'rk_live_x', webhookSecret: SECRETO } })) }))
const ingest = vi.hoisted(() => ({ registerStripePayment: vi.fn(async () => 'created'), registerStripeInvoice: vi.fn(async () => 'created') }))
vi.mock('../api/_lib/stripe-ingest.js', () => ingest)
const historico = vi.hoisted(() => ({ historicoPorEnlaces: vi.fn(async () => ({ ventas: { nuevas: 0, yaEstaban: 3, vinculadas: 0, actualizadas: 1 }, finanzas: 1, cobrado: 1576, ops: ['Mensualidad al día: David Villasmil · 6 cuotas, 1182 €'], errores: [] })) }))
vi.mock('../api/_lib/stripe-historico.js', () => historico)
vi.mock('../api/_lib/auth.js', async (orig) => ({ ...(await orig()), writeAudit: vi.fn(async () => {}) }))
vi.mock('../api/_lib/access.js', () => ({ requireProfileAccess: vi.fn(async () => ({ role: 'superadmin' })) }))

const { default: webhook } = await import('../api/webhook/stripe.js')
const { default: apiStripe } = await import('../api/stripe.js')
const { eventoDelPerfil } = await import('../api/_lib/stripe-automatico.js')

function respuesta() {
  return { statusCode: 0, body: null, status(c) { this.statusCode = c; return this }, json(b) { this.body = b; return this }, end() { return this }, setHeader() {} }
}
async function aviso(event) {
  const cuerpo = Buffer.from(JSON.stringify(event))
  const t = Math.floor(Date.now() / 1000)
  const firma = crypto.createHmac('sha256', SECRETO).update(`${t}.${cuerpo}`).digest('hex')
  const res = respuesta()
  await webhook({ method: 'POST', query: { client: 'detras-de-camra' }, headers: { 'stripe-signature': `t=${t},v1=${firma}` }, rawBody: cuerpo, socket: {} }, res)
  return res
}

beforeEach(() => { vi.useRealTimers(); conAutomatico = true; ingest.registerStripePayment.mockClear(); historico.historicoPorEnlaces.mockClear() })

describe('eventoDelPerfil', () => {
  it('solo los checkouts de sus enlaces; las facturas, por si son de sus suscripciones', () => {
    const co = (enlace) => ({ type: 'checkout.session.completed', data: { object: { payment_link: enlace } } })
    expect(eventoDelPerfil(CONFIG, co('plink_ddc'))).toBe(true)
    expect(eventoDelPerfil(CONFIG, co('plink_rastro'))).toBe(false)
    expect(eventoDelPerfil(CONFIG, co(null))).toBe(false)
    expect(eventoDelPerfil(CONFIG, { type: 'invoice.paid' })).toBe(true)
    expect(eventoDelPerfil(CONFIG, { type: 'customer.created' })).toBe(false)
  })
})

describe('webhook en un perfil con tarea diaria', () => {
  it('un cobro suyo: no apunta nada suelto y pone al día con la tarea (una vez, tras esperar)', async () => {
    vi.useFakeTimers()
    const ev = { id: 'evt_1', type: 'checkout.session.completed', data: { object: { id: 'cs_1', payment_status: 'paid', payment_link: 'plink_ddc' } } }
    const r1 = await aviso(ev)
    const r2 = await aviso({ ...ev, id: 'evt_2', type: 'invoice.paid', data: { object: { id: 'in_1' } } })
    expect([r1.statusCode, r1.body.outcome, r2.body.outcome]).toEqual([200, 'automatico', 'automatico'])
    expect(ingest.registerStripePayment).not.toHaveBeenCalled()
    expect(historico.historicoPorEnlaces).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(21_000)
    expect(historico.historicoPorEnlaces).toHaveBeenCalledTimes(1)
    expect(historico.historicoPorEnlaces.mock.calls[0][0]).toMatchObject({ clientId: 'c1', enlaces: CONFIG.stripe.enlaces })
  })

  it('un cobro de otro negocio del mismo Stripe se ignora', async () => {
    const r = await aviso({ id: 'evt_3', type: 'checkout.session.completed', data: { object: { id: 'cs_2', payment_status: 'paid', payment_link: 'plink_rastro' } } })
    expect(r.body.outcome).toBe('ignorado:checkout.session.completed')
    expect(ingest.registerStripePayment).not.toHaveBeenCalled()
  })

  it('un perfil sin tarea diaria sigue como siempre', async () => {
    conAutomatico = false
    const r = await aviso({ id: 'evt_4', type: 'checkout.session.completed', data: { object: { id: 'cs_3', payment_status: 'paid' } } })
    expect(r.statusCode).toBe(200)
    expect(ingest.registerStripePayment).toHaveBeenCalledTimes(1)
  })
})

describe('«Sincronizar» en un perfil con tarea diaria', () => {
  it('pone al día con la tarea y responde con la forma de siempre', async () => {
    const res = respuesta()
    await apiStripe({ method: 'POST', query: { action: 'sync' }, body: { clientId: 'c1', days: 60 }, headers: {}, socket: {} }, res)
    expect(res.statusCode).toBe(200)
    expect(historico.historicoPorEnlaces).toHaveBeenCalledTimes(1)
    expect(res.body).toMatchObject({ days: 60, automatico: true, ventas: { nuevas: 0, yaEstaban: 4 }, finanzas: { apuntes: 1 }, leads: { nuevos: 0, yaEstaban: 0 }, productos: { nuevos: 0, actualizados: 0 }, analysis: null })
  })
})
