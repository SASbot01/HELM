// Email marketing · darse de baja (api/_lib/email/baja.js y api/email-baja.js)
// y los avisos de Resend (api/email-webhook.js). El token va firmado: cambiar
// el correo o el perfil lo invalida. Abrir el enlace (GET) NO da de baja —
// los antivirus abren los enlaces solos—; el botón y la baja de un clic de
// Gmail (POST) sí, una sola vez aunque se repita, y cortan la secuencia de esa
// persona en las campañas en marcha. El webhook solo entra con la firma Svix
// del secreto de ESE perfil. Base en memoria, sin red.
import { describe, it, expect, vi, beforeEach } from 'vitest'

process.env.JWT_SECRET = 'secreto-de-prueba-de-las-bajas-0123456789abcdef'
process.env.HELM_PUBLIC_URL = 'https://helm.ejemplo.es/'

const base = vi.hoisted(() => ({ b: null }))
vi.mock('../api/lib/supabase.js', async () => {
  const { crearBase: crea } = await import('./ayudas/base-memoria.js')
  base.b = crea({})
  return { supabase: base.b.supabase }
})
vi.mock('../api/_lib/auth.js', () => ({ rateLimit: () => ({ ok: true }), getClientIp: () => '1.2.3.4' }))

const { tokenBaja, leeTokenBaja, enlaceBaja } = await import('../api/_lib/email/baja.js')
const { default: baja } = await import('../api/email-baja.js')
const { default: webhook } = await import('../api/email-webhook.js')
const { firmaSvix, firmaSvixValida } = await import('../api/_lib/email/webhook.js')

const P1 = '11111111-1111-4111-8111-111111111111'
const P2 = '22222222-2222-4222-8222-222222222222'
const SECRETO = `whsec_${Buffer.from('secreto-del-webhook-de-prueba-123').toString('base64')}`
const t = () => base.b.tablas

function res() {
  const r = { statusCode: 0, cabeceras: {}, cuerpo: '', setHeader(k, v) { this.cabeceras[k.toLowerCase()] = v }, status(c) { this.statusCode = c; return this }, json(o) { this.cuerpo = JSON.stringify(o); return this }, end(b) { if (b) this.cuerpo = String(b); return this } }
  return r
}
const pide = async (handler, req) => { const r = res(); await handler({ headers: {}, query: {}, ...req }, r); return r }

beforeEach(() => {
  base.b.vaciar()
  t().helm_email_ajustes = [{ client_id: P1, empresa: 'Acme S.L.' }]
  t().clients = [{ id: P1, name: 'Acme' }, { id: P2, name: 'Otra' }]
  t().helm_email_destinatarios = [
    { id: 1, campana_id: 'c1', client_id: P1, contact_id: 'k1', email: 'ana@x.es', estado: 'activo' },
    { id: 2, campana_id: 'c2', client_id: P1, contact_id: 'k1', email: 'ana@x.es', estado: 'activo' },
    { id: 3, campana_id: 'c3', client_id: P2, contact_id: 'k9', email: 'ana@x.es', estado: 'activo' },
    { id: 4, campana_id: 'c1', client_id: P1, contact_id: 'k2', email: 'luis@x.es', estado: 'activo' },
  ]
})

describe('baja · el token', () => {
  it('ida y vuelta, en minúsculas; el enlace usa la URL pública sin barra de más', () => {
    const tk = tokenBaja(P1, ' Ana@X.es ')
    expect(leeTokenBaja(tk)).toEqual({ clientId: P1, email: 'ana@x.es' })
    expect(tokenBaja(P1, 'ana@x.es')).toBe(tk)
    expect(enlaceBaja(P1, 'ana@x.es')).toBe(`https://helm.ejemplo.es/api/email-baja?t=${tk}`)
  })

  it('tocado, de otro perfil o inventado: no vale', () => {
    const tk = tokenBaja(P1, 'ana@x.es')
    const [cuerpo, firma] = tk.split('.')
    const otroCuerpo = Buffer.from(`${P2}\nana@x.es`).toString('base64url')
    expect(leeTokenBaja(`${otroCuerpo}.${firma}`)).toBeNull()
    expect(leeTokenBaja(`${cuerpo}.${firma.slice(0, -2)}AA`)).toBeNull()
    expect(leeTokenBaja(`${cuerpo}`)).toBeNull()
    expect(leeTokenBaja('')).toBeNull()
    expect(leeTokenBaja(`${cuerpo}.${firma}.x`)).toBeNull()
  })

  it('sin secreto en el servidor no se firma nada (y sin enlace de baja no se manda)', () => {
    const antes = process.env.JWT_SECRET
    delete process.env.JWT_SECRET
    try { expect(() => tokenBaja(P1, 'a@b.es')).toThrow(/sin enlace de baja no se manda/) }
    finally { process.env.JWT_SECRET = antes }
  })
})

describe('baja · el endpoint', () => {
  it('GET enseña la página con el botón, y NO da de baja', async () => {
    const r = await pide(baja, { method: 'GET', query: { t: tokenBaja(P1, 'ana@x.es') } })
    expect(r.statusCode).toBe(200)
    expect(r.cabeceras['content-type']).toMatch(/text\/html/)
    expect(r.cuerpo).toContain('¿Dejar de recibir correos de Acme S.L.?')
    expect(r.cuerpo).toContain('method="post"')
    expect(r.cuerpo).toContain('Darme de baja')
    expect(t().helm_email_bajas || []).toHaveLength(0)
    expect(t().helm_email_destinatarios.every(d => d.estado === 'activo')).toBe(true)
  })

  it('POST da de baja en ESE perfil, corta sus secuencias y lo apunta en el CRM; repetirlo no duplica', async () => {
    const tk = tokenBaja(P1, 'ana@x.es')
    const r = await pide(baja, { method: 'POST', query: { t: tk }, body: undefined })
    expect(r.statusCode).toBe(200)
    expect(r.cuerpo).toContain('Te has dado de baja')
    expect(t().helm_email_bajas).toEqual([expect.objectContaining({ client_id: P1, email: 'ana@x.es', motivo: 'baja', origen: 'enlace' })])
    const d = Object.fromEntries(t().helm_email_destinatarios.map(x => [x.id, x.estado]))
    expect(d).toEqual({ 1: 'baja', 2: 'baja', 3: 'activo', 4: 'activo' })
    expect(t().crm_activities).toHaveLength(1)
    expect(t().crm_activities[0]).toMatchObject({ client_id: P1, contact_id: 'k1', type: 'note' })

    const otra = await pide(baja, { method: 'POST', query: { t: tk }, body: { 'List-Unsubscribe': 'One-Click' } })
    expect(otra.statusCode).toBe(200)
    expect(t().helm_email_bajas).toHaveLength(1)
    expect(t().helm_email_bajas[0].origen).toBe('enlace')
    expect(t().crm_activities).toHaveLength(1)
    // Y el enlace ya dice que está de baja.
    expect((await pide(baja, { method: 'GET', query: { t: tk } })).cuerpo).toContain('Ya estás de baja')
  })

  it('la baja de un clic (RFC 8058) se apunta como tal', async () => {
    const r = await pide(baja, { method: 'POST', query: { t: tokenBaja(P1, 'luis@x.es') }, body: { 'List-Unsubscribe': 'One-Click' } })
    expect(r.statusCode).toBe(200)
    expect(t().helm_email_bajas[0]).toMatchObject({ email: 'luis@x.es', origen: 'un_clic' })
  })

  it('un token malo es un 400 con una página, sin tocar nada; otros métodos, 405', async () => {
    const r = await pide(baja, { method: 'POST', query: { t: 'nada.de.nada' } })
    expect(r.statusCode).toBe(400)
    expect(r.cuerpo).toContain('Enlace no válido')
    expect(t().helm_email_bajas || []).toHaveLength(0)
    expect((await pide(baja, { method: 'DELETE', query: {} })).statusCode).toBe(405)
  })

  it('lo que sale en la página va escapado', async () => {
    t().helm_email_ajustes = [{ client_id: P1, empresa: '<script>alert(1)</script>' }]
    const r = await pide(baja, { method: 'GET', query: { t: tokenBaja(P1, 'ana@x.es') } })
    expect(r.cuerpo).not.toContain('<script>alert(1)</script>')
    expect(r.cuerpo).toContain('&lt;script&gt;')
    expect(r.cabeceras['content-security-policy']).toMatch(/default-src 'none'/)
  })
})

describe('webhook de Resend', () => {
  const evento = (type, extra = {}) => JSON.stringify({ type, created_at: '2026-11-02T10:00:00Z', data: { email_id: 're_1', to: ['ana@x.es'], ...extra } })
  const firmado = (cuerpo, { secreto = SECRETO, ts = Math.floor(Date.now() / 1000) } = {}) => ({
    'svix-id': 'msg_1', 'svix-timestamp': String(ts), 'svix-signature': firmaSvix({ secreto, id: 'msg_1', timestamp: String(ts), cuerpo }),
  })
  beforeEach(() => {
    t().user_integrations = [{ id: 'u1', client_id: P1, service: 'resend', enabled: true, member_id: null, config: { apiKey: 're_x', webhookSecret: SECRETO } }]
    t().helm_email_envios = [{ id: 10, client_id: P1, campana_id: 'c1', email: 'ana@x.es', estado: 'enviado', resend_id: 're_1' }]
  })

  it('la firma: buena, de otro secreto, vieja o tocada', () => {
    const cuerpo = evento('email.delivered')
    const ts = String(Math.floor(Date.now() / 1000))
    const firma = firmaSvix({ secreto: SECRETO, id: 'm', timestamp: ts, cuerpo })
    expect(firmaSvixValida({ secreto: SECRETO, id: 'm', timestamp: ts, firma, cuerpo })).toBe(true)
    expect(firmaSvixValida({ secreto: SECRETO, id: 'm', timestamp: ts, firma: `v1,x v0,y ${firma}`, cuerpo })).toBe(true)
    expect(firmaSvixValida({ secreto: `whsec_${Buffer.from('otro').toString('base64')}`, id: 'm', timestamp: ts, firma, cuerpo })).toBe(false)
    expect(firmaSvixValida({ secreto: SECRETO, id: 'm', timestamp: ts, firma, cuerpo: cuerpo.replace('delivered', 'bounced') })).toBe(false)
    expect(firmaSvixValida({ secreto: SECRETO, id: 'm', timestamp: String(Number(ts) - 3600), firma: firmaSvix({ secreto: SECRETO, id: 'm', timestamp: String(Number(ts) - 3600), cuerpo }), cuerpo })).toBe(false)
  })

  it('sin firma buena, 401 y nada cambia; con ella, entregado', async () => {
    const cuerpo = evento('email.delivered')
    const mal = await pide(webhook, { method: 'POST', query: { perfil: P1 }, headers: firmado(cuerpo, { secreto: `whsec_${Buffer.from('otro-secreto-cualquiera').toString('base64')}` }), rawBody: Buffer.from(cuerpo) })
    expect(mal.statusCode).toBe(401)
    expect(t().helm_email_envios[0].estado).toBe('enviado')
    // El secreto es del perfil: con la firma de P1 no se entra por P2.
    expect((await pide(webhook, { method: 'POST', query: { perfil: P2 }, headers: firmado(cuerpo), rawBody: Buffer.from(cuerpo) })).statusCode).toBe(401)
    const bien = await pide(webhook, { method: 'POST', query: { perfil: P1 }, headers: firmado(cuerpo), rawBody: Buffer.from(cuerpo) })
    expect(bien.statusCode).toBe(200)
    expect(t().helm_email_envios[0].estado).toBe('entregado')
  })

  it('una queja o un rebote definitivo son baja (y cortan la secuencia); un rebote temporal, no', async () => {
    let cuerpo = evento('email.bounced', { bounce: { type: 'Transient', message: 'Mailbox full' } })
    await pide(webhook, { method: 'POST', query: { perfil: P1 }, headers: firmado(cuerpo), rawBody: Buffer.from(cuerpo) })
    expect(t().helm_email_envios[0]).toMatchObject({ estado: 'rebotado', error: 'Mailbox full' })
    expect(t().helm_email_bajas || []).toHaveLength(0)

    cuerpo = evento('email.complained')
    await pide(webhook, { method: 'POST', query: { perfil: P1 }, headers: firmado(cuerpo), rawBody: Buffer.from(cuerpo) })
    expect(t().helm_email_envios[0].estado).toBe('queja')
    expect(t().helm_email_bajas).toEqual([expect.objectContaining({ client_id: P1, email: 'ana@x.es', motivo: 'queja', origen: 'webhook', campana_id: 'c1' })])
    expect(t().helm_email_destinatarios.filter(d => d.client_id === P1 && d.email === 'ana@x.es').every(d => d.estado === 'baja')).toBe(true)
  })

  it('un aviso de un correo que no es de una campaña se ignora', async () => {
    const cuerpo = JSON.stringify({ type: 'email.complained', data: { email_id: 're_desconocido', to: ['luis@x.es'] } })
    const r = await pide(webhook, { method: 'POST', query: { perfil: P1 }, headers: firmado(cuerpo), rawBody: Buffer.from(cuerpo) })
    expect(r.statusCode).toBe(200)
    expect(JSON.parse(r.cuerpo)).toMatchObject({ ignorado: true })
    expect(t().helm_email_bajas || []).toHaveLength(0)
  })
})
