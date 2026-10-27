// La sección Agentes de un perfil (api/agentes-perfil.js) sin la organización
// de Drive: «grabar» solo marca el guion (ni mira la Entrada ni encola nada),
// el panel «drive» ya no existe y las fases del Roadmap siguen saliendo de
// Drive. Sin red ni base.
import { describe, it, expect, vi, beforeEach } from 'vitest'

let db = {}
const ops = []

function consulta(tabla) {
  const filtros = []
  let op = 'select'
  let cambios = null
  const filas = () => (db[tabla] || []).filter(r => filtros.every(f => f(r)))
  const q = {
    select() { return q },
    eq(c, v) { filtros.push(r => r[c] === v); return q },
    update(c) { op = 'update'; cambios = c; return q },
    insert(f) { ops.push({ op: 'insert', tabla, f }); return q },
    upsert(f) { ops.push({ op: 'upsert', tabla, f }); return q },
    maybeSingle() { return Promise.resolve({ data: filas()[0] || null, error: null }) },
    then(ok, ko) {
      if (op === 'update') {
        for (const r of filas()) Object.assign(r, cambios)
        ops.push({ op: 'update', tabla, cambios })
      }
      return Promise.resolve({ data: op === 'select' ? filas() : null, error: null }).then(ok, ko)
    },
  }
  return q
}
vi.mock('../api/lib/supabase.js', () => ({ supabase: { from: (t) => consulta(t) } }))
vi.mock('../api/_lib/auth.js', () => ({ applyCors: () => {} }))
vi.mock('../api/_lib/access.js', () => ({ requireProfileAccess: async () => {}, agenciaDe: async () => 'ag-1' }))

// Con un vídeo esperando en la Entrada: si «grabar» volviera a mirarla, se vería.
const enEntrada = vi.fn(async () => [{ id: 'video-en-entrada', name: 'toma.mov' }])
const resumenDrive = vi.fn(async () => ({
  conectado: true,
  carpeta: { nombre: 'Perfil', url: 'https://drive.google.com/drive/folders/raiz', entrada: 'https://drive.google.com/drive/folders/entrada' },
  guiones: [{ id: 'g1', fase: 'editado' }, { id: 'g2', fase: 'por_grabar' }],
}))
vi.mock('../api/_lib/ingesta.js', () => ({
  enEntrada: (...a) => enEntrada(...a),
  resumenDrive: (...a) => resumenDrive(...a),
}))

const { default: handler } = await import('../api/agentes-perfil.js')

async function pide(accion, { body, query = {} } = {}) {
  const res = { statusCode: 0, body: null, status(c) { this.statusCode = c; return this }, json(b) { this.body = b; return this }, end() { return this } }
  await handler({ method: body ? 'POST' : 'GET', query: { action: accion, clientId: 'perfil-1', ...query }, body }, res)
  return res
}

beforeEach(() => {
  ops.length = 0
  enEntrada.mockClear()
  resumenDrive.mockClear()
  db = {
    helm_content_calendar: [
      { id: 'g1', client_id: 'perfil-1', grabado: false, grabado_at: null, drive_carpeta_id: 'carpeta-g1' },
      { id: 'g2', client_id: 'perfil-1', grabado: true, grabado_at: '2026-10-20T10:00:00Z', drive_carpeta_id: null },
    ],
  }
})

describe('agentes-perfil · grabar', () => {
  it('marca el guion como grabado y devuelve su carpeta, sin mirar la Entrada de Drive', async () => {
    const r = await pide('grabar', { body: { guionId: 'g1' } })
    expect(r.statusCode).toBe(200)
    expect(r.body).toEqual({ grabado: true, driveUrl: 'https://drive.google.com/drive/folders/carpeta-g1' })
    expect(db.helm_content_calendar[0].grabado).toBe(true)
    expect(db.helm_content_calendar[0].grabado_at).toBeTruthy()
    expect(enEntrada).not.toHaveBeenCalled()
    expect(ops.filter(o => ['agent_jobs', 'agent_drive_videos'].includes(o.tabla))).toHaveLength(0)
  })

  it('desmarcar lo deja sin grabar y tampoco toca Drive', async () => {
    const r = await pide('grabar', { body: { guionId: 'g2', grabado: false } })
    expect(r.body).toEqual({ grabado: false, driveUrl: null })
    expect(db.helm_content_calendar[1]).toMatchObject({ grabado: false, grabado_at: null })
    expect(enEntrada).not.toHaveBeenCalled()
  })

  it('un guion de otro perfil no se marca', async () => {
    db.helm_content_calendar[0].client_id = 'perfil-otro'
    const r = await pide('grabar', { body: { guionId: 'g1' } })
    expect(r.statusCode).toBe(404)
    expect(ops.filter(o => o.op === 'update')).toHaveLength(0)
  })
})

describe('agentes-perfil · sin el panel de Drive', () => {
  it('la acción «drive» (el antiguo Calendario de guiones) ya no existe', async () => {
    const r = await pide('drive')
    expect(r.statusCode).toBe(400)
    expect(r.body.error).toMatch(/Acción desconocida/)
    expect(resumenDrive).not.toHaveBeenCalled()
  })

  it('las fases del Roadmap siguen saliendo de dónde está cada carpeta en Drive', async () => {
    const r = await pide('fases')
    expect(r.body).toEqual({
      conectado: true,
      fases: { g1: 'editado', g2: 'por_grabar' },
      carpeta: expect.objectContaining({ entrada: 'https://drive.google.com/drive/folders/entrada' }),
    })
  })

  it('sin Drive conectado, las fases salen vacías y no revienta', async () => {
    resumenDrive.mockRejectedValueOnce(new Error('Falta la llave de helm-drive'))
    const r = await pide('fases')
    expect(r.statusCode).toBe(200)
    expect(r.body).toEqual({ conectado: false, fases: {} })
  })
})
