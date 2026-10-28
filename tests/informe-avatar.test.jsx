// @vitest-environment jsdom
// El avatar de ventas vive ahora en una pestaña del Informe, no en el menú.
// Se comprueba que la pestaña lo abre, que la raíz ya no usa la clase del
// circulito del usuario (helm-avatar) y que al volver al resumen sigue ahí. Y
// que la pestaña solo sale con `verAvatar` (lo calcula HelmApp con los
// permisos): ver el Informe no basta.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

afterEach(cleanup)

const consulta = (data) => { const q = { select: () => q, eq: () => q, order: () => q, limit: () => Promise.resolve({ data, error: null }) }; return q }
const lista = vi.fn(async () => ({
  corriendo: false, fallo: '',
  estudio: {
    n_analizados: 12, n_contactos: 14, generado_en: '2026-10-20T10:00:00Z',
    resumen: { avatar: { descripcion: 'Mujer de 30 a 45 que quiere vender online.', dolores: ['No tiene tiempo'] }, reparto: { genero: { mujer: 9, hombre: 3 } } },
  },
  fichas: [],
}))
vi.mock('../src/helm/lib', () => ({
  supabase: { from: (t) => (t === 'crm_contacts' ? { select: () => ({ eq: () => Promise.resolve({ count: 0 }) }) } : consulta([])) },
  money: (n) => `${Math.round(Number(n) || 0)} €`,
  fmtDate: (d) => d,
  getOnboarding: vi.fn(async () => null),
  onboardingApi: { biblia: vi.fn(async () => null) },
  participacionesApi: { de: vi.fn(async () => ({ participaciones: [] })) },
  isSaleCancelled: () => false,
  cuotasPendientes: () => null,
  avatarApi: { lista: (...a) => lista(...a), ahora: vi.fn(async () => ({})) },
}))
vi.mock('../src/helm/views/informe/Graficas', () => ({ Evolucion: () => null, PorPrograma: () => null }))
const { default: Informe } = await import('../src/helm/views/Informe.jsx')

describe('Informe · pestaña Avatar de ventas', () => {
  it('abre en el resumen y no pide el avatar hasta que se abre su pestaña', async () => {
    lista.mockClear()
    render(<Informe clientId="demo" onNavigate={() => {}} verAvatar />)
    await screen.findAllByText('Facturado')
    expect(screen.getByRole('button', { name: 'Resumen' }).className).toContain('active')
    expect(screen.getByRole('button', { name: 'Avatar de ventas' })).toBeTruthy()
    expect(lista).not.toHaveBeenCalled()
  })

  it('la pestaña enseña el avatar, con su raíz propia y sus textos nuevos', async () => {
    const { container } = render(<Informe clientId="demo" onNavigate={() => {}} verAvatar />)
    await screen.findAllByText('Facturado')
    fireEvent.click(screen.getByRole('button', { name: 'Avatar de ventas' }))
    await screen.findByText('Tu avatar de ventas')
    expect(lista).toHaveBeenCalledWith('demo')
    expect(container.querySelector('.av-estudio')).toBeTruthy()
    expect(container.querySelector('.helm-avatar')).toBeNull()
    expect(screen.queryByText('Tu cliente tipo')).toBeNull()
    expect(screen.getByRole('button', { name: /Actualizar el avatar/ })).toBeTruthy()
    // El resumen queda oculto, no desmontado: al volver no se pierde nada.
    expect(screen.getAllByText('Facturado')[0].closest('[hidden]')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Resumen' }))
    expect(screen.getAllByText('Facturado')[0].closest('[hidden]')).toBeNull()
    expect(container.querySelector('.av-estudio')).toBeNull()
  })

  it('sin verAvatar (o sin el prop) no hay pestañas ni se pide el avatar', async () => {
    lista.mockClear()
    for (const props of [{}, { verAvatar: false }]) {
      render(<Informe clientId="demo" onNavigate={() => {}} {...props} />)
      await screen.findAllByText('Facturado')
      expect(screen.queryByRole('button', { name: 'Avatar de ventas' })).toBeNull()
      expect(screen.queryByRole('button', { name: 'Resumen' })).toBeNull()
      cleanup()
    }
    expect(lista).not.toHaveBeenCalled()
  })
})
