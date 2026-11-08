// Licencia anual + trae-tu-clave (desde el 2026-11-08):
//   · api/_lib/licencia.js: vigente si alguna fila vence después de ahora; la
//     de la casa (sin_cobro) no la necesita; extender va por la RPC.
//   · api/_lib/auth.js: sin licencia vigente, validateAuth contesta 402
//     `sin_licencia` (no 401); lo que sirve para pagarla pasa con sinLicencia;
//     la plataforma entra siempre; un acceso de cliente, por la agencia de su
//     perfil; si la base no contesta, se deja pasar.
//   · api/_lib/claves-agencia.js: con la clave de HELM, una petición de una
//     agencia va con la clave de ESA agencia (o 409 sin clave, 402 sin
//     licencia); la casa y lo que no es de nadie, con la de HELM. El token de
//     Replicate, igual.
//   · api/_lib/llm.js: el perfil sin clave propia usa la de su agencia; sin
//     ella, `sin_ia` y llmChat lanza el aviso; la casa, el modelo local.
// Sin red ni base: Supabase va en memoria.
import { describe, it, expect, vi, beforeEach } from 'vitest'

process.env.JWT_SECRET = 'secreto-de-prueba-para-las-licencias-0123456789abcdef'
process.env.AGENTS_ANTHROPIC_KEY = 'sk-ant-de-helm'
process.env.REPLICATE_API_TOKEN = 'r8_de_helm'

const AG = { casa: 'a0000000-0000-4000-8000-000000000001', pagada: 'a0000000-0000-4000-8000-000000000002', caducada: 'a0000000-0000-4000-8000-000000000003', nueva: 'a0000000-0000-4000-8000-000000000004' }
const PERFIL = { casa: 'c0000000-0000-4000-8000-000000000001', pagada: 'c0000000-0000-4000-8000-000000000002', caducada: 'c0000000-0000-4000-8000-000000000003', nueva: 'c0000000-0000-4000-8000-000000000004', propia: 'c0000000-0000-4000-8000-000000000005' }
const SA = { casa: 'b0000000-0000-4000-8000-000000000001', pagada: 'b0000000-0000-4000-8000-000000000002', caducada: 'b0000000-0000-4000-8000-000000000003', plataforma: 'b0000000-0000-4000-8000-000000000004' }
const DIA = 86_400_000

const h = vi.hoisted(() => ({ db: {}, falla: null, rpc: null }))
function consulta(tabla) {
  const filtros = []
  let orden = null
  let limite = null
  const filas = () => {
    if (h.falla === tabla) return { data: null, error: { message: `la base no contesta (${tabla})` } }
    let r = (h.db[tabla] || []).filter(f => filtros.every(fn => fn(f)))
    if (orden) r = [...r].sort((a, b) => (orden.asc ? 1 : -1) * String(a[orden.col]).localeCompare(String(b[orden.col])))
    if (limite != null) r = r.slice(0, limite)
    return { data: structuredClone(r), error: null }
  }
  const q = {
    select: () => q,
    update: () => q,
    eq: (c, v) => { filtros.push(f => String(f[c]) === String(v)); return q },
    is: (c, v) => { filtros.push(f => (v === null ? f[c] == null : f[c] === v)); return q },
    order: (col, o = {}) => { orden = { col, asc: o.ascending !== false }; return q },
    limit: (n) => { limite = n; return q },
    maybeSingle: async () => { const r = filas(); return r.error ? r : { data: r.data[0] || null, error: null } },
    then: (ok, ko) => Promise.resolve(filas()).then(ok, ko),
  }
  return q
}
vi.mock('../api/lib/supabase.js', () => ({ supabase: { from: (t) => consulta(t), rpc: (...a) => h.rpc(...a) } }))

const licencia = await import('../api/_lib/licencia.js')
const { validateAuth, signJwt } = await import('../api/_lib/auth.js')
const claves = await import('../api/_lib/claves-agencia.js')
const { enContexto } = await import('../api/_lib/contexto.js')
const llm = await import('../api/_lib/llm.js')
const { olvidarPerfil } = await import('../api/_lib/access.js')
const { pasarela } = await import('../api/_lib/pasarela.js')
const { default: mcp } = await import('../api/mcp/[token].js')
const { createHash } = await import('node:crypto')

const enDias = (d) => new Date(Date.now() + d * DIA).toISOString()
function reinicia() {
  h.falla = null
  h.rpc = vi.fn(async () => ({ data: enDias(365), error: null }))
  h.db = {
    agencias: [
      { id: AG.casa, sin_cobro: true }, { id: AG.pagada, sin_cobro: false },
      { id: AG.caducada, sin_cobro: false }, { id: AG.nueva, sin_cobro: false },
    ],
    licenses: [
      { agencia_id: AG.pagada, vence_at: enDias(-400) },
      { agencia_id: AG.pagada, vence_at: enDias(200) },
      { agencia_id: AG.caducada, vence_at: enDias(-3) },
    ],
    clients: [
      { id: PERFIL.casa, agencia_id: AG.casa }, { id: PERFIL.pagada, agencia_id: AG.pagada },
      { id: PERFIL.caducada, agencia_id: AG.caducada }, { id: PERFIL.nueva, agencia_id: AG.nueva },
      { id: PERFIL.propia, agencia_id: AG.pagada },
    ],
    superadmins: [
      { id: SA.casa, active: true, agencia_id: AG.casa, plataforma: false },
      { id: SA.pagada, active: true, agencia_id: AG.pagada, plataforma: false },
      { id: SA.caducada, active: true, agencia_id: AG.caducada, plataforma: false },
      { id: SA.plataforma, active: true, agencia_id: AG.casa, plataforma: true },
    ],
    team: [{ id: 'acceso-caducada', active: true, role: 'member', client_id: PERFIL.caducada }],
    agencia_claves: [{ agencia_id: AG.pagada, anthropic_key: 'sk-ant-de-la-pagada', anthropic_model: 'claude-sonnet-5', replicate_token: 'r8_de_la_pagada' }],
    user_integrations: [{ id: 'ia-1', client_id: PERFIL.propia, service: 'anthropic', member_id: null, enabled: true, config: { apiKey: 'sk-ant-del-perfil', model: 'claude-opus-5' } }],
  }
  licencia.olvidarLicencia()
  claves.olvidarClavesAgencia()
  llm.olvidarProveedor()
  for (const id of Object.values(PERFIL)) olvidarPerfil(id)
}
beforeEach(reinicia)

const conToken = async (payload) => ({ headers: { authorization: `Bearer ${await signJwt(payload)}` } })
const admin = (sub) => conToken({ sub, superadmin: true, role: 'superadmin', email: `${sub}@x.test` })

describe('licenciaDe y exigirLicencia', () => {
  it('vigente por el último vencimiento; caducada; sin filas; la casa, exenta', async () => {
    expect(await licencia.licenciaDe(AG.pagada)).toMatchObject({ exenta: false, vigente: true })
    expect((await licencia.licenciaDe(AG.pagada)).venceAt).toBe(h.db.licenses[1].vence_at)
    expect(await licencia.licenciaDe(AG.caducada)).toMatchObject({ exenta: false, vigente: false, venceAt: h.db.licenses[2].vence_at })
    expect(await licencia.licenciaDe(AG.nueva)).toEqual({ exenta: false, vigente: false, venceAt: null })
    expect(await licencia.licenciaDe(AG.casa)).toMatchObject({ exenta: true, vigente: true })
    expect(await licencia.licenciaDe(null)).toMatchObject({ exenta: true, vigente: true })
  })

  it('exigirLicencia: 402 con codigo sin_licencia, que dice si caducó o si nunca la tuvo', async () => {
    await expect(licencia.exigirLicencia(AG.pagada)).resolves.toBeUndefined()
    await expect(licencia.exigirLicencia(AG.casa)).resolves.toBeUndefined()
    await expect(licencia.exigirLicencia(AG.caducada)).rejects.toMatchObject({ statusCode: 402, codigo: 'sin_licencia', message: expect.stringMatching(/ha caducado/) })
    await expect(licencia.exigirLicencia(AG.nueva)).rejects.toMatchObject({ statusCode: 402, message: expect.stringMatching(/aún no tiene licencia/) })
  })

  it('si la base no contesta, deja pasar (y lo dice en el log)', async () => {
    h.falla = 'licenses'
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(licencia.exigirLicencia(AG.nueva)).resolves.toBeUndefined()
    expect(log).toHaveBeenCalled()
    log.mockRestore()
  })

  it('se recuerda un minuto; extender la olvida y pasa a la RPC lo que toca', async () => {
    expect((await licencia.licenciaDe(AG.nueva)).vigente).toBe(false)
    h.db.licenses.push({ agencia_id: AG.nueva, vence_at: enDias(365) })
    expect((await licencia.licenciaDe(AG.nueva)).vigente).toBe(false)
    const vence = await licencia.extenderLicencia(AG.nueva, { origen: 'stripe', referencia: 'cs_1', euros: 97, nota: 'Pago', por: 'a@b.c' })
    expect(vence).toBeTruthy()
    expect(h.rpc).toHaveBeenCalledWith('extender_licencia', { p_agencia: AG.nueva, p_meses: 12, p_origen: 'stripe', p_referencia: 'cs_1', p_euros: 97, p_nota: 'Pago', p_por: 'a@b.c' })
    expect((await licencia.licenciaDe(AG.nueva)).vigente).toBe(true)
    // Una referencia ya apuntada: la RPC devuelve null y se dice null.
    h.rpc.mockResolvedValueOnce({ data: null, error: null })
    expect(await licencia.extenderLicencia(AG.nueva, { origen: 'stripe', referencia: 'cs_1' })).toBeNull()
  })

  it('el precio sale de HELM_LICENCIA_EUR (97 por defecto, y lo raro también 97)', () => {
    delete process.env.HELM_LICENCIA_EUR
    expect(licencia.precioLicencia()).toBe(97)
    process.env.HELM_LICENCIA_EUR = '119.9'
    expect(licencia.precioLicencia()).toBe(119.9)
    process.env.HELM_LICENCIA_EUR = 'gratis'
    expect(licencia.precioLicencia()).toBe(97)
    delete process.env.HELM_LICENCIA_EUR
  })
})

describe('validateAuth: sin licencia, la agencia no entra', () => {
  it('el administrador de una agencia sin licencia: 402 sin_licencia, no 401', async () => {
    await expect(validateAuth(await admin(SA.caducada))).rejects.toMatchObject({ statusCode: 402, codigo: 'sin_licencia' })
    await expect(validateAuth(await admin(SA.pagada))).resolves.toMatchObject({ agenciaId: AG.pagada })
    await expect(validateAuth(await admin(SA.casa))).resolves.toMatchObject({ agenciaId: AG.casa })
  })

  it('con sinLicencia (para pagarla) pasa; la plataforma entra siempre', async () => {
    await expect(validateAuth(await admin(SA.caducada), { sinLicencia: true })).resolves.toMatchObject({ agenciaId: AG.caducada })
    await expect(validateAuth(await admin(SA.plataforma))).resolves.toMatchObject({ plataforma: true })
  })

  it('un acceso de cliente, por la agencia de SU perfil', async () => {
    const req = await conToken({ sub: 'acceso-caducada', role: 'client', clientId: PERFIL.caducada })
    await expect(validateAuth(req)).rejects.toMatchObject({ statusCode: 402, codigo: 'sin_licencia' })
    await expect(validateAuth(req, { sinLicencia: true })).resolves.toMatchObject({ clientId: PERFIL.caducada })
  })

  it('un token malo sigue siendo 401, aunque la agencia no tenga licencia', async () => {
    await expect(validateAuth({ headers: { authorization: 'Bearer x.y.z' } })).rejects.toMatchObject({ statusCode: 401 })
  })
})

describe('claveParaLlamada (trae-tu-clave)', () => {
  it('una clave que no es la de HELM (la de un perfil) pasa tal cual, sin mirar nada', async () => {
    h.falla = 'agencias'
    expect(await claves.claveParaLlamada('sk-ant-del-perfil')).toBe('sk-ant-del-perfil')
  })

  it('con la de HELM: sin contexto o de la casa, la de HELM; de una agencia, la SUYA', async () => {
    expect(await claves.claveParaLlamada('sk-ant-de-helm')).toBe('sk-ant-de-helm')
    await enContexto({ clientId: PERFIL.casa }, async () => expect(await claves.claveParaLlamada('sk-ant-de-helm')).toBe('sk-ant-de-helm'))
    await enContexto({ clientId: PERFIL.pagada }, async () => expect(await claves.claveParaLlamada('sk-ant-de-helm')).toBe('sk-ant-de-la-pagada'))
    await enContexto({ agenciaId: AG.pagada }, async () => expect(await claves.claveParaLlamada('sk-ant-de-helm')).toBe('sk-ant-de-la-pagada'))
    // Sin clave en la llamada (HELM sin configurar), igual.
    await enContexto({ agenciaId: AG.pagada }, async () => expect(await claves.claveParaLlamada('')).toBe('sk-ant-de-la-pagada'))
  })

  it('un perfil de la agencia con su propia clave (Ajustes → IA): la suya', async () => {
    await enContexto({ clientId: PERFIL.propia }, async () => expect(await claves.claveParaLlamada('sk-ant-de-helm')).toBe('sk-ant-del-perfil'))
  })

  it('una agencia sin clave: 409 sin_clave_ia; sin licencia: 402. Nunca la de HELM', async () => {
    h.db.licenses.push({ agencia_id: AG.nueva, vence_at: enDias(30) })
    await enContexto({ agenciaId: AG.nueva }, async () => {
      await expect(claves.claveParaLlamada('sk-ant-de-helm')).rejects.toMatchObject({ statusCode: 409, codigo: 'sin_clave_ia', message: expect.stringMatching(/Licencia y claves/) })
    })
    await enContexto({ clientId: PERFIL.caducada }, async () => {
      await expect(claves.claveParaLlamada('sk-ant-de-helm')).rejects.toMatchObject({ statusCode: 402, codigo: 'sin_licencia' })
    })
  })

  it('el token de Replicate: el de la agencia; el de HELM solo para la casa y sin agencia; sin licencia, nada', async () => {
    expect(await claves.tokenImagenDe(PERFIL.pagada)).toBe('r8_de_la_pagada')
    expect(await claves.tokenImagenDe(PERFIL.casa)).toBe('r8_de_helm')
    expect(await claves.tokenImagenDe(null)).toBe('r8_de_helm')
    expect(await claves.tokenImagenDe(PERFIL.caducada)).toBeNull()
    h.db.licenses.push({ agencia_id: AG.nueva, vence_at: enDias(30) })
    expect(await claves.tokenImagenDe(PERFIL.nueva)).toBeNull()
  })

  it('iaDelPerfil: la propia del perfil antes que la de la agencia; la casa; sin nada, 409', async () => {
    expect(await claves.iaDelPerfil(PERFIL.propia)).toMatchObject({ casa: false, apiKey: 'sk-ant-del-perfil', origen: 'perfil' })
    expect(await claves.iaDelPerfil(PERFIL.pagada)).toMatchObject({ casa: false, apiKey: 'sk-ant-de-la-pagada', origen: 'agencia' })
    expect(await claves.iaDelPerfil(PERFIL.casa)).toEqual({ casa: true })
    h.db.licenses.push({ agencia_id: AG.nueva, vence_at: enDias(30) })
    await expect(claves.iaDelPerfil(PERFIL.nueva)).rejects.toMatchObject({ statusCode: 409, codigo: 'sin_clave_ia' })
    await expect(claves.iaDelPerfil(PERFIL.caducada)).rejects.toMatchObject({ statusCode: 402 })
  })

  it('estadoClaves nunca devuelve la clave: solo si está, sus 4 últimas y el modelo', async () => {
    const e = await claves.estadoClaves(AG.pagada)
    expect(e).toEqual({ anthropic: { configurada: true, last4: 'gada', modelo: 'claude-sonnet-5' }, replicate: { configurada: true, last4: 'gada' } })
    expect(JSON.stringify(e)).not.toContain('sk-ant')
    expect(await claves.estadoClaves(AG.nueva)).toEqual({ anthropic: { configurada: false, last4: null, modelo: null }, replicate: { configurada: false, last4: null } })
  })
})

describe('proveedorDe: qué IA atiende a cada perfil', () => {
  it('sin clave propia, la de su agencia; con clave propia, la suya; la casa, el local', async () => {
    expect(await llm.proveedorDe(PERFIL.pagada)).toMatchObject({ tipo: 'claude', apiKey: 'sk-ant-de-la-pagada', model: 'claude-sonnet-5', origen: 'agencia' })
    expect(await llm.proveedorDe(PERFIL.propia)).toMatchObject({ tipo: 'claude', apiKey: 'sk-ant-del-perfil', origen: 'perfil' })
    expect(await llm.proveedorDe(PERFIL.casa)).toMatchObject({ tipo: 'local' })
  })

  it('una agencia sin clave: sin_ia, y llmChat lanza el aviso (409) sin llamar a nadie', async () => {
    h.db.licenses.push({ agencia_id: AG.nueva, vence_at: enDias(30) })
    expect(await llm.proveedorDe(PERFIL.nueva)).toMatchObject({ tipo: 'sin_ia' })
    await expect(llm.llmChat({ clientId: PERFIL.nueva, system: 's', messages: [{ role: 'user', content: 'hola' }] }))
      .rejects.toMatchObject({ statusCode: 409, codigo: 'sin_clave_ia' })
    expect(await llm.llmHealth(PERFIL.nueva)).toMatchObject({ ok: false, proveedor: 'sin_ia' })
  })

  it('sin licencia, ni con la clave del perfil: 402', async () => {
    h.db.user_integrations.push({ id: 'ia-2', client_id: PERFIL.caducada, service: 'anthropic', member_id: null, enabled: true, config: { apiKey: 'sk-ant-x' } })
    expect(await llm.proveedorDe(PERFIL.caducada)).toMatchObject({ tipo: 'sin_ia' })
    await expect(llm.llmChat({ clientId: PERFIL.caducada, system: 's', messages: [{ role: 'user', content: 'hola' }] }))
      .rejects.toMatchObject({ statusCode: 402, codigo: 'sin_licencia' })
  })

  it('en cuanto la agencia pone su clave, vale (sin_ia no se recuerda)', async () => {
    h.db.licenses.push({ agencia_id: AG.nueva, vence_at: enDias(30) })
    expect((await llm.proveedorDe(PERFIL.nueva)).tipo).toBe('sin_ia')
    h.db.agencia_claves.push({ agencia_id: AG.nueva, anthropic_key: 'sk-ant-de-la-nueva', anthropic_model: null })
    claves.olvidarClavesAgencia(AG.nueva)
    expect(await llm.proveedorDe(PERFIL.nueva)).toMatchObject({ tipo: 'claude', apiKey: 'sk-ant-de-la-nueva', origen: 'agencia' })
  })
})

describe('las otras puertas: /api/db y el conector de Claude', () => {
  it('/api/db: sin licencia, 402 con el aviso (no «tu sesión ha caducado»)', async () => {
    const req = { method: 'GET', url: '/api/db/rest/v1/crm_contacts', ...(await admin(SA.caducada)) }
    const res = { statusCode: 0, cuerpo: '', headers: {}, setHeader(k, v) { this.headers[k] = v }, end(b) { this.cuerpo = String(b || '') } }
    await pasarela(req, res)
    expect(res.statusCode).toBe(402)
    expect(JSON.parse(res.cuerpo).error).toMatch(/ha caducado/)
  })

  it('el conector de una agencia sin licencia: conecta, pero cada herramienta contesta el aviso', async () => {
    const token = 'x'.repeat(40)
    h.db.agent_mcp_tokens = [{ token_hash: createHash('sha256').update(token).digest('hex'), client_id: null, agencia_id: AG.caducada, clients: null, agencias: { nombre: 'Caducada' } }]
    const llama = async (body) => {
      const res = { statusCode: 0, body: null, status(c) { this.statusCode = c; return this }, json(b) { this.body = b; return this }, setHeader() { return this }, end() { return this } }
      await mcp({ method: 'POST', query: { token }, headers: { 'x-forwarded-for': '10.1.2.3' }, body, socket: {} }, res)
      return res
    }
    const ini = await llama({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })
    expect(ini.body.result.serverInfo).toBeTruthy()
    const r = await llama({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'perfiles', arguments: {} } })
    expect(r.body.result).toMatchObject({ isError: true, content: [{ type: 'text', text: expect.stringMatching(/licencia de HELM .*ha caducado/) }] })
  })
})
