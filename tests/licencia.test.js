// La licencia anual de la agencia (97 €/año) y su clave de Claude: quién entra
// (api/_lib/licencia.js + validateAuth), con qué clave llaman los agentes
// (claveParaLlamar: trae tu clave), y el pago por el Stripe de HELM
// (api/licencia.js, el mismo que antes vendía créditos, también en
// /api/creditos). Sin red ni base: Supabase y Stripe van simulados.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import crypto from 'node:crypto'

process.env.JWT_SECRET = 'secreto-de-prueba-para-los-tests-de-licencia-0123456789'
const ENV = {
  HELM_CREDITOS_STRIPE_KEY: 'rk_live_helm',
  HELM_CREDITOS_STRIPE_WEBHOOK_SECRET: 'whsec_helm',
  HELM_STRIPE_SECRET_KEY: 'sk_live_compartida',
  HELM_STRIPE_WEBHOOK_SECRET: 'whsec_compartida',
  AGENTS_ANTHROPIC_KEY: 'sk-ant-de-helm',
}

const AG = { casa: 'a0000000-0000-4000-8000-00000000000c', pagada: 'a0000000-0000-4000-8000-0000000000a1', caducada: 'a0000000-0000-4000-8000-0000000000a2', nueva: 'a0000000-0000-4000-8000-0000000000a3' }
const SA = { casa: 's0000000-0000-4000-8000-00000000000c', pagada: 's0000000-0000-4000-8000-0000000000a1', nueva: 's0000000-0000-4000-8000-0000000000a3', plataforma: 's0000000-0000-4000-8000-0000000000ff' }
const PERFIL = { casa: 'c0000000-0000-4000-8000-00000000000c', pagada: 'c0000000-0000-4000-8000-0000000000a1', caducada: 'c0000000-0000-4000-8000-0000000000a2', nueva: 'c0000000-0000-4000-8000-0000000000a3' }
const DIA = 86_400_000
const dentroDe = (dias) => new Date(Date.now() + dias * DIA).toISOString()

// ── Supabase en memoria ─────────────────────────────────────────────────────
const db = vi.hoisted(() => ({ t: {}, falla: null, rpc: [] }))
vi.mock('../api/lib/supabase.js', () => {
  const filas = (t) => (db.t[t] ||= [])
  function from(tabla) {
    const filtros = []
    let op = 'select'
    let datos = null
    const q = {
      select: () => q,
      eq: (c, v) => { filtros.push(f => f[c] === v); return q },
      order: () => q,
      limit: () => q,
      upsert: (d) => { op = 'upsert'; datos = d; return q },
      update: (d) => { op = 'update'; datos = d; return q },
      delete: () => { op = 'delete'; return q },
      maybeSingle: () => corre(true),
      single: () => corre(true),
      then: (ok, ko) => corre(false).then(ok, ko),
    }
    async function corre(una) {
      if (db.falla === tabla) return { data: null, error: { message: 'la base no contesta' } }
      const casan = () => filas(tabla).filter(f => filtros.every(p => p(f)))
      if (op === 'upsert') {
        const ya = filas(tabla).find(f => f.agencia_id === datos.agencia_id)
        if (ya) Object.assign(ya, datos)
        else filas(tabla).push({ ...datos })
        return { data: null, error: null }
      }
      if (op === 'update') { for (const f of casan()) Object.assign(f, datos); return { data: una ? casan()[0] || null : casan(), error: null } }
      if (op === 'delete') { db.t[tabla] = filas(tabla).filter(f => !filtros.every(p => p(f))); return { data: null, error: null } }
      let r = casan()
      if (tabla === 'licenses') r = [...r].sort((a, b) => String(b.vence_at).localeCompare(String(a.vence_at)))
      return { data: una ? r[0] || null : r, error: null }
    }
    return q
  }
  // activar_licencia (migración 125): idempotente por referencia; empieza al
  // pagar o cuando acabe la que tenga.
  async function rpc(nombre, a) {
    db.rpc.push({ nombre, ...a })
    if (nombre !== 'activar_licencia') return { data: null, error: { message: `rpc ${nombre}` } }
    const lic = filas('licenses')
    const ya = a.p_referencia && lic.find(l => l.referencia === a.p_referencia)
    if (ya) return { data: { id: ya.id, empieza_at: ya.empieza_at, vence_at: ya.vence_at, nueva: false }, error: null }
    const vigentes = lic.filter(l => l.agencia_id === a.p_agencia && l.estado === 'activa').map(l => l.vence_at).sort()
    const inicio = [vigentes.at(-1), a.p_pagada].filter(Boolean).sort().at(-1)
    const fin = new Date(inicio); fin.setUTCMonth(fin.getUTCMonth() + a.p_meses)
    const fila = { id: crypto.randomUUID(), agencia_id: a.p_agencia, estado: 'activa', origen: a.p_origen, referencia: a.p_referencia, importe_eur: a.p_importe, empieza_at: inicio, vence_at: fin.toISOString(), pagada_at: a.p_pagada, nota: a.p_nota }
    lic.push(fila)
    return { data: { id: fila.id, empieza_at: fila.empieza_at, vence_at: fila.vence_at, nueva: true }, error: null }
  }
  return { supabase: { from, rpc }, toAppFormat: (x) => x }
})

const verificarClave = vi.hoisted(() => vi.fn(async () => ({ displayName: 'Claude Opus 5' })))
vi.mock('../api/_lib/anthropic.js', async (orig) => ({ ...(await orig()), verificarClave: (...a) => verificarClave(...a) }))

const { signJwt, validateAuth } = await import('../api/_lib/auth.js')
const lic = await import('../api/_lib/licencia.js')
const { enContexto } = await import('../api/_lib/contexto.js')
const { default: licencia, camposFactura } = await import('../api/licencia.js')
const { default: creditos } = await import('../api/creditos.js')

function reinicia() {
  Object.assign(process.env, ENV)
  db.falla = null
  db.rpc.length = 0
  db.t = {
    agencias: [
      { id: AG.casa, nombre: 'Silvestre AI', slug: 'silvestreai', sin_cobro: true },
      { id: AG.pagada, nombre: 'Pagada', slug: 'pagada', sin_cobro: false },
      { id: AG.caducada, nombre: 'Caducada', slug: 'caducada', sin_cobro: false },
      { id: AG.nueva, nombre: 'Nueva', slug: 'nueva', sin_cobro: false },
    ],
    licenses: [
      { id: 'l1', agencia_id: AG.pagada, estado: 'activa', origen: 'stripe', referencia: 'cs_vieja', importe_eur: 97, empieza_at: dentroDe(-300), vence_at: dentroDe(65), pagada_at: dentroDe(-300), nota: '' },
      { id: 'l2', agencia_id: AG.caducada, estado: 'activa', origen: 'stripe', referencia: 'cs_caducada', importe_eur: 97, empieza_at: dentroDe(-400), vence_at: dentroDe(-35), pagada_at: dentroDe(-400), nota: '' },
      // Una anulada no cuenta aunque no haya caducado.
      { id: 'l3', agencia_id: AG.nueva, estado: 'anulada', origen: 'manual', referencia: null, importe_eur: 0, empieza_at: dentroDe(-1), vence_at: dentroDe(300), pagada_at: null, nota: 'error' },
    ],
    agencia_ia: [{ agencia_id: AG.pagada, api_key: 'sk-ant-de-la-agencia', model: 'claude-sonnet-5', last4: 'ncia' }],
    clients: [
      { id: PERFIL.casa, agencia_id: AG.casa }, { id: PERFIL.pagada, agencia_id: AG.pagada },
      { id: PERFIL.caducada, agencia_id: AG.caducada }, { id: PERFIL.nueva, agencia_id: AG.nueva },
    ],
    superadmins: [
      { id: SA.casa, active: true, agencia_id: AG.casa, plataforma: false },
      { id: SA.pagada, active: true, agencia_id: AG.pagada, plataforma: false },
      { id: SA.nueva, active: true, agencia_id: AG.nueva, plataforma: false },
      { id: SA.plataforma, active: true, agencia_id: AG.casa, plataforma: true },
    ],
    team: [{ id: 't-nueva', active: true, role: 'miembro', client_id: PERFIL.nueva }],
  }
  // Cada prueba empieza sin nada recordado.
  lic.olvidarAgencia()
  verificarClave.mockClear()
}
beforeEach(reinicia)

const tokenAdmin = (sub) => signJwt({ sub, role: 'superadmin', superadmin: true, email: `${sub}@x.es` })
const pet = async ({ sub, cliente, method = 'GET', action, body, query = {} }) => {
  const token = cliente ? await signJwt({ sub: cliente.sub, role: 'client', clientId: cliente.clientId }) : sub ? await tokenAdmin(sub) : null
  return { method, query: { action, ...query }, headers: token ? { authorization: `Bearer ${token}` } : {}, body, socket: {} }
}
function respuesta() {
  return { statusCode: 0, body: null, status(c) { this.statusCode = c; return this }, json(b) { this.body = b; return this }, end() { return this }, setHeader() {} }
}
async function llama(handler, opciones) {
  const res = respuesta()
  await handler(await pet(opciones), res)
  return res
}

// ── Quién entra ─────────────────────────────────────────────────────────────
describe('licenciaValida y estadoAgencia', () => {
  it('la casa siempre; el resto, con una activa sin caducar (las anuladas no cuentan)', async () => {
    const e = async (id) => lic.licenciaValida(await lic.estadoAgencia(id))
    expect(await e(AG.casa)).toBe(true)
    expect(await e(AG.pagada)).toBe(true)
    expect(await e(AG.caducada)).toBe(false)
    expect(await e(AG.nueva)).toBe(false)
    expect(await e('a0000000-0000-4000-8000-000000000999')).toBe(false)
  })

  it('trae la clave de la agencia y la fecha de caducidad', async () => {
    const e = await lic.estadoAgencia(AG.pagada)
    expect(e).toMatchObject({ existe: true, sinCobro: false, clave: { apiKey: 'sk-ant-de-la-agencia', model: 'claude-sonnet-5', last4: 'ncia' } })
    expect(Date.parse(e.venceAt)).toBeGreaterThan(Date.now())
  })
})

describe('validateAuth: sin licencia, 402 (no 401)', () => {
  it('el administrador de una agencia sin licencia: 402 con codigo «licencia» y el mensaje de pagar', async () => {
    const r = await pet({ sub: SA.nueva })
    await expect(validateAuth(r)).rejects.toMatchObject({ statusCode: 402, codigo: 'licencia', message: expect.stringMatching(/97 €\/año/) })
  })

  it('el equipo de un perfil de esa agencia: 402 que dice a quién avisar', async () => {
    const r = await pet({ cliente: { sub: 't-nueva', clientId: PERFIL.nueva } })
    await expect(validateAuth(r)).rejects.toMatchObject({ statusCode: 402, codigo: 'licencia', message: expect.stringMatching(/quien la administra/) })
  })

  it('con licencia, la casa y la plataforma entran; con licencia:false, también quien no la tiene (para pagarla)', async () => {
    await expect(validateAuth(await pet({ sub: SA.pagada }))).resolves.toMatchObject({ agenciaId: AG.pagada })
    await expect(validateAuth(await pet({ sub: SA.casa }))).resolves.toMatchObject({ agenciaId: AG.casa })
    await expect(validateAuth(await pet({ sub: SA.plataforma }))).resolves.toMatchObject({ plataforma: true })
    await expect(validateAuth(await pet({ sub: SA.nueva }), { licencia: false })).resolves.toMatchObject({ agenciaId: AG.nueva })
  })

  it('si la base no contesta al mirar la licencia, no se echa a nadie', async () => {
    db.falla = 'licenses'
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(validateAuth(await pet({ sub: SA.nueva }))).resolves.toMatchObject({ agenciaId: AG.nueva })
    log.mockRestore()
  })

  it('al pagar se olvida lo recordado: entra en la petición siguiente', async () => {
    await expect(validateAuth(await pet({ sub: SA.nueva }))).rejects.toMatchObject({ statusCode: 402 })
    await lic.activarLicencia({ agenciaId: AG.nueva, referencia: 'cs_x', importe: 97 })
    await expect(validateAuth(await pet({ sub: SA.nueva }))).resolves.toMatchObject({ agenciaId: AG.nueva })
  })
})

// ── Trae tu clave ───────────────────────────────────────────────────────────
describe('claveParaLlamar', () => {
  const HELM = ENV.AGENTS_ANTHROPIC_KEY
  const en = (ctx, fn) => enContexto(ctx, fn)

  it('la clave propia de un perfil va tal cual; sin contexto (scripts), la de HELM', async () => {
    expect(await lic.claveParaLlamar('sk-ant-del-perfil')).toBe('sk-ant-del-perfil')
    expect(await lic.claveParaLlamar(HELM)).toBe(HELM)
  })

  it('la de HELM se cambia por la de la agencia del perfil (por contexto o por clientId)', async () => {
    expect(await en({ clientId: PERFIL.pagada }, () => lic.claveParaLlamar(HELM))).toBe('sk-ant-de-la-agencia')
    expect(await en({ agenciaId: AG.pagada }, () => lic.claveParaLlamar(HELM))).toBe('sk-ant-de-la-agencia')
    // El clientId de la llamada manda sobre el contexto (el setter de Instagram llega por un webhook).
    expect(await en({ agenciaId: AG.casa }, () => lic.claveParaLlamar(HELM, { clientId: PERFIL.pagada }))).toBe('sk-ant-de-la-agencia')
  })

  it('la casa sin clave propia sigue con la de HELM; con la suya, la suya', async () => {
    expect(await en({ clientId: PERFIL.casa }, () => lic.claveParaLlamar(HELM))).toBe(HELM)
    db.t.agencia_ia.push({ agencia_id: AG.casa, api_key: 'sk-ant-de-la-casa', model: null, last4: 'casa' })
    lic.olvidarAgencia(AG.casa)
    expect(await en({ clientId: PERFIL.casa }, () => lic.claveParaLlamar(HELM))).toBe('sk-ant-de-la-casa')
  })

  it('sin licencia, 402; con licencia y sin clave, 412 con dónde ponerla', async () => {
    await expect(en({ clientId: PERFIL.caducada }, () => lic.claveParaLlamar(HELM))).rejects.toMatchObject({ statusCode: 402, codigo: 'licencia' })
    await lic.activarLicencia({ agenciaId: AG.nueva, origen: 'manual', meses: 12 })
    await expect(en({ clientId: PERFIL.nueva }, () => lic.claveParaLlamar(HELM))).rejects.toMatchObject({ statusCode: 412, codigo: 'sin_clave_claude', message: expect.stringMatching(/Perfiles → Agencia/) })
  })

  it('si la base no contesta, no llama a cuenta de HELM: 503', async () => {
    db.falla = 'agencias'
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(en({ clientId: PERFIL.pagada }, () => lic.claveParaLlamar(HELM))).rejects.toMatchObject({ statusCode: 503 })
    log.mockRestore()
  })

  it('iaDeAgencia (para el chat): la clave y el modelo de la agencia, solo con licencia', async () => {
    expect(await lic.iaDeAgencia(PERFIL.pagada)).toEqual({ apiKey: 'sk-ant-de-la-agencia', model: 'claude-sonnet-5' })
    db.t.agencia_ia.push({ agencia_id: AG.caducada, api_key: 'sk-ant-caducada', model: null, last4: 'cada' })
    expect(await lic.iaDeAgencia(PERFIL.caducada)).toBeNull()
    expect(await lic.iaDeAgencia(PERFIL.casa)).toBeNull()
  })
})

describe('activarLicencia', () => {
  it('un año desde hoy; renovar antes de tiempo empieza cuando acaba la que tiene; el mismo pago, una vez', async () => {
    const a = await lic.activarLicencia({ agenciaId: AG.nueva, referencia: 'cs_1', importe: 97 })
    expect(a.nueva).toBe(true)
    expect(Math.round((Date.parse(a.venceAt) - Date.now()) / DIA)).toBeGreaterThanOrEqual(364)
    const otra = await lic.activarLicencia({ agenciaId: AG.nueva, referencia: 'cs_1', importe: 97 })
    expect(otra).toMatchObject({ nueva: false, venceAt: a.venceAt })
    const renueva = await lic.activarLicencia({ agenciaId: AG.nueva, referencia: 'cs_2', importe: 97 })
    expect(renueva.empiezaAt).toBe(a.venceAt)
  })
})

// ── El pago (api/licencia.js) ───────────────────────────────────────────────
let sesiones
beforeEach(() => {
  sesiones = { rk_live_helm: {}, sk_live_compartida: {} }
  global.fetch = vi.fn(async (url, opts) => {
    const clave = opts.headers.Authorization.slice(7)
    if (opts.method === 'POST') return { ok: true, status: 200, json: async () => ({ id: 'cs_nueva', url: 'https://checkout.stripe.test/cs_nueva' }) }
    const s = sesiones[clave]?.[url.split('/').pop()]
    if (!s) return { ok: false, status: 404, json: async () => ({ error: { code: 'resource_missing', message: 'No such checkout.session' } }) }
    return { ok: true, status: 200, json: async () => s }
  })
})
const sesion = (extra = {}) => ({ id: 'cs_pago_1', payment_status: 'paid', amount_total: 9700, amount_subtotal: 9700, metadata: { helm: 'licencia', agencia_id: AG.nueva }, customer_details: { email: 'pepa@nueva.es' }, ...extra })
async function aviso(event, secreto = 'whsec_helm') {
  const cuerpo = Buffer.from(JSON.stringify(event))
  const t = Math.floor(Date.now() / 1000)
  const firma = crypto.createHmac('sha256', secreto).update(`${t}.${cuerpo}`).digest('hex')
  const res = respuesta()
  await creditos({ method: 'POST', query: { action: 'webhook' }, headers: { 'stripe-signature': `t=${t},v1=${firma}` }, body: event, rawBody: cuerpo, socket: {} }, res)
  return res
}
const evento = (obj, type = 'checkout.session.completed') => ({ type, data: { object: obj } })

describe('estado', () => {
  it('sin licencia: quien administra la ve (con precio y pagos) aunque no pueda entrar a nada más', async () => {
    const r = await llama(licencia, { sub: SA.nueva, action: 'estado' })
    expect(r.statusCode).toBe(200)
    expect(r.body).toMatchObject({
      administra: true, agencia: { id: AG.nueva, nombre: 'Nueva' },
      licencia: { valida: false, precio: 97, pagosActivos: true }, ia: { clave: false, deHelm: false },
    })
    // La anulada sale en el historial, como anulada.
    expect(r.body.licencia.historial).toEqual([expect.objectContaining({ estado: 'anulada' })])
  })

  it('con licencia y clave: la fecha, los días y los 4 últimos de la clave (nunca la clave)', async () => {
    const r = await llama(licencia, { sub: SA.pagada, action: 'estado' })
    expect(r.body.licencia).toMatchObject({ valida: true, dias: 65 })
    expect(r.body.ia).toMatchObject({ clave: true, last4: 'ncia', model: 'claude-sonnet-5' })
    expect(JSON.stringify(r.body)).not.toContain('sk-ant-de-la-agencia')
  })

  it('el equipo de un perfil: solo si vale', async () => {
    const r = await llama(licencia, { cliente: { sub: 't-nueva', clientId: PERFIL.nueva }, action: 'estado' })
    expect(r.body).toEqual({ administra: false, licencia: { valida: false } })
  })

  it('la casa: vale, no paga, y trabaja con la clave de HELM', async () => {
    const r = await llama(licencia, { sub: SA.casa, action: 'estado' })
    expect(r.body.licencia).toMatchObject({ valida: true, sinCobro: true })
    expect(r.body.ia.deHelm).toBe(true)
  })
})

describe('pagar', () => {
  const formulario = () => Object.fromEntries(new URLSearchParams(global.fetch.mock.calls[0][1].body))

  it('sin licencia se puede pagar: 97 € con factura e IVA dentro, por la cuenta de HELM y con la marca', async () => {
    const r = await llama(licencia, { sub: SA.nueva, method: 'POST', action: 'pagar', body: {} })
    expect([r.statusCode, r.body]).toEqual([200, { url: 'https://checkout.stripe.test/cs_nueva' }])
    expect(global.fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer rk_live_helm')
    const f = formulario()
    expect(f).toMatchObject({
      mode: 'payment', 'metadata[helm]': 'licencia', 'metadata[agencia_id]': AG.nueva,
      'line_items[0][price_data][unit_amount]': '9700', 'line_items[0][price_data][currency]': 'eur',
      'invoice_creation[enabled]': 'true', 'line_items[0][price_data][tax_behavior]': 'inclusive',
      customer_email: `${SA.nueva}@x.es`,
    })
    expect(f.success_url).toMatch(/\/admin\?licencia=ok&session_id=\{CHECKOUT_SESSION_ID\}$/)
  })

  it('el precio sale de HELM_LICENCIA_EUR', async () => {
    process.env.HELM_LICENCIA_EUR = '120'
    await llama(licencia, { sub: SA.nueva, method: 'POST', action: 'pagar', body: {} })
    expect(formulario()['line_items[0][price_data][unit_amount]']).toBe('12000')
    delete process.env.HELM_LICENCIA_EUR
  })

  it('sin la cuenta de HELM, 503 (nunca la compartida); la casa no paga', async () => {
    delete process.env.HELM_CREDITOS_STRIPE_KEY
    const r = await llama(licencia, { sub: SA.nueva, method: 'POST', action: 'pagar', body: {} })
    expect(r.statusCode).toBe(503)
    expect(global.fetch).not.toHaveBeenCalled()
    process.env.HELM_CREDITOS_STRIPE_KEY = ENV.HELM_CREDITOS_STRIPE_KEY
    expect((await llama(licencia, { sub: SA.casa, method: 'POST', action: 'pagar', body: {} })).statusCode).toBe(400)
  })

  it('el equipo de un perfil no paga (403)', async () => {
    db.t.licenses.push({ id: 'l9', agencia_id: AG.nueva, estado: 'activa', vence_at: dentroDe(10) })
    const r = await llama(licencia, { cliente: { sub: 't-nueva', clientId: PERFIL.nueva }, method: 'POST', action: 'pagar', body: {} })
    expect(r.statusCode).toBe(403)
  })

  it('camposFactura: Stripe Tax solo si se activa, o un tipo fijo válido', () => {
    expect(camposFactura({})['automatic_tax[enabled]']).toBeUndefined()
    expect(camposFactura({ HELM_CREDITOS_STRIPE_TAX: '1' })['automatic_tax[enabled]']).toBe('true')
    expect(camposFactura({ HELM_CREDITOS_TAX_RATE: 'txr_123abc' })['line_items[0][tax_rates][0]']).toBe('txr_123abc')
    expect(camposFactura({ HELM_CREDITOS_TAX_RATE: 'txr_1&x=2' })['line_items[0][tax_rates][0]']).toBeUndefined()
  })
})

describe('confirmar y webhook', () => {
  it('al volver de Stripe: se le pregunta a Stripe y se activa un año, una sola vez aunque llegue también el webhook', async () => {
    sesiones.rk_live_helm.cs_pago_1 = sesion()
    const r = await llama(licencia, { sub: SA.nueva, method: 'POST', action: 'confirmar', body: { sessionId: 'cs_pago_1' } })
    expect(r.body).toMatchObject({ pagado: true, venceAt: expect.any(String) })
    expect((await aviso(evento(sesion()))).statusCode).toBe(200)
    const suyas = db.t.licenses.filter(l => l.agencia_id === AG.nueva && l.estado === 'activa')
    expect(suyas).toEqual([expect.objectContaining({ referencia: 'cs_pago_1', importe_eur: 97, origen: 'stripe' })])
    // Y ya entra.
    await expect(validateAuth(await pet({ sub: SA.nueva }))).resolves.toMatchObject({ agenciaId: AG.nueva })
  })

  it('no pagada, sin la marca de licencia o de otra agencia: nada', async () => {
    sesiones.rk_live_helm.cs_a = sesion({ id: 'cs_a', payment_status: 'unpaid' })
    sesiones.rk_live_helm.cs_b = sesion({ id: 'cs_b', metadata: { helm: 'creditos', agencia_id: AG.nueva } })
    sesiones.rk_live_helm.cs_c = sesion({ id: 'cs_c', metadata: { helm: 'licencia', agencia_id: AG.pagada } })
    for (const id of ['cs_a', 'cs_b']) {
      const r = await llama(licencia, { sub: SA.nueva, method: 'POST', action: 'confirmar', body: { sessionId: id } })
      expect(r.body.pagado).toBe(false)
    }
    // La de otra agencia se activa para ESA agencia (la pagó), pero aquí no se cuenta nada.
    const r = await llama(licencia, { sub: SA.nueva, method: 'POST', action: 'confirmar', body: { sessionId: 'cs_c' } })
    expect(r.body.pagado).toBe(false)
    expect(db.t.licenses.filter(l => l.agencia_id === AG.nueva && l.estado === 'activa')).toEqual([])
  })

  it('una sesión inválida: 400 sin preguntar a Stripe', async () => {
    const r = await llama(licencia, { sub: SA.nueva, method: 'POST', action: 'confirmar', body: { sessionId: '../../x' } })
    expect(r.statusCode).toBe(400)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('webhook: firma mala, 400; pagos que no son licencias, 200 sin tocar nada', async () => {
    expect((await aviso(evento(sesion()), 'whsec_otro')).statusCode).toBe(400)
    const otro = await aviso(evento({ id: 'cs_otro', payment_status: 'paid', metadata: {} }), 'whsec_compartida')
    expect(otro.statusCode).toBe(200)
    expect(global.fetch).not.toHaveBeenCalled()
    expect(db.rpc).toEqual([])
  })

  it('webhook: la sesión se le pide a la cuenta que avisa, y el pago SEPA (async) también activa', async () => {
    sesiones.rk_live_helm.cs_pago_1 = sesion()
    expect((await aviso(evento(sesion(), 'checkout.session.async_payment_succeeded'))).statusCode).toBe(200)
    expect(global.fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer rk_live_helm')
    expect(db.t.licenses.some(l => l.referencia === 'cs_pago_1')).toBe(true)
  })
})

describe('la clave de Claude de la agencia', () => {
  it('se comprueba con Anthropic antes de guardarla; se guarda solo con sus 4 últimos a la vista', async () => {
    const r = await llama(licencia, { sub: SA.pagada, method: 'POST', action: 'clave', body: { apiKey: 'sk-ant-nueva-1234', model: 'claude-haiku-4-5' } })
    expect(r.body).toEqual({ clave: true, last4: '1234', model: 'claude-haiku-4-5' })
    expect(verificarClave).toHaveBeenCalledWith('sk-ant-nueva-1234', 'claude-haiku-4-5')
    expect(db.t.agencia_ia.find(f => f.agencia_id === AG.pagada)).toMatchObject({ api_key: 'sk-ant-nueva-1234', last4: '1234' })
  })

  it('si Anthropic dice que no vale (401), 400: un 401 cerraría la sesión del panel', async () => {
    verificarClave.mockRejectedValueOnce(Object.assign(new Error('La clave de Anthropic no es válida o fue revocada.'), { statusCode: 401 }))
    const r = await llama(licencia, { sub: SA.pagada, method: 'POST', action: 'clave', body: { apiKey: 'sk-ant-mala' } })
    expect(r.statusCode).toBe(400)
    expect(db.t.agencia_ia.find(f => f.agencia_id === AG.pagada).api_key).toBe('sk-ant-de-la-agencia')
  })

  it('sin licencia no se puede poner (402); quitarla la borra', async () => {
    const r = await llama(licencia, { sub: SA.nueva, method: 'POST', action: 'clave', body: { apiKey: 'sk-ant-x' } })
    expect(r.statusCode).toBe(402)
    const q = await llama(licencia, { sub: SA.pagada, method: 'POST', action: 'quitar-clave', body: {} })
    expect(q.body).toEqual({ clave: false })
    expect(db.t.agencia_ia.find(f => f.agencia_id === AG.pagada)).toBeUndefined()
  })
})

describe('el estado de la licencia en la plataforma', () => {
  it('casa, activa (con los días), caducada o sin', async () => {
    const { estadoDeLicencia } = await import('../api/plataforma.js')
    expect(estadoDeLicencia({ sinCobro: true })).toMatchObject({ estado: 'casa' })
    expect(estadoDeLicencia({ venceAt: null })).toMatchObject({ estado: 'sin' })
    expect(estadoDeLicencia({ venceAt: dentroDe(10) })).toMatchObject({ estado: 'activa', dias: 10 })
    expect(estadoDeLicencia({ venceAt: dentroDe(-1) })).toMatchObject({ estado: 'caducada' })
  })
})
