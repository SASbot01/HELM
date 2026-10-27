// @vitest-environment jsdom
// La campana lleva cada aviso a su sección. Los viejos de «Tu avatar está
// listo» guardan destino 'avatar', que ya no tiene entrada en el menú: tienen
// que abrir el Informe, donde vive ahora en su pestaña.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

afterEach(cleanup)
beforeEach(() => { localStorage.clear(); localStorage.setItem('bw_admin_jwt', 'token') })

const hace = new Date().toISOString()
const lista = vi.fn(async () => ({
  sinLeer: 0,
  notificaciones: [
    { id: 1, tipo: 'avatar', nivel: 'info', titulo: 'Tu avatar del cliente está listo', destino: 'avatar', leida_at: hace, created_at: hace },
    { id: 2, tipo: 'lead', nivel: 'info', titulo: 'Lead nuevo', destino: 'crm', leida_at: hace, created_at: hace },
    // Los avisos de los agentes se guardaron con destino 'agentes', pero la
    // vista de Agentes tiene la clave 'contenido' en el NAV (era Guiones).
    { id: 3, tipo: 'agentes', nivel: 'info', titulo: 'Informe de la semana', destino: 'agentes', leida_at: hace, created_at: hace },
  ],
}))
vi.mock('../src/helm/lib', () => ({ notificacionesApi: { lista: (...a) => lista(...a), leer: vi.fn(async () => {}) } }))
const { default: Notificaciones } = await import('../src/helm/Notificaciones.jsx')

async function abre(onNavigate) {
  render(<Notificaciones clientId="c1" onNavigate={onNavigate} />)
  await vi.waitFor(() => expect(lista).toHaveBeenCalled())
  fireEvent.click(screen.getByRole('button', { name: 'Notificaciones' }))
}

describe('Notificaciones · destinos', () => {
  it('un aviso viejo con destino «avatar» abre el Informe', async () => {
    const onNavigate = vi.fn()
    await abre(onNavigate)
    fireEvent.click(await screen.findByText('Tu avatar del cliente está listo'))
    expect(onNavigate).toHaveBeenCalledWith('informe')
  })

  it('un aviso de los agentes con destino «agentes» abre Agentes (clave «contenido»)', async () => {
    const onNavigate = vi.fn()
    await abre(onNavigate)
    fireEvent.click(await screen.findByText('Informe de la semana'))
    expect(onNavigate).toHaveBeenCalledWith('contenido')
  })

  it('los demás destinos llegan tal cual', async () => {
    const onNavigate = vi.fn()
    await abre(onNavigate)
    fireEvent.click(await screen.findByText('Lead nuevo'))
    expect(onNavigate).toHaveBeenCalledWith('crm')
  })
})
