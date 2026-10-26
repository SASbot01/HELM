// Panel de accesos (api/accesos.js · solo superadmin): lista las solicitudes
// pendientes y las aprueba o rechaza, cambiando el estado en el propio contacto.
// Sin red ni base: Supabase, la auth y el correo van simulados.
import { describe, it, expect, vi, beforeEach } from 'vitest'

let lista = []        // lo que devuelve la consulta de pendientes
let fila = null       // el contacto que se aprueba/rechaza
let school = null     // el embudo School del perfil, si lo tiene
const ops = []
function consulta(tabla) {
  const q = {
    tabla, filtros: [],
    select() { return q },
    eq(c, v) { q.filtros.push([c, v]); return q },
    filter(c, op, v) { q.filtros.push([c, op, v]); return q },
    order() { return q }, limit() { return q },
    update(cambios) { ops.push({ op: 'update', tabla, cambios }); return q },
    maybeSingle() {
      if (tabla === 'clients') return Promise.resolve({ data: { id: 'id-silvestre' }, error: null })
      if (tabla === 'crm_contacts') return Promise.resolve({ data: fila, error: null })
      if (tabla === 'crm_pipelines') return Promise.resolve({ data: school, error: null })
      return Promise.resolve({ data: null, error: null })
    },
    then(ok) { return Promise.resolve({ data: tabla === 'crm_contacts' ? lista : [], error: null }).then(ok) },
  }
  return q
}
vi.mock('../api/lib/supabase.js', () => ({ supabase: { from: (t) => consulta(t) } }))
vi.mock('../api/_lib/auth.js', () => ({ applyCors: () => {}, requireSuperAdmin: vi.fn(async () => ({ superadmin: true, agenciaId: 'ag-1' })) }))
const puedeVerPerfil = vi.hoisted(() => vi.fn(async () => true))
vi.mock('../api/_lib/access.js', () => ({ puedeVerPerfil }))
const enviarCorreo = vi.hoisted(() => vi.fn(async () => ({ enviado: true })))
let conCorreo = false
vi.mock('../api/_lib/correo.js', () => ({ hayCorreo: () => conCorreo, enviarCorreo }))

const { default: accesos } = await import('../api/accesos.js')

function respuesta() {
  return {
    statusCode: 0, body: null,
    status(c) { this.statusCode = c; return this },
    json(b) { this.body = b; return this },
    end() { return this }, setHeader() {},
  }
}
const pide = async ({ method = 'GET', action, body } = {}) => {
  const res = respuesta()
  await accesos({ method, query: { action, comunidad: 'aiparatodo' }, body }, res)
  return res
}

beforeEach(() => { lista = []; fila = null; school = null; ops.length = 0; conCorreo = false; enviarCorreo.mockClear(); puedeVerPerfil.mockClear(); puedeVerPerfil.mockResolvedValue(true) })

describe('pendientes', () => {
  it('lista las solicitudes con nombre, correo, fecha y si se apuntó al Skool', async () => {
    lista = [
      { id: 'c1', name: 'Marta', email: 'marta@example.com', custom_fields: { aiparatodo: { acceso: 'pendiente', solicitado: '2026-10-22T09:00:00Z' }, school: { apuntado: 'x' } }, updated_at: '2026-10-22T09:00:00Z' },
      { id: 'c2', name: 'Leo', email: 'leo@example.com', custom_fields: { aiparatodo: { acceso: 'pendiente', solicitado: '2026-10-22T08:00:00Z' } }, updated_at: '2026-10-22T08:00:00Z' },
    ]
    const r = await pide({ action: 'pendientes' })
    expect(r.statusCode).toBe(200)
    expect(r.body.accesos).toEqual([
      { id: 'c1', nombre: 'Marta', email: 'marta@example.com', solicitado: '2026-10-22T09:00:00Z', enSkool: true },
      { id: 'c2', nombre: 'Leo', email: 'leo@example.com', solicitado: '2026-10-22T08:00:00Z', enSkool: false },
    ])
  })

  it('un superadmin de otra agencia no puede: 403', async () => {
    puedeVerPerfil.mockResolvedValueOnce(false)
    const r = await pide({ action: 'pendientes' })
    expect(r.statusCode).toBe(403)
  })
})

describe('aprobar y rechazar', () => {
  it('aprobar pone el estado en aprobado y devuelve el enlace de entrada', async () => {
    fila = { id: 'c1', name: 'Marta', email: 'marta@example.com', custom_fields: { aiparatodo: { acceso: 'pendiente' } } }
    const r = await pide({ method: 'POST', action: 'aprobar', body: { id: 'c1' } })
    expect(r.statusCode).toBe(200)
    expect(r.body).toMatchObject({ ok: true, estado: 'aprobado', enlace: 'https://s4sf.net/aiparatodo' })
    expect(r.body.correo.enviado).toBe(false)              // sin correo saliente configurado
    const [u] = ops.filter(o => o.op === 'update')
    expect(u.cambios.custom_fields.aiparatodo.acceso).toBe('aprobado')
    expect(enviarCorreo).not.toHaveBeenCalled()
  })

  it('con correo configurado, al aprobar se le manda el enlace', async () => {
    conCorreo = true
    fila = { id: 'c2', name: 'Leo', email: 'leo@example.com', custom_fields: {} }
    const r = await pide({ method: 'POST', action: 'aprobar', body: { id: 'c2' } })
    expect(r.body.correo.enviado).toBe(true)
    expect(enviarCorreo).toHaveBeenCalledTimes(1)
    expect(enviarCorreo.mock.calls[0][0].para).toBe('leo@example.com')
  })

  it('rechazar pone el estado en rechazado y no manda nada', async () => {
    fila = { id: 'c3', name: 'X', email: 'x@example.com', custom_fields: { aiparatodo: { acceso: 'pendiente' } } }
    const r = await pide({ method: 'POST', action: 'rechazar', body: { id: 'c3' } })
    expect(r.body).toEqual({ ok: true, estado: 'rechazado' })
    expect(ops.find(o => o.op === 'update').cambios.custom_fields.aiparatodo.acceso).toBe('rechazado')
    expect(enviarCorreo).not.toHaveBeenCalled()
  })

  it('aprobado, pasa a School · «Acceso dado» si el perfil tiene ese embudo; rechazado, no se mueve', async () => {
    school = { id: 'p-school', stages: [{ key: 'apuntado' }, { key: 'acceso_dado' }] }
    fila = { id: 'c4', name: 'Bilal', email: 'b@example.com', custom_fields: { aiparatodo: { acceso: 'pendiente' } } }
    await pide({ method: 'POST', action: 'aprobar', body: { id: 'c4' } })
    expect(ops.find(o => o.op === 'update').cambios).toMatchObject({ pipeline_id: 'p-school', status: 'acceso_dado' })
    ops.length = 0
    await pide({ method: 'POST', action: 'rechazar', body: { id: 'c4' } })
    expect(ops.find(o => o.op === 'update').cambios).not.toHaveProperty('pipeline_id')
  })

  it('sin embudo School (u otro sin «Acceso dado»), aprobar no toca el pipeline', async () => {
    fila = { id: 'c5', name: 'Y', email: 'y@example.com', custom_fields: {} }
    await pide({ method: 'POST', action: 'aprobar', body: { id: 'c5' } })
    expect(ops.find(o => o.op === 'update').cambios).not.toHaveProperty('pipeline_id')
    school = { id: 'p-otro', stages: [{ key: 'apuntado' }] }
    ops.length = 0
    await pide({ method: 'POST', action: 'aprobar', body: { id: 'c5' } })
    expect(ops.find(o => o.op === 'update').cambios).not.toHaveProperty('pipeline_id')
  })

  it('sin id, 400; si ya no está, 404', async () => {
    expect((await pide({ method: 'POST', action: 'aprobar', body: {} })).statusCode).toBe(400)
    fila = null
    expect((await pide({ method: 'POST', action: 'aprobar', body: { id: 'noexiste' } })).statusCode).toBe(404)
  })
})
