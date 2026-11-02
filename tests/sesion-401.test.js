// @vitest-environment jsdom
// Un 401 no siempre es la sesión de HELM (src/helm/sesion.js). Pulsar
// «Sincronizar» con el Instagram caducado devolvía un 401 de Meta y el panel
// te echaba al login. Ahora, ante un 401, se pregunta a /api/admin?action=verify
// y solo se cierra la sesión si ese también dice que no vale.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../src/utils/supabase.js', () => ({ supabase: { from: () => ({}) } }))

const { instagramApi } = await import('../src/helm/lib.js')
const { agentsApi } = await import('../src/agents/api.js')

const IG_CADUCADO = 'Meta ha cancelado el permiso de Instagram de este perfil. Vuelve a conectarlo en Ajustes → Integraciones → Instagram.'

// fetch simulado: la sync contesta `sync` y verify contesta `verify`.
function simula({ sync, verify }) {
  const llamadas = []
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    llamadas.push(String(url))
    const r = String(url).includes('action=verify') ? verify : sync
    if (r instanceof Error) throw r
    return { status: r.status, ok: r.status >= 200 && r.status < 300, json: async () => r.body || {} }
  }))
  return llamadas
}

describe('un 401 solo cierra la sesión si es la de HELM', () => {
  beforeEach(() => {
    localStorage.setItem('bw_admin_jwt', 'jwt-de-prueba')
    localStorage.setItem('bw_client', '{"id":"c1"}')
    // jsdom no navega: el «ir a /login» solo deja un aviso en la consola.
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => { localStorage.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

  it('Instagram caducado: se queda en la página y enseña qué hacer', async () => {
    const llamadas = simula({ sync: { status: 401, body: { error: IG_CADUCADO } }, verify: { status: 200, body: { ok: true } } })
    const err = await instagramApi.sync('c1').catch(e => e)
    expect(err.message).toBe(IG_CADUCADO)
    expect(err.status).toBe(401)
    expect(localStorage.getItem('bw_admin_jwt')).toBe('jwt-de-prueba')
    expect(localStorage.getItem('bw_client')).toBe('{"id":"c1"}')
    expect(llamadas.some(u => u.includes('/api/admin?action=verify'))).toBe(true)
  })

  it('la sesión caducada de verdad: se limpia y se vuelve a entrar', async () => {
    simula({ sync: { status: 401, body: { error: 'Unauthorized: jwt expired' } }, verify: { status: 401, body: { ok: false } } })
    const err = await instagramApi.sync('c1').catch(e => e)
    expect(err.message).toBe('Tu sesión ha caducado. Vuelve a iniciar sesión.')
    expect(localStorage.getItem('bw_admin_jwt')).toBeNull()
    expect(localStorage.getItem('bw_client')).toBeNull()
  })

  it('si no se puede preguntar (sin red), no se cierra la sesión', async () => {
    simula({ sync: { status: 401, body: { error: IG_CADUCADO } }, verify: new TypeError('Failed to fetch') })
    const err = await instagramApi.sync('c1').catch(e => e)
    expect(err.message).toBe(IG_CADUCADO)
    expect(localStorage.getItem('bw_admin_jwt')).toBe('jwt-de-prueba')
  })

  it('sin sesión guardada no hace falta preguntar', async () => {
    localStorage.removeItem('bw_admin_jwt')
    const llamadas = simula({ sync: { status: 401, body: {} }, verify: { status: 200 } })
    const err = await instagramApi.sync('c1').catch(e => e)
    expect(err.message).toBe('Tu sesión ha caducado. Vuelve a iniciar sesión.')
    expect(llamadas.some(u => u.includes('action=verify'))).toBe(false)
  })

  it('Agent OS sigue la misma regla', async () => {
    simula({ sync: { status: 401, body: { error: IG_CADUCADO } }, verify: { status: 200, body: { ok: true } } })
    const err = await agentsApi.identidades().catch(e => e)
    expect(err.message).toBe(IG_CADUCADO)
    expect(localStorage.getItem('bw_admin_jwt')).toBe('jwt-de-prueba')
  })
})
