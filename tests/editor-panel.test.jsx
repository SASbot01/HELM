// @vitest-environment jsdom
// El Editor de reels en pantalla (src/agents/EditorReel.jsx), pulsando de
// verdad con la API simulada: la lista enseña cada estado (con su barra
// mientras se edita), un archivo que no es vídeo no se sube, uno bueno se sube
// con su progreso y aparece en la lista, y el panel Estilo guarda lo cambiado.
//
// Usa jsdom y @testing-library/react, que vienen del node_modules compartido
// con ~/code/HELM.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react'

const h = vi.hoisted(() => ({
  ediciones: [],
  estilo: null,
  subidas: [],
  guardados: [],
}))

vi.mock('../src/helm/lib', () => ({
  editorApi: {
    lista: vi.fn(async () => ({ ediciones: h.ediciones.map(e => ({ ...e })) })),
    estado: vi.fn(async (_c, id) => ({ edicion: { ...h.ediciones.find(e => e.id === id), plan: { resumen: { tomas: 1, muletillas: 2, silencios: 3, duracionOriginal: 60, duracionFinal: 41, sinVoz: false }, cortes: 5, bloques: 20, zooms: 4, quitado: [{ a: 1, b: 3, texto: 'Esta IA hace que tu negocio venda más.', motivo: 'toma' }] } } })),
    descarga: vi.fn(async () => new Blob(['x'])),
    borrar: vi.fn(async () => ({ ok: true })),
    estilos: vi.fn(async () => ({ estilos: [{ id: 'g', nombre: 'Estilo HELM', params: h.estilo, global: true }], porDefecto: { id: 'g', nombre: 'Estilo HELM', params: h.estilo, global: true } })),
    guardarEstilo: vi.fn(async (_c, params) => { h.guardados.push(params); return { porDefecto: { id: 'p', nombre: 'Estilo del perfil', params, global: false } } }),
    subir: vi.fn(async (_c, archivo, { alProgreso }) => {
      alProgreso(0.5, { cargado: archivo.size / 2, total: archivo.size })
      alProgreso(1, { cargado: archivo.size, total: archivo.size })
      h.subidas.push(archivo.name)
      h.ediciones.unshift({ id: 'nueva', nombre_original: archivo.name, estado: 'en_cola', progreso: 0, paso: 'En cola', duracion_original: 30, duracion_final: null, created_at: new Date().toISOString(), error: null })
      return { id: 'nueva' }
    }),
  },
}))

const { default: EditorReel } = await import('../src/agents/EditorReel.jsx')
const { ESTILO_POR_DEFECTO } = await import('../src/agents/editor/estilo.js')

beforeEach(() => {
  h.estilo = { ...ESTILO_POR_DEFECTO }
  h.subidas = []
  h.guardados = []
  h.ediciones = [
    { id: 'a', nombre_original: 'lista.mp4', estado: 'listo', progreso: 100, paso: 'Listo para descargar', duracion_original: 60, duracion_final: 41, created_at: new Date().toISOString(), error: null },
    { id: 'b', nombre_original: 'montando.mov', estado: 'montando', progreso: 63, paso: 'Montando el vídeo (1:00 → 0:41)', duracion_original: 60, duracion_final: null, created_at: new Date().toISOString(), error: null },
    { id: 'c', nombre_original: 'mal.mp4', estado: 'error', progreso: 10, paso: null, duracion_original: null, duracion_final: null, created_at: new Date().toISOString(), error: 'No se puede leer ese vídeo.' },
  ]
})
afterEach(() => cleanup())

const video = (nombre = 'toma.mp4', tipo = 'video/mp4', bytes = 2048) => new File([new Uint8Array(bytes)], nombre, { type: tipo })

describe('EditorReel', () => {
  it('la lista: listo con descarga, montando con su barra y su paso, error con el motivo', async () => {
    render(<EditorReel clientId="c1" client={{ name: 'Alex' }} onVolver={() => {}} />)
    const lista = await screen.findByText('lista.mp4')
    const fila = lista.closest('li')
    expect(within(fila).getByRole('button', { name: /Descargar/ })).toBeTruthy()
    expect(within(fila).getByText('0:41')).toBeTruthy()
    expect(screen.getByText(/Montando el vídeo \(1:00 → 0:41\) · 63 %/)).toBeTruthy()
    expect(screen.getByText('No se puede leer ese vídeo.')).toBeTruthy()
    // «Qué ha quitado» trae el resumen del plan.
    fireEvent.click(within(fila).getByRole('button', { name: /Qué ha quitado/ }))
    expect(await screen.findByText(/«Esta IA hace que tu negocio venda más\.»/)).toBeTruthy()
    expect(screen.getByText(/1 toma repetida/)).toBeTruthy()
  })

  it('subir: rechaza lo que no es vídeo; un vídeo sube con su progreso y aparece en cola', async () => {
    const { container } = render(<EditorReel clientId="c1" client={{ name: 'Alex' }} onVolver={() => {}} />)
    await screen.findByText('lista.mp4')
    const input = container.querySelector('input[type="file"]')
    fireEvent.change(input, { target: { files: [new File(['hola'], 'notas.txt', { type: 'text/plain' })] } })
    expect(await screen.findByText(/Eso no es un vídeo/)).toBeTruthy()
    expect(h.subidas).toEqual([])

    fireEvent.change(input, { target: { files: [video('Mi toma.MOV', 'video/quicktime')] } })
    expect(await screen.findByText(/«Mi toma\.MOV» subido/)).toBeTruthy()
    expect(h.subidas).toEqual(['Mi toma.MOV'])
    expect(await screen.findByText('Mi toma.MOV')).toBeTruthy()
  })

  it('soltar un vídeo encima también lo sube', async () => {
    const { container } = render(<EditorReel clientId="c1" client={{ name: 'Alex' }} onVolver={() => {}} />)
    await screen.findByText('lista.mp4')
    fireEvent.drop(container.querySelector('.ed-subida'), { dataTransfer: { files: [video('arrastrado.mp4')] } })
    await waitFor(() => expect(h.subidas).toEqual(['arrastrado.mp4']))
  })

  it('el panel Estilo: carga el de HELM, cambia un valor y lo guarda normalizado', async () => {
    render(<EditorReel clientId="c1" client={{ name: 'Alex' }} onVolver={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /Estilo de edición/ }))
    const mayus = await screen.findByLabelText('En mayúsculas')
    const guardar = screen.getByRole('button', { name: 'Guardar estilo' })
    expect(guardar.disabled).toBe(true)
    fireEvent.click(mayus)
    expect(guardar.disabled).toBe(false)
    fireEvent.click(guardar)
    await screen.findByText(/Guardado: los próximos vídeos saldrán así/)
    expect(h.guardados).toHaveLength(1)
    expect(h.guardados[0]).toMatchObject({ ...ESTILO_POR_DEFECTO, mayusculas: false })
  })
})
