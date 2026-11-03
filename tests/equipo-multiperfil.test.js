// Una cuenta de equipo puede entrar a VARIOS perfiles: el suyo de origen más
// aquellos donde la hayan añadido al equipo (helm_team). Lo importante de
// seguridad: en el perfil ajeno NO hereda su nivel —si no, un admin de su
// perfil sería admin en el otro— y en un perfil donde no está, su token no vale.
// Sin red ni base: Supabase va simulado con un mundo en memoria.
import { describe, it, expect, vi, beforeEach } from 'vitest'

process.env.JWT_SECRET = 'secreto-de-prueba-multiperfil-0123456789abcdef'

const HOME = 'cli-A', GRANT = 'cli-B', AJENO = 'cli-C', LOGIN = 'login-1'
let mundo

function nuevoMundo() {
  return {
    // La cuenta: su perfil de origen es A, con nivel total (admin,ceo,director).
    team: [{ id: LOGIN, active: true, role: 'admin,ceo,director', client_id: HOME }],
    // En A es dueño; en B la han añadido como setter. De C no sabe nada.
    helm_team: [
      { id: 'p-A', login_id: LOGIN, client_id: HOME, role: 'dueno', active: true },
      { id: 'p-B', login_id: LOGIN, client_id: GRANT, role: 'setter', active: true },
    ],
    clients: [{ id: HOME }, { id: GRANT }, { id: AJENO }],
  }
}

// Builder de Supabase simulado: encadena .select().eq().in() y resuelve con
// maybeSingle() (una fila) o al await directo (lista).
function builder(rows) {
  const filtros = []
  const b = {
    select: () => b,
    eq: (c, v) => { filtros.push([c, v]); return b },
    in: (c, vals) => { filtros.push([c, (x) => vals.includes(x)]); return b },
    order: () => b,
    _m: () => rows.filter(r => filtros.every(([c, v]) => (typeof v === 'function' ? v(r[c]) : r[c] === v))),
    maybeSingle: async () => ({ data: b._m()[0] || null, error: null }),
    then: (resolve) => resolve({ data: b._m(), error: null }),
  }
  return b
}

vi.mock('../api/lib/supabase.js', () => ({
  toAppFormat: (x) => x,
  supabase: { from: (t) => builder(mundo[t] || []) },
}))

const { validateAuth, olvidarAcceso, signJwt } = await import('../api/_lib/auth.js')
const { puedeVerPerfil, perfilesVisibles } = await import('../api/_lib/access.js')

const reqCon = (token) => ({ headers: { authorization: `Bearer ${token}` }, socket: { remoteAddress: '127.0.0.1' } })
const tokenCliente = (clientId) => signJwt({ sub: LOGIN, email: 'setter@ejemplo.test', role: 'client', clientId })

describe('acceso multi-perfil de una cuenta de equipo', () => {
  beforeEach(() => { mundo = nuevoMundo(); olvidarAcceso(null) })

  it('su perfil de origen: entra y conserva su nivel', async () => {
    const auth = await validateAuth(reqCon(await tokenCliente(HOME)))
    expect(auth.clientId).toBe(HOME)
    expect(auth.nivel).toBe('admin,ceo,director')
  })

  it('un perfil donde la han añadido al equipo: entra, pero SIN nivel (no hereda admin)', async () => {
    const auth = await validateAuth(reqCon(await tokenCliente(GRANT)))
    expect(auth.clientId).toBe(GRANT)
    expect(auth.nivel).toBeNull()
  })

  it('un perfil donde NO está: el token no vale', async () => {
    await expect(validateAuth(reqCon(await tokenCliente(AJENO)))).rejects.toThrow()
  })

  it('puedeVerPerfil: origen y concedido sí, ajeno no', async () => {
    const auth = { userId: LOGIN, clientId: HOME }
    expect(await puedeVerPerfil(auth, HOME)).toBe(true)
    expect(await puedeVerPerfil(auth, GRANT)).toBe(true)
    expect(await puedeVerPerfil(auth, AJENO)).toBe(false)
  })

  it('perfilesVisibles: el de origen más los concedidos', async () => {
    const ids = await perfilesVisibles({ userId: LOGIN, clientId: HOME })
    expect(new Set(ids)).toEqual(new Set([HOME, GRANT]))
  })

  it('una concesión desactivada no cuenta', async () => {
    mundo.helm_team.find(p => p.client_id === GRANT).active = false
    olvidarAcceso(LOGIN)
    expect(await puedeVerPerfil({ userId: LOGIN, clientId: HOME }, GRANT)).toBe(false)
    await expect(validateAuth(reqCon(await tokenCliente(GRANT)))).rejects.toThrow()
    const ids = await perfilesVisibles({ userId: LOGIN, clientId: HOME })
    expect(new Set(ids)).toEqual(new Set([HOME]))
  })

  it('si le quitan la concesión de B, deja de entrar (tras olvidar la caché)', async () => {
    mundo.helm_team = mundo.helm_team.filter(p => p.client_id !== GRANT)
    olvidarAcceso(LOGIN)
    await expect(validateAuth(reqCon(await tokenCliente(GRANT)))).rejects.toThrow()
  })
})
