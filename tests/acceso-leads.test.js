// AI para todo con aprobación (api/leads.js · solicitar-acceso, comprobar-acceso):
// se pide acceso (nombre y correo) y queda 'pendiente' en el propio contacto;
// no se devuelve ficha hasta que esté 'aprobado'. Sin red ni base: Supabase y el
// aviso van simulados.
import { describe, it, expect, vi, beforeEach } from 'vitest'

process.env.JWT_SECRET = 'secreto-de-prueba-para-los-tests-de-acceso-0123456789'

const ops = []
let existente = null                 // el contacto que ya está en el CRM, si lo hay
function consulta(tabla) {
  const q = {
    tabla, filtros: [],
    select() { return q },
    eq(c, v) { q.filtros.push([c, v]); return q },
    ilike(c, v) { q.filtros.push([c, v]); return q },
    limit() { return q },
    order() { return q },
    insert(fila) { ops.push({ op: 'insert', tabla, fila }); return q },
    update(cambios) { ops.push({ op: 'update', tabla, cambios }); return q },
    single() { return Promise.resolve({ data: { id: 'contacto-nuevo' }, error: null }) },
    maybeSingle() {
      const v = Object.fromEntries(q.filtros)
      if (tabla === 'clients') return Promise.resolve({ data: { id: `id-de-${v.slug}`, active: true }, error: null })
      if (tabla === 'crm_pipelines') return Promise.resolve({ data: { id: `${v.client_id}/${v.name}`, stages: [{ key: 'lead_nuevo' }] }, error: null })
      return Promise.resolve({ data: null, error: null })
    },
    then(ok) { return Promise.resolve({ data: tabla === 'crm_contacts' && existente ? [existente] : [], error: null }).then(ok) },
  }
  ops.push({ op: 'from', tabla, q })
  return q
}
vi.mock('../api/lib/supabase.js', () => ({ supabase: { from: (t) => consulta(t) } }))
const notificar = vi.hoisted(() => vi.fn(async () => null))
vi.mock('../api/_lib/notificar.js', () => ({ notificar }))

const { default: leads } = await import('../api/leads.js')
const { verifyJwt } = await import('../api/_lib/auth.js')

function respuesta() {
  return {
    statusCode: 0, body: null,
    status(c) { this.statusCode = c; return this },
    json(b) { this.body = b; return this },
    end() { return this }, setHeader() {},
  }
}
let ip = 0
const pide = async (action, body) => {
  const res = respuesta()
  await leads({ method: 'POST', query: { action }, body, headers: { 'x-forwarded-for': `10.1.0.${++ip}` }, socket: {} }, res)
  return res
}
const inserts = () => ops.filter(o => o.op === 'insert' && o.tabla === 'crm_contacts').map(o => o.fila)
const updates = () => ops.filter(o => o.op === 'update' && o.tabla === 'crm_contacts').map(o => o.cambios)

beforeEach(() => { ops.length = 0; existente = null; notificar.mockClear() })

describe('solicitar-acceso', () => {
  it('nuevo: queda pendiente en silvestre, no da ficha y avisa a Alex', async () => {
    const r = await pide('solicitar-acceso', { comunidad: 'aiparatodo', nombre: 'Marta', email: 'marta@example.com' })
    expect(r.statusCode).toBe(200)
    expect(r.body).toEqual({ estado: 'pendiente' })
    const [fila] = inserts()
    expect(fila.client_id).toBe('id-de-silvestre')
    expect(fila.custom_fields.aiparatodo.acceso).toBe('pendiente')
    expect(notificar).toHaveBeenCalledTimes(1)
    expect(notificar.mock.calls[0][2].cuerpo).toMatch(/marta@example.com/)
  })

  it('si ya estaba aprobado, entra directo (devuelve ficha) y no inserta', async () => {
    existente = { id: 'c-aprobado', name: 'Leo', custom_fields: { aiparatodo: { acceso: 'aprobado' } } }
    const r = await pide('solicitar-acceso', { comunidad: 'aiparatodo', nombre: 'Leo', email: 'leo@example.com' })
    expect(r.statusCode).toBe(200)
    expect(r.body.estado).toBe('aprobado')
    const ficha = await verifyJwt(r.body.id)
    expect(ficha).toMatchObject({ kind: 'lead', sub: 'c-aprobado' })
    expect(inserts()).toHaveLength(0)
    expect(notificar).not.toHaveBeenCalled()
  })

  it('si ya estaba pendiente, no vuelve a avisar (solo actualiza)', async () => {
    existente = { id: 'c-pend', name: 'Ada', notes: '', custom_fields: { aiparatodo: { acceso: 'pendiente' } } }
    const r = await pide('solicitar-acceso', { comunidad: 'aiparatodo', nombre: 'Ada', email: 'ada@example.com' })
    expect(r.body).toEqual({ estado: 'pendiente' })
    expect(inserts()).toHaveLength(0)
    expect(updates()).toHaveLength(1)
    expect(notificar).not.toHaveBeenCalled()
  })

  it('la trampa (website) y el correo malo se rechazan', async () => {
    expect((await pide('solicitar-acceso', { comunidad: 'aiparatodo', nombre: 'Bot', email: 'b@b.com', website: 'http://x' })).statusCode).toBe(400)
    expect((await pide('solicitar-acceso', { comunidad: 'aiparatodo', nombre: 'Sin correo', email: 'nop' })).statusCode).toBe(400)
    expect(inserts()).toHaveLength(0)
  })
})

describe('comprobar-acceso', () => {
  it('aprobado devuelve la ficha para entrar', async () => {
    existente = { id: 'c9', custom_fields: { aiparatodo: { acceso: 'aprobado' } } }
    const r = await pide('comprobar-acceso', { comunidad: 'aiparatodo', email: 'ok@example.com' })
    expect(r.body.estado).toBe('aprobado')
    expect((await verifyJwt(r.body.id)).sub).toBe('c9')
  })

  it('no distingue pendiente de desconocido (no deja sondear el CRM)', async () => {
    existente = { id: 'c8', custom_fields: { aiparatodo: { acceso: 'pendiente' } } }
    expect((await pide('comprobar-acceso', { comunidad: 'aiparatodo', email: 'p@example.com' })).body).toEqual({ estado: 'pendiente' })
    existente = null
    expect((await pide('comprobar-acceso', { comunidad: 'aiparatodo', email: 'nadie@example.com' })).body).toEqual({ estado: 'pendiente' })
  })
})

describe('school (formulario de HELM Academy)', () => {
  it('guarda el lead en silvestre con sus datos y responde ok', async () => {
    const r = await pide('school', { nombre: 'Noa', email: 'noa@example.com', dedico: 'diseño', edad: '28', residencia: 'Lorca', telefono: '600111222' })
    expect(r.statusCode).toBe(200)
    expect(r.body).toEqual({ ok: true })
    const [fila] = inserts()
    expect(fila.client_id).toBe('id-de-silvestre')
    expect(fila.phone).toBe('600111222')
    expect(fila.source).toBe('HELM Academy')
    expect(fila.custom_fields.school).toMatchObject({ dedico: 'diseño', edad: '28', residencia: 'Lorca', telefono: '600111222' })
  })

  it('la trampa y el correo malo se rechazan', async () => {
    expect((await pide('school', { nombre: 'Bot', email: 'b@b.com', website: 'x', dedico: 'x', edad: '1', residencia: 'x', telefono: '1' })).statusCode).toBe(400)
    expect((await pide('school', { nombre: 'X', email: 'nop' })).statusCode).toBe(400)
    expect(inserts()).toHaveLength(0)
  })
})
