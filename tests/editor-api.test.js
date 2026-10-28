// @vitest-environment jsdom
// editorApi (src/helm/lib.js) por dentro: lo JSON del editor va como apiFetch,
// pero el error lleva `status` y `datos`, que es lo que deja al taller saber
// si un «lanzar» que falla es para seguir subiendo (409 con `recibidos`) o ya
// no tiene arreglo (410, 422). fetch va simulado: aquí no sale nada.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: () => ({}), auth: {}, storage: {} }) }))
const { editorApi } = await import('../src/helm/lib.js')

const responde = (status, cuerpo) => vi.fn(async () => ({ ok: status >= 200 && status < 300, status, json: async () => cuerpo }))

beforeEach(() => { localStorage.setItem('bw_admin_jwt', 'jwt-de-prueba') })
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear() })

describe('editorApi · los errores llevan su código', () => {
  it('lanzar con 409 deja `status` y `recibidos` en el error, con el mensaje del servidor', async () => {
    vi.stubGlobal('fetch', responde(409, { error: 'El vídeo todavía no ha llegado entero.', recibidos: 2048 }))
    const e = await editorApi.lanzar('c1', 'e1', [{ id: 'r1', palabra: 'factura' }]).catch(x => x)
    expect(e).toBeInstanceOf(Error)
    expect(e.message).toBe('El vídeo todavía no ha llegado entero.')
    expect(e.status).toBe(409)
    expect(e.datos.recibidos).toBe(2048)
    const [url, opciones] = fetch.mock.calls[0]
    expect(url).toBe('/api/editor?action=lanzar')
    expect(opciones.method).toBe('POST')
    expect(opciones.headers.Authorization).toBe('Bearer jwt-de-prueba')
    expect(JSON.parse(opciones.body)).toEqual({ clientId: 'c1', id: 'e1', recursos: [{ id: 'r1', palabra: 'factura' }] })
  })

  it('un 402 abre la recarga (helm:sin-saldo) y el error dice 402', async () => {
    const msg = 'No tienes saldo suficiente: esto cuesta 150 créditos y te quedan 20. Recarga en Créditos.'
    vi.stubGlobal('fetch', responde(402, { error: msg }))
    const aviso = vi.fn()
    window.addEventListener('helm:sin-saldo', aviso)
    const e = await editorApi.crear('c1', { nombre: 'toma.mp4', bytes: 3000 }).catch(x => x)
    window.removeEventListener('helm:sin-saldo', aviso)
    expect(e.status).toBe(402)
    expect(e.message).toBe(msg)
    expect(aviso.mock.calls[0][0].detail).toBe(msg)
  })

  it('sin JSON en la respuesta, «Error <código>»; y lo que sale bien vuelve tal cual', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 502, json: async () => { throw new Error('no es JSON') } })))
    const e = await editorApi.borrar('c1', 'e1').catch(x => x)
    expect(e.message).toBe('Error 502')
    expect(e.status).toBe(502)

    vi.stubGlobal('fetch', responde(200, { edicion: { id: 'e1', estado: 'en_cola' } }))
    expect(await editorApi.estado('c1', 'e1')).toEqual({ edicion: { id: 'e1', estado: 'en_cola' } })
    expect(fetch.mock.calls[0][0]).toBe('/api/editor?action=estado&clientId=c1&id=e1')
    expect(fetch.mock.calls[0][1].method).toBe('GET')
  })
})
