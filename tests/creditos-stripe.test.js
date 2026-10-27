// Compra de créditos por Stripe: la sesión lleva su factura con el IVA dentro
// (solo desde la cuenta de HELM), el webhook acepta el secreto de la cuenta
// nueva y el de la compartida y pide la sesión a la cuenta que avisa, la vuelta
// del navegador la busca en las dos, e ignora los pagos de otros negocios; se
// acredita una sesión marcada por HELM (o, en la transición, una de antes de la
// marca con el UUID de una agencia que existe), por el importe del pack. Sin
// red ni base: Stripe va simulado como es de verdad (cada sesión vive en UNA
// cuenta; con la clave de la otra, 404).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import crypto from 'node:crypto'

process.env.JWT_SECRET = 'secreto-de-prueba-para-los-tests-de-creditos-0123456789'
const ENV = {
  HELM_CREDITOS_STRIPE_KEY: 'rk_live_nueva',
  HELM_STRIPE_SECRET_KEY: 'sk_live_compartida',
  HELM_CREDITOS_STRIPE_WEBHOOK_SECRET: 'whsec_nueva',
  HELM_STRIPE_WEBHOOK_SECRET: 'whsec_compartida',
}
Object.assign(process.env, ENV)

const AG = 'a0000000-0000-4000-8000-0000000000a1'
const mover = vi.hoisted(() => ({ sumarSaldo: vi.fn(async () => 12), agencias: new Set() }))
vi.mock('../api/_lib/creditos.js', async (orig) => ({ ...(await orig()), sumarSaldo: mover.sumarSaldo }))
vi.mock('../api/lib/supabase.js', () => ({
  supabase: {
    from: (tabla) => {
      const filtros = {}
      const q = {
        select: () => q,
        eq: (c, v) => { filtros[c] = v; return q },
        maybeSingle: async () => ({ data: tabla === 'agencias' && mover.agencias.has(filtros.id) ? { id: filtros.id } : null, error: null }),
      }
      return q
    },
  },
}))
vi.mock('../api/_lib/auth.js', async (orig) => ({
  ...(await orig()),
  writeAudit: vi.fn(async () => {}),
  requireSuperAdmin: vi.fn(async () => ({ agenciaId: AG, email: 'admin@agencia.test' })),
}))

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
async function confirma(sessionId) {
  const res = respuesta()
  await creditos({ method: 'POST', query: { action: 'confirmar' }, headers: {}, body: { sessionId }, socket: {} }, res)
  return res
}
const sesion = (extra = {}) => ({ id: 'cs_test_1', payment_status: 'paid', amount_subtotal: 1000, amount_total: 1000, metadata: { helm: 'creditos', agencia_id: 'ag-1' }, ...extra })
const evento = (obj, type = 'checkout.session.completed') => ({ type, data: { object: obj } })

// Las sesiones de cada cuenta de Stripe, por su clave.
let cuentas
const enCuenta = (clave, s) => { cuentas[clave][s.id] = s; return s }
const clavesUsadas = () => global.fetch.mock.calls.map(c => c[1].headers.Authorization.slice(7))

beforeEach(() => {
  Object.assign(process.env, ENV)
  mover.sumarSaldo.mockClear()
  mover.agencias.clear()
  cuentas = { rk_live_nueva: {}, sk_live_compartida: {} }
  global.fetch = vi.fn(async (url, opts) => {
    const clave = opts.headers.Authorization.slice(7)
    if (opts.method === 'POST') return { ok: true, status: 200, json: async () => ({ id: 'cs_nueva', url: 'https://checkout.stripe.test/cs_nueva' }) }
    const id = url.split('/').pop()
    const s = cuentas[clave]?.[id]
    if (!s) return { ok: false, status: 404, json: async () => ({ error: { code: 'resource_missing', message: `No such checkout.session: '${id}'` } }) }
    return { ok: true, status: 200, json: async () => s }
  })
})
afterEach(() => { Object.assign(process.env, ENV) })

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

describe('comprar', () => {
  async function compra() {
    const res = respuesta()
    await creditos({ method: 'POST', query: { action: 'comprar' }, headers: {}, body: { pack: 'pack-10' }, socket: {} }, res)
    return res
  }
  const formulario = () => Object.fromEntries(new URLSearchParams(global.fetch.mock.calls[0][1].body))

  it('con la cuenta de HELM: la sesión se abre allí, con la marca y su factura', async () => {
    const res = await compra()
    expect([res.statusCode, res.body]).toEqual([200, { url: 'https://checkout.stripe.test/cs_nueva' }])
    expect(clavesUsadas()).toEqual(['rk_live_nueva'])
    const f = formulario()
    expect(f['metadata[helm]']).toBe('creditos')
    expect(f['metadata[agencia_id]']).toBe(AG)
    expect(f['invoice_creation[enabled]']).toBe('true')
    expect(f['line_items[0][price_data][unit_amount]']).toBe('1000')
  })

  it('solo con la compartida: sin factura (saldría a nombre del otro negocio)', async () => {
    delete process.env.HELM_CREDITOS_STRIPE_KEY
    const res = await compra()
    expect(res.statusCode).toBe(200)
    expect(clavesUsadas()).toEqual(['sk_live_compartida'])
    const f = formulario()
    expect(f['metadata[helm]']).toBe('creditos')
    for (const campo of Object.keys(camposFactura({}))) expect(f[campo]).toBeUndefined()
  })
})

describe('webhook de créditos', () => {
  it('acredita una sesión de HELM por el importe del pack, con la clave nueva', async () => {
    enCuenta('rk_live_nueva', sesion())
    const res = await aviso(evento(sesion()))
    expect(res.statusCode).toBe(200)
    expect(clavesUsadas()).toEqual(['rk_live_nueva'])
    expect(mover.sumarSaldo).toHaveBeenCalledWith('ag-1', 10, expect.objectContaining({ referencia: 'cs_test_1', tipo: 'recarga' }))
  })

  it('firmado con el secreto de la compartida: la sesión se pide a la compartida (pago en vuelo al cambiar de cuenta)', async () => {
    const s = enCuenta('sk_live_compartida', sesion({ id: 'cs_live_vieja', amount_subtotal: 2500, amount_total: 2500 }))
    const res = await aviso(evento(s, 'checkout.session.async_payment_succeeded'), 'whsec_compartida')
    expect(res.statusCode).toBe(200)
    expect(clavesUsadas()).toEqual(['sk_live_compartida'])
    expect(mover.sumarSaldo).toHaveBeenCalledWith('ag-1', 25, expect.objectContaining({ referencia: 'cs_live_vieja' }))
  })

  it('firmado con el secreto nuevo, la sesión solo se busca en la cuenta nueva', async () => {
    // Un aviso de la cuenta nueva por una sesión que solo está en la otra no acredita nada.
    const s = enCuenta('sk_live_compartida', sesion({ id: 'cs_otra_cuenta' }))
    const res = await aviso(evento(s), 'whsec_nueva')
    expect(res.statusCode).toBe(502)
    expect(clavesUsadas()).toEqual(['rk_live_nueva'])
    expect(mover.sumarSaldo).not.toHaveBeenCalled()
  })

  it('con el secreto nuevo pero sin su clave: 503 (Stripe lo reintenta), sin probar la otra cuenta', async () => {
    delete process.env.HELM_CREDITOS_STRIPE_KEY
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    enCuenta('sk_live_compartida', sesion())
    const res = await aviso(evento(sesion()), 'whsec_nueva')
    log.mockRestore()
    expect(res.statusCode).toBe(503)
    expect(global.fetch).not.toHaveBeenCalled()
    expect(mover.sumarSaldo).not.toHaveBeenCalled()
  })

  it('rechaza una firma de otro secreto', async () => {
    enCuenta('rk_live_nueva', sesion())
    expect((await aviso(evento(sesion()), 'whsec_otro')).statusCode).toBe(400)
    expect(mover.sumarSaldo).not.toHaveBeenCalled()
  })

  it('ignora con 200 los pagos de otros negocios, aunque traigan client_reference_id', async () => {
    const res = await aviso(evento({ id: 'cs_otro', client_reference_id: 'ag-1', metadata: {} }), 'whsec_compartida')
    expect(res.statusCode).toBe(200)
    expect(global.fetch).not.toHaveBeenCalled()
    expect(mover.sumarSaldo).not.toHaveBeenCalled()
    // Ni con una agencia_id que no es un UUID, ni con otra marca.
    await aviso(evento({ id: 'cs_otro2', metadata: { agencia_id: 'cliente-42' } }), 'whsec_compartida')
    await aviso(evento({ id: 'cs_otro3', metadata: { helm: 'otra-cosa', agencia_id: AG } }), 'whsec_compartida')
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('no se fía del aviso: si Stripe dice que la sesión no es de créditos, no acredita', async () => {
    enCuenta('rk_live_nueva', sesion({ metadata: { agencia_id: 'ag-1' } }))
    await aviso(evento(sesion()))
    expect(mover.sumarSaldo).not.toHaveBeenCalled()
  })

  it('con el IVA aparte, el impuesto no se convierte en créditos', async () => {
    enCuenta('rk_live_nueva', sesion({ amount_subtotal: 1000, amount_total: 1210 }))
    await aviso(evento(sesion()))
    expect(mover.sumarSaldo).toHaveBeenCalledWith('ag-1', 10, expect.anything())
  })

  it('una sesión sin pagar todavía no acredita (llegará async_payment_succeeded)', async () => {
    enCuenta('rk_live_nueva', sesion({ payment_status: 'unpaid' }))
    expect((await aviso(evento(sesion()))).statusCode).toBe(200)
    expect(mover.sumarSaldo).not.toHaveBeenCalled()
  })
})

describe('sesiones de antes de la marca (transición)', () => {
  // Como las abría el código anterior: sin metadata.helm, con la agencia en
  // metadata.agencia_id y en client_reference_id.
  const antigua = (extra = {}) => sesion({ id: 'cs_live_antes', client_reference_id: AG, metadata: { agencia_id: AG }, ...extra })

  it('con el UUID de una agencia que existe se acredita, por el webhook y al volver, una sola referencia', async () => {
    mover.agencias.add(AG)
    delete process.env.HELM_CREDITOS_STRIPE_KEY
    enCuenta('sk_live_compartida', antigua())
    const r1 = await aviso(evento(antigua()), 'whsec_compartida')
    expect(r1.statusCode).toBe(200)
    const r2 = await confirma('cs_live_antes')
    expect([r2.statusCode, r2.body.pagado]).toEqual([200, true])
    expect(mover.sumarSaldo).toHaveBeenCalledTimes(2)
    for (const llamada of mover.sumarSaldo.mock.calls) {
      expect(llamada).toEqual([AG, 10, expect.objectContaining({ referencia: 'cs_live_antes' })])
    }
  })

  it('si esa agencia no existe, no se acredita', async () => {
    enCuenta('sk_live_compartida', antigua())
    expect((await aviso(evento(antigua()), 'whsec_compartida')).statusCode).toBe(200)
    expect((await confirma('cs_live_antes')).body).toEqual({ pagado: false })
    expect(mover.sumarSaldo).not.toHaveBeenCalled()
  })
})

describe('confirmar (la vuelta del navegador)', () => {
  it('con las dos claves, una sesión de la compartida: primero la nueva (404) y luego la compartida', async () => {
    enCuenta('sk_live_compartida', sesion({ id: 'cs_live_vieja' }))
    const res = await confirma('cs_live_vieja')
    expect([res.statusCode, res.body]).toEqual([200, { pagado: true, nuevo: true, euros: 10 }])
    expect(clavesUsadas()).toEqual(['rk_live_nueva', 'sk_live_compartida'])
    expect(mover.sumarSaldo).toHaveBeenCalledWith('ag-1', 10, expect.objectContaining({ referencia: 'cs_live_vieja' }))
  })

  it('una sesión de la cuenta nueva: no hace falta preguntar a la otra', async () => {
    enCuenta('rk_live_nueva', sesion())
    expect((await confirma('cs_test_1')).body.pagado).toBe(true)
    expect(clavesUsadas()).toEqual(['rk_live_nueva'])
  })

  it('solo con la compartida configurada, se busca allí', async () => {
    delete process.env.HELM_CREDITOS_STRIPE_KEY
    enCuenta('sk_live_compartida', sesion())
    expect((await confirma('cs_test_1')).body.pagado).toBe(true)
    expect(clavesUsadas()).toEqual(['sk_live_compartida'])
  })

  it('una sesión que no está en ninguna: error y nada acreditado', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await confirma('cs_no_existe')
    log.mockRestore()
    expect(res.statusCode).toBe(502)
    expect(res.body.error).toMatch(/No such checkout.session/)
    expect(clavesUsadas()).toEqual(['rk_live_nueva', 'sk_live_compartida'])
    expect(mover.sumarSaldo).not.toHaveBeenCalled()
  })

  it('un error de Stripe que no es «no existe» no se prueba en la otra cuenta', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 401, json: async () => ({ error: { message: 'Invalid API Key provided' } }) }))
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await confirma('cs_test_1')
    log.mockRestore()
    expect(res.statusCode).toBe(502)
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('un id que no es de una sesión no llega a Stripe', async () => {
    const res = await confirma('cs_../../v1/charges')
    expect(res.statusCode).toBe(400)
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
