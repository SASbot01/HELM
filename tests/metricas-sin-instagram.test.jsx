// @vitest-environment jsdom
// Informe de contenido sin Instagram conectado: en vez de un aviso que manda a
// Ajustes, un panel de «todavía no disponible» con lo que trae y a quién
// escribir. El atajo a Ajustes, solo para quien manda en todo el perfil.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

afterEach(cleanup)
beforeEach(() => localStorage.clear())

const informe = vi.fn(async () => ({ conectado: false, publicaciones: [] }))
vi.mock('../src/helm/lib', () => ({
  instagramApi: { informe: (...a) => informe(...a), sync: vi.fn() },
  supabase: {},
}))
const { default: Metricas } = await import('../src/helm/views/Metricas.jsx')
const { INSTAGRAM_CONTACTO, enlaceInstagram } = await import('../src/helm/contacto.js')

const sesion = (s) => localStorage.setItem('bw_client', JSON.stringify(s))

describe('Metricas · sin Instagram', () => {
  it('el usuario de contacto vive en una constante, y su enlace es el perfil', () => {
    // «.ai», no «.ia»: esa cuenta no existe.
    expect(INSTAGRAM_CONTACTO).toBe('silvesttre.ai')
    expect(enlaceInstagram()).toBe('https://www.instagram.com/silvesttre.ai/')
    expect(enlaceInstagram('@otra')).toBe('https://www.instagram.com/otra/')
  })

  it('enseña el panel de no disponible, con lo que trae y el aviso con enlace', async () => {
    render(<Metricas clientId="demo" onNavigate={() => {}} />)
    await screen.findByText('Todavía no disponible')
    const aviso = screen.getByText((_, el) => el?.tagName === 'P' && el.textContent === 'Para conectarlo, escríbenos por Instagram a @silvesttre.ai.')
    const enlace = aviso.querySelector('a')
    expect(enlace.getAttribute('href')).toBe('https://www.instagram.com/silvesttre.ai/')
    expect(enlace.getAttribute('target')).toBe('_blank')
    expect(enlace.getAttribute('rel')).toContain('noopener')
    // La vista previa: lo que trae, sin cifras inventadas.
    expect(screen.getByText('Las cifras de la cuenta')).toBeTruthy()
    expect(screen.getByText('Qué dicen los números')).toBeTruthy()
    expect(screen.getByText('Qué grabar la semana que viene')).toBeTruthy()
  })

  it('el enlace a Ajustes sale para el dueño y lleva allí', async () => {
    sesion({ clientId: 'demo', email: 'duena@negocio.es' })   // sin rol: quien montó el negocio
    const onNavigate = vi.fn()
    render(<Metricas clientId="demo" onNavigate={onNavigate} />)
    fireEvent.click(await screen.findByRole('button', { name: /Ajustes/ }))
    expect(onNavigate).toHaveBeenCalledWith('ajustes')
  })

  it('a un closer no se le enseña el enlace a Ajustes', async () => {
    sesion({ clientId: 'demo', email: 'closer@negocio.es', teamRole: 'closer', level: 'closer' })
    render(<Metricas clientId="demo" onNavigate={() => {}} />)
    await screen.findByText('Todavía no disponible')
    expect(screen.queryByRole('button', { name: /Ajustes/ })).toBeNull()
  })
})
