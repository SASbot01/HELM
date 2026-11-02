// @vitest-environment jsdom
// Email marketing en pantalla (src/helm/views/EmailMarketing.jsx) con la API
// simulada: la nota de consentimiento, las tres pestañas, la lista con sus
// cuentas, los botones solo para quien manda, la clave como contraseña (solo
// se ven sus cuatro últimos y el campo se vacía al guardar), quitar una baja
// solo marcando que la persona lo ha pedido, y que en el móvil nada desborde.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cwd } from 'node:process'

const h = vi.hoisted(() => ({ estado: null }))
vi.mock('../src/helm/lib', () => ({
  emailMarketingApi: {
    estado: vi.fn(async () => structuredClone(h.estado)),
    campanas: vi.fn(async () => ({
      campanas: [
        { id: 'c1', nombre: 'Bienvenida', estado: 'activa', programada: false, audienciaTexto: 'Ventas · Ganado', mensajes: 2, enviados: 120, fallidos: 3, bajas: 4, creadaEn: '2026-11-01T10:00:00Z' },
        { id: 'c2', nombre: 'Black Friday', estado: 'borrador', audienciaTexto: 'Ventas · todas las etapas', mensajes: 1, enviados: 0, fallidos: 0, bajas: 0, creadaEn: '2026-11-02T10:00:00Z' },
      ],
    })),
    bajas: vi.fn(async () => ({ bajas: [{ email: 'ana@x.es', motivo: 'baja', origen: 'enlace', creadaEn: '2026-11-02T10:00:00Z', campana: 'Bienvenida' }], hayMas: false })),
    ajustes: vi.fn(async (_c, datos) => ({ ...structuredClone(h.estado), clave: { conectada: true, last4: datos.apiKey ? datos.apiKey.slice(-4) : 'abcd' }, avisos: ['El dominio acme.es no está en tu cuenta de Resend.'] })),
    quitarBaja: vi.fn(async () => ({ ok: true })),
    apuntarBaja: vi.fn(async () => ({ ok: true, nueva: true })),
    quitarClave: vi.fn(),
    campana: vi.fn(() => new Promise(() => {})),
  },
}))

const { emailMarketingApi: api } = await import('../src/helm/lib')
const { default: EmailMarketing } = await import('../src/helm/views/EmailMarketing.jsx')

const ESTADO = (admin) => ({
  puedeAdministrar: admin,
  clave: { conectada: true, last4: 'abcd' },
  webhook: { conectado: false, last4: null, url: 'https://helm.s4sf.net/api/email-webhook?perfil=p1' },
  ajustes: { remitenteNombre: 'Ana', remitenteEmail: 'hola@acme.es', responderA: '', empresa: 'Acme S.L.', direccion: 'Calle Mayor 1', dominios: [{ nombre: 'acme.es', estado: 'verified' }], comprobadoEn: null },
  faltan: [],
  pipelines: [{ id: 'v1', nombre: 'Ventas', porDefecto: true, etapas: [{ key: 'lead', label: 'Lead' }] }],
  limites: { destinatarios: 5000, mensajes: 10, asunto: 200, cuerpo: 20000 },
  variables: ['nombre', 'primer_nombre', 'email', 'empresa'],
})

beforeEach(() => {
  h.estado = ESTADO(true)
  for (const f of Object.values(api)) f.mockClear?.()
})
afterEach(cleanup)

const pestana = (nombre) => fireEvent.click(screen.getByRole('button', { name: nombre }))

describe('Email marketing · pantalla', () => {
  it('la nota de consentimiento, las pestañas y la lista con sus cuentas', async () => {
    render(<EmailMarketing clientId="p1" />)
    expect(await screen.findByText(/consentimiento o ya es cliente tuyo/)).toBeTruthy()
    for (const t of ['Campañas', 'Bajas', 'Ajustes']) expect(screen.getByRole('button', { name: t })).toBeTruthy()
    const tarjeta = (await screen.findByText('Bienvenida')).closest('button')
    expect(within(tarjeta).getByText('Enviando')).toBeTruthy()
    expect(within(tarjeta).getByText(/120 enviados · 3 fallidos · 4 bajas/)).toBeTruthy()
    expect(within(screen.getByText('Black Friday').closest('button')).getByText('Borrador')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Nueva campaña/ })).toBeTruthy()
    expect(api.estado).toHaveBeenCalledWith('p1')
  })

  it('si falta algo para mandar, lo dice', async () => {
    h.estado = { ...ESTADO(true), faltan: ['la clave de Resend'] }
    render(<EmailMarketing clientId="p1" />)
    expect(await screen.findByText(/Para poder mandar falta la clave de Resend/)).toBeTruthy()
  })

  it('quien no manda: sin «Nueva campaña» y los ajustes en solo lectura, sin campo de clave', async () => {
    h.estado = ESTADO(false)
    render(<EmailMarketing clientId="p1" />)
    await screen.findByText('Bienvenida')
    expect(screen.queryByRole('button', { name: /Nueva campaña/ })).toBeNull()
    pestana('Ajustes')
    expect(await screen.findByText('Solo quien administra el perfil puede cambiar esto.')).toBeTruthy()
    expect(screen.queryByPlaceholderText('re_…')).toBeNull()
    expect(screen.getByDisplayValue('hola@acme.es').disabled).toBe(true)
    expect(screen.queryByRole('button', { name: /^Guardar$/ })).toBeNull()
  })

  it('la clave: campo de contraseña, solo sus cuatro últimos, y se vacía al guardar', async () => {
    render(<EmailMarketing clientId="p1" />)
    await screen.findByText('Bienvenida')
    pestana('Ajustes')
    expect(await screen.findByText('Conectada · …abcd')).toBeTruthy()
    const campo = screen.getByPlaceholderText('re_…')
    expect(campo.type).toBe('password')
    expect(campo.value).toBe('')
    fireEvent.change(campo, { target: { value: 're_nueva_clave_wxyz' } })
    fireEvent.click(screen.getByRole('button', { name: /^Guardar$/ }))
    await waitFor(() => expect(api.ajustes).toHaveBeenCalled())
    expect(api.ajustes.mock.calls[0][1]).toMatchObject({ apiKey: 're_nueva_clave_wxyz', remitenteEmail: 'hola@acme.es', empresa: 'Acme S.L.' })
    expect(await screen.findByText(/no está en tu cuenta de Resend/)).toBeTruthy()
    expect(screen.getByPlaceholderText('re_…').value).toBe('')
    expect(await screen.findByText('Conectada · …wxyz')).toBeTruthy()
    expect(document.body.textContent).not.toContain('re_nueva_clave_wxyz')
  })

  it('quitar una baja pide marcar que la persona lo ha pedido', async () => {
    render(<EmailMarketing clientId="p1" />)
    await screen.findByText('Bienvenida')
    pestana('Bajas')
    const fila = (await screen.findByText('ana@x.es')).closest('li')
    expect(within(fila).getByText(/Se dio de baja/)).toBeTruthy()
    fireEvent.click(within(fila).getByRole('button', { name: 'Quitar' }))
    const boton = await screen.findByRole('button', { name: 'Quitar la baja' })
    expect(boton.disabled).toBe(true)
    fireEvent.click(screen.getByLabelText('Esta persona me ha pedido volver a recibir correos'))
    expect(boton.disabled).toBe(false)
    fireEvent.click(boton)
    await waitFor(() => expect(api.quitarBaja).toHaveBeenCalledWith('p1', 'ana@x.es', ''))
  })

  it('una campaña nueva: audiencia del CRM, correos con su ayuda de formato y botones de prueba y lanzar', async () => {
    render(<EmailMarketing clientId="p1" />)
    fireEvent.click(await screen.findByRole('button', { name: /Nueva campaña/ }))
    expect(await screen.findByText('Nueva campaña')).toBeTruthy()
    expect(screen.getByText('Ventas')).toBeTruthy()
    expect(screen.getByText(/El pie con tu empresa, tu dirección y el enlace de baja se añade solo/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Enviar prueba a mi correo/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Lanzar/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Añadir otro correo/ }))
    expect(screen.getByText('Correo 2')).toBeTruthy()
    expect(screen.getByText('Días después del anterior')).toBeTruthy()
  })
})

describe('emailMarketing.css: en el móvil nada desborda', () => {
  const css = readFileSync(resolve(cwd(), 'src/helm/views/emailMarketing.css'), 'utf8')
  const regla = (sel) => {
    const m = new RegExp(`(^|\\n)${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(css)
    return m ? m[2] : ''
  }
  it('las rejillas se doblan, los textos largos se parten y no hay anchos fijos grandes', () => {
    expect(regla('.em-tarjetas')).toContain('minmax(min(100%, 300px), 1fr)')
    expect(regla('.em-campos')).toContain('minmax(min(100%, 260px), 1fr)')
    for (const sel of ['.em-tarjeta-cab b', '.em-filas b', '.em-meta', '.em-cuerpo', '.em-legal']) expect(regla(sel), sel).toMatch(/overflow-wrap:\s*anywhere/)
    for (const sel of ['.em-cab', '.em-botones', '.em-apuntar']) expect(regla(sel), sel).toMatch(/flex-wrap:\s*wrap/)
    expect(css).toMatch(/@media \(max-width: 520px\)/)
    expect(css.replace(/@media[^{]*\{/g, '')).not.toMatch(/(^|[\s;{])(min-)?width:\s*\d{3,}px/)
  })
})
