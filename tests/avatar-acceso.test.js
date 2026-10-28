// Quién puede ver y pedir el avatar de ventas (api/avatar.js). La misma
// escalera que usa el panel para enseñar la pestaña del Informe: el negocio no
// lo ha apagado, y quien llama manda en todo el perfil o tiene el avatar en
// Permisos para su rol. Entrar al perfil no basta: cada estudio gasta créditos
// y retrata a los clientes. Sin red ni base.
import { describe, it, expect, vi, beforeEach } from 'vitest'

let db = {}
const pedidas = []

function consulta(tabla) {
  const filtros = []
  const filas = () => (db[tabla] || []).filter(r => filtros.every(f => f(r)))
  const q = {
    select() { return q },
    eq(c, v) { filtros.push(r => r[c] === v); return q },
    order() { return q },
    limit() { return Promise.resolve({ data: filas(), error: null }) },
    maybeSingle() { pedidas.push(tabla); return Promise.resolve({ data: filas()[0] || null, error: null }) },
  }
  return q
}
vi.mock('../api/lib/supabase.js', () => ({ supabase: { from: (t) => consulta(t) } }))
vi.mock('../api/_lib/auth.js', () => ({ applyCors: () => {}, rateLimit: () => ({ ok: true }) }))
const sesion = vi.hoisted(() => ({ auth: null }))
vi.mock('../api/_lib/access.js', () => ({ requireProfileAccess: async () => sesion.auth }))
const encolaAvatar = vi.fn(async () => {})
vi.mock('../api/_lib/avatar.js', () => ({ encolaAvatar: (...a) => encolaAvatar(...a) }))

const { default: handler } = await import('../api/avatar.js')

async function pide(auth, action, method = action === 'ahora' ? 'POST' : 'GET') {
  sesion.auth = auth
  const res = { statusCode: 0, body: null, status(c) { this.statusCode = c; return this }, json(b) { this.body = b; return this }, end() { return this } }
  await handler({ method, query: { action, clientId: 'c1' }, headers: {} }, res)
  return res
}

// Las sesiones que llegan al endpoint (ver validateAuth).
const ADMIN_AGENCIA = { superadmin: true, role: 'superadmin', agenciaId: 'ag-1' }
const PROPIETARIO = { role: 'client', clientId: 'c1', userId: 'login-dueno', nivel: 'admin,ceo,director' }
const CLOSER = { role: 'client', clientId: 'c1', userId: 'login-closer', nivel: 'member' }
const SIN_OFICIO = { role: 'client', clientId: 'c1', userId: 'login-suelto', nivel: 'member' }

beforeEach(() => {
  pedidas.length = 0
  encolaAvatar.mockClear()
  db = {
    helm_permissions: [{ client_id: 'c1', sections: {}, visible: { closer: ['crm', 'informe'] } }],
    helm_team: [
      { login_id: 'login-closer', role: 'closer' },
      { login_id: 'login-dueno', role: 'dueno' },
    ],
    helm_avatar: [{ client_id: 'c1', n_analizados: 3 }],
    helm_avatar_contactos: [],
    agent_jobs: [],
  }
})

describe('api/avatar · quién lo ve', () => {
  it('el administrador de la agencia y el propietario lo leen y lo lanzan', async () => {
    for (const auth of [ADMIN_AGENCIA, PROPIETARIO]) {
      expect((await pide(auth, 'lista')).statusCode).toBe(200)
      expect((await pide(auth, 'ahora')).statusCode).toBe(200)
    }
    expect(encolaAvatar).toHaveBeenCalledTimes(2)
  })

  it('un closer con el Informe pero sin el avatar en Permisos se queda fuera, en las dos acciones', async () => {
    const lista = await pide(CLOSER, 'lista')
    expect(lista.statusCode).toBe(403)
    expect(lista.body.estudio).toBeUndefined()
    expect((await pide(CLOSER, 'ahora')).statusCode).toBe(403)
    expect(encolaAvatar).not.toHaveBeenCalled()
  })

  it('con el avatar marcado para su rol, el closer entra', async () => {
    db.helm_permissions[0].visible.closer.push('avatar')
    expect((await pide(CLOSER, 'lista')).statusCode).toBe(200)
    expect((await pide(CLOSER, 'ahora')).statusCode).toBe(200)
  })

  it('sin permisos guardados valen los de serie: ningún rol lo trae', async () => {
    db.helm_permissions = []
    expect((await pide(CLOSER, 'lista')).statusCode).toBe(403)
    expect((await pide(PROPIETARIO, 'lista')).statusCode).toBe(200)
  })

  it('sin oficio (quien montó el negocio) o con el de dueño, como en el panel: lo ve', async () => {
    expect((await pide(SIN_OFICIO, 'lista')).statusCode).toBe(200)
    expect((await pide({ ...PROPIETARIO, nivel: 'member' }, 'lista')).statusCode).toBe(200)
  })

  it('apagado en Secciones no lo ve nadie, ni la agencia, ni el propietario', async () => {
    db.helm_permissions[0].sections = { avatar: false }
    for (const auth of [ADMIN_AGENCIA, PROPIETARIO, SIN_OFICIO]) {
      expect((await pide(auth, 'lista')).statusCode).toBe(403)
      expect((await pide(auth, 'ahora')).statusCode).toBe(403)
    }
    expect(encolaAvatar).not.toHaveBeenCalled()
  })

  it('a quien manda en todo no se le busca el oficio', async () => {
    await pide(PROPIETARIO, 'lista')
    expect(pedidas).not.toContain('helm_team')
  })
})
