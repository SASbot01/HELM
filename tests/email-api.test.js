// Email marketing · el endpoint del panel (api/email-marketing.js), con base
// en memoria y Resend simulado (nada sale a la red). Quién ve la sección (la
// escalera del menú) y quién manda (guardar la clave, lanzar, quitar una baja):
// un closer al que se le enseña la sección o un miembro sin oficio la ven, pero
// no tocan nada. La clave de Resend se prueba antes de guardarla y nunca vuelve
// al navegador: solo sus cuatro últimos. Lanzar exige confirmar el número
// EXACTO de personas, y lo lanzado ya no se edita (se duplica).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

process.env.JWT_SECRET = 'secreto-de-prueba-de-la-api-de-email-0123456789'

const h = vi.hoisted(() => ({ b: null, auth: null, auditoria: [] }))
vi.mock('../api/lib/supabase.js', async () => {
  const { crearBase } = await import('./ayudas/base-memoria.js')
  let n = 0
  h.b = crearBase({ defectos: { helm_email_destinatarios: () => ({ id: ++n }) } })
  return { supabase: h.b.supabase }
})
vi.mock('../api/_lib/auth.js', () => ({
  applyCors: () => {}, rateLimit: () => ({ ok: true }), getClientIp: () => '1.2.3.4',
  writeAudit: async (a) => { h.auditoria.push(a) }, validateAuth: async () => h.auth,
}))
vi.mock('../api/_lib/access.js', async (original) => ({ ...(await original()), requireProfileAccess: async () => h.auth }))

const { default: handler } = await import('../api/email-marketing.js')
const { _espera, _olvidaRitmo } = await import('../api/_lib/email/resend.js')

const P = 'c0000000-0000-4000-8000-000000000001'
const VENTAS = 'b0000000-0000-4000-8000-000000000001'
const CLAVE = 're_SuperSecreta_123456789_abcd'
const t = () => h.b.tablas

const PROPIETARIO = { role: 'client', clientId: P, userId: 'u-dueno', nivel: 'admin,ceo,director', email: 'dueno@acme.es' }
const ADMIN_AGENCIA = { role: 'superadmin', superadmin: true, agenciaId: 'ag-1', userId: 'sa-1', email: 'agencia@helm.es' }
const CLOSER = { role: 'client', clientId: P, userId: 'u-closer', nivel: 'member', email: 'closer@acme.es' }
const MIEMBRO = { role: 'client', clientId: P, userId: 'u-miembro', nivel: 'member', email: 'miembro@acme.es' }

// Resend simulado: /domains con el dominio verificado y los envíos aceptados.
const resend = { llamadas: [], dominios: [{ name: 'acme.es', status: 'verified' }], claveMala: false }
const resp = (status, cuerpo) => ({ ok: status < 300, status, headers: { get: () => null }, json: async () => cuerpo })
function fetchFalso(url, opts) {
  resend.llamadas.push({ url, metodo: opts.method, auth: opts.headers.Authorization, cuerpo: opts.body ? JSON.parse(opts.body) : null })
  if (resend.claveMala) return resp(401, { name: 'invalid_api_key', message: 'API key is invalid' })
  if (url.endsWith('/domains')) return resp(200, { data: resend.dominios })
  const cuerpo = JSON.parse(opts.body)
  return resp(200, { data: cuerpo.map((_, i) => ({ id: `re_${i}` })) })
}

async function pide(auth, method, action, body, query = {}) {
  h.auth = auth
  const res = { statusCode: 0, body: null, headers: {}, setHeader(k, v) { this.headers[k] = v }, status(c) { this.statusCode = c; return this }, json(b) { this.body = b; return this }, end() { return this } }
  await handler({ method, query: { action, clientId: P, ...query }, body, headers: {} }, res)
  return res
}

const audiencia = { pipelineId: VENTAS, etapas: [] }
const campana = (extra = {}) => ({ nombre: 'Bienvenida', audiencia, mensajes: [{ asunto: 'Hola {{primer_nombre|}}', cuerpo: 'Qué tal, {{nombre|amigo}}.' }, { asunto: 'Segundo', cuerpo: 'Otro', esperaDias: 3 }], ...extra })

async function conAjustes() {
  const r = await pide(PROPIETARIO, 'POST', 'ajustes', { apiKey: CLAVE, remitenteNombre: 'Ana', remitenteEmail: 'hola@acme.es', empresa: 'Acme S.L.', direccion: 'Calle Mayor 1, Lorca' })
  expect(r.statusCode).toBe(200)
  return r
}

beforeEach(() => {
  h.b.vaciar()
  h.auditoria.length = 0
  Object.assign(resend, { llamadas: [], dominios: [{ name: 'acme.es', status: 'verified' }], claveMala: false })
  _olvidaRitmo()
  vi.spyOn(_espera, 'ms').mockImplementation(async () => {})
  vi.stubGlobal('fetch', vi.fn(async (u, o) => fetchFalso(u, o)))
  t().clients = [{ id: P, agencia_id: 'ag-1', name: 'Acme' }]
  t().helm_team = [{ login_id: 'u-closer', client_id: P, role: 'closer' }]
  t().helm_permissions = [{ client_id: P, sections: {}, visible: { closer: ['crm', 'email'] } }]
  t().crm_pipelines = [{ id: VENTAS, client_id: P, name: 'Ventas', is_default: true, created_at: '2026-01-01', stages: [{ key: 'lead', label: 'Lead' }, { key: 'ganado', label: 'Ganado' }] }]
  t().crm_contacts = [
    { id: 'a1', client_id: P, name: 'Ana', email: 'ana@x.es', status: 'lead', pipeline_id: null },
    { id: 'a2', client_id: P, name: 'Bea', email: 'BEA@x.es', status: 'ganado', pipeline_id: VENTAS },
    { id: 'a3', client_id: P, name: 'Bea bis', email: 'bea@x.es', status: 'lead', pipeline_id: VENTAS },
  ]
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('email marketing · quién ve y quién manda', () => {
  it('sin la sección en su rol, ni la ve; con ella (o sin oficio), la ve pero no manda', async () => {
    t().helm_permissions = [{ client_id: P, sections: {}, visible: { closer: ['crm'] } }]
    expect((await pide(CLOSER, 'GET', 'estado')).statusCode).toBe(403)
    t().helm_permissions = [{ client_id: P, sections: {}, visible: { closer: ['crm', 'email'] } }]
    for (const quien of [CLOSER, MIEMBRO]) {
      const r = await pide(quien, 'GET', 'estado')
      expect(r.statusCode).toBe(200)
      expect(r.body.puedeAdministrar).toBe(false)
      expect((await pide(quien, 'GET', 'campanas')).statusCode).toBe(200)
    }
    expect((await pide(PROPIETARIO, 'GET', 'estado')).body.puedeAdministrar).toBe(true)
    expect((await pide(ADMIN_AGENCIA, 'GET', 'estado')).body.puedeAdministrar).toBe(true)
  })

  it('quien no manda no guarda la clave, ni crea, ni lanza, ni prueba, ni quita bajas (403 y sin llamar a Resend)', async () => {
    const intentos = [
      ['POST', 'ajustes', { apiKey: CLAVE, remitenteEmail: 'hola@acme.es' }],
      ['DELETE', 'clave', undefined],
      ['POST', 'guardar', campana()],
      ['POST', 'audiencia', audiencia],
      ['POST', 'lanzar', { id: 'd0000000-0000-4000-8000-000000000001', confirmar: 2 }],
      ['POST', 'prueba', { id: 'd0000000-0000-4000-8000-000000000001' }],
      ['POST', 'pausar', { id: 'd0000000-0000-4000-8000-000000000001' }],
      ['POST', 'quitar-baja', { email: 'ana@x.es', pedido: true }],
      ['POST', 'baja', { email: 'ana@x.es' }],
    ]
    for (const quien of [CLOSER, MIEMBRO]) {
      for (const [m, a, b] of intentos) {
        const r = await pide(quien, m, a, b)
        expect([a, r.statusCode]).toEqual([a, 403])
      }
    }
    expect(resend.llamadas).toHaveLength(0)
    expect(t().user_integrations || []).toHaveLength(0)
    expect(t().helm_email_campanas || []).toHaveLength(0)
  })

  it('la sección apagada en el negocio: nadie entra, tampoco quien manda', async () => {
    t().helm_permissions = [{ client_id: P, sections: { email: false }, visible: {} }]
    expect((await pide(PROPIETARIO, 'GET', 'estado')).statusCode).toBe(403)
  })
})

describe('email marketing · la clave de Resend', () => {
  it('se prueba contra Resend, se guarda en el servidor y al navegador solo vuelven sus cuatro últimos', async () => {
    const r = await conAjustes()
    expect(resend.llamadas[0]).toMatchObject({ url: 'https://api.resend.com/domains', metodo: 'GET', auth: `Bearer ${CLAVE}` })
    expect(r.body.clave).toEqual({ conectada: true, last4: 'abcd' })
    expect(r.body.avisos).toEqual([])
    expect(JSON.stringify(r.body)).not.toContain(CLAVE)
    const estado = await pide(CLOSER, 'GET', 'estado')
    expect(JSON.stringify(estado.body)).not.toContain(CLAVE)
    expect(estado.body.clave.last4).toBe('abcd')
    expect(t().user_integrations[0]).toMatchObject({ client_id: P, service: 'resend', config: { apiKey: CLAVE, last4: 'abcd' } })
    expect(t().helm_email_ajustes[0]).toMatchObject({ remitente_email: 'hola@acme.es', empresa: 'Acme S.L.' })
    expect(estado.body.faltan).toEqual([])
    // Y no está en ninguna otra respuesta del panel.
    for (const a of ['campanas', 'bajas']) expect(JSON.stringify((await pide(PROPIETARIO, 'GET', a)).body)).not.toContain(CLAVE)
  })

  it('una clave que Resend no acepta no se guarda', async () => {
    resend.claveMala = true
    const r = await pide(PROPIETARIO, 'POST', 'ajustes', { apiKey: 're_mala_12345678', remitenteEmail: 'hola@acme.es' })
    expect(r.statusCode).toBe(400)
    expect(r.body.error).toMatch(/Resend no acepta esa clave/)
    expect(t().user_integrations || []).toHaveLength(0)
    expect((await pide(PROPIETARIO, 'POST', 'ajustes', { apiKey: 'sk-otra-cosa' })).statusCode).toBe(400)
  })

  it('avisa si el dominio del remitente no está verificado (pero guarda)', async () => {
    resend.dominios = [{ name: 'acme.es', status: 'pending' }]
    const r = await pide(PROPIETARIO, 'POST', 'ajustes', { apiKey: CLAVE, remitenteEmail: 'hola@acme.es', empresa: 'Acme', direccion: 'Calle 1' })
    expect(r.statusCode).toBe(200)
    expect(r.body.avisos.join(' ')).toMatch(/acme\.es.*aún no está verificado \(pending\)/)
    resend.dominios = []
    const r2 = await pide(PROPIETARIO, 'POST', 'ajustes', { remitenteEmail: 'hola@otra.es', empresa: 'Acme', direccion: 'Calle 1' })
    expect(r2.body.avisos.join(' ')).toMatch(/otra\.es no está en tu cuenta de Resend/)
  })

  it('quitar la clave la borra y pausa lo que esté en marcha', async () => {
    await conAjustes()
    t().helm_email_campanas = [{ id: 'd0000000-0000-4000-8000-000000000009', client_id: P, nombre: 'X', estado: 'activa', audiencia }]
    const r = await pide(PROPIETARIO, 'DELETE', 'clave')
    expect(r.statusCode).toBe(200)
    expect(r.body.clave).toEqual({ conectada: false, last4: null })
    expect(t().user_integrations).toHaveLength(0)
    expect(t().helm_email_campanas[0]).toMatchObject({ estado: 'pausada' })
  })
})

describe('email marketing · campañas', () => {
  it('la audiencia: cuántos y unos de muestra, sin repetir correos', async () => {
    const r = await pide(PROPIETARIO, 'POST', 'audiencia', audiencia)
    expect(r.body).toMatchObject({ total: 2, duplicados: 1, excedido: false })
    expect(r.body.muestra).toEqual([{ nombre: 'Ana', email: 'ana@x.es' }, { nombre: 'Bea', email: 'bea@x.es' }])
    expect(r.body.contactos).toBeUndefined()
  })

  it('valida lo que se guarda: variables que no existen, sin correos, franja al revés', async () => {
    const malas = await pide(PROPIETARIO, 'POST', 'guardar', campana({ mensajes: [{ asunto: 'Hola {{apellido}}', cuerpo: 'x' }] }))
    expect(malas.statusCode).toBe(400)
    expect(malas.body.error).toMatch(/\{\{apellido\}\}/)
    expect((await pide(PROPIETARIO, 'POST', 'guardar', campana({ mensajes: [] }))).statusCode).toBe(400)
    expect((await pide(PROPIETARIO, 'POST', 'guardar', campana({ ventana: { desde: 20, hasta: 9 } }))).statusCode).toBe(400)
    expect((await pide(PROPIETARIO, 'POST', 'guardar', campana({ inicio: '2020-01-01T10:00' }))).statusCode).toBe(400)
  })

  it('lanzar exige confirmar el número exacto; después no se edita, se duplica', async () => {
    await conAjustes()
    const g = await pide(PROPIETARIO, 'POST', 'guardar', campana({ ventana: { desde: 9, hasta: 20 } }))
    expect(g.statusCode).toBe(200)
    const id = g.body.campana.id
    expect(g.body.editable).toBe(true)
    expect(g.body.mensajes.map(m => m.esperaDias)).toEqual([0, 3])

    const mal = await pide(PROPIETARIO, 'POST', 'lanzar', { id, confirmar: 3 })
    expect(mal.statusCode).toBe(409)
    expect(mal.body).toMatchObject({ codigo: 'confirmar', total: 2 })
    expect(t().helm_email_destinatarios || []).toHaveLength(0)

    const ok = await pide(PROPIETARIO, 'POST', 'lanzar', { id, confirmar: 2 })
    expect(ok.statusCode).toBe(200)
    expect(ok.body.total).toBe(2)
    expect(t().helm_email_campanas[0]).toMatchObject({ estado: 'activa', total: 2, remitente: expect.objectContaining({ email: 'hola@acme.es', empresa: 'Acme S.L.' }) })
    expect(t().helm_email_destinatarios.map(d => [d.email, d.estado, d.siguiente_orden])).toEqual([['ana@x.es', 'activo', 1], ['bea@x.es', 'activo', 1]])
    expect(h.auditoria.map(a => a.action)).toContain('email.campana_lanzada')

    const otra = await pide(PROPIETARIO, 'POST', 'lanzar', { id, confirmar: 2 })
    expect(otra.statusCode).toBe(409)
    const editar = await pide(PROPIETARIO, 'POST', 'guardar', { ...campana({ nombre: 'Cambiada' }), id })
    expect(editar.statusCode).toBe(409)
    expect(editar.body.error).toMatch(/Duplícala/)
    expect(t().helm_email_campanas[0].nombre).toBe('Bienvenida')
    expect((await pide(PROPIETARIO, 'DELETE', 'campana', undefined, { id })).statusCode).toBe(409)

    const copia = await pide(PROPIETARIO, 'POST', 'duplicar', { id })
    expect(copia.statusCode).toBe(200)
    expect(copia.body.campana).toMatchObject({ nombre: 'Copia de Bienvenida', estado: 'borrador' })
    expect(copia.body.mensajes).toHaveLength(2)
    expect(copia.body.editable).toBe(true)

    // Pausar y reanudar.
    expect((await pide(PROPIETARIO, 'POST', 'pausar', { id })).body.campana.estado).toBe('pausada')
    expect((await pide(PROPIETARIO, 'POST', 'reanudar', { id })).body.campana.estado).toBe('activa')
    expect((await pide(PROPIETARIO, 'POST', 'reanudar', { id })).statusCode).toBe(409)
  })

  it('no se lanza sin ajustes completos ni con el dominio sin verificar', async () => {
    const g = await pide(PROPIETARIO, 'POST', 'guardar', campana())
    const sin = await pide(PROPIETARIO, 'POST', 'lanzar', { id: g.body.campana.id, confirmar: 2 })
    expect(sin.statusCode).toBe(409)
    expect(sin.body.error).toMatch(/falta la clave de Resend/)
    await conAjustes()
    resend.dominios = [{ name: 'acme.es', status: 'pending' }]
    const r = await pide(PROPIETARIO, 'POST', 'lanzar', { id: g.body.campana.id, confirmar: 2 })
    expect(r.statusCode).toBe(409)
    expect(r.body.error).toMatch(/no está verificado/)
    expect(t().helm_email_campanas[0].estado).toBe('borrador')
  })

  it('la prueba va SOLO al correo de tu sesión, con «[Prueba]» y el pie legal', async () => {
    await conAjustes()
    const g = await pide(PROPIETARIO, 'POST', 'guardar', campana())
    resend.llamadas.length = 0
    const r = await pide(PROPIETARIO, 'POST', 'prueba', { id: g.body.campana.id, para: 'otro@victima.es' })
    expect(r.statusCode).toBe(200)
    expect(r.body).toMatchObject({ ok: true, enviados: 2, para: 'dueno@acme.es' })
    const [ll] = resend.llamadas
    expect(ll.url).toBe('https://api.resend.com/emails/batch')
    expect(ll.cuerpo.map(c => c.to)).toEqual([['dueno@acme.es'], ['dueno@acme.es']])
    expect(ll.cuerpo.map(c => c.subject)).toEqual(['[Prueba 1/2] Hola', '[Prueba 2/2] Segundo'])
    expect(ll.cuerpo[0].html).toContain('Acme S.L.')
    expect(ll.cuerpo[0].headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click')
    expect((await pide({ ...PROPIETARIO, email: null }, 'POST', 'prueba', { id: g.body.campana.id })).statusCode).toBe(400)
  })
})

describe('email marketing · bajas', () => {
  it('apuntar una a mano; quitarla solo si la persona lo ha pedido (y queda en el registro)', async () => {
    expect((await pide(PROPIETARIO, 'POST', 'baja', { email: 'Ana@X.es' })).body).toMatchObject({ ok: true, nueva: true })
    const lista = await pide(CLOSER, 'GET', 'bajas')
    expect(lista.body.bajas).toEqual([expect.objectContaining({ email: 'ana@x.es', motivo: 'manual', origen: 'panel' })])
    // De baja, ya no entra en la audiencia.
    expect((await pide(PROPIETARIO, 'POST', 'audiencia', audiencia)).body).toMatchObject({ total: 1, deBaja: 1 })

    const sinPedir = await pide(PROPIETARIO, 'POST', 'quitar-baja', { email: 'ana@x.es' })
    expect(sinPedir.statusCode).toBe(400)
    expect(sinPedir.body.error).toMatch(/te ha pedido volver a recibir/)
    expect(t().helm_email_bajas).toHaveLength(1)
    const ok = await pide(PROPIETARIO, 'POST', 'quitar-baja', { email: 'ana@x.es', pedido: true, nota: 'Me lo pidió por WhatsApp' })
    expect(ok.statusCode).toBe(200)
    expect(t().helm_email_bajas).toHaveLength(0)
    expect(h.auditoria.find(a => a.action === 'email.baja_quitada').metadata).toMatchObject({ email: 'ana@x.es', motivo: 'manual', nota: 'Me lo pidió por WhatsApp' })
    expect((await pide(PROPIETARIO, 'POST', 'quitar-baja', { email: 'ana@x.es', pedido: true })).statusCode).toBe(404)
  })
})
