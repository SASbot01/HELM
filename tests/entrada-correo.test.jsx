// @vitest-environment jsdom
// La puerta de AI para todo (src/pages/comunidad/EntradaPorCorreo.jsx): solo el
// correo. Entra quien se apuntó a HELM Academy con él; si no está, se le manda
// al formulario. Sin nombre, sin solicitud y sin aprobación. Sin red.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

const comprobarAcceso = vi.hoisted(() => vi.fn())
vi.mock('../src/pages/comunidad/crm.js', () => ({ comprobarAcceso }))
vi.mock('../src/pages/inicio/socio/track.js', () => ({ track: () => {} }))

const { default: EntradaPorCorreo } = await import('../src/pages/comunidad/EntradaPorCorreo.jsx')
const { default: AIPT } = await import('../src/pages/aiparatodo/config.jsx')

afterEach(() => { cleanup(); comprobarAcceso.mockReset() })

const escribe = (correo) => {
  fireEvent.change(screen.getByLabelText('Correo'), { target: { value: correo } })
  fireEvent.click(screen.getByRole('button', { name: /Entrar/ }))
}

describe('Entrada a AI para todo con el correo', () => {
  it('no pide el nombre: solo el correo', () => {
    render(<EntradaPorCorreo cfg={AIPT} onEntrar={() => {}} />)
    expect(screen.queryByLabelText('Nombre')).toBeNull()
    expect(screen.getByLabelText('Correo')).toBeTruthy()
  })

  it('con un correo de HELM Academy, entra', async () => {
    comprobarAcceso.mockResolvedValue({ estado: 'aprobado', id: 'ficha-1' })
    const onEntrar = vi.fn()
    render(<EntradaPorCorreo cfg={AIPT} onEntrar={onEntrar} />)
    escribe('noa@example.com')
    await vi.waitFor(() => expect(onEntrar).toHaveBeenCalledWith({ id: 'ficha-1', nombre: '' }))
    expect(comprobarAcceso).toHaveBeenCalledWith(AIPT, 'noa@example.com')
  })

  it('si el correo no está, lo manda al formulario de HELM Academy', async () => {
    comprobarAcceso.mockResolvedValue({ estado: 'pendiente' })
    const onEntrar = vi.fn()
    render(<EntradaPorCorreo cfg={AIPT} onEntrar={onEntrar} />)
    escribe('nadie@example.com')
    expect(await screen.findByText(AIPT.puerta.aprobacion.noEsta)).toBeTruthy()
    expect(screen.getByRole('link', { name: /Apuntarme gratis/ }).getAttribute('href')).toBe('/helm-academy')
    expect(onEntrar).not.toHaveBeenCalled()
  })
})
