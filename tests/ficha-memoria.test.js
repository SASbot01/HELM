// La ficha de un creador (api/agentes-perfil.js → fichaDe), la que enseñan el
// taller y la pestaña de creadores de un perfil: las notas sin perfil son de la
// plataforma y las ve cualquiera; las que una agencia guardó por el MCP llevan
// su perfil y solo las ve esa agencia. Sin red ni base.
import { describe, it, expect, vi } from 'vitest'

const db = {
  agent_identities: [{ id: 'i1', nombre: 'Referente', slug: 'referente' }],
  agent_reels: [],
  clients: [
    { id: 'p-alex', slug: 'detras-de-camra', name: 'DDC', agencia_id: 'ag-alex' },
    { id: 'p-alumno', slug: 'senza', name: 'Senza', agencia_id: 'ag-alumno' },
  ],
  agent_memory: [
    { id: 'm1', identity_id: 'i1', client_id: null, contenido: 'de la plataforma', updated_at: '2026-10-01' },
    { id: 'm2', identity_id: 'i1', client_id: 'p-alumno', contenido: 'del alumno', updated_at: '2026-10-02' },
    { id: 'm3', identity_id: 'i1', client_id: 'p-alex', contenido: 'de Alex', updated_at: '2026-10-03' },
  ],
  agent_identity_clients: [{ identity_id: 'i1', client_id: 'p-alex' }, { identity_id: 'i1', client_id: 'p-alumno' }],
}

function consulta(tabla) {
  const filtros = []
  let sel = '*'
  const filas = () => (db[tabla] || []).filter(r => filtros.every(f => f(r))).map(r => {
    const x = { ...r }
    if (/clients\(/.test(sel)) x.clients = db.clients.find(c => c.id === r.client_id) || null
    return x
  })
  const q = {
    select(s) { sel = s; return q }, order() { return q }, limit() { return q },
    eq(c, v) { filtros.push(r => r[c] === v); return q },
    single() { return Promise.resolve({ data: filas()[0] || null, error: null }) },
    then(ok, ko) { return Promise.resolve({ data: filas(), error: null }).then(ok, ko) },
  }
  return q
}
vi.mock('../api/lib/supabase.js', () => ({ supabase: { from: (t) => consulta(t) } }))

const { fichaDe } = await import('../api/agentes-perfil.js')

describe('ficha de un creador · memoria por agencia', () => {
  it('una agencia ve las notas de la plataforma y las suyas, no las de otra', async () => {
    const alumno = await fichaDe('i1', (_, agencia) => agencia === 'ag-alumno')
    expect(alumno.memoria.map(n => n.contenido).sort()).toEqual(['de la plataforma', 'del alumno'])
    expect(alumno.memoria[0]).not.toHaveProperty('client_id')
  })

  it('la plataforma las ve todas', async () => {
    const todas = await fichaDe('i1')
    expect(todas.memoria).toHaveLength(3)
  })
})
