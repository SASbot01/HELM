// @vitest-environment jsdom
// El conector de Claude (MCP) de un perfil vive en Ajustes → IA, no en el
// agente de contenido: solo lo ve el superadmin, el enlace nuevo se enseña una
// vez con su aviso y «Generar otro» pide confirmación. La API va simulada.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'

const h = vi.hoisted(() => {
  // Cualquier llamada que no importa al test se queda pendiente (la tarjeta
  // enseña «Cargando…» y ya).
  const pendiente = () => new Proxy({}, { get: () => () => new Promise(() => {}) })
  return {
    pendiente,
    agents: { mcpEnlace: vi.fn(), generarMcpEnlace: vi.fn() },
  }
})

vi.mock('../src/helm/lib', () => ({
  stripeApi: h.pendiente(), wooApi: h.pendiente(), iaApi: h.pendiente(), googleApi: h.pendiente(),
  instagramApi: h.pendiente(), calendlyApi: h.pendiente(), telegramApi: h.pendiente(),
  MODELO_CLAUDE_DEFECTO: 'claude', brandOf: () => ({}), saveBrand: vi.fn(), uploadLogo: vi.fn(),
  MAX_LOGO_MB: 2, DEFAULT_SUBTITLE: '',
}))
vi.mock('../src/agents/api', () => ({ agentsApi: h.agents }))

import Ajustes from '../src/helm/views/Ajustes.jsx'

const abrirIA = () => fireEvent.click(screen.getByRole('button', { name: /^IA$/ }))

describe('Ajustes → IA · conector de Claude', () => {
  beforeEach(() => {
    h.agents.mcpEnlace.mockResolvedValue({ existe: true, ultimo_uso: null })
    h.agents.generarMcpEnlace.mockResolvedValue({ url: 'https://helm.s4sf.net/mcp/abc123' })
  })
  afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks() })

  it('el superadmin lo ve en la pestaña IA y genera otro tras confirmar; el enlace sale una vez con su aviso', async () => {
    localStorage.setItem('bw_superadmin', '1')
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<Ajustes clientId="c1" client={{ name: 'Silvestre AI' }} />)
    abrirIA()
    expect(await screen.findByText('Conector de Claude')).toBeTruthy()
    expect(await screen.findByText(/Ya tiene enlace \(aún sin usar\)/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Generar otro/ }))
    expect(window.confirm).toHaveBeenCalled()
    expect(await screen.findByText('https://helm.s4sf.net/mcp/abc123')).toBeTruthy()
    expect(screen.getByText(/Cópialo ahora: no se vuelve a enseñar\. Es una contraseña: dáselo solo a Silvestre AI\./)).toBeTruthy()
    expect(h.agents.generarMcpEnlace).toHaveBeenCalledWith('c1')
  })

  it('sin superadmin no aparece ni se pregunta a la API', async () => {
    render(<Ajustes clientId="c1" client={{ name: 'Silvestre AI' }} />)
    abrirIA()
    await waitFor(() => expect(screen.queryByText('Conector de Claude')).toBeNull())
    expect(h.agents.mcpEnlace).not.toHaveBeenCalled()
  })
})
