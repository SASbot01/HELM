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

  it('el 402 sin cifras (para quien no administra) también abre la recarga; el rol (403), el MP4 (415) y el disco (429), no', async () => {
    const aviso = vi.fn()
    window.addEventListener('helm:sin-saldo', aviso)
    try {
      const generico = 'La agencia no tiene créditos suficientes para esto (cuesta 150 créditos). Pide a quien administra la agencia que recargue.'
      vi.stubGlobal('fetch', responde(402, { error: generico }))
      expect((await editorApi.lanzar('c1', 'e1').catch(x => x)).status).toBe(402)
      expect(aviso.mock.calls.map(c => c[0].detail)).toEqual([generico])
      for (const [status, error] of [
        [403, 'Tu rol no puede usar los agentes de este perfil.'],
        [415, 'Solo se editan vídeos MP4 o MOV (lo que graba el móvil). Si el tuyo es de otro tipo (WebM, MKV, AVI…), exporta a MP4 y vuelve a subirlo.'],
        [429, 'Los vídeos del editor de este perfil ya ocupan 8 GB y el tope es de 8 GB. Borra de la lista las ediciones que ya no necesites (lo que ya hayas descargado) para subir este vídeo.'],
      ]) {
        vi.stubGlobal('fetch', responde(status, { error }))
        const e = await editorApi.crear('c1', { nombre: 'toma.webm', bytes: 3000, tipo: 'video/webm' }).catch(x => x)
        expect([e.status, e.message]).toEqual([status, error])
      }
      expect(aviso).toHaveBeenCalledTimes(1)
    } finally {
      window.removeEventListener('helm:sin-saldo', aviso)
    }
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
