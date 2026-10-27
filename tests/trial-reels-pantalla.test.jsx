// @vitest-environment jsdom
// Trial reels en pantalla (src/agents/TrialReels.jsx) con la API simulada:
// «Subir un vídeo» abre el taller sin reel de Instagram, sube el archivo por
// trozos (subePorTrozos simulado) con su barra, no deja crear hasta que ha
// llegado entero, enseña el precio en el botón y crea con { fuenteId }. Los
// ganchos van a mano; «Proponer ganchos» solo si cuentas de qué va el vídeo.
// Y el ciclo de vida de la subida: «Reintentar» sigue la misma (mismo id,
// desde lo que tiene el servidor), cancelar o salir quitan lo que no llegó y
// una subida cortada sale como tal en la lista.
//
// Usa jsdom y @testing-library/react, que vienen del node_modules compartido
// con ~/code/HELM. jsdom no pinta canvas ni lee vídeos: se simulan lo justo.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { PRECIOS_FIJOS } from '../src/helm/precios.js'

const FUENTE = 'f0000000-0000-4000-8000-000000000001'
const h = vi.hoisted(() => ({ precios: null, terminaSubida: null, fuentes: [] }))

vi.mock('../src/helm/lib', () => ({
  portadasApi: { marca: vi.fn(async () => ({ marca: {} })), video: vi.fn() },
  trialReelsApi: {
    lista: vi.fn(async () => ({ trabajos: [], fuentes: h.fuentes })),
    fuente: vi.fn(async (_c, d) => ({ fuenteId: FUENTE, fuente: { id: FUENTE, nombre: d.nombre, estado: 'subiendo', disponible: false } })),
    urlTrozo: vi.fn((c, id) => `/api/trial-reels?action=trozo&clientId=${c}&id=${id}`),
    recibidos: vi.fn(async () => ({ recibidos: 0, estado: 'subiendo' })),
    crear: vi.fn(async () => ({ ids: ['v1'], trabajos: [] })),
    ganchos: vi.fn(async () => ({ opciones: [{ texto: 'Tu móvil graba mejor así', resaltada: 'móvil', angulo: 'B' }] })),
    videoFuente: vi.fn(async () => new Blob(['mp4'])),
    borrarFuente: vi.fn(async () => ({ ok: true })), descarga: vi.fn(), borrar: vi.fn(),
  },
  creditosApi: { precios: vi.fn(async () => h.precios) },
}))
vi.mock('../src/helm/subida', () => ({
  subePorTrozos: vi.fn(({ alProgreso, archivo }) => new Promise((ok) => {
    alProgreso(0.5, { cargado: archivo.size / 2, total: archivo.size })
    h.terminaSubida = () => ok({ recibidos: archivo.size, completo: true, fuente: { id: FUENTE, nombre: archivo.name, estado: 'lista', disponible: true, duracion: 12 } })
  })),
}))
vi.mock('../src/utils/supabase', () => {
  const cadena = { select: () => cadena, eq: () => cadena, order: () => cadena, limit: () => cadena, then: (ok) => Promise.resolve({ data: [], error: null }).then(ok) }
  return { supabase: { from: () => cadena } }
})

const { default: TrialReels } = await import('../src/agents/TrialReels.jsx')
const { trialReelsApi } = await import('../src/helm/lib')
const { subePorTrozos } = await import('../src/helm/subida')

const ctx = new Proxy({}, {
  get: (t, k) => (k in t ? t[k] : k === 'measureText' ? () => ({ width: 100 }) : k === 'getImageData' ? () => ({ data: new Uint8ClampedArray(16) }) : () => {}),
  set: (t, k, v) => { t[k] = v; return true },
})
const crearElemento = document.createElement.bind(document)

beforeEach(() => {
  h.precios = { paga: true, saldo: 5, precios: PRECIOS_FIJOS }
  h.fuentes = []
  h.terminaSubida = null
  vi.clearAllMocks()
  HTMLCanvasElement.prototype.getContext = () => ctx
  HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AA=='
  if (!document.fonts) Object.defineProperty(document, 'fonts', { value: { load: () => Promise.resolve() }, configurable: true })
  URL.createObjectURL = vi.fn(() => 'blob:local/subida')
  URL.revokeObjectURL = vi.fn()
  // El vídeo que mide la duración: jsdom no lee vídeos, así que «lee» 12 s.
  vi.spyOn(document, 'createElement').mockImplementation((tag, o) => {
    const el = crearElemento(tag, o)
    if (String(tag).toLowerCase() === 'video') {
      Object.defineProperty(el, 'src', {
        configurable: true,
        get: () => el.getAttribute('src') || '',
        set: (v) => {
          el.setAttribute('src', v)
          Object.defineProperty(el, 'duration', { configurable: true, value: 12 })
          setTimeout(() => el.onloadedmetadata?.(), 0)
        },
      })
    }
    return el
  })
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

const abre = () => render(<TrialReels clientId="perfil-1" client={{ name: 'Demo' }} onVolver={() => {}} />)
const entrada = (container) => container.querySelector('.tr-subir input[type="file"]')

describe('Trial reels · subir un vídeo', () => {
  it('sube por trozos, no deja crear hasta que ha llegado y crea con el vídeo subido', async () => {
    const { container } = abre()
    await screen.findByText('Subir un vídeo')
    const archivo = new File([new Uint8Array(1000)], 'mi-video.mp4', { type: 'video/mp4' })
    fireEvent.change(entrada(container), { target: { files: [archivo] } })

    // El taller, sin reel de Instagram.
    expect(await screen.findByText('Tu vídeo: mi-video.mp4')).toBeTruthy()
    await waitFor(() => expect(trialReelsApi.fuente).toHaveBeenCalledWith('perfil-1', { nombre: 'mi-video.mp4', bytes: 1000, tipo: 'video/mp4', duracion: 12 }))
    await waitFor(() => expect(subePorTrozos).toHaveBeenCalledTimes(1))
    expect(subePorTrozos.mock.calls[0][0]).toMatchObject({ url: `/api/trial-reels?action=trozo&clientId=perfil-1&id=${FUENTE}`, archivo })
    expect(await screen.findByText('Subiendo… 50 %')).toBeTruthy()
    const crear = screen.getByRole('button', { name: /Crear 3 variantes · 90 créditos/ })
    expect(crear.disabled).toBe(true)
    // Se ve desde el archivo local mientras sube.
    expect(container.querySelector('video.tr-oculto').getAttribute('src')).toBe('blob:local/subida')

    h.terminaSubida()
    expect(await screen.findByText(/Subido\. Ya puedes crear/)).toBeTruthy()
    await waitFor(() => expect(screen.getByRole('button', { name: /Crear 3 variantes/ }).disabled).toBe(false))
    expect(screen.getByText(/Cada variante se cobra solo si sale bien/)).toBeTruthy()

    // Una menos, y el precio baja.
    fireEvent.click(screen.getAllByRole('checkbox', { name: /Crearla/ })[2])
    fireEvent.click(screen.getByRole('button', { name: /Crear 2 variantes · 60 créditos/ }))
    await waitFor(() => expect(trialReelsApi.crear).toHaveBeenCalledTimes(1))
    const [clientId, origen, variantes] = trialReelsApi.crear.mock.calls[0]
    expect(clientId).toBe('perfil-1')
    expect(origen).toEqual({ fuenteId: FUENTE })
    expect(variantes).toHaveLength(2)
  })

  it('ganchos a mano; «Proponer ganchos» solo cuando cuentas de qué va el vídeo', async () => {
    const { container } = abre()
    await screen.findByText('Subir un vídeo')
    fireEvent.change(entrada(container), { target: { files: [new File([new Uint8Array(10)], 'clip.mov', { type: 'video/quicktime' })] } })
    const proponer = await screen.findByRole('button', { name: /Proponer ganchos/ })
    expect(proponer.disabled).toBe(true)
    expect(screen.getByText(/Escribe tú el gancho/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText(/De qué va el vídeo/), { target: { value: 'Cómo grabar con el móvil' } })
    expect(proponer.disabled).toBe(false)
    fireEvent.click(proponer)
    await waitFor(() => expect(trialReelsApi.ganchos).toHaveBeenCalledWith('perfil-1', null, 'Cómo grabar con el móvil'))
    expect(await screen.findByText('Tu móvil graba mejor así')).toBeTruthy()
  })

  it('lo que no es un MP4/MOV o pesa demasiado no se sube', async () => {
    const { container } = abre()
    await screen.findByText('Subir un vídeo')
    fireEvent.change(entrada(container), { target: { files: [new File(['hola'], 'nota.txt', { type: 'text/plain' })] } })
    expect(await screen.findByText(/Sube un vídeo MP4 o MOV/)).toBeTruthy()
    const grande = new File(['x'], 'enorme.mp4', { type: 'video/mp4' })
    Object.defineProperty(grande, 'size', { value: 201 * 1024 * 1024 })
    fireEvent.change(entrada(container), { target: { files: [grande] } })
    expect(await screen.findByText(/pesa más de 200 MB/)).toBeTruthy()
    expect(trialReelsApi.fuente).not.toHaveBeenCalled()
    expect(subePorTrozos).not.toHaveBeenCalled()
  })

  it('los vídeos subidos antes salen en la lista y abren el taller (gratis si el perfil no paga)', async () => {
    h.precios = { paga: false, saldo: null, precios: PRECIOS_FIJOS }
    h.fuentes = [{ id: FUENTE, nombre: 'de-ayer.mp4', estado: 'lista', disponible: true, duracion: 30, bytes: 1048576, creado: '2026-10-26T10:00:00Z' }]
    abre()
    fireEvent.click(await screen.findByRole('button', { name: /Crear variantes/ }))
    expect(await screen.findByText('Tu vídeo: de-ayer.mp4')).toBeTruthy()
    await waitFor(() => expect(trialReelsApi.videoFuente).toHaveBeenCalledWith('perfil-1', FUENTE))
    expect(await screen.findByRole('button', { name: /Crear 3 variantes · gratis$/ })).toBeTruthy()
    expect(screen.queryByText(/Cada variante se cobra/)).toBeNull()
  })
})

describe('Trial reels · ciclo de vida de la subida', () => {
  const cortada = () => Object.assign(new Error('La subida se cortó. Comprueba la conexión y vuelve a probar.'), { red: true })
  const sube = async (container, nombre = 'mi-video.mp4') => {
    await screen.findByText('Subir un vídeo')
    const archivo = new File([new Uint8Array(1000)], nombre, { type: 'video/mp4' })
    fireEvent.change(entrada(container), { target: { files: [archivo] } })
    await waitFor(() => expect(subePorTrozos).toHaveBeenCalled())
    return archivo
  }

  it('«Reintentar» sigue la MISMA subida desde lo que tiene el servidor, sin empezar otra', async () => {
    subePorTrozos.mockImplementationOnce(async () => { throw cortada() })
    trialReelsApi.recibidos.mockResolvedValueOnce({ recibidos: 600, estado: 'subiendo' })
    const { container } = abre()
    const archivo = await sube(container)
    expect(await screen.findByText(/No se pudo subir: La subida se cortó/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    await waitFor(() => expect(subePorTrozos).toHaveBeenCalledTimes(2))
    expect(trialReelsApi.recibidos).toHaveBeenCalledWith('perfil-1', FUENTE)
    expect(subePorTrozos.mock.calls[1][0]).toMatchObject({ url: `/api/trial-reels?action=trozo&clientId=perfil-1&id=${FUENTE}`, archivo, desde: 600 })
    expect(trialReelsApi.fuente).toHaveBeenCalledTimes(1)
    expect(trialReelsApi.borrarFuente).not.toHaveBeenCalled()
    h.terminaSubida()
    expect(await screen.findByText(/Subido\. Ya puedes crear/)).toBeTruthy()
  })

  it('si en el servidor ya falló (o no está), el reintento empieza otra y quita la de antes', async () => {
    subePorTrozos.mockImplementationOnce(async () => { throw cortada() })
    trialReelsApi.recibidos.mockResolvedValueOnce({ recibidos: 0, estado: 'error' })
    const { container } = abre()
    await sube(container)
    fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }))
    await waitFor(() => expect(trialReelsApi.fuente).toHaveBeenCalledTimes(2))
    expect(trialReelsApi.borrarFuente).toHaveBeenCalledWith('perfil-1', FUENTE)
    await waitFor(() => expect(subePorTrozos).toHaveBeenCalledTimes(2))
    expect(subePorTrozos.mock.calls[1][0].desde).toBe(0)
  })

  it('lo que no tiene arreglo (no es un vídeo) no ofrece «Reintentar»; cancelar lo quita del servidor', async () => {
    subePorTrozos.mockImplementationOnce(async () => { throw Object.assign(new Error('Ese archivo no es un vídeo MP4 o MOV.'), { status: 415 }) })
    const { container } = abre()
    await sube(container)
    expect(await screen.findByText(/No se pudo subir: Ese archivo no es un vídeo/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Reintentar' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar la subida' }))
    expect(trialReelsApi.borrarFuente).toHaveBeenCalledWith('perfil-1', FUENTE)
    expect(await screen.findByText('Subir un vídeo')).toBeTruthy()
  })

  it('salir del agente a medias quita la subida del servidor; una que ya llegó entera, no', async () => {
    const primera = abre()
    await sube(primera.container)
    await waitFor(() => expect(subePorTrozos).toHaveBeenCalledTimes(1))
    primera.unmount()
    expect(trialReelsApi.borrarFuente).toHaveBeenCalledWith('perfil-1', FUENTE)

    trialReelsApi.borrarFuente.mockClear()
    const segunda = abre()
    await sube(segunda.container)
    h.terminaSubida()
    expect(await screen.findByText(/Subido\. Ya puedes crear/)).toBeTruthy()
    segunda.unmount()
    expect(trialReelsApi.borrarFuente).not.toHaveBeenCalled()
  })

  it('una subida cortada sale como «Cortada» en la lista, sin crear variantes y con «Quitar»', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    h.fuentes = [{ id: FUENTE, nombre: 'cortado.mp4', estado: 'cortada', error: 'La subida se cortó a medias. Quítala y vuelve a subir el vídeo.', disponible: false, bytes: 1000, creado: '2026-10-27T09:00:00Z' }]
    abre()
    expect(await screen.findByText('Cortada')).toBeTruthy()
    expect(screen.getByText(/se cortó a medias\. Quítala/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Crear variantes/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Quitar el vídeo cortado.mp4' }))
    await waitFor(() => expect(trialReelsApi.borrarFuente).toHaveBeenCalledWith('perfil-1', FUENTE))
  })

  it('un vídeo que el navegador no sabe enseñar avisa de que las variantes se pueden crear igual', async () => {
    const { container } = abre()
    await sube(container, 'iphone.mov')
    fireEvent.error(container.querySelector('video.tr-oculto'))
    expect(await screen.findByText(/Tu navegador no puede enseñar este vídeo/)).toBeTruthy()
    expect(screen.getByText(/se pueden crear igual/)).toBeTruthy()
  })
})
