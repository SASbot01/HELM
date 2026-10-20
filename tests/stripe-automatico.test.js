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
let configFalla = false

vi.mock('../api/lib/supabase.js', () => {
  const q = (data) => { const o = { select: () => o, eq: () => o, is: () => o, limit: () => Promise.resolve({ data, error: null }), maybeSingle: () => Promise.resolve({ data: Array.isArray(data) ? data[0] : data, error: null }), insert: () => Promise.resolve({ error: null }), delete: () => o }; return o }
  return { supabase: { from: (t) => (t === 'clients' ? q({ id: 'c1', name: 'DDC', slug: 'detras-de-camra' })
    : t === 'user_integrations' ? (configFalla ? { select() { return this }, eq() { return this }, limit: () => Promise.resolve({ data: null, error: { message: 'timeout' } }) } : q(conAutomatico ? [{ config: CONFIG }] : []))
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

beforeEach(() => { vi.useRealTimers(); conAutomatico = true; configFalla = false; ingest.registerStripePayment.mockClear(); ingest.registerStripeInvoice.mockClear(); historico.historicoPorEnlaces.mockClear() })

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

describe('revisión: errores', () => {
  it('si no se puede leer la tarea, el webhook da 500 (Stripe reintenta) y no apunta nada suelto', async () => {
    configFalla = true
    const r = await aviso({ id: 'evt_9', type: 'invoice.paid', data: { object: { id: 'in_9', amount_paid: 4900, customer_email: 'b@otro.com' } } })
    expect(r.statusCode).toBe(500)
    expect(ingest.registerStripeInvoice).not.toHaveBeenCalled()
    expect(ingest.registerStripePayment).not.toHaveBeenCalled()
  })

  it('si no se puede leer la tarea, «Sincronizar» da 503 y no importa nada', async () => {
    configFalla = true
    const res = respuesta()
    await apiStripe({ method: 'POST', query: { action: 'sync' }, body: { clientId: 'c1' }, headers: {}, socket: {} }, res)
    expect(res.statusCode).toBe(503)
    expect(historico.historicoPorEnlaces).not.toHaveBeenCalled()
  })

  it('un 401 de Stripe en «Sincronizar» no sale como 401 (el panel echaría al usuario)', async () => {
    historico.historicoPorEnlaces.mockRejectedValueOnce(Object.assign(new Error('Invalid API Key'), { statusCode: 401 }))
    const res = respuesta()
    await apiStripe({ method: 'POST', query: { action: 'sync' }, body: { clientId: 'c1' }, headers: {}, socket: {} }, res)
    expect(res.statusCode).toBe(502)
    expect(res.body.error).toMatch(/rechazó la clave/)
  })

  it('si la puesta al día del webhook falla, se reintenta a los 2 minutos', async () => {
    vi.useFakeTimers()
    historico.historicoPorEnlaces.mockRejectedValueOnce(new Error('Stripe 429'))
    await aviso({ id: 'evt_10', type: 'checkout.session.completed', data: { object: { id: 'cs_10', payment_status: 'paid', payment_link: 'plink_ddc' } } })
    await vi.advanceTimersByTimeAsync(21_000)
    expect(historico.historicoPorEnlaces).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(121_000)
    expect(historico.historicoPorEnlaces).toHaveBeenCalledTimes(2)
  })

  it('«Sincronizar» espera a la del webhook en marcha: nunca dos a la vez', async () => {
    let enCurso = 0, maximo = 0
    historico.historicoPorEnlaces.mockImplementation(async () => {
      enCurso++; maximo = Math.max(maximo, enCurso)
      await new Promise(r => setTimeout(r, 30)); enCurso--
      return { ventas: { nuevas: 0, yaEstaban: 0, vinculadas: 0, actualizadas: 0 }, finanzas: 0, cobrado: 0, ops: [], errores: [] }
    })
    const { enSerie, ponerStripeAlDia } = await import('../api/_lib/stripe-automatico.js')
    const a = enSerie('c1', () => ponerStripeAlDia({ supabase: null, clientId: 'c1', config: CONFIG, apiKeyEnlazada: 'k' }))
    const res = respuesta()
    await Promise.all([a, apiStripe({ method: 'POST', query: { action: 'sync' }, body: { clientId: 'c1' }, headers: {}, socket: {} }, res)])
    expect(res.statusCode).toBe(200)
    expect(maximo).toBe(1)
  })
})

