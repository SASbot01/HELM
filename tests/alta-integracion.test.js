// El alta en HELM de punta a punta, con las tres piezas juntas: el panel
// (onboardingApi.enlaceAlta y saveOnboardingDraft de src/helm/lib.js), las
// peticiones de la página pública (src/pages/AltaHelm.jsx) y el servidor
// (api/onboarding.js), todos sobre la MISMA base simulada. Lo que se comprueba
// es que encajan: la URL que firma el servidor es la que abre la página, lo que
// manda la página es lo que el servidor acepta, y lo que guarda el panel no le
// cambia al cliente el estado de lo que ya envió.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

process.env.JWT_SECRET = 'secreto-de-prueba-para-la-integracion-del-alta-0123456789'
delete process.env.HELM_PUBLIC_URL

const PERFIL = 'c0000000-0000-4000-8000-0000000000b1'

// ── Una base para los dos lados ────────────────────────────────────────────
// El servidor entra con la clave de servicio (api/lib/supabase.js) y el panel
// por la pasarela (src/utils/supabase.js), pero escriben en la misma tabla.
const { db, consulta } = vi.hoisted(() => {
  const db = {}
  function consulta(tabla) {
    const filtros = []
    let alta = null      // upsert pendiente
    let cambio = null    // update pendiente
    const filas = () => (db[tabla] ||= [])
    const busca = () => filas().find(f => filtros.every(([c, v]) => f[c] === v)) || null
    const q = {
      select() { return q },
      eq(c, v) { filtros.push([c, v]); return q },
      upsert(row) { alta = row; return q },
      update(row) { cambio = row; return q },
      maybeSingle() { return Promise.resolve({ data: structuredClone(busca()), error: null }) },
      single() {
        if (!alta) return Promise.resolve({ data: structuredClone(busca()), error: null })
        // Como PostgREST con merge-duplicates: en una fila que ya existe solo
        // cambian las columnas que se mandan; una nueva toma los valores por
        // defecto de la tabla (status 'draft').
        let fila = filas().find(f => f.client_id === alta.client_id && f.form === alta.form)
        if (fila) Object.assign(fila, alta)
        else filas().push(fila = { status: 'draft', completed_at: null, ...alta })
        return Promise.resolve({ data: structuredClone(fila), error: null })
      },
      then(ok, mal) {
        if (cambio) filas().filter(f => filtros.every(([c, v]) => f[c] === v)).forEach(f => Object.assign(f, cambio))
        return Promise.resolve({ data: null, error: null }).then(ok, mal)
      },
    }
    return q
  }
  return { db, consulta }
})
vi.mock('../api/lib/supabase.js', () => ({ supabase: { from: (t) => consulta(t) } }))
vi.mock('../src/utils/supabase.js', () => ({ supabase: { from: (t) => consulta(t) } }))
vi.mock('../api/_lib/notificar.js', () => ({ notificar: vi.fn(async () => 'n-1') }))
vi.mock('../api/_lib/llm.js', () => ({ llmChat: vi.fn() }))

const { default: onboarding } = await import('../api/onboarding.js')
const { signJwt } = await import('../api/_lib/auth.js')
const { notificar } = await import('../api/_lib/notificar.js')
const { onboardingApi, saveOnboardingDraft, getOnboarding } = await import('../src/helm/lib.js')

// fetch del navegador → el handler, como lo sirve scripts/api-server.mjs: la
// query de la URL en req.query y el cuerpo JSON ya parseado en req.body.
let ip = 0
async function alServidor(ruta, { method = 'GET', headers = {}, body } = {}) {
  const url = new URL(ruta, 'https://helm.s4sf.net')
  expect(url.pathname).toBe('/api/onboarding')
  const res = {
    statusCode: 0, cuerpo: null,
    status(c) { this.statusCode = c; return this },
    json(b) { this.cuerpo = b; return this },
    end() { return this },
    setHeader() {},
  }
  const cabeceras = { 'x-forwarded-for': `10.2.0.${++ip % 250}` }
  if (headers.Authorization) cabeceras.authorization = headers.Authorization
  await onboarding({
    method, headers: cabeceras, socket: {},
    query: Object.fromEntries(url.searchParams),
    body: body ? JSON.parse(body) : undefined,
  }, res)
  return { status: res.statusCode, ok: res.statusCode < 400, json: async () => structuredClone(res.cuerpo) }
}

// Las dos peticiones de la página pública, con la forma exacta de AltaHelm.jsx
// (RUTA, encodeURIComponent del token y el cuerpo { t, answers, enviar }).
const RUTA = '/api/onboarding?action=alta'
const abre = (token) => fetch(`${RUTA}&t=${encodeURIComponent(token)}`).then(r => r.json())
const guarda = (token, answers, enviar = false) => fetch(RUTA, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ t: token, answers, enviar }),
}).then(async r => ({ status: r.status, ...(await r.json()) }))

// El token tal y como lo saca el router de /alta/:token.
const tokenDe = (url) => decodeURIComponent(new URL(url).pathname.match(/^\/alta\/([^/]+)$/)[1])

beforeEach(async () => {
  db.clients = [{ id: PERFIL, name: 'muny', brand_name: 'Muny Joyas', active: true, agencia_id: 'ag-1' }]
  db.helm_onboarding = []
  notificar.mockClear()
  const sesion = await signJwt({ sub: 'u-1', clientId: PERFIL, role: 'user' })
  vi.stubGlobal('localStorage', { getItem: (k) => (k === 'bw_admin_jwt' ? sesion : null), removeItem() {} })
  vi.stubGlobal('fetch', vi.fn(alServidor))
})
afterEach(() => vi.unstubAllGlobals())

describe('alta: panel, enlace y servidor juntos', () => {
  it('el enlace que crea el panel abre la página y lo que manda la página se guarda en el alta del perfil', async () => {
    const { url, caduca } = await onboardingApi.enlaceAlta(PERFIL)
    expect(url).toMatch(/^https:\/\/helm\.s4sf\.net\/alta\//)
    expect(new Date(caduca).getTime()).toBeGreaterThan(Date.now())
    const t = tokenDe(url)

    expect(await abre(t)).toEqual({ perfil: { nombre: 'Muny Joyas' }, answers: {}, estado: 'borrador', enviado_at: null })

    const r = await guarda(t, { nombre: 'Muny', camara: 6, ambito: ['En toda España'] })
    expect(r).toMatchObject({ status: 200, ok: true, estado: 'borrador', enviado_at: null })
    // Lo ve el panel con su propia lectura.
    expect((await getOnboarding(PERFIL, 'alta')).answers).toEqual({ nombre: 'Muny', camara: 6, ambito: ['En toda España'] })

    // Un 400 trae la pregunta que falla, que es lo que la página pinta.
    const mal = await guarda(t, { camara: 11 })
    expect(mal.status).toBe(400)
    expect(mal.campo).toBe('camara')
  })

  it('lo que el cliente envía sigue enviado aunque el equipo lo retoque en el panel', async () => {
    const t = tokenDe((await onboardingApi.enlaceAlta(PERFIL)).url)
    const enviado = await guarda(t, { nombre: 'Muny' }, true)
    expect(enviado).toMatchObject({ status: 200, estado: 'enviado' })
    expect(notificar).toHaveBeenCalledTimes(1)

    // El alta del panel guarda sin tocar el estado (ContentForm con `compartido`).
    await saveOnboardingDraft(PERFIL, { nombre: 'Muny', sector: 'Joyería' }, 'alta', { conservarEstado: true })
    const fila = db.helm_onboarding.find(f => f.form === 'alta')
    expect(fila.status).toBe('completed')
    expect(fila.completed_at).toBe(enviado.enviado_at)

    const visto = await abre(t)
    expect(visto).toMatchObject({ estado: 'enviado', enviado_at: enviado.enviado_at, answers: { sector: 'Joyería' } })

    // Reenviarlo después no vuelve a avisar.
    await guarda(t, visto.answers, true)
    expect(notificar).toHaveBeenCalledTimes(1)
  })

  it('el resto de formularios siguen volviendo a borrador al guardarse', async () => {
    db.helm_onboarding.push({ client_id: PERFIL, form: 'contenido', answers: {}, status: 'completed', completed_at: '2026-10-01T10:00:00Z' })
    await saveOnboardingDraft(PERFIL, { a: 1 })
    expect(db.helm_onboarding.find(f => f.form === 'contenido').status).toBe('draft')
  })
})
