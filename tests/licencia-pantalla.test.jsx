// @vitest-environment jsdom
// La puerta de la licencia (src/helm/Licencia.jsx): sin licencia tapa el panel
// con el pago (o, al equipo, a quién avisar); al volver de Stripe confirma y
// celebra; un 402 en cualquier pantalla la abre. Y los Ajustes de la agencia.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, act, waitFor } from '@testing-library/react'

const api = vi.hoisted(() => ({
  estado: vi.fn(), pagar: vi.fn(), confirmar: vi.fn(), guardarClave: vi.fn(), quitarClave: vi.fn(),
  enlaceMcp: vi.fn(async () => ({ existe: false })), nuevoEnlaceMcp: vi.fn(),
}))
vi.mock('../src/helm/lib', () => ({ licenciaApi: api }))

const { PuertaLicencia, AjustesAgencia } = await import('../src/helm/Licencia.jsx')

const MODELOS = [{ id: 'claude-opus-5', label: 'Claude Opus 5', desc: 'El más capaz.' }, { id: 'claude-sonnet-5', label: 'Claude Sonnet 5', desc: 'Equilibrio.' }]
const SIN_LICENCIA = {
  administra: true, plataforma: false, agencia: { id: 'ag', nombre: 'Acme Growth', slug: 'acme' },
  licencia: { valida: false, venceAt: null, dias: 0, precio: 97, pagosActivos: true, historial: [] },
  ia: { clave: false, last4: null, model: null, deHelm: false, modelos: MODELOS, porDefecto: 'claude-opus-5' },
}
const CON_LICENCIA = { ...SIN_LICENCIA, licencia: { ...SIN_LICENCIA.licencia, valida: true, venceAt: '2027-11-08T10:00:00Z', dias: 365 } }

let asignada
beforeEach(() => {
  localStorage.setItem('bw_admin_jwt', 'jwt')
  for (const f of Object.values(api)) f.mockReset()
  api.enlaceMcp.mockResolvedValue({ existe: false })
  asignada = null
  Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, search: '', pathname: '/admin', assign: (u) => { asignada = u } } })
})
afterEach(() => { cleanup(); localStorage.clear() })

describe('PuertaLicencia', () => {
  it('sin licencia, quien administra ve la bienvenida con 97 €/año y paga por Stripe', async () => {
    api.estado.mockResolvedValue(SIN_LICENCIA)
    api.pagar.mockResolvedValue({ url: 'https://checkout.stripe.test/x' })
    render(<PuertaLicencia onSalir={() => {}} />)
    expect(await screen.findByText('Bienvenido a HELM, Acme Growth')).toBeTruthy()
    expect(screen.getByText('97 €')).toBeTruthy()
    expect(screen.getByText(/IVA incluido/)).toBeTruthy()
    expect(screen.queryByText(/créditos de regalo|packs?/i)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Pagar 97 €/ }))
    await waitFor(() => expect(asignada).toBe('https://checkout.stripe.test/x'))
  })

  it('caducada: pide renovar, con la fecha en que caducó', async () => {
    api.estado.mockResolvedValue({ ...SIN_LICENCIA, licencia: { ...SIN_LICENCIA.licencia, venceAt: '2026-10-01T10:00:00Z' } })
    render(<PuertaLicencia onSalir={() => {}} />)
    expect(await screen.findByText(/Tu licencia caducó el 1 de octubre de 2026/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Renovar 97 €/ })).toBeTruthy()
  })

  it('al equipo de un perfil: a quién avisar, y salir', async () => {
    api.estado.mockResolvedValue({ administra: false, licencia: { valida: false } })
    const onSalir = vi.fn()
    render(<PuertaLicencia onSalir={onSalir} />)
    expect(await screen.findByText('La licencia de la agencia no está activa')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Pagar/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Salir/ }))
    expect(onSalir).toHaveBeenCalled()
  })

  it('con licencia no tapa nada, hasta que un 402 la abre', async () => {
    api.estado.mockResolvedValueOnce(CON_LICENCIA).mockResolvedValueOnce(SIN_LICENCIA)
    render(<PuertaLicencia onSalir={() => {}} />)
    await waitFor(() => expect(api.estado).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('dialog')).toBeNull()
    await act(async () => { window.dispatchEvent(new CustomEvent('helm:sin-licencia')) })
    expect(await screen.findByText('Bienvenido a HELM, Acme Growth')).toBeTruthy()
  })

  it('al volver de Stripe confirma el pago, lo celebra y ofrece poner la clave de Claude', async () => {
    window.location.search = '?licencia=ok&session_id=cs_test_1'
    window.history.replaceState = vi.fn()
    api.confirmar.mockResolvedValue({ pagado: true, venceAt: '2027-11-08T10:00:00Z' })
    api.estado.mockResolvedValue(CON_LICENCIA)
    api.guardarClave.mockResolvedValue({ clave: true, last4: 'abcd', model: 'claude-opus-5' })
    render(<PuertaLicencia onSalir={() => {}} />)
    expect(await screen.findByText('Licencia activa hasta el 8 de noviembre de 2027')).toBeTruthy()
    expect(api.confirmar).toHaveBeenCalledWith('cs_test_1')
    fireEvent.change(await screen.findByPlaceholderText('sk-ant-…'), { target: { value: 'sk-ant-xyzabcd' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar clave' }))
    await waitFor(() => expect(api.guardarClave).toHaveBeenCalledWith('sk-ant-xyzabcd', 'claude-opus-5'))
    expect(await screen.findByText(/Ya está todo/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Empezar/ }))
    await waitFor(() => expect(screen.queryByText(/Licencia activa hasta/)).toBeNull())
  })
})

describe('AjustesAgencia', () => {
  it('la licencia con su fecha y el botón de renovar; la clave conectada con sus 4 últimos', async () => {
    api.estado.mockResolvedValue({ ...CON_LICENCIA, ia: { ...CON_LICENCIA.ia, clave: true, last4: 'wxyz', model: 'claude-sonnet-5' } })
    render(<AjustesAgencia onClose={() => {}} />)
    expect(await screen.findByText('8 de noviembre de 2027')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Renovar un año · 97 €/ })).toBeTruthy()
    expect(screen.getByText(/Clave conectada · …wxyz · Claude Sonnet 5/)).toBeTruthy()
    expect(screen.getByText('Conector de Claude')).toBeTruthy()
  })

  it('un error al guardar la clave se enseña y la clave no cambia', async () => {
    api.estado.mockResolvedValue(CON_LICENCIA)
    api.guardarClave.mockRejectedValue(new Error('La clave de Anthropic no es válida o fue revocada.'))
    render(<AjustesAgencia onClose={() => {}} />)
    fireEvent.change(await screen.findByPlaceholderText('sk-ant-…'), { target: { value: 'sk-ant-mala' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar clave' }))
    expect(await screen.findByText('La clave de Anthropic no es válida o fue revocada.')).toBeTruthy()
    expect(screen.queryByText(/Clave conectada/)).toBeNull()
  })
})
