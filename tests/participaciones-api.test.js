// api/participaciones.js: la parte de las ventas de otro perfil que se lleva
// este. Solo con acceso al perfil que cobra la parte, solo de perfiles de su
// misma agencia y solo las participaciones activas. Sin red ni base.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const db = {}
function semilla() {
  db.helm_participaciones = [
    { client_id: 'silvestre', origen_id: 'ddc', porcentaje: 35, activa: true },
    { client_id: 'silvestre', origen_id: 'web', porcentaje: 50, activa: true },
    { client_id: 'silvestre', origen_id: 'ajeno', porcentaje: 90, activa: true },   // de otra agencia: no
    { client_id: 'silvestre', origen_id: 'viejo', porcentaje: 10, activa: false },  // inactiva: no
  ]
  db.clients = [
    { id: 'silvestre', slug: 'silvestre', name: 'Silvestre AI', agencia_id: 'ag-alex' },
    { id: 'ddc', slug: 'detras-de-camra', name: 'detras de camra', agencia_id: 'ag-alex' },
    { id: 'web', slug: 'web-seller', name: 'web-seller', agencia_id: 'ag-alex' },
    { id: 'ajeno', slug: 'ajeno', name: 'Ajeno', agencia_id: 'ag-otra' },
    { id: 'viejo', slug: 'viejo', name: 'Viejo', agencia_id: 'ag-alex' },
  ]
  db.sales = [
    { id: 's1', client_id: 'ddc', client_name: 'Alexander', revenue: 1182, cash_collected: 1182, installment_amount: 197, product: 'mensualidad', status: 'won', date: '2026-05-05' },
    { id: 's2', client_id: 'web', client_name: 'Isabel', revenue: 325, cash_collected: 250, installment_amount: null, product: 'web', status: 'won', date: '2026-10-19' },
    { id: 's3', client_id: 'ajeno', client_name: 'Secreto', revenue: 9999, cash_collected: 9999, product: 'x', status: 'won', date: '2026-10-01' },
  ]
}
function consulta(tabla) {
  const filtros = []
  const q = {
    select() { return q }, order() { return q }, range() { return q },
    eq(c, v) { filtros.push(r => r[c] === v); return q },
    in(c, vs) { filtros.push(r => vs.includes(r[c])); return q },
    then(ok, ko) { return Promise.resolve({ data: (db[tabla] || []).filter(r => filtros.every(f => f(r))), error: null }).then(ok, ko) },
  }
  return q
}
vi.mock('../api/lib/supabase.js', () => ({ supabase: { from: (t) => consulta(t) } }))
vi.mock('../api/_lib/auth.js', () => ({ applyCors: () => {} }))
const acceso = vi.hoisted(() => ({ puede: true }))
vi.mock('../api/_lib/access.js', () => ({
  requireProfileAccess: async () => { if (!acceso.puede) throw Object.assign(new Error('No tienes acceso a este perfil'), { statusCode: 403 }); return {} },
  agenciaDe: async (id) => db.clients.find(c => c.id === id)?.agencia_id || null,
}))

const { default: participaciones } = await import('../api/participaciones.js')

async function pide(query) {
  const res = { statusCode: 0, body: null, status(c) { this.statusCode = c; return this }, json(b) { this.body = b; return this }, end() { return this }, setHeader() {} }
  await participaciones({ method: 'GET', query }, res)
  return res
}

beforeEach(() => { semilla(); acceso.puede = true })

describe('api/participaciones', () => {
  it('devuelve la parte de cada perfil de su agencia, con los importes multiplicados', async () => {
    const r = await pide({ clientId: 'silvestre' })
    expect(r.statusCode).toBe(200)
    const porOrigen = Object.fromEntries(r.body.participaciones.map(p => [p.origen.slug, p]))
    expect(Object.keys(porOrigen).sort()).toEqual(['detras-de-camra', 'web-seller'])
    expect(porOrigen['detras-de-camra'].ventas[0]).toMatchObject({ client_name: 'Alexander', revenue: 413.7, cash_collected: 413.7, installment_amount: 68.95 })
    expect(porOrigen['web-seller'].ventas[0]).toMatchObject({ client_name: 'Isabel', revenue: 162.5, cash_collected: 125, installment_amount: null })
  })

  it('nunca lee ventas de un perfil de otra agencia ni de una participación inactiva', async () => {
    const r = await pide({ clientId: 'silvestre' })
    const nombres = r.body.participaciones.flatMap(p => p.ventas.map(v => v.client_name))
    expect(nombres).not.toContain('Secreto')
    expect(r.body.participaciones.map(p => p.origen.slug)).not.toContain('viejo')
  })

  it('sin acceso al perfil, 403; sin perfil, 400; un perfil sin participaciones, lista vacía', async () => {
    acceso.puede = false
    expect((await pide({ clientId: 'silvestre' })).statusCode).toBe(403)
    acceso.puede = true
    expect((await pide({})).statusCode).toBe(400)
    expect((await pide({ clientId: 'ddc' })).body).toEqual({ participaciones: [] })
  })
})
