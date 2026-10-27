// @vitest-environment jsdom
// HelmApp decide quién ve la pestaña «Avatar de ventas» del Informe con la
// misma escalera que una sección del menú (puede('avatar')): no basta con ver
// el Informe, y menos con caer en él de comodín. Y el menú marca la sección que
// se enseña, aunque `view` apunte a una que ya no existe (un aviso viejo).
//
// Las vistas se sustituyen por maniquíes que apuntan los props que reciben: lo
// que se prueba es el shell, no cada pantalla.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

afterEach(cleanup)

const h = vi.hoisted(() => {
  const props = {}
  const maniqui = (nombre) => ({ default: (p) => { props[nombre] = p; return null } })
  return { props, maniqui, permisos: { visible: null, sections: {} } }
})

vi.mock('../src/helm/lib', () => ({
  supabase: {},
  listClients: vi.fn(async () => [{ id: 'c1', slug: 'demo', name: 'Demo' }]),
  createProfile: vi.fn(), slugify: (s) => s, usersApi: { guideDone: vi.fn(async () => {}) },
  brandOf: (c) => ({ name: c?.name || 'HELM', subtitle: '', logo: '', color: '' }),
}))
vi.mock('../src/helm/permisos', async (original) => {
  const real = await original()
  return {
    ...real,
    loadPermisos: vi.fn(async () => ({ matrix: real.DEFAULT_MATRIX, visible: h.permisos.visible || real.DEFAULT_VISIBLE, missing: false })),
    loadSecciones: vi.fn(async () => h.permisos.sections),
    saveSecciones: vi.fn(async () => {}),
  }
})
vi.mock('../src/helm/plugins/registry', () => ({ PLUGINS: [], PLUGIN_MAP: {} }))
vi.mock('../src/helm/Lienzo', () => h.maniqui('Lienzo'))
vi.mock('../src/helm/Creditos', () => ({ AvisoSinSaldo: () => null }))
vi.mock('../src/helm/Guia', () => h.maniqui('Guia'))
vi.mock('../src/helm/Perfiles', () => h.maniqui('Perfiles'))
vi.mock('../src/helm/Notificaciones', () => h.maniqui('Notificaciones'))
vi.mock('../src/helm/views/Informe', () => h.maniqui('Informe'))
vi.mock('../src/helm/views/Metricas', () => h.maniqui('Metricas'))
vi.mock('../src/helm/views/Onboarding', () => h.maniqui('Onboarding'))
vi.mock('../src/helm/views/Agentes', () => h.maniqui('Agentes'))
vi.mock('../src/helm/views/MiDia', () => h.maniqui('MiDia'))
vi.mock('../src/helm/views/Noticias', () => h.maniqui('Noticias'))
vi.mock('../src/helm/views/Radar.jsx', () => h.maniqui('Radar'))
vi.mock('../src/helm/views/Roadmap.jsx', () => h.maniqui('Roadmap'))
vi.mock('../src/helm/views/Ads.jsx', () => h.maniqui('Ads'))
vi.mock('../src/helm/views/Llamadas', () => h.maniqui('Llamadas'))
vi.mock('../src/helm/views/Crm', () => h.maniqui('Crm'))
vi.mock('../src/helm/views/Servicios', () => h.maniqui('Servicios'))
vi.mock('../src/helm/views/Documentos', () => h.maniqui('Documentos'))
vi.mock('../src/helm/views/Gastos', () => h.maniqui('Gastos'))
vi.mock('../src/helm/views/Equipo', () => h.maniqui('Equipo'))
vi.mock('../src/helm/views/Ventas', () => h.maniqui('Ventas'))
vi.mock('../src/helm/views/Diario', () => h.maniqui('Diario'))
vi.mock('../src/helm/views/Finanzas', () => h.maniqui('Finanzas'))
vi.mock('../src/helm/views/Enlaces', () => h.maniqui('Enlaces'))
vi.mock('../src/helm/views/Secciones', () => h.maniqui('Secciones'))
vi.mock('../src/helm/views/Fiscal', () => h.maniqui('Fiscal'))
vi.mock('../src/helm/views/Copiloto', () => h.maniqui('Copiloto'))
vi.mock('../src/helm/views/Ajustes', () => h.maniqui('Ajustes'))

const { default: HelmApp } = await import('../src/helm/HelmApp.jsx')

const sesion = (s) => localStorage.setItem('bw_client', JSON.stringify({ clientId: 'c1', email: 'yo@negocio.es', guideSeen: true, ...s }))

async function monta() {
  render(
    <MemoryRouter initialEntries={['/demo']}>
      <Routes><Route path="/:slug" element={<HelmApp />} /></Routes>
    </MemoryRouter>,
  )
  // Esperar a que carguen el perfil, los permisos y las secciones.
  await screen.findByText('Cuenta')
  await act(async () => {})
}

const activa = () => document.querySelector('.helm-tile.activa')?.textContent

beforeEach(() => {
  localStorage.clear()
  for (const k of Object.keys(h.props)) delete h.props[k]
  h.permisos.visible = null
  h.permisos.sections = {}
})

describe('HelmApp · pestaña del avatar', () => {
  it('quien montó el negocio la ve', async () => {
    sesion({})
    await monta()
    expect(h.props.Informe.verAvatar).toBe(true)
  })

  it('apagada en Secciones no la ve nadie, ni el dueño', async () => {
    sesion({})
    h.permisos.sections = { avatar: false }
    await monta()
    expect(h.props.Informe.verAvatar).toBe(false)
    // Y Secciones la ofrece para volver a encenderla.
    await act(async () => { h.props.Notificaciones.onNavigate('secciones') })
    expect(h.props.Secciones.catalogo.map(n => n.key)).toContain('avatar')
  })

  it('a un rol con el Informe pero sin el avatar en Permisos no le sale', async () => {
    sesion({ teamRole: 'closer', level: 'member' })
    h.permisos.visible = { closer: ['informe', 'crm'] }
    await monta()
    expect(h.props.Informe.verAvatar).toBe(false)
  })

  it('con el avatar marcado en Permisos, sí', async () => {
    sesion({ teamRole: 'closer', level: 'member' })
    h.permisos.visible = { closer: ['informe', 'avatar'] }
    await monta()
    expect(h.props.Informe.verAvatar).toBe(true)
  })

  it('el Informe de comodín (un rol sin nada) no trae el avatar', async () => {
    sesion({ teamRole: 'otro', level: 'member' })
    h.permisos.visible = { otro: [] }
    await monta()
    expect(h.props.Informe).toBeTruthy()
    expect(h.props.Informe.verAvatar).toBe(false)
  })
})

describe('HelmApp · sección activa en el menú', () => {
  it('marca la que se enseña aunque se haya pedido una que ya no existe', async () => {
    sesion({})
    await monta()
    expect(activa()).toBe('Informe')
    // Un aviso viejo que llegara sin traducir: se abre el Informe, y el menú lo dice.
    await act(async () => { h.props.Notificaciones.onNavigate('avatar') })
    expect(activa()).toBe('Informe')
    await act(async () => { h.props.Notificaciones.onNavigate('crm') })
    expect(activa()).toBe('CRM')
  })

  it('un closer que aterriza en el Informe (que no ve) tiene marcada su primera sección', async () => {
    sesion({ teamRole: 'closer', level: 'member' })
    await monta()
    expect(h.props.Informe).toBeUndefined()
    expect(activa()).toBe('CRM')
    expect(document.querySelector('[aria-current="page"]')?.textContent).toBe('CRM')
  })
})
