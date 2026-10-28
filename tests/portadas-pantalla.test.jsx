// @vitest-environment jsdom
// Portadas en pantalla (src/agents/Portadas.jsx) con la API simulada: la
// entrada «Portada desde un vídeo» abre tu vídeo en el navegador (sin subirlo)
// con el selector de instante; los estilos sin imagen enseñan su vista previa
// con CSS (portadas/VistaEstilo.jsx) y los de siempre, su imagen; y el botón de
// generar dice lo que cuesta (o que es gratis) antes de pulsar.
//
// Usa jsdom y @testing-library/react, que vienen del node_modules compartido
// con ~/code/HELM. jsdom no pinta canvas ni carga vídeo: se simulan lo justo.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { PRECIOS_FIJOS } from '../src/helm/precios.js'

const h = vi.hoisted(() => ({ precios: null }))

vi.mock('../src/helm/lib', () => ({
  portadasApi: {
    marca: vi.fn(async () => ({ marca: {} })),
    capacidad: vi.fn(async () => ({ fondoIa: true, portadaIa: true })),
    ejemplos: vi.fn(async () => ({ ejemplos: [] })),
    portadaIa: vi.fn(async () => ({ imagen: 'data:image/jpeg;base64,AA==', ia: true, cobrado: 0.4, saldo: 4.6 })),
    video: vi.fn(), imagen: vi.fn(), textos: vi.fn(), fondoPrompt: vi.fn(), fondoIa: vi.fn(),
    guardarMarca: vi.fn(), subirEjemplo: vi.fn(), borrarEjemplo: vi.fn(),
  },
  creditosApi: { precios: vi.fn(async () => h.precios) },
}))
vi.mock('../src/utils/supabase', () => {
  const cadena = { select: () => cadena, eq: () => cadena, order: () => cadena, limit: () => cadena, then: (ok) => Promise.resolve({ data: [], error: null }).then(ok) }
  return { supabase: { from: () => cadena } }
})

const { default: Portadas } = await import('../src/agents/Portadas.jsx')
const { default: VistaEstilo } = await import('../src/agents/portadas/VistaEstilo.jsx')
const { ESTILOS_IA, estiloIaPorClave, ejemploDe } = await import('../src/agents/portadas/estilosIa.js')

// Un contexto 2D que acepta todo (jsdom no tiene canvas).
const ctx = new Proxy({}, {
  get: (t, k) => (k in t ? t[k] : k === 'measureText' ? () => ({ width: 100 }) : k === 'getImageData' ? () => ({ data: new Uint8ClampedArray(16) }) : () => {}),
  set: (t, k, v) => { t[k] = v; return true },
})

beforeEach(() => {
  h.precios = { paga: true, saldo: 5, precios: PRECIOS_FIJOS }
  HTMLCanvasElement.prototype.getContext = () => ctx
  HTMLCanvasElement.prototype.toDataURL = () => 'data:image/jpeg;base64,AA=='
  if (!document.fonts) Object.defineProperty(document, 'fonts', { value: { load: () => Promise.resolve() }, configurable: true })
  URL.createObjectURL = vi.fn(() => 'blob:local/mi-video')
  URL.revokeObjectURL = vi.fn()
})
afterEach(cleanup)

describe('VistaEstilo', () => {
  it('un estilo sin imagen se pinta con CSS: fondo, silueta, adorno y el titular con su resaltada', () => {
    const html = renderToStaticMarkup(<VistaEstilo estilo={{ ...estiloIaPorClave('verdad'), referencia: false }} />)
    expect(html).toContain('data-estilo="verdad"')
    expect(html).toContain('linear-gradient(180deg, #0B0B0D, #1E1A16)')
    expect(html).toContain('por-vista-persona derecha')
    expect(html).toMatch(/<span class="res">NADIE <\/span>/)
    expect(html.replace(/<[^>]+>/g, '')).toBe('NADIE TE LO DICE')
    expect(html).not.toContain('<img')
    // La cifra va en grande en «Número grande»; las comillas, en «Frase entre comillas».
    expect(renderToStaticMarkup(<VistaEstilo estilo={{ ...estiloIaPorClave('numero'), referencia: false }} />)).toContain('class="res grande"')
    expect(renderToStaticMarkup(<VistaEstilo estilo={{ ...estiloIaPorClave('cita'), referencia: false }} />)).toContain('por-vista-comillas')
    expect(renderToStaticMarkup(<VistaEstilo estilo={{ ...estiloIaPorClave('entrevista'), referencia: false }} />)).toMatch(/dos-a[\s\S]*dos-b/)
  })

  it('un estilo con imagen no pinta nada (va su imagen)', () => {
    expect(renderToStaticMarkup(<VistaEstilo estilo={estiloIaPorClave('oro')} />)).toBe('')
  })
})

describe('Portadas · pantalla', () => {
  it('«Portada desde un vídeo»: abre tu vídeo aquí, sin subirlo, con el selector de instante', async () => {
    const { container } = render(<Portadas clientId="perfil-1" client={{ name: 'Demo' }} onVolver={() => {}} />)
    fireEvent.click(await screen.findByRole('button', { name: /Portada desde un vídeo/ }))
    expect(screen.getByText('Desde un vídeo tuyo')).toBeTruthy()
    expect(screen.getByRole('tab', { name: /Tu vídeo/ }).getAttribute('aria-selected')).toBe('true')
    // La foto sigue siendo una entrada de primera clase.
    expect(screen.getByRole('tab', { name: /Foto/ })).toBeTruthy()
    const input = container.querySelector('input[type="file"][accept="video/*"]')
    expect(input).toBeTruthy()
    fireEvent.change(input, { target: { files: [new File(['xxxx'], 'mi-reel.mov', { type: 'video/quicktime' })] } })
    const video = await waitFor(() => { const v = container.querySelector('.por-video video'); if (!v) throw new Error('sin vídeo'); return v })
    expect(video.getAttribute('src')).toBe('blob:local/mi-video')
    expect(screen.getByText('mi-reel.mov')).toBeTruthy()
    expect(screen.getByRole('slider')).toBeTruthy()
    expect(screen.getByText(/El vídeo no se sube/)).toBeTruthy()
    // Un 4K del móvil sin memoria de canvas (iOS): el fotograma no rompe nada, se queda el de antes.
    Object.defineProperty(video, 'videoWidth', { configurable: true, value: 2160 })
    Object.defineProperty(video, 'videoHeight', { configurable: true, value: 3840 })
    HTMLCanvasElement.prototype.getContext = () => null
    const errores = []
    const oye = (e) => { errores.push(e.error || e.message); e.preventDefault() }
    window.addEventListener('error', oye)
    fireEvent.seeked(video)
    window.removeEventListener('error', oye)
    expect(errores).toEqual([])
    HTMLCanvasElement.prototype.getContext = () => ctx
    fireEvent.seeked(video)
    // Un archivo que no es vídeo, fuera.
    fireEvent.change(container.querySelector('input[type="file"][accept="video/*"]'), { target: { files: [new File(['x'], 'nota.txt', { type: 'text/plain' })] } })
    expect(await screen.findByText(/Eso no es un vídeo/)).toBeTruthy()
  })

  it('los estilos sin imagen enseñan su vista previa; los de siempre, su imagen; y el botón dice el precio', async () => {
    const { container } = render(<Portadas clientId="perfil-1" client={{ name: 'Demo' }} onVolver={() => {}} />)
    fireEvent.click(await screen.findByRole('button', { name: /Portada desde una foto/ }))
    // Con la clave de imagen, entra en «Con IA».
    await screen.findByRole('heading', { name: /Estilo/ })
    const lista = container.querySelector('.por-estilos')
    const sinImagen = ESTILOS_IA.filter(e => !ejemploDe(e) && e.clave !== 'libre')
    expect(lista.querySelectorAll('.por-vista')).toHaveLength(sinImagen.length)
    expect(lista.querySelectorAll('img')).toHaveLength(ESTILOS_IA.filter(e => ejemploDe(e)).length)
    expect(within(lista).getByText('Verdad incómoda')).toBeTruthy()
    // Al elegirlo, se dice quién lo usa (con su perfil) y que no se copia su cara ni su marca.
    fireEvent.click(within(lista).getByText('Verdad incómoda'))
    const enlace = await screen.findByRole('link', { name: 'Carlos «Máster» Muñoz' })
    expect(enlace.getAttribute('href')).toBe('https://www.youtube.com/@mastermunozoficial')
    expect(screen.getByText(/nunca su cara, su logo ni su marca/)).toBeTruthy()
    expect(await screen.findByRole('button', { name: /Generar portada · 40 créditos/ })).toBeTruthy()
    expect(screen.getByText(/Te quedan 500 créditos/)).toBeTruthy()
  })

  // jsdom no carga imágenes: esta avisa de que ha cargado en cuanto se le pone el src.
  class ImagenQueCarga {
    width = 1080; height = 1920; naturalWidth = 1080; naturalHeight = 1920
    set src(v) { this._src = v; queueMicrotask(() => this.onload?.()) }
    get src() { return this._src }
  }
  async function generaConFoto(container) {
    fireEvent.click(await screen.findByRole('button', { name: /Portada desde una foto/ }))
    await screen.findByRole('button', { name: /Generar portada/ })
    fireEvent.change(container.querySelector('input[type="file"][accept="image/*"]'), { target: { files: [new File(['x'], 'foto.jpg', { type: 'image/jpeg' })] } })
    fireEvent.change(screen.getByLabelText(/Titular/), { target: { value: 'Graba mejor' } })
    const boton = screen.getByRole('button', { name: /Generar portada/ })
    await waitFor(() => expect(boton.disabled).toBe(false))
    fireEvent.click(boton)
    await screen.findByRole('button', { name: 'Versión 1' })
  }

  it('quien administra la agencia ve lo que queda, y tras cobrar se actualiza', async () => {
    const Antes = globalThis.Image
    globalThis.Image = ImagenQueCarga
    try {
      const { container } = render(<Portadas clientId="perfil-1" client={{ name: 'Demo' }} onVolver={() => {}} />)
      await generaConFoto(container)
      expect(screen.getByText(/Te quedan 460 créditos/)).toBeTruthy()
    } finally { globalThis.Image = Antes }
  })

  it('sin ver el saldo (no administras la agencia): solo el precio, y tras cobrar tampoco aparece lo que queda', async () => {
    h.precios = { paga: true, saldo: null, alcanza: { 'editor-reels': true, 'portada-ia': true, 'trial-reel': true }, precios: PRECIOS_FIJOS }
    const Antes = globalThis.Image
    globalThis.Image = ImagenQueCarga
    try {
      render(<Portadas clientId="perfil-1" client={{ name: 'Demo' }} onVolver={() => {}} />)
      expect(await screen.findByRole('button', { name: /Portada desde una foto/ })).toBeTruthy()
      fireEvent.click(screen.getByRole('button', { name: /Portada desde una foto/ }))
      expect(await screen.findByRole('button', { name: /Generar portada · 40 créditos/ })).toBeTruthy()
      expect(screen.getByText('Cada imagen se cobra solo si sale bien.')).toBeTruthy()
      expect(screen.queryByText(/Te quedan/)).toBeNull()
      cleanup()
      // Aunque la respuesta de la generación trajera un saldo, no se enseña.
      const otra = render(<Portadas clientId="perfil-1" client={{ name: 'Demo' }} onVolver={() => {}} />)
      await generaConFoto(otra.container)
      expect(screen.getByText('Cada imagen se cobra solo si sale bien.')).toBeTruthy()
      expect(screen.queryByText(/Te quedan/)).toBeNull()
    } finally { globalThis.Image = Antes }
  })

  it('si el perfil no paga (la agencia de la casa o sin agencia), el botón dice que es gratis', async () => {
    h.precios = { paga: false, saldo: null, precios: PRECIOS_FIJOS }
    render(<Portadas clientId="perfil-1" client={{ name: 'Demo' }} onVolver={() => {}} />)
    fireEvent.click(await screen.findByRole('button', { name: /Portada desde una foto/ }))
    expect(await screen.findByRole('button', { name: /Generar portada · gratis$/ })).toBeTruthy()
    expect(screen.queryByText(/Te quedan/)).toBeNull()
  })
})
