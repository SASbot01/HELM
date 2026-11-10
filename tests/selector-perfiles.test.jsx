// @vitest-environment jsdom
// El selector de perfiles de arriba (HelmApp) enseña lo mismo que el tablero
// de /admin: los perfiles de la agencia de la sesión. La plataforma recibe del
// servidor los de TODAS las agencias (perfilesVisibles), y antes el selector
// los pintaba todos: cada agencia dada de alta, o con los administradores
// desactivados, seguía saliendo en su desplegable. Esos se abren desde
// /plataforma, y mientras uno está abierto sí sale, para que el selector diga
// dónde estás.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { esPropio, perfilesPropios, agenciaDeSesion } from '../src/helm/perfilesPropios'

afterEach(cleanup)

const h = vi.hoisted(() => {
  const props = {}
  const maniqui = (nombre) => ({ default: (p) => { props[nombre] = p; return null } })
  return { props, maniqui, clientes: [] }
})

vi.mock('../src/helm/lib', () => ({
  supabase: {},
  listClients: vi.fn(async () => h.clientes),
  createProfile: vi.fn(), slugify: (s) => s, usersApi: { guideDone: vi.fn(async () => {}) },
  brandOf: (c) => ({ name: c?.name || 'HELM', subtitle: '', logo: '', color: '' }),
}))
vi.mock('../src/helm/permisos', async (original) => {
  const real = await original()
  return {
    ...real,
    loadPermisos: vi.fn(async () => ({ matrix: real.DEFAULT_MATRIX, visible: real.DEFAULT_VISIBLE, missing: false })),
    loadSecciones: vi.fn(async () => ({})),
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

// Un JWT de mentira: el panel solo lee su carga, la firma la mira el servidor.
// base64url sin relleno, como lo firma api/_lib/auth.js.
const parte = (o) => btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(o))))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const token = (carga) => `${parte({ alg: 'HS256', typ: 'JWT' })}.${parte(carga)}.firma`

const PLATAFORMA = { agenciaId: 'ag-casa', plataforma: true }
// Como en producción: los de la casa, uno de antes de las agencias (sin
// agencia_id) y los de otras agencias, todos activos y mezclados por fecha.
const CLIENTES = [
  { id: 'c-nova', slug: 'estudio-nova', name: 'Estudio Nova', agencia_id: 'ag-casa' },
  { id: 'c-silvestre', slug: 'silvestre', name: 'Silvestre AI', agencia_id: null },
  { id: 'c-senza', slug: 'senza-studio', name: 'senza studio', agencia_id: 'ag-senza' },
  { id: 'c-elena', slug: 'elenafontecha', name: 'Elena Fontecha', agencia_id: 'ag-casa' },
  { id: 'c-triboo', slug: 'triboo', name: 'TRIBOO', agencia_id: 'ag-triboo' },
  { id: 'c-helm', slug: 'helm', name: 'HELM', agencia_id: 'ag-casa' },
]

function admin(carga) {
  localStorage.setItem('bw_superadmin', 'alex@helm.test')
  localStorage.setItem('bw_admin_jwt', token({ sub: 'u1', email: 'alex@helm.test', role: 'superadmin', superadmin: true, ...carga }))
}

async function monta(slug) {
  render(
    <MemoryRouter initialEntries={['/' + slug]}>
      <Routes><Route path="/:slug" element={<HelmApp />} /></Routes>
    </MemoryRouter>,
  )
  await screen.findByText('Cuenta')
  await act(async () => {})
}

const selector = () => document.querySelector('select.helm-select')
const opciones = () => [...(selector()?.options || [])].map(o => o.textContent)

beforeEach(() => {
  localStorage.clear()
  for (const k of Object.keys(h.props)) delete h.props[k]
  h.clientes = CLIENTES
})

describe('perfilesPropios · la regla del tablero y del selector', () => {
  const casa = { id: 'ag-casa', plataforma: true }

  it('a la plataforma le deja los de su agencia y los que no tienen agencia', () => {
    expect(perfilesPropios(CLIENTES, casa).map(c => c.name))
      .toEqual(['Estudio Nova', 'Silvestre AI', 'Elena Fontecha', 'HELM'])
    expect(esPropio(CLIENTES[2], casa)).toBe(false)
  })

  it('a una agencia normal no le quita nada: el servidor ya le manda solo los suyos', () => {
    expect(perfilesPropios(CLIENTES, { id: 'ag-senza', plataforma: false })).toHaveLength(CLIENTES.length)
  })

  it('sin saber la agencia no filtra: mejor de más que dejar a alguien sin sus perfiles', () => {
    expect(perfilesPropios(CLIENTES, null)).toHaveLength(CLIENTES.length)
    expect(perfilesPropios(CLIENTES, { id: null, plataforma: true })).toHaveLength(CLIENTES.length)
    expect(perfilesPropios(undefined, casa)).toEqual([])
  })
})

describe('agenciaDeSesion · la agencia sale del token', () => {
  it('lee agenciaId y plataforma de la carga', () => {
    expect(agenciaDeSesion(token(PLATAFORMA))).toEqual({ id: 'ag-casa', plataforma: true })
    expect(agenciaDeSesion(token({ agenciaId: 'ag-senza' }))).toEqual({ id: 'ag-senza', plataforma: false })
  })

  it('entiende una carga con acentos (el correo o el nombre no son siempre ASCII)', () => {
    expect(agenciaDeSesion(token({ ...PLATAFORMA, email: 'begoña@estudio.es' }))).toEqual({ id: 'ag-casa', plataforma: true })
  })

  it('sin token o con uno roto, null', () => {
    expect(agenciaDeSesion(null)).toBeNull()
    expect(agenciaDeSesion('')).toBeNull()
    expect(agenciaDeSesion('no-es-un-jwt')).toBeNull()
    expect(agenciaDeSesion('a.%%%.c')).toBeNull()
  })

  it('por defecto lee el de la sesión guardada', () => {
    localStorage.setItem('bw_admin_jwt', token(PLATAFORMA))
    expect(agenciaDeSesion()).toEqual({ id: 'ag-casa', plataforma: true })
  })
})

// Montar el panel entero tarda unos segundos en una máquina cargada: con el
// límite por defecto (5 s) el test cae por tiempo, no por lo que prueba.
describe('HelmApp · selector de perfiles', { timeout: 20_000 }, () => {
  it('la plataforma, en uno de sus perfiles, solo ve los de su agencia (como en el tablero)', async () => {
    admin(PLATAFORMA)
    await monta('estudio-nova')
    expect(opciones()).toEqual(perfilesPropios(CLIENTES, { id: 'ag-casa', plataforma: true }).map(c => c.name))
    expect(opciones()).not.toContain('senza studio')
    expect(opciones()).not.toContain('TRIBOO')
    expect(selector().value).toBe('c-nova')
  })

  it('un perfil de otra agencia abierto desde /plataforma se abre y sale mientras está abierto', async () => {
    admin(PLATAFORMA)
    await monta('senza-studio')
    expect(selector().value).toBe('c-senza')
    expect(opciones()).toContain('senza studio')
    // El resto de agencias, no.
    expect(opciones()).not.toContain('TRIBOO')
    expect(opciones()).toEqual(['Estudio Nova', 'Silvestre AI', 'senza studio', 'Elena Fontecha', 'HELM'])
  })

  it('el administrador de una agencia ve todo lo que le manda el servidor', async () => {
    admin({ agenciaId: 'ag-senza', plataforma: false })
    h.clientes = [
      { id: 'c-senza', slug: 'senza-studio', name: 'senza studio', agencia_id: 'ag-senza' },
      { id: 'c-senza2', slug: 'senza-bodas', name: 'senza bodas', agencia_id: 'ag-senza' },
    ]
    await monta('senza-studio')
    expect(opciones()).toEqual(['senza studio', 'senza bodas'])
  })

  it('con un token de antes de las agencias (sin agenciaId) no se esconde nada', async () => {
    admin({})
    await monta('estudio-nova')
    expect(opciones()).toHaveLength(CLIENTES.length)
  })
})
