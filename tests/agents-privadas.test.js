// El taller del operador (api/agents.js) y los creadores «Propio»: el contenido
// del propio cliente (sus vídeos de Drive transcritos) solo lo ven la
// plataforma y la agencia que lo tiene asignado. Los creadores públicos los
// consulta cualquier agencia. Sin red ni base: Supabase va simulado.
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── La base en memoria ──────────────────────────────────────────────────────
const db = {}
function semilla() {
  db.agent_identities = [
    { id: 'pub-1', nombre: 'rpn', slug: 'rpn', categoria: 'IA y tecnología' },
    { id: 'prop-silvestre', nombre: 'silvesttre.ia', slug: 'silvesttre-ia', categoria: 'Propio' },
    { id: 'prop-alumno', nombre: 'senza', slug: 'senza', categoria: 'propio' },
  ]
  db.agent_reels = [
    { id: 'r-pub', identity_id: 'pub-1', transcripcion: 'público' },
    { id: 'r-prop', identity_id: 'prop-silvestre', transcripcion: 'vídeo privado de un cliente' },
    { id: 'r-alumno', identity_id: 'prop-alumno', transcripcion: 'vídeo del alumno' },
    { id: 'r-huerfano', identity_id: null, transcripcion: 'sin creador' },
  ]
  // prop-silvestre es de un perfil de la agencia de Alex; prop-alumno, del alumno.
  db.agent_identity_clients = [
    { identity_id: 'prop-silvestre', client_id: 'perfil-silvestre' },
    { identity_id: 'prop-alumno', client_id: 'perfil-alumno' },
  ]
  db.clients = [
    { id: 'perfil-silvestre', slug: 'silvestre', name: 'Silvestre' },
    { id: 'perfil-alumno', slug: 'senza-studio', name: 'senza studio' },
  ]
}

function consulta(tabla) {
  const filtros = []
  let op = 'select'
  let filas = null
  const q = {
    select() { return q },
    order() { return q },
    limit() { return q },
    eq(c, v) { filtros.push(r => r[c] === v); return q },
    in(c, vs) { filtros.push(r => vs.includes(r[c])); return q },
    delete() { op = 'delete'; return q },
    insert(rs) { op = 'insert'; filas = rs; return q },
    maybeSingle() { return Promise.resolve({ data: (db[tabla] || []).filter(r => filtros.every(f => f(r)))[0] || null, error: null }) },
    then(ok, ko) {
      let r
      if (op === 'delete') { db[tabla] = (db[tabla] || []).filter(x => !filtros.every(f => f(x))); r = { error: null } }
      else if (op === 'insert') { db[tabla].push(...filas); r = { error: null } }
      else r = { data: (db[tabla] || []).filter(x => filtros.every(f => f(x))).map(x => (tabla === 'agent_identities' ? { ...x, agent_reels: [] } : x)), error: null }
      return Promise.resolve(r).then(ok, ko)
    },
  }
  return q
}

vi.mock('../api/lib/supabase.js', () => ({ supabase: { from: (t) => consulta(t) } }))
vi.mock('../api/_lib/auth.js', () => ({ wrap: (h) => h }))
vi.mock('../api/_lib/access.js', () => ({
  perfilesVisibles: async (auth) => (auth.plataforma ? null : auth.perfiles),
  puedeVerPerfil: async (auth, id) => auth.plataforma || auth.perfiles.includes(id),
}))
vi.mock('../api/agentes-perfil.js', () => ({ fichaDe: async (id) => ({ ficha: id }) }))
vi.mock('../api/_lib/ingesta.js', () => ({ resumenDrive: async () => ({}) }))
vi.mock('../api/_lib/instagram.js', () => ({ getIgConfig: async () => null }))
vi.mock('../api/_lib/equipo.js', () => ({ AGENTES: {}, AGENTES_LANZABLES: [], encolaAgente: async () => ({}), tokensDeHoy: async () => 0, flujoPiezas: () => [] }))

const { default: agents } = await import('../api/agents.js')

const PLATAFORMA = { plataforma: true, superadmin: true }
const ALUMNO = { superadmin: true, agenciaId: 'ag-alumno', perfiles: ['perfil-alumno'] }

async function pide(auth, accion, { query = {}, body } = {}) {
  const res = { statusCode: 0, body: null, status(c) { this.statusCode = c; return this }, json(b) { this.body = b; return this } }
  await agents({ method: body ? 'POST' : 'GET', query: { action: accion, ...query }, body, ctx: { auth } }, res)
  return res
}

beforeEach(semilla)

describe('creadores «Propio» entre agencias', () => {
  it('la plataforma los ve todos', async () => {
    const r = await pide(PLATAFORMA, 'identidades')
    expect(r.body.identidades.map(i => i.id).sort()).toEqual(['prop-alumno', 'prop-silvestre', 'pub-1'])
  })

  it('una agencia ve los públicos y su «Propio», nunca el de otro cliente', async () => {
    const r = await pide(ALUMNO, 'identidades')
    expect(r.body.identidades.map(i => i.id).sort()).toEqual(['prop-alumno', 'pub-1'])
  })

  it('no puede abrir la ficha, la lista de reels ni un reel de un «Propio» ajeno', async () => {
    expect((await pide(ALUMNO, 'identidad-ficha', { query: { slug: 'silvesttre-ia' } })).statusCode).toBe(404)
    expect((await pide(ALUMNO, 'reels', { query: { identityId: 'prop-silvestre' } })).statusCode).toBe(404)
    expect((await pide(ALUMNO, 'reel', { query: { id: 'r-prop' } })).statusCode).toBe(404)
    expect((await pide(ALUMNO, 'identidad-perfiles', { query: { identityId: 'prop-silvestre' } })).statusCode).toBe(404)
  })

  it('sin creador, la lista de reels no trae los privados ajenos ni los huérfanos', async () => {
    const r = await pide(ALUMNO, 'reels')
    expect(r.body.reels.map(x => x.id).sort()).toEqual(['r-alumno', 'r-pub'])
  })

  it('sí puede leer lo público y lo suyo', async () => {
    expect((await pide(ALUMNO, 'reel', { query: { id: 'r-pub' } })).body.reel.id).toBe('r-pub')
    expect((await pide(ALUMNO, 'reel', { query: { id: 'r-alumno' } })).body.reel.id).toBe('r-alumno')
    expect((await pide(ALUMNO, 'identidad-ficha', { query: { slug: 'senza' } })).statusCode).toBe(200)
  })

  it('no puede asignarse el «Propio» de otro cliente (se descarta), sí los públicos y el suyo', async () => {
    const r = await pide(ALUMNO, 'perfil-creadores-guardar', { body: { clientId: 'perfil-alumno', identityIds: ['pub-1', 'prop-silvestre', 'prop-alumno'] } })
    expect(r.body.identityIds.sort()).toEqual(['prop-alumno', 'pub-1'])
    const deAlumno = db.agent_identity_clients.filter(a => a.client_id === 'perfil-alumno').map(a => a.identity_id).sort()
    expect(deAlumno).toEqual(['prop-alumno', 'pub-1'])
    // Y la asignación de Silvestre sigue intacta.
    expect(db.agent_identity_clients).toContainEqual({ identity_id: 'prop-silvestre', client_id: 'perfil-silvestre' })
  })

  it('tampoco puede asignar un «Propio» ajeno desde la ficha del creador', async () => {
    const r = await pide(ALUMNO, 'identidad-perfiles-guardar', { body: { identityId: 'prop-silvestre', clientIds: ['perfil-alumno'] } })
    expect(r.statusCode).toBe(404)
    expect(db.agent_identity_clients.filter(a => a.client_id === 'perfil-alumno')).toEqual([{ identity_id: 'prop-alumno', client_id: 'perfil-alumno' }])
  })

  it('la plataforma puede asignar cualquiera', async () => {
    const r = await pide(PLATAFORMA, 'perfil-creadores-guardar', { body: { clientId: 'perfil-alumno', identityIds: ['prop-silvestre'] } })
    expect(r.body.identityIds).toEqual(['prop-silvestre'])
  })
})
