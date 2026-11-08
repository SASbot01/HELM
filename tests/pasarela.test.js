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
    const resultado = () => Promise.resolve({ data: estado.filas[tabla] || [], error: null })
    q.select = () => q
    q.eq = (col, val) => { q._id = val; return q }
    // Encadenable: la visibilidad del CRM filtra con .in().or().limit() y
    // luego hace await. Sigue devolviendo las filas de la tabla, sin aplicar
    // el filtro (cada test deja en `estado.filas` justo lo que la query vería).
    q.in = () => q
    q.is = () => q
    q.or = () => q
    q.limit = () => q
    q.range = () => q
    q.order = () => q
    q.maybeSingle = () => {
      if (tabla === 'team') return Promise.resolve({ data: estado.team[q._id] || null, error: estado.teamError })
      return Promise.resolve({ data: null, error: null })
    }
    q.then = (onF, onR) => resultado().then(onF, onR)
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
      crm_contacts: DEF(['id', 'client_id', 'name', 'pipeline_id']),
      crm_pipelines: DEF(['id', 'client_id', 'name', 'is_default', 'stages']),
      crm_activities: DEF(['id', 'client_id', 'contact_id', 'description']),
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

describe('pasarela · el slug de un perfil', () => {
  // El MCP busca el perfil por slug: con mayúsculas o espacios, un alumno se
  // hacía pasar por el perfil de otra agencia.
  it('un perfil nuevo solo se crea con un slug válido', async () => {
    for (const slug of ['DETRAS-DE-CAMRA', 'detras-de-camra ', ' x', 'con espacio', '', undefined, 'agents']) {
      await expect(pide({ auth: AGENCIA, metodo: 'POST', tabla: 'clients', cuerpo: cuerpo({ name: 'Nuevo', slug }) }))
        .rejects.toMatchObject({ statusCode: 403 })
    }
  })

  it('una agencia no cambia el slug de su perfil; la plataforma sí', async () => {
    await expect(pide({ auth: AGENCIA, metodo: 'PATCH', tabla: 'clients', cuerpo: cuerpo({ slug: 'otro' }) }))
      .rejects.toMatchObject({ statusCode: 403 })
    await expect(pide({ auth: AGENCIA, metodo: 'PATCH', tabla: 'clients', cuerpo: cuerpo({ name: 'Otro nombre' }) }))
      .resolves.toBeTruthy()
    await expect(pide({ auth: { ...PLATAFORMA, agenciaId: 'ag-plat' }, ids: null, metodo: 'PATCH', tabla: 'clients', cuerpo: cuerpo({ slug: 'otro' }) }))
      .resolves.toBeTruthy()
  })
})

describe('pasarela · cada miembro solo ve su pipeline', () => {
  const SETTER = { role: 'client', clientId: 'p1', nivel: 'member', userId: 'login-ortega' }
  const ADMIN = { role: 'client', clientId: 'p1', nivel: 'admin', userId: 'login-admin' }
  const NINGUNO = '00000000-0000-0000-0000-000000000000'

  // El mock devuelve la tabla entera: aquí solo está lo que la query vería.
  function equipoOrtega() {
    estado.filas.helm_team = [{ name: '~Ortega', role: 'setter', client_id: 'p1', login_id: 'login-ortega' }]
    estado.filas.crm_pipelines = [
      { id: 'pipe-ortega', name: 'Ortega', is_default: false, client_id: 'p1' },
      { id: 'pipe-alex', name: 'Alex Abellaneda', is_default: true, client_id: 'p1' },
      { id: 'pipe-aron', name: 'aron', is_default: false, client_id: 'p1' },
    ]
    estado.filas.crm_contacts = [
      { id: 'c-ortega', pipeline_id: 'pipe-ortega', client_id: 'p1' },
      { id: 'c-alex', pipeline_id: 'pipe-alex', client_id: 'p1' },
      { id: 'c-suelto', pipeline_id: null, client_id: 'p1' },
    ]
  }

  it('~Ortega ve el pipeline Ortega, no el de Alex ni el de aron', async () => {
    equipoOrtega()
    const contactos = await pide({ auth: SETTER, tabla: 'crm_contacts' })
    expect(contactos.query.get('pipeline_id')).toBe('in.(pipe-ortega)')
    expect(contactos.query.get('or')).toBeNull()

    const pipes = await pide({ auth: SETTER, tabla: 'crm_pipelines' })
    expect(pipes.query.get('id')).toBe('in.(pipe-ortega)')

    // Buscar o abrir por id no quita el recorte: se suma al filtro.
    const ficha = await pide({
      auth: SETTER, tabla: 'crm_contacts',
      query: new URLSearchParams('id=eq.c-alex&name=ilike.*alex*'),
    })
    expect(ficha.query.get('id')).toBe('eq.c-alex')
    expect(ficha.query.get('name')).toBe('ilike.*alex*')
    expect(ficha.query.get('pipeline_id')).toBe('in.(pipe-ortega)')
  })

  it('la ficha (actividad) solo sale de sus contactos', async () => {
    equipoOrtega()
    const r = await pide({
      auth: SETTER, tabla: 'crm_activities',
      query: new URLSearchParams('contact_id=eq.c-alex'),
    })
    expect(r.query.get('contact_id')).toBe('eq.c-alex')
    expect(r.query.getAll('contact_id').some(v => v === 'in.(c-ortega)')).toBe(true)
    await expect(pide({
      auth: SETTER, metodo: 'POST', tabla: 'crm_activities',
      cuerpo: cuerpo({ client_id: 'p1', contact_id: 'c-alex', description: 'nota' }),
    })).rejects.toMatchObject({ statusCode: 403 })
    await expect(pide({
      auth: SETTER, metodo: 'POST', tabla: 'crm_activities',
      cuerpo: cuerpo({ client_id: 'p1', contact_id: 'c-ortega', description: 'nota' }),
    })).resolves.toBeTruthy()
  })

  it('si su pipeline es el por defecto, también ve los contactos sin pipeline', async () => {
    estado.filas.helm_team = [{ name: 'Alex Abellaneda', role: 'closer', client_id: 'p1' }]
    estado.filas.crm_pipelines = [
      { id: 'pipe-alex', name: 'Alex Abellaneda', is_default: true, client_id: 'p1' },
      { id: 'pipe-ortega', name: 'Ortega', is_default: false, client_id: 'p1' },
    ]
    const r = await pide({
      auth: { ...SETTER, userId: 'login-alex' }, tabla: 'crm_contacts',
    })
    expect(r.query.get('and')).toBe('(or(pipeline_id.in.(pipe-alex),pipeline_id.is.null))')
  })

  it('sin pipeline a su nombre no ve ninguno', async () => {
    estado.filas.helm_team = [{ name: 'Nadie', role: 'setter', client_id: 'p1' }]
    estado.filas.crm_pipelines = [
      { id: 'pipe-ortega', name: 'Ortega', is_default: true, client_id: 'p1' },
    ]
    const r = await pide({ auth: SETTER, tabla: 'crm_contacts' })
    expect(r.query.get('pipeline_id')).toBe(`in.(${NINGUNO})`)
    const pipes = await pide({ auth: SETTER, tabla: 'crm_pipelines' })
    expect(pipes.query.get('id')).toBe(`in.(${NINGUNO})`)
  })

  it('propietario, administrador, dueño, superadmin y un acceso sin ficha ven todo', async () => {
    equipoOrtega()
    for (const auth of [
      DUENO,
      { ...DUENO, userId: 'login-dueno' },
      ADMIN,
      { ...AGENCIA, userId: 'login-agencia' },
      { ...PLATAFORMA, ids: null },
      MIEMBRO,
    ]) {
      const ids = auth.ids === null ? null : ['p1']
      const r = await pide({ auth, ids, tabla: 'crm_contacts' })
      expect(r.query.get('pipeline_id'), auth.nivel || auth.role).toBeNull()
      expect(r.query.get('or'), auth.nivel || auth.role).toBeNull()
    }
    estado.filas.helm_team = [{ name: 'Ana', role: 'dueno', client_id: 'p1' }]
    const dueno = await pide({ auth: SETTER, tabla: 'crm_contacts' })
    expect(dueno.query.get('pipeline_id')).toBeNull()

    estado.filas.helm_team = []
    const suelto = await pide({ auth: SETTER, tabla: 'crm_contacts' })
    expect(suelto.query.get('pipeline_id')).toBeNull()
  })

  it('no mueve un contacto a otro pipeline, ni reescribe el ajeno, ni se apropia del por defecto', async () => {
    equipoOrtega()
    await expect(pide({
      auth: SETTER, metodo: 'POST', tabla: 'crm_contacts',
      cuerpo: cuerpo({ client_id: 'p1', name: 'Lead', pipeline_id: 'pipe-alex' }),
    })).rejects.toMatchObject({ statusCode: 403 })
    await expect(pide({
      auth: SETTER, metodo: 'POST', tabla: 'crm_contacts',
      cuerpo: cuerpo({ client_id: 'p1', name: 'Lead' }),
    })).rejects.toMatchObject({ statusCode: 403 })
    await expect(pide({
      auth: SETTER, metodo: 'POST', tabla: 'crm_contacts',
      cuerpo: cuerpo({ client_id: 'p1', name: 'Lead', pipeline_id: 'pipe-ortega' }),
    })).resolves.toBeTruthy()

    await expect(pide({
      auth: SETTER, metodo: 'PATCH', tabla: 'crm_contacts',
      cuerpo: cuerpo({ pipeline_id: 'pipe-alex' }),
    })).rejects.toMatchObject({ statusCode: 403 })
    const propio = await pide({
      auth: SETTER, metodo: 'PATCH', tabla: 'crm_contacts',
      query: new URLSearchParams('id=eq.c-alex'),
      cuerpo: cuerpo({ name: 'Sigue siendo mío' }),
    })
    expect(propio.query.get('pipeline_id')).toBe('in.(pipe-ortega)')

    estado.filas.crm_contacts = [{ id: 'c-alex', client_id: 'p1', pipeline_id: 'pipe-alex' }]
    await expect(pide({
      auth: SETTER, metodo: 'POST', tabla: 'crm_contacts',
      query: new URLSearchParams('on_conflict=id'),
      cuerpo: cuerpo({ id: 'c-alex', client_id: 'p1', name: 'robado' }),
      prefer: 'resolution=merge-duplicates',
    })).rejects.toMatchObject({ statusCode: 403 })

    await expect(pide({
      auth: SETTER, metodo: 'PATCH', tabla: 'crm_pipelines',
      cuerpo: cuerpo({ is_default: true }),
    })).rejects.toMatchObject({ statusCode: 403 })
    await expect(pide({
      auth: SETTER, metodo: 'PATCH', tabla: 'crm_pipelines',
      cuerpo: cuerpo({ name: 'Alex Abellaneda' }),
    })).rejects.toMatchObject({ statusCode: 403 })
    const etapas = await pide({
      auth: SETTER, metodo: 'PATCH', tabla: 'crm_pipelines',
      cuerpo: cuerpo({ name: '~Ortega', stages: [] }),
    })
    expect(etapas.query.get('id')).toBe('in.(pipe-ortega)')
  })

  it('si la ficha no tiene nombre, vale el del acceso', async () => {
    estado.filas.helm_team = [{ name: '  ', role: 'setter', client_id: 'p1' }]
    estado.filas.crm_pipelines = [
      { id: 'pipe-aron', name: 'aron', is_default: false, client_id: 'p1' },
    ]
    estado.team['login-ortega'] = { name: 'aron', active: true, role: 'member', client_id: 'p1' }
    const r = await pide({ auth: SETTER, tabla: 'crm_pipelines' })
    expect(r.query.get('id')).toBe('in.(pipe-aron)')
  })
})
