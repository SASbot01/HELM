// La licencia de la agencia por Stripe (api/creditos.js, desde el 2026-11-08):
// la sesión de 97 € lleva su factura con el IVA dentro (solo desde la cuenta de
// HELM) y la marca 'licencia'; al pagar (webhook o vuelta del navegador) se
// alarga la licencia un año con la sesión como referencia (no suma dos veces);
// se ignoran los pagos de otros negocios; las sesiones de créditos abiertas
// antes del cambio se siguen apuntando para devolverlas. También el estado de
// la licencia que pide la pantalla de pago (sin licencia) y las claves de IA de
// la agencia (trae-tu-clave). Sin red ni base: Stripe va simulado como es de
// verdad (cada sesión vive en UNA cuenta; con la clave de la otra, 404).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import crypto from 'node:crypto'

process.env.JWT_SECRET = 'secreto-de-prueba-para-los-tests-de-licencias-0123456789'
const ENV = {
  HELM_CREDITOS_STRIPE_KEY: 'rk_live_nueva',
  HELM_STRIPE_SECRET_KEY: 'sk_live_compartida',
  HELM_CREDITOS_STRIPE_WEBHOOK_SECRET: 'whsec_nueva',
  HELM_STRIPE_WEBHOOK_SECRET: 'whsec_compartida',
}
Object.assign(process.env, ENV)
delete process.env.HELM_LICENCIA_EUR

const AG = 'a0000000-0000-4000-8000-0000000000a1'
const h = vi.hoisted(() => ({
  sumarSaldo: null,
  extenderLicencia: null,
  agencias: new Map(),           // id → { id, nombre, slug, sin_cobro }
  licencia: { exenta: false, vigente: false, venceAt: null },
  auth: null,
  claves: { anthropic: { configurada: false, last4: null, modelo: null }, replicate: { configurada: false, last4: null } },
  guardar: null,
  verificar: null,
}))
h.sumarSaldo = vi.fn(async () => 12)
h.extenderLicencia = vi.fn(async () => '2027-11-08T12:00:00.000Z')
h.guardar = vi.fn(async () => {})
h.verificar = vi.fn(async () => ({ model: 'claude-opus-5', displayName: 'Opus' }))

vi.mock('../api/_lib/creditos.js', async (orig) => ({ ...(await orig()), sumarSaldo: (...a) => h.sumarSaldo(...a) }))
vi.mock('../api/_lib/licencia.js', async (orig) => ({
  ...(await orig()),
  extenderLicencia: (...a) => h.extenderLicencia(...a),
  licenciaDe: async () => h.licencia,
}))
vi.mock('../api/_lib/claves-agencia.js', () => ({
  estadoClaves: async () => h.claves,
  guardarClavesAgencia: (...a) => h.guardar(...a),
}))
vi.mock('../api/_lib/anthropic.js', () => ({
  verificarClave: (...a) => h.verificar(...a),
  modeloValido: (m) => ['claude-opus-5', 'claude-sonnet-5'].includes(m),
  MODELO_POR_DEFECTO: 'claude-opus-5',
  MODELOS_CLAUDE: [{ id: 'claude-opus-5', label: 'Opus 5', desc: 'El mejor' }, { id: 'claude-sonnet-5', label: 'Sonnet 5', desc: 'Rápido' }],
}))
vi.mock('../api/_lib/llm.js', () => ({ olvidarProveedor: () => {} }))
vi.mock('../api/_lib/access.js', () => ({
  requireProfileAccess: async () => h.auth,
  puedeVerSaldo: async () => false,
  agenciaDe: async () => AG,
}))
vi.mock('../api/lib/supabase.js', () => ({
  supabase: {
    from: (tabla) => {
      const filtros = {}
      const q = {
        select: () => q,
        eq: (c, v) => { filtros[c] = v; return q },
        maybeSingle: async () => ({ data: tabla === 'agencias' ? h.agencias.get(filtros.id) || null : null, error: null }),
      }
      return q
    },
  },
}))
const ADMIN = { superadmin: true, role: 'superadmin', agenciaId: AG, email: 'admin@agencia.test' }
vi.mock('../api/_lib/auth.js', async (orig) => ({
  ...(await orig()),
  writeAudit: vi.fn(async () => {}),
  validateAuth: vi.fn(async (_req, opciones) => { h.ultimaValidacion = opciones; return h.auth }),
  requireSuperAdmin: vi.fn(async (_req, opciones) => {
    h.ultimaValidacion = opciones
    if (!h.auth?.superadmin) throw Object.assign(new Error('Forbidden: superadmin required'), { statusCode: 403 })
    return h.auth
  }),
}))

const { default: creditos, camposFactura } = await import('../api/creditos.js')

function respuesta() {
  return { statusCode: 0, body: null, status(c) { this.statusCode = c; return this }, json(b) { this.body = b; return this }, end() { return this }, setHeader() {} }
}
async function llama(action, { method = 'POST', body = {}, query = {} } = {}) {
  const res = respuesta()
  await creditos({ method, query: { action, ...query }, headers: {}, body, socket: {} }, res)
  return res
}
async function aviso(event, secreto = 'whsec_nueva') {
  const cuerpo = Buffer.from(JSON.stringify(event))
  const t = Math.floor(Date.now() / 1000)
  const firma = crypto.createHmac('sha256', secreto).update(`${t}.${cuerpo}`).digest('hex')
  const res = respuesta()
  await creditos({ method: 'POST', query: { action: 'webhook' }, headers: { 'stripe-signature': `t=${t},v1=${firma}` }, body: event, rawBody: cuerpo, socket: {} }, res)
  return res
}
const confirma = (sessionId) => llama('confirmar', { body: { sessionId } })
const licencia = (extra = {}) => ({
  id: 'cs_lic_1', payment_status: 'paid', amount_subtotal: 9700, amount_total: 9700,
  metadata: { helm: 'licencia', agencia_id: AG, meses: '12' }, customer_details: { email: 'admin@agencia.test' }, ...extra,
})
const creditosViejos = (extra = {}) => ({ id: 'cs_cred_1', payment_status: 'paid', amount_subtotal: 1000, amount_total: 1000, metadata: { helm: 'creditos', agencia_id: AG }, ...extra })
const evento = (obj, type = 'checkout.session.completed') => ({ type, data: { object: obj } })

let cuentas
const enCuenta = (clave, s) => { cuentas[clave][s.id] = s; return s }
const clavesUsadas = () => global.fetch.mock.calls.map(c => c[1].headers.Authorization.slice(7))
const formulario = () => Object.fromEntries(new URLSearchParams(global.fetch.mock.calls[0][1].body))

beforeEach(() => {
  Object.assign(process.env, ENV)
  delete process.env.HELM_LICENCIA_EUR
  h.sumarSaldo.mockClear()
  h.extenderLicencia.mockReset()
  h.extenderLicencia.mockImplementation(async () => '2027-11-08T12:00:00.000Z')
  h.guardar.mockClear()
  h.verificar.mockReset()
  h.verificar.mockImplementation(async () => ({ model: 'claude-opus-5', displayName: 'Opus' }))
  h.agencias = new Map([[AG, { id: AG, nombre: 'Acme', slug: 'acme', sin_cobro: false }]])
  h.licencia = { exenta: false, vigente: false, venceAt: null }
  h.auth = { ...ADMIN }
  h.ultimaValidacion = null
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
  it('pide factura, NIF y dirección, con el IVA dentro del precio y la licencia en la descripción', () => {
    const f = camposFactura({})
    expect(f['invoice_creation[enabled]']).toBe('true')
    expect(f['invoice_creation[invoice_data][description]']).toMatch(/Licencia anual de HELM/)
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

describe('precio y estado de la licencia', () => {
  it('el precio es público: 97 € y 12 meses (o el de HELM_LICENCIA_EUR)', async () => {
    expect((await llama('precio', { method: 'GET' })).body).toEqual({ euros: 97, meses: 12 })
    process.env.HELM_LICENCIA_EUR = '120'
    expect((await llama('precio', { method: 'GET' })).body.euros).toBe(120)
  })

  it('el estado se pide SIN licencia (es lo que enseña el pago) y quien administra puede pagar', async () => {
    const r = await llama('licencia', { method: 'GET' })
    expect(h.ultimaValidacion).toMatchObject({ sinLicencia: true })
    expect(r.statusCode).toBe(200)
    expect(r.body).toMatchObject({
      agencia: { id: AG, nombre: 'Acme', slug: 'acme' }, exenta: false, vigente: false, venceAt: null,
      precio: 97, meses: 12, pagosActivos: true, puedePagar: true, esAdmin: true,
    })
  })

  it('un acceso de cliente ve el estado de su agencia pero no paga', async () => {
    h.auth = { role: 'client', clientId: 'c1', agenciaId: null }
    h.licencia = { exenta: false, vigente: false, venceAt: '2026-10-01T00:00:00Z' }
    const r = await llama('licencia', { method: 'GET' })
    expect(r.body).toMatchObject({ vigente: false, venceAt: '2026-10-01T00:00:00Z', puedePagar: false, esAdmin: false })
  })

  it('la agencia de la casa: exenta, vigente y sin pago', async () => {
    h.licencia = { exenta: true, vigente: true, venceAt: null }
    const r = await llama('licencia', { method: 'GET' })
    expect(r.body).toMatchObject({ exenta: true, vigente: true, puedePagar: false })
  })
})

describe('pagar-licencia', () => {
  it('con la cuenta de HELM: 97 € con el IVA dentro, la marca, la agencia, 12 meses y su factura; también sin licencia', async () => {
    const res = await llama('pagar-licencia')
    expect(h.ultimaValidacion).toMatchObject({ sinLicencia: true })
    expect([res.statusCode, res.body]).toEqual([200, { url: 'https://checkout.stripe.test/cs_nueva' }])
    expect(clavesUsadas()).toEqual(['rk_live_nueva'])
    const f = formulario()
    expect(f).toMatchObject({
      mode: 'payment',
      'metadata[helm]': 'licencia', 'metadata[agencia_id]': AG, 'metadata[meses]': '12', client_reference_id: AG,
      'line_items[0][price_data][unit_amount]': '9700', 'line_items[0][price_data][currency]': 'eur',
      'line_items[0][price_data][product_data][name]': 'HELM · Licencia anual de agencia',
      'line_items[0][price_data][tax_behavior]': 'inclusive', 'invoice_creation[enabled]': 'true',
      customer_email: 'admin@agencia.test',
    })
    expect(f.success_url).toMatch(/\/admin\?licencia=ok&session_id=\{CHECKOUT_SESSION_ID\}$/)
  })

  it('con otro precio en HELM_LICENCIA_EUR, ese', async () => {
    process.env.HELM_LICENCIA_EUR = '120'
    await llama('pagar-licencia')
    expect(formulario()['line_items[0][price_data][unit_amount]']).toBe('12000')
  })

  it('solo con la compartida: sin factura (saldría a nombre del otro negocio)', async () => {
    delete process.env.HELM_CREDITOS_STRIPE_KEY
    expect((await llama('pagar-licencia')).statusCode).toBe(200)
    expect(clavesUsadas()).toEqual(['sk_live_compartida'])
    const f = formulario()
    expect(f['metadata[helm]']).toBe('licencia')
    for (const campo of Object.keys(camposFactura({}))) expect(f[campo]).toBeUndefined()
  })

  it('la agencia de la casa no paga licencia; un acceso de cliente, tampoco', async () => {
    h.agencias.get(AG).sin_cobro = true
    expect((await llama('pagar-licencia')).statusCode).toBe(400)
    h.agencias.get(AG).sin_cobro = false
    h.auth = { role: 'client', clientId: 'c1' }
    expect((await llama('pagar-licencia')).statusCode).toBe(403)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('sin ninguna cuenta de Stripe: 503 con el aviso', async () => {
    delete process.env.HELM_CREDITOS_STRIPE_KEY
    delete process.env.HELM_STRIPE_SECRET_KEY
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await llama('pagar-licencia')
    log.mockRestore()
    expect(r.statusCode).toBe(503)
    expect(r.body.error).toMatch(/activamos la licencia a mano/)
  })
})

describe('webhook', () => {
  it('una licencia pagada se alarga un año, con la sesión como referencia y lo cobrado', async () => {
    enCuenta('rk_live_nueva', licencia())
    const res = await aviso(evento(licencia()))
    expect(res.statusCode).toBe(200)
    expect(clavesUsadas()).toEqual(['rk_live_nueva'])
    expect(h.extenderLicencia).toHaveBeenCalledWith(AG, expect.objectContaining({ meses: 12, origen: 'stripe', referencia: 'cs_lic_1', euros: 97 }))
    expect(h.sumarSaldo).not.toHaveBeenCalled()
  })

  it('un pago SEPA que llega días después (async_payment_succeeded), por la compartida', async () => {
    const s = enCuenta('sk_live_compartida', licencia({ id: 'cs_lic_sepa' }))
    expect((await aviso(evento(s, 'checkout.session.async_payment_succeeded'), 'whsec_compartida')).statusCode).toBe(200)
    expect(clavesUsadas()).toEqual(['sk_live_compartida'])
    expect(h.extenderLicencia).toHaveBeenCalledWith(AG, expect.objectContaining({ referencia: 'cs_lic_sepa' }))
  })

  it('sin pagar todavía no se activa (llegará async_payment_succeeded)', async () => {
    enCuenta('rk_live_nueva', licencia({ payment_status: 'unpaid' }))
    expect((await aviso(evento(licencia()))).statusCode).toBe(200)
    expect(h.extenderLicencia).not.toHaveBeenCalled()
  })

  it('no se fía del aviso: si Stripe dice que la sesión no es de licencia, no la activa', async () => {
    enCuenta('rk_live_nueva', licencia({ metadata: { helm: 'otra-cosa', agencia_id: AG } }))
    await aviso(evento(licencia()))
    expect(h.extenderLicencia).not.toHaveBeenCalled()
  })

  it('rechaza una firma de otro secreto', async () => {
    enCuenta('rk_live_nueva', licencia())
    expect((await aviso(evento(licencia()), 'whsec_otro')).statusCode).toBe(400)
    expect(h.extenderLicencia).not.toHaveBeenCalled()
  })

  it('ignora con 200 los pagos de otros negocios, aunque traigan client_reference_id o una marca rara', async () => {
    expect((await aviso(evento({ id: 'cs_otro', client_reference_id: AG, metadata: {} }), 'whsec_compartida')).statusCode).toBe(200)
    await aviso(evento({ id: 'cs_otro2', metadata: { helm: 'licencia', agencia_id: 'cliente-42' } }), 'whsec_compartida')
    await aviso(evento({ id: 'cs_otro3', metadata: { helm: 'otra-cosa', agencia_id: AG } }), 'whsec_compartida')
    expect(global.fetch).not.toHaveBeenCalled()
    expect(h.extenderLicencia).not.toHaveBeenCalled()
  })

  it('firmado con el secreto nuevo, la sesión solo se busca en la cuenta nueva', async () => {
    const s = enCuenta('sk_live_compartida', licencia({ id: 'cs_otra_cuenta' }))
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await aviso(evento(s), 'whsec_nueva')
    log.mockRestore()
    expect(res.statusCode).toBe(502)
    expect(clavesUsadas()).toEqual(['rk_live_nueva'])
    expect(h.extenderLicencia).not.toHaveBeenCalled()
  })

  it('una sesión de CRÉDITOS abierta antes del cambio se sigue apuntando (para devolverla), sin tocar la licencia', async () => {
    enCuenta('rk_live_nueva', creditosViejos())
    expect((await aviso(evento(creditosViejos()))).statusCode).toBe(200)
    expect(h.sumarSaldo).toHaveBeenCalledWith(AG, 10, expect.objectContaining({ referencia: 'cs_cred_1', tipo: 'recarga' }))
    expect(h.extenderLicencia).not.toHaveBeenCalled()
  })
})

describe('confirmar (la vuelta del navegador)', () => {
  it('se puede SIN licencia, y activa la de la sesión: primero la cuenta nueva (404) y luego la compartida', async () => {
    enCuenta('sk_live_compartida', licencia({ id: 'cs_lic_vieja' }))
    const res = await confirma('cs_lic_vieja')
    expect(h.ultimaValidacion).toMatchObject({ sinLicencia: true })
    expect([res.statusCode, res.body]).toEqual([200, { pagado: true, licencia: true, nuevo: true, venceAt: '2027-11-08T12:00:00.000Z' }])
    expect(clavesUsadas()).toEqual(['rk_live_nueva', 'sk_live_compartida'])
  })

  it('la vuelta y el webhook a la vez no suman dos años: la segunda dice que no es nuevo', async () => {
    enCuenta('rk_live_nueva', licencia())
    h.extenderLicencia.mockImplementationOnce(async () => '2027-11-08T12:00:00.000Z').mockImplementationOnce(async () => null)
    await aviso(evento(licencia()))
    const r = await confirma('cs_lic_1')
    expect(r.body).toMatchObject({ pagado: true, nuevo: false })
    expect(h.extenderLicencia.mock.calls.map(c => c[1].referencia)).toEqual(['cs_lic_1', 'cs_lic_1'])
  })

  it('una sesión que no está en ninguna: error y nada activado', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await confirma('cs_no_existe')
    log.mockRestore()
    expect(res.statusCode).toBe(502)
    expect(res.body.error).toMatch(/No such checkout.session/)
    expect(h.extenderLicencia).not.toHaveBeenCalled()
  })

  it('un id que no es de una sesión no llega a Stripe', async () => {
    const res = await confirma('cs_../../v1/charges')
    expect(res.statusCode).toBe(400)
    expect(global.fetch).not.toHaveBeenCalled()
  })
})

describe('claves de IA de la agencia (trae-tu-clave)', () => {
  const CLAVE = 'sk-ant-api03-' + 'a'.repeat(40)

  it('GET: si están (nunca la clave) y los modelos que se pueden elegir', async () => {
    const r = await llama('claves', { method: 'GET' })
    expect(r.statusCode).toBe(200)
    expect(r.body).toMatchObject({ anthropic: { configurada: false }, replicate: { configurada: false }, modeloPorDefecto: 'claude-opus-5' })
    expect(r.body.modelos.map(m => m.id)).toEqual(['claude-opus-5', 'claude-sonnet-5'])
  })

  it('la clave de Claude se comprueba contra Anthropic antes de guardarse', async () => {
    const r = await llama('claves', { body: { anthropicKey: CLAVE, anthropicModel: 'claude-sonnet-5' } })
    expect(r.statusCode).toBe(200)
    expect(h.verificar).toHaveBeenCalledWith(CLAVE, 'claude-sonnet-5')
    expect(h.guardar).toHaveBeenCalledWith(AG, { anthropicKey: CLAVE, anthropicModel: 'claude-sonnet-5' }, 'admin@agencia.test')
  })

  it('una clave que Anthropic no acepta no se guarda, y se dice por qué', async () => {
    h.verificar.mockRejectedValueOnce(Object.assign(new Error('La clave de Anthropic no es válida o fue revocada.'), { statusCode: 401 }))
    const r = await llama('claves', { body: { anthropicKey: CLAVE } })
    expect([r.statusCode, r.body.error]).toEqual([400, 'La clave de Anthropic no es válida o fue revocada.'])
    expect(h.guardar).not.toHaveBeenCalled()
  })

  it('lo que no tiene forma de clave ni se manda a Anthropic', async () => {
    expect((await llama('claves', { body: { anthropicKey: 'hola' } })).statusCode).toBe(400)
    expect((await llama('claves', { body: { replicateToken: 'no-es-un-token' } })).statusCode).toBe(400)
    expect((await llama('claves', { body: { anthropicModel: 'gpt-9' } })).statusCode).toBe(400)
    expect(h.verificar).not.toHaveBeenCalled()
    expect(h.guardar).not.toHaveBeenCalled()
  })

  it('el token de Replicate y borrar', async () => {
    await llama('claves', { body: { replicateToken: 'r8_' + 'b'.repeat(37) } })
    expect(h.guardar).toHaveBeenLastCalledWith(AG, { replicateToken: 'r8_' + 'b'.repeat(37) }, 'admin@agencia.test')
    await llama('claves', { body: { borrar: ['anthropic', 'replicate'] } })
    expect(h.guardar).toHaveBeenLastCalledWith(AG, { anthropicKey: null, anthropicModel: null, replicateToken: null }, 'admin@agencia.test')
  })

  it('solo quien administra la agencia; sin nada que guardar, 400', async () => {
    expect((await llama('claves', { body: {} })).statusCode).toBe(400)
    h.auth = { role: 'client', clientId: 'c1' }
    expect((await llama('claves', { method: 'GET' })).statusCode).toBe(403)
  })

  it('las claves SÍ piden licencia (no van con sinLicencia)', async () => {
    await llama('claves', { method: 'GET' })
    expect(h.ultimaValidacion?.sinLicencia).toBeFalsy()
  })
})

describe('lo que ya no existe', () => {
  it('packs, comprar, bienvenida, saldo y ajuste: acción desconocida', async () => {
    for (const a of ['comprar', 'bienvenida', 'ajuste']) expect((await llama(a)).statusCode).toBe(400)
    for (const a of ['packs', 'saldo']) expect((await llama(a, { method: 'GET' })).statusCode).toBe(405)
  })
})
