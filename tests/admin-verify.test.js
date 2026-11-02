// GET /api/admin?action=verify: lo que pregunta el panel ante un 401 antes de
// mandarte al login (src/helm/sesion.js). Tiene que ser la misma comprobación
// que la de cualquier endpoint: firma, tipo de token y cuenta todavía activa.
// Sin red ni base: Supabase va simulado.
import { describe, it, expect, vi, beforeEach } from 'vitest'

process.env.JWT_SECRET = 'secreto-de-prueba-para-verify-0123456789abcdef'

const cuentas = new Map()
vi.mock('../api/lib/supabase.js', () => ({
  toAppFormat: (x) => x,
  supabase: {
    from: () => {
      let id = null
      const q = {
        select: () => q,
        eq: (_c, v) => { id = v; return q },
        maybeSingle: async () => ({ data: cuentas.get(id) || null, error: null }),
      }
      return q
    },
  },
}))

const { default: handler } = await import('../api/admin.js')
const { signJwt } = await import('../api/_lib/auth.js')

async function verifica(token) {
  const res = {
    statusCode: 0, body: null, headers: {},
    setHeader(k, v) { this.headers[k] = v },
    status(c) { this.statusCode = c; return this },
    json(b) { this.body = b; return this },
    end() { return this },
  }
  const req = {
    method: 'GET',
    query: { action: 'verify' },
    headers: token ? { authorization: `Bearer ${token}` } : {},
    socket: { remoteAddress: '127.0.0.1' },
  }
  await handler(req, res)
  return res
}

describe('admin?action=verify', () => {
  beforeEach(() => cuentas.clear())

  it('sin token: 401', async () => {
    expect((await verifica(null)).statusCode).toBe(401)
  })

  it('token mal firmado: 401', async () => {
    expect((await verifica('a.b.c')).statusCode).toBe(401)
  })

  it('superadmin activo: 200 y quién es', async () => {
    cuentas.set('sa-1', { active: true, agencia_id: 'ag-1', plataforma: false })
    const token = await signJwt({ sub: 'sa-1', email: 'admin@ejemplo.test', superadmin: true, role: 'superadmin' })
    const r = await verifica(token)
    expect(r.statusCode).toBe(200)
    expect(r.body).toMatchObject({ ok: true, isSuperAdmin: true, email: 'admin@ejemplo.test', userId: 'sa-1' })
  })

  it('cuenta desactivada: 401 aunque el token esté bien firmado', async () => {
    cuentas.set('sa-2', { active: false })
    const token = await signJwt({ sub: 'sa-2', superadmin: true, role: 'superadmin' })
    expect((await verifica(token)).statusCode).toBe(401)
  })

  it('un token de otro tipo (comunidad) no es una sesión del panel: 401', async () => {
    const token = await signJwt({ sub: 'm-1', kind: 'community', clientId: 'c1' })
    expect((await verifica(token)).statusCode).toBe(401)
  })
})
