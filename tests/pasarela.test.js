// La puerta del panel a la base (/api/db, api/_lib/pasarela.js) y la sesión
// (api/_lib/auth.js): lo que se cerró el 2026-10-20 y no puede volver a
// abrirse. La base y PostgREST se simulan.
import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect, beforeEach, vi } from 'vitest'

const estado = vi.hoisted(() => {
  process.env.JWT_SECRET = 'secreto-de-prueba-con-longitud-suficiente-123'
  return { filas: {}, team: {}, teamError: null }
})

vi.mock('../api/lib/supabase.js', () => {
  const from = (tabla) => {
    const q = { _tabla: tabla, _id: null }
    q.select = () => q
    q.in = () => Promise.resolve({ data: estado.filas[tabla] || [], error: null })
    q.eq = (col, val) => { q._id = val; return q }
    q.maybeSingle = () => {
      if (tabla === 'team') return Promise.resolve({ data: estado.team[q._id] || null, error: estado.teamError })
      return Promise.resolve({ data: null, error: null })
    }
    return q
  }
  return { supabase: { from } }
})

// El esquema que devolvería PostgREST (su OpenAPI).
const DEF = (cols) => ({ properties: Object.fromEntries(cols.map(c => [c, {}])) })
globalThis.fetch = vi.fn(async () => ({
  ok: true,
  json: async () => ({
    definitions: {
      clients: DEF(['id', 'slug', 'name', 'agencia_id']),
      crm_contacts: DEF(['id', 'client_id', 'name']),
      helm_team: DEF(['id', 'client_id', 'name', 'role', 'login_id', 'pay_account']),
      helm_collaborations: DEF(['id', 'from_client_id', 'to_client_id']),
      team: DEF(['id', 'client_id', 'name', 'email', 'role', 'active', 'password_hash']),
      whatsapp_config: DEF(['id', 'client_id', 'token']),
      helm_permissions: DEF(['client_id', 'matrix', 'visible', 'sections']),
    },
  }),
}))

const { recortaTabla, pasarela, PANEL } = await import('../api/_lib/pasarela.js')
const { signJwt, validateAuth, olvidarAcceso } = await import('../api/_lib/auth.js')

const AGENCIA = { superadmin: true, agenciaId: 'ag-1', plataforma: false, role: 'superadmin' }
const PLATAFORMA = { superadmin: true, agenciaId: null, plataforma: true, role: 'superadmin' }
const MIEMBRO = { role: 'client', clientId: 'p1', nivel: 'member' }
const DUENO = { role: 'client', clientId: 'p1', nivel: 'admin,ceo,director' }

const pide = (o) => recortaTabla({
  ids: ['p1'], metodo: 'GET', query: new URLSearchParams(), cuerpo: null, prefer: '', ...o,
})
const cuerpo = (x) => Buffer.from(JSON.stringify(x))

beforeEach(() => { estado.filas = {}; estado.team = {}; estado.teamError = null; olvidarAcceso() })

describe('pasarela · perfiles de otra agencia (upsert en clients)', () => {
  it('un admin de agencia NO puede «guardar pisando» un perfil por id o slug', async () => {
    for (const q of ['on_conflict=id', 'on_conflict=slug', '']) {
      await expect(pide({
        auth: AGENCIA, metodo: 'POST', tabla: 'clients', query: new URLSearchParams(q),
        cuerpo: cuerpo({ id: 'perfil-ajeno', name: 'Mío' }), prefer: 'resolution=merge-duplicates',
      })).rejects.toMatchObject({ statusCode: 403 })
    }
  })

  it('da igual escribir Resolution en mayúsculas o con espacios', async () => {
    for (const prefer of ['Resolution=merge-duplicates', 'return=representation, resolution = merge-duplicates']) {
      await expect(pide({ auth: AGENCIA, metodo: 'POST', tabla: 'clients', cuerpo: cuerpo({ id: 'x' }), prefer }))
        .rejects.toMatchObject({ statusCode: 403 })
    }
  })

  it('tampoco con ignore-duplicates ni solo con on_conflict', async () => {
    await expect(pide({ auth: AGENCIA, metodo: 'POST', tabla: 'clients', cuerpo: cuerpo({ id: 'x' }), prefer: 'resolution=ignore-duplicates' }))
      .rejects.toMatchObject({ statusCode: 403 })
    await expect(pide({ auth: AGENCIA, metodo: 'POST', tabla: 'clients', query: new URLSearchParams('on_conflict=id'), cuerpo: cuerpo({ id: 'x' }) }))
      .rejects.toMatchObject({ statusCode: 403 })
  })

  it('crear un perfil normal sigue funcionando y nace en su agencia', async () => {
    const r = await pide({ auth: AGENCIA, metodo: 'POST', tabla: 'clients', cuerpo: cuerpo({ name: 'Nuevo', slug: 'nuevo' }) })
    expect(r.filas[0].agencia_id).toBe('ag-1')
  })

  it('la plataforma sí puede (es quien cuida del sistema)', async () => {
    await expect(pide({
      auth: { ...PLATAFORMA, agenciaId: 'ag-plat' }, ids: null, metodo: 'POST', tabla: 'clients', query: new URLSearchParams('on_conflict=id'),
      cuerpo: cuerpo({ id: 'x' }), prefer: 'resolution=merge-duplicates',
    })).resolves.toBeTruthy()
  })

  it('colaboraciones: nada de upsert', async () => {
    await expect(pide({
      auth: AGENCIA, metodo: 'POST', tabla: 'helm_collaborations', query: new URLSearchParams('on_conflict=id'),
      cuerpo: cuerpo({ id: 'c', from_client_id: 'p1', to_client_id: 'p9' }), prefer: 'resolution=merge-duplicates',
    })).rejects.toMatchObject({ statusCode: 403 })
  })
})

describe('pasarela · upsert en tablas normales', () => {
  it('sin on_conflict explícito no pasa (la clave primaria podría no ser id)', async () => {
    await expect(pide({
      auth: MIEMBRO, metodo: 'POST', tabla: 'crm_contacts', cuerpo: cuerpo({ id: 'c1', client_id: 'p1' }),
      prefer: 'resolution=merge-duplicates',
    })).rejects.toMatchObject({ statusCode: 403 })
  })

  it('con on_conflict que incluye client_id, o por id propio, sí', async () => {
    await expect(pide({
      auth: MIEMBRO, metodo: 'POST', tabla: 'crm_contacts', query: new URLSearchParams('on_conflict=client_id,name'),
      cuerpo: cuerpo({ client_id: 'p1', name: 'x' }), prefer: 'resolution=merge-duplicates',
    })).resolves.toBeTruthy()
    estado.filas.crm_contacts = [{ client_id: 'p1' }]
    await expect(pide({
      auth: MIEMBRO, metodo: 'POST', tabla: 'crm_contacts', query: new URLSearchParams('on_conflict=id'),
      cuerpo: cuerpo({ id: 'c1', client_id: 'p1' }), prefer: 'resolution=merge-duplicates',
    })).resolves.toBeTruthy()
  })

  it('por id de una fila de otro perfil, no', async () => {
    estado.filas.crm_contacts = [{ client_id: 'p9' }]
    await expect(pide({
      auth: MIEMBRO, metodo: 'POST', tabla: 'crm_contacts', query: new URLSearchParams('on_conflict=id'),
      cuerpo: cuerpo({ id: 'c1', client_id: 'p1' }), prefer: 'resolution=merge-duplicates',
    })).rejects.toMatchObject({ statusCode: 403 })
  })
})

describe('pasarela · lista blanca de tablas', () => {
  it('una tabla heredada con secretos (aunque tenga client_id) no se abre', async () => {
    await expect(pide({ auth: DUENO, tabla: 'whatsapp_config' })).rejects.toMatchObject({ statusCode: 403 })
    await expect(pide({ auth: PLATAFORMA, ids: null, tabla: 'whatsapp_config' })).rejects.toMatchObject({ statusCode: 403 })
  })

  it('todas las tablas que usa el panel (src/) están en la lista', () => {
    const SRC = path.resolve(__dirname, '../src')
    const LLAMADA = /(?:\.from|fetchRows|insertRow|updateRow|deleteRow|upsertRow|countRows)\(\s*['"`]([a-z0-9_]+)['"`]/g
    const usadas = new Set()
    const recorre = (d) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name)
        if (e.isDirectory()) { if (!p.includes(`${path.sep}3d`)) recorre(p); continue }
        if (!/\.(jsx?|tsx?)$/.test(e.name) || e.name.includes('.min.')) continue
        for (const m of fs.readFileSync(p, 'utf8').matchAll(LLAMADA)) usadas.add(m[1])
      }
    }
    recorre(SRC)
    usadas.delete('helm')   // el bucket de Storage, no una tabla
    const faltan = [...usadas].filter(t => !PANEL.has(t))
    expect(faltan).toEqual([])
  })
})

describe('pasarela · team (accesos con contraseña)', () => {
  it('filtrar u ordenar por password_hash no pasa (oráculo del hash)', async () => {
    for (const q of [
      'select=id&password_hash=like.scrypt:ab*',
      'select=id&order=password_hash.desc',
      'select=id&or=(password_hash.like.scrypt*,id.eq.1)',
      'select=id&and=(password_hash->>x.eq.1)',
    ]) {
      await expect(pide({ auth: MIEMBRO, tabla: 'team', query: new URLSearchParams(q) }))
        .rejects.toMatchObject({ statusCode: 403 })
    }
  })

  it('or/and en team, ni con comillas ni anidados', async () => {
    for (const q of ['select=id&or=("password_hash".like.x*)', 'select=id&not.or=(name.eq.a)', 'select=id&and=(name.eq.a)']) {
      await expect(pide({ auth: MIEMBRO, tabla: 'team', query: new URLSearchParams(q) }))
        .rejects.toMatchObject({ statusCode: 403 })
    }
  })

  it('lo que hace el panel (Tareas: id y nombre de los activos, por nombre) sigue pasando', async () => {
    await expect(pide({ auth: MIEMBRO, tabla: 'team', query: new URLSearchParams('select=id,name&client_id=eq.p1&active=eq.true&order=name.asc') }))
      .resolves.toBeTruthy()
  })
})

describe('pasarela · el oficio de cada persona (helm_team.role)', () => {
  it('un miembro no se cambia el rol ni borra personas', async () => {
    await expect(pide({ auth: MIEMBRO, metodo: 'PATCH', tabla: 'helm_team', cuerpo: cuerpo({ role: 'dueno' }) }))
      .rejects.toMatchObject({ statusCode: 403 })
    await expect(pide({ auth: MIEMBRO, metodo: 'DELETE', tabla: 'helm_team' }))
      .rejects.toMatchObject({ statusCode: 403 })
  })

  it('un miembro sí puede tocar otros campos; el dueño y el admin de agencia, el rol', async () => {
    await expect(pide({ auth: MIEMBRO, metodo: 'PATCH', tabla: 'helm_team', cuerpo: cuerpo({ name: 'Ana' }) })).resolves.toBeTruthy()
    await expect(pide({ auth: DUENO, metodo: 'PATCH', tabla: 'helm_team', cuerpo: cuerpo({ role: 'closer' }) })).resolves.toBeTruthy()
    await expect(pide({ auth: AGENCIA, metodo: 'PATCH', tabla: 'helm_team', cuerpo: cuerpo({ role: 'closer' }) })).resolves.toBeTruthy()
  })
})

describe('pasarela · métodos', () => {
  const res = () => ({ statusCode: 0, headers: {}, setHeader(k, v) { this.headers[k] = v }, end(b) { this.body = b } })

  it('PUT y otros métodos raros, 405 (antes de mirar nada)', async () => {
    const r = res()
    await pasarela({ method: 'PUT', url: '/api/db/rest/v1/crm_contacts', headers: {} }, r)
    expect(r.statusCode).toBe(405)
  })

  it('pedir otro esquema que no sea public, 403', async () => {
    const r = res()
    await pasarela({ method: 'GET', url: '/api/db/rest/v1/crm_contacts', headers: { 'accept-profile': 'auth' } }, r)
    expect(r.statusCode).toBe(403)
  })
})

describe('sesión · accesos de equipo revalidados', () => {
  const conToken = async (payload) => ({ headers: { authorization: `Bearer ${await signJwt(payload)}` } })

  it('un acceso desactivado o borrado deja de entrar', async () => {
    estado.team.t1 = { active: false, role: 'member', client_id: 'p1' }
    await expect(validateAuth(await conToken({ sub: 't1', role: 'client', clientId: 'p1' }))).rejects.toMatchObject({ statusCode: 401 })
    await expect(validateAuth(await conToken({ sub: 'no-existe', role: 'client', clientId: 'p1' }))).rejects.toMatchObject({ statusCode: 401 })
  })

  it('si el acceso se movió a otro perfil, el token viejo no vale', async () => {
    estado.team.t2 = { active: true, role: 'member', client_id: 'p2' }
    await expect(validateAuth(await conToken({ sub: 't2', role: 'client', clientId: 'p1' }))).rejects.toMatchObject({ statusCode: 401 })
  })

  it('uno activo entra y el servidor sabe su nivel (de la base, no del navegador)', async () => {
    estado.team.t3 = { active: true, role: 'admin,ceo,director', client_id: 'p1' }
    const a = await validateAuth(await conToken({ sub: 't3', role: 'client', clientId: 'p1' }))
    expect(a.nivel).toBe('admin,ceo,director')
  })

  it('olvidarAcceso hace que un cambio surta efecto al momento', async () => {
    estado.team.t4 = { active: true, role: 'member', client_id: 'p1' }
    const req = await conToken({ sub: 't4', role: 'client', clientId: 'p1' })
    await validateAuth(req)
    estado.team.t4 = { active: false, role: 'member', client_id: 'p1' }
    await expect(validateAuth(req)).resolves.toBeTruthy()      // aún en caché
    olvidarAcceso('t4')
    await expect(validateAuth(req)).rejects.toMatchObject({ statusCode: 401 })
  })

  it('si la base no contesta, no echa a nadie (vale el token firmado)', async () => {
    estado.teamError = { message: 'caída' }
    await expect(validateAuth(await conToken({ sub: 't5', role: 'client', clientId: 'p1' }))).resolves.toBeTruthy()
  })
})
