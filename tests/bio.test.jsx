// @vitest-environment jsdom
// La página de la bio (src/pages/Clase.jsx; s4sf.net, /paginainicio y /clase): el
// héroe es el enlace a la landing de HELM Academy. Desde el 27-11-2026 lleva la
// marca HELM y ya no nombra el Skool, porque la landing lleva al quiz de la
// academia y no a la comunidad de Skool. Sin red.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const track = vi.hoisted(() => vi.fn())
vi.mock('../src/pages/inicio/socio/track.js', () => ({ track }))
const red = vi.fn(async () => { throw new Error('sin red en los tests') })
vi.stubGlobal('fetch', red)

const { default: Clase } = await import('../src/pages/Clase.jsx')

afterEach(() => { cleanup(); track.mockClear(); red.mockClear() })

const pinta = () => render(<MemoryRouter initialEntries={['/clase']}><Clase /></MemoryRouter>)
const heroe = () => screen.getByRole('link', { name: /Unirme gratis a HELM Academy/ })

describe('la página de la bio', () => {
  it('el héroe es el enlace a la landing de HELM Academy y lleva la marca HELM', () => {
    const { container } = pinta()
    expect(heroe().getAttribute('href')).toBe('/helm-academy')
    expect(container.querySelector('.bio-marca').textContent).toBe('HELM')
    expect(heroe().textContent).toContain('Unirme a HELM Academy')
    expect(red).not.toHaveBeenCalled()
  })

  it('ya no nombra el Skool, ni a la vista ni en la etiqueta del enlace', () => {
    const { container } = pinta()
    expect(container.innerHTML).not.toMatch(/skool/i)
    expect(heroe().getAttribute('aria-label')).toBe('Unirme gratis a HELM Academy, la academia de Alex')
  })

  it('el clic en el héroe queda medido', () => {
    pinta()
    fireEvent.click(heroe())
    expect(track).toHaveBeenCalledWith('clic_cta', { donde: 'bio-academy' })
  })

  it('debajo siguen YouTube y el enlace para empresas', () => {
    pinta()
    expect(screen.getByRole('link', { name: /Mi canal de YouTube/ }).getAttribute('href')).toBe('https://www.youtube.com/@silvesttre-ai')
    expect(screen.getByRole('link', { name: /¿Eres una empresa o negocio\?/ }).getAttribute('href')).toBe('/empresas')
  })
})
