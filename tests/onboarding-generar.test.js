// La generación de las Biblias (api/onboarding.js · generate) ahora que el alta
// es el único onboarding: solo el formulario de contenido (o un panel viejo que
// no dice de cuál sale) se da por completado al generar, y una Biblia retocada
// a mano se archiva antes de sustituirla.
// Sin red ni base: Supabase, el almacenamiento y la IA van simulados.
import { describe, it, expect, vi, beforeEach } from 'vitest'

process.env.JWT_SECRET = 'secreto-de-prueba-generar-0123456789-0123456789'
const PERFIL = 'c0000000-0000-4000-8000-0000000000b1'

const { db, consulta, subidas } = vi.hoisted(() => {
  const db = {}
  const subidas = []
  function consulta(tabla) {
    const filtros = []
    let alta = null, cambio = null
    const filas = () => (db[tabla] ||= [])
    const encaja = (f) => filtros.every(([c, v]) => f[c] === v)
    const q = {
      select() { return q }, in() { return q }, is() { return q },
      eq(c, v) { filtros.push([c, v]); return q },
      upsert(row) { alta = row; return q },
      update(row) { cambio = row; return q },
      insert(row) { filas().push(row); return q },
      maybeSingle() { return Promise.resolve({ data: structuredClone(filas().find(encaja) || null), error: null }) },
      single() {
        if (!alta) return Promise.resolve({ data: structuredClone(filas().find(encaja) || null), error: null })
        const i = filas().findIndex(f => f.client_id === alta.client_id && f.kind === alta.kind)
        if (i >= 0) filas()[i] = { ...filas()[i], ...alta }
        else filas().push(alta)
        return Promise.resolve({ data: structuredClone(alta), error: null })
      },
      then(ok, mal) {
        if (cambio) filas().filter(encaja).forEach(f => Object.assign(f, cambio))
        return Promise.resolve({ data: filas().filter(encaja), error: null }).then(ok, mal)
      },
    }
    return q
  }
  return { db, consulta, subidas }
})
vi.mock('../api/lib/supabase.js', () => ({
  supabase: {
    from: (t) => consulta(t),
    storage: {
      from: () => ({
        upload: async (path, content) => { subidas.push({ path, content }); return { error: null } },
        getPublicUrl: (path) => ({ data: { publicUrl: `https://x/${path}` } }),
      }),
    },
  },
}))
vi.mock('../api/_lib/notificar.js', () => ({ notificar: vi.fn(async () => 'n-1'), notificarAgencia: vi.fn() }))
vi.mock('../api/_lib/llm.js', () => ({ llmChat: vi.fn(async () => '# Biblia nueva') }))

const { default: onboarding } = await import('../api/onboarding.js')
const { signJwt } = await import('../api/_lib/auth.js')

let ip = 0
async function generate(body) {
  const res = { statusCode: 0, body: null, status(c) { this.statusCode = c; return this }, json(b) { this.body = b; return this }, end() { return this }, setHeader() {} }
  const tok = await signJwt({ sub: 'u-1', clientId: PERFIL, role: 'user' })
  await onboarding({
    method: 'POST', query: { action: 'generate' }, body: { clientId: PERFIL, ...body },
    headers: { authorization: `Bearer ${tok}`, 'x-forwarded-for': `10.9.0.${++ip}` }, socket: {},
  }, res)
  return res
}

beforeEach(() => {
  db.clients = [{ id: PERFIL, name: 'x', active: true, agencia_id: 'ag-1' }]
  db.helm_onboarding = [{ client_id: PERFIL, form: 'contenido', status: 'draft', completed_at: null }]
  db.helm_biblia = []
  db.helm_files = []
  subidas.length = 0
})

describe('generate', () => {
  it.each([
    [undefined, 'completed'], ['contenido', 'completed'], ['alta', 'draft'], ['biblia', 'draft'],
  ])('form=%s → el formulario de contenido queda %s', async (form, esperado) => {
    const r = await generate({ kind: 'empresa', dossier: 'algo', ...(form ? { form } : {}) })
    expect(r.statusCode).toBe(200)
    expect(db.helm_onboarding[0].status).toBe(esperado)
  })

  it('una Biblia editada a mano se archiva antes de sustituirla', async () => {
    db.helm_biblia = [{ client_id: PERFIL, kind: 'empresa', title: 'Biblia de Empresa', content: 'LA MÍA, RETOCADA', status: 'edited' }]
    const r = await generate({ kind: 'empresa', dossier: 'algo', form: 'alta' })
    expect(r.statusCode).toBe(200)
    expect(subidas.map(s => s.content)).toContain('LA MÍA, RETOCADA')
    expect(db.helm_files.some(f => /editada a mano/.test(f.name))).toBe(true)
    expect(db.helm_biblia[0]).toMatchObject({ content: '# Biblia nueva', status: 'generated' })
  })

  it('una generada no se archiva dos veces', async () => {
    db.helm_biblia = [{ client_id: PERFIL, kind: 'empresa', title: 'Biblia de Empresa', content: 'vieja generada', status: 'generated' }]
    await generate({ kind: 'empresa', dossier: 'algo', form: 'alta' })
    expect(subidas.map(s => s.content)).not.toContain('vieja generada')
  })
})
