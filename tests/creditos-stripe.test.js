// Compra de créditos por Stripe: la sesión lleva su factura con el IVA dentro,
// el webhook acepta el secreto de la cuenta nueva y el de la compartida, e
// ignora los pagos de otros negocios; solo se acredita una sesión marcada por
// HELM, por el importe del pack. Sin red ni base.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import crypto from 'node:crypto'

process.env.JWT_SECRET = 'secreto-de-prueba-para-los-tests-de-creditos-0123456789'
process.env.HELM_CREDITOS_STRIPE_KEY = 'rk_live_nueva'
process.env.HELM_CREDITOS_STRIPE_WEBHOOK_SECRET = 'whsec_nueva'
process.env.HELM_STRIPE_WEBHOOK_SECRET = 'whsec_compartida'

const mover = vi.hoisted(() => ({ sumarSaldo: vi.fn(async () => 12) }))
vi.mock('../api/_lib/creditos.js', async (orig) => ({ ...(await orig()), sumarSaldo: mover.sumarSaldo }))
vi.mock('../api/lib/supabase.js', () => ({ supabase: { from: () => ({}) } }))
vi.mock('../api/_lib/auth.js', async (orig) => ({ ...(await orig()), writeAudit: vi.fn(async () => {}) }))

const { default: creditos, camposFactura } = await import('../api/creditos.js')

function respuesta() {
  return { statusCode: 0, body: null, status(c) { this.statusCode = c; return this }, json(b) { this.body = b; return this }, end() { return this }, setHeader() {} }
}
async function aviso(event, secreto = 'whsec_nueva') {
  const cuerpo = Buffer.from(JSON.stringify(event))
  const t = Math.floor(Date.now() / 1000)
  const firma = crypto.createHmac('sha256', secreto).update(`${t}.${cuerpo}`).digest('hex')
  const res = respuesta()
  await creditos({ method: 'POST', query: { action: 'webhook' }, headers: { 'stripe-signature': `t=${t},v1=${firma}` }, body: event, rawBody: cuerpo, socket: {} }, res)
  return res
}
const sesion = (extra = {}) => ({ id: 'cs_test_1', payment_status: 'paid', amount_subtotal: 1000, amount_total: 1000, metadata: { helm: 'creditos', agencia_id: 'ag-1' }, ...extra })
const evento = (obj) => ({ type: 'checkout.session.completed', data: { object: obj } })

let deStripe
beforeEach(() => {
  mover.sumarSaldo.mockClear()
  deStripe = sesion()
  global.fetch = vi.fn(async () => ({ ok: true, json: async () => deStripe }))
})

describe('camposFactura', () => {
  it('pide factura, NIF y dirección, con el IVA dentro del precio', () => {
    const f = camposFactura({})
    expect(f['invoice_creation[enabled]']).toBe('true')
    expect(f['tax_id_collection[enabled]']).toBe('true')
    expect(f.billing_address_collection).toBe('required')
    expect(f['line_items[0][price_data][tax_behavior]']).toBe('inclusive')
    expect(f['automatic_tax[enabled]']).toBeUndefined()
  })
  it('Stripe Tax solo si se activa, o un tipo fijo válido', () => {
    expect(camposFactura({ HELM_CREDITOS_STRIPE_TAX: '1' })['automatic_tax[enabled]']).toBe('true')
    expect(camposFactura({ HELM_CREDITOS_TAX_RATE: 'txr_123abc' })['line_items[0][tax_rates][0]']).toBe('txr_123abc')
    expect(camposFactura({ HELM_CREDITOS_TAX_RATE: 'txr_1&x=2' })['line_items[0][tax_rates][0]']).toBeUndefined()
  })
})

describe('webhook de créditos', () => {
  it('acredita una sesión de HELM por el importe del pack, con la clave nueva', async () => {
    const res = await aviso(evento(sesion()))
    expect(res.statusCode).toBe(200)
    expect(global.fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer rk_live_nueva')
    expect(mover.sumarSaldo).toHaveBeenCalledWith('ag-1', 10, expect.objectContaining({ referencia: 'cs_test_1', tipo: 'recarga' }))
  })
  it('vale también el secreto de la cuenta compartida mientras se cambia', async () => {
    expect((await aviso(evento(sesion()), 'whsec_compartida')).statusCode).toBe(200)
    expect(mover.sumarSaldo).toHaveBeenCalledTimes(1)
  })
  it('rechaza una firma de otro secreto', async () => {
    expect((await aviso(evento(sesion()), 'whsec_otro')).statusCode).toBe(400)
    expect(mover.sumarSaldo).not.toHaveBeenCalled()
  })
  it('ignora con 200 los pagos de otros negocios, aunque traigan client_reference_id', async () => {
    const res = await aviso(evento({ id: 'cs_otro', client_reference_id: 'ag-1', metadata: {} }))
    expect(res.statusCode).toBe(200)
    expect(global.fetch).not.toHaveBeenCalled()
    expect(mover.sumarSaldo).not.toHaveBeenCalled()
  })
  it('no se fía del aviso: si Stripe dice que la sesión no es de créditos, no acredita', async () => {
    deStripe = sesion({ metadata: { agencia_id: 'ag-1' } })
    await aviso(evento(sesion()))
    expect(mover.sumarSaldo).not.toHaveBeenCalled()
  })
  it('con el IVA aparte, el impuesto no se convierte en créditos', async () => {
    deStripe = sesion({ amount_subtotal: 1000, amount_total: 1210 })
    await aviso(evento(sesion()))
    expect(mover.sumarSaldo).toHaveBeenCalledWith('ag-1', 10, expect.anything())
  })
})
