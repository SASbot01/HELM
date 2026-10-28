// @vitest-environment jsdom
// La bandeja en pantalla (src/agents/Bandeja.jsx) con la API simulada: lo
// pendiente con su porqué y lo que hará, el mensaje para copiarlo y su botón de
// WhatsApp (solo si el enlace es de WhatsApp), Aprobar/Rechazar solo para quien
// administra la agencia (y solo mandan el id y el sí/no), lo decidido
// desplegable, los textos como texto, y que en el móvil nada desborde (el CSS).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cwd } from 'node:process'

const api = vi.hoisted(() => ({ datos: null, falla: null }))
vi.mock('../src/helm/lib', () => ({
  propuestasApi: {
    lista: vi.fn(async () => {
      if (api.falla) throw api.falla
      return structuredClone(api.datos)
    }),
    decidir: vi.fn(async () => ({ ok: true, decidida: true, estado: 'aplicada', texto: 'Hecho. Tarea creada.' })),
    correr: vi.fn(async () => ({ encolado: true })),
  },
}))

const { propuestasApi } = await import('../src/helm/lib')
const { default: Bandeja } = await import('../src/agents/Bandeja.jsx')

const WA = `https://wa.me/34600123456?text=${encodeURIComponent('Hola Ana, hoy vence tu cuota.')}`
const PEND = [
  {
    id: 'p1', agente: 'cobrador', titulo: 'Cuota de Ana (197 €) vence hoy', porque: 'La tercera cuota vence hoy.',
    herramienta: 'registrar_cuota', resumen: 'En Hugo: apuntar la cuota 3 de Ana (197 €).', mensaje: 'Hola Ana, hoy vence tu cuota.', enlace: WA,
    creada_en: '2026-10-28T08:00:00Z', estado: 'pendiente',
  },
  { id: 'p2', agente: 'seguimiento', titulo: 'Escribir a Luis', porque: null, herramienta: null, resumen: null, mensaje: 'Hola Luis', enlace: 'javascript:alert(1)', creada_en: '2026-10-28T07:00:00Z', estado: 'pendiente' },
  { id: 'p3', agente: 'guionista-ventas', titulo: '<img src=x onerror="window.pwned=1"> **negrita**', porque: '[pincha](https://evil.example)', herramienta: null, resumen: null, mensaje: null, enlace: null, creada_en: 'no es fecha', estado: 'pendiente' },
]
const DECIDIDAS = [
  { id: 'd1', agente: 'caja', titulo: 'Falta caja en noviembre', estado: 'aplicada', resultado: 'Hecho.' },
  { id: 'd2', agente: 'cobrador', titulo: 'Cuota de Pepe', estado: 'fallida', resultado: 'Ha cambiado algo desde que lo aprobaste.' },
  { id: 'd3', agente: 'director', titulo: 'Parte', estado: 'raro', resultado: null },
]

beforeEach(() => {
  api.datos = { pendientes: PEND, decididas: DECIDIDAS, puedeDecidir: true }
  api.falla = null
  vi.mocked(propuestasApi.lista).mockClear()
  vi.mocked(propuestasApi.decidir).mockClear()
  vi.mocked(propuestasApi.correr).mockClear()
})
afterEach(cleanup)

const tarjeta = async (titulo) => (await screen.findByText(titulo)).closest('li')

describe('Bandeja', () => {
  it('enseña lo pendiente: agente, título, porqué, lo que hará y cuántas hay', async () => {
    render(<Bandeja clientId="perfil-1" />)
    const t = await tarjeta('Cuota de Ana (197 €) vence hoy')
    expect(propuestasApi.lista).toHaveBeenCalledWith('perfil-1')
    expect(within(t).getByText('Cobrador')).toBeTruthy()
    expect(within(t).getByText('La tercera cuota vence hoy.')).toBeTruthy()
    expect(t.querySelector('.bj-hara').textContent).toBe('Al aprobar: En Hugo: apuntar la cuota 3 de Ana (197 €).')
    expect(document.querySelector('.bj-n').textContent).toBe('3')
    // El archivo guionista-ventas.js es la casilla «Guionista».
    expect(within(await tarjeta('<img src=x onerror="window.pwned=1"> **negrita**')).getByText('Guionista')).toBeTruthy()
  })

  it('sin pendientes lo dice (y no hay contador)', async () => {
    api.datos = { pendientes: [], decididas: [], puedeDecidir: true }
    render(<Bandeja clientId="perfil-1" />)
    expect(await screen.findByText(/No hay nada esperando/)).toBeTruthy()
    expect(document.querySelector('.bj-n')).toBeNull()
    expect(screen.queryByText(/Lo último que se ha decidido/)).toBeNull()
  })

  it('Aprobar y Rechazar (y lanzar los agentes) solo si puede decidir', async () => {
    api.datos = { ...api.datos, puedeDecidir: false }
    const { unmount } = render(<Bandeja clientId="perfil-1" />)
    await tarjeta('Cuota de Ana (197 €) vence hoy')
    expect(screen.queryByRole('button', { name: /Aprobar/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Rechazar/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Pasar los agentes/ })).toBeNull()
    // Copiar el mensaje sí: es solo leer.
    expect(screen.getAllByRole('button', { name: /Copiar/ }).length).toBeGreaterThan(0)
    unmount()
    api.datos = { ...api.datos, puedeDecidir: 'true' }
    render(<Bandeja clientId="perfil-1" />)
    await tarjeta('Cuota de Ana (197 €) vence hoy')
    expect(screen.queryByRole('button', { name: /Rechazar/ })).toBeNull()
  })

  it('aprobar manda solo el id y el sí, enseña lo que ha pasado y vuelve a cargar', async () => {
    render(<Bandeja clientId="perfil-1" />)
    const t = await tarjeta('Cuota de Ana (197 €) vence hoy')
    fireEvent.click(within(t).getByRole('button', { name: /Aprobar/ }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Hecho. Tarea creada.'))
    expect(propuestasApi.decidir).toHaveBeenCalledWith('perfil-1', 'p1', true)
    await waitFor(() => expect(propuestasApi.lista).toHaveBeenCalledTimes(2))
    // Sin herramienta, el botón es «Hecho».
    const sin = await tarjeta('Escribir a Luis')
    expect(within(sin).getByRole('button', { name: /Hecho/ })).toBeTruthy()
    fireEvent.click(within(sin).getByRole('button', { name: /Rechazar/ }))
    await waitFor(() => expect(propuestasApi.decidir).toHaveBeenLastCalledWith('perfil-1', 'p2', false))
  })

  it('si no se ha podido (ya estaba decidida), enseña por qué', async () => {
    vi.mocked(propuestasApi.decidir).mockRejectedValueOnce(Object.assign(new Error('Ya estaba aplicada.'), { status: 409 }))
    render(<Bandeja clientId="perfil-1" />)
    const t = await tarjeta('Cuota de Ana (197 €) vence hoy')
    fireEvent.click(within(t).getByRole('button', { name: /Aprobar/ }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Ya estaba aplicada.'))
  })

  it('mientras se decide una, sus botones se bloquean (no hay doble pulsación)', async () => {
    let suelta
    vi.mocked(propuestasApi.decidir).mockImplementationOnce(() => new Promise(r => { suelta = r }))
    render(<Bandeja clientId="perfil-1" />)
    const t = await tarjeta('Cuota de Ana (197 €) vence hoy')
    const aprobar = within(t).getByRole('button', { name: /Aprobar/ })
    fireEvent.click(aprobar)
    await waitFor(() => expect(aprobar.disabled).toBe(true))
    fireEvent.click(aprobar)
    expect(within(t).getByRole('button', { name: /Rechazar/ }).disabled).toBe(true)
    expect(propuestasApi.decidir).toHaveBeenCalledTimes(1)
    suelta({ ok: true, decidida: true, texto: 'Hecho.' })
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Hecho.'))
  })

  it('copiar el mensaje lo deja en el portapapeles', async () => {
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<Bandeja clientId="perfil-1" />)
    const t = await tarjeta('Cuota de Ana (197 €) vence hoy')
    fireEvent.click(within(t).getByRole('button', { name: /Copiar/ }))
    await waitFor(() => expect(within(t).getByRole('button', { name: /Copiado/ })).toBeTruthy())
    expect(writeText).toHaveBeenCalledWith('Hola Ana, hoy vence tu cuota.')
    // Sin portapapeles, lo dice en vez de fingir.
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
    const otra = await tarjeta('Escribir a Luis')
    fireEvent.click(within(otra).getByRole('button', { name: /Copiar/ }))
    await waitFor(() => expect(within(otra).getByRole('button', { name: /No se ha podido copiar/ })).toBeTruthy())
  })

  it('el botón de WhatsApp abre el enlace en otra pestaña, y solo si es de WhatsApp', async () => {
    render(<Bandeja clientId="perfil-1" />)
    const t = await tarjeta('Cuota de Ana (197 €) vence hoy')
    const a = within(t).getByRole('link', { name: /Abrir WhatsApp/ })
    expect(a.getAttribute('href')).toBe(WA)
    expect(a.getAttribute('target')).toBe('_blank')
    expect(a.getAttribute('rel')).toBe('noopener noreferrer')
    expect(within(await tarjeta('Escribir a Luis')).queryByRole('link')).toBeNull()
    expect(document.querySelector('a[href^="javascript"]')).toBeNull()
  })

  it('los textos son texto: ni HTML ni Markdown', async () => {
    render(<Bandeja clientId="perfil-1" />)
    const t = await tarjeta('<img src=x onerror="window.pwned=1"> **negrita**')
    expect(t.querySelector('img')).toBeNull()
    expect(within(t).getByText('[pincha](https://evil.example)')).toBeTruthy()
    expect(t.querySelector('a')).toBeNull()
    expect(window.pwned).toBeUndefined()
    // Una fecha rota no pinta «Invalid Date».
    expect(t.textContent).not.toContain('Invalid Date')
  })

  it('lo decidido va plegado y se despliega con su estado y cómo acabó', async () => {
    render(<Bandeja clientId="perfil-1" />)
    const ver = await screen.findByRole('button', { name: /Lo último que se ha decidido \(3\)/ })
    expect(ver.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('Hecha')).toBeNull()
    fireEvent.click(ver)
    expect(ver.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('Hecha').className).toBe('bj-estado aplicada')
    expect(screen.getByText('No se pudo').className).toBe('bj-estado fallida')
    // Un estado que no conoce, tal cual y sin clase inventada.
    expect(screen.getByText('raro').className).toBe('bj-estado ')
    expect(screen.getByText(/Ha cambiado algo desde que lo aprobaste/)).toBeTruthy()
    fireEvent.click(ver)
    expect(screen.queryByText('Hecha')).toBeNull()
  })

  it('«Pasar los agentes ahora» lanza la pasada y dice si ya se lanzó hace poco', async () => {
    render(<Bandeja clientId="perfil-1" />)
    const b = await screen.findByRole('button', { name: /Pasar los agentes ahora/ })
    fireEvent.click(b)
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/están mirando el perfil/))
    expect(propuestasApi.correr).toHaveBeenCalledWith('perfil-1')
    vi.mocked(propuestasApi.correr).mockResolvedValueOnce({ encolado: false, texto: 'Ya los has lanzado hace poco: espera unos minutos.' })
    fireEvent.click(b)
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Ya los has lanzado hace poco: espera unos minutos.'))
  })

  it('sin permiso (403) no se enseña; otro error, con Reintentar', async () => {
    api.falla = Object.assign(new Error('Tu rol no puede usar los agentes de este perfil.'), { status: 403 })
    const { container, unmount } = render(<Bandeja clientId="perfil-1" />)
    await waitFor(() => expect(propuestasApi.lista).toHaveBeenCalled())
    await new Promise(r => setTimeout(r, 0))
    expect(container.innerHTML).toBe('')
    unmount()
    api.falla = Object.assign(new Error('No se ha podido hacer. Prueba otra vez.'), { status: 500 })
    render(<Bandeja clientId="perfil-1" />)
    expect(await screen.findByText('No se ha podido hacer. Prueba otra vez.')).toBeTruthy()
    api.falla = null
    fireEvent.click(screen.getByRole('button', { name: /Reintentar/ }))
    expect(await screen.findByText('Cuota de Ana (197 €) vence hoy')).toBeTruthy()
  })
})

describe('bandeja.css: en el móvil nada desborda', () => {
  const css = readFileSync(resolve(cwd(), 'src/agents/bandeja.css'), 'utf8')
  const regla = (sel) => {
    const m = new RegExp(`(^|\\n)${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(css)
    return m ? m[2] : ''
  }
  it('las tarjetas caben en la pantalla y los textos largos se parten', () => {
    expect(regla('.bj-lista')).toContain('minmax(min(100%, 340px), 1fr)')
    expect(regla('.bj-prop')).toMatch(/min-width:\s*0/)
    expect(regla('.bj-prop')).toMatch(/max-width:\s*100%/)
    for (const sel of ['.bj-prop h4', '.bj-mensaje p', '.bj-hecha-txt', '.bj-aviso', '.bj-agente']) {
      expect(regla(sel), sel).toMatch(/overflow-wrap:\s*anywhere/)
    }
    expect(regla('.bj-porque, .bj-hara')).toMatch(/overflow-wrap:\s*anywhere/)
    for (const sel of ['.bj-cab', '.bj-mensaje-btns, .bj-prop footer', '.bj-prop header']) {
      expect(regla(sel), sel).toMatch(/flex-wrap:\s*wrap/)
    }
    expect(css).toMatch(/@media \(max-width: 520px\)/)
    // Ningún ancho fijo grande fuera de la media query.
    expect(css.replace(/@media[^{]*\{/g, '')).not.toMatch(/(^|[\s;{])(min-)?width:\s*\d{3,}px/)
  })
})
